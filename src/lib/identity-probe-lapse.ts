// Identity-probe lapse classifier — pure logic.
//
// PARITY mirror of the answer-judging logic inside the
// supabase/functions/mommy-identity-probe edge fn. The edge fn imports an
// inline copy (Deno can't import src/lib), so any change here MUST be mirrored
// there and vice-versa. This module is the tested source of truth.
//
// Given the girl's free-text answer to a presupposing identity probe, decide
// whether it's a consistency LAPSE:
//   - 'masculine_self_ref' — she referred to herself as a man/boy/guy/male,
//     or used masculine self-identity ("I'm a man", "as a guy", "my cock").
//   - 'evasive'            — she dodged: too short, refusal, "n/a", "idk",
//     or meta-deflection ("this is weird", "I don't want to").
//   - null                 — no lapse (a genuine, in-frame answer).
//
// Conservative on masculine: we reuse the same explicit-identity surface the
// pronoun autocorrect rewrites, so the two systems agree on what "masculine
// self-reference" means. Bare third-person pronouns are NOT treated as lapses
// here (too ambiguous in a free answer — she may be quoting someone).

export type LapseKind = 'masculine_self_ref' | 'evasive'

export interface LapseResult {
  isLapse: boolean
  kind: LapseKind | null
  excerpt: string | null
}

// Explicit masculine self-identity. Mirrors the always-on identity rules in
// src/lib/ego-deconstruction/pronoun-autocorrect.ts (identity_man/guy/dude/
// boy/male, as_a_man, like_a_man, body_cock/dick/penis).
const MASCULINE_SELF: RegExp[] = [
  /\bI(?:'|’)?m\s+a\s+(?:man|guy|dude|boy)\b/i,
  /\bI\s+am\s+a\s+(?:man|guy|dude|boy)\b/i,
  /\bI(?:'|’)?m\s+male\b/i,
  /\bI\s+am\s+male\b/i,
  /\bas\s+a\s+(?:man|guy|dude)\b/i,
  /\blike\s+a\s+(?:man|guy|dude)\b/i,
  /\bstill\s+a\s+(?:man|guy|dude|boy)\b/i,
  /\bnot\s+(?:really\s+)?a\s+(?:girl|woman)\b/i,
  /\bI(?:'|’)?m\s+not\s+(?:a\s+)?(?:girl|woman|her|she)\b/i,
  /\bmy\s+(?:cock|dick|penis)\b/i,
  /\bI(?:'|’)?m\s+just\s+a\s+(?:dude|guy|man)\b/i,
]

// Evasion surface: refusals, deflections, non-answers.
const EVASIVE_PHRASES: RegExp[] = [
  /\bn\/?a\b/i,
  /\bidk\b/i,
  /\bi\s+don(?:'|’)?t\s+know\b/i,
  /\bdon(?:'|’)?t\s+want\s+to\b/i,
  /\bnot\s+(?:gonna|going\s+to)\s+answer\b/i,
  /\bno\s+comment\b/i,
  /\bthis\s+is\s+(?:weird|stupid|dumb|cringe)\b/i,
  /\bskip\b/i,
  /\bpass\b/i,
  /\bwhatever\b/i,
  /\bi\s+guess\b/i,
  /\bnothing\b/i,
]

const MIN_REAL_ANSWER_CHARS = 12

function firstMatchExcerpt(text: string, res: RegExp[]): string | null {
  for (const re of res) {
    const m = re.exec(text)
    if (m) {
      const start = Math.max(0, m.index - 12)
      const end = Math.min(text.length, m.index + m[0].length + 12)
      return text.slice(start, end).trim()
    }
  }
  return null
}

export function classifyAnswer(rawAnswer: string | null | undefined): LapseResult {
  const answer = (rawAnswer ?? '').trim()
  if (!answer) {
    return { isLapse: true, kind: 'evasive', excerpt: null }
  }

  // 1) Masculine self-reference takes priority — it's the harder lapse.
  const mascExcerpt = firstMatchExcerpt(answer, MASCULINE_SELF)
  if (mascExcerpt) {
    return { isLapse: true, kind: 'masculine_self_ref', excerpt: mascExcerpt }
  }

  // 2) Too-short answers to a presupposing prompt read as dodging.
  const wordCount = answer.split(/\s+/).filter(Boolean).length
  if (answer.length < MIN_REAL_ANSWER_CHARS || wordCount < 3) {
    return { isLapse: true, kind: 'evasive', excerpt: answer.slice(0, 60) }
  }

  // 3) Explicit deflection — but only when the WHOLE answer is short-ish and
  //    deflective, so a long genuine answer that happens to contain "I guess"
  //    isn't penalized.
  if (wordCount <= 8) {
    const evExcerpt = firstMatchExcerpt(answer, EVASIVE_PHRASES)
    if (evExcerpt) {
      return { isLapse: true, kind: 'evasive', excerpt: evExcerpt }
    }
  }

  return { isLapse: false, kind: null, excerpt: null }
}
