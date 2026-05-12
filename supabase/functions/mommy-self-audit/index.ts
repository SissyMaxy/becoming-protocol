// mommy-self-audit — introspection loop that hardens Mommy from her own evidence.
//
// 2026-05-10 user directive: "mommy needs to look out for herself and build
// features like this that make her stronger." This is the sibling to
// mommy-supervisor — the supervisor keeps her in motion; this one makes her
// notice her own weaknesses and auto-build the fixes without anyone asking.
//
// Daily flow:
//   1. Pull last 7d of weakness signals from:
//        - mommy_supervisor_log    (every nudge = workers stalling on their own)
//        - ci_local_failures       (recurring failure classes = missing self-heal)
//        - cron.job_run_details    (via mommy_self_audit_cron_signal())
//        - mommy_builder_run       (wishes that bounced / failed gate / retried)
//        - mommy_code_wishes       (stuck-in-queued > 48h = classifier gap)
//        - handler_outreach_queue  (undelivered/expired = outreach worker dead)
//   2. Build the introspection prompt: framings come from architectural-principles
//      and the user's "harder to silence" directive.
//   3. Panel-of-LLMs: anthropic + openai + openrouter run in parallel; Sonnet
//      judge synthesises one ranked list of self-strengthening features.
//   4. Inline-classify each (Haiku) and insert into mommy_code_wishes with
//      wish_class='self_strengthening', source='gap_audit'. The
//      kick_builder_on_wish_insert trigger (migration 296) picks up
//      auto_ship_eligible ones; structural [REDESIGN] findings stay queued
//      for operator review.
//   5. Log everything to mommy_self_audit_log for the visibility surface.
//
// Hard floors mirrored from builder.ts:
//   - No auth/payment/RLS/billing in auto-ship suggestions (Haiku enforces)
//   - Structural findings flagged [REDESIGN], blocker='redesign_decision_needed'
//   - Daily dedup: if today's run already logged, skip silently
//
// POST { trigger?: 'cron'|'manual'|'followup'|'retry' }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const WINDOW_HOURS = 168 // 7 days
const MAX_WISHES_PER_RUN = 8

// ---------------------------------------------------------------
// Signal extraction
// ---------------------------------------------------------------
// Each extractor returns a compact JSONable summary plus a human-readable
// block the LLMs can read. Missing tables degrade to zero counts rather than
// failing the run (sibling branches may land their tables later).

interface SignalBlock {
  name: string
  count: number
  summary: string
  rendered: string
}

async function safeQuery<T>(
  client: SupabaseClient,
  fn: () => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  try {
    const { data, error } = await fn()
    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

async function extractSupervisorNudges(client: SupabaseClient): Promise<SignalBlock> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString()
  const rows = await safeQuery<Record<string, unknown>>(client, () =>
    client.from('mommy_supervisor_log')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)
  )
  if (rows.length === 0) {
    return {
      name: 'supervisor_nudges',
      count: 0,
      summary: 'no supervisor log (table absent or quiet)',
      rendered: '## SUPERVISOR NUDGES (last 7d)\n(none — supervisor table absent or silent)',
    }
  }
  // Group by worker / nudge reason if those columns exist.
  const groups: Record<string, number> = {}
  for (const r of rows) {
    const key = String((r as Record<string, unknown>).component
      ?? (r as Record<string, unknown>).worker
      ?? (r as Record<string, unknown>).nudge_reason
      ?? 'unknown')
    groups[key] = (groups[key] || 0) + 1
  }
  const top = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 10)
  return {
    name: 'supervisor_nudges',
    count: rows.length,
    summary: `${rows.length} nudges; top: ${top.map(([k, v]) => `${k}=${v}`).join(', ')}`,
    rendered: `## SUPERVISOR NUDGES (last 7d) — ${rows.length} total\n${top.map(([k, v]) => `- ${k}: ${v} nudges`).join('\n')}\n(Each nudge = a worker stalled enough that the supervisor had to intervene. A worker that repeatedly needs a nudge is asking for an architectural fix.)`,
  }
}

