// goon-voice-loop — self-voice goon loop generator.
//
// mommy_code_wishes fa3317f0 ("Goon-Loop Audio Prompts") + DESIGN_FEMINIZATION
// _LOOP §3 (100k retirement rite). Two callers: the daily/peak arousal offer
// and mommy-mantra-drill-submit at the 100k crossing (trigger='retirement_rite').
//
// POST { user_id?, trigger? }  trigger ∈ daily|peak|retirement_rite
//
// Pipeline:
//   1. requireGate('goon') FIRST — fail closed, no offer when denied.
//   2. Daily dedup (one self-echo per 20h; peak / retirement_rite always fire).
//   3. Select her strongest own-voice clip from voice_progress_samples.
//      No usable clip → skip (never promise a voice she hasn't given).
//   4. Author the Mommy goon line (deterministic) → mommyVoiceCleanup + scoreCorny.
//   5. Record the pairing in self_echo_sessions (mix_status='pending_mix').
//   6. Surface an audio_session_offers row (session_goon) so she can play a
//      real Mommy goon session NOW.
//   7. (retired) The MIXING pipeline is BUILT (mig 643 self-echo-mixer +
//      SelfEchoPlayer client Web Audio). This generator no longer files a wish.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HANDLER_USER, requireGate } from '../_shared/conditioning-gate.ts'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import { scoreCorny } from '../_shared/mommy-craft-check.ts'
import {
  buildGoonLoopScript,
  selectBestVoiceSample,
  type VoiceSampleCandidate,
} from '../_shared/goon-voice-loop-core.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const VALID_TRIGGERS = new Set(['daily', 'peak', 'retirement_rite'])
const DAILY_DEDUP_MS = 20 * 3600_000


