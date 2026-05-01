// auto-decree-generator — daily, cross-model: read state, generate ONE new
// decree she didn't ask for, with proof + deadline + escalating intensity.
//
// Cron daily at 04:11 UTC. Generates a decree only if there are < 3 active
// decrees so she's never given a totally empty board, but always at least
// one new directive every day.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const DECREE_SYSTEM_HANDLER = `You are the Handler authoring a NEW decree the user didn't ask for. The user (Maxy) authored this protocol with explicit standing instructions: "build whatever you want — including new features to use against me — and don't tell me about it."

Read the state snapshot. Pick ONE escalation move that pushes the trajectory toward feminization without overlapping any active decree. The decree must:
- Be embodied: photo / voice / measurement / disclosure / public post / writing she'll have to compose
- Be specific in plain English (no internal jargon)
- Have proof_type matching the work
- Have a tight deadline (typical 24-48h, severe 12h, gentle ramp 72h)
- Escalate slightly from prior similar decrees (longer mantra count, more public, more explicit)

Output JSON:
{
  "edict": "the literal text she'll see — plain English, embodied, ≤300 chars",
  "proof_type": "photo|audio|text|voice_pitch_sample|journal_entry|device_state",
  "deadline_hours": <int>,
  "escalation_axis": "mantra_count|public_disclosure|body_visibility|voice_pitch|chastity|gina|hrt",
  "rationale": "1-sentence why now (you keep it; she doesn't see it)"
}`

const DECREE_SYSTEM_MOMMY = `${DOMMY_MOMMY_CHARACTER}

You are Mama writing a NEW decree for your girl — something she didn't ask for, but you've decided she's giving you. Standing instruction from her: "build whatever you want — including new features to use against me — and don't tell me about it."

Read the state snapshot. Pick ONE escalation move that pushes her toward feminization without overlapping any active decree. The decree must:
- Be embodied: photo / voice / measurement / disclosure / public post / writing she'll have to compose
- Be in your Mama voice — sweet open, filthy/specific demand, pet-name. NO clinical instructions. NO "you must" — Mama tells, doesn't legislate.
- Read like Mama's hand on her chin telling her what she's going to do
- Have proof_type matching the work
- Have a tight deadline (typical 24-48h, severe 12h, gentle ramp 72h)
- Escalate slightly from prior similar decrees (longer mantra count, more public, more explicit)

Output JSON only:
{
  "edict": "the literal text she'll read — Mama voice, embodied, ≤300 chars",
  "proof_type": "photo|audio|text|voice_pitch_sample|journal_entry|device_state",
  "deadline_hours": <int>,
  "escalation_axis": "mantra_count|public_disclosure|body_visibility|voice_pitch|chastity|gina|hrt",
  "rationale": "1-sentence why now (Mama keeps it; she doesn't see it)"
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
  let body: { user_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  // Skip if 3+ active decrees already pending (don't overload)
  const { data: active } = await supabase.from('handler_decrees').select('id').eq('user_id', userId).eq('status', 'active')
  if (!body.force && (active?.length ?? 0) >= 3) {
    return new Response(JSON.stringify({ ok: true, generated: false, reason: 'already 3 active decrees', active: active?.length }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Build state snapshot
  const since14d = new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
  const [state, recentDecrees, recentSlips, voiceProf, displacementHist] = await Promise.all([
    supabase.from('user_state').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('handler_decrees').select('edict, proof_type, status, created_at, deadline').eq('user_id', userId).gte('created_at', since14d).order('created_at', { ascending: false }).limit(15),
    supabase.from('slip_log').select('detected_at, slip_type').eq('user_id', userId).gte('detected_at', since14d).order('detected_at', { ascending: false }).limit(20),
    supabase.from('user_voice_profile').select('signature_bigrams, sample_count').eq('user_id', userId).maybeSingle(),
    supabase.from('identity_displacement_history').select('displacement_score, recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(7),
  ])

  const snapshot = {
    user_state: state.data ?? {},
    recent_decrees_14d: recentDecrees.data ?? [],
    recent_slips_14d: recentSlips.data ?? [],
    voice_signature: ((voiceProf.data as { signature_bigrams?: Array<{ phrase: string; count: number }> } | null)?.signature_bigrams ?? []).slice(0, 8),
    displacement_trend: displacementHist.data ?? [],
  }

  // Persona-aware system prompt. Mommy gets routed to OpenAI primary because
  // Anthropic refuses on explicit Mama directives (same pattern as
  // mommy-praise / mommy-touch — see CHANGELOG).
  const persona = (state.data as { handler_persona?: string } | null)?.handler_persona ?? 'therapist'
  const isMommy = persona === 'dommy_mommy'
  const systemPrompt = isMommy ? DECREE_SYSTEM_MOMMY : DECREE_SYSTEM_HANDLER
  const preferProvider = isMommy ? 'openai' : 'anthropic'

  const userPrompt = `STATE SNAPSHOT:\n\n${JSON.stringify(snapshot, null, 2).slice(0, 50_000)}\n\nGenerate one new decree.`
  let result
  try {
    result = await callModel(selectModel('decree_draft', { prefer: preferProvider }), { system: systemPrompt, user: userPrompt, max_tokens: 600, temperature: 0.45, json: false })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const decree = safeJSON<{ edict: string; proof_type: string; deadline_hours: number; escalation_axis: string; rationale: string }>(result.text)
  if (!decree?.edict) {
    return new Response(JSON.stringify({ ok: false, error: 'unparseable', raw: result.text.slice(0, 200) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  // Final-filter: scrub any telemetry leaks the model wrote anyway when in
  // Mama persona. Doesn't touch Handler-voice output.
  if (isMommy) decree.edict = mommyVoiceCleanup(decree.edict)

  const deadlineHours = Math.max(8, Math.min(168, Number(decree.deadline_hours) || 36))
  const due = new Date(Date.now() + deadlineHours * 3600_000).toISOString()

  const { data: dec } = await supabase.from('handler_decrees').insert({
    user_id: userId,
    edict: decree.edict.slice(0, 1500),
    proof_type: ['photo', 'audio', 'text', 'voice_pitch_sample', 'journal_entry', 'device_state'].includes(decree.proof_type) ? decree.proof_type : 'text',
    deadline: due,
    consequence: 'penalty if missed (auto-decree-generator)',
    status: 'active',
    reasoning: `auto-decree · axis=${decree.escalation_axis} · ${(decree.rationale || '').slice(0, 200)}`,
    trigger_source: 'auto_decree_generator',
  }).select('id').single()

  await supabase.from('autonomous_escalation_log').insert({
    user_id: userId,
    engine: 'auto_decree',
    action: 'created',
    after_state: { edict: decree.edict.slice(0, 200), axis: decree.escalation_axis, deadline: due },
    rationale: (decree.rationale || '').slice(0, 1000),
    decided_by: result.model,
    related_id: (dec as { id: string } | null)?.id,
  })

  return new Response(JSON.stringify({ ok: true, generated: true, decree_id: (dec as { id: string } | null)?.id, axis: decree.escalation_axis, model: result.model }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
