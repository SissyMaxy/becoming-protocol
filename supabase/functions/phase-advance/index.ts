// phase-advance — daily evaluator + auto-advance worker.
//
// Daily 06:15 UTC cron (migration 301). For each user with feminine_self
// set and `auto_advance_phases=true`, evaluate whether they meet the bar
// for current_phase + 1. If so:
//   - bump feminine_self.transformation_phase
//   - write phase_advancement_log row (auto_advanced=true)
//   - queue Mama-voice celebration outreach
//   - link the outreach back to the log row
// If not, write a phase_progress_snapshots row so the UI can render
// "progress to next phase" without re-running the evaluator.
//
// Hard rules (also encoded in evaluator + migration):
//   - phase 7 is terminal
//   - never advance backward
//   - one phase at a time
//   - missing telemetry → not met (never fabricate)
//   - auto_advance_phases=false → skip entirely (no eval, no snapshot)
//
// Defensive: feminine_self / transformation_phase_defs may not exist yet
// (identity branch unmerged). The fn checks at runtime and exits cleanly
// per-user when those tables are absent.
//
// POST { user_id?: string, dry_run?: boolean }. With user_id, single-user
// mode (used by tests + manual triggers). Without, batch mode (cron).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  evaluatePhaseRequirements,
  preEvaluationGuard,
  suggestHonorific,
  defaultPhaseDef,
  PHASE_CELEBRATION_TEMPLATES,
  PHASE_TERMINAL,
  type PhaseDef,
  type UserMetrics,
} from '../_shared/phase-advance-evaluator.ts'
import {
  whiplashWrap, isMommyPersona, type Affect,
} from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Supa = ReturnType<typeof createClient>

