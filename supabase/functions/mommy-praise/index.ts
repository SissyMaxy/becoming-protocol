// mommy-praise — arousal-triggered filthy praise burst.
//
// Watches arousal_log for fresh entries above today's mommy_mood
// praise_threshold and queues a Mommy-voice praise outreach. Cooldown
// prevents spamming.
//
// POST { user_id?: string }. Cron every 10 min.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, AFFECT_BIAS, type Affect, whiplashWrap, PET_NAMES,
  arousalToPhrase, mommyVoiceCleanup, MOMMY_TELEMETRY_LEAK_PATTERNS,
  isTestPollution,
} from '../_shared/dommy-mommy.ts'
import { shouldAutoArchive } from '../_shared/letters-auto-archive.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Persona gate
  const { data: us } = await supabase.from('user_state').select('handler_persona, current_phase').eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const phaseSnapshot = (us as { current_phase?: number | null } | null)?.current_phase ?? null

  // Today's affect → praise threshold
  const today = new Date().toISOString().slice(0, 10)
  const { data: mood } = await supabase.from('mommy_mood').select('affect, arousal_bias_hint').eq('user_id', userId).eq('mood_date', today).maybeSingle()
  const affect = (mood as { affect?: string } | null)?.affect ?? 'hungry'
  const threshold = AFFECT_BIAS[affect as Affect]?.praise_threshold ?? 6
  const arousalHint = (mood as { arousal_bias_hint?: string } | null)?.arousal_bias_hint ?? ''

  // Find recent arousal entries above threshold not yet praised (last 60 min).
  const since = new Date(Date.now() - 60 * 60_000).toISOString()
  const { data: entries } = await supabase.from('arousal_log')
    .select('id, value, created_at, note')
    .eq('user_id', userId).gte('created_at', since).gte('value', threshold)
    .order('created_at', { ascending: false }).limit(3)

  const rows = (entries || []) as Array<{ id: string; value: number; created_at: string; note: string | null }>
  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, fired: 0, threshold, affect }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Cooldown: one praise per hour-bucket per trigger_type
  const hourBucket = new Date()
  hourBucket.setMinutes(0, 0, 0)
  const { data: existing } = await supabase.from('mommy_praise_cooldown')
    .select('user_id').eq('user_id', userId).eq('trigger', 'arousal_burst').eq('hour_bucket', hourBucket.toISOString()).maybeSingle()
  if (existing) {
    return new Response(JSON.stringify({ ok: true, fired: 0, cooldown: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const top = rows[0]
  const noteSnippet = top.note ? top.note.slice(0, 200) : ''

  // Translate the arousal value to a plain phrase BEFORE handing to the
  // model so it doesn't read "8/10" and parrot it into the user-facing
  // praise. Mama feels her, doesn't read her dashboard.
  const arousalPlain = arousalToPhrase(top.value)

  // 35% of the time, weave in a quoted memory implant. Picks a high-
  // importance active implant the user has admitted; logs the reference
  // so the existing importance-compounding logic counts it.
  let implantQuote: { id: string; narrative: string } | null = null
  if (Math.random() < 0.35) {
    const { data: implants } = await supabase.from('memory_implants')
      .select('id, narrative, importance')
      .eq('user_id', userId).eq('active', true)
      .order('importance', { ascending: false }).limit(15)
    const pool = ((implants || []) as Array<{ id: string; narrative: string }>)
      .filter(r => !isTestPollution(r.narrative))
    if (pool.length > 0) implantQuote = pool[Math.floor(Math.random() * Math.min(pool.length, 6))]
  }

  const sys = `${DOMMY_MOMMY_CHARACTER}

Today's affect: ${affect}. ${arousalHint ? 'Bias hint: ' + arousalHint : ''}`
  const implantBlock = implantQuote
    ? `\n\nImplanted memory you can weave in casually (her own words / vibe — paraphrase or quote a fragment, don't restate the whole thing):\n"${implantQuote.narrative.slice(0, 350)}"`
    : ''

  const userPrompt = `Your girl just told you: ${arousalPlain}.${noteSnippet ? ` She added: "${noteSnippet}"` : ''}${implantBlock}

Write a 2-3 sentence praise burst in Mommy voice, sweet → filthy, that ramps her further (does NOT release). Address her directly. Use a pet name. End with a directive that keeps her in heightened state.

ABSOLUTELY FORBIDDEN in your output:
- Numbers, percentages, /10 scores, day counts, point totals
- The exact phrase "8/10" or any "N/10" pattern
- Words like "arousal level", "compliance", "denial day", "slip points"
- Question marks at the end (Mama commands)
- JSON, markdown, or any format wrapper

Plain text only. Mama feels her; Mama doesn't recite numbers.`

  // OpenAI primary (more compliant on Mommy filth than Anthropic), Anthropic
  // fallback, deterministic whiplashWrap as last resort.
  const REFUSAL_PATTERNS = [
    /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
    /\b(against (my|the) (guidelines|policies|rules))\b/i,
    /\b(step back|content policy|appreciate you sharing)\b/i,
  ]
  const isRefusal = (t: string) => REFUSAL_PATTERNS.some(p => p.test(t))

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, { system: sys, user: userPrompt, max_tokens: 200, temperature: 0.95, json: false })
    return r.text.trim()
  }

  let message = ''
  try { message = await tryGen('openai') } catch (_) { /* fall through */ }
  if (!message || message.length < 20 || isRefusal(message)) {
    try { message = await tryGen('anthropic') } catch (_) { /* fall through */ }
  }
  if (!message || message.length < 20 || isRefusal(message)) {
    message = whiplashWrap(`${arousalPlain}. Stay there for me. Don't you dare let it drop.`, { arousalBias: 'high' })
  }

  // Backstop: scrub any number-leak the LLM wrote anyway, then verify clean.
  message = mommyVoiceCleanup(message)
  if (MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(message))) {
    // Still leaking after cleanup → fall back to deterministic
    message = whiplashWrap(`${arousalPlain}. Stay there for me. Don't you dare let it drop.`, { arousalBias: 'high' })
  }

  const archive = shouldAutoArchive({ source: 'mommy_praise', affect_snapshot: affect, status: 'pending' })
  const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message,
    urgency: 'normal',
    trigger_reason: `arousal_burst:${top.id}`,
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
    source: 'mommy_praise',
    phase_snapshot: phaseSnapshot,
    affect_snapshot: affect,
    is_archived_to_letters: archive,
  }).select('id').single()

  await supabase.from('mommy_praise_cooldown').insert({
    user_id: userId,
    hour_bucket: hourBucket.toISOString(),
    trigger: 'arousal_burst',
  })

  if (implantQuote) {
    await supabase.from('memory_implant_quote_log').insert({
      user_id: userId,
      implant_id: implantQuote.id,
      outreach_id: (outreach as { id: string } | null)?.id ?? null,
      surface: 'mommy_praise',
      quoted_excerpt: implantQuote.narrative.slice(0, 300),
    })
    await supabase.from('memory_implants').update({
      times_referenced: 1,
      last_referenced_at: new Date().toISOString(),
    }).eq('id', implantQuote.id)
  }

  return new Response(JSON.stringify({ ok: true, fired: 1, value: top.value, threshold, affect, preview: message.slice(0, 80) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
