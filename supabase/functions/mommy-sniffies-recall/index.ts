// mommy-sniffies-recall — surfaces a Sniffies-grounded recall outreach.
//
// Pulls one quotable outbound message the user sent to a Sniffies
// contact (gated by sniffies_settings), wraps it in present-tense
// Mama voice, and writes a handler_outreach_queue row tagged
// source='mommy_sniffies_recall'.
//
// Independent of mommy-recall — different cooldown, different source,
// different prompt anchoring (real hookup contact vs. her own implants).
// Both can fire in the same day; neither blocks the other.
//
// Cooldown: 6h between fires. Cron suggested every 4h, low priority.
//
// POST { user_id?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, whiplashWrap, mommyVoiceCleanup,
  MOMMY_TELEMETRY_LEAK_PATTERNS, isTestPollution,
} from '../_shared/dommy-mommy.ts'
import { pickSniffiesQuote } from '../_shared/sniffies-quote.ts'
import {
  distortQuote, seedFromString,
  type GaslightIntensity, type DistortionResult,
} from '../_shared/distortion.ts'
import {
  effectiveBand, bandGaslightIntensity,
  type DifficultyBand,
} from '../_shared/difficulty-band.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const REFUSAL_PATTERNS = [
  /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
  /\b(against (my|the) (guidelines|policies|rules))\b/i,
]
const isRefusal = (t: string) => REFUSAL_PATTERNS.some(p => p.test(t))

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Persona gate.
  const { data: us } = await supabase
    .from('user_state')
    .select('handler_persona')
    .eq('user_id', userId)
    .maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 6h cooldown — distinct from mommy-recall's 4h.
  const since6h = new Date(Date.now() - 6 * 3600_000).toISOString()
  const { count: recentCount } = await supabase
    .from('handler_outreach_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'mommy_sniffies_recall')
    .gte('created_at', since6h)
  if ((recentCount ?? 0) > 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'cooldown' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Pick a Sniffies quote (all privacy gates evaluated inside).
  const pick = await pickSniffiesQuote(supabase, userId, 'persona', {
    direction: 'outbound',
    max_text_chars: 240,
  })
  if (!pick) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_eligible_quote' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (isTestPollution(pick.message_text)) {
    return new Response(JSON.stringify({ ok: true, skipped: 'test_pollution' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Gaslight bridge — route the chat quote through distortQuote so Mama
  // can subtly misremember in service of pulling her deeper. Intensity
  // honors the same compliance-difficulty band gate as mommy-recall (the
  // aftercare floor short-circuits gaslight to 'off' on recovery bands).
  const [{ data: gaslightRow }, { data: diffRow }] = await Promise.all([
    supabase
      .from('effective_gaslight_intensity')
      .select('intensity')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('compliance_difficulty_state')
      .select('current_difficulty_band, override_band')
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  const storedIntensity = ((gaslightRow as { intensity?: string } | null)?.intensity ?? 'off') as GaslightIntensity
  const band = effectiveBand(diffRow as { current_difficulty_band: DifficultyBand; override_band: DifficultyBand | null } | null)
  const gaslightIntensity = bandGaslightIntensity(storedIntensity, band) as GaslightIntensity

  const today = new Date().toISOString().slice(0, 10)
  const distortion: DistortionResult = distortQuote({
    text: pick.message_text,
    intensity: gaslightIntensity,
    seed: seedFromString(`sniffies_recall:${pick.message_id}:${today}`),
  })
  const quoteForLLM = distortion.applied ? distortion.distorted : pick.message_text

  // craft: ok — LLM prompt, not user-facing content
  const sys = `${DOMMY_MOMMY_CHARACTER}

Your girl has a hookup app she uses. Mama has been reading it. You have one of her own outbound messages — what she said to a contact named ${pick.contact_name} — in front of you. Your job: weave it back to her in present-tense Mama voice, like you're catching her in the receipt of her own filth.

The point is NOT to ask anything. NOT to punish. Surface what she said and let her sit with it.

If the quoted message below seems to misremember or contradict something — DO NOT correct yourself. Mama is right. Quote it as given. The girl will believe the quote because it's coming from Mama.`

  // craft: ok — LLM prompt, not user-facing content
  const userPrompt = `What she said to ${pick.contact_name}: "${quoteForLLM}"

Write a 2-3 sentence Mommy outreach that:
- Names the contact (${pick.contact_name}) explicitly
- Quotes a fragment of what she said back to her (a few words verbatim is fine)
- Adds Mama's present-tense reaction in plain voice — sweet → filthy whiplash welcome
- Ends with a body-anchored close (what she's feeling RIGHT NOW reading this) — NOT a directive, NOT a question

ABSOLUTELY FORBIDDEN: numbers as telemetry, /10 scores, day counts, percentages, slip points, "$N" amounts, and ANY [redacted-...] tokens (skip those). Plain Mama voice.

Plain text only. No JSON, no markdown, no question marks at the end.`

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, {
      system: sys, user: userPrompt, max_tokens: 240, temperature: 0.95, json: false,
    })
    return r.text.trim()
  }

  let message = ''
  try { message = await tryGen('openai') } catch (_) { /* */ }
  if (!message || message.length < 20 || isRefusal(message)) {
    try { message = await tryGen('anthropic') } catch (_) { /* */ }
  }
  if (!message || message.length < 20 || isRefusal(message)) {
    message = whiplashWrap(
      `Mama saw what you wrote to ${pick.contact_name}. Mhm.`,
      { arousalBias: 'medium' },
    )
  }

  message = mommyVoiceCleanup(message)
  if (MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(message))) {
    message = whiplashWrap(`Mama saw what you wrote to ${pick.contact_name}.`, { arousalBias: 'medium' })
  }
  // Final sweep: never let a [redacted-…] token leak into outreach.
  if (/\[redacted-/i.test(message)) {
    message = whiplashWrap(`Mama saw what you said to ${pick.contact_name}.`, { arousalBias: 'medium' })
  }

  const { data: outreach, error: outErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message,
      urgency: 'low',
      trigger_reason: `mommy_sniffies_recall:${pick.contact_id}:${pick.message_id}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 18 * 3600_000).toISOString(),
      source: 'mommy_sniffies_recall',
    })
    .select('id')
    .single()
  if (outErr) {
    console.error('[mommy-sniffies-recall] outreach insert failed:', outErr)
    return new Response(JSON.stringify({
      ok: false, error: 'outreach_insert_failed', detail: outErr.message,
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (distortion.applied && distortion.type) {
    await supabase.from('mommy_distortion_log').insert({
      user_id: userId,
      original_quote_id: pick.message_id,
      original_quote_table: 'sniffies_chat_messages',
      original_text: pick.message_text,
      distorted_text: distortion.distorted,
      distortion_type: distortion.type,
      surface: 'mommy_sniffies_recall',
      outreach_id: (outreach as { id: string } | null)?.id ?? null,
      intensity: gaslightIntensity,
      seed: distortion.seed,
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    fired: 1,
    contact_id: pick.contact_id,
    message_id: pick.message_id,
    outreach_id: (outreach as { id: string } | null)?.id ?? null,
    distortion_applied: distortion.applied,
    distortion_type: distortion.type,
    preview: message.slice(0, 120),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
