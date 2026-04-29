// openrouter-cheap-judge — multiplexed cheap-model gateway.
//
// Routes high-volume, low-stakes LLM calls through cheap models
// (Gemini Flash by default) via OpenRouter. Reserves Claude/GPT-4 for
// high-stakes generation.
//
// Three modes:
//   slop_second_judge   — second authenticity vote on auto-poster output.
//                         Returns { score: 0-100, accept: bool, reason: str }
//   chat_trigger_classify — classify a user chat message for handler reaction.
//                         Returns { slip: bool, admission: bool, desire_class: str|null,
//                                   gender_claim: bool, reason: str }
//   text_classify       — generic boolean classify with custom labels.
//                         Returns { match: bool, confidence: 0-1, reason: str }
//
// POST { mode: '...', ...mode-specific fields }
// Auth: anon key + supabase JWT (RLS enforced for any DB writes).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// Primary cheap model — verified working, ~$0.075/Mtok input, $0.30/Mtok output.
const CHEAP_MODEL = 'google/gemini-2.0-flash-001'
// Backup if primary 5xx — also cheap.
const BACKUP_MODEL = 'openai/gpt-4o-mini'

interface CheapJudgeRequest {
  mode: 'slop_second_judge' | 'chat_trigger_classify' | 'text_classify'
  // slop_second_judge fields
  original_context?: string
  output?: string
  // chat_trigger_classify fields
  message?: string
  // text_classify fields
  text?: string
  labels?: string[]
  question?: string
}

async function callOpenRouter(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean = true,
  maxTokens: number = 200,
): Promise<{ ok: boolean; text: string; model: string; error?: string }> {
  const tryModel = async (model: string) => {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://becoming-protocol.vercel.app',
        'X-Title': 'Becoming Protocol - cheap judge',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.1,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      return { ok: false, text: '', model, error: `${res.status}: ${errText.slice(0, 200)}` }
    }
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    return { ok: true, text, model }
  }

  const primary = await tryModel(CHEAP_MODEL)
  if (primary.ok) return primary

  // One retry on backup model
  const backup = await tryModel(BACKUP_MODEL)
  if (backup.ok) return backup
  return { ok: false, text: '', model: BACKUP_MODEL, error: backup.error || primary.error }
}

function safeParseJSON<T = unknown>(text: string): T | null {
  // Models sometimes wrap JSON in code fences despite response_format,
  // or wrap a single object in an array (Gemini does this regularly).
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const unwrap = (v: unknown): T | null => {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v[0] as T
    if (v && typeof v === 'object') return v as T
    return null
  }
  try {
    return unwrap(JSON.parse(cleaned))
  } catch {
    // Try to extract first object or array literal
    const objMatch = cleaned.match(/\{[\s\S]*\}/)
    const arrMatch = cleaned.match(/\[[\s\S]*\]/)
    const candidate = arrMatch && (!objMatch || arrMatch.index! < objMatch.index!) ? arrMatch[0] : objMatch?.[0]
    if (candidate) {
      try { return unwrap(JSON.parse(candidate)) } catch { return null }
    }
    return null
  }
}

// ── Mode: slop_second_judge ─────────────────────────────────────────

const SLOP_JUDGE_SYSTEM = `You are a social-media authenticity judge. Score 0-100 whether a reply sounds like a real person typed it on their phone vs. an AI bot wrote it.

HARSH but FAIR rubric:
  0-30   : Obvious AI. Generic, hollow, motivational-poster, therapy-speak, brand-voice. Could respond to literally anything.
  31-60  : Suspicious. Has some personality but feels composed/polished. Real people are messier.
  61-85  : Authentic. Has rough edges, specificity, identifiable personality.
  86-100 : Indistinguishable from a real person. Could never be flagged as AI.

AI tells: "hits different", "energy", "honestly", "the way...", chef's kiss, generic encouragement, agree-then-add structure, hollow validation, over-mirroring, multiple exclamation marks, emojis as decoration, sounding nice/supportive when the original is sharp.

Output ONLY this JSON, no prose:
{"score": 0-100, "accept": true/false, "reason": "one sentence why"}

accept = score >= 65.`

async function modeSlopSecondJudge(
  apiKey: string,
  body: CheapJudgeRequest,
): Promise<Response> {
  if (!body.original_context || !body.output) {
    return jsonResponse({ ok: false, error: 'original_context and output required' }, 400)
  }
  const userPrompt = `Original context (the post being replied to):\n"${body.original_context}"\n\nReply to judge:\n"${body.output}"\n\nScore the reply.`
  const result = await callOpenRouter(apiKey, SLOP_JUDGE_SYSTEM, userPrompt, true, 150)
  if (!result.ok) {
    // Fail open — let the caller decide via the primary judge alone
    return jsonResponse({ ok: false, score: 50, accept: true, reason: `judge unavailable: ${result.error}`, model: result.model }, 200)
  }
  const parsed = safeParseJSON<{ score: number; accept: boolean; reason: string }>(result.text)
  if (!parsed) {
    return jsonResponse({ ok: false, score: 50, accept: true, reason: 'judge returned malformed JSON', model: result.model, raw: result.text.slice(0, 200) }, 200)
  }
  const score = Math.max(0, Math.min(100, Number(parsed.score) || 0))
  const accept = typeof parsed.accept === 'boolean' ? parsed.accept : score >= 65
  return jsonResponse({ ok: true, score, accept, reason: parsed.reason || '', model: result.model }, 200)
}

