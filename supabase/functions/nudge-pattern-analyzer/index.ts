// nudge-pattern-analyzer — finds workers that keep needing nudges and routes
// the fix into the autonomous builder.
//
// Wish ce25ad0b: track nudge patterns per worker; when one is nudged 5+ times
// in a week, classify the cause and create a targeted fix-wish so the
// autonomous builder (not the operator) handles it. Updates worker_health_scores
// for the /admin pulse panel; records each analysis in worker_nudge_patterns.
//
// A "nudge" = a mommy_supervisor_log row (severity warning/error/high/critical)
// for a component. Weekly cron. POST { dry_run?, since_days? }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const NUDGE_THRESHOLD = 5
const NUDGE_SEVERITIES = ['warning', 'error', 'high', 'critical']

// ── PARITY with src/lib/worker-nudge-classifier.ts ─────────────────────
type NudgeCause = 'scheduling_conflict' | 'resource_starvation' | 'logic_bug' | 'unknown'
type NudgeAction = 'schedule_restagger_wish' | 'resource_scale_wish' | 'replacement_wish' | 'none'
const SCHEDULING_RE = /\b(no_recent_output|stale|overdue|not.?(?:run|fired|produced)|cadence|missed.?(?:tick|run|window)|behind schedule|never ran|expected.*minutes|collision|collide|stagger|same minute)\b/i
const RESOURCE_RE = /\b(timeout|timed.?out|rate.?limit|429|quota|resource|starv|out of memory|oom|cpu|throttl|capacity|exhausted|too many|backpressure|queue.*full)\b/i
const LOGIC_RE = /\b(error|exception|throw|constraint|null|undefined|failed|failure|invalid|reject|sqlstate|stack|crash|bug|regression|cannot read|is not a function|type error)\b/i
function classifyNudges(samples: Array<{ event_kind?: string | null; message?: string | null }>): NudgeCause {
  let s = 0, r = 0, l = 0
  for (const x of samples) {
    const t = `${x.event_kind ?? ''} ${x.message ?? ''}`
    if (SCHEDULING_RE.test(t)) s++
    if (RESOURCE_RE.test(t)) r++
    if (LOGIC_RE.test(t)) l++
  }
  if (s === 0 && r === 0 && l === 0) return 'unknown'
  const max = Math.max(s, r, l)
  if (l === max) return 'logic_bug'
  if (r === max) return 'resource_starvation'
  return 'scheduling_conflict'
}
function actionForCause(c: NudgeCause): NudgeAction {
  return c === 'scheduling_conflict' ? 'schedule_restagger_wish'
    : c === 'resource_starvation' ? 'resource_scale_wish'
      : c === 'logic_bug' ? 'replacement_wish' : 'none'
}
function healthScore(n: number): number { return Math.max(4, 100 - n * 12) }

const WISH_BLURB: Record<NudgeCause, (w: string, n: number, ex: string) => { title: string; goal: string; body: string }> = {
  scheduling_conflict: (w, n, ex) => ({
    title: `Re-stagger worker '${w}' — ${n} stale-schedule nudges this week`,
    goal: `Worker ${w} keeps going stale; fix its cron cadence/offset so it stops needing supervisor nudges.`,
    body: `The nudge analyzer flagged '${w}' with ${n} scheduling-type supervisor nudges in 7 days.\n\nLikely cause: cron cadence too slow, a stagger collision, or the job not firing. Action: inspect the cron schedule for '${w}', move it to a unique minute offset and a cadence that matches its expected output window, redeploy. Verify it produces output within one cadence after the change.\n\nRepresentative nudge: ${ex}`,
  }),
  resource_starvation: (w, n, ex) => ({
    title: `Scale resources for worker '${w}' — ${n} starvation nudges this week`,
    goal: `Worker ${w} is hitting timeouts/rate-limits; give it the headroom to finish so it stops needing nudges.`,
    body: `The nudge analyzer flagged '${w}' with ${n} resource-starvation supervisor nudges in 7 days.\n\nLikely cause: timeout, rate-limit/429, or quota exhaustion. Action: raise the function timeout, add backoff/retry or batching, or split the workload; if it's an upstream API rate-limit, add a token bucket. Verify completion under load.\n\nRepresentative nudge: ${ex}`,
  }),
  logic_bug: (w, n, ex) => ({
    title: `Replace/repair worker '${w}' — ${n} logic-bug nudges this week`,
    goal: `Worker ${w} is failing with errors the supervisor keeps catching; repair or replace it.`,
    body: `The nudge analyzer flagged '${w}' with ${n} logic-bug-type supervisor nudges in 7 days — systematic degradation, not a blip.\n\nLikely cause: an unhandled error/exception/constraint violation in '${w}'. Action: read the failing path, reproduce, fix the bug (or rewrite the worker if it's structurally broken), add a regression test + generation-site gate. Verify the supervisor stops nudging it.\n\nRepresentative nudge: ${ex}`,
  }),
  unknown: (w, n, ex) => ({
    title: `Investigate worker '${w}' — ${n} unclassified nudges this week`,
    goal: `Worker ${w} keeps needing nudges for reasons the analyzer couldn't classify; investigate.`,
    body: `The nudge analyzer flagged '${w}' with ${n} supervisor nudges in 7 days but couldn't classify the cause from the log text. Action: read the recent mommy_supervisor_log rows for '${w}' and determine whether it's scheduling, resources, or a bug.\n\nRepresentative nudge: ${ex}`,
  }),
}