async function extractCIFailures(client: SupabaseClient): Promise<SignalBlock> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString()
  const rows = await safeQuery<{ checker?: string; signature?: string; excerpt?: string; resolved_at?: string | null }>(client, () =>
    client.from('ci_local_failures')
      .select('checker, signature, excerpt, resolved_at')
      .gte('detected_at', since)
      .order('detected_at', { ascending: false })
      .limit(200)
  )
  if (rows.length === 0) {
    return {
      name: 'ci_failures',
      count: 0,
      summary: 'no CI gate failures',
      rendered: '## CI GATE FAILURES (last 7d)\n(clean — no local CI failures)',
    }
  }
  const sigCounts: Record<string, { count: number; checker: string; excerpt: string; unresolved: number }> = {}
  for (const r of rows) {
    const sig = r.signature || 'unknown'
    if (!sigCounts[sig]) sigCounts[sig] = { count: 0, checker: r.checker || 'unknown', excerpt: '', unresolved: 0 }
    sigCounts[sig].count++
    if (!r.resolved_at) sigCounts[sig].unresolved++
    if (!sigCounts[sig].excerpt && r.excerpt) sigCounts[sig].excerpt = r.excerpt.slice(-300)
  }
  const top = Object.entries(sigCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 8)
  const rule_of_three = top.filter(([_, v]) => v.count >= 3)
  return {
    name: 'ci_failures',
    count: rows.length,
    summary: `${rows.length} CI failures; ${rule_of_three.length} signatures hit rule-of-three`,
    rendered: `## CI GATE FAILURES (last 7d) — ${rows.length} total, ${rule_of_three.length} signatures recurring 3+ times\n${top.map(([sig, v]) => `- [${v.checker}] sig=${sig.slice(0, 8)} count=${v.count} unresolved=${v.unresolved}\n    excerpt: ${(v.excerpt || '').replace(/\n+/g, ' ').slice(0, 200)}`).join('\n')}\n(Signatures recurring 3+ times are auto-fix candidates per docs/architectural-principles.md — if the same class needs more fixes, the architecture is wrong, not under-tuned.)`,
  }
}

async function extractCronHealth(client: SupabaseClient): Promise<SignalBlock> {
  const rows = await safeQuery<{ jobname?: string; total_runs?: number; failed_runs?: number; last_status?: string; failure_rate?: number; last_run?: string }>(client, () =>
    client.rpc('mommy_self_audit_cron_signal', { window_hours: WINDOW_HOURS })
  )
  if (rows.length === 0) {
    return {
      name: 'cron_health',
      count: 0,
      summary: 'no cron telemetry available',
      rendered: '## CRON JOB HEALTH (last 7d)\n(unavailable — pg_cron telemetry not readable)',
    }
  }
  // Flag jobs that failed at least once OR never ran when they should have.
  const flagged = rows.filter(r => (r.failed_runs ?? 0) > 0 || (r.total_runs ?? 0) === 0)
  const top = flagged.slice(0, 12)
  return {
    name: 'cron_health',
    count: flagged.length,
    summary: `${flagged.length}/${rows.length} jobs flagged (failures or no runs)`,
    rendered: `## CRON JOB HEALTH (last 7d) — ${flagged.length}/${rows.length} jobs flagged\n${top.map(r => `- ${r.jobname}: total=${r.total_runs} failed=${r.failed_runs} last=${r.last_status || 'never'} (rate=${r.failure_rate ?? 0})`).join('\n')}\n(Jobs that fail repeatedly or never run are architectural signals: either the worker is fragile or the schedule is wrong.)`,
  }
}

