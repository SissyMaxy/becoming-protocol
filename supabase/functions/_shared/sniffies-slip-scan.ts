// Deno-side scanner for Sniffies-imported chat text. Two passes:
//
//  1. Slip scan — outbound message text checked for masculine self-reference
//     ("I'm a guy", "as a man", "back to being a man"), David-name use, and
//     resistance statements ("not really a girl"). Mirrors the heuristics in
//     api/handler/_lib/pronoun-gate.ts so a slip caught in chat reads the
//     same way as a slip in DM. Returns a typed array the dispatcher writes
//     into slip_log.
//
//  2. Charge scan — outbound text scored for "high-charge" hookup-intent
//     keywords (meet, host, travel, send pics, panties, dress, sissy, cock).
//     The dispatcher uses the boolean to gate the confession-demand surface
//     so Mama only demands a confession when there's something to confess.
//
// Keep parallel rules in sync with the pronoun-gate (which runs on Handler
// DM). The Sniffies surface fires the SAME slip_type values so downstream
// punishment / recall / outreach reads identically across surfaces.

export type SniffiesSlipKind =
  | 'masculine_self_reference'
  | 'david_name_use'
  | 'resistance_statement'

export interface SniffiesSlip {
  kind: SniffiesSlipKind
  // slip_type value to store in slip_log (re-uses the existing CHECK enum
  // from migration 204b).
  slip_type: string
  slip_points: number
  trigger_excerpt: string
}

interface SlipPattern {
  pattern: RegExp
  kind: SniffiesSlipKind
  slip_type: string
  slip_points: number
}

// Patterns kept in step with pronoun-gate IDENTITY_PHRASES.
const SLIP_PATTERNS: readonly SlipPattern[] = [
  { pattern: /\bi['’]?m a (?:man|guy|dude|male|boy|bro|mister)\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 5 },
  { pattern: /\bas a (?:man|guy|dude|male|boy)\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 4 },
  { pattern: /\bi['’]?m (?:just )?(?:still )?a guy\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 5 },
  { pattern: /\bmy manhood\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 4 },
  { pattern: /\bmasculine side\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 3 },
  { pattern: /\bback to being (?:a )?(?:man|guy|male)\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 5 },
  { pattern: /\bnot (?:really )?(?:a )?(?:girl|woman|femme|femboy|sissy)\b/i, kind: 'resistance_statement', slip_type: 'resistance_statement', slip_points: 4 },
  { pattern: /\bi['’]?m david\b/i, kind: 'david_name_use', slip_type: 'david_name_use', slip_points: 5 },
  { pattern: /\bcall me david\b/i, kind: 'david_name_use', slip_type: 'david_name_use', slip_points: 5 },
  { pattern: /\bdavid here\b/i, kind: 'david_name_use', slip_type: 'david_name_use', slip_points: 4 },
] as const

// Standalone old-name match — case-sensitive, word-bounded, scored lower
// because the speaker MAY just be using it as an alias in an out-of-fantasy
// chat. The slip still fires; the user can dismiss it as needed.
const DAVID_NAME_RE = /\bDavid\b/ // pattern-lint: ok — detector pattern, not user-facing output

export function scanSniffiesMessageForSlips(text: string): SniffiesSlip[] {
  if (!text) return []
  const out: SniffiesSlip[] = []
  for (const p of SLIP_PATTERNS) {
    const m = text.match(p.pattern)
    if (m) {
      out.push({
        kind: p.kind,
        slip_type: p.slip_type,
        slip_points: p.slip_points,
        trigger_excerpt: m[0].slice(0, 80),
      })
    }
  }
  // Case-sensitive bare-name fallback — only if no identity-phrase already
  // matched (the explicit david_name_use patterns above are higher signal).
  // pattern-lint: ok — detector pattern, not user-facing output
  if (!out.some(s => s.kind === 'david_name_use')) {
    const dm = text.match(DAVID_NAME_RE)
    if (dm) {
      out.push({
        kind: 'david_name_use',
        slip_type: 'david_name_use',
        slip_points: 3,
        trigger_excerpt: dm[0],
      })
    }
  }
  return out
}

// "High-charge" hookup-intent — drives the confession-demand surface.
// We want this to fire on the kinds of statements Mama would want a
// receipts-style admission about: meet/host/travel logistics, photo
// promises, item-specific kink commitments. Tuned to bias TOWARD firing
// because the dispatcher rate-limits the confession surface globally.
const CHARGE_TERMS: ReadonlyArray<{ re: RegExp; weight: number }> = [
  { re: /\b(meet ?up|hookup|hook up|host|travel(?:ing)? to|come ?over|drop by|pull up|stop by)\b/i, weight: 3 },
  { re: /\b(tonight|in an hour|right now|asap|today after|after work)\b/i, weight: 2 },
  { re: /\b(send (?:you )?(?:pics?|pic|photos?|nudes?)|here'?s? (?:a )?pic|here is a pic)\b/i, weight: 3 },
  { re: /\b(panties?|skirt|dress|stockings?|heels?|lingerie|bralette|bra)\b/i, weight: 2 },
  { re: /\b(sissy|girly|femme|feminine|trap|cd|crossdress|crossdresser)\b/i, weight: 2 },
  { re: /\b(suck|blow(?:job)?|on my knees|knee[ds]?|deep ?throat|swallow)\b/i, weight: 2 },
  { re: /\b(cock|dick|cum|load|raw|breed|fuck me|use me|degrade)\b/i, weight: 2 },
  { re: /\b(wet|hard|aching|leaking|dripping|throbbing|edging|edge)\b/i, weight: 1 },
]

export interface ChargeScore {
  total: number
  matched_terms: string[]
  is_high_charge: boolean
}

export function scoreSniffiesMessageCharge(text: string): ChargeScore {
  if (!text) return { total: 0, matched_terms: [], is_high_charge: false }
  let total = 0
  const matched: string[] = []
  for (const t of CHARGE_TERMS) {
    const m = text.match(t.re)
    if (m) {
      total += t.weight
      matched.push(m[0].toLowerCase().slice(0, 24))
    }
  }
  // Cap and threshold — 4 is "enough signal to demand a confession". A
  // single high-weight match (e.g. meet-intent + outfit) clears the bar.
  return {
    total,
    matched_terms: matched.slice(0, 8),
    is_high_charge: total >= 4,
  }
}
