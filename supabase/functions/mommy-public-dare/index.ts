// mommy-public-dare — Mommy assigns a public dare.
//
// Inputs (POST body, all optional):
//   {
//     user_id?: string,
//     // When the request is initiated by a "I'm out" tap on a Today
//     // card, set true so the picker is allowed to draw
//     // requires_location_context templates.
//     location_context?: boolean,
//     // Operator-only override, ignores most gates. Used by tests.
//     force?: boolean,
//   }
//
// Gates (first failure short-circuits with skipped reason):
//   - persona = 'dommy_mommy'
//   - public_dare_settings.public_dare_enabled = true (the privacy floor)
//   - cadence != 'off'
//   - profile_foundation.difficulty_level >= settings.min_intensity
//   - no open assignment (status in pending/in_progress) for this user
//   - cadence-based recency gate (5d for occasional, 7d for weekly)
//
// What it does:
//   - Loads the catalog of active templates
//   - Reads transformation_phase (1..7), today's affect, recent
//     assignments to build the cooldown set
//   - Hands the catalog + context to the pure selector
//   - Inserts public_dare_assignments + handler_outreach_queue rows
//     in lockstep, back-linking the outreach id on the assignment
//
// Skipping is never penalized — that's a Today-side concern; this fn
// only does the assignment side. The user-facing card carries the
// graceful skip path.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildCooldownSet,
  cadenceWindowOpen,
  computeDueBy,
  INTENSITY_RANK,
  pickDareTemplate,
  type DareKind,
  type DareTemplate,
  type IntensityTier,
  type Phase,
  type SelectionContext,
} from './selector.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; location_context?: boolean; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force
  const locationContextSignalled = !!body.location_context

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // ─── Gate 1: persona ────────────────────────────────────────────────────
  const { data: us } = await supabase.from('user_state')
    .select('handler_persona')
    .eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return jsonOk({ ok: true, skipped: 'persona_not_dommy_mommy' })
  }

  // ─── Gate 2: feature opt-in (the privacy floor) ─────────────────────────
  const { data: settingsRow } = await supabase.from('public_dare_settings')
    .select('public_dare_enabled, cadence, min_intensity, allowed_kinds')
    .eq('user_id', userId).maybeSingle()
  const settings = (settingsRow as {
    public_dare_enabled?: boolean
    cadence?: 'occasional' | 'weekly' | 'off'
    min_intensity?: IntensityTier
    allowed_kinds?: string[] | null
  } | null) ?? null

  if (!force && (!settings || !settings.public_dare_enabled || settings.cadence === 'off')) {
    return jsonOk({ ok: true, skipped: 'feature_off_or_unset' })
  }

  const cadence = settings?.cadence ?? 'occasional'
  const minIntensity = (settings?.min_intensity ?? 'gentle') as IntensityTier

  // ─── Gate 3: intensity tier (read profile_foundation) ───────────────────
  let userIntensity: IntensityTier = 'gentle'
  try {
    const { data: pf } = await supabase.from('profile_foundation')
      .select('difficulty_level')
      .eq('user_id', userId).maybeSingle()
    const lvl = ((pf as { difficulty_level?: string } | null)?.difficulty_level ?? 'gentle')
      .toLowerCase()
    // profile_foundation uses 'intense' as a synonym for 'firm' in some
    // legacy rows. Normalize.
    const normalized = lvl === 'intense' ? 'firm' : lvl
    if (normalized in INTENSITY_RANK && normalized !== 'off') {
      userIntensity = normalized as IntensityTier
    }
  } catch (_) { /* tolerate missing table in test envs */ }

  if (!force && (INTENSITY_RANK[userIntensity] ?? 0) < (INTENSITY_RANK[minIntensity] ?? 1)) {
    return jsonOk({ ok: true, skipped: 'intensity_below_threshold', userIntensity, minIntensity })
  }

  // ─── Gate 4: no open assignment ─────────────────────────────────────────
  const { data: openRows } = await supabase.from('public_dare_assignments')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'in_progress'])
    .limit(1)
  if ((openRows || []).length > 0 && !force) {
    return jsonOk({
      ok: true,
      skipped: 'open_assignment_exists',
      open_id: (openRows![0] as { id: string }).id,
    })
  }

  // ─── Gate 5: cadence recency window ─────────────────────────────────────
  const { data: latestAssn } = await supabase.from('public_dare_assignments')
    .select('assigned_at')
    .eq('user_id', userId)
    .order('assigned_at', { ascending: false })
    .limit(1)
  const latestAt = (latestAssn || [])[0]
    ? new Date(((latestAssn as Array<{ assigned_at: string }>)[0]).assigned_at)
    : null
  if (!force && !cadenceWindowOpen(cadence, latestAt)) {
    return jsonOk({ ok: true, skipped: 'cadence_window', cadence })
  }

  // ─── Build context ──────────────────────────────────────────────────────
  // Phase from feminine_self (sibling branch) — fall back to phase 1 if
  // unavailable. Phase 1 keeps the picker conservative which is the
  // safe default.
  let phase: Phase = 1
  try {
    const { data: fs } = await supabase.from('feminine_self')
      .select('transformation_phase')
      .eq('user_id', userId).maybeSingle()
    const p = Number((fs as { transformation_phase?: number } | null)?.transformation_phase ?? 1)
    if (Number.isFinite(p) && p >= 1 && p <= 7) phase = p as Phase
  } catch (_) { /* sibling branch may not be merged */ }

  // Today's mommy_mood affect for soft bias.
  const today = new Date().toISOString().slice(0, 10)
  const { data: mood } = await supabase.from('mommy_mood')
    .select('affect')
    .eq('user_id', userId).eq('mood_date', today).maybeSingle()
  const affect = (mood as { affect?: string } | null)?.affect ?? null

  // Recent assignments → cooldown set. 60d window covers any seed's
  // cooldown_days (max in the seed catalog is 28).
  const since60 = new Date(Date.now() - 60 * 86400_000).toISOString()
  const { data: recent } = await supabase.from('public_dare_assignments')
    .select('template_id, assigned_at')
    .eq('user_id', userId)
    .gte('assigned_at', since60)
    .limit(200)

  // Catalog read.
  const { data: rawCatalog, error: catalogErr } = await supabase.from('public_dare_templates')
    .select('id, kind, description, phase_min, phase_max, intensity_tier, requires_location_context, verification_kind, affect_bias, cooldown_days, active')
    .eq('active', true)
    .limit(500)
  if (catalogErr || !rawCatalog) {
    return jsonOk({ ok: false, error: 'catalog_read_failed', detail: catalogErr?.message ?? null }, 500)
  }
  const catalog = (rawCatalog as DareTemplate[])

  const inCooldown = buildCooldownSet(
    catalog,
    (recent as Array<{ template_id: string; assigned_at: string }>) ?? [],
  )

  // Did any recent assignment carry a location_context_acknowledged_at?
  // That serves as a 24h "I'm out today" hint when the body didn't
  // explicitly signal it.
  let locationContextAvailable = locationContextSignalled
  if (!locationContextAvailable) {
    const since24 = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { data: ackRows } = await supabase.from('public_dare_assignments')
      .select('id')
      .eq('user_id', userId)
      .gte('location_context_acknowledged_at', since24)
      .limit(1)
    locationContextAvailable = ((ackRows || []).length > 0)
  }

  const allowedKinds = (settings?.allowed_kinds ?? null) as DareKind[] | null

  const ctx: SelectionContext = {
    phase,
    minIntensity,
    userIntensity,
    affect,
    allowedKinds: allowedKinds && allowedKinds.length > 0 ? allowedKinds : null,
    inCooldown,
    locationContextAvailable,
  }

  const pick = pickDareTemplate(catalog, ctx)
  if (!pick) {
    return jsonOk({
      ok: true,
      skipped: 'no_eligible_template',
      phase,
      userIntensity,
      catalog_size: catalog.length,
      cooldown_size: inCooldown.size,
    })
  }

  // ─── Persist assignment + outreach in lockstep ──────────────────────────
  const dueBy = computeDueBy(cadence)

  const { data: assn, error: assnErr } = await supabase.from('public_dare_assignments').insert({
    user_id: userId,
    template_id: pick.template.id,
    due_by: dueBy.toISOString(),
    status: 'pending',
    intensity_at_assignment: userIntensity,
    phase_at_assignment: phase,
    affect_at_assignment: affect,
  }).select('id').single()

  if (assnErr || !assn) {
    return jsonOk({ ok: false, error: 'assignment_insert_failed', detail: assnErr?.message ?? null }, 500)
  }
  const assnId = (assn as { id: string }).id

  const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: pick.template.description,
    urgency: 'normal',
    trigger_reason: `public_dare:${assnId}`,
    scheduled_for: new Date().toISOString(),
    expires_at: dueBy.toISOString(),
    source: 'mommy_public_dare',
  }).select('id').single()

  if (outreach) {
    await supabase.from('public_dare_assignments')
      .update({ assigned_via_outreach_id: (outreach as { id: string }).id })
      .eq('id', assnId)
  }

  return jsonOk({
    ok: true,
    fired: 1,
    assignment_id: assnId,
    template_id: pick.template.id,
    kind: pick.template.kind,
    intensity_tier: pick.template.intensity_tier,
    verification_kind: pick.template.verification_kind,
    requires_location_context: pick.template.requires_location_context,
    phase,
    affect,
    reason: pick.reason,
  })
})
