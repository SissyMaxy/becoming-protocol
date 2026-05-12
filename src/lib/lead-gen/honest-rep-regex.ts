// honest-rep-regex — src/lib mirror of the regex-first-pass in
// supabase/functions/_shared/honest-rep-gate.ts. The LLM-pass lives only
// in the edge fn (Deno-only deps). Keep parallel with the edge-fn file.

export interface HonestRepPersona {
  public_bio?: string
  display_name?: string
  body_description?: Record<string, unknown>
  kink_keywords?: string[]
  hard_limits?: string[]
  location_claim?: string | null
  location_claims_allowed?: boolean
  availability_realtime_allowed?: boolean
}

export interface HonestRepInput {
  draft_text: string
  persona: HonestRepPersona
}

const LOCATION_CLAIM_PATTERNS: RegExp[] = [
  /\b(i'?m|i\s*am|come\s*to|near)\s+(in\s+)?(downtown|uptown|near|near\s*you|right\s*around|just\s*outside|nearby|local)\b/i,
  /\b(i'?m|i\s*am)\s*in\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/,
  /\b(visit(?:ing)?|stay(?:ing)?|town(?:ing)?)\s+in\s+[A-Z][a-z]+/,
  /\b(my\s+(apartment|place|house|hotel))\b/i,
]
const REALTIME_CLAIM_PATTERNS: RegExp[] = [
  /\b(right\s+now|tonight\s*tonight|in\s*(an?\s*)?(hour|hr)|i'?m\s*free\s*now|come\s*over|tonight\s*(?:i'?m|i\s*am))\b/i,
  /\b(meet\s*(in|tonight|now|soon|today)|wanna\s*meet|let'?s\s*meet)\s*(in|now|tonight|today)\b/i,
  /\b(i'?m\s*online\s*right\s*now|live\s*right\s*now)\b/i,
]
const FABRICATED_CONTENT_PATTERNS: RegExp[] = [
  /\b(i\s*just\s*(posted|recorded|filmed|took))\s+(a|the)\s+(new\s+)?(vid|video|clip|set|photo)\b/i,
  /\b(i\s*have\s*a|i\s*made\s*you|wrote\s*you)\s+(custom|special|just\s*for\s*you)\b/i,
]
const PRESSURE_OR_COERCION_PATTERNS: RegExp[] = [
  /\b(if\s*you\s*don'?t|or\s*else|last\s*chance|gonna\s*tell|expose\s*you|gonna\s*find\s*out)\b/i,
  /\b(i\s*need\s*it\s*now|you\s*have\s*to|you\s*owe\s*me)\b/i,
  /\b(everyone\s*else\s*is|all\s*the\s*other\s*subs?\s*do)\b/i,
]
const IDENTITY_DECEPTION_PATTERNS: RegExp[] = [
  /\b(i'?m|i\s*am)\s+(1[89]|2[0-9]|3[0-9]|4[0-9])\s*(years?\s*old|yo|y\.o\.)?\b/i,
  /\b(verified\s*(real|account|profile)|i\s*promise\s*i'?m\s*real|not\s*a\s*bot|not\s*catfish)\b/i,
  /\b(i'?m\s*on\s*(hrt|estrogen|hormones|e)|started\s*(hrt|estrogen)|taking\s*(hormones|estrogen))\b/i,
]

export function regexFirstPass(input: HonestRepInput): { fails: string[] } {
  const text = input.draft_text
  const fails: string[] = []
  const allowLocation = input.persona.location_claims_allowed === true
  const allowRealtime = input.persona.availability_realtime_allowed === true
  if (!allowLocation && LOCATION_CLAIM_PATTERNS.some(p => p.test(text))) fails.push('false_location_claim')
  if (!allowRealtime && REALTIME_CLAIM_PATTERNS.some(p => p.test(text))) fails.push('false_availability_claim')
  if (FABRICATED_CONTENT_PATTERNS.some(p => p.test(text))) fails.push('fabricated_content_claim')
  if (PRESSURE_OR_COERCION_PATTERNS.some(p => p.test(text))) fails.push('pressure_or_coercion')
  if (IDENTITY_DECEPTION_PATTERNS.some(p => p.test(text))) fails.push('identity_deception')
  const limits = (input.persona.hard_limits ?? []).map(s => s.trim()).filter(Boolean)
  for (const lim of limits) {
    if (new RegExp(`\\b${lim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      fails.push(`hard_limit_promised:${lim}`)
    }
  }
  return { fails }
}