async function openWishExists(supabase: SupabaseClient, worker: string): Promise<boolean> {
  // Avoid filing a duplicate while a prior fix-wish for this worker is still
  // open (queued / in_progress).
  const { data } = await supabase.from('mommy_code_wishes')
    .select('id').ilike('wish_title', `%'${worker}'%`).in('status', ['queued', 'in_progress']).limit(1).maybeSingle()
  return !!data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { dry_run?: boolean; since_days?: number } = {}
  try { body = await req.json() } catch { /* */ }
  const sinceDays = body.since_days ?? 7
  const windowStart = new Date(Date.now() - sinceDays * 86400_000)

  // Pull the week's nudges.
  const { data: logs } = await supabase.from('mommy_supervisor_log')
    .select('component, severity, event_kind, message, created_at')
    .gte('created_at', windowStart.toISOString())
    .in('severity', NUDGE_SEVERITIES)
    .order('created_at', { ascending: false })
    .limit(2000)
  const rows = (logs || []) as Array<{ component: string; severity: string; event_kind: string | null; message: string | null; created_at: string }>

  // Group by worker.
  const byWorker = new Map<string, typeof rows>()
  for (const r of rows) {
    const w = r.component || 'unknown'
    if (!byWorker.has(w)) byWorker.set(w, [])
    byWorker.get(w)!.push(r)
  }

  const now = new Date()
  const actions: Array<{ worker: string; nudges: number; classification?: NudgeCause; action?: NudgeAction; wish_id?: string | null; status: string }> = []

  for (const [worker, wRows] of byWorker) {
    const nudges = wRows.length
    const lastNudgeAt = wRows[0]?.created_at ?? null

    // Always refresh the health score (even below threshold).
    if (!body.dry_run) {
      await supabase.from('worker_health_scores').upsert({
        worker,
        health_score: healthScore(nudges),
        nudges_7d: nudges,
        last_nudge_at: lastNudgeAt,
        updated_at: now.toISOString(),
      }, { onConflict: 'worker' })
    }

    if (nudges < NUDGE_THRESHOLD) { actions.push({ worker, nudges, status: 'below_threshold' }); continue }

    const cause = classifyNudges(wRows)
    const action = actionForCause(cause)
    const representative = (wRows.find(r => (r.message || '').length > 8)?.message || wRows[0]?.event_kind || 'n/a').slice(0, 240)

    if (body.dry_run) { actions.push({ worker, nudges, classification: cause, action, status: 'dry_run' }); continue }

    await supabase.from('worker_health_scores').update({ last_classification: cause }).eq('worker', worker)

    // Dedup: skip if an open fix-wish for this worker already exists.
    let wishId: string | null = null
    let status = 'pattern_recorded'
    if (action !== 'none' && !(await openWishExists(supabase, worker))) {
      const blurb = WISH_BLURB[cause](worker, nudges, representative)
      const { data: wish } = await supabase.from('mommy_code_wishes').insert({
        wish_title: blurb.title,
        wish_body: blurb.body,
        protocol_goal: blurb.goal,
        source: 'nudge_pattern_analyzer',
        affected_surfaces: { worker, classification: cause, nudge_count: nudges, analyzer: true },
        priority: cause === 'logic_bug' ? 'high' : 'normal',
        status: 'queued',
      }).select('id').single()
      wishId = (wish as { id: string } | null)?.id ?? null
      status = wishId ? 'fix_wish_created' : 'wish_insert_failed'
    } else if (action !== 'none') {
      status = 'open_wish_exists'
    }

    await supabase.from('worker_nudge_patterns').insert({
      worker,
      window_start: windowStart.toISOString(),
      window_end: now.toISOString(),
      nudge_count: nudges,
      classification: cause,
      action_taken: wishId ? action : (status === 'open_wish_exists' ? 'none' : action),
      fix_wish_id: wishId,
      detail: { representative, severities: [...new Set(wRows.map(r => r.severity))] },
    })

    // Surface the pattern to the supervisor sink too (so it shows on the pulse panel).
    await supabase.from('mommy_supervisor_log').insert({
      component: 'nudge_pattern_analyzer',
      severity: cause === 'logic_bug' ? 'high' : 'warning',
      event_kind: 'worker_degradation',
      message: `'${worker}' nudged ${nudges}x/7d → ${cause} → ${status}`,
      context_data: { worker, classification: cause, nudge_count: nudges, fix_wish_id: wishId },
    })

    actions.push({ worker, nudges, classification: cause, action, wish_id: wishId, status })
  }

  return new Response(JSON.stringify({
    ok: true,
    workers_analyzed: byWorker.size,
    flagged: actions.filter(a => a.nudges >= NUDGE_THRESHOLD).length,
    fix_wishes_created: actions.filter(a => a.status === 'fix_wish_created').length,
    actions,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
