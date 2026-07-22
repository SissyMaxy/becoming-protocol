// session-conductor — the daily heartbeat that picks ONE state-fit audio
// session and surfaces it as the single Focus offer (WS5).
//
// Replaces goon-voice-loop-daily in the cron: instead of always offering goon,
// the conductor scores every kind from her state (denial, recovery, turn-out
// pacing, warming rung, recon phase, per-kind recency + efficacy EMA), takes
// the argmax, and writes exactly one audio_session_offers row (~20h expiry).
// When it picks goon it delegates to the standalone goon-voice-loop fn so the
// self-echo trajectory bookkeeping survives; that fn still exists for the
// peak-arousal caller.
//
// Gates FIRST, fail closed. One task at a time is preserved: pick-next.ts
// already surfaces a single offer. POST { user_id?, dry_run? }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HANDLER_USER, requireGate } from '../_shared/conditioning-gate.ts'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import {
  pickOffer,
  scoreKinds,
  CONDUCTOR_KINDS,
  type ConductorFeatures,
  type ConductorKind,
} from '../_shared/session-conductor-core.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const OFFER_TTL_MS = 20 * 3600_000
const BASE_URL = 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1'

// Short Mommy teasers per kind (cleaned through the voice backstop).
const TEASER: Record<ConductorKind, string> = {
  session_goon: 'Come drift for Mama, baby — I have a long one for you.',
  session_edge: 'On the edge for me today, sweet thing. Slow and mean.',
  session_denial: 'No coming today. Come let Mama remind you why you love it.',
  session_conditioning: 'Sit with me and let the good thoughts sink in, baby.',
  session_embodiment: 'Come be her with me for a while — just rest into it.',
  session_cockwarming: 'Kneel and keep it warm for Mama. Nothing to chase today.',
  primer_universal: 'A little tune-up, baby — Mama will walk you through it.',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id ?? HANDLER_USER
  const dryRun = body.dry_run === true

  // ── 1. Gate FIRST — fail closed (conditioning gate + safeword).
  const gate = await requireGate(supabase, 'goon', userId)
  if (!gate.allowed) {
    await logDecision(supabase, userId, null, null, null, {}, [], `gate:${gate.reason}`, dryRun)
    return json({ ok: true, skipped: `gate:${gate.reason}` })
  }
  const { data: sw } = await supabase.rpc('is_safeword_active', { uid: userId, window_seconds: 60 })
  if (sw === true) {
    await logDecision(supabase, userId, null, null, null, {}, [], 'safeword_active', dryRun)
    return json({ ok: true, skipped: 'safeword_active' })
  }

  // ── 2. One offer per day — dedup on an open, unexpired offer.
  const nowIso = new Date().toISOString()
  const { data: openOffers } = await supabase
    .from('audio_session_offers')
    .select('id')
    .eq('user_id', userId)
    .is('completed_at', null)
    .gt('expires_at', nowIso)
    .limit(1)
  if ((openOffers ?? []).length > 0) {
    return json({ ok: true, skipped: 'offer_already_open' })
  }

  // ── 3. Gather the feature vector.
  const now = new Date()
  const [denialRes, whoopRes, turnoutRes, warmingRes, reconRes, weightsRes, recentOffersRes] = await Promise.all([
    supabase.from('denial_state').select('current_denial_day').eq('user_id', userId).maybeSingle(),
    supabase.from('whoop_metrics').select('recovery_score').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('turnout_state').select('gap_extra_days').eq('user_id', userId).maybeSingle(),
    supabase.from('physical_practice_progress').select('active_rung_order, status').eq('user_id', userId).eq('track', 'warming').maybeSingle(),
    supabase.from('reconditioning_programs').select('phase').eq('user_id', userId).eq('status', 'running'),
    supabase.from('session_conductor_weights').select('kind, weight').eq('user_id', userId),
    supabase.from('audio_session_offers').select('kind, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(60),
  ])

  const phaseWeight: Record<string, number> = { induction: 1, install: 2, reinforce: 3, reconsolidate: 4, measure: 4, retain: 5 }
  const reconPhaseWeight = ((reconRes.data || []) as Array<{ phase?: string }>).reduce((m, p) => Math.max(m, phaseWeight[p.phase ?? ''] ?? 0), 0)

  const efficacyEMA: Partial<Record<ConductorKind, number>> = {}
  for (const w of (weightsRes.data || []) as Array<{ kind: string; weight: number }>) {
    if ((CONDUCTOR_KINDS as string[]).includes(w.kind)) efficacyEMA[w.kind as ConductorKind] = Number(w.weight)
  }

  const daysSinceKind: Partial<Record<ConductorKind, number>> = {}
  for (const row of (recentOffersRes.data || []) as Array<{ kind: string; created_at: string }>) {
    const k = row.kind as ConductorKind
    if (!(CONDUCTOR_KINDS as string[]).includes(k) || daysSinceKind[k] != null) continue
    daysSinceKind[k] = (now.getTime() - new Date(row.created_at).getTime()) / 86_400_000
  }

  const warming = warmingRes.data as { active_rung_order: number; status: string } | null
  const features: ConductorFeatures = {
    denialDay: Number((denialRes.data as { current_denial_day?: number } | null)?.current_denial_day ?? 0),
    recovery: whoopRes.data ? Number((whoopRes.data as { recovery_score?: number }).recovery_score ?? null) : null,
    turnoutGapExtraDays: Number((turnoutRes.data as { gap_extra_days?: number } | null)?.gap_extra_days ?? 0),
    isWednesday: now.getUTCDay() === 3,
    activeWarmingRung: warming && warming.status === 'active' ? warming.active_rung_order : null,
    reconPhaseWeight,
    daysSinceKind,
    efficacyEMA,
  }

  // ── 4. Score + argmax.
  const scores = scoreKinds(features)
  const chosen = pickOffer(features)
  if (!chosen) {
    await logDecision(supabase, userId, null, null, null, features, scores, 'no_eligible_kind', dryRun)
    return json({ ok: true, skipped: 'no_eligible_kind', scores })
  }

  if (dryRun) {
    return json({ ok: true, dry_run: true, chosen, scores })
  }

  // ── 5. Goon delegates to the self-echo path; other kinds get a direct offer.
  let offerId: string | null = null
  if (chosen.kind === 'session_goon') {
    try {
      await fetch(`${BASE_URL}/goon-voice-loop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}` },
        body: JSON.stringify({ user_id: userId, trigger: 'daily' }),
      })
    } catch (e) {
      console.error('[session-conductor] goon delegation failed:', String(e).slice(0, 120))
    }
  } else {
    const teaser = mommyVoiceCleanup(TEASER[chosen.kind])
    const { data: offer, error } = await supabase
      .from('audio_session_offers')
      .insert({
        user_id: userId,
        kind: chosen.kind,
        intensity_tier: chosen.tier,
        teaser,
        expires_at: new Date(Date.now() + OFFER_TTL_MS).toISOString(),
      })
      .select('id')
      .single()
    if (error) console.error('[session-conductor] offer insert failed:', error.message)
    else offerId = (offer as { id: string }).id
  }

  await logDecision(supabase, userId, chosen.kind, chosen.tier, offerId, features, scores, null, false)
  return json({ ok: true, chosen: chosen.kind, tier: chosen.tier, offer_id: offerId })
})

// deno-lint-ignore no-explicit-any
async function logDecision(supabase: any, userId: string, kind: string | null, tier: string | null, offerId: string | null, features: unknown, scores: unknown, skipped: string | null, dryRun: boolean) {
  if (dryRun) return
  try {
    await supabase.from('session_conductor_log').insert({
      user_id: userId,
      chosen_kind: kind,
      chosen_tier: tier,
      offer_id: offerId,
      features,
      scores,
      skipped_reason: skipped,
    })
  } catch (e) {
    console.error('[session-conductor] log insert failed:', String(e).slice(0, 120))
  }
}