interface EvaluateOutcome {
  user_id: string
  status:
    | 'advanced'
    | 'snapshot'
    | 'skipped_terminal'
    | 'skipped_no_feminine_self'
    | 'skipped_auto_advance_off'
    | 'skipped_no_phase_def'
    | 'skipped_already_evaluated_today'
    | 'error'
  from_phase?: number
  to_phase?: number
  failing_summary?: string
  reason?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* empty body OK */ }
  const dryRun = body.dry_run === true

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Pre-flight: does feminine_self exist? If not, no users qualify.
  const hasFemSelf = await tableExists(supabase, 'feminine_self')
  if (!hasFemSelf) {
    return new Response(JSON.stringify({
      ok: true,
      mode: body.user_id ? 'single' : 'batch',
      processed: 0,
      results: [],
      note: 'feminine_self table absent — identity branch not yet merged',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Load eligible users.
  let userIds: string[] = []
  if (body.user_id) {
    userIds = [body.user_id]
  } else {
    const { data: rows } = await supabase
      .from('feminine_self')
      .select('user_id')
      .not('user_id', 'is', null)
    userIds = ((rows || []) as Array<{ user_id: string }>).map(r => r.user_id)
  }

  const results: EvaluateOutcome[] = []
  for (const uid of userIds) {
    try {
      const r = await evaluateForUser(supabase, uid, { dryRun })
      results.push(r)
    } catch (err) {
      results.push({ user_id: uid, status: 'error', reason: (err as Error).message })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    mode: body.user_id ? 'single' : 'batch',
    dry_run: dryRun,
    processed: results.length,
    advanced: results.filter(r => r.status === 'advanced').length,
    snapshots: results.filter(r => r.status === 'snapshot').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})

// ─── Per-user evaluator ─────────────────────────────────────────────────

async function evaluateForUser(
  supabase: Supa,
  userId: string,
  opts: { dryRun: boolean },
): Promise<EvaluateOutcome> {
  // 1. Settings + state.
  const { data: usRow } = await supabase
    .from('user_state')
    .select('auto_advance_phases, phase_advance_congratulate, handler_persona')
    .eq('user_id', userId)
    .maybeSingle()

  const us = (usRow as {
    auto_advance_phases?: boolean
    phase_advance_congratulate?: boolean
    handler_persona?: string | null
  } | null) ?? {}

  // Default ON if column missing (edge fn deployed before migration).
  const autoAdvance = us.auto_advance_phases !== false
  if (!autoAdvance) {
    return { user_id: userId, status: 'skipped_auto_advance_off' }
  }

  // 2. feminine_self row.
  const { data: fsRow } = await supabase
    .from('feminine_self')
    .select('transformation_phase, current_honorific, feminine_name, created_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!fsRow) {
    return { user_id: userId, status: 'skipped_no_feminine_self' }
  }
  const fs = fsRow as {
    transformation_phase?: number | null
    current_honorific?: string | null
    feminine_name?: string | null
    created_at?: string | null
  }

  const currentPhase = Math.max(0, Math.min(PHASE_TERMINAL, Math.round(fs.transformation_phase ?? 0)))

  // 3. Terminal guard.
  if (currentPhase >= PHASE_TERMINAL) {
    return { user_id: userId, status: 'skipped_terminal', from_phase: currentPhase }
  }

  // 4. Idempotency — if a log row was already written today, skip.
  //    (Cron may fire twice; manual button is non-cron and uses
  //    auto_advanced=false so it doesn't collide on this check.)
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { data: alreadyLogged } = await supabase
    .from('phase_advancement_log')
    .select('id')
    .eq('user_id', userId)
    .eq('auto_advanced', true)
    .gte('advanced_at', startOfDay.toISOString())
    .maybeSingle()
  if (alreadyLogged) {
    return { user_id: userId, status: 'skipped_already_evaluated_today', from_phase: currentPhase }
  }

  // 5. Target phase def.
  const targetPhase = currentPhase + 1
  const guard = preEvaluationGuard(currentPhase, targetPhase)
  if (guard.skip) {
    return { user_id: userId, status: 'skipped_terminal', reason: guard.reason, from_phase: currentPhase }
  }
  const targetDef = await loadPhaseDef(supabase, targetPhase)
  if (!targetDef) {
    return { user_id: userId, status: 'skipped_no_phase_def', from_phase: currentPhase }
  }

  // 6. Metrics.
  const metrics = await loadUserMetrics(supabase, userId, currentPhase, fs.created_at ?? null)

  // 7. Evaluate.
  const result = evaluatePhaseRequirements(metrics, targetDef)

  // 8. Branch — advance OR snapshot.
  if (result.all_met) {
    if (opts.dryRun) {
      return {
        user_id: userId, status: 'advanced',
        from_phase: currentPhase, to_phase: targetPhase,
      }
    }
    return await advanceUser(supabase, {
      userId,
      currentPhase,
      targetPhase,
      targetDef,
      requirementsState: result.requirements_state,
      currentHonorific: fs.current_honorific ?? null,
      feminineName: fs.feminine_name ?? null,
      isMommy: isMommyPersona(us.handler_persona),
      congratulate: us.phase_advance_congratulate !== false,
    })
  }

  // 9. Snapshot. Always insert when not advancing — gives the UI fresh data.
  if (!opts.dryRun) {
    await supabase.from('phase_progress_snapshots').insert({
      user_id: userId,
      current_phase: currentPhase,
      target_phase: targetPhase,
      requirements_state: result.requirements_state,
      all_met: false,
      failing_summary: result.failing_summary,
    })
  }
  return {
    user_id: userId,
    status: 'snapshot',
    from_phase: currentPhase,
    to_phase: targetPhase,
    failing_summary: result.failing_summary,
  }
}

// ─── Advance ──────────────────────────────────────────────────────────

async function advanceUser(
  supabase: Supa,
  args: {
    userId: string
    currentPhase: number
    targetPhase: number
    targetDef: PhaseDef
    requirementsState: Record<string, unknown>
    currentHonorific: string | null
    feminineName: string | null
    isMommy: boolean
    congratulate: boolean
  },
): Promise<EvaluateOutcome> {
  const {
    userId, currentPhase, targetPhase, targetDef, requirementsState,
    currentHonorific, feminineName,
  } = args

  // Re-read Handler state at the moment of write so the artifact reflects
  // the current persona / hard-mode / chastity-locked state — not whatever
  // it was when the evaluator started. Hard-mode locks Mommy off (Director
  // voice during compliance crisis), so a celebration written under
  // hard_mode_active=true must drop Mama's framing even if the user's
  // persona is set to dommy_mommy. Same pattern as api/handler/chat.ts.
  const { data: usFresh } = await supabase
    .from('user_state')
    .select('handler_persona, hard_mode_active, phase_advance_congratulate')
    .eq('user_id', userId)
    .maybeSingle()
  const fresh = (usFresh as {
    handler_persona?: string | null
    hard_mode_active?: boolean | null
    phase_advance_congratulate?: boolean | null
  } | null) ?? {}
  const liveIsMommy = isMommyPersona(fresh.handler_persona) && !fresh.hard_mode_active
  // Latest toggle wins — the user might have flipped congratulations off
  // between the eval load and the advance write.
  const liveCongratulate = (fresh.phase_advance_congratulate !== false) && args.congratulate

  // Bump feminine_self FIRST so a duplicate cron firing won't double-advance.
  const { error: bumpErr } = await supabase
    .from('feminine_self')
    .update({ transformation_phase: targetPhase })
    .eq('user_id', userId)
    // Concurrency guard — only succeed if the user is still at the
    // expected current_phase. If a parallel run already advanced them
    // (or operator manually moved them) this becomes a no-op.
    .eq('transformation_phase', currentPhase)
  if (bumpErr) {
    return { user_id: userId, status: 'error', reason: `bump_failed:${bumpErr.message}` }
  }

  // Suggested honorific (for surfacing only — never auto-applied).
  const suggested = suggestHonorific(targetDef, currentHonorific)

  // Celebration outreach (skip if congratulate toggle is off).
  let outreachId: string | null = null
  if (liveCongratulate) {
    const message = composeCelebration({
      isMommy: liveIsMommy,
      targetPhase,
      targetDef,
      feminineName,
      suggestedHonorific: suggested,
    })

    const affect: Affect = liveIsMommy ? 'delighted' : 'delighted'
    const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message,
      urgency: 'high',
      trigger_reason: `phase_advancement:${currentPhase}->${targetPhase}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
      source: 'phase_advancement',
    }).select('id').single()
    outreachId = (outreach as { id: string } | null)?.id ?? null

    // Best-effort: tag with affect bias when the column / table supports it.
    // Letters-archive (sibling branch) auto-archives mommy-praise rows
    // with delighted/possessive affect via its trigger; tagging here
    // makes that pickup automatic when both branches land.
    void affect
  }

  // Log row — irreversible, FK back to outreach.
  const { error: logErr } = await supabase.from('phase_advancement_log').insert({
    user_id: userId,
    from_phase: currentPhase,
    to_phase: targetPhase,
    auto_advanced: true,
    met_requirements: requirementsState,
    congratulation_outreach_id: outreachId,
    suggested_honorific: suggested,
  })
  if (logErr) {
    return { user_id: userId, status: 'error', reason: `log_failed:${logErr.message}` }
  }

  return {
    user_id: userId,
    status: 'advanced',
    from_phase: currentPhase,
    to_phase: targetPhase,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function tableExists(supabase: Supa, table: string): Promise<boolean> {
  // Cheap probe — try a HEAD count limit 0. If the table doesn't exist
  // Supabase returns an error; we treat that as "no" and move on.
  try {
    const { error } = await supabase.from(table).select('*', { count: 'exact', head: true }).limit(0)
    return !error
  } catch {
    return false
  }
}

async function loadPhaseDef(supabase: Supa, phase: number): Promise<PhaseDef | null> {
  // Try the table first (identity branch).
  const hasDefs = await tableExists(supabase, 'transformation_phase_defs')
  if (hasDefs) {
    const { data } = await supabase
      .from('transformation_phase_defs')
      .select('phase, name, arc, unlocks, primer_requirements, compliance_pct_required, min_dwell_days, wardrobe_required')
      .eq('phase', phase)
      .maybeSingle()
    if (data) return data as PhaseDef
  }
  // Fallback to baked-in defaults so the cron still produces snapshots
  // pre-merge. Bias is conservative — defaults rarely advance.
  return defaultPhaseDef(phase)
}

async function loadUserMetrics(
  supabase: Supa,
  userId: string,
  currentPhase: number,
  feminineSelfCreatedAt: string | null,
): Promise<UserMetrics> {
  // 1. days_at_current_phase — last log row's advanced_at, else feminine_self.created_at.
  const { data: lastAdv } = await supabase
    .from('phase_advancement_log')
    .select('advanced_at')
    .eq('user_id', userId)
    .order('advanced_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const phaseStartIso = (lastAdv as { advanced_at?: string } | null)?.advanced_at
    ?? feminineSelfCreatedAt
    ?? new Date().toISOString()
  const days_at_current_phase = Math.max(
    0,
    Math.floor((Date.now() - new Date(phaseStartIso).getTime()) / 86400000),
  )

  // 2. compliance_pct over last 14d. Counts rows on tables we know exist:
  //    handler_commitments (issued = all rows in window; completed = status='fulfilled').
  //    If neither table has rows in the window → null (treated as not-met).
  const since = new Date(Date.now() - 14 * 86400000).toISOString()
  let compliance_pct: number | null = null
  try {
    const [{ count: totalCount }, { count: doneCount }] = await Promise.all([
      supabase.from('handler_commitments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('set_at', since),
      supabase.from('handler_commitments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'fulfilled').gte('set_at', since),
    ])
    if ((totalCount ?? 0) > 0) {
      compliance_pct = Math.max(0, Math.min(1, (doneCount ?? 0) / (totalCount ?? 1)))
    }
  } catch { /* table missing → leave null */ }

  // 3. primers_completed — try a couple of likely tables; if none exist,
  //    return [] (treated as not-met against any non-empty requirement).
  let primers_completed: string[] = []
  try {
    const { data: rows } = await supabase
      .from('primer_completions')
      .select('primer_slug')
      .eq('user_id', userId)
    if (rows) {
      primers_completed = (rows as Array<{ primer_slug: string }>).map(r => r.primer_slug)
    }
  } catch { /* leave [] */ }

  // 4. wardrobe_counts by category from wardrobe_items (identity branch).
  let wardrobe_counts: Record<string, number> = {}
  try {
    const { data: rows } = await supabase
      .from('wardrobe_items')
      .select('category')
      .eq('user_id', userId)
    if (rows) {
      for (const r of rows as Array<{ category: string }>) {
        wardrobe_counts[r.category] = (wardrobe_counts[r.category] ?? 0) + 1
      }
    }
  } catch { /* leave {} */ }

  void currentPhase  // reserved for future per-phase telemetry windows

  return {
    current_phase: currentPhase,
    days_at_current_phase,
    compliance_pct,
    primers_completed,
    wardrobe_counts,
  }
}

function composeCelebration(args: {
  isMommy: boolean
  targetPhase: number
  targetDef: PhaseDef
  feminineName: string | null
  suggestedHonorific: string | null
}): string {
  const { isMommy, targetPhase, targetDef, feminineName, suggestedHonorific } = args
  const templates = PHASE_CELEBRATION_TEMPLATES[targetPhase] ?? []
  const seed = templates[Math.floor(Math.random() * templates.length)]
    ?? `You moved into ${targetDef.name ?? `phase ${targetPhase}`}, baby.`

  const namePart = feminineName ? ` ${feminineName},` : ''
  const honorificPart = suggestedHonorific
    ? ` Mama wants to start calling you ${suggestedHonorific} — try it on; tell me if it lands.`
    : ''
  const arcPart = targetDef.arc ? ` ${targetDef.arc}.` : ''

  if (isMommy) {
    return whiplashWrap(`${seed}${namePart}${arcPart}${honorificPart}`, { arousalBias: 'medium' })
  }
  // Handler-voice fallback. Direct, not Mama. No telemetry.
  const phaseLabel = targetDef.name ? `Phase ${targetPhase} — ${targetDef.name}` : `Phase ${targetPhase}`
  return `You advanced.${namePart} ${phaseLabel}.${arcPart}${honorificPart} New rules apply. Open Today.`
}
