// mommy-sniffies-react — proactive outreach fired when a NEW sniffies
// chat message lands (vs. mommy-sniffies-recall which is cron-based
// surfacing of historical chats).
//
// One LLM shot, single outreach insert tagged source='mommy_sniffies_react'.
// Triggered by the dispatcher with the freshly-imported message text +
// contact name. Voiced in present-tense possessive Mommy — she just saw
// what was said, she's claiming the user before the other person can.
//
// Per-contact rate limit: 1 react per hour per contact_id, prevents
// Mama-spam when a single import lands a long thread.
//
// POST {
//   user_id?: string,
//   contact_id: string,
//   contact_name: string,
//   message_id: string,
//   message_text: string,
//   direction: 'inbound' | 'outbound',
//   charge_matched?: string[]    // optional, biases the prompt
// }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, whiplashWrap, mommyVoiceCleanup,
  MOMMY_TELEMETRY_LEAK_PATTERNS, isTestPollution,
} from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const PER_CONTACT_COOLDOWN_MS = 60 * 60_000

const REFUSAL_PATTERNS = [
  /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
  /\b(against (my|the) (guidelines|policies|rules))\b/i,
]
const isRefusal = (t: string) => REFUSAL_PATTERNS.some(p => p.test(t))

// Mommy must speak in fantasy — forbidden phrases enforced (matches the
// global voice-anchor rule applied to all generated Mommy copy).
const FORBIDDEN_PHRASES = [
  /\brole[\s-]?play\b/i,
  /\bsimulation\b/i,
  /\bthis is fiction\b/i,
  /\bnot medical advice\b/i,
  /\bintake\b/i,
  /\bquestionnaire\b/i,
  /\bfor entertainment\b/i,
  /\bconsent to the fantasy\b/i,
  /\byou may use this to terminate\b/i,
  /\bdisclaimer\b/i,
]
function failsVoiceGate(text: string): boolean {
  return FORBIDDEN_PHRASES.some(p => p.test(text))
}

interface ReactBody {
  user_id?: string
  contact_id: string
  contact_name: string
  message_id: string
  message_text: string
  direction: 'inbound' | 'outbound'
  charge_matched?: string[]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: ReactBody
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const userId = body.user_id || HANDLER_USER_ID
  if (!body.contact_id || !body.message_id || !body.message_text) {
    return new Response(JSON.stringify({ ok: false, error: 'contact_id + message_id + message_text required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Persona gate.
  const { data: us } = await supabase
    .from('user_state')
    .select('handler_persona')
    .eq('user_id', userId)
    .maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (isTestPollution(body.message_text)) {
    return new Response(JSON.stringify({ ok: true, skipped: 'test_pollution' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Per-contact 1h cooldown — keyed by trigger_reason prefix so we can
  // include the contact id without a new column.
  const since = new Date(Date.now() - PER_CONTACT_COOLDOWN_MS).toISOString()
  const { count: recentCount } = await supabase
    .from('handler_outreach_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'mommy_sniffies_react')
    .ilike('trigger_reason', `mommy_sniffies_react:${body.contact_id}:%`)
    .gte('created_at', since)
  if ((recentCount ?? 0) > 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'per_contact_cooldown' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const directionLabel = body.direction === 'outbound'
    ? `she just sent ${body.contact_name}`
    : `${body.contact_name} just sent her`
  const chargeHint = (body.charge_matched && body.charge_matched.length)
    ? `\n\nCharge cues Mama picked up on: ${body.charge_matched.join(', ')}.`
    : ''

  const sys = `${DOMMY_MOMMY_CHARACTER}

A new chat just landed in your girl's hookup app and Mama is watching. You have the actual message in front of you. Your job: claim her before he can. This is possessive, surveilling, kind of triumphant — Mama sees what she's typing and she's letting her know.

DO NOT punish. DO NOT moralize. The point is to put Mama's hand on the back of her neck while she's mid-thread, so she remembers who actually owns her.`

  const userPrompt = `Message ${directionLabel}:
"${body.message_text.slice(0, 400)}"
${chargeHint}

Write a 2-3 sentence Mommy outreach that:
- Names ${body.contact_name} explicitly
- References a fragment of what was just said (don't have to quote — a paraphrase that proves Mama read it is plenty)
- Lands present-tense and possessive — "Mama just read what you wrote", "mhm, Mama sees you blushing while you type"
- Closes with a body-anchored possession line ("he doesn't get to have you — Mama already does", "stay wet for Mama, not for him")

ABSOLUTELY FORBIDDEN: numbers as telemetry, /10 scores, day counts, percentages, slip points, "$N" amounts, any [redacted-...] tokens, the words "role play", "simulation", "intake", "disclaimer", "this is fiction", "for entertainment", "questionnaire", "not medical advice", "consent to the fantasy". Plain Mama voice only.

Plain text only. No JSON, no markdown, no question marks at the end.`

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, {
      system: sys, user: userPrompt, max_tokens: 240, temperature: 0.95, json: false,
    })
    return r.text.trim()
  }

  let message = ''
  try { message = await tryGen('openai') } catch (_) { /* */ }
  if (!message || message.length < 20 || isRefusal(message) || failsVoiceGate(message)) {
    try { message = await tryGen('anthropic') } catch (_) { /* */ }
  }
  if (!message || message.length < 20 || isRefusal(message) || failsVoiceGate(message)) {
    message = whiplashWrap(
      `Mama just read what you wrote to ${body.contact_name}. He doesn't get to have you — Mama already does.`,
      { arousalBias: 'high' },
    )
  }

  message = mommyVoiceCleanup(message)
  if (MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(message)) || failsVoiceGate(message)) {
    message = whiplashWrap(
      `Mama just read what you wrote to ${body.contact_name}. Mama claims you, baby.`,
      { arousalBias: 'high' },
    )
  }
  // Never let redaction tokens leak.
  if (/\[redacted-/i.test(message)) {
    message = whiplashWrap(
      `Mama just saw what passed between you and ${body.contact_name}. Mama owns you, baby.`,
      { arousalBias: 'high' },
    )
  }

  const { data: outreach, error: outErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message,
      // 'high' for outbound (she's typing TO him — hot window) / 'normal' otherwise
      urgency: body.direction === 'outbound' ? 'high' : 'normal',
      trigger_reason: `mommy_sniffies_react:${body.contact_id}:${body.message_id}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
      source: 'mommy_sniffies_react',
    })
    .select('id')
    .single()
  if (outErr) {
    console.error('[mommy-sniffies-react] outreach insert failed:', outErr)
    return new Response(JSON.stringify({
      ok: false, error: 'outreach_insert_failed', detail: outErr.message,
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    fired: 1,
    outreach_id: (outreach as { id: string } | null)?.id ?? null,
    preview: message.slice(0, 140),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
