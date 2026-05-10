// self-improvement-detector — Mommy queues code wishes when she detects
// repeated friction patterns indicating missing capabilities.
//
// See also: docs/architectural-principles.md — this is the surface that
// must catch tactical-patch loops on iteration 2, not iteration 9.
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
//   7. recurring_tactical_patch_loop — same theme produced 3+ migrations
//      or commits in 14 days AND deploy_health_log signal still open;
//      proposes an architectural redesign, never another patch.
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

// ──────────────────────────────────────────────────────────────────────────
// recurring_tactical_patch_loop — architectural-drift detector.
//
// Groups last 14 days of migrations + commits by theme. If a single theme
// has 3+ entries AND a matching deploy_health_log signal is still open,
// queue a wish for ARCHITECTURAL REDESIGN, never another patch. Per
// docs/architectural-principles.md #1: "zoom out at the second iteration."
//
// The wish is intentionally tagged as a redesign so the classifier marks
// it auto_ship_eligible=false — this kind of work needs human review, not
// a 4am autonomous build.
// ──────────────────────────────────────────────────────────────────────────

const PATCH_LOOP_THEMES: Array<{ slug: string; keywords: RegExp; redesign_hint: string }> = [
  {
    slug: 'cron-load-management',
    keywords: /\b(cron[-_]?(relief|stagger|prune|frequency|schedule|load|tune)|reduce[-_]cron|cron[-_]?cooldown)\b/i,
    redesign_hint: 'Polling architecture sized for many users, used by one. Replace with event-driven: DB triggers + queue workers, or pg_notify + listener. Match shape to scale.',
  },
  {
    slug: 'voice-corpus-cleanup',
    keywords: /\b(voice[-_]?corpus|voice[-_]?samples|voice[-_]?ingest|corpus[-_]?filter|corpus[-_]?dedup)\b/i,
    redesign_hint: 'Repeated cleanup of corpus pollution suggests the ingest gate is wrong, not under-tuned. Move filtering to ingest time (DB trigger) and define an explicit allow-list of source kinds.',
  },
  {
    slug: 'slop-detector-tune',
    keywords: /\b(slop[-_]?detector|slop[-_]?gate|slop[-_]?regex|slop[-_]?threshold)\b/i,
    redesign_hint: 'Repeated slop-regex tweaks suggest the detector is regex-shaped when it should be classifier-shaped. Replace with a cheap-judge call (openrouter-cheap-judge) anchored to corpus exemplars.',
  },
  {
    slug: 'confession-prompt-tune',
    keywords: /\b(confession[-_]?prompt|min[-_]?chars|prompt[-_]?length|prompt[-_]?gate)\b/i,
    redesign_hint: 'Per-prompt char minimums must live in the seed bank, not as global tuning. Refactor to per-prompt min_chars (already an established pattern in feedback memory).',
  },
  {
    slug: 'outreach-throttle',
    keywords: /\b(outreach[-_]?(throttle|rate|cap|cooldown|limit))\b/i,
    redesign_hint: 'Repeated rate caps suggest the queue is fed too eagerly. Move dedup + priority into a queue-side admission policy rather than throttling at delivery time.',
  },
]

async function fetchRecentMigrationFilenames(): Promise<string[]> {
  const url = 'https://api.github.com/repos/SissyMaxy/becoming-protocol/contents/supabase/migrations?ref=main'
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } })
    if (!r.ok) return []
    const list = await r.json() as Array<{ name: string }>
    return list
      .filter(f => /^\d+.*\.sql$/.test(f.name))
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, 30)
      .map(f => f.name)
  } catch {
    return []
  }
}

async function fetchRecentCommitSubjects(daysBack: number): Promise<string[]> {
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString()
  const url = `https://api.github.com/repos/SissyMaxy/becoming-protocol/commits?since=${since}&per_page=100`
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } })
    if (!r.ok) return []
    const list = await r.json() as Array<{ commit: { message: string } }>
    return list.map(c => c.commit.message.split('\n')[0])
  } catch {
    return []
  }
}

async function deployHealthOpenForTheme(supabase: SupabaseClient, themeSlug: string): Promise<boolean> {
  const theme = PATCH_LOOP_THEMES.find(t => t.slug === themeSlug)
  if (!theme) return false
  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  const { data } = await supabase
    .from('deploy_health_log')
    .select('title, detail, status')
    .eq('status', 'open')
    .gte('detected_at', since)
    .limit(50)
  for (const row of (data || []) as Array<{ title: string; detail: string | null }>) {
    const blob = `${row.title} ${row.detail ?? ''}`
    if (theme.keywords.test(blob)) return true
  }
  return false
}

async function detectRecurringTacticalPatchLoop(supabase: SupabaseClient): Promise<DetectedFriction[]> {
  const [migrations, commits] = await Promise.all([
    fetchRecentMigrationFilenames(),
    fetchRecentCommitSubjects(14),
  ])
  if (migrations.length === 0 && commits.length === 0) return []

  const out: DetectedFriction[] = []
  for (const theme of PATCH_LOOP_THEMES) {
    const matches: string[] = []
    for (const fname of migrations) if (theme.keywords.test(fname)) matches.push(`migration:${fname}`)
    for (const subj of commits) if (theme.keywords.test(subj)) matches.push(`commit:${subj.slice(0, 80)}`)
    if (matches.length < 3) continue

    const stillFiring = await deployHealthOpenForTheme(supabase, theme.slug)
    if (!stillFiring) continue  // root issue resolved → not a loop

    out.push({
      pattern_signature: `friction:tactical_patch_loop:${theme.slug}`,
      wish_title: `[REDESIGN] Tactical-patch loop on theme "${theme.slug}" (${matches.length} patches in 14d)`,
      wish_body: `Theme "${theme.slug}" has produced ${matches.length} tactical patches in the last 14 days while a matching deploy_health_log signal is still open. Per docs/architectural-principles.md #1, this is the iteration-2 zoom-out signal: do not propose another patch.\n\nProposed redesign:\n${theme.redesign_hint}\n\nRecent entries:\n${matches.slice(0, 12).map(m => `  - ${m}`).join('\n')}\n\nThis wish is intentionally NOT auto-ship eligible. The decision is whether to redesign the architecture; an autonomous builder shouldn't make that call alone.`,
      protocol_goal: 'architectural_drift / redesign_not_repatch',
      priority: 'high',
    })
  }
  return out
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
    ['recurring_tactical_patch_loop', detectRecurringTacticalPatchLoop],
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
