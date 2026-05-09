// Enqueue helpers for the six edge functions hitting the 150s timeout cap.
// Producers stay tiny: validate input, insert one or many rows, return 202.
// The job-worker function (driven by GitHub Actions cron) drains the queue
// with per-handler 25s caps. Runtime contract preserved — same URLs, same
// JSON in; callers just see 202 instead of 200.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface EnqueueOptions {
  kind: string
  payload?: Record<string, unknown>
  priority?: number
  max_attempts?: number
}

export interface EnqueueResult {
  id: string
  kind: string
}

export async function enqueueJob(
  supabase: SupabaseClient,
  opts: EnqueueOptions,
): Promise<EnqueueResult> {
  const { data, error } = await supabase
    .from('background_jobs')
    .insert({
      kind: opts.kind,
      payload: opts.payload ?? {},
      priority: opts.priority ?? 5,
      max_attempts: opts.max_attempts ?? 3,
    })
    .select('id, kind')
    .single()
  if (error) throw new Error(`enqueueJob(${opts.kind}) failed: ${error.message}`)
  return data as EnqueueResult
}

export async function enqueueJobsBatch(
  supabase: SupabaseClient,
  jobs: EnqueueOptions[],
): Promise<EnqueueResult[]> {
  if (jobs.length === 0) return []
  const rows = jobs.map((j) => ({
    kind: j.kind,
    payload: j.payload ?? {},
    priority: j.priority ?? 5,
    max_attempts: j.max_attempts ?? 3,
  }))
  const { data, error } = await supabase
    .from('background_jobs')
    .insert(rows)
    .select('id, kind')
  if (error) throw new Error(`enqueueJobsBatch (n=${jobs.length}) failed: ${error.message}`)
  return (data ?? []) as EnqueueResult[]
}

export function acceptedResponse(
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ accepted: true, ...body }),
    { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}
