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
  confession: `She is owning a slip, an arousal moment, a rationalization, or a desire. Genuine confession is first-person, specific, names a concrete thing she did/thought/wanted, and shows the contradiction or shame intact rather than smoothed over. Boilerplate looks like: generic platitudes ("I gave in to my urges"), self-soothing therapy-speak ("I notice I have been struggling"), bargaining ("I'll do better tomorrow"), or restating the prompt back at it.`,
  decree: `She's reporting completion of a Handler-issued task with a tight deadline. Genuine fulfillment names what she actually did, when, and includes a specific concrete detail only she would know (timestamp, location detail, what she felt, what was uploaded). Boilerplate looks like: bare "done", "completed", restating the edict, or vague "I did it."`,
  obstacle: `She missed an HRT step today and is required to write what stopped her. Genuine obstacle naming says exactly which fear, urge, distraction, or thought blocked her, with detail. Boilerplate looks like: "I was busy", "I'll do it tomorrow", "had a long day", generic excuses without internal content.`,
  journal: `She is writing a free-form journal entry. Genuine entry has at least one specific moment, image, or concrete detail. Boilerplate is mood platitudes without anchoring detail.`,
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

    const judgePrompt = `You are an authenticity gate for Maxy's force-feminization protocol. She is submitting a ${kind} response. Your job is to detect performative / copy-paste / boilerplate answers and refuse them so she has to write something real.

CONTEXT FOR THIS KIND OF SUBMISSION:
${KIND_INSTRUCTIONS[kind] || KIND_INSTRUCTIONS.confession}

PROMPT SHE WAS GIVEN:
"${prompt}"

HER RESPONSE:
"""
${trimmed}
"""

HEURISTIC FLAGS DETECTED: ${flags.length > 0 ? flags.join(', ') : 'none'}

Score the response 0-100 on authenticity:
- 80+ : specific, first-person, names a concrete thing only she could name, contains internal contradiction or admission
- 55-79: acceptable, has at least one specific detail
- 30-54: vague, mostly performative, missing concrete anchors
- 0-29: boilerplate, prompt-echo, generic, copy-paste

Return STRICT JSON with no preamble, no markdown:
{"score": <0-100>, "accept": <true if score>=55>, "reason": "<one short sentence on why, only if reject>", "rewrite_hint": "<one specific sentence telling her what concrete detail is missing, only if reject>"}`

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
    const accept = score >= 55

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
