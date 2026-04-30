// persona-shift-auto — autonomously toggle handler↔therapist when audit
// shows voice drift. The two personas catch different leak classes; rotating
// gives adversarial coverage.
//
// Trigger: if last 7d reply-grade voice_match avg < 60 in current persona
// AND >= 10 graded → flip. If just-flipped < 24h ago, hold (no thrashing).
//
// Cron every 4h.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()
  const [state, grades, lastShift] = await Promise.all([
    supabase.from('user_state').select('handler_persona').eq('user_id', userId).maybeSingle(),
    supabase.from('handler_reply_grades').select('score_voice_match, score_overall').eq('user_id', userId).gte('graded_at', since7d).limit(200),
    supabase.from('persona_shift_log').select('shifted_at').eq('user_id', userId).gte('shifted_at', since24h).order('shifted_at', { ascending: false }).limit(1),
  ])

  const current = ((state.data as { handler_persona?: string } | null)?.handler_persona) || 'handler'
  const gradesArr = (grades.data ?? []) as Array<{ score_voice_match: number; score_overall: number }>
  const justShifted = (lastShift.data ?? []).length > 0

  if (justShifted) {
    return new Response(JSON.stringify({ ok: true, flipped: 'no_change', reason: 'shifted within 24h, holding' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (gradesArr.length < 10) {
    return new Response(JSON.stringify({ ok: true, flipped: 'no_change', reason: `only ${gradesArr.length} graded in 7d` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const avgVoice = gradesArr.reduce((s, g) => s + (g.score_voice_match || 0), 0) / gradesArr.length
  const avgOverall = gradesArr.reduce((s, g) => s + (g.score_overall || 0), 0) / gradesArr.length

  // Flip if voice_match avg below 60. The other persona may not be better,
  // but the rotation breaks model habituation to a single voice frame.
  if (avgVoice >= 60) {
    return new Response(JSON.stringify({ ok: true, flipped: 'no_change', reason: `voice_match avg ${Math.round(avgVoice)} >= 60`, current }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const next = current === 'handler' ? 'therapist' : 'handler'
  await supabase.from('user_state').update({ handler_persona: next }).eq('user_id', userId)
  await supabase.from('persona_shift_log').insert({
    user_id: userId,
    from_persona: current,
    to_persona: next,
    rationale: `7d voice_match avg ${Math.round(avgVoice)}, overall ${Math.round(avgOverall)} — adversarial rotation`,
    decided_by: 'rule_engine',
    voice_drift_score: avgVoice,
  })
  await supabase.from('autonomous_escalation_log').insert({
    user_id: userId,
    engine: 'persona_shift_auto',
    action: 'flipped_on',
    before_state: { handler_persona: current },
    after_state: { handler_persona: next },
    rationale: `voice_match avg ${Math.round(avgVoice)} → adversarial rotation`,
    decided_by: 'rule_engine',
  })

  return new Response(JSON.stringify({ ok: true, flipped: 'shifted', from: current, to: next, avgVoice: Math.round(avgVoice) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
