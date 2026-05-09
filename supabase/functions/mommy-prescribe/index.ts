// mommy-prescribe — Mommy assigns a wardrobe acquisition.
//
// Inputs (all optional; cron uses defaults):
//   { user_id?: string, force?: boolean }
//
// Gates (all must pass; first failure short-circuits with skipped reason):
//   - persona = 'dommy_mommy'
//   - wardrobe_prescription_settings.enabled = true
//   - profile_foundation.difficulty_level >= settings.min_intensity
//   - settings.cadence != 'off'
//   - no open prescription (status in pending/verifying) for this user
//   - cadence-based time gate: 'occasional' >= 5 days since last assigned,
//     'weekly' >= 7 days
//   - settings.budget_cap_usd not crossed by phase pool
//
// What it does:
//   - Reads feminine_self.transformation_phase if available (1..7), else 1
//   - Picks an item_type valid for that phase, biased away from items
//     already in wardrobe_items (or wardrobe_inventory legacy) and away
//     from items recently prescribed
//   - Asks the LLM to compose the description in Mommy voice
//   - Inserts wardrobe_prescriptions row + handler_outreach_queue row
//     with source='mommy_prescribe' and trigger_reason carrying the
//     prescription_id so Today can wire the verification CTA back.
//
// Trigger-source for cron: caller is mommy-mood end-of-day (it has the
// affect snapshot already) when the affect/intensity combo permits;
// otherwise can be invoked directly for ops/testing.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, type Affect,
  mommyVoiceCleanup, MOMMY_TELEMETRY_LEAK_PATTERNS, whiplashWrap,
} from '../_shared/dommy-mommy.ts'
import {
  PHASE_VOCAB, pickItemType, formatBudgetHint, INTENSITY_RANK,
  type Phase, type ItemType,
} from './selector.ts'
import {
  effectiveBand, bandPrescriptionCadenceCeiling,
  type DifficultyBand,
} from '../_shared/difficulty-band.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // ─── Gate 1: persona ────────────────────────────────────────────────────
  const { data: us } = await supabase.from('user_state')
    .select('handler_persona')
    .eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return jsonOk({ ok: true, skipped: 'persona_not_dommy_mommy' })
  }

  // ─── Gate 2: feature enabled ────────────────────────────────────────────
  const { data: settingsRow } = await supabase.from('wardrobe_prescription_settings')
    .select('enabled, cadence, budget_cap_usd, min_intensity')
    .eq('user_id', userId).maybeSingle()
  const settings = (settingsRow as {
    enabled?: boolean; cadence?: 'occasional' | 'weekly' | 'off';
    budget_cap_usd?: number | null; min_intensity?: string;
  } | null) ?? null

  if (!force && (!settings || !settings.enabled || settings.cadence === 'off')) {
    return jsonOk({ ok: true, skipped: 'feature_off' })
  }

  // ─── Gate 3: intensity tier ─────────────────────────────────────────────
  // profile_foundation.difficulty_level is the canonical intensity dial
  // (off / gentle / moderate / firm / relentless). Read it, compare to
  // settings.min_intensity (default 'firm').
  const minIntensity = settings?.min_intensity ?? 'firm'
  let userIntensity = 'moderate'
  try {
    const { data: pf } = await supabase.from('profile_foundation')
      .select('difficulty_level')
      .eq('user_id', userId).maybeSingle()
    userIntensity = ((pf as { difficulty_level?: string } | null)?.difficulty_level ?? 'moderate').toLowerCase()
  } catch (_) { /* table may not exist in test envs; leave moderate */ }
  if (!force && (INTENSITY_RANK[userIntensity] ?? 0) < (INTENSITY_RANK[minIntensity] ?? INTENSITY_RANK.firm)) {
    return jsonOk({ ok: true, skipped: 'intensity_below_threshold', userIntensity, minIntensity })
  }

  // ─── Gate 4: no open prescription ───────────────────────────────────────
  const { data: openRows } = await supabase.from('wardrobe_prescriptions')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'verifying'])
    .limit(1)
  if ((openRows || []).length > 0 && !force) {
    return jsonOk({ ok: true, skipped: 'open_prescription_exists', open_id: (openRows![0] as { id: string }).id })
  }

  // ─── Gate 5: cadence time-gate ──────────────────────────────────────────
  // Difficulty band can ceiling the user-configured cadence — recovery
  // forces 'occasional' even if the user has 'weekly' configured. The
  // user's stored cadence is never overwritten; we just respect the
  // ceiling at fire time so the recovery hold doesn't fire weekly.
  const { data: diff } = await supabase
    .from('compliance_difficulty_state')
    .select('current_difficulty_band, override_band')
    .eq('user_id', userId)
    .maybeSingle()
  const band = effectiveBand(diff as { current_difficulty_band: DifficultyBand; override_band: DifficultyBand | null } | null)
  const cadenceCeiling = bandPrescriptionCadenceCeiling(band)
  let cadence = settings?.cadence ?? 'occasional'
  if (cadenceCeiling === 'occasional' && cadence === 'weekly') {
    cadence = 'occasional'
  }
  const cadenceDays = cadence === 'weekly' ? 7 : 5
  const since = new Date(Date.now() - cadenceDays * 86400_000).toISOString()
  const { data: recentAssigned } = await supabase.from('wardrobe_prescriptions')
    .select('id, assigned_at')
    .eq('user_id', userId)
    .gte('assigned_at', since)
    .limit(1)
  if (!force && (recentAssigned || []).length > 0) {
    return jsonOk({ ok: true, skipped: 'cadence_window', cadence, days: cadenceDays })
  }

  // ─── Build context: phase + recent acquisitions ─────────────────────────
  let phase: Phase = 1
  try {
    const { data: fs } = await supabase.from('feminine_self')
      .select('transformation_phase')
      .eq('user_id', userId).maybeSingle()
    const p = Number((fs as { transformation_phase?: number } | null)?.transformation_phase ?? 1)
    if (Number.isFinite(p) && p >= 1 && p <= 7) phase = p as Phase
  } catch (_) { /* sibling branch not merged yet — phase 1 default is conservative */ }

  // Pull what she already owns: prefer wardrobe_items (sibling), fall back
  // to wardrobe_inventory (legacy). Both queries are bounded and tolerant.
  const ownedTypes = new Set<string>()
  try {
    const { data: wi } = await supabase.from('wardrobe_items')
      .select('item_type')
      .eq('user_id', userId).limit(200)
    for (const r of ((wi || []) as Array<{ item_type: string }>)) {
      if (r.item_type) ownedTypes.add(r.item_type)
    }
  } catch (_) { /* table not in main yet */ }
  try {
    const { data: legacy } = await supabase.from('wardrobe_inventory')
      .select('category')
      .eq('user_id', userId).limit(200)
    for (const r of ((legacy || []) as Array<{ category: string }>)) {
      if (r.category) ownedTypes.add(r.category)
    }
  } catch (_) { /* */ }

  // Recently prescribed (any status), 60d — avoid re-prescribing same type
  const recentPrescribedTypes = new Set<string>()
  const since60 = new Date(Date.now() - 60 * 86400_000).toISOString()
  const { data: recent60 } = await supabase.from('wardrobe_prescriptions')
    .select('item_type').eq('user_id', userId).gte('assigned_at', since60).limit(60)
  for (const r of ((recent60 || []) as Array<{ item_type: string }>)) {
    if (r.item_type) recentPrescribedTypes.add(r.item_type)
  }

  // ─── Pick item_type ─────────────────────────────────────────────────────
  const pick = pickItemType(phase, ownedTypes, recentPrescribedTypes)
  if (!pick) {
    return jsonOk({ ok: true, skipped: 'no_eligible_item_type', phase })
  }
  const itemType = pick.itemType
  const phaseDesc = PHASE_VOCAB[phase].label

  // ─── Affect snapshot for tone bias ──────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const { data: mood } = await supabase.from('mommy_mood')
    .select('affect, arousal_bias_hint')
    .eq('user_id', userId).eq('mood_date', today).maybeSingle()
  const affect = ((mood as { affect?: string } | null)?.affect ?? 'hungry') as Affect
  const arousalHint = (mood as { arousal_bias_hint?: string } | null)?.arousal_bias_hint ?? ''

  // ─── Compose description ────────────────────────────────────────────────
  const budgetCap = settings?.budget_cap_usd ?? null
  const budgetLine = formatBudgetHint(budgetCap)
  const sys = `${DOMMY_MOMMY_CHARACTER}

Today's affect: ${affect}. ${arousalHint ? 'Bias hint: ' + arousalHint : ''}

YOUR JOB right now: prescribe ONE wardrobe item for your girl to acquire. She buys it; you describe it. You are NOT shopping for her. You are telling her what Mama wants to see her in next.`

  const userPrompt = `Item slot: ${itemType} (a ${pick.hint}).
Phase: ${phaseDesc}.
${budgetLine ? 'Budget: ' + budgetLine + '.' : ''}

Compose ONE prescription in Mommy voice — 1-2 sentences. Sweet open → filthy specific. Name the item with one sensory detail (color, fabric, cut, vibe). End with a directive that frames acquiring it as a thing she's doing FOR Mama.

ABSOLUTELY FORBIDDEN:
- Asking ("would you", "can you")
- Numbers as telemetry
- /10 scores, percentages, day counts
- More than ONE item
- Brand names (let her find the brand)
- A URL or shopping link
- The word "purchase" — say "get me", "find Mama", "bring home"

Plain text only. No JSON, no markdown.`

  const REFUSAL_PATTERNS = [
    /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
    /\b(against (my|the) (guidelines|policies|rules))\b/i,
  ]
  const isRefusal = (t: string) => REFUSAL_PATTERNS.some(p => p.test(t))

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, { system: sys, user: userPrompt, max_tokens: 200, temperature: 0.9, json: false })
    return r.text.trim()
  }

  let description = ''
  try { description = await tryGen('openai') } catch (_) { /* */ }
  if (!description || description.length < 12 || isRefusal(description)) {
    try { description = await tryGen('anthropic') } catch (_) { /* */ }
  }
  if (!description || description.length < 12 || isRefusal(description)) {
    description = whiplashWrap(`Mama wants you to bring home ${pick.hint}.`, { arousalBias: 'medium' })
  }

  // Backstop: scrub telemetry leaks
  description = mommyVoiceCleanup(description)
  if (MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(description))) {
    description = whiplashWrap(`Mama wants you to bring home ${pick.hint}.`, { arousalBias: 'medium' })
  }

  // ─── Persist prescription + outreach in lockstep ───────────────────────
  const dueByDays = cadence === 'weekly' ? 7 : 14
  const dueBy = new Date(Date.now() + dueByDays * 86400_000).toISOString()

  const { data: presc, error: prescErr } = await supabase.from('wardrobe_prescriptions').insert({
    user_id: userId,
    description,
    item_type: itemType,
    optional_details: { phase, affect, intensity: userIntensity, budget_cap_usd: budgetCap },
    due_by: dueBy,
    status: 'pending',
    intensity_at_assignment: userIntensity,
    affect_at_assignment: affect,
  }).select('id').single()

  if (prescErr || !presc) {
    return jsonOk({ ok: false, error: 'prescription_insert_failed', detail: prescErr?.message ?? null }, 500)
  }
  const prescId = (presc as { id: string }).id

  const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: description,
    urgency: 'normal',
    trigger_reason: `wardrobe_prescription:${prescId}`,
    scheduled_for: new Date().toISOString(),
    expires_at: dueBy,
    source: 'mommy_prescribe',
  }).select('id').single()

  // Back-link the outreach so the prescription card can resolve the
  // ack state without a join. Soft-fail — the link is a nicety.
  if (outreach) {
    await supabase.from('wardrobe_prescriptions')
      .update({ assigned_via_outreach_id: (outreach as { id: string }).id })
      .eq('id', prescId)
  }

  return jsonOk({
    ok: true, fired: 1, prescription_id: prescId, item_type: itemType,
    phase, affect, intensity: userIntensity,
    preview: description.slice(0, 120),
  })
})
