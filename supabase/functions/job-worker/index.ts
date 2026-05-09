// job-worker — drains background_jobs queue.
//
// Triggered every minute by `.github/workflows/cron-job-worker.yml`. Each
// invocation:
//   1. Calls claim_background_jobs(N) RPC — atomic FOR UPDATE SKIP LOCKED.
//   2. For each claimed job, races the matching handler against a 25s timeout.
//   3. On success: complete_background_job. On transient failure (attempts <
//      max_attempts AND error looks recoverable): release_background_job. On
//      terminal failure: fail_background_job.
//   4. Caps overall time at OVERALL_BUDGET_MS so the edge invocation always
//      returns under Supabase's 150s hard cap.
//   5. After the drain, calls check_background_jobs_health() — if failed_24h
//      crosses the threshold, the RPC writes to deploy_health_log so the
//      auto-healer surfaces the backlog.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { routeJobKind, isNonRetryableError } from '../_shared/job-handlers/index.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Per-job hard cap. Handlers that exceed this are abandoned and the job is
// failed-with-error. Hard rule: a single job never blocks the worker.
const PER_JOB_TIMEOUT_MS = 25_000

// Overall worker run budget. We always return well under Supabase's 150s cap
// even if the queue is full and each job takes the full per-job timeout.
const OVERALL_BUDGET_MS = 30_000

// Default batch size if the caller doesn't pass max_jobs.
const DEFAULT_MAX_JOBS = 5

interface ClaimedJob {
  id: string
  kind: string
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

interface JobOutcome {
  id: string
  kind: string
  status: 'completed' | 'released' | 'failed' | 'timeout'
  attempts: number
  duration_ms: number
  error?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const overallStart = Date.now()
  const overallDeadline = overallStart + OVERALL_BUDGET_MS

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    let maxJobs = DEFAULT_MAX_JOBS
    try {
      const body = await req.json()
      if (typeof body?.max_jobs === 'number' && body.max_jobs > 0) {
        maxJobs = Math.min(body.max_jobs, 20)
      }
    } catch { /* default */ }

    const { data: claimed, error: claimErr } = await supabase
      .rpc('claim_background_jobs', { p_limit: maxJobs })

    if (claimErr) {
      console.error('claim_background_jobs failed:', claimErr)
      return new Response(
        JSON.stringify({ error: claimErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const jobs = (claimed ?? []) as ClaimedJob[]
    const outcomes: JobOutcome[] = []

    for (const job of jobs) {
      // Safety: stop pulling new jobs if the overall budget is almost spent.
      // We always leave time to call check_background_jobs_health after the loop.
      if (Date.now() > overallDeadline - 2_000) {
        // Release the job so another worker tick picks it up — we haven't
        // started running it yet beyond the claim.
        await supabase.rpc('release_background_job', {
          p_id: job.id,
          p_error: 'worker overall budget exhausted before run',
        })
        outcomes.push({
          id: job.id,
          kind: job.kind,
          status: 'released',
          attempts: job.attempts,
          duration_ms: 0,
          error: 'worker overall budget exhausted',
        })
        continue
      }

      const jobStart = Date.now()
      try {
        const result = await runWithTimeout(
          () => routeJobKind(job.kind, supabase, job.payload ?? {}),
          PER_JOB_TIMEOUT_MS,
        )
        await supabase.rpc('complete_background_job', {
          p_id: job.id,
          p_result: result ?? {},
        })
        outcomes.push({
          id: job.id,
          kind: job.kind,
          status: 'completed',
          attempts: job.attempts,
          duration_ms: Date.now() - jobStart,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const isTimeout = message.startsWith('handler timeout after')
        const terminal = isTimeout
          || isNonRetryableError(err)
          || job.attempts >= job.max_attempts
        if (terminal) {
          await supabase.rpc('fail_background_job', {
            p_id: job.id,
            p_error: message,
          })
          outcomes.push({
            id: job.id,
            kind: job.kind,
            status: isTimeout ? 'timeout' : 'failed',
            attempts: job.attempts,
            duration_ms: Date.now() - jobStart,
            error: message,
          })
        } else {
          await supabase.rpc('release_background_job', {
            p_id: job.id,
            p_error: message,
          })
          outcomes.push({
            id: job.id,
            kind: job.kind,
            status: 'released',
            attempts: job.attempts,
            duration_ms: Date.now() - jobStart,
            error: message,
          })
        }
      }
    }

    // Operator alert — RPC checks failed_24h count and writes to
    // deploy_health_log if over the threshold. Failure here is non-fatal.
    let health: Record<string, unknown> | null = null
    try {
      const { data, error } = await supabase.rpc('check_background_jobs_health')
      if (!error) health = (data ?? null) as Record<string, unknown> | null
    } catch (e) {
      console.error('check_background_jobs_health failed:', e)
    }

    return new Response(
      JSON.stringify({
        claimed: jobs.length,
        outcomes,
        elapsed_ms: Date.now() - overallStart,
        health,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('job-worker fatal error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

function runWithTimeout<T>(thunk: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error(`handler timeout after ${ms}ms`))
      }
    }, ms)
    thunk().then(
      (val) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(val)
        }
      },
      (err) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(err)
        }
      },
    )
  })
}
