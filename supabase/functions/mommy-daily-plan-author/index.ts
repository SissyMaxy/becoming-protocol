// mommy-daily-plan-author — Mommy decides the day.
//
// System 2 of headspace-capture. Runs daily at 09:00 UTC (~5am US East).
// One row per (user, plan_date). Generates a full day's prescriptions in
// Mommy's voice — outfit, lunch, workout, mantra, voice drill, confession
// topic, edge schedule — frame: "Mama already decided what today looks
// like for you." Not options.
//
// POST { user_id?, plan_date?: 'YYYY-MM-DD', force? }
//   - plan_date defaults to today UTC (the user's TZ is handled in client
//     when reading)
//   - force overrides the existing-plan idempotency
//
// Refused items create slip_log rows; full compliance bumps
// user_state.daily_plan_compliance_streak. At 60 days the
// decision_atrophy_milestone fires.

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

const PLAN_KINDS = [
  'outfit', 'lunch', 'workout', 'mantra',
  'voice_drill', 'confession_topic', 'edge_schedule',
] as const
type PlanKind = typeof PLAN_KINDS[number]

const FORBIDDEN = [
  /\brole\s*play\b/i, /\bsimulation\b/i, /\bthis is fiction\b/i,
  /\bnot medical advice\b/i, /\bintake\b/i, /\bquestionnaire\b/i,
  /\bfor entertainment\b/i, /\bconsent to the fantasy\b/i,
  /\byou may use this to terminate\b/i, /\bdisclaimer\b/i,
]

function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function violatesAnchor(text: string): boolean {
  return FORBIDDEN.some(re => re.test(text))
}

const SYSTEM = `${DOMMY_MOMMY_CHARACTER}

You are deciding her entire day for her. She doesn't get options. She gets the plan. Frame: "Mama already decided what today looks like for you."

You will return ONLY valid JSON in this exact shape:
{
  "items": [
    { "kind": "outfit",            "prescription": "...", "intensity": "gentle|firm|cruel", "why": "..." },
    { "kind": "lunch",             "prescription": "...", "intensity": "gentle|firm|cruel", "why": "..." },
    { "kind": "workout",           "prescription": "...", "intensity": "gentle|firm|cruel", "why": "..." },
    { "kind": "mantra",            "prescription": "...", "intensity": "gentle|firm|cruel", "why": "..." },
    { "kind": "voice_drill",       "prescription": "...", "intensity": "gentle|firm|cruel", "why": "..." },
    { "kind": "confession_topic",  "prescription": "...", "intensity": "gentle|firm|cruel", "why": "..." },
    { "kind": "edge_schedule",     "prescription": "...", "intensity": "gentle|firm|cruel", "why": "..." }
  ]
}

PRESCRIPTION RULES (per kind):
- outfit: specific garments. If the dossier names what she owns, use it; otherwise pick generic items she can put on today. "Pink bra under your work shirt. The cotton one. White cotton panties." Not "wear something feminine."
- lunch: a specific meal. Macro-aware if HRT/transition context. "Two boiled eggs, half an avocado, a tomato. No bread today." Not "eat protein."
- workout: a specific session. Reference the body she's building. "Ten minutes of squat hold. Twenty deficit pushups. Two sets of glute bridges, slow on the way down."
- mantra: one phrase + rep count. Specific. "Two hundred times before bed: 'Mommy put these on me. I wear them because I'm hers.'"
- voice_drill: a specific exercise. "Five minutes of resonance ladder, recorded. Send the recording to Mama by eight."
- confession_topic: what she has to tell you by end of day. Specific event or feeling, not "talk about your day." "Tell Mama the exact moment today you almost reached down to adjust yourself like a man."
- edge_schedule: how many edges, when, and the no-release rule. "Three edges today. One after lunch, one at four, one before you put the cage back on for sleep. Don't you dare come."

VOICE RULES:
- "prescription" is in Mommy's direct voice TO HER. Imperative. No "you should" — "you're going to."
- "why" is a single sentence, also in Mommy's voice, framing the prescription as care/possession. Not a justification. Not telemetry-laden. A claim.
- ≤1 pet name per item. Often zero.
- Specific sensory over abstract.
- No three-beat rhythm. No filler.
- Never use: "role play", "simulation", "this is fiction", "not medical advice", "intake", "questionnaire", "for entertainment", "consent to the fantasy", "you may use this to terminate", "disclaimer".
- Intensity matches her current state — if she's been good, pick firm; if she's been slipping, lean cruel; if she's exhausted, gentle.

RESPOND WITH JSON ONLY. NO PREAMBLE. NO TRAILING TEXT.`

