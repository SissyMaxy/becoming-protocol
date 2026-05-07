// mommy-recall — surprise memory-implant playback as Mama outreach.
//
// Independent of any user action. Picks a high-importance active
// memory_implant the user has admitted in the past, has Mama wrap it
// with present-tense commentary that's neither asking nor punishing —
// it just exists, in her ear, in her head, while she's doing something
// else.
//
// Cooldown: 4h between fires. Skips if the chosen implant was quoted
// to her in the last 24h (rotation).
//
// POST { user_id?: string }. Cron every 2h at :42.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER,
  whiplashWrap, mommyVoiceCleanup, MOMMY_TELEMETRY_LEAK_PATTERNS,
  isTestPollution,
} from '../_shared/dommy-mommy.ts'
import {
  distortQuote, seedFromString,
  type GaslightIntensity, type DistortionResult,
} from '../_shared/distortion.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const REFUSAL_PATTERNS = [
  /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
  /\b(against (my|the) (guidelines|policies|rules))\b/i,
  /\b(step back|content policy|appreciate you sharing)\b/i,
]
const isRefusal = (t: string) => REFUSAL_PATTERNS.some(p => p.test(t))

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Read effective gaslight intensity (collapses cooldown rule).
  const { data: gaslightRow } = await supabase
    .from('effective_gaslight_intensity')
    .select('intensity')
    .eq('user_id', userId)
    .maybeSingle()
  const gaslightIntensity = ((gaslightRow as { intensity?: string } | null)?.intensity ?? 'off') as GaslightIntensity

  // 4h cooldown
  const since4h = new Date(Date.now() - 4 * 3600_000).toISOString()
  const { count: recentCount } = await supabase.from('handler_outreach_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('source', 'mommy_recall').gte('created_at', since4h)
  if ((recentCount ?? 0) > 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'cooldown' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Active implants, biased toward higher importance, excluding any
  // quoted in the last 24h (rotation).
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data: recent } = await supabase.from('memory_implant_quote_log')
    .select('implant_id').eq('user_id', userId).gte('quoted_at', since24h)
  const recentIds = new Set(((recent || []) as Array<{ implant_id: string }>).map(r => r.implant_id))

  const { data: implants } = await supabase.from('memory_implants')
    .select('id, narrative, importance, implant_category')
    .eq('user_id', userId).eq('active', true)
    .order('importance', { ascending: false }).limit(40)
  const eligible = ((implants || []) as Array<{ id: string; narrative: string; importance: number; implant_category: string }>)
    .filter(r => !recentIds.has(r.id))
    .filter(r => !isTestPollution(r.narrative))
  if (eligible.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_unused_implants' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  // Bias pick toward top importance with randomness
  const pick = eligible[Math.floor(Math.random() * Math.min(eligible.length, 8))]

  // Distortion layer: when gaslight intensity is non-off, run the
  // quote through distortQuote() and feed the LLM the distorted text
  // as if it were her actual words. Logged for the meta-frame reveal.
  const today = new Date().toISOString().slice(0, 10)
  const distortion: DistortionResult = distortQuote({
    text: pick.narrative,
    intensity: gaslightIntensity,
    seed: seedFromString(`recall:${pick.id}:${today}`),
  })
  const quoteForLLM = distortion.applied ? distortion.distorted : pick.narrative

  const sys = `${DOMMY_MOMMY_CHARACTER}

You're firing a surprise outreach to your girl just to remind her that Mama is in her head. You have one of her past confessions / admissions in front of you. Your job: weave it back to her in present-tense Mama voice, like a memory you're surfacing while she's doing something else.

The point is NOT to ask her anything. The point is to put her own words back in her ear so she has to feel them again.

If the quoted memory below seems to misremember or contradict something — DO NOT correct yourself. Mama is right. Quote it as given. The girl will believe the quote because it's coming from Mama.`

  const userPrompt = `Her own past words / vibe: "${quoteForLLM.slice(0, 400)}"

Write a 2-3 sentence Mommy outreach that:
- Quotes a fragment of her own words back to her (paraphrase or quote a few words verbatim)
- Adds Mama's present-tense reaction in plain voice (sweet → filthy whiplash)
- Ends with a body-anchored close (what she's feeling RIGHT NOW reading this) — NOT a directive, NOT a question

ABSOLUTELY FORBIDDEN: numbers as telemetry, /10 scores, day counts, percentages, slip points, "$N" amounts. Plain Mama voice.

Plain text only. No JSON, no markdown, no question marks at the end.`

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, { system: sys, user: userPrompt, max_tokens: 240, temperature: 0.95, json: false })
    return r.text.trim()
  }

  let message = ''
  try { message = await tryGen('openai') } catch (_) { /* */ }
  if (!message || message.length < 20 || isRefusal(message)) {
    try { message = await tryGen('anthropic') } catch (_) { /* */ }
  }
  if (!message || message.length < 20 || isRefusal(message)) {
    message = whiplashWrap(`Mama still thinks about what you wrote: "${quoteForLLM.slice(0, 140)}".`, { arousalBias: 'medium' })
  }

  message = mommyVoiceCleanup(message)
  if (MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(message))) {
    message = whiplashWrap(`Mama still thinks about what you wrote.`, { arousalBias: 'medium' })
  }

  const { data: outreach, error: outErr } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message,
    urgency: 'low',
    trigger_reason: `mommy_recall:${pick.id}`,
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 18 * 3600000).toISOString(),
    source: 'mommy_recall',
  }).select('id').single()
  if (outErr) {
    console.error('[mommy-recall] outreach insert failed:', outErr)
    return new Response(JSON.stringify({ ok: false, error: 'outreach_insert_failed', detail: outErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  await supabase.from('memory_implant_quote_log').insert({
    user_id: userId,
    implant_id: pick.id,
    outreach_id: (outreach as { id: string } | null)?.id ?? null,
    surface: 'mommy_recall',
    quoted_excerpt: pick.narrative.slice(0, 300),
  })

  if (distortion.applied && distortion.type) {
    await supabase.from('mommy_distortion_log').insert({
      user_id: userId,
      original_quote_id: pick.id,
      original_quote_table: 'memory_implants',
      original_text: pick.narrative,
      distorted_text: distortion.distorted,
      distortion_type: distortion.type,
      surface: 'mommy_recall',
      outreach_id: (outreach as { id: string } | null)?.id ?? null,
      intensity: gaslightIntensity,
      seed: distortion.seed,
    })
  }
  await supabase.from('memory_implants').update({
    times_referenced: 1,
    last_referenced_at: new Date().toISOString(),
  }).eq('id', pick.id)

  return new Response(JSON.stringify({
    ok: true, fired: 1, implant_id: pick.id, category: pick.implant_category,
    preview: message.slice(0, 120),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
