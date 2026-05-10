// mommy-mantra — daily mantra delivery.
//
// Picks one mantra a day (per user, persona-gated to dommy_mommy) from
// the mommy_mantras catalog, weighted by the user's current affect, phase
// and intensity ceiling, deduped against recent deliveries. Inserts into
// handler_outreach_queue (so the in-flight TTS pipe can render it) AND
// logs to mantra_delivery_log.
//
// Selection logic is pure and lives in _shared/mantra-select.ts so unit
// tests can exercise it without DB / LLM. This entry point is the thin
// IO shell.
//
// Cron: daily. Idempotent within the day — second invocation skips if
// today already has a queued/spoken mantra row.
//
// POST { user_id?: string, intensity?: 'gentle'|'firm'|'cruel' }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  pickMantra, phaseToMantraScale,
  type MantraRow, type MantraIntensity, type MantraSelectContext,
} from '../_shared/mantra-select.ts'
import {
  effectiveBand, bandMantraCeiling,
  type DifficultyBand,
} from '../_shared/difficulty-band.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const DEDUP_WINDOW_DAYS = 14

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function isMantraIntensity(v: unknown): v is MantraIntensity {
  return v === 'gentle' || v === 'firm' || v === 'cruel'
}

const TIER_RANK: Record<MantraIntensity, number> = { gentle: 0, firm: 1, cruel: 2 }
function capIntensity(requested: MantraIntensity, ceiling: MantraIntensity): MantraIntensity {
  return TIER_RANK[requested] <= TIER_RANK[ceiling] ? requested : ceiling
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; intensity?: string } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const intensityOverride = isMantraIntensity(body.intensity) ? body.intensity : null

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Persona gate
  const { data: us } = await supabase.from('user_state')
    .select('handler_persona, current_phase')
    .eq('user_id', userId).maybeSingle()
  const persona = (us as { handler_persona?: string } | null)?.handler_persona
  if (persona !== 'dommy_mommy') {
    return jsonResponse({ ok: true, skipped: 'persona_not_dommy_mommy' })
  }

  // Idempotent within the day — if any mantra already delivered today, no-op
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const { count: alreadyToday } = await supabase.from('mantra_delivery_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('delivered_at', startOfDay.toISOString())
  if ((alreadyToday ?? 0) > 0) {
    return jsonResponse({ ok: true, skipped: 'already_today' })
  }

  // Today's affect (defaults to 'patient' if mommy-mood hasn't run yet)
  const today = new Date().toISOString().slice(0, 10)
  const { data: mood } = await supabase.from('mommy_mood')
    .select('affect').eq('user_id', userId).eq('mood_date', today).maybeSingle()
  const affect = (mood as { affect?: string } | null)?.affect ?? 'patient'

  const phase = phaseToMantraScale((us as { current_phase?: number } | null)?.current_phase)

  // Intensity ceiling — body override beats compliance band beats default.
  // Recovery band hard-caps to 'gentle' regardless of any other input.
  const { data: diff } = await supabase
    .from('compliance_difficulty_state')
    .select('current_difficulty_band, override_band')
    .eq('user_id', userId)
    .maybeSingle()
  const band = effectiveBand(diff as { current_difficulty_band: DifficultyBand; override_band: DifficultyBand | null } | null)
  const bandCeiling: MantraIntensity = bandMantraCeiling(band)
  const intensity: MantraIntensity = intensityOverride
    ? capIntensity(intensityOverride, bandCeiling)
    : bandCeiling

  // Recent delivery map for the dedup window
  const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86_400_000).toISOString()
  const { data: recent } = await supabase.from('mantra_delivery_log')
    .select('mantra_id, delivered_at')
    .eq('user_id', userId).gte('delivered_at', since)
    .order('delivered_at', { ascending: false })
  const recentlyDelivered: Record<string, string> = {}
  for (const r of (recent || []) as Array<{ mantra_id: string; delivered_at: string }>) {
    if (!recentlyDelivered[r.mantra_id]) recentlyDelivered[r.mantra_id] = r.delivered_at
  }

  // Catalog
  const { data: catalog, error: catErr } = await supabase.from('mommy_mantras')
    .select('id, text, affect_tags, phase_min, phase_max, intensity_tier, category, voice_settings_hint')
    .eq('active', true)
  if (catErr) {
    console.error('[mommy-mantra] catalog fetch failed:', catErr)
    return jsonResponse({ ok: false, error: 'catalog_fetch_failed', detail: catErr.message }, 500)
  }
  const rows = (catalog || []) as MantraRow[]
  if (rows.length === 0) {
    return jsonResponse({ ok: true, skipped: 'empty_catalog' })
  }

  const ctx: MantraSelectContext = {
    affect, phase, intensity,
    recentlyDelivered, dedupWindowDays: DEDUP_WINDOW_DAYS,
  }
  const picked = pickMantra(rows, ctx)
  if (!picked) {
    return jsonResponse({ ok: true, skipped: 'no_eligible_mantra', affect, phase, intensity })
  }

  // Queue as outreach. trigger_reason carries 'mantra:<id>' so the future
  // TTS pipe can route on it without us needing to add a column.
  const { data: outreach, error: outErr } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: picked.text,
    urgency: 'low',
    trigger_reason: `mommy_mantra:${picked.id}`,
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 18 * 3600_000).toISOString(),
    source: 'mommy_mantra',
  }).select('id').single()
  if (outErr) {
    console.error('[mommy-mantra] outreach insert failed:', outErr)
    return jsonResponse({ ok: false, error: 'outreach_insert_failed', detail: outErr.message }, 500)
  }

  const { error: logErr } = await supabase.from('mantra_delivery_log').insert({
    user_id: userId,
    mantra_id: picked.id,
    outreach_id: (outreach as { id: string } | null)?.id ?? null,
    affect_at_time: affect,
    phase_at_time: phase,
    intensity_at_time: intensity,
    status: 'queued',
  })
  if (logErr) {
    console.error('[mommy-mantra] delivery log insert failed:', logErr)
    // Outreach already inserted — don't fail the whole call
  }

  return jsonResponse({
    ok: true,
    fired: 1,
    mantra_id: picked.id,
    category: picked.category,
    intensity: picked.intensity_tier,
    affect, phase,
    preview: picked.text,
  })
})