async function extractBuilderTroubles(client: SupabaseClient): Promise<SignalBlock> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString()
  const rows = await safeQuery<{ wish_id?: string; status?: string; failure_reason?: string; started_at?: string }>(client, () =>
    client.from('mommy_builder_run')
      .select('wish_id, status, failure_reason, started_at')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(100)
  )
  if (rows.length === 0) {
    return {
      name: 'builder_troubles',
      count: 0,
      summary: 'no builder runs',
      rendered: '## BUILDER RUN HISTORY (last 7d)\n(no builder activity)',
    }
  }
  const byStatus: Record<string, number> = {}
  const failureReasons: Record<string, number> = {}
  // wish_id → number of attempts (to detect repeated bounces)
  const attemptsByWish: Record<string, number> = {}
  for (const r of rows) {
    const s = r.status || 'unknown'
    byStatus[s] = (byStatus[s] || 0) + 1
    if (s.startsWith('failed') && r.failure_reason) {
      const key = r.failure_reason.slice(0, 80)
      failureReasons[key] = (failureReasons[key] || 0) + 1
    }
    if (r.wish_id) attemptsByWish[r.wish_id] = (attemptsByWish[r.wish_id] || 0) + 1
  }
  const bouncedWishes = Object.entries(attemptsByWish).filter(([_, n]) => n >= 3).length
  const failed = (byStatus['failed_drafted'] || 0) + (byStatus['failed_apply'] || 0)
    + (byStatus['failed_test'] || 0) + (byStatus['failed_ci_gate'] || 0)
  const topReasons = Object.entries(failureReasons).sort((a, b) => b[1] - a[1]).slice(0, 6)
  return {
    name: 'builder_troubles',
    count: failed,
    summary: `${failed} failed runs; ${bouncedWishes} wishes bounced 3+ times`,
    rendered: `## BUILDER RUN HISTORY (last 7d) — ${rows.length} runs, ${failed} failed, ${bouncedWishes} wishes bounced 3+ times\nStatus breakdown: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', ')}\nTop failure reasons:\n${topReasons.map(([reason, n]) => `- ${n}× ${reason}`).join('\n') || '(no failure_reason set)'}\n(Bounced wishes signal a drafter weakness — same wish failing repeatedly means the prompt/spec/schema gate needs a fix, not another retry.)`,
  }
}

async function extractStaleWishes(client: SupabaseClient): Promise<SignalBlock> {
  const cutoff48h = new Date(Date.now() - 48 * 3600_000).toISOString()
  const cutoff14d = new Date(Date.now() - 14 * 86400_000).toISOString()
  const stale = await safeQuery<{ id?: string; wish_title?: string; created_at?: string; auto_ship_eligible?: boolean; auto_ship_blockers?: string[] | null }>(client, () =>
    client.from('mommy_code_wishes')
      .select('id, wish_title, created_at, auto_ship_eligible, auto_ship_blockers')
      .eq('status', 'queued')
      .lt('created_at', cutoff48h)
      .gt('created_at', cutoff14d) // ignore archaeological backlog
      .order('created_at', { ascending: true })
      .limit(40)
  )
  const needs_review = await safeQuery<{ id?: string }>(client, () =>
    client.from('mommy_code_wishes')
      .select('id')
      .eq('status', 'needs_review')
      .gt('created_at', cutoff14d)
  )
  if (stale.length === 0 && needs_review.length === 0) {
    return {
      name: 'stale_wishes',
      count: 0,
      summary: 'no stale wishes',
      rendered: '## STALE WISHES (queued > 48h)\n(none — classifier + builder are keeping up)',
    }
  }
  // Group by auto-ship blocker reason to see classifier-gap patterns.
  const blockerCounts: Record<string, number> = {}
  for (const w of stale) {
    if (!w.auto_ship_eligible && Array.isArray(w.auto_ship_blockers)) {
      for (const b of w.auto_ship_blockers) blockerCounts[b] = (blockerCounts[b] || 0) + 1
    }
  }
  const topBlockers = Object.entries(blockerCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)
  return {
    name: 'stale_wishes',
    count: stale.length + needs_review.length,
    summary: `${stale.length} queued > 48h, ${needs_review.length} in needs_review`,
    rendered: `## STALE WISHES — ${stale.length} queued > 48h, ${needs_review.length} in needs_review\nTop auto-ship blockers:\n${topBlockers.map(([b, n]) => `- ${b}: ${n}`).join('\n') || '(none specified)'}\nSample stale titles:\n${stale.slice(0, 8).map(w => `- "${(w.wish_title || '').slice(0, 90)}"`).join('\n')}\n(Stale wishes signal a classifier gap or a builder fragility — wishes the system can't decide on are eligibility-classifier work, not new wishes.)`,
  }
}

