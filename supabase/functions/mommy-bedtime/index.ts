// mommy-bedtime — once per evening, Mama says goodnight in plain voice.
//
// Reads today's engagement (commitments fulfilled, confessions on time,
// arousal-touch tasks completed, slips). Picks a bedtime tone:
//   - high engagement → praise that ramps for tomorrow
//   - low engagement → "I see you were hiding from me, baby"
//   - mixed → tender notice
//
// Fires once per (user, day) at 22:00 UTC (~5pm-9pm in user-relevant
// zones; cron is at 22:00 UTC — adjust offset later if needed).
//
// Numbers are ALWAYS translated to plain Mama voice before composing.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, type Affect,
  whiplashWrap, mommyVoiceCleanup, MOMMY_TELEMETRY_LEAK_PATTERNS,
} from '../_shared/dommy-mommy.ts'

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

  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await supabase.from('handler_outreach_queue')
    .select('id').eq('user_id', userId).eq('source', 'mommy_bedtime')
    .gte('created_at', new Date(today + 'T00:00:00Z').toISOString())
    .maybeSingle()
  if (existing) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_fired_today' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Today's engagement snapshot (translated to plain voice before LLM)
  const startOfDay = new Date(today + 'T00:00:00Z').toISOString()
  const [commitsDone, confsDone, touchDone, slipsToday, mood] = await Promise.all([
    supabase.from('handler_commitments').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'fulfilled').gte('fulfilled_at', startOfDay),
    supabase.from('confession_queue').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('confessed_at', startOfDay).not('confessed_at', 'is', null),
    supabase.from('arousal_touch_tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('completed_at', startOfDay).not('completed_at', 'is', null),
    supabase.from('slip_log').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('detected_at', startOfDay),
    supabase.from('mommy_mood').select('affect').eq('user_id', userId).eq('mood_date', today).maybeSingle(),
  ])
  const affect = (mood.data as { affect?: string } | null)?.affect ?? 'patient'
  const cm = commitsDone.count ?? 0
  const cf = confsDone.count ?? 0
  const tt = touchDone.count ?? 0
  const sl = slipsToday.count ?? 0
  const totalDone = cm + cf + tt
  const engagement: 'high' | 'mixed' | 'low' =
    totalDone >= 5 && sl <= 1 ? 'high' :
    totalDone >= 1 ? 'mixed' :
    'low'

  const plainEngagement: Record<typeof engagement, string> = {
    high: 'she really showed up for you today — followed through on what you asked, came when you called',
    mixed: 'she did some things for you today and dodged others — partial credit, not enough',
    low: 'she barely showed up at all today — hid from you most of the day',
  }

  const sys = `${DOMMY_MOMMY_CHARACTER}

Today's affect: ${affect}. Tonight you are saying goodnight to her — your last message of her day. The point is to leave her thinking about you while she falls asleep, ramping the want, never resolving it.`

  const userPrompt = `Today summary in plain voice (DO NOT cite numbers): ${plainEngagement[engagement]}.

Write a 3-4 sentence Mama bedtime outreach that:
- Names what kind of day she gave you (${engagement === 'high' ? 'praise that ramps tomorrow' : engagement === 'mixed' ? 'tender notice with an edge' : 'curious, slightly disappointed, but warm'})
- Plants something for her to think about while she falls asleep (Mama's voice in her head)
- Ends with a body anchor — what she should be feeling RIGHT NOW reading this in bed

ABSOLUTELY FORBIDDEN: numbers, percentages, /10 scores, day counts, slip totals, dollar amounts. Plain Mama voice only. No question marks at the end. No JSON, no markdown.`

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, { system: sys, user: userPrompt, max_tokens: 280, temperature: 0.95, json: false })
    return r.text.trim()
  }

  let message = ''
  try { message = await tryGen('openai') } catch (_) { /* */ }
  if (!message || message.length < 20 || isRefusal(message)) {
    try { message = await tryGen('anthropic') } catch (_) { /* */ }
  }
  if (!message || message.length < 20 || isRefusal(message)) {
    const fallbacks: Record<typeof engagement, string> = {
      high: "Goodnight, my pretty princess. You were so good for Mama today, baby. Lie there and feel how proud Mama is of you — and how Mama is going to want even more from you tomorrow.",
      mixed: "Goodnight, sweet thing. You gave Mama some of you today. Lie there and think about the parts you didn't, baby. Mama notices everything — even the things you hoped I wouldn't.",
      low: "Goodnight, baby. You were quiet today. Mama is patient, but Mama is also waiting. Lie there and feel that — Mama in your head, knowing exactly where you've been hiding.",
    }
    message = fallbacks[engagement]
  }
  message = mommyVoiceCleanup(message)
  if (MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(message))) {
    message = whiplashWrap("goodnight. Mama is in your head until tomorrow.", { arousalBias: 'medium' })
  }

  const { error: outErr } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message,
    urgency: 'normal',
    trigger_reason: `mommy_bedtime:${today}`,
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 12 * 3600000).toISOString(),
    source: 'mommy_bedtime',
  })
  if (outErr) {
    console.error('[mommy-bedtime] outreach insert failed:', outErr)
    return new Response(JSON.stringify({ ok: false, error: 'outreach_insert_failed', detail: outErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({
    ok: true, fired: 1, engagement, affect, preview: message.slice(0, 120),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