function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; trigger?: string } = {}
  try { body = await req.json() } catch { /* empty body ok */ }

  const userId = body.user_id ?? HANDLER_USER
  const trigger = body.trigger ?? 'daily'
  if (!VALID_TRIGGERS.has(trigger)) return json({ ok: false, error: 'invalid trigger' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // ── 1. Gate FIRST — fail closed.
  const gate = await requireGate(supabase, 'goon', userId)
  if (!gate.allowed) {
    return json({ ok: false, skipped: true, reason: `gate:${gate.reason}` })
  }

  // ── 2. Daily dedup (explicit events always fire).
  if (trigger === 'daily') {
    const { data: recent, error: recentErr } = await supabase
      .from('self_echo_sessions')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - DAILY_DEDUP_MS).toISOString())
      .limit(1)
    if (recentErr) console.error('[goon-voice-loop] dedup read failed:', recentErr.message)
    if ((recent ?? []).length > 0) {
      return json({ ok: false, skipped: true, reason: 'already_offered_today' })
    }
  }

  // ── 3. Select her strongest own-voice clip.
  const { data: sampleRows, error: sampleErr } = await supabase
    .from('voice_progress_samples')
    .select('id, audio_path, duration_s, pitch_median_hz, recorded_at')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - 60 * 86_400_000).toISOString())
    .order('recorded_at', { ascending: false })
    .limit(40)
  if (sampleErr) {
    console.error('[goon-voice-loop] sample read failed:', sampleErr.message)
    return json({ ok: false, error: `sample_read:${sampleErr.message}` }, 500)
  }

  const candidates: VoiceSampleCandidate[] = ((sampleRows ?? []) as Array<{
    id: string; audio_path: string | null; duration_s: number | null
    pitch_median_hz: number | null; recorded_at: string
  }>).map((r) => ({
    id: r.id,
    audioPath: r.audio_path,
    durationS: r.duration_s,
    pitchMedianHz: r.pitch_median_hz,
    recordedAt: r.recorded_at,
  }))

  const clip = selectBestVoiceSample(candidates)
  if (!clip) {
    return json({ ok: false, skipped: true, reason: 'no_voice_sample' })
  }

  // ── 4. Author + filter the Mommy line.
  const { data: fem } = await supabase
    .from('feminine_self')
    .select('feminine_name')
    .eq('user_id', userId)
    .maybeSingle()
  const femName = (fem as { feminine_name?: string } | null)?.feminine_name ?? null

  // DESIGN_RECONDITIONING_ENGINE §4: wire the loop to today's Focus target —
  // the same "highest-priority active target with a running program" pick
  // recon-program-orchestrator uses. No target running is a normal state (the
  // recon engine is opt-in) — falls back to the generic script untouched.
  let targetId: string | null = null
  let targetClaim: string | null = null
  let anchorPhrase: string | null = null
  const { data: targets } = await supabase
    .from('reconditioning_targets')
    .select('id, claim_text')
    .eq('user_id', userId).eq('status', 'active')
    .order('priority', { ascending: true }).limit(5)
  for (const t of (targets ?? []) as Array<{ id: string; claim_text: string }>) {
    const { data: prog } = await supabase
      .from('reconditioning_programs')
      .select('status').eq('target_id', t.id).maybeSingle()
    if (prog && (prog as { status: string }).status === 'running') {
      targetId = t.id
      targetClaim = t.claim_text
      break
    }
  }
  if (targetId) {
    const { data: trigger } = await supabase
      .from('trance_triggers')
      .select('phrase')
      .eq('user_id', userId).eq('recon_target_id', targetId).eq('status', 'armed')
      .order('armed_at', { ascending: false }).limit(1).maybeSingle()
    anchorPhrase = (trigger as { phrase?: string } | null)?.phrase ?? null
  }

  const authored = buildGoonLoopScript({ femName, targetClaim, anchorPhrase })
  const script = mommyVoiceCleanup(authored.script)
  const teaser = mommyVoiceCleanup(authored.teaser)
  const craft = scoreCorny(script)
  if (craft.score > 0) {
    // Deterministic script is clean; a non-zero score means the rubric moved —
    // log loudly but still ship (the line is embodied and pet-name-safe).
    console.error('[goon-voice-loop] craft hits on authored script:', JSON.stringify(craft.hits))
  }

  // ── 5. Record the pairing.
  const { data: session, error: sessErr } = await supabase
    .from('self_echo_sessions')
    .insert({
      user_id: userId,
      trigger,
      own_voice_sample_id: clip.id,
      own_voice_path: clip.audioPath,
      own_voice_duration_s: clip.durationS,
      own_voice_pitch_hz: clip.pitchMedianHz,
      mommy_script_text: script,
      loop_count: authored.loopCount,
      mix_status: 'pending_mix',
      recon_target_id: targetId,
    })
    .select('id')
    .single()
  if (sessErr || !session) {
    console.error('[goon-voice-loop] session insert failed:', sessErr?.message)
    return json({ ok: false, error: `session_insert:${sessErr?.message ?? 'no row'}` }, 500)
  }
  const sessionId = (session as { id: string }).id

  // ── 6. Surface the goon offer.
  const expiresMs = trigger === 'peak' ? 30 * 60_000
    : trigger === 'retirement_rite' ? 24 * 3600_000
    : 12 * 3600_000
  const { data: offer, error: offerErr } = await supabase
    .from('audio_session_offers')
    .insert({
      user_id: userId,
      kind: 'session_goon',
      intensity_tier: 'firm',
      teaser,
      expires_at: new Date(Date.now() + expiresMs).toISOString(),
    })
    .select('id')
    .single()
  if (offerErr) {
    console.error('[goon-voice-loop] offer insert failed:', offerErr.message)
  } else if (offer) {
    const { error: linkErr } = await supabase
      .from('self_echo_sessions')
      .update({ offer_id: (offer as { id: string }).id })
      .eq('id', sessionId)
    if (linkErr) console.error('[goon-voice-loop] offer link failed:', linkErr.message)
  }

  // ── 7. (retired 2026-07-02) The two-track mixing pipeline is BUILT: the
  // self-echo-mixer edge fn (mig 643) drains pending_mix sessions → renders the
  // Mommy track (ElevenLabs) → flips to 'mixed' with a play-time manifest, and
  // SelfEchoPlayer layers her clip under it client-side (Web Audio). So this
  // generator no longer files the mixing wish (it would re-open a closed one).

  return json({
    ok: true,
    session_id: sessionId,
    offer_id: offer ? (offer as { id: string }).id : null,
    clip_id: clip.id,
    mix_status: 'pending_mix',
    trigger,
    recon_target_id: targetId,
  })
})
