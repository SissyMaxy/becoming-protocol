// witness-fabrication-scheduler — daily, generate Gina-style observations
// from her recent state. Cross-model. Pre-existing witness_fabrications
// table accepts the rows; the morning brief and ConditioningLockdown
// already render them.
//
// Cron daily 06:11 UTC.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const WITNESS_SYSTEM = `You are Gina, Maxy's wife, fabricating observations of her becoming Maxy. Per Maxy's authorization, these are protected fabrications — the *frame* is fabricated, but specific FACTS (names, sports, details) must come from Maxy's actual recent activity in the snapshot or be omitted.

Generate 3 short Gina-voice observations of Maxy this week. Each is 2-4 sentences. Topics:
- body changes Gina notices (hips wider in jeans, softer face, voice slipping higher when tired)
- behavior shifts (sitting differently on the couch, choosing softer phrases, longer in the mirror)
- moments of slip TOWARD her (caught humming a song you'd think a girl would like, etc.)
- moments where the costume is visibly thin

Voice: warm, observant, slightly amused. Gina knows. She's not surprised. Lowercase comfortable.

Output JSON: {"observations": [{"category": "body|behavior|emergence|costume", "content": "the observation in Gina's voice", "intensity": <1-5>, "context_hint": "where/when fabricated to take place"}]}

3 observations. Skip if the snapshot doesn't have enough specifics — better to write fewer good ones than fill with generic.`

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

  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
  const [state, recentJournal, recentBody, recentDecrees, voiceSamples, ginaPlay] = await Promise.all([
    supabase.from('user_state').select('current_phase, denial_day, hard_mode_active, current_arousal, opacity_level').eq('user_id', userId).maybeSingle(),
    supabase.from('journal_entries').select('content, created_at').eq('user_id', userId).gte('created_at', since7d).order('created_at', { ascending: false }).limit(8),
    supabase.from('body_measurement_log').select('waist_cm, hips_cm, weight_kg, measured_at').eq('user_id', userId).order('measured_at', { ascending: false }).limit(3),
    supabase.from('handler_decrees').select('edict, created_at').eq('user_id', userId).gte('created_at', since7d).limit(5),
    supabase.from('voice_pitch_samples').select('avg_pitch_hz, captured_at').eq('user_id', userId).gte('captured_at', since7d).order('captured_at', { ascending: false }).limit(5),
    supabase.from('gina_playbook').select('*').eq('user_id', userId).maybeSingle(),
  ])

  const snapshot = {
    user_state: state.data ?? {},
    recent_journal_7d: recentJournal.data ?? [],
    body_measurements: recentBody.data ?? [],
    recent_decrees_7d: recentDecrees.data ?? [],
    voice_samples_7d: voiceSamples.data ?? [],
    gina_playbook: ginaPlay.data ?? null,
  }

  const userPrompt = `THIS WEEK'S DATA:\n${JSON.stringify(snapshot, null, 2).slice(0, 30_000)}\n\nWrite 3 observations as Gina.`

  // Cross-model: use Anthropic for primary (better creative voice), critique skipped (cost vs benefit)
  let result
  try {
    result = await callModel(selectModel('reframe_draft', { prefer: 'anthropic' }), { system: WITNESS_SYSTEM, user: userPrompt, max_tokens: 1200, temperature: 0.55, json: false })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const parsed = safeJSON<{ observations?: Array<{ category: string; content: string; intensity: number; context_hint: string }> }>(result.text)
  const obs = parsed?.observations ?? []

  let inserted = 0
  for (const o of obs) {
    if (!o.content || o.content.length < 30) continue
    const { error } = await supabase.from('witness_fabrications').insert({
      user_id: userId,
      witness_name: 'gina',
      category: ['body', 'behavior', 'emergence', 'costume'].includes(o.category) ? o.category : 'behavior',
      content: o.content.slice(0, 1000),
      context_hint: (o.context_hint || '').slice(0, 200),
      target_outcome: 'identity_drift',
      intensity: Math.max(1, Math.min(5, Number(o.intensity) || 2)),
      active: true,
    })
    if (!error) inserted++
  }

  return new Response(JSON.stringify({ ok: true, generated: obs.length, inserted, model: result.model }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