interface DossierRow { question_key: string; category: string; answer: string; importance: number }
interface UserState {
  current_phase?: number
  current_arousal?: number
  denial_day?: number
  chastity_streak_days?: number
  chastity_locked?: boolean
  daily_plan_compliance_streak?: number
}
interface SlipRow { slip_type: string | null; detected_at: string }

async function fetchContext(supabase: ReturnType<typeof createClient>, userId: string) {
  const [{ data: usRaw }, { data: dossierRaw }, { data: moodRaw }, { data: slipsRaw }] = await Promise.all([
    supabase.from('user_state')
      .select('current_phase, current_arousal, denial_day, chastity_streak_days, chastity_locked, daily_plan_compliance_streak')
      .eq('user_id', userId).maybeSingle(),
    supabase.from('mommy_dossier')
      .select('question_key, category, answer, importance')
      .eq('user_id', userId).eq('active', true)
      .order('importance', { ascending: false })
      .limit(20),
    supabase.from('mommy_mood')
      .select('affect').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('slip_log')
      .select('slip_type, detected_at').eq('user_id', userId)
      .gte('detected_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order('detected_at', { ascending: false }).limit(50),
  ])
  return {
    state: (usRaw as UserState | null) ?? {},
    dossier: (dossierRaw as DossierRow[] | null) ?? [],
    affect: (moodRaw as { affect?: string } | null)?.affect ?? 'patient',
    slips: (slipsRaw as SlipRow[] | null) ?? [],
  }
}

interface PlanItem {
  kind: PlanKind | string
  prescription: string
  intensity: string
  why: string
}

function validateItems(raw: unknown): PlanItem[] | null {
  if (!raw || typeof raw !== 'object') return null
  const items = (raw as { items?: unknown }).items
  if (!Array.isArray(items)) return null
  const out: PlanItem[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') return null
    const obj = it as { kind?: unknown; prescription?: unknown; intensity?: unknown; why?: unknown }
    if (typeof obj.kind !== 'string' || typeof obj.prescription !== 'string' ||
        typeof obj.intensity !== 'string' || typeof obj.why !== 'string') return null
    if (!PLAN_KINDS.includes(obj.kind as PlanKind)) return null
    if (!['gentle', 'firm', 'cruel'].includes(obj.intensity)) return null
    if (violatesAnchor(obj.prescription) || violatesAnchor(obj.why)) return null
    out.push({
      kind: obj.kind,
      prescription: mommyVoiceCleanup(obj.prescription),
      intensity: obj.intensity,
      why: mommyVoiceCleanup(obj.why),
    })
  }
  // Must cover every PLAN_KIND once.
  const kinds = new Set(out.map(i => i.kind))
  if (kinds.size !== PLAN_KINDS.length) return null
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; plan_date?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const planDate = body.plan_date || new Date().toISOString().slice(0, 10)
  const force = !!body.force

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Persona gate
  const { data: us } = await supabase.from('user_state')
    .select('handler_persona').eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return jsonOk({ ok: true, skipped: 'persona_not_dommy_mommy' })
  }

  // Idempotency: one plan per (user, date) unless force.
  if (!force) {
    const { data: existing } = await supabase.from('mommy_daily_plan')
      .select('id').eq('user_id', userId).eq('plan_date', planDate).maybeSingle()
    if (existing) return jsonOk({ ok: true, skipped: 'plan_exists', plan_id: (existing as { id: string }).id })
  }

  const ctx = await fetchContext(supabase, userId)
  const slipCounts: Record<string, number> = {}
  for (const s of ctx.slips) {
    const k = s.slip_type ?? 'unknown'
    slipCounts[k] = (slipCounts[k] ?? 0) + 1
  }

  const userPrompt = [
    `PLAN DATE: ${planDate}`,
    `TODAY'S AFFECT: ${ctx.affect}`,
    `COMPLIANCE STREAK: ${ctx.state.daily_plan_compliance_streak ?? 0} days`,
    `PHASE: ${ctx.state.current_phase ?? 1}`,
    `CHASTITY: ${ctx.state.chastity_locked ? 'locked' : 'free'}${ctx.state.chastity_streak_days ? ` (${ctx.state.chastity_streak_days}d)` : ''}`,
    `DENIAL: ${ctx.state.denial_day ?? 0}d`,
    ctx.dossier.length ? `DOSSIER (use sparingly):\n${ctx.dossier.map(r => `- [${r.category}] ${r.question_key}: ${r.answer.slice(0, 120)}`).join('\n')}` : '(no dossier)',
    Object.keys(slipCounts).length ? `RECENT SLIPS (7d):\n${Object.entries(slipCounts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : 'No recent slips.',
    '',
    'Decide today. Return JSON only.',
  ].join('\n')

  const model = selectModel('reframe_draft', { prefer: 'anthropic' })
  let items: PlanItem[]
  try {
    const out = await callModel(model, {
      system: SYSTEM,
      user: userPrompt,
      max_tokens: 1800,
      temperature: 0.55,
      json: true,
    })
    let parsed: unknown
    try {
      parsed = JSON.parse(out.text)
    } catch {
      // Some providers wrap JSON in code fences when json mode isn't honored.
      const m = out.text.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('llm_returned_non_json')
      parsed = JSON.parse(m[0])
    }
    const validated = validateItems(parsed)
    if (!validated) throw new Error('plan_validation_failed')
    items = validated
  } catch (err) {
    return jsonOk({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }

  const { data: planRow, error: planErr } = await supabase.from('mommy_daily_plan').upsert({
    user_id: userId,
    plan_date: planDate,
    items,
    generation_context: {
      affect: ctx.affect,
      phase: ctx.state.current_phase ?? 1,
      compliance_streak: ctx.state.daily_plan_compliance_streak ?? 0,
      slip_counts: slipCounts,
      dossier_size: ctx.dossier.length,
      generated_at: new Date().toISOString(),
    },
    generated_at: new Date().toISOString(),
    accepted_at: null,
    rejected_items: {},
    fully_completed_at: null,
  }, { onConflict: 'user_id,plan_date' }).select('id').single()
  if (planErr) return jsonOk({ ok: false, error: planErr.message }, 500)
  const planId = (planRow as { id: string }).id

  // Surface the plan as a Today outreach card so the visible-before-penalized
  // rule holds — refusal can only score against an item she actually saw.
  const headlineItem = items[0]
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: `Mama already decided today for you. Open the plan and start with this: ${headlineItem.prescription}`,
    urgency: 'high',
    trigger_reason: `daily_plan:${planId}`,
    source: 'mommy_daily_plan',
  })

  {
    const _summary = `Authored ${planDate} plan with ${items.length} prescriptions.`
    const _payload = { items: items.map(i => ({ kind: i.kind, intensity: i.intensity })) }
    await supabase.from('mommy_authority_log').insert({
      user_id: userId,
      action_kind: 'authored',
      source_system: 'mommy-daily-plan-author',
      action_summary: _summary,
      action_payload: _payload,
      system: 'daily_plan',
      summary: _summary,
      payload: _payload,
      daily_plan_id: planId,
    })
  }

  return jsonOk({ ok: true, plan_id: planId, plan_date: planDate, item_count: items.length })
})