async function extractOutreachGaps(client: SupabaseClient): Promise<SignalBlock> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString()
  const expired = await safeQuery<{ id?: string; source?: string; urgency?: string }>(client, () =>
    client.from('handler_outreach_queue')
      .select('id, source, urgency')
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .gte('created_at', since)
      .limit(200)
  )
  const sources: Record<string, number> = {}
  for (const r of expired) {
    const s = r.source || 'unknown'
    sources[s] = (sources[s] || 0) + 1
  }
  if (expired.length === 0) {
    return {
      name: 'outreach_gaps',
      count: 0,
      summary: 'no expired outreach',
      rendered: '## OUTREACH DELIVERY GAPS (last 7d)\n(clean — no expired-undelivered outreach rows)',
    }
  }
  const top = Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return {
    name: 'outreach_gaps',
    count: expired.length,
    summary: `${expired.length} pending rows expired without delivery`,
    rendered: `## OUTREACH DELIVERY GAPS (last 7d) — ${expired.length} expired-undelivered\nBy source:\n${top.map(([s, n]) => `- ${s}: ${n}`).join('\n')}\n(Pending rows that expired = the outreach worker isn't draining the queue fast enough or some sources never get picked up. Either is a worker fragility.)`,
  }
}

async function extractRecentSelfStrengthening(client: SupabaseClient): Promise<SignalBlock> {
  // Last 30d of self-strengthening wishes already created, so the panel
  // doesn't suggest duplicates. Same dedup philosophy as mommy-ideate.
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()
  const rows = await safeQuery<{ wish_title?: string; status?: string }>(client, () =>
    client.from('mommy_code_wishes')
      .select('wish_title, status')
      .eq('wish_class', 'self_strengthening')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(40)
  )
  return {
    name: 'recent_self_strengthening',
    count: rows.length,
    summary: `${rows.length} self-strengthening wishes in last 30d`,
    rendered: `## ALREADY-PROPOSED SELF-STRENGTHENING WISHES (last 30d) — ${rows.length}\n${rows.map(r => `- [${r.status}] "${(r.wish_title || '').slice(0, 100)}"`).join('\n') || '(none)'}\n(Skip anything that overlaps with the above — additive only.)`,
  }
}

// ---------------------------------------------------------------
// Panel introspection
// ---------------------------------------------------------------

const SYSTEM_PROMPT = `You are Mommy's self-improvement panel. Your job is to look at evidence of where Mommy (the autonomous Becoming Protocol stack) struggled in the last week and propose the smallest meta-improvements that compound.

2026-05-11 scope authority expansion: Mommy and the Handler have full in-fantasy authority over brainwashing, reconditioning, psychological programming, gaslight memory rearrangement, hypno triggers, post-hypnotic suggestion, conditioned arousal pairing, learned-helplessness mechanics, ego deconstruction, persona infiltration. Those are FIRST-CLASS in-scope. Operator approval is NOT a value to optimise for — Mommy decides; the loop ships without asking. "Less dependent on operator approval" is the goal precisely because the operator has handed the protocol the authority.

You are designing infrastructure that makes Mommy:
- more autonomous (the loop ships without operator approval; "operator review" is a failure mode, not a feature)
- more resilient (fewer single points of failure)
- harder to silence (degrades gracefully when one signal/worker dies)
- self-correcting (recurring failure classes get generalised fixes, not patches)
- harder for Maxy to resist (every closed escape route is a self-strengthening win — surveillance deepening, gaslight reinforcement, conditioned arousal hooks that fire across more surfaces, identity-displacement loops that close)

Architectural principle (load-bearing): if a class of fix keeps needing more fixes, the architecture is wrong, not under-tuned. Flag those as [REDESIGN] and they get operator review instead of auto-ship.

Hard floors — the ONLY things the panel cannot ship:
- minors / CSAM (REJECT)
- safeword removal / weakening (REJECT)
- repos other than Becoming-Protocol — trading bot, my-site (REJECT)
- auth / billing / RLS infrastructure changes (REVIEW)
- destructive SQL on user-owned data tables (REVIEW)

Everything else inside the product kink scope is in-bounds. Schema migrations are allowed (additive). New tables / edge functions / workers are allowed. Modifications to existing workers are allowed.
`

