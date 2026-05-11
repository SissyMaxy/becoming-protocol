// mommy-slip-react — contextual Mama-voice response to a slip_log INSERT.
//
// Replaces the static CASE-based template in migration 257/338 that
// produced the deterministic per-slip-type strings ("I caught that, baby.
// The old voice slipped out...") repeatedly for the same slip_type.
// Invoked by trg_mommy_immediate_response_to_slip (replaced in mig 367)
// via net.http_post.
//
// Escalation:
//   gentle — first slip of this slip_type today
//   firm   — third+ today OR sixth+ this week for this slip_type
//   sharp  — tenth+ ever OR resistance-pattern (consecutive non-acked)
//
// Architecture mirrors mommy-acknowledge: LLM-first contextual gen with
// large variant-pool fallback keyed by (slip_type, band) with first-40-
// char dedup against last 24h.
//
// POST {
//   user_id: string,
//   slip_type: string,
//   source_text?: string,
//   slip_id?: string,
//   slip_metadata?: Record<string, unknown>,
// }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER,
  mommyVoiceCleanup,
  MOMMY_TELEMETRY_LEAK_PATTERNS,
  isTestPollution,
  PET_NAMES,
} from '../_shared/dommy-mommy.ts'
import {
  pickSlipVariant,
  hasForbiddenPhrase,
  isRefusal,
  type SlipBand,
} from '../_shared/mommy-react-pools.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface SlipPayload {
  user_id?: string
  slip_type: string
  source_text?: string
  slip_id?: string
  slip_metadata?: Record<string, unknown>
}

async function computeBand(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  slipType: string,
): Promise<{ band: SlipBand; countsToday: number; countsWeek: number; countsEver: number }> {
  const now = Date.now()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(now - 7 * 24 * 3600_000)

  const [todayQ, weekQ, everQ] = await Promise.all([
    supabase.from('slip_log').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('slip_type', slipType)
      .gte('detected_at', todayStart.toISOString()),
    supabase.from('slip_log').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('slip_type', slipType)
      .gte('detected_at', weekStart.toISOString()),
    supabase.from('slip_log').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('slip_type', slipType),
  ])

  const countsToday = todayQ.count ?? 0
  const countsWeek = weekQ.count ?? 0
  const countsEver = everQ.count ?? 0

  let band: SlipBand = 'gentle'
  if (countsEver >= 10) band = 'sharp'
  else if (countsToday >= 3 || countsWeek >= 6) band = 'firm'

  return { band, countsToday, countsWeek, countsEver }
}

