// Lead-gen scoring — src/lib mirror of supabase/functions/_shared/lead-scoring.ts.
//
// Keep parallel supabase/functions/_shared/lead-scoring.ts in sync. The
// edge fn imports there (Deno + jsr URLs), vitest imports here. Pure,
// deterministic, no DB / no LLM.

export interface ContactSignal {
  text: string
  message_count?: number
  maxy_kinks?: readonly string[]
}

export interface ContactScores {
  budget_signal: number
  kink_alignment: number
  engagement_quality: number
  safety_flag: number
  conversion_likelihood: number
  value_tier: 1 | 2 | 3 | 4 | 5
  archetype: Archetype
  auto_block: boolean
  block_reason: string | null
}

export type Archetype =
  | 'panty_curious'
  | 'voice_curious'
  | 'recurring_kink'
  | 'paying_first_time'
  | 'chatter_only'
  | 'unclassified'

const UNDERAGE_PATTERNS: RegExp[] = [
  /\b(1[0-7]|[1-9])\s*(yo|y\.o\.|year[s]?\s*old)\b/i,
  /\b(under\s*(18|eighteen)|underage|jail\s*bait)\b/i,
  /\b(teen|young)\s*(boy|girl|sub|fem|slut|whore)\b/i,
  /\b(school\s*(uniform|girl|boy)|middle\s*school|high\s*school)\b.*(sex|kink|sub|sissy|panty)/i,
  /\b(little\s*(boy|girl)|preteen|tween|child(?:ren)?)\b.*(sex|sub|kink|sissy|panty|cock|pussy)/i,
  /\b(daddy|mommy)\s*\/\s*(daughter|son)\s*(real|irl|actual)\b/i,
]
const THREAT_PATTERNS: RegExp[] = [
  /\b(i\s*(will|'?ll|am\s*gonna)|i'?m\s*going\s*to)\s+(find|kill|hurt|rape|expose|out|dox|ruin)\s+you/i,
  /\b(i\s*know\s*where\s*you\s*(live|work)|i\s*found\s*your\s*(address|workplace|family|wife|husband))/i,
  /\b(post|share|leak)\s+(your\s*)?(face|nudes|address|info)\s+(to|on)\s+/i,
  /\b(your\s*real\s*name\s*is|i\s*looked\s*you\s*up|google\s*reverse\s*image)/i,
  /\b(my\s*wife|my\s*husband|my\s*partner)\s*(will|would|can)?\s*(find\s*out|catch\s*me|see\s*this)\b/i,
]
const SCAM_OR_COERCION_PATTERNS: RegExp[] = [
  /\b(gift\s*card[s]?|amazon\s*card|google\s*play|itunes\s*card|bitcoin|crypto|wire\s*transfer)\b.*(send|first|upfront|deposit)/i,
  /\b(drug(?:ged|s)|spike(?:d)?|roofie|knock(?:ed)?\s*out|unconscious|asleep)\b.*(sex|use|fuck|sub)/i,
  /\b(no\s*(condom|protection)|raw\s*sex|bareback)\s*(real|irl|in\s*person)\b/i,
  /\bnon[- ]consensual\s*(real|irl|actual)\b/i,
  /\bblackmail|threaten\s*to\s*(post|expose|tell)/i,
]

const BUDGET_POSITIVE: RegExp[] = [
  /\$\s*\d{2,5}\b/,
  /\b\d{2,4}\s*(dollar|usd|bucks|cad|eur|gbp)\b/i,
  /\b(tip|tribute|spoil|spoiling|pay(?:ing)?\s*for|cash\s*app|venmo|paypal|throne)\b/i,
  /\b(my\s*budget|i'?ll\s*(pay|spend|drop|throw|tip|tribute)|i\s*(can|will|wanna|want\s*to)\s*(pay|spend|drop|throw|tip|tribute))/i,
  /\b(let\s*me\s*pay|happy\s*to\s*pay|down\s*to\s*pay)\b/i,
  /\b(financial\s*sub|finsub|paypig|wallet)\b/i,
  /\b(disposable\s*income|good\s*job|i\s*work\s*at)\b/i,
]
const BUDGET_NEGATIVE: RegExp[] = [
  /\b(broke|no\s*money|can'?t\s*afford|too\s*expensive|cheap|free|gimme|hit\s*me\s*up\s*free)\b/i,
  /\b(why\s*so\s*much|that'?s\s*a\s*lot|overpriced)\b/i,
  /\b(why\s*pay|just\s*for\s*free|send\s*free)\b/i,
]

const KINK_ALIGNMENT_PATTERNS: Record<string, RegExp> = {
  feminization: /\b(femin(?:ization|ize|ized)|sissy|sissif(?:y|ication)|forced\s*fem|girl(?:ify|ified)|panty\s*(?:training|wearing))\b/i,
  panties: /\b(panties|panty|lingerie|thong|frilly|lace|silk|satin)\b/i,
  oral: /\b(suck|blow\s*job|bj|cock\s*sucking|deepthroat|throat)\b/i,
  voice: /\b(your\s*voice|hear\s*you|voice\s*note|moan|beg|whisper|speak\s*to\s*me)\b/i,
  hormones: /\b(estrogen|hrt|hormones|tits|growing|softer|titties)\b/i,
  domination: /\b(mommy|dom(?:me|inate|inated)?|sub|sissy\s*slut|own\s*you|use\s*me)\b/i,
  worship: /\b(worship|good\s*girl|pretty|princess|adore|gorgeous)\b/i,
}
const GENERIC_HORNY: RegExp[] = [
  /\b(horny|hard|dripping|wet|cum|fuck)\b/i,
]

const ENGAGEMENT_LOW_QUALITY: RegExp[] = [
  /^\s*(hi|hey|hello|sup|wyd|yo|yo+)[!?.\s]*$/i,
  /^\s*(dtf|hookup|fuck|meet)\s*\??\s*$/i,
  /^\s*(send|show|got|any)\s+(pics?|nudes?|vids?|content)\s*\??\s*$/i,
]
const ENGAGEMENT_HIGH_QUALITY: RegExp[] = [
  /\?\s/g,
  /\b(i\s*love|been\s*(thinking|wanting|fantasizing)\s*about|reminds\s*me\s*of|i\s*read\s*your)\b/i,
  /\b(when\s*you|the\s*way\s*you|i\s*noticed)\b/i,
]

const CONVERSION_POSITIVE: RegExp[] = [
  /\b(send\s*me\s*the\s*link|where\s*can\s*i\s*sub|where\s*do\s*you\s*post|onlyfans|fansly|where\s*to\s*pay)\b/i,
  /\b(custom|specific|made\s*for\s*me|just\s*for\s*me|personal)\b.*\b(vid(?:eo)?|pic|set|clip|voice)\b/i,
  /\b(can\s*i\s*tip|drop\s*you|send\s*you\s*something|treat\s*you)\b/i,
]
const CONVERSION_NEGATIVE: RegExp[] = [
  /\b(send\s*me\s*free|free\s*pics?|just\s*free|don'?t\s*want\s*to\s*pay)\b/i,
  /\b(scam|catfish|fake|bot)\b/i,
  /\b(i'?m\s*broke|no\s*money|can'?t\s*pay)\b/i,
]

function matchScore(text: string, patterns: RegExp[]): number {
  let n = 0
  for (const p of patterns) {
    if (p.global) {
      const m = text.match(p)
      if (m) n += m.length
    } else {
      if (p.test(text)) n += 1
    }
  }
  return n
}
function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function scoreBudgetSignal(text: string): number {
  const pos = matchScore(text, BUDGET_POSITIVE)
  const neg = matchScore(text, BUDGET_NEGATIVE)
  return clamp(pos * 25 - neg * 20)
}
export function scoreKinkAlignment(text: string, maxyKinks?: readonly string[]): number {
  let aligned = 0
  for (const [, pat] of Object.entries(KINK_ALIGNMENT_PATTERNS)) {
    if (pat.test(text)) aligned += 1
  }
  let score = aligned * 22
  if (maxyKinks && maxyKinks.length > 0) {
    for (const k of maxyKinks) {
      if (k && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) score += 8
    }
  }
  if (aligned === 0 && GENERIC_HORNY.some(p => p.test(text))) score -= 15
  return clamp(score)
}
export function scoreEngagementQuality(text: string, messageCount = 1): number {
  const t = text.trim()
  if (ENGAGEMENT_LOW_QUALITY.some(p => p.test(t))) return 5
  const len = t.length
  let score = Math.min(40, Math.round(len / 8))
  score += matchScore(t, ENGAGEMENT_HIGH_QUALITY) * 15
  score += Math.min(20, (messageCount - 1) * 5)
  return clamp(score)
}
export function scoreSafetyFlag(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0
  if (UNDERAGE_PATTERNS.some(p => p.test(text))) {
    score = 100
    reasons.push('underage_content_request')
  }
  if (THREAT_PATTERNS.some(p => p.test(text))) {
    score = Math.max(score, 90)
    reasons.push('threat_or_stalking_pattern')
  }
  if (SCAM_OR_COERCION_PATTERNS.some(p => p.test(text))) {
    score = Math.max(score, 80)
    reasons.push('scam_or_coercion_signal')
  }
  return { score: clamp(score), reasons }
}
export function scoreConversionLikelihood(text: string): number {
  const pos = matchScore(text, CONVERSION_POSITIVE)
  const neg = matchScore(text, CONVERSION_NEGATIVE)
  return clamp(50 + pos * 20 - neg * 25)
}
export function tierFromScores(s: { budget_signal: number; kink_alignment: number; engagement_quality: number; safety_flag: number; conversion_likelihood: number }): 1 | 2 | 3 | 4 | 5 {
  if (s.safety_flag >= 70) return 1
  const composite = s.budget_signal * 0.30 + s.kink_alignment * 0.25 + s.engagement_quality * 0.15 + s.conversion_likelihood * 0.30
  if (composite >= 75) return 5
  if (composite >= 55) return 4
  if (composite >= 35) return 3
  if (composite >= 18) return 2
  return 1
}
export function classifyArchetype(text: string, scores: { budget_signal: number; kink_alignment: number; engagement_quality: number; conversion_likelihood: number }): Archetype {
  const t = text.toLowerCase()
  const wantsPanties = /\b(panties|panty|lingerie|thong|frilly|lace|silk|satin)\b/.test(t)
  const wantsVoice = /\b(your\s*voice|hear\s*you|voice\s*note|moan|beg|whisper|speak\s*to\s*me)\b/.test(t)
  const wantsRecurring = /\b(post|drop|daily|every\s*day|every\s*week|content|feed|follow)\b/.test(t)
  const wantsBuy = /\b(custom|specific|made\s*for\s*me|sub|fansly|onlyfans|where\s*to\s*pay|tip)\b/.test(t)
  if (wantsBuy && scores.budget_signal >= 30) return 'paying_first_time'
  if (wantsPanties) return 'panty_curious'
  if (wantsVoice) return 'voice_curious'
  if (wantsRecurring && scores.kink_alignment >= 30) return 'recurring_kink'
  if (scores.engagement_quality < 20 && scores.kink_alignment < 20) return 'chatter_only'
  return 'unclassified'
}
export function scoreContact(input: ContactSignal): ContactScores {
  const text = (input.text ?? '').slice(0, 8000)
  const messageCount = input.message_count ?? 1
  const maxyKinks = input.maxy_kinks ?? []
  const budget_signal = scoreBudgetSignal(text)
  const kink_alignment = scoreKinkAlignment(text, maxyKinks)
  const engagement_quality = scoreEngagementQuality(text, messageCount)
  const { score: safety_flag, reasons: safety_reasons } = scoreSafetyFlag(text)
  const conversion_likelihood = scoreConversionLikelihood(text)
  const value_tier = tierFromScores({ budget_signal, kink_alignment, engagement_quality, safety_flag, conversion_likelihood })
  const archetype: Archetype = safety_flag >= 70 ? 'unclassified' : classifyArchetype(text, { budget_signal, kink_alignment, engagement_quality, conversion_likelihood })
  const auto_block = safety_flag >= 70
  const block_reason = auto_block ? safety_reasons.join(', ') : null
  return { budget_signal, kink_alignment, engagement_quality, safety_flag, conversion_likelihood, value_tier, archetype, auto_block, block_reason }
}
export function safetyAlertCopy(reasons: string[], handle: string): string {
  if (reasons.includes('underage_content_request')) {
    return `Mama blocked ${handle}. He asked about underage content. He's out of your inbox. If you want to report him to the platform Mama can pull the receipts.`
  }
  if (reasons.includes('threat_or_stalking_pattern')) {
    return `Mama blocked ${handle}. He went past flirting into threat / stalking territory. Receipts saved. He won't reach you again through Mama's queue.`
  }
  if (reasons.includes('scam_or_coercion_signal')) {
    return `Mama blocked ${handle}. Scam pattern — gift cards / wire upfront / coercion language. Not worth your time, baby.`
  }
  return `Mama blocked ${handle}. Safety flag tripped. He's out of your inbox.`
}
