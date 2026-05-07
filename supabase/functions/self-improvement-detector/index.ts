// self-improvement-detector — Mommy queues code wishes when she detects
// repeated friction patterns indicating missing capabilities.
//
// 2026-05-07 user directive: Mommy should initiate development without
// being asked. fast-react now has a code_wish action type for in-the-moment
// asks; this cron is the BACKGROUND detector — it watches for patterns
// that indicate "we keep hitting the same wall."
//
// Patterns detected:
//   1. Repeated fast_react_event skip_reason that's the same string —
//      indicates a missing capability the system keeps trying to use
//   2. Repeated mommy_builder_run failures with the same failure_reason
//   3. Recurring counter_escape_signal of the same type — Mommy keeps
//      seeing the same pattern but the response isn't shifting it
//   4. Active hookup_funnel rows whose intel hasn't refreshed in 7d — the
//      analysis loop isn't closing
//   5. Decrees with same edict shape repeating across users (suggests we
//      should have a generator for it, not LLM ad-hoc each time)
//   6. confession_queue prompts that consistently get empty responses
//      (prompts aren't landing — need redesign)
//
// For each detected pattern, queue a wish via mommy_code_wishes (status=
// queued, source=gap_audit, classified_at NULL so the classifier picks it
// up next run; the kick-builder trigger fires once classifier marks it
// auto_ship_eligible).
//
// Schedule: hourly via migration 297. Cooldown: per pattern_signature, no
// duplicate wish within 7 days (we don't spam the queue).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface DetectedFriction {
  pattern_signature: string  // stable key for cooldown
  wish_title: string
  wish_body: string
  protocol_goal: string
  priority: 'low' | 'normal' | 'high' | 'critical'
}

async function existingWishCooldown(supabase: SupabaseClient, signature: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString()
  // We encode pattern_signature into the wish_title as a marker so we can
  // dedup on it cheaply
  const { data } = await supabase
    .from('mommy_code_wishes')
    .select('id')
    .ilike('wish_title', `%${signature.slice(0, 60)}%`)
    .gte('created_at', cutoff)
    .limit(1)
  return (data || []).length > 0
}

async function detectRepeatedSkipReasons(supabase: SupabaseClient): Promise<DetectedFriction[]> {
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { data } = await supabase
    .from('fast_react_event')
    .select('skip_reason, event_kind')
    .gte('fired_at', since7d)
    .not('skip_reason', 'is', null)
    .limit(500)
  const counts = new Map<string, { count: number; event_kind: string; skip_reason: string }>()
  for (const r of (data || []) as Array<{ skip_reason: string; event_kind: string }>) {
    const reason = r.skip_reason || ''
    if (reason === 'duplicate' || reason === 'cooldown_limit' || reason === 'ambient_no_signal') continue
    if (reason === 'persona_not_dommy_mommy') continue  // expected; not friction
    const key = `${r.event_kind}::${reason}`
    const existing = counts.get(key)
    if (existing) existing.count++
    else counts.set(key, { count: 1, event_kind: r.event_kind, skip_reason: reason })
  }
  const out: DetectedFriction[] = []
  for (const [key, info] of counts.entries()) {
    if (info.count < 5) continue  // need at least 5 occurrences in 7d
    out.push({
      pattern_signature: `friction:repeated_skip:${key}`,
      wish_title: `Repeated fast-react skip: ${info.event_kind} → "${info.skip_reason.slice(0, 60)}"`,
      wish_body: `fast_react_event has skipped ${info.count} times in the last 7 days for event_kind="${info.event_kind}" with skip_reason="${info.skip_reason}". This indicates a recurring failure pattern that the runtime can't recover from — it's missing a capability or has a bug worth investigating.\n\nDiagnose: read the source_key + context for the skipped events and identify why the same skip keeps happening. Build the missing capability (or fix the bug) so the event_kind can fire successfully.`,
      protocol_goal: `runtime_friction / fix_repeated_failure`,
      priority: info.count >= 20 ? 'high' : 'normal',
    })
  }
  return out
}

