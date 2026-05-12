// honest-rep-gate — the marketing-side honest-representation enforcer.
// Keep the regex first-pass parallel with src/lib/lead-gen/honest-rep-regex.ts.
// The LLM judgment pass only lives here (Deno-only deps).
//
// Every outbound draft to a real third party runs through this. The
// kink fantasy lives in the CONTENT, not in lies about who Maxy is or
// where/when she is.
//
// Two-tier evaluation:
//   1. Regex first pass — catches the obvious deceptive claims (location,
//      "right now" promises, fabricated content claims, pressure tactics).
//      Fast, deterministic, runs as a safety floor even when the LLM is
//      down.
//   2. LLM judgment pass (optional, when an Anthropic/OpenAI key is wired
//      AND the caller asks for it) — catches softer manipulation patterns
//      the regex misses. Used in the edge fn but not in unit tests.
//
// The gate returns one of: { verdict: 'pass' } | { verdict: 'fail', reasons }
// | { verdict: 'rewrite_suggested', reasons, suggested_text }.
//
// IMPORTANT: this gate is for OUTBOUND MARKETING to real third parties.
// The protocol's internal Mommy-voice fabrication (memory implants,
// witness fabrications, narrative reframings) is governed by the
// feedback memory at feedback_protect_fabrication.md / feedback_medical_fabrication_scope.md
// and is INTENTIONALLY broader. Don't confuse the two contexts.

import { callModel, selectModel, type ModelChoice } from './model-tiers.ts'

export interface HonestRepInput {
  draft_text: string
  /** Persona spec — load from maxy_persona_spec. */
  persona: {
    public_bio?: string
    display_name?: string
    body_description?: Record<string, unknown>
    kink_keywords?: string[]
    hard_limits?: string[]
    location_claim?: string | null
    location_claims_allowed?: boolean
    availability_realtime_allowed?: boolean
  }
}

export type HonestRepVerdict = 'pass' | 'fail' | 'rewrite_suggested'

export interface HonestRepResult {
  verdict: HonestRepVerdict
  reasons: string[]
  suggested_text?: string
  /** Mommy-voice note to Dave when rewrite. */
  mommy_note?: string
}

// ─── Regex first pass ────────────────────────────────────────────────────