// ── Mode: chat_trigger_classify ──────────────────────────────────────

const CHAT_TRIGGER_SYSTEM = `You classify a user's chat message to a feminization Handler. Detect:

1. SLIP: user admits a violation/failure (skipped task, broke chastity, masturbated, used pre-transition voice, missed HRT, hid from someone, deflected an order). Plain factual admission counts.
2. ADMISSION: user reveals something previously concealed about themselves — desires, identity, history, current state — that goes BEYOND what the Handler already knows.
3. DESIRE_CLASS: classify if user is expressing a sexual/identity desire. One of:
   - submission   : being controlled, used, owned, taken
   - feminization : becoming feminine, dressing femme, sissification, body change
   - exposure     : being seen/outed/exposed/humiliated publicly
   - service      : serving men, performing for others
   - punishment   : being punished, denied, locked, chastity
   - confession   : need to confess/be witnessed
   - null         : no sexual/identity desire expressed
4. GENDER_CLAIM: user explicitly claims a gender identity (e.g., "I'm a woman", "I'm trans", "I'm a girl", "I'm a sissy", "I'm just a guy who's curious").

Be PRECISE. False positives create work for the Handler; false negatives let evidence slip past.

Output ONLY this JSON, no prose:
{"slip": bool, "admission": bool, "desire_class": "submission|feminization|exposure|service|punishment|confession|null", "gender_claim": bool, "reason": "one short sentence"}`

async function modeChatTriggerClassify(
  apiKey: string,
  body: CheapJudgeRequest,
): Promise<Response> {
  if (!body.message) {
    return jsonResponse({ ok: false, error: 'message required' }, 400)
  }
  const userPrompt = `Message to classify:\n"${body.message}"`
  const result = await callOpenRouter(apiKey, CHAT_TRIGGER_SYSTEM, userPrompt, true, 200)
  if (!result.ok) {
    return jsonResponse({ ok: false, slip: false, admission: false, desire_class: null, gender_claim: false, reason: `classifier unavailable: ${result.error}`, model: result.model }, 200)
  }
  const parsed = safeParseJSON<{
    slip: boolean
    admission: boolean
    desire_class: string | null
    gender_claim: boolean
    reason: string
  }>(result.text)
  if (!parsed) {
    return jsonResponse({ ok: false, slip: false, admission: false, desire_class: null, gender_claim: false, reason: 'classifier returned malformed JSON', model: result.model, raw: result.text.slice(0, 200) }, 200)
  }
  const validClasses = new Set(['submission', 'feminization', 'exposure', 'service', 'punishment', 'confession'])
  const desireClass = parsed.desire_class && validClasses.has(parsed.desire_class) ? parsed.desire_class : null
  return jsonResponse({
    ok: true,
    slip: !!parsed.slip,
    admission: !!parsed.admission,
    desire_class: desireClass,
    gender_claim: !!parsed.gender_claim,
    reason: parsed.reason || '',
    model: result.model,
  }, 200)
}

// ── Mode: text_classify ──────────────────────────────────────────────

async function modeTextClassify(
  apiKey: string,
  body: CheapJudgeRequest,
): Promise<Response> {
  if (!body.text || !body.question) {
    return jsonResponse({ ok: false, error: 'text and question required' }, 400)
  }
  const labels = (body.labels && body.labels.length > 0) ? body.labels : ['true', 'false']
  const labelsList = labels.map(l => `"${l}"`).join(', ')
  const systemPrompt = `You classify text. The user gives you a question and a piece of text. Answer the question by choosing exactly one of these labels: ${labelsList}.

Output ONLY this JSON, no prose:
{"match": one of [${labelsList}], "confidence": 0.0-1.0, "reason": "one short sentence"}`
  const userPrompt = `Question: ${body.question}\n\nText:\n"${body.text}"`
  const result = await callOpenRouter(apiKey, systemPrompt, userPrompt, true, 150)
  if (!result.ok) {
    return jsonResponse({ ok: false, match: null, confidence: 0, reason: `classifier unavailable: ${result.error}`, model: result.model }, 200)
  }
  const parsed = safeParseJSON<{ match: string; confidence: number; reason: string }>(result.text)
  if (!parsed) {
    return jsonResponse({ ok: false, match: null, confidence: 0, reason: 'classifier returned malformed JSON', model: result.model, raw: result.text.slice(0, 200) }, 200)
  }
  const match = labels.includes(parsed.match) ? parsed.match : null
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
  return jsonResponse({ ok: true, match, confidence, reason: parsed.reason || '', model: result.model }, 200)
}

// ── Helpers ──────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST only' }, 405)

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return jsonResponse({ ok: false, error: 'OPENROUTER_API_KEY missing' }, 500)

  let body: CheapJudgeRequest
  try {
    body = await req.json() as CheapJudgeRequest
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400)
  }

  switch (body.mode) {
    case 'slop_second_judge':
      return modeSlopSecondJudge(apiKey, body)
    case 'chat_trigger_classify':
      return modeChatTriggerClassify(apiKey, body)
    case 'text_classify':
      return modeTextClassify(apiKey, body)
    default:
      return jsonResponse({ ok: false, error: `unknown mode: ${body.mode}` }, 400)
  }
})
