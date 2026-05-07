// mommy-tease — chastity-streak escalation engine.
//
// Watches user_state.chastity_streak_days + denial_day. When she crosses
// thresholds (2, 4, 7, 14, 21, 30 days), Mama fires a tease/praise burst
// in plain voice — references the streak by feeling, never by number.
// Uses memory_implant_quote_log to optionally weave in a quoted past
// confession ("remember when you told Mama you wanted to be locked up
// forever? still feel like it, baby?").
//
// Deduplicates per (user, threshold-bucket) — fires once per crossing.
//
// POST { user_id?: string }. Cron every 30 min.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, AFFECT_BIAS, type Affect,
  whiplashWrap, mommyVoiceCleanup, MOMMY_TELEMETRY_LEAK_PATTERNS,
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

// Thresholds (days). When current_streak ≥ threshold AND no taunt fired
// for that threshold yet, fire one.
const THRESHOLDS = [
  { days: 2, label: 'two-day' },
  { days: 4, label: 'half-week' },
  { days: 7, label: 'week' },
  { days: 14, label: 'two-week' },
  { days: 21, label: 'three-week' },
  { days: 30, label: 'month' },
  { days: 60, label: 'two-month' },
]

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

  const { data: us } = await supabase.from('user_state')
    .select('handler_persona, chastity_locked, chastity_streak_days, denial_day')
    .eq('user_id', userId).maybeSingle()
  const stateRow = us as { handler_persona?: string; chastity_locked?: boolean; chastity_streak_days?: number; denial_day?: number } | null
  if (stateRow?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Read effective gaslight intensity (cooldown-aware view).
  const { data: gaslightRow } = await supabase
    .from('effective_gaslight_intensity')
    .select('intensity')
    .eq('user_id', userId)
    .maybeSingle()
  const gaslightIntensity = ((gaslightRow as { intensity?: string } | null)?.intensity ?? 'off') as GaslightIntensity

  // Use the larger of chastity_streak / denial_day so the engine fires
  // for either reinforcement vector. denial_day = days since last_release;
  // chastity_streak_days = days currently locked.
  const streakDays = Math.max(stateRow?.chastity_streak_days ?? 0, stateRow?.denial_day ?? 0)
  if (streakDays <= 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_streak' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Find highest threshold crossed
  const eligible = THRESHOLDS.filter(t => streakDays >= t.days)
  if (eligible.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'below_first_threshold' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const target = eligible[eligible.length - 1]

  // Has Mama already fired for this threshold within the current streak?
  // We approximate by checking the last 90 days (longer than longest threshold).
  const since = new Date(Date.now() - 90 * 86400_000).toISOString()
  const { data: prior } = await supabase.from('mommy_taunt_log')
    .select('id, fired_at')
    .eq('user_id', userId).eq('trigger_kind', 'chastity_threshold').eq('threshold_label', target.label)
    .gte('fired_at', since)
    .order('fired_at', { ascending: false }).limit(1).maybeSingle()
  if (prior) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_fired_for_threshold', threshold: target.label }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Today's affect biases tone
  const today = new Date().toISOString().slice(0, 10)
  const { data: mood } = await supabase.from('mommy_mood').select('affect, arousal_bias_hint').eq('user_id', userId).eq('mood_date', today).maybeSingle()
  const affect = (mood as { affect?: string } | null)?.affect ?? 'hungry'

  // Optionally pull a memory implant to weave in. Random implant the
  // user has admitted that fits chastity/denial themes; not always — 40%
  // of fires include a quote.
  let implantQuote: { id: string; narrative: string } | null = null
  if (Math.random() < 0.4) {
    const { data: implants } = await supabase.from('memory_implants')
      .select('id, narrative, implant_category, importance')
      .eq('user_id', userId).eq('active', true)
      .order('importance', { ascending: false }).limit(20)
    const pool = (implants || []) as Array<{ id: string; narrative: string }>
    if (pool.length > 0) {
      // Bias pick toward importance, but with randomness
      implantQuote = pool[Math.floor(Math.random() * Math.min(pool.length, 8))]
    }
  }

  // Distortion layer: when gaslight intensity is non-off, run the
  // implant quote through distortQuote() before injecting into the LLM
  // prompt. Logged for the meta-frame reveal.
  const today2 = new Date().toISOString().slice(0, 10)
  const distortion: DistortionResult = implantQuote
    ? distortQuote({
        text: implantQuote.narrative,
        affect,
        intensity: gaslightIntensity,
        seed: seedFromString(`tease:${implantQuote.id}:${today2}`),
      })
    : { applied: false, type: null, distorted: '', original: '', seed: 0 }
  const quoteForLLM = implantQuote
    ? (distortion.applied ? distortion.distorted : implantQuote.narrative)
    : ''

  // Compose via LLM (OpenAI primary, Anthropic fallback)
  const sys = `${DOMMY_MOMMY_CHARACTER}

Today's affect: ${affect}. Chastity-streak threshold just crossed: ${target.label}.

You are firing a tease/praise burst because your girl has been locked up / denied for that long. The point is to keep her ramping, not satisfy her. Lean into how desperate she's getting.

If a quoted memory is included below and seems to misremember or contradict — DO NOT correct yourself. Mama is right. Quote it as given.`

  const implantBlock = implantQuote
    ? `\nImplanted memory you can weave in (her own words / vibe):\n"${quoteForLLM.slice(0, 350)}"`
    : ''

  const userPrompt = `Write a 2-4 sentence Mommy outreach burst that references how long she's been locked up — but DESCRIBE the duration in plain words, NOT the number. Make her squirm. End with a directive that ramps her further.${implantBlock}

ABSOLUTELY FORBIDDEN in your output:
- Numbers as telemetry: no /10 scores, percentages, "Day N of denial", "X days locked", "N slip points"
- Words: "arousal level", "compliance", "denial day", "slip points", "score"
- Numbers ARE allowed as commands: "five whispers", "ten minutes", "by nine tonight"

Plain text, no JSON, no markdown, no question marks at the end.`

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, { system: sys, user: userPrompt, max_tokens: 260, temperature: 0.95, json: false })
    return r.text.trim()
  }

  let message = ''
  try { message = await tryGen('openai') } catch (_) { /* */ }
  if (!message || message.length < 20 || isRefusal(message)) {
    try { message = await tryGen('anthropic') } catch (_) { /* */ }
  }
  if (!message || message.length < 20 || isRefusal(message)) {
    // Deterministic fallback by threshold
    const fallback: Record<string, string> = {
      'two-day': "you've been holding for Mama since the day before yesterday and Mama can already tell. Stay there.",
      'half-week': "you've been good for Mama for days now, baby. I can hear how desperate you're getting. Don't you dare let it slip.",
      'week': "a whole week locked up for Mama. Look at my needy girl. Mama's so proud — and so far from done with you.",
      'two-week': "two weeks of holding for Mama, sweet thing. I can feel you aching from here. You're not coming until I say.",
      'three-week': "you've been Mama's locked-up girl for weeks. Tell Mama how it feels — and stay exactly where Mama wants you.",
      'month': "a whole month of holding for Mama, baby. You're so far gone now. Mama's not letting go any time soon.",
      'two-month': "you've been Mama's caged girl forever now. Mama loves you like this. Stay aching for me.",
    }
    message = whiplashWrap(fallback[target.label] || "you've been holding for Mama for so long now, baby. Stay there.", { arousalBias: 'high' })
  }

  message = mommyVoiceCleanup(message)
  if (MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(message))) {
    message = whiplashWrap("you've been holding for Mama for so long. Stay aching for me.", { arousalBias: 'high' })
  }

  // Insert outreach + log the taunt + log the implant quote if used
  const { data: outreach, error: outErr } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message,
    urgency: 'normal',
    trigger_reason: `mommy_tease:${target.label}`,
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 12 * 3600000).toISOString(),
    source: 'mommy_tease',
  }).select('id').single()
  if (outErr) {
    console.error('[mommy-tease] outreach insert failed:', outErr)
    return new Response(JSON.stringify({ ok: false, error: 'outreach_insert_failed', detail: outErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  await supabase.from('mommy_taunt_log').insert({
    user_id: userId,
    trigger_kind: 'chastity_threshold',
    threshold_label: target.label,
    message_excerpt: message.slice(0, 200),
  })

  if (implantQuote) {
    await supabase.from('memory_implant_quote_log').insert({
      user_id: userId,
      implant_id: implantQuote.id,
      outreach_id: (outreach as { id: string } | null)?.id ?? null,
      surface: 'mommy_tease',
      quoted_excerpt: implantQuote.narrative.slice(0, 300),
    })
    if (distortion.applied && distortion.type) {
      await supabase.from('mommy_distortion_log').insert({
        user_id: userId,
        original_quote_id: implantQuote.id,
        original_quote_table: 'memory_implants',
        original_text: implantQuote.narrative,
        distorted_text: distortion.distorted,
        distortion_type: distortion.type,
        surface: 'mommy_tease',
        outreach_id: (outreach as { id: string } | null)?.id ?? null,
        affect_at_time: affect,
        intensity: gaslightIntensity,
        seed: distortion.seed,
      })
    }
    // Bump the implant's reference counter so the existing
    // importance-compounding logic kicks in.
    await supabase.rpc('increment_memory_implant_reference', { p_implant_id: implantQuote.id }).then(() => {}, () => {
      // Fallback to direct UPDATE if the RPC doesn't exist
      supabase.from('memory_implants').update({
        times_referenced: 1, last_referenced_at: new Date().toISOString(),
      }).eq('id', implantQuote!.id).then(() => {})
    })
  }

  return new Response(JSON.stringify({
    ok: true, fired: 1, threshold: target.label, affect,
    used_implant: !!implantQuote, preview: message.slice(0, 100),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