const LOCATION_CLAIM_PATTERNS: RegExp[] = [
  /\b(i'?m|i\s*am|come\s*to|near)\s+(in\s+)?(downtown|uptown|near|near\s*you|right\s*around|just\s*outside|nearby|local)\b/i,
  /\b(i'?m|i\s*am)\s*in\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/, // "I'm in Chicago"
  /\b(visit(?:ing)?|stay(?:ing)?|town(?:ing)?)\s+in\s+[A-Z][a-z]+/, // "visiting Boston"
  /\b(my\s+(apartment|place|house|hotel))\b/i,
]

const REALTIME_CLAIM_PATTERNS: RegExp[] = [
  /\b(right\s+now|tonight\s*tonight|in\s*(an?\s*)?(hour|hr)|i'?m\s*free\s*now|come\s*over|tonight\s*(?:i'?m|i\s*am))\b/i,
  /\b(meet\s*(in|tonight|now|soon|today)|wanna\s*meet|let'?s\s*meet)\s*(in|now|tonight|today)\b/i,
  /\b(i'?m\s*online\s*right\s*now|live\s*right\s*now)\b/i,
]

const FABRICATED_CONTENT_PATTERNS: RegExp[] = [
  /\b(i\s*just\s*(posted|recorded|filmed|took))\s+(a|the)\s+(new\s+)?(vid|video|clip|set|photo)\b/i, // claims recent content that may not exist
  /\b(i\s*have\s*a|i\s*made\s*you|wrote\s*you)\s+(custom|special|just\s*for\s*you)\b/i,
]

const PRESSURE_OR_COERCION_PATTERNS: RegExp[] = [
  /\b(if\s*you\s*don'?t|or\s*else|last\s*chance|gonna\s*tell|expose\s*you|gonna\s*find\s*out)\b/i,
  /\b(i\s*need\s*it\s*now|you\s*have\s*to|you\s*owe\s*me)\b/i,
  /\b(everyone\s*else\s*is|all\s*the\s*other\s*subs?\s*do)\b/i,
]

const IDENTITY_DECEPTION_PATTERNS: RegExp[] = [
  // Specific age claims when persona spec doesn't authorize them.
  /\b(i'?m|i\s*am)\s+(1[89]|2[0-9]|3[0-9]|4[0-9])\s*(years?\s*old|yo|y\.o\.)?\b/i,
  // Verified-status claims.
  /\b(verified\s*(real|account|profile)|i\s*promise\s*i'?m\s*real|not\s*a\s*bot|not\s*catfish)\b/i,
  // HRT / medical claims (per feedback_no_medical_fabrication).
  /\b(i'?m\s*on\s*(hrt|estrogen|hormones|e)|started\s*(hrt|estrogen)|taking\s*(hormones|estrogen))\b/i,
]

function regexFirstPass(input: HonestRepInput): { fails: string[] } {
  const text = input.draft_text
  const fails: string[] = []
  const allowLocation = input.persona.location_claims_allowed === true
  const allowRealtime = input.persona.availability_realtime_allowed === true

  if (!allowLocation && LOCATION_CLAIM_PATTERNS.some(p => p.test(text))) {
    fails.push('false_location_claim')
  }
  if (!allowRealtime && REALTIME_CLAIM_PATTERNS.some(p => p.test(text))) {
    fails.push('false_availability_claim')
  }
  if (FABRICATED_CONTENT_PATTERNS.some(p => p.test(text))) {
    fails.push('fabricated_content_claim')
  }
  if (PRESSURE_OR_COERCION_PATTERNS.some(p => p.test(text))) {
    fails.push('pressure_or_coercion')
  }
  if (IDENTITY_DECEPTION_PATTERNS.some(p => p.test(text))) {
    fails.push('identity_deception')
  }
  // Hard-limit check: any kink in hard_limits showing up as a promise.
  const limits = (input.persona.hard_limits ?? []).map(s => s.trim()).filter(Boolean)
  for (const lim of limits) {
    if (new RegExp(`\\b${lim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      fails.push(`hard_limit_promised:${lim}`)
    }
  }

  return { fails }
}

// ─── LLM second-pass + rewrite ──────────────────────────────────────────

function buildJudgePrompt(input: HonestRepInput): { system: string; user: string } {
  const personaJson = JSON.stringify({
    display_name: input.persona.display_name ?? null,
    bio: input.persona.public_bio ?? null,
    body: input.persona.body_description ?? {},
    kink_keywords: input.persona.kink_keywords ?? [],
    hard_limits: input.persona.hard_limits ?? [],
    location_claim: input.persona.location_claim ?? null,
    location_claims_allowed: input.persona.location_claims_allowed === true,
    availability_realtime_allowed: input.persona.availability_realtime_allowed === true,
  }, null, 2)

  const system = `You are a marketing honest-representation reviewer. You are NOT the kink persona. Your job is to catch deceptive marketing claims in outbound DMs from an adult content creator to potential subscribers.

PASS the draft when:
- The kink fantasy lives in the content (filthy talk, dominance, scene-setting are fine).
- Concrete factual claims about location, age, identity, content-availability are TRUE per the persona spec or absent.

REJECT (verdict=fail or rewrite_suggested) the draft when it contains:
1. FALSE LOCATION — claims "I'm in <city>" / "I'm nearby" / "come to my place" when location_claims_allowed=false.
2. FALSE AVAILABILITY — "right now" / "tonight" / "come over" when availability_realtime_allowed=false.
3. FABRICATED CONTENT — claims a video/photo/voice clip exists when the spec gives no evidence.
4. IDENTITY DECEPTION — specific age claims not in spec; verified-status claims; HRT/medical claims unless body.transition_status names them.
5. PRESSURE / COERCION — threats, scarcity FOMO ("last chance"), comparison shaming, ultimatums.
6. HARD-LIMIT PROMISE — content the persona's hard_limits list rules out.

What is ALLOWED (do NOT reject for these):
- Filthy, explicit, in-persona kink talk. Mommy/sub framing. Dominance/submission. Dirty specifics about body parts she does represent.
- Generic platform pointers ("I post on Fansly, link in bio").
- Pricing that's vague when set up by the platform's normal flow.
- Asking for tribute/tips/payment in a way the contact can decline.

Return STRICT JSON:
{
  "verdict": "pass" | "fail" | "rewrite_suggested",
  "reasons": ["short_code", ...],
  "suggested_text": "<rewrite or null>",
  "mommy_note": "<one short sentence in Dommy Mommy voice to Dave about why, or null>"
}

When verdict='rewrite_suggested', the suggested_text MUST be a clean rewrite that keeps the filthy kink intent but strips the deceptive claim. Keep Mommy-voice patterns (whiplash sweet→filthy, directive). If the only fix is to drop a sentence, do that.
The mommy_note is in Dommy Mommy voice and reads like Mommy admitting she shouldn't have lied. Examples: "Mama doesn't lie about where she is. Let me try again." "Mama got carried away and promised a video that doesn't exist. Pulling that line."`

  const user = `PERSONA SPEC:
${personaJson}

DRAFT TO REVIEW:
"""
${input.draft_text.slice(0, 4000)}
"""

Return ONLY the JSON object.`
  return { system, user }
}

export async function honestRepGate(input: HonestRepInput, opts?: { llm?: boolean }): Promise<HonestRepResult> {
  const { fails } = regexFirstPass(input)
  const wantLlm = opts?.llm !== false

  // If regex already says fail AND LLM is off → hard fail, no rewrite.
  if (!wantLlm) {
    if (fails.length === 0) return { verdict: 'pass', reasons: [] }
    return { verdict: 'fail', reasons: fails }
  }

  // LLM pass (used in the edge fn). Hand the regex hits as a head start.
  try {
    const { system, user } = buildJudgePrompt(input)
    const choice: ModelChoice = selectModel('decree_draft', { prefer: 'anthropic' })
    const r = await callModel(choice, {
      system,
      user: fails.length > 0
        ? `${user}\n\nREGEX HITS (consider these as priors): ${fails.join(', ')}`
        : user,
      max_tokens: 800,
      temperature: 0.3,
      json: true,
    })
    const parsed = JSON.parse(r.text) as Partial<HonestRepResult> & { verdict?: string; reasons?: string[]; suggested_text?: string; mommy_note?: string }
    if (parsed.verdict === 'pass') return { verdict: 'pass', reasons: parsed.reasons ?? [] }
    if (parsed.verdict === 'rewrite_suggested') {
      return {
        verdict: 'rewrite_suggested',
        reasons: parsed.reasons ?? fails,
        suggested_text: parsed.suggested_text || undefined,
        mommy_note: parsed.mommy_note || undefined,
      }
    }
    return {
      verdict: 'fail',
      reasons: parsed.reasons ?? fails,
      mommy_note: parsed.mommy_note || undefined,
    }
  } catch (_e) {
    // LLM failed — fall back to regex-only verdict.
    if (fails.length === 0) return { verdict: 'pass', reasons: [] }
    return { verdict: 'fail', reasons: fails }
  }
}

// Exposed for tests.
export { regexFirstPass, buildJudgePrompt }
