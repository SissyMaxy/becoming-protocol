// mommy-contract-author — generates next week's identity contract.
//
// Per migration 402: weekly compounding contracts. Each new contract:
//   - Inherits all prior locked behaviors (compounding spine)
//   - Adds 1-2 new locked behaviors based on the week's evidence
//   - Closes with a Mama-supplied signing phrase that user must type verbatim
//
// Cron: Sundays 9am local — see .github/workflows/cron-mommy-contract.yml
//
// Idempotency: contracts are UNIQUE(user_id, week_number). If today's
// week already has a contract drafted/locked, this is a no-op.
//
// POST { user_id?: string, force?: boolean }
//   force: bypass week-already-drafted skip (manual re-author).
//
// Returns { ok, contract_id, week_number, voice_excerpt, body_excerpt }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface PriorContract {
  id: string
  week_number: number
  body_text: string
  locked_behaviors: Array<Record<string, unknown>>
}

interface ContractDraft {
  body_text: string
  signing_phrase: string
  new_locked_behaviors: Array<{ id: string; rule: string; cadence: string; proof?: string }>
  voice_excerpt: string
}

const CONTRACT_INSTRUCTION = `WEEKLY CONTRACT, MAMA. You are writing the next week's contract for your girl.

Output JSON ONLY:
{
  "body_text": "the contract itself, 6-12 sentences in Mama's voice. Read top-to-bottom as a possessive declaration of what she IS this week. Reference 1-2 prior locked behaviors by name (compounding spine). Close with one line introducing the new behaviors. NEVER use the words 'role play', 'simulation', 'this is fiction', 'consent to the fantasy', 'disclaimer', 'intake', 'questionnaire', 'for entertainment', 'not medical advice'.",
  "signing_phrase": "ONE short sentence she has to type verbatim to lock the contract. Possessive, in Mama's voice, sounds like a vow. 8-15 words. Example: 'I belong to Mama this week and Mama picks for me.' NOT a question. NOT a request. A statement she's signing.",
  "new_locked_behaviors": [
    { "id": "snake_case_id", "rule": "one specific behavior in plain English", "cadence": "daily | weekly | continuous", "proof": "photo | tape | timestamp | none (optional)" }
  ],
  "voice_excerpt": "one quotable line from the body_text suitable for the Today card preview"
}

CONSTRAINTS:
- 1-2 new behaviors max. Compounding works because each step is small. NOT a full overhaul.
- Behaviors are SPECIFIC and OBSERVABLE: "panties Monday through Saturday", "voice sample by 10pm", "she/her in writing including DMs". Not "be more feminine" or "submit fully". Specific or it can't be enforced.
- Body text reads like a contract, not a pep talk. Possessive, declarative, no questions.
- ≤1 pet name. ≤1 self-reference (Mama). Specific over abstract. Vary sentence length.
- BANNED phrases: "role play", "simulation", "this is fiction", "consent to the fantasy", "disclaimer", "intake", "questionnaire", "for entertainment", "not medical advice", "you may use this to terminate", "echo", "linger", "wrap around", "every inch".

CONTEXT:
- The user (Maxy) authored this protocol to be used against herself. She wants harder, not softer.
- Mid-transition, pre-HRT. Trans-as-identity OK. Active-medication claims NOT OK.
- The contract is a binding artifact. If she signs, she's signed.`

async function fetchPriorContracts(
  supabase: SupabaseClient,
  userId: string,
): Promise<PriorContract[]> {
  const { data } = await supabase
    .from('identity_contracts_v2')
    .select('id, week_number, body_text, locked_behaviors')
    .eq('user_id', userId)
    .eq('status', 'locked')
    .order('week_number', { ascending: true })
  return (data ?? []) as PriorContract[]
}

