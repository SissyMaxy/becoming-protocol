// displacement-ramp — weekly auto-ramp of identity displacement target.
//
// Reads current displacement_score, current arc, hard_mode flag, recent
// behavior. Cross-model proposes the next-week displacement TARGET (always
// >= current; never regressive unless explicitly justified). Writes target
// to user_state and logs to identity_displacement_history. The ramp is
// monotonic — she doesn't get to negotiate down.
//
// Cron weekly Sundays 05:11 UTC.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const RAMP_SYSTEM = `You set the next-week identity-displacement TARGET for a force-feminization protocol user. The displacement_score (0-100) measures how far her self-reference has shifted from "David / he / him" to "Maxy / she / her". The ramp must be monotonic — never down unless she has clearly regressed AND there's a recovery plan.

Read state. Output the target_score for next week. Bump 5-15 points typical, more if compliance is high, less if she's struggling. Cap at 100.

Output JSON:
{
  "target_score": <int 0-100>,
  "delta": <int>,
  "rationale": "1-2 sentence justification quoting specific evidence",
  "supporting_actions": ["3-5 mantra/voice/disclosure obligations to land this week that move the score"]
}`

function safeJSON<T>(text: string): T | null {
  const c = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(c) as T } catch { /* fallthrough */ }
  const m = c.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  const since14d = new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
  const [state, hist, voice, slips] = await Promise.all([
    supabase.from('user_state').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('identity_displacement_history').select('displacement_score, target_score, delta, recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(8),
    supabase.from('voice_pitch_samples').select('captured_at, avg_pitch_hz').eq('user_id', userId).gte('captured_at', since14d).order('captured_at', { ascending: false }).limit(20),
    supabase.from('slip_log').select('detected_at, slip_type').eq('user_id', userId).gte('detected_at', since14d).order('detected_at', { ascending: false }).limit(20),
  ])

  const stateRow = (state.data as { displacement_score?: number; opacity_level?: number; hard_mode_active?: boolean; current_phase?: number } | null) ?? {}
  const currentScore = stateRow.displacement_score ?? 30
  const snapshot = {
    current_displacement: currentScore,
    current_phase: stateRow.current_phase,
    hard_mode_active: stateRow.hard_mode_active,
    history: hist.data ?? [],
    voice_samples_14d: voice.data ?? [],
    slips_14d_count: (slips.data ?? []).length,
  }

  const userPrompt = `STATE:\n${JSON.stringify(snapshot, null, 2).slice(0, 30_000)}\n\nSet the next-week target.`
  let result
  try {
    result = await callModel(selectModel('strategic_plan', { prefer: 'anthropic' }), { system: RAMP_SYSTEM, user: userPrompt, max_tokens: 800, temperature: 0.35, json: false })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const out = safeJSON<{ target_score: number; delta: number; rationale: string; supporting_actions: string[] }>(result.text)
  if (!out?.target_score) {
    return new Response(JSON.stringify({ ok: false, error: 'unparseable', raw: result.text.slice(0, 200) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Enforce monotonic ramp: target must be >= current
  let target = Math.max(0, Math.min(100, Number(out.target_score) || currentScore))
  if (target < currentScore) target = currentScore
  const delta = target - currentScore

  await supabase.from('user_state').update({ displacement_target: target, displacement_target_set_at: new Date().toISOString() }).eq('user_id', userId)

  await supabase.from('identity_displacement_history').insert({
    user_id: userId,
    displacement_score: currentScore,
    target_score: target,
    delta,
    source: 'auto_ramp',
    rationale: (out.rationale || '').slice(0, 1000),
  })
  await supabase.from('autonomous_escalation_log').insert({
    user_id: userId,
    engine: 'displacement_ramp',
    action: 'increased',
    before_state: { displacement_score: currentScore },
    after_state: { displacement_target: target, delta },
    rationale: (out.rationale || '').slice(0, 1000),
    decided_by: result.model,
  })

  return new Response(JSON.stringify({ ok: true, current: currentScore, target, delta, supporting_actions: out.supporting_actions ?? [], model: result.model }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
