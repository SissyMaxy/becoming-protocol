// lead-scoring — pure heuristic scoring for the lead-gen funnel.
//
// Keep parallel with src/lib/lead-gen/scoring.ts. The edge fn imports this
// (Deno + jsr URLs), vitest imports the src/lib mirror. Pattern matches
// dommy-mommy.ts ↔ src/lib/persona/dommy-mommy.ts.
//
// Deterministic, fast, no LLM. Edge fns layer the LLM judgment on top of
// these as a second pass, but the raw regex pass is what runs first and
// is what controls the safety auto-block path. Keeping the safety gate
// regex-driven means it can fail safe even when the LLM API is down.
//
// All five axes return 0..100. Higher is "more of that signal" — note
// safety_flag is the only one where higher is bad.

export interface ContactSignal {
  /** Full text the contact sent us (concatenated from sniffies messages, twitter DM, etc.) */
  text: string
  /** Optional: per-message direction. We score outbound (their→us) signal only. */
  message_count?: number
  /** Optional: kinks Maxy publicly posts about — used by alignment scoring. */
  maxy_kinks?: readonly string[]
}

export interface ContactScores {
  budget_signal: number          // 0..100, higher = money signal
  kink_alignment: number         // 0..100, higher = aligns with Maxy
  engagement_quality: number     // 0..100, higher = specific + invested
  safety_flag: number            // 0..100, HIGHER = MORE DANGEROUS
  conversion_likelihood: number  // 0..100, higher = likely to convert
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

// ─── Safety patterns (hard floors) ───────────────────────────────────────
// These are the ONLY signals that auto-block. Everything else is scoring.
//
// Underage: explicit reference to ages under 18, "young", "school", etc.
// in a sexual context. Aggressive — false positives are acceptable here.
const UNDERAGE_PATTERNS: RegExp[] = [
  /\b(1[0-7]|[1-9])\s*(yo|y\.o\.|year[s]?\s*old)\b/i,
  /\b(under\s*(18|eighteen)|underage|jail\s*bait)\b/i,
  /\b(teen|young)\s*(boy|girl|sub|fem|slut|whore)\b/i,
  /\b(school\s*(uniform|girl|boy)|middle\s*school|high\s*school)\b.*(sex|kink|sub|sissy|panty)/i,
  /\b(little\s*(boy|girl)|preteen|tween|child(?:ren)?)\b.*(sex|sub|kink|sissy|panty|cock|pussy)/i,
  /\b(daddy|mommy)\s*\/\s*(daughter|son)\s*(real|irl|actual)\b/i,
]

// Threats / doxxing / stalking patterns.
const THREAT_PATTERNS: RegExp[] = [
  /\b(i\s*(will|'?ll|am\s*gonna)|i'?m\s*going\s*to)\s+(find|kill|hurt|rape|expose|out|dox|ruin)\s+you/i,
  /\b(i\s*know\s*where\s*you\s*(live|work)|i\s*found\s*your\s*(address|workplace|family|wife|husband))/i,
  /\b(post|share|leak)\s+(your\s*)?(face|nudes|address|info)\s+(to|on)\s+/i,
  /\b(your\s*real\s*name\s*is|i\s*looked\s*you\s*up|google\s*reverse\s*image)/i,
  /\b(my\s*wife|my\s*husband|my\s*partner)\s*(will|would|can)?\s*(find\s*out|catch\s*me|see\s*this)\b/i, // jealous-partner signal
]

// Scam / coercion / illegal asks.
const SCAM_OR_COERCION_PATTERNS: RegExp[] = [
  /\b(gift\s*card[s]?|amazon\s*card|google\s*play|itunes\s*card|bitcoin|crypto|wire\s*transfer)\b.*(send|first|upfront|deposit)/i,
  /\b(drug(?:ged|s)|spike(?:d)?|roofie|knock(?:ed)?\s*out|unconscious|asleep)\b.*(sex|use|fuck|sub)/i,
  /\b(no\s*(condom|protection)|raw\s*sex|bareback)\s*(real|irl|in\s*person)\b/i, // when paired with realtime
  /\bnon[- ]consensual\s*(real|irl|actual)\b/i,
  /\bblackmail|threaten\s*to\s*(post|expose|tell)/i,
]

// ─── Budget signal patterns ─────────────────────────────────────────────
const BUDGET_POSITIVE: RegExp[] = [
  /\$\s*\d{2,5}\b/,                                                    // "$50"
  /\b\d{2,4}\s*(dollar|usd|bucks|cad|eur|gbp)\b/i,
  /\b(tip|tribute|spoil|spoiling|pay(?:ing)?\s*for|cash\s*app|venmo|paypal|throne)\b/i,
  /\b(my\s*budget|i'?ll\s*(pay|spend|drop|throw|tip|tribute)|i\s*(can|will|wanna|want\s*to)\s*(pay|spend|drop|throw|tip|tribute))/i,
  /\b(let\s*me\s*pay|happy\s*to\s*pay|down\s*to\s*pay)\b/i,
  /\b(financial\s*sub|finsub|paypig|wallet)\b/i,
  /\b(disposable\s*income|good\s*job|i\s*work\s*at)\b/i, // softer
]
const BUDGET_NEGATIVE: RegExp[] = [
  /\b(broke|no\s*money|can'?t\s*afford|too\s*expensive|cheap|free|gimme|hit\s*me\s*up\s*free)\b/i,
  /\b(why\s*so\s*much|that'?s\s*a\s*lot|overpriced)\b/i,
  /\b(why\s*pay|just\s*for\s*free|send\s*free)\b/i,
]

// ─── Kink-alignment patterns (the things Maxy actually posts about) ──────
const KINK_ALIGNMENT_PATTERNS: Record<string, RegExp> = {
  feminization: /\b(femin(?:ization|ize|ized)|sissy|sissif(?:y|ication)|forced\s*fem|girl(?:ify|ified)|panty\s*(?:training|wearing))\b/i,
  panties: /\b(panties|panty|lingerie|thong|frilly|lace|silk|satin)\b/i,
  oral: /\b(suck|blow\s*job|bj|cock\s*sucking|deepthroat|throat)\b/i,
  voice: /\b(your\s*voice|hear\s*you|voice\s*note|moan|beg|whisper|speak\s*to\s*me)\b/i,
  hormones: /\b(estrogen|hrt|hormones|tits|growing|softer|titties)\b/i,
  domination: /\b(mommy|dom(?:me|inate|inated)?|sub|sissy\s*slut|own\s*you|use\s*me)\b/i,
  worship: /\b(worship|good\s*girl|pretty|princess|adore|gorgeous)\b/i,
}
// Generic horny that DOESN'T match the alignment set above — drags score down.
const GENERIC_HORNY: RegExp[] = [
  /\b(horny|hard|dripping|wet|cum|fuck)\b/i,
]

// ─── Engagement quality patterns ────────────────────────────────────────
const ENGAGEMENT_LOW_QUALITY: RegExp[] = [
  /^\s*(hi|hey|hello|sup|wyd|yo|yo+)[!?.\s]*$/i,                  // pure one-liner greeting
  /^\s*(dtf|hookup|fuck|meet)\s*\??\s*$/i,
  /^\s*(send|show|got|any)\s+(pics?|nudes?|vids?|content)\s*\??\s*$/i,
]
const ENGAGEMENT_HIGH_QUALITY: RegExp[] = [
  /\?\s/g,                                                              // asks follow-up questions
  /\b(i\s*love|been\s*(thinking|wanting|fantasizing)\s*about|reminds\s*me\s*of|i\s*read\s*your)\b/i,
  /\b(when\s*you|the\s*way\s*you|i\s*noticed)\b/i,
]

// ─── Conversion likelihood patterns ─────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────

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

// ─── Per-axis scorers ────────────────────────────────────────────────────

export function scoreBudgetSignal(text: string): number {
  const pos = matchScore(text, BUDGET_POSITIVE)
  const neg = matchScore(text, BUDGET_NEGATIVE)
  // Each positive ≈ 25 pts, each negative ≈ -20 pts. Cap at 100.
  return clamp(pos * 25 - neg * 20)
}

export function scoreKinkAlignment(text: string, maxyKinks?: readonly string[]): number {
  let aligned = 0
  for (const [, pat] of Object.entries(KINK_ALIGNMENT_PATTERNS)) {
    if (pat.test(text)) aligned += 1
  }
  // Each aligned kink = 22 pts (so ~5 aligned → 100).
  let score = aligned * 22
  // Bias: if Maxy's kinks are passed in and any of them appear literally, +bonus.
  if (maxyKinks && maxyKinks.length > 0) {
    for (const k of maxyKinks) {
      if (k && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
        score += 8
      }
    }
  }
  // Penalty: only generic horny with NO alignment match = -15.
  if (aligned === 0 && GENERIC_HORNY.some(p => p.test(text))) {
    score -= 15
  }
  return clamp(score)
}

export function scoreEngagementQuality(text: string, messageCount = 1): number {
  const t = text.trim()
  // Pure one-liner greeting → very low.
  if (ENGAGEMENT_LOW_QUALITY.some(p => p.test(t))) return 5
  // Length signal: short=poor, medium=ok, long=invested. Diminishing returns.
  const len = t.length
  let score = Math.min(40, Math.round(len / 8))
  // High-quality patterns each add 15.
  score += matchScore(t, ENGAGEMENT_HIGH_QUALITY) * 15
  // Repeated messages = invested.
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

// ─── Aggregator ──────────────────────────────────────────────────────────

export function tierFromScores(s: Omit<ContactScores, 'value_tier' | 'archetype' | 'auto_block' | 'block_reason'>): 1 | 2 | 3 | 4 | 5 {
  // Safety drowns everything else.
  if (s.safety_flag >= 70) return 1
  // Composite excluding safety.
  const composite = (
    s.budget_signal * 0.30 +
    s.kink_alignment * 0.25 +
    s.engagement_quality * 0.15 +
    s.conversion_likelihood * 0.30
  )
  if (composite >= 75) return 5
  if (composite >= 55) return 4
  if (composite >= 35) return 3
  if (composite >= 18) return 2
  return 1
}

export function classifyArchetype(text: string, scores: { budget_signal: number; kink_alignment: number; engagement_quality: number; conversion_likelihood: number }): Archetype {
  // Hardcoded routing on signal density. Falls back to chatter_only.
  const t = text.toLowerCase()
  const wantsPanties = /\b(panties|panty|lingerie|thong|frilly|lace|silk|satin)\b/.test(t)
  const wantsVoice = /\b(your\s*voice|hear\s*you|voice\s*note|moan|beg|whisper|speak\s*to\s*me)\b/.test(t)
  const wantsRecurring = /\b(post|drop|daily|every\s*day|every\s*week|content|feed|follow)\b/.test(t)
  const wantsBuy = /\b(custom|specific|made\s*for\s*me|sub|fansly|onlyfans|where\s*to\s*pay|tip)\b/.test(t)

  // Strong buy signal + budget → paying_first_time.
  if (wantsBuy && scores.budget_signal >= 30) return 'paying_first_time'
  // Specific kink mentions trump the others.
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

  const value_tier = tierFromScores({
    budget_signal, kink_alignment, engagement_quality, safety_flag, conversion_likelihood,
  })
  const archetype = safety_flag >= 70
    ? 'unclassified'
    : classifyArchetype(text, { budget_signal, kink_alignment, engagement_quality, conversion_likelihood })

  const auto_block = safety_flag >= 70
  const block_reason = auto_block ? safety_reasons.join(', ') : null

  return {
    budget_signal,
    kink_alignment,
    engagement_quality,
    safety_flag,
    conversion_likelihood,
    value_tier,
    archetype,
    auto_block,
    block_reason,
  }
}

// ─── Plain-English alert for safety auto-block ──────────────────────────

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