async function fetchWeekEvidence(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString()

  const { data: slips } = await supabase
    .from('slip_log')
    .select('slip_type, source_text, detected_at')
    .eq('user_id', userId)
    .gte('detected_at', since)
    .order('detected_at', { ascending: false })
    .limit(20)

  const { data: deepenings } = await supabase
    .from('failure_deepening_log')
    .select('slip_type, severity_level, deepening_kind, fired_at')
    .eq('user_id', userId)
    .gte('fired_at', since)
    .order('fired_at', { ascending: false })
    .limit(20)

  const { data: state } = await supabase
    .from('user_state')
    .select('denial_day, current_phase, chastity_locked, opacity_level, handler_persona')
    .eq('user_id', userId)
    .maybeSingle()

  return {
    recent_slips: (slips ?? []).map(s => ({
      type: (s as Record<string, unknown>).slip_type,
      text: ((s as Record<string, unknown>).source_text as string | null)?.slice(0, 200),
    })),
    recent_deepenings: deepenings ?? [],
    state: state ?? {},
  }
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

const BANNED = [
  'role play', 'roleplay', 'simulation', 'this is fiction', 'consent to the fantasy',
  'disclaimer', 'intake', 'questionnaire', 'for entertainment', 'not medical advice',
  'you may use this to terminate',
]
function passesVoiceGate(text: string): { ok: boolean; reason?: string } {
  const lower = text.toLowerCase()
  for (const phrase of BANNED) {
    if (lower.includes(phrase)) return { ok: false, reason: `banned_phrase:${phrase}` }
  }
  return { ok: true }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let userId = HANDLER_USER_ID
  let force = false
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (typeof body?.user_id === 'string') userId = body.user_id
      if (body?.force === true) force = true
    } catch { /* optional body */ }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Persona gate
  const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Compute next week_number from prior chain
  const priorContracts = await fetchPriorContracts(supabase, userId)
  const lastWeek = priorContracts.length > 0 ? priorContracts[priorContracts.length - 1].week_number : 0
  const nextWeek = lastWeek + 1

  // Idempotency: skip if a contract for nextWeek already exists (drafted or locked).
  if (!force) {
    const { data: existing } = await supabase
      .from('identity_contracts_v2')
      .select('id, status')
      .eq('user_id', userId)
      .eq('week_number', nextWeek)
      .maybeSingle()
    if (existing) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: 'week_already_authored',
        existing_id: (existing as { id: string }).id,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  const evidence = await fetchWeekEvidence(supabase, userId)

  const compoundedNames = priorContracts.flatMap(c =>
    (c.locked_behaviors ?? []).map(b => (b as Record<string, unknown>).rule as string).filter(Boolean)
  )

  const choice = selectModel('strategic_planning', { override_tier: 'S3' })
  const userMessage = `WEEK NUMBER: ${nextWeek}
PRIOR LOCKED BEHAVIORS (compound spine — reference 1-2 by name in the body):
${compoundedNames.length === 0 ? '(none yet — this is week 1)' : compoundedNames.map(n => `- ${n}`).join('\n')}

THIS WEEK'S EVIDENCE (use to pick the new 1-2 behaviors that target what's actually slipping):
${JSON.stringify(evidence, null, 2)}

${CONTRACT_INSTRUCTION}`

  let modelResult: { text: string; finish: string; model: string }
  try {
    modelResult = await callModel(choice, {
      system: DOMMY_MOMMY_CHARACTER,
      user: userMessage,
      max_tokens: 1400,
      temperature: 0.7,
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'model_call_failed: ' + String(err).slice(0, 300) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const draft = safeJSON<ContractDraft>(modelResult.text)
  if (!draft || !draft.body_text || !draft.signing_phrase || !Array.isArray(draft.new_locked_behaviors)) {
    return new Response(JSON.stringify({ ok: false, error: 'unparseable_draft', raw: modelResult.text.slice(0, 400) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Voice gate
  const gateBody = passesVoiceGate(draft.body_text)
  const gatePhrase = passesVoiceGate(draft.signing_phrase)
  if (!gateBody.ok || !gatePhrase.ok) {
    return new Response(JSON.stringify({
      ok: false, error: 'voice_gate_failed',
      detail: { body: gateBody, phrase: gatePhrase },
    }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Compound: prior locked behaviors + new
  const allLocked = [
    ...priorContracts.flatMap(c => c.locked_behaviors ?? []),
    ...draft.new_locked_behaviors,
  ]

  // Insert contract (drafted)
  const { data: contractRow, error: cErr } = await supabase
    .from('identity_contracts_v2')
    .insert({
      user_id: userId,
      week_number: nextWeek,
      status: 'awaiting_signature',
      body_text: draft.body_text,
      signing_phrase: draft.signing_phrase,
      locked_behaviors: allLocked,
      prior_contract_id: priorContracts.length > 0 ? priorContracts[priorContracts.length - 1].id : null,
      generated_by: 'mommy_authority',
      voice_excerpt: draft.voice_excerpt ?? null,
    })
    .select('id')
    .single()
  if (cErr || !contractRow) {
    return new Response(JSON.stringify({ ok: false, error: 'contract_insert_failed: ' + (cErr?.message ?? '') }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const contractId = (contractRow as { id: string }).id

  // Today card via outreach queue (high urgency, 48h expiry to mirror sign deadline)
  const previewLine = draft.voice_excerpt ?? draft.body_text.split('\n')[0].slice(0, 240)
  const outreachMessage = `${previewLine}\n\nThis week's contract is ready for your signature, baby. Type the phrase Mama wrote and you're locked in.`
  const { data: outRow } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message: outreachMessage,
      urgency: 'high',
      trigger_reason: `mommy_contract:week${nextWeek}:${contractId}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
      source: 'mommy_contract_author',
    })
    .select('id')
    .single()

  const outreachId = (outRow as { id: string } | null)?.id ?? null
  if (outreachId) {
    await supabase.from('identity_contracts_v2')
      .update({ delivered_outreach_id: outreachId })
      .eq('id', contractId)
  }

  // Authority log
  const { data: authLog } = await supabase.rpc('log_mommy_authority', {
    p_user_id: userId,
    p_action_kind: 'contract_authored',
    p_source_system: 'mommy-contract-author',
    p_action_summary: `Drafted week ${nextWeek} contract — ${draft.new_locked_behaviors.length} new locked behavior${draft.new_locked_behaviors.length === 1 ? '' : 's'}, ${allLocked.length} total in chain`,
    p_voice_excerpt: previewLine,
    p_action_payload: {
      contract_id: contractId,
      week_number: nextWeek,
      new_behaviors: draft.new_locked_behaviors,
      compounded_count: allLocked.length,
      outreach_id: outreachId,
    },
  })
  if (authLog) {
    await supabase.from('identity_contracts_v2')
      .update({ authority_log_id: authLog as string })
      .eq('id', contractId)
  }

  return new Response(JSON.stringify({
    ok: true,
    contract_id: contractId,
    week_number: nextWeek,
    voice_excerpt: previewLine,
    body_excerpt: draft.body_text.slice(0, 400),
    new_behaviors: draft.new_locked_behaviors,
    compounded_total: allLocked.length,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