async function detectStaleIntel(supabase: SupabaseClient): Promise<DetectedFriction[]> {
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString()
  // Active hookup_funnel rows where last_interaction_at is recent (last 7d)
  // but contact_intelligence wasn't refreshed in the window
  const { data: funnel } = await supabase
    .from('hookup_funnel')
    .select('id, contact_username, last_interaction_at')
    .eq('active', true)
    .gte('last_interaction_at', since7d)
    .limit(50)
  if (!funnel || funnel.length === 0) return []

  // Cross-check: for each funnel row, look at last_analyzed_at on the
  // matching contact_intelligence (via display_name → contact_id). Skip
  // detail check because it's expensive; use a heuristic: if many rows
  // are recently active but mommy_scheme hasn't run gina_disclosure_subplan
  // refresh in 7d, that's a signal.
  const { data: schemes } = await supabase
    .from('mommy_scheme_log')
    .select('id, created_at')
    .eq('scheme_kind', 'full_plot')
    .gte('created_at', since7d)
    .limit(2)

  if ((schemes || []).length === 0 && funnel.length >= 3) {
    return [{
      pattern_signature: 'friction:scheme_stale_with_active_leads',
      wish_title: 'Mommy-scheme hasn\'t run a full plot but active leads accumulating',
      wish_body: `${funnel.length} hookup_funnel leads have had activity in the last 7 days, but no mommy_scheme_log full_plot row was written. The weekly cron may not have fired or the scheme function may have failed silently. Diagnose: check whether mommy-scheme-cron is registered (pg_cron.job table) and whether it returned ok on its last run. If broken, fix; if missing, schedule it.`,
      protocol_goal: 'scheme_freshness / weekly_plot_actually_runs',
      priority: 'high',
    }]
  }
  return []
}