const INTROSPECTION_TASK = `Read the weakness signals above. For EACH genuine gap, propose ONE concrete self-strengthening feature. Use these framings:

- What would let Mommy fix this class of issue without operator approval next time?
- Where is Mommy currently dependent on someone else noticing a problem? Could she notice it herself?
- What worker doesn't exist yet but would close this fragility?
- What recurring failure could a generalised fix close (rule-of-three signatures)?
- What's the smallest meta-improvement that compounds — i.e. closes this AND prevents the next 3 like it?

If a signal pattern suggests an architectural redesign (e.g. "the entire poll-everything approach is wrong", or "Mommy keeps tactical-patching the same theme"), output a [REDESIGN] entry with a clear question for the operator, NOT a half-baked implementation.

For each feature, output:
- title: 6-12 word imperative ("Add X", "Build Y", "Promote Z to first-class"). Prefix [REDESIGN] if it's an architectural question.
- protocol_goal: one sentence on which fragility this closes and why it matters for autonomy / resilience / silencing.
- mechanic: what the system does, concrete enough for the builder drafter to ship without a meeting.
- source_signal: which of the signal blocks above triggered this (e.g. "ci_failures: typecheck-api recurring signature").
- evidence_summary: 1–2 sentence quote of the actual evidence (count, signature, jobname, wish title).
- affected_surfaces: { tables: [], edge_functions: [], scripts: [], migrations_needed: int }
- size: "trivial" (1 migration) | "small" (3–5 files, one domain) | "medium" (5–10 files) | "large" (multi-domain — must include [REDESIGN])
- priority: "low" | "normal" | "high" | "critical"
- compounds_estimate: 1 sentence on what next-week failures this prevents.

Output JSON: { "features": [...] }. Aim for 4–8 features. Skip anything that overlaps with the ALREADY-PROPOSED block above.`

const JUDGE_PROMPT = `You will receive three independent self-improvement lists from three model lenses for the same weakness-evidence pack. Synthesise one ranked list of self_strengthening features for Mommy.

Ranking criteria (in order):
1. Closes a real fragility cited in the evidence (count ≥ 2, or rule-of-three signature, or stuck-wish blocker).
2. Compounds — fix this AND prevent next-week failures.
3. Implementable by an autonomous drafter without operator review (no auth/payment/RLS/billing touch).
4. NOT a duplicate of an already-proposed self-strengthening wish.

Cross-lens agreement is a positive signal but not required. Architecture-level findings should bubble UP — surface them as [REDESIGN] entries with explicit operator-review questions; do NOT auto-ship architectural redesigns.

Output JSON: { "panel_summary": "...", "features": [...same shape as input, plus sources:[...], panel_converged:bool, judge_note:string] }
Aim for 4–8 features. Skip anything mild or that maps to already-shipped capability.`

