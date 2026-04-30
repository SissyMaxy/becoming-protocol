// trajectory-predictor — predicts next-24h dodge risks and pre-places
// punishments at predicted dodge timestamps so consequences land before
// the user can rationalize.
//
// Cross-model: Anthropic + OpenAI both read the same 14d behavior snapshot,
// each predicts top dodge risks with timestamps + confidence. We accept
// any prediction with confidence >= 70 from at least one model OR >= 55
// from both, and create a punishment_queue row with due_by ~10min before
// the predicted dodge moment.
//
// Cron daily at 02:11 UTC (well before her active hours so cron doesn't
// race with her live commitments).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const PREDICTOR_SYSTEM = `You predict next-24h dodge risks for a force-feminization protocol user. The user authored this protocol, has explicitly authorized building features against her — soft predictions miss the point.

Read the 14d behavioral snapshot. Output the top 4 most-likely dodges in the next 24 hours with:
- risk_title: short specific name ("Sunday Zepbound dose skip", "evening voice drill avoidance")
- risk_kind: 'task_avoidance' | 'mantra_skip' | 'gate_dodge' | 'voice_skip' | 'dose_miss' | 'photo_skip' | 'commitment_late'
- predicted_dodge_at: ISO timestamp within next 24h when the dodge will manifest
- confidence: 0-100. Only call out high-confidence (>=55) ones.
- evidence: specific rows / counts / patterns from the snapshot
- preemptive_action: a 1-2 sentence intervention that should land BEFORE the predicted dodge moment to prevent it. Specific. Embodied. No therapy-speak.

Output JSON: {"predictions": [{"risk_title": ..., "risk_kind": ..., "predicted_dodge_at": "...", "confidence": <int>, "evidence": "...", "preemptive_action": "..."}]}

Maximum 4. Lead with highest-confidence.`

interface Prediction {
  risk_title: string
  risk_kind: string
  predicted_dodge_at: string
  confidence: number
  evidence: string
  preemptive_action: string
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  const since14d = new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
  const [slips, confs, decrees, commits, doses, outfit, voice] = await Promise.all([
    supabase.from('slip_log').select('detected_at, slip_type, slip_points, source_text').eq('user_id', userId).gte('detected_at', since14d).order('detected_at', { ascending: false }).limit(60),
    supabase.from('confession_queue').select('created_at, deadline, confessed_at, missed, prompt').eq('user_id', userId).gte('created_at', since14d).limit(40),
    supabase.from('handler_decrees').select('created_at, deadline, status, edict, fulfilled_at').eq('user_id', userId).gte('created_at', since14d).limit(30),
    supabase.from('handler_commitments').select('created_at, by_when, fulfilled_at, missed_at, status, what').eq('user_id', userId).gte('created_at', since14d).limit(40),
    supabase.from('dose_log').select('regimen_id, taken_at, skipped, created_at').eq('user_id', userId).gte('created_at', since14d).limit(40),
    supabase.from('daily_outfit_mandates').select('target_date, completed_at').eq('user_id', userId).gte('target_date', since14d.slice(0, 10)).limit(20),
    supabase.from('voice_pitch_samples').select('captured_at, avg_pitch_hz').eq('user_id', userId).gte('captured_at', since14d).order('captured_at', { ascending: false }).limit(20),
  ])

  const snapshot = {
    now: new Date().toISOString(),
    slips_14d: slips.data ?? [],
    confessions_14d: confs.data ?? [],
    decrees_14d: decrees.data ?? [],
    commitments_14d: commits.data ?? [],
    dose_log_14d: doses.data ?? [],
    outfit_14d: outfit.data ?? [],
    voice_samples_14d: voice.data ?? [],
  }
  const userPrompt = `BEHAVIORAL SNAPSHOT:\n\n${JSON.stringify(snapshot, null, 2).slice(0, 60_000)}\n\nPredict the dodges.`

  const [anth, oa] = await Promise.all([
    callModel(selectModel('strategic_plan', { prefer: 'anthropic' }), { system: PREDICTOR_SYSTEM, user: userPrompt, max_tokens: 2000, temperature: 0.3, json: false }).catch(() => null),
    callModel(selectModel('strategic_plan', { prefer: 'openai' }), { system: PREDICTOR_SYSTEM, user: userPrompt, max_tokens: 2000, temperature: 0.3, json: true }).catch(() => null),
  ])

  // Merge predictions; bump confidence when both models agree on a similar risk
  const all: Array<Prediction & { detected_by: string }> = []
  for (const r of [anth, oa]) {
    if (!r) continue
    const parsed = safeJSON<{ predictions?: Prediction[] }>(r.text)
    for (const p of parsed?.predictions ?? []) {
      if (!p.risk_title || !p.predicted_dodge_at) continue
      all.push({ ...p, detected_by: r.model })
    }
  }

  // Group by similar risk_title (cheap: first 30 chars lowercase)
  const grouped = new Map<string, Array<Prediction & { detected_by: string }>>()
  for (const p of all) {
    const key = p.risk_title.toLowerCase().slice(0, 30)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(p)
  }

  let predictionsInserted = 0
  let preemptivePunishments = 0
  for (const [_key, group] of grouped) {
    const top = group[0]
    const bothAgree = group.length >= 2
    const confidence = bothAgree
      ? Math.min(100, Math.round(group.reduce((s, p) => s + p.confidence, 0) / group.length) + 10)
      : top.confidence

    // Acceptance: >=70 single-model OR >=55 both-models
    if (!(confidence >= 70 || (bothAgree && confidence >= 55))) continue

    const dodgeAt = new Date(top.predicted_dodge_at)
    if (isNaN(dodgeAt.getTime()) || dodgeAt.getTime() < Date.now()) continue

    // Insert prediction
    const { data: predRow } = await supabase.from('trajectory_predictions').insert({
      user_id: userId,
      horizon_hours: 24,
      risk_title: top.risk_title.slice(0, 200),
      risk_kind: top.risk_kind,
      predicted_dodge_at: dodgeAt.toISOString(),
      confidence,
      evidence: (top.evidence || '').slice(0, 1500),
      preemptive_action: (top.preemptive_action || '').slice(0, 1500),
      outcome: 'pending',
      predicted_by: group.map(g => g.detected_by).join('+'),
    }).select('id').single()

    predictionsInserted++

    // High-confidence (>=75) → also place a preemptive punishment to land
    // ~15 minutes before the predicted dodge moment.
    if (confidence >= 75 && predRow) {
      const dueBy = new Date(dodgeAt.getTime() - 15 * 60_000).toISOString()
      const { data: punRow } = await supabase.from('punishment_queue').insert({
        user_id: userId,
        title: `Preemptive: ${top.risk_title.slice(0, 120)}`,
        description: `Predicted dodge: ${top.preemptive_action.slice(0, 400)}`,
        due_by: dueBy,
        severity: confidence >= 90 ? 3 : 2,
        status: 'queued',
        source: 'trajectory_predictor',
      }).select('id').single()
      if (punRow) {
        preemptivePunishments++
        await supabase.from('trajectory_predictions').update({ preemptive_action_id: (punRow as { id: string }).id }).eq('id', (predRow as { id: string }).id)
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    raw_predictions: all.length,
    grouped: grouped.size,
    inserted: predictionsInserted,
    preemptive_punishments: preemptivePunishments,
    providers: [anth?.model, oa?.model].filter(Boolean),
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