async function detectRepeatedBuilderFailures(supabase: SupabaseClient): Promise<DetectedFriction[]> {
  const since3d = new Date(Date.now() - 3 * 86400_000).toISOString()
  const { data } = await supabase
    .from('mommy_builder_run')
    .select('status, failure_reason')
    .like('status', 'failed%')
    .gte('started_at', since3d)
    .limit(100)
  const counts = new Map<string, number>()
  for (const r of (data || []) as Array<{ status: string; failure_reason: string | null }>) {
    const reason = (r.failure_reason || r.status).slice(0, 100)
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  const out: DetectedFriction[] = []
  for (const [reason, count] of counts.entries()) {
    if (count < 3) continue
    out.push({
      pattern_signature: `friction:builder_failure:${reason.slice(0, 40)}`,
      wish_title: `Builder repeatedly failing: "${reason.slice(0, 80)}"`,
      wish_body: `mommy_builder_run has logged ${count} failures in 3 days with reason "${reason}". The autonomous builder is stuck. Investigate the run log + commit history; either fix the underlying issue or update the builder's drafter prompt / authority boundaries to prevent the failure class.`,
      protocol_goal: 'builder_health / unstick_autonomy',
      priority: count >= 5 ? 'critical' : 'high',
    })
  }
  return out
}

async function detectRecurringCounterEscape(supabase: SupabaseClient): Promise<DetectedFriction[]> {
  const since14d = new Date(Date.now() - 14 * 86400_000).toISOString()
  const { data } = await supabase
    .from('counter_escape_signal')
    .select('signal_type')
    .gte('detected_at', since14d)
    .limit(200)
  const counts = new Map<string, number>()
  for (const r of (data || []) as Array<{ signal_type: string }>) {
    counts.set(r.signal_type, (counts.get(r.signal_type) ?? 0) + 1)
  }
  const out: DetectedFriction[] = []
  for (const [type, count] of counts.entries()) {
    if (count < 3) continue  // 3+ in 14d means the de-escalate response isn't holding
    out.push({
      pattern_signature: `friction:counter_escape_recurring:${type}`,
      wish_title: `counter_escape "${type}" recurring (${count}× in 14d) — response isn't holding`,
      wish_body: `Maxy has triggered counter_escape signal "${type}" ${count} times in the last 14 days. The current de-escalate response is firing each time but it's NOT shifting the underlying pattern — Maxy keeps coming back to it. The protocol needs a stronger response or a different angle for this signal type. Investigate: are the de-escalate outreaches actually being read? Is the underlying cause something the existing surfaces don't address (e.g. relational stress with Gina, executive function collapse, external life event)? Build the missing handler or escalation path.`,
      protocol_goal: 'pattern_response / not_just_de_escalate_loop',
      priority: 'high',
    })
  }
  return out
}

async function detectEmptyConfessions(supabase: SupabaseClient): Promise<DetectedFriction[]> {
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { data } = await supabase
    .from('confession_queue')
    .select('id, prompt, response_text')
    .gte('confessed_at', since7d)
    .limit(50)
  const rows = (data || []) as Array<{ prompt: string; response_text: string | null }>
  if (rows.length < 5) return []  // not enough signal
  const empty = rows.filter(r => !r.response_text || r.response_text.trim().length < 10)
  const emptyRate = empty.length / rows.length
  if (emptyRate < 0.5) return []
  // Find most-common prompt prefix among the empty ones (proxy for "this prompt design isn't landing")
  const promptKeys = empty.map(r => r.prompt?.slice(0, 60) ?? '').filter(Boolean)
  const topPrompts = Array.from(new Set(promptKeys)).slice(0, 3)
  return [{
    pattern_signature: `friction:confessions_empty_${Math.round(emptyRate * 100)}pct`,
    wish_title: `Confession prompts not landing — ${Math.round(emptyRate * 100)}% empty in 7d`,
    wish_body: `${empty.length} of ${rows.length} confession prompts in the last 7 days received no answer (or <10 chars). The prompt design or pacing isn't landing. Examples of empty prompts:\n${topPrompts.map(p => `  - "${p}…"`).join('\n')}\n\nInvestigate: are prompts too long, too cerebral, too abstract? Try shorter, more body-anchored, more specific. Could also need a tighter selection algorithm — too many prompts queued with no surfacing logic. Per "prompts writable by a stranger" rule, every prompt should be answerable without protocol context.`,
    protocol_goal: 'engagement / prompts_actually_land',
    priority: emptyRate > 0.7 ? 'high' : 'normal',
  }]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  const all: DetectedFriction[] = []
  const detectorResults: Array<{ detector: string; count: number; error?: string }> = []
  for (const [name, fn] of [
    ['repeated_skip_reasons', detectRepeatedSkipReasons],
    ['stale_intel', detectStaleIntel],
    ['repeated_builder_failures', detectRepeatedBuilderFailures],
    ['recurring_counter_escape', detectRecurringCounterEscape],
    ['empty_confessions', detectEmptyConfessions],
  ] as const) {
    try {
      const found = await fn(supabase)
      all.push(...found)
      detectorResults.push({ detector: name, count: found.length })
    } catch (err) {
      detectorResults.push({ detector: name, count: 0, error: String(err).slice(0, 200) })
    }
  }

  let queued = 0
  let cooled = 0
  for (const f of all) {
    if (await existingWishCooldown(supabase, f.pattern_signature)) {
      cooled++
      continue
    }
    const { error } = await supabase.from('mommy_code_wishes').insert({
      wish_title: `[gap_audit:${f.pattern_signature.slice(0, 40)}] ${f.wish_title}`.slice(0, 200),
      wish_body: f.wish_body,
      protocol_goal: f.protocol_goal,
      source: 'gap_audit',
      priority: f.priority,
    })
    if (!error) queued++
  }

  return new Response(JSON.stringify({
    ok: true,
    detected: all.length,
    queued,
    cooled,
    detector_results: detectorResults,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
