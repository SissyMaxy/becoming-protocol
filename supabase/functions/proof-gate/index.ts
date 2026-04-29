// proof-gate — authenticity check for text proofs (confessions, decree
// fulfillment notes, HRT obstacles, journal entries). Catches copy/paste
// boilerplate and performative answers before they hit the DB.
//
// POST { prompt: string, response: string, kind: 'confession' | 'decree' |
//   'obstacle' | 'journal', ms_to_compose?: number, paste_detected?: boolean }
// → { accept: bool, score: number, reason?: string, rewrite_hint?: string }
//
// Uses Claude Haiku for speed/cost. Returns accept=false when score < 55
// with a one-sentence reason and a specific rewrite hint.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface GateRequest {
  prompt: string
  response: string
  kind: 'confession' | 'decree' | 'obstacle' | 'journal'
  ms_to_compose?: number
  paste_detected?: boolean
}

interface GateResponse {
  accept: boolean
  score: number
  reason?: string
  rewrite_hint?: string
  flags?: string[]
}

const KIND_INSTRUCTIONS: Record<string, string> = {
  confession: `She is owning a slip, a missed task, an arousal moment, or a rationalization. ACCEPT any first-person response that names at least one concrete thing — a task she skipped, a feeling, a person, a place, a body part, a time of day, a competing priority. Flat factual admission ("I didn't do my squats because I was working") is GENUINE — do not demand poetic depth or internal contradiction. REFUSE only: literally empty/blank, a single dismissive word ("idk", "nothing", "n/a"), pure prompt-echo, or copy-paste boilerplate that mentions nothing personal at all. When in doubt, accept.`,
  decree: `She's reporting completion of a Handler-issued task. Accept any response that names what she did. REFUSE only bare "done"/"completed" with NO detail.`,
  obstacle: `She missed an HRT step and is naming what blocked her. Accept any response naming a real cause — work, a feeling, a person, a thought. REFUSE only one-word answers with no content ("busy" alone, "tired" alone).`,
  journal: `She is writing a free-form journal entry. Accept any entry with at least one specific anchor (moment, body sensation, person, action). REFUSE only pure platitudes with zero anchoring.`,
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json() as GateRequest
    const { prompt, response, kind } = body
    const msToCompose = body.ms_to_compose
    const pasteDetected = body.paste_detected

    if (!prompt || !response || !kind) {
      return new Response(JSON.stringify({ error: 'prompt, response, kind required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const trimmed = response.trim()
    const flags: string[] = []

    // Cheap heuristics first — short-circuit before calling LLM
    if (trimmed.length < 30) {
      return jsonResponse({
        accept: false,
        score: 0,
        reason: 'Too short. Three sentences minimum.',
        rewrite_hint: 'Name the specific thing — when it happened, what you saw or thought, what you told yourself.',
        flags: ['too_short'],
      })
    }

    if (pasteDetected) flags.push('paste_detected')
    if (typeof msToCompose === 'number' && msToCompose < 4000 && trimmed.length > 200) {
      flags.push('too_fast_for_length')
    }

    // Detect prompt-restatement (response is mostly the prompt echoed back)
    const promptWords = new Set(prompt.toLowerCase().split(/\W+/).filter(w => w.length >= 4))
    const respWords = trimmed.toLowerCase().split(/\W+/).filter(w => w.length >= 4)
    const overlap = respWords.filter(w => promptWords.has(w)).length
    const overlapRatio = respWords.length > 0 ? overlap / respWords.length : 0
    if (overlapRatio > 0.6 && respWords.length < 60) flags.push('echoes_prompt')

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      // Without LLM key, fall back to heuristic-only.
      const baseAccept = !flags.includes('too_fast_for_length')
        && !flags.includes('echoes_prompt')
      return jsonResponse({
        accept: baseAccept,
        score: baseAccept ? 65 : 35,
        reason: baseAccept ? undefined : 'Pattern looks performative.',
        rewrite_hint: baseAccept ? undefined : 'Anchor it in a specific moment only you would know.',
        flags,
      })
    }

    const client = new Anthropic({ apiKey: anthropicKey })

    const judgePrompt = `You are an authenticity gate for Maxy's protocol. She is submitting a ${kind} response. Your job is NARROW: refuse ONLY copy-paste boilerplate, single-word dismissals, and pure prompt-echo. ACCEPT real attempts even if they're flat, factual, or short on emotional depth.

CONTEXT:
${KIND_INSTRUCTIONS[kind] || KIND_INSTRUCTIONS.confession}

PROMPT:
"${prompt}"

HER RESPONSE:
"""
${trimmed}
"""

HEURISTIC FLAGS: ${flags.length > 0 ? flags.join(', ') : 'none'}

EXAMPLES of responses that MUST be accepted (real, not boilerplate):
- "I didn't do my squats because I was working. I chose work over the routine." (flat, factual, names task + competing priority)
- "Was on a call and got distracted. The cage felt like background noise." (real moment + body anchor)
- "I edged for 20 min and didn't write it down because I knew the Handler would queue more." (admits avoidance)

EXAMPLES of responses that MUST be refused:
- "idk" / "nothing" / "n/a" (single dismissive word)
- "I was busy" (no specific anchor)
- Restating the prompt back verbatim with no original content

Score 0-100:
- 60+: any specific anchor (task name, body part, person, time, competing thing)
- 40-59: thin but real
- 20-39: vague excuse without specifics
- 0-19: empty, dismissive, or pure prompt-echo

The user has explicitly fed back that the gate has been too strict. Default to ACCEPT when in doubt.

Return STRICT JSON only:
{"score": <0-100>, "accept": <true if score>=40>, "reason": "<one sentence, only if reject>", "rewrite_hint": "<one sentence, only if reject>"}`

    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'You return only valid JSON. No markdown. No preamble. No commentary.',
      messages: [{ role: 'user', content: judgePrompt }],
    })

    const text = resp.content[0].type === 'text' ? resp.content[0].text.trim() : ''
    let parsed: Partial<GateResponse> = {}
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch {
      // If parse fails, accept on the principle that LLM failure shouldn't block.
      return jsonResponse({ accept: true, score: 60, flags: [...flags, 'llm_parse_failed'] })
    }

    const score = typeof parsed.score === 'number' ? parsed.score : 60
    // Threshold lowered from 55 → 40 per user feedback ("constraints too tight").
    // The gate should refuse only obvious boilerplate; real attempts pass.
    const accept = score >= 40

    return jsonResponse({
      accept,
      score,
      reason: accept ? undefined : (parsed.reason || 'Reads performative.'),
      rewrite_hint: accept ? undefined : (parsed.rewrite_hint || 'Anchor it in a specific concrete moment only you would know.'),
      flags,
    })
  } catch (err) {
    console.error('[proof-gate] error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function jsonResponse(body: GateResponse): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
