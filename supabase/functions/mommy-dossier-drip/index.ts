// mommy-dossier-drip — surfaces one dossier_questions row at a time as
// a Today outreach card so Mama can extract the dossier from the user
// over time instead of demanding the full quiz up front.
//
// Selection rules (mirrored from src/lib/persona/dossier-selector.ts):
//   1. user_state.handler_persona must be dommy_mommy.
//   2. 18h cooldown between fires per user — cron may run more often
//      without stacking; explicit POST { user_id } can force-trigger.
//   3. Drop questions where phase_min > user.current_phase or
//      intensity_min > intensity(user.escalation_level).
//   4. Drop questions already answered (answered_at NOT NULL on any
//      response row) or skipped within the last 14 days.
//   5. Coverage bias — prefer categories the user has answered LEAST.
//   6. Within the chosen category cohort: lowest priority value first.
//   7. Recency avoidance — if the chosen category matches the most
//      recently delivered question's category, fall through to the
//      next-best category if one exists.
//
// On fire: insert handler_outreach_queue row (source='dossier_question',
// trigger_reason='dossier_drip:<question_id>') + dossier_question_responses
// row stamped with delivered_at + outreach_id.
//
// POST { user_id?, force?: boolean }. Cron weekly + on session events.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const COOLDOWN_HOURS = 18
const SKIP_COOLDOWN_DAYS = 14

type Intensity = 'gentle' | 'firm' | 'cruel'
const INTENSITY_RANK: Record<Intensity, number> = { gentle: 1, firm: 2, cruel: 3 }
const escalationToIntensity = (lvl: number): Intensity =>
  lvl >= 5 ? 'cruel' : lvl >= 3 ? 'firm' : 'gentle'

interface QuestionRow {
  id: string
  question_key: string
  category: string
  question_text: string
  placeholder: string | null
  phase_min: number
  intensity_min: Intensity
  priority: number
  importance: number
  tone: 'soft' | 'direct' | 'filthy'
  expected_response_kind: string
}

interface ResponseRow {
  question_id: string
  category: string
  answered_at: string | null
  skipped: boolean
  delivered_at: string | null
  updated_at: string
}

function pickQuestion(
  catalog: QuestionRow[],
  responses: ResponseRow[],
  currentPhase: number,
  intensity: Intensity,
  now: Date,
): { pick: QuestionRow | null; reason: string } {
  if (catalog.length === 0) return { pick: null, reason: 'empty_catalog' }

  const skipFloor = new Date(now.getTime() - SKIP_COOLDOWN_DAYS * 86400_000).getTime()
  const answered = new Set<string>()
  const recentlySkipped = new Set<string>()
  const answeredByCategory: Record<string, number> = {}
  let lastDelivery: { category: string; at: number } | null = null

  for (const r of responses) {
    if (r.answered_at) {
      answered.add(r.question_id)
      answeredByCategory[r.category] = (answeredByCategory[r.category] ?? 0) + 1
    }
    if (r.skipped && new Date(r.updated_at).getTime() > skipFloor) {
      recentlySkipped.add(r.question_id)
    }
    if (r.delivered_at) {
      const t = new Date(r.delivered_at).getTime()
      if (!lastDelivery || t > lastDelivery.at) lastDelivery = { category: r.category, at: t }
    }
  }

  const eligible = catalog
    .filter(q => q.phase_min <= currentPhase)
    .filter(q => INTENSITY_RANK[intensity] >= INTENSITY_RANK[q.intensity_min])
    .filter(q => !answered.has(q.id))
    .filter(q => !recentlySkipped.has(q.id))

  if (eligible.length === 0) return { pick: null, reason: 'no_eligible_questions' }

  eligible.sort((a, b) => {
    const ca = answeredByCategory[a.category] ?? 0
    const cb = answeredByCategory[b.category] ?? 0
    if (ca !== cb) return ca - cb
    return a.priority - b.priority
  })

  const top = eligible[0]
  if (lastDelivery && top.category === lastDelivery.category) {
    const alt = eligible.find(q => q.category !== lastDelivery!.category)
    if (alt) return { pick: alt, reason: 'ok_recency_swap' }
  }
  return { pick: top, reason: 'ok' }
}

function composeMessage(q: QuestionRow): string {
  const intro =
    q.tone === 'filthy'
      ? "Mama wants the truth, baby."
      : q.tone === 'direct'
      ? "Mama needs you direct, sweet thing."
      : "Mama's asking sweetly."
  const closer = "answer when you can, or skip and Mama'll come back to it."
  return `${intro}\n\n${q.question_text}\n\n${closer}`
}

async function fireForUser(supabase: SupabaseClient, userId: string, force: boolean): Promise<Record<string, unknown>> {
  const { data: stateRow } = await supabase.from('user_state')
    .select('handler_persona, current_phase, escalation_level')
    .eq('user_id', userId).maybeSingle()
  const state = stateRow as { handler_persona?: string; current_phase?: number; escalation_level?: number } | null
  if (state?.handler_persona !== 'dommy_mommy') {
    return { ok: true, user_id: userId, skipped: 'persona_not_dommy_mommy' }
  }

  if (!force) {
    const since = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString()
    const { count } = await supabase.from('handler_outreach_queue')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('source', 'dossier_question').gte('created_at', since)
    if ((count ?? 0) > 0) {
      return { ok: true, user_id: userId, skipped: 'cooldown' }
    }
  }

  const { data: catalog } = await supabase.from('dossier_questions')
    .select('id, question_key, category, question_text, placeholder, phase_min, intensity_min, priority, importance, tone, expected_response_kind')
    .eq('active', true)
  const catalogRows = (catalog ?? []) as QuestionRow[]

  const { data: responses } = await supabase.from('dossier_question_responses')
    .select('question_id, category, answered_at, skipped, delivered_at, updated_at')
    .eq('user_id', userId)
  const responseRows = (responses ?? []) as ResponseRow[]

  const phase = state?.current_phase ?? 0
  const intensity = escalationToIntensity(state?.escalation_level ?? 1)

  const { pick, reason } = pickQuestion(catalogRows, responseRows, phase, intensity, new Date())
  if (!pick) {
    return { ok: true, user_id: userId, skipped: reason }
  }

  const message = composeMessage(pick)
  const { data: outreach, error: outErr } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message,
    urgency: 'low',
    trigger_reason: `dossier_drip:${pick.id}`,
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    source: 'dossier_question',
  }).select('id').single()
  if (outErr) {
    console.error('[mommy-dossier-drip] outreach insert failed:', outErr)
    return { ok: false, user_id: userId, error: 'outreach_insert_failed', detail: outErr.message }
  }
  const outreachId = (outreach as { id: string } | null)?.id ?? null

  const { error: respErr } = await supabase.from('dossier_question_responses').insert({
    user_id: userId,
    question_id: pick.id,
    question_key: pick.question_key,
    delivered_at: new Date().toISOString(),
    outreach_id: outreachId,
    source: 'drip',
  })
  if (respErr) {
    console.error('[mommy-dossier-drip] response insert failed:', respErr)
    return { ok: false, user_id: userId, error: 'response_insert_failed', detail: respErr.message }
  }

  return {
    ok: true,
    user_id: userId,
    fired: 1,
    question_id: pick.id,
    question_key: pick.question_key,
    category: pick.category,
    outreach_id: outreachId,
    reason,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  let body: { user_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* no body, fine */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = body.force === true

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  const result = await fireForUser(supabase, userId, force)
  const status = (result as { ok?: boolean }).ok === false ? 500 : 200
  return new Response(JSON.stringify(result), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