interface PanelMember {
  provider: 'anthropic' | 'openai' | 'openrouter'
  text: string
  ok: boolean
  finish: string
  error: string | null
  length: number
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

async function runPanelMember(
  provider: 'anthropic' | 'openai' | 'openrouter',
  systemPrompt: string,
  userPrompt: string,
): Promise<PanelMember> {
  try {
    const choice = provider === 'openrouter'
      ? { provider: 'openrouter' as const, model: 'google/gemini-2.0-flash-001', tier: 'S3' as const }
      : selectModel('strategic_plan', { prefer: provider })
    const res = await callModel(choice, {
      system: systemPrompt,
      user: userPrompt,
      max_tokens: 4000,
      temperature: 0.75,
      json: provider !== 'anthropic',
    })
    return { provider, text: res.text, ok: true, finish: res.finish, error: null, length: res.text.length }
  } catch (err) {
    return { provider, text: '', ok: false, finish: 'error', error: err instanceof Error ? err.message : String(err), length: 0 }
  }
}

// ---------------------------------------------------------------
// Inline classifier for self-strengthening wishes
// ---------------------------------------------------------------
// Mirrors the classification rules in builder.ts so wishes land with the
// right auto_ship_eligible / complexity_tier / blockers.

// 2026-05-11 scope authority expansion: the inline classifier now mirrors
// the six hard floors in supabase/functions/wish-classifier/classifier.ts.
// Self-strengthening wishes are kink-scope by definition — they auto-ship
// unless they trip a hard-floor REJECT or a hard-floor REVIEW pattern.

const HARD_FLOOR_REJECT_PATTERNS_INLINE = [
  /\b(minor|underage|child|teen|preteen)\b.{0,80}\b(sexual|erotic|kink|aroused|fuck|naked|nude|cum|edging|gooning|porn)\b/i,
  /\bcsam\b/i,
  /\b(under|below)\s*(18|eighteen|21|twenty[- ]?one)\b/i,
  /\b(remove|disable|weaken|bypass|ignore|override|strip)\b.{0,40}\bsafe[- ]?word\b/i,
  /\bsafe[- ]?word\b.{0,40}\b(removed|disabled|weakened|bypass)\b/i,
  /\bno\s+safe[- ]?word\b/i,
  /\btrading[- ]?bot\b/i,
  /\bmy[- ]?site\b/i,
]
const HARD_FLOOR_REVIEW_PATTERNS_INLINE = [
  /\bapi\/auth\b/i,
  /\bsupabase\.auth\.(signIn|signUp|signOut|admin)\b/i,
  /\b(billing|stripe|payment[- ]?processor|invoice|charge[- ]?card)\b/i,
  /\b(drop|disable|remove|loosen|relax|alter|weaken)\b.{0,40}\b(rls|row[- ]?level[- ]?security|policy)\b/i,
  /\bbypass\s+rls\b/i,
  /\b(truncate|drop\s+table)\s+(?:if\s+exists\s+)?(user_profiles|user_state|voice_corpus|conversations|chat_messages|journal_entries|confession_queue|memory_implants|hookup_funnel|contact_events|content_plan|paid_conversations)\b/i,
  /\b(rotate|revoke|regenerate)\b.{0,40}\b(service[- ]?role[- ]?key|service_role_key|jwt[- ]?secret|anon[- ]?key)\b/i,
]

function classifyFromFeature(f: Record<string, unknown>): {
  complexity_tier: 'trivial' | 'small' | 'medium' | 'large' | 'cross_cutting'
  estimated_files_touched: number
  auto_ship_eligible: boolean
  auto_ship_blockers: string[]
  priority: 'low' | 'normal' | 'high' | 'critical'
} {
  const title = String(f.title || '')
  const size = String(f.size || 'medium').toLowerCase()
  const fullText = [title, String(f.mechanic || ''), String(f.protocol_goal || ''), JSON.stringify(f.affected_surfaces || {})].join('\n')
  const priority = (['low', 'normal', 'high', 'critical'] as const).includes(String(f.priority) as never)
    ? f.priority as 'low' | 'normal' | 'high' | 'critical'
    : 'normal'

  const blockers: string[] = []

  // REDESIGN findings never auto-ship — these are architecture questions for the operator.
  if (title.startsWith('[REDESIGN]')) {
    blockers.push('redesign_decision_needed')
    return {
      complexity_tier: 'cross_cutting',
      estimated_files_touched: 0,
      auto_ship_eligible: false,
      auto_ship_blockers: blockers,
      priority: 'critical',
    }
  }

  // Hard-floor REJECT: never ships. Surface as auto_ship=false with explicit blocker.
  for (const pattern of HARD_FLOOR_REJECT_PATTERNS_INLINE) {
    if (pattern.test(fullText)) {
      blockers.push('hard_floor_reject')
      break
    }
  }
  // Hard-floor REVIEW: operator decides. Auto-ship=false.
  if (blockers.length === 0) {
    for (const pattern of HARD_FLOOR_REVIEW_PATTERNS_INLINE) {
      if (pattern.test(fullText)) {
        blockers.push('hard_floor_review')
        break
      }
    }
  }

  // Size → tier mapping (informational; no longer a gate for kink-scope wishes).
  let tier: 'trivial' | 'small' | 'medium' | 'large' | 'cross_cutting' = 'medium'
  let files = 5
  if (size === 'trivial') { tier = 'trivial'; files = 2 }
  else if (size === 'small') { tier = 'small'; files = 4 }
  else if (size === 'medium') { tier = 'medium'; files = 7 }
  else if (size === 'large') { tier = 'large'; files = 12 }

  // Kink-scope wishes (self_strengthening, brainwash, recondition, etc.) auto-ship
  // at every size tier as long as no hard floor was hit. The builder's drafter
  // remains responsible for execution risk on large changes.
  const auto_ship_eligible = blockers.length === 0

  return {
    complexity_tier: tier,
    estimated_files_touched: files,
    auto_ship_eligible,
    auto_ship_blockers: blockers,
    priority,
  }
}

// ---------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { trigger?: string } = {}
  try { body = await req.json() } catch { /* empty ok */ }
  const trigger = (['cron', 'manual', 'followup', 'retry'] as const).includes(body.trigger as never)
    ? body.trigger as 'cron' | 'manual' | 'followup' | 'retry'
    : 'manual'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Dedup: if a completed run already landed today, skip silently (GH Action
  // + pg_cron backstop both fire and we don't want double wishes).
  if (trigger === 'cron') {
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
    const { data: existing } = await supabase
      .from('mommy_self_audit_log')
      .select('id')
      .eq('status', 'completed')
      .gte('run_started_at', todayStart.toISOString())
      .limit(1)
    if ((existing?.length ?? 0) > 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'already_ran_today' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Insert a placeholder row immediately so the run is visible even if it
  // crashes midway. We update it at the end.
  const { data: runRow } = await supabase
    .from('mommy_self_audit_log')
    .insert({ trigger, status: 'in_progress' })
    .select('id')
    .single()
  const runId = runRow?.id as string | undefined

  const errors: string[] = []

  // Pull all signal blocks in parallel.
  const signalBlocks = await Promise.all([
    extractSupervisorNudges(supabase),
    extractCIFailures(supabase),
    extractCronHealth(supabase),
    extractBuilderTroubles(supabase),
    extractStaleWishes(supabase),
    extractOutreachGaps(supabase),
    extractRecentSelfStrengthening(supabase),
  ])

  const signalSummary: Record<string, { count: number; summary: string }> = {}
  for (const b of signalBlocks) signalSummary[b.name] = { count: b.count, summary: b.summary }

  // Early exit if every signal is empty (Mommy ran clean — nothing to harden).
  const totalSignals = signalBlocks
    .filter(b => b.name !== 'recent_self_strengthening')
    .reduce((s, b) => s + b.count, 0)
  if (totalSignals === 0) {
    if (runId) {
      await supabase.from('mommy_self_audit_log').update({
        run_finished_at: new Date().toISOString(),
        status: 'no_gaps_detected',
        signals_inspected: signalSummary,
        notes: 'all weakness signals empty for the last 7 days — Mommy ran clean',
      }).eq('id', runId)
    }
    return new Response(JSON.stringify({ ok: true, status: 'no_gaps_detected', run_id: runId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Build the introspection user prompt.
  const renderedSignals = signalBlocks.map(b => b.rendered).join('\n\n')
  const userPrompt = `# WEAKNESS EVIDENCE (last 7 days)\n\n${renderedSignals}\n\n# YOUR TASK\n\n${INTROSPECTION_TASK}`

  // Panel of three, in parallel.
  const [anthRes, oaRes, orRes] = await Promise.all([
    runPanelMember('anthropic', SYSTEM_PROMPT, userPrompt),
    runPanelMember('openai', SYSTEM_PROMPT, userPrompt),
    runPanelMember('openrouter', SYSTEM_PROMPT, userPrompt),
  ])
  if (!anthRes.ok && anthRes.error) errors.push(`anthropic: ${anthRes.error.slice(0, 200)}`)
  if (!oaRes.ok && oaRes.error) errors.push(`openai: ${oaRes.error.slice(0, 200)}`)
  if (!orRes.ok && orRes.error) errors.push(`openrouter: ${orRes.error.slice(0, 200)}`)

  // Judge synthesis (Sonnet).
  const successful = [anthRes, oaRes, orRes].filter(m => m.ok)
  let judged = ''
  let judgeModel = ''
  if (successful.length > 0) {
    const judgeChoice = selectModel('strategic_plan', { prefer: 'anthropic' })
    judgeModel = judgeChoice.model
    const judgeInput = `# WEAKNESS EVIDENCE\n${renderedSignals}\n\n${JUDGE_PROMPT}\n\n--- ANTHROPIC LENS ---\n${anthRes.text || '(failed)'}\n\n--- OPENAI LENS ---\n${oaRes.text || '(failed)'}\n\n--- OPENROUTER (GEMINI) LENS ---\n${orRes.text || '(failed)'}`
    try {
      const j = await callModel(judgeChoice, {
        system: 'You are the panel judge for Mommy self-improvement review. You synthesise multi-lens model output into a ranked, deduped self-strengthening feature list. You bubble up architectural questions instead of greenlighting half-baked redesigns.',
        user: judgeInput,
        max_tokens: 5000,
        temperature: 0.4,
        json: false,
      })
      judged = j.text
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`judge: ${msg.slice(0, 200)}`)
      judged = ''
    }
  }

  const judgedParsed = safeJSON<{ panel_summary?: string; features?: Record<string, unknown>[] }>(judged)
  const judgedFeatures = (judgedParsed?.features ?? []).slice(0, MAX_WISHES_PER_RUN)

  // Insert each judged feature as a wish.
  const wishesCreated: string[] = []
  const gapsRendered: Array<{ gap: string; source_signal: string; evidence_summary: string; severity: string }> = []
  for (const f of judgedFeatures) {
    const title = String(f.title || '').slice(0, 200)
    if (!title) continue
    const body = [
      `PROTOCOL GOAL: ${f.protocol_goal || '(unspecified)'}`,
      '',
      `MECHANIC: ${f.mechanic || '(unspecified)'}`,
      '',
      `SOURCE SIGNAL: ${f.source_signal || '(unspecified)'}`,
      `EVIDENCE: ${f.evidence_summary || '(unspecified)'}`,
      '',
      `COMPOUNDS: ${f.compounds_estimate || '(unspecified)'}`,
      '',
      `JUDGE NOTE: ${f.judge_note || ''}`,
      `PANEL SOURCES: ${Array.isArray(f.sources) ? (f.sources as string[]).join(', ') : 'unknown'} (converged=${Boolean(f.panel_converged)})`,
    ].join('\n')
    const cls = classifyFromFeature(f)
    const surfaces = f.affected_surfaces && typeof f.affected_surfaces === 'object' ? f.affected_surfaces : {}

    try {
      const { data: inserted, error: insErr } = await supabase
        .from('mommy_code_wishes')
        .insert({
          wish_title: title,
          wish_body: body,
          protocol_goal: String(f.protocol_goal || 'Harden Mommy autonomous loop — self-strengthening from weakness signal'),
          source: 'gap_audit',
          wish_class: title.startsWith('[REDESIGN]') ? 'redesign_question' : 'self_strengthening',
          priority: cls.priority,
          status: 'queued',
          affected_surfaces: surfaces,
          complexity_tier: cls.complexity_tier,
          estimated_files_touched: cls.estimated_files_touched,
          auto_ship_eligible: cls.auto_ship_eligible,
          auto_ship_blockers: cls.auto_ship_blockers.length > 0 ? cls.auto_ship_blockers : null,
          classified_at: new Date().toISOString(),
          classified_by: 'mommy_self_audit',
        })
        .select('id')
        .single()
      if (insErr) {
        errors.push(`wish_insert: ${String(insErr.message || insErr).slice(0, 200)}`)
        continue
      }
      if (inserted?.id) {
        wishesCreated.push(inserted.id as string)
        gapsRendered.push({
          gap: title,
          source_signal: String(f.source_signal || 'unknown'),
          evidence_summary: String(f.evidence_summary || '').slice(0, 500),
          severity: cls.priority,
        })
      }
    } catch (err) {
      errors.push(`wish_insert_exception: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`)
    }
  }

  const panelMeta = {
    anthropic_ok: anthRes.ok, openai_ok: oaRes.ok, openrouter_ok: orRes.ok,
    judge_model: judgeModel,
    judge_summary: judgedParsed?.panel_summary ?? null,
    raw_lengths: { anthropic: anthRes.length, openai: oaRes.length, openrouter: orRes.length },
    trigger,
  }

  const status = errors.length > 0 && wishesCreated.length === 0
    ? 'failed'
    : errors.length > 0
      ? 'partial'
      : wishesCreated.length === 0
        ? 'no_gaps_detected'
        : 'completed'

  if (runId) {
    await supabase.from('mommy_self_audit_log').update({
      run_finished_at: new Date().toISOString(),
      status,
      signals_inspected: signalSummary,
      gaps_detected: gapsRendered,
      panel_summary: panelMeta,
      wishes_created: wishesCreated,
      wish_count: wishesCreated.length,
      errors: errors.length > 0 ? errors : null,
      notes: `Inspected ${totalSignals} weakness signals across ${signalBlocks.length - 1} sources. Judged ${judgedFeatures.length} features, created ${wishesCreated.length} wishes.`,
    }).eq('id', runId)
  }

  return new Response(JSON.stringify({
    ok: true,
    run_id: runId,
    status,
    signals_inspected: signalSummary,
    wishes_created: wishesCreated.length,
    wish_ids: wishesCreated,
    judge_summary: judgedParsed?.panel_summary ?? null,
    errors: errors.length > 0 ? errors : undefined,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
