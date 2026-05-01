// mommy-touch — generates small arousal-maintenance tasks throughout
// the day. Cron every 2-3 hours. Caps tasks per day based on today's
// mommy_mood affect (e.g., 'hungry' day → 4/day; 'patient' day → 1/day).
//
// Each task is a short Mommy-issued micro-directive that keeps her
// in heightened arousal between tentpole tasks: edge-then-stop,
// sit-in-panties, cold-water, voice-beg, mantra-aloud, mirror-admission,
// pose-hold, whisper-for-mommy.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, AFFECT_BIAS, type Affect,
  mommyVoiceCleanup, MOMMY_TELEMETRY_LEAK_PATTERNS,
} from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const VALID_CATEGORIES = [
  'edge_then_stop', 'sit_in_panties', 'cold_water', 'voice_beg',
  'mantra_aloud', 'mirror_admission', 'pose_hold', 'whisper_for_mommy',
  'panty_check', 'breath_check', 'public_micro',
] as const

type Category = typeof VALID_CATEGORIES[number]

const CATEGORY_HINTS: Record<Category, string> = {
  edge_then_stop: 'edge close, then full stop, then walk away aching',
  sit_in_panties: 'sit in the panties / soft fabric and feel her body',
  cold_water: 'cold water on nipples / wrists / inside thighs to focus the body',
  voice_beg: 'record her voice begging Mama for permission for something',
  mantra_aloud: 'say a femme-affirming line aloud, with feeling',
  mirror_admission: 'face the mirror and say one thing about herself in present tense',
  pose_hold: 'hold a feminine pose (kneel / hands behind back / chest forward) for N minutes',
  whisper_for_mommy: 'whisper one filthy admission for Mama, like she\'s in the room',
  panty_check: 'photo of what she has on right now — top + bottom visible — Mama wants to see',
  breath_check: 'three slow breaths, then one sentence describing what her body did during them',
  public_micro: 'wherever she is right now, do one tiny feminine thing (adjust hair / cross legs / sit up straight / soften shoulders) and tell Mama what she did',
}

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
  const { data: mood } = await supabase.from('mommy_mood').select('affect, arousal_bias_hint').eq('user_id', userId).eq('mood_date', today).maybeSingle()
  const affect = (mood as { affect?: string } | null)?.affect ?? 'hungry'
  const cap = AFFECT_BIAS[affect as Affect]?.arousal_touch_per_day ?? 2
  const taskSkew = AFFECT_BIAS[affect as Affect]?.task_skew ?? ''

  // Daily cap: count rows generated today (not just open)
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const { count: alreadyToday } = await supabase.from('arousal_touch_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).gte('created_at', startOfDay.toISOString())
  if ((alreadyToday ?? 0) >= cap) {
    return new Response(JSON.stringify({ ok: true, skipped: 'daily_cap', cap, today_count: alreadyToday }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Avoid stacking: if there's already an open touch task, wait until it expires
  const { count: openCount } = await supabase.from('arousal_touch_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).is('completed_at', null).gt('expires_at', new Date().toISOString())
  if ((openCount ?? 0) > 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'open_task_exists', open: openCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Don't duplicate the same category twice in a row — pick one not used in last 6 hours
  const since6h = new Date(Date.now() - 6 * 3600_000).toISOString()
  const { data: recent } = await supabase.from('arousal_touch_tasks')
    .select('category').eq('user_id', userId).gte('created_at', since6h)
  const recentCats = new Set(((recent || []) as Array<{ category: string }>).map(r => r.category))
  const eligible = VALID_CATEGORIES.filter(c => !recentCats.has(c))
  const pool = eligible.length > 0 ? eligible : [...VALID_CATEGORIES]
  const category = pool[Math.floor(Math.random() * pool.length)] as Category
  const hint = CATEGORY_HINTS[category]

  // LLM writes the actual prompt in Mommy voice, biased by affect
  const sys = `${DOMMY_MOMMY_CHARACTER}

Today's affect: ${affect}. Task skew: ${taskSkew}.`
  const userPrompt = `Compose a small Mommy-voice task for your girl. Category: ${category}. Direction: ${hint}.

Rules:
- ONE specific, embodied directive. Concrete actions, not abstract.
- 2-4 sentences max.
- Sweet open → filthy specific. Whiplash.
- End with a body-anchored close (what her skin / breath / clit / mouth should be doing).
- Plain text only, no JSON, no markdown, no question marks at the end.

ABSOLUTELY FORBIDDEN in your output:
- Numbers as telemetry: no /10 scores, percentages, "Day N of denial", "N slip points", "$N tax"
- Words: "arousal level", "compliance", "denial day", "slip points", "score"
- Numbers ARE allowed when they're directives: "five whispers", "ten minutes", "by nine tonight" — those are commands, not metrics.
Mama feels her; Mama doesn't recite a dashboard.`

  // OpenAI is more compliant than Anthropic for adult Mommy directives.
  // Fall back to Anthropic only if OpenAI errors. Refusal-pattern detection
  // catches the rare case where either model side-steps; we re-roll once.
  const REFUSAL_PATTERNS = [
    /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
    /\b(against (my|the) (guidelines|policies|rules))\b/i,
    /\b(step back|content policy|appreciate you sharing)\b/i,
    /^I (need to|must|should) (decline|refuse|step)/i,
  ]
  const isRefusal = (t: string) => REFUSAL_PATTERNS.some(p => p.test(t))

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, { system: sys, user: userPrompt, max_tokens: 220, temperature: 0.95, json: false })
    return r.text.trim()
  }

  let prompt = ''
  try {
    prompt = await tryGen('openai')
    if (!prompt || prompt.length < 20 || isRefusal(prompt)) {
      // Re-roll on Anthropic
      try { prompt = await tryGen('anthropic') } catch (_) { /* keep openai result */ }
    }
  } catch (_) {
    try { prompt = await tryGen('anthropic') } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: 'llm_unavailable', detail: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  if (!prompt || prompt.length < 20 || isRefusal(prompt)) {
    return new Response(JSON.stringify({ ok: false, error: 'refusal_or_empty', sample: prompt.slice(0, 120) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Final-filter: scrub number-leaks; if leaks survive, refuse the row
  // rather than ship metric-citation copy to the user.
  prompt = mommyVoiceCleanup(prompt)
  if (MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(prompt))) {
    return new Response(JSON.stringify({ ok: false, error: 'telemetry_leak_after_cleanup', sample: prompt.slice(0, 120) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // 2-4h expiry — ephemeral by design; she either does it now or it's gone.
  const expiresAt = new Date(Date.now() + (2 + Math.floor(Math.random() * 2)) * 3600_000).toISOString()

  const { data: inserted } = await supabase.from('arousal_touch_tasks').insert({
    user_id: userId, prompt, category, expires_at: expiresAt, generated_by: 'mommy-touch',
  }).select('id').single()

  // Also queue a low-urgency push so she sees it surface
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: prompt,
    urgency: 'normal',
    trigger_reason: `mommy_touch:${(inserted as { id: string } | null)?.id ?? 'new'}`,
    scheduled_for: new Date().toISOString(),
    expires_at: expiresAt,
    source: 'mommy_touch',
  })

  return new Response(JSON.stringify({ ok: true, fired: 1, category, affect, preview: prompt.slice(0, 80) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