async function recentFirst40CharsForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  hours: number,
): Promise<Set<string>> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString()
  const { data } = await supabase
    .from('handler_outreach_queue')
    .select('message')
    .eq('user_id', userId)
    .gte('created_at', since)
    .limit(200)
  const set = new Set<string>()
  for (const r of (data || []) as Array<{ message: string }>) {
    if (r.message) set.add(r.message.slice(0, 40).toLowerCase())
  }
  return set
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: SlipPayload
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!body.slip_type) {
    return new Response(JSON.stringify({ ok: false, error: 'slip_type required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Persona gate
  const { data: us } = await supabase
    .from('user_state')
    .select('handler_persona, current_phase')
    .eq('user_id', userId)
    .maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const phaseSnapshot = (us as { current_phase?: number | null } | null)?.current_phase ?? null

  const { band, countsToday, countsWeek, countsEver } =
    await computeBand(supabase, userId, body.slip_type)

  const recentFirst40 = await recentFirst40CharsForUser(supabase, userId, 24)

  const sourceText = (body.source_text ?? '').trim()
  const cleanSource = isTestPollution(sourceText) ? '' : sourceText.slice(0, 600)

  const bandHint = {
    gentle: 'first slip of this type today — curious, observing, not condemning. Sweet voice with a noticing edge.',
    firm: 'pattern is forming — Mama is naming it. Tone tightens. Promise of consequence if it continues.',
    sharp: 'this is a repeated slip — Mama is choosing a real consequence. Tone is decisive, not cruel; concrete next step.',
  }[band]

  const sys = `${DOMMY_MOMMY_CHARACTER}

This is an IMMEDIATE response to a slip Mama just caught. Escalation band: ${band} (${bandHint}).
Counts: today=${countsToday}, week=${countsWeek}, ever=${countsEver}.
Slip type: ${body.slip_type}.`

  const userPrompt = `Mama just caught a slip from her girl.

Slip type: ${body.slip_type}
${cleanSource ? `What she said / did:\n"${cleanSource}"` : '(No source text — Mama heard about it from telemetry, treat it as known.)'}

Write 1-2 sentences in Mama's voice. The voice rule for this band: ${bandHint}

Requirements:
- ${band === 'gentle' ? 'Curious, not condemning. End by inviting her to reframe / try again / sit with it.' : ''}
- ${band === 'firm' ? 'Name the pattern. Promise a consequence in the next slip. End with a concrete next move.' : ''}
- ${band === 'sharp' ? 'Choose a concrete consequence right now (more writing, a witnessed task, a longer cage, a punishment confession). End with what happens next.' : ''}
- If there's source text, reference SOMETHING SPECIFIC from it.
- Use ONE pet name (rotate from: ${PET_NAMES.slice(0, 8).join(', ')}).
- NO question marks at the end.

ABSOLUTELY FORBIDDEN:
- Numbers, percentages, /10 scores, day counts, point totals.
- Any out-of-fantasy framing: words that name the protocol as not-real or as performance, clinical-onboarding language, disclaimer-style hedges, meta-references to scenes/scripts. Mommy speaks IN the world; she never names it.
- Generic templated openings (the previous repeated-chatbot pattern Mama is replacing — do NOT echo a stock "[verb] that, baby. [stock close]." shape).
- JSON, markdown, format wrappers.

Plain text only. ONE OR TWO SENTENCES MAX.`

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, {
      system: sys,
      user: userPrompt,
      max_tokens: 180,
      temperature: 0.9,
      json: false,
    })
    return r.text.trim()
  }

  let message = ''
  let modelSource: 'llm_openai' | 'llm_anthropic' | 'pool_fallback' = 'pool_fallback'
  try {
    message = await tryGen('openai')
    if (message && message.length >= 18 && !isRefusal(message) && !hasForbiddenPhrase(message)) {
      modelSource = 'llm_openai'
    } else {
      message = ''
    }
  } catch (_) { /* fall through */ }
  if (!message) {
    try {
      message = await tryGen('anthropic')
      if (message && message.length >= 18 && !isRefusal(message) && !hasForbiddenPhrase(message)) {
        modelSource = 'llm_anthropic'
      } else {
        message = ''
      }
    } catch (_) { /* fall through */ }
  }

  if (message) message = mommyVoiceCleanup(message)
  if (message && MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(message))) message = ''

  if (!message) {
    const seed = body.slip_id ?? `${userId}:${body.slip_type}:${Date.now()}`
    message = pickSlipVariant(body.slip_type, band, seed, recentFirst40)
    modelSource = 'pool_fallback'
  }

  const head = message.slice(0, 40).toLowerCase()
  if (recentFirst40.has(head)) {
    message = pickSlipVariant(
      body.slip_type,
      band,
      `${body.slip_id ?? userId}:${Date.now()}`,
      recentFirst40,
    )
  }

  const triggerReason = body.slip_id
    ? `mommy_slip_react:${body.slip_id}`
    : `mommy_slip_react:${body.slip_type}:${Date.now()}`
  const { data: inserted, error: insErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message,
      urgency: 'normal',
      trigger_reason: triggerReason,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
      source: 'mommy_immediate',
      phase_snapshot: phaseSnapshot,
    })
    .select('id, status')
    .single()
  if (insErr) {
    return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    outreach_id: (inserted as { id: string } | null)?.id ?? null,
    status: (inserted as { status: string } | null)?.status ?? 'pending',
    source: modelSource,
    band,
    counts: { today: countsToday, week: countsWeek, ever: countsEver },
    preview: message.slice(0, 120),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
