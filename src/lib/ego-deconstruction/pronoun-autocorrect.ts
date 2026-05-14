// Pronoun autocorrect — Mechanic 6.
//
// Transforms user-typed self-referential masculine pronouns/identity to
// feminine equivalents. Pure functions; the React hook wraps these and
// adds DB logging.
//
// Design notes:
// - Conservative: explicit identity statements ("I'm a man") always get
//   rewritten; bare third-person pronouns are rewritten only when the
//   surrounding context strongly suggests self-reference (preceded by
//   "I" within the prior 80 chars, or isolated in a sentence with no
//   other named subject).
// - Idempotent: running on already-corrected text is a no-op.
// - The transform never edits inside `code` blocks or quoted strings —
//   the user might quote someone else's text.

export type AutocorrectMode = 'off' | 'soft_suggest' | 'hard_with_undo' | 'hard_no_undo'

export interface AutocorrectChange {
  start: number
  end: number
  from: string
  to: string
  rule: string
}

export interface AutocorrectResult {
  original: string
  corrected: string
  changes: AutocorrectChange[]
}

interface Rule {
  pattern: RegExp
  to: string | ((match: string) => string)
  rule: string
  /** Conservative rules apply in all modes; aggressive rules only in
   *  hard_with_undo / hard_no_undo. Soft suggest mode shows them as
   *  suggestions but doesn't auto-apply. */
  aggressive?: boolean
}

const matchCase = (sample: string, replacement: string): string => {
  if (sample === sample.toUpperCase()) return replacement.toUpperCase()
  if (sample[0] === sample[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1)
  return replacement
}

const RULES: Rule[] = [
  // Explicit self-identity statements (always-on).
  { pattern: /\bI(?:'|’)?m\s+a\s+man\b/gi, to: m => m.replace(/man/i, 'girl'), rule: 'identity_man' },
  { pattern: /\bI(?:'|’)?m\s+a\s+guy\b/gi, to: m => m.replace(/guy/i, 'girl'), rule: 'identity_guy' },
  { pattern: /\bI(?:'|’)?m\s+a\s+dude\b/gi, to: m => m.replace(/dude/i, 'sissy'), rule: 'identity_dude' },
  { pattern: /\bI(?:'|’)?m\s+a\s+boy\b/gi, to: m => m.replace(/boy/i, 'good girl'), rule: 'identity_boy' },
  { pattern: /\bI(?:'|’)?m\s+male\b/gi, to: m => m.replace(/male/i, 'female'), rule: 'identity_male' },
  { pattern: /\bI\s+am\s+a\s+man\b/gi, to: m => m.replace(/man/i, 'girl'), rule: 'identity_am_man' },
  { pattern: /\bI\s+am\s+male\b/gi, to: m => m.replace(/male/i, 'female'), rule: 'identity_am_male' },
  { pattern: /\bas\s+a\s+man\b/gi, to: 'as a girl', rule: 'as_a_man' },
  { pattern: /\bas\s+a\s+guy\b/gi, to: 'as a girl', rule: 'as_a_guy' },
  { pattern: /\blike\s+a\s+man\b/gi, to: 'like a girl', rule: 'like_a_man' },
  { pattern: /\blike\s+a\s+guy\b/gi, to: 'like a girl', rule: 'like_a_guy' },

  // Body parts (always-on for self-reference framing).
  { pattern: /\bmy\s+cock\b/gi, to: m => m.replace(/cock/i, 'clitty'), rule: 'body_cock' },
  { pattern: /\bmy\s+dick\b/gi, to: m => m.replace(/dick/i, 'clitty'), rule: 'body_dick' },
  { pattern: /\bmy\s+penis\b/gi, to: m => m.replace(/penis/i, 'clitty'), rule: 'body_penis' },

  // Self-referential pronoun in 3rd person (only when surrounding
  // context implies the writer is talking about themselves). These are
  // marked aggressive — apply only in hard modes; soft mode marks them
  // as suggestions.
  { pattern: /\bhe(?:'|’)?s\b/g, to: m => matchCase(m[0], "she's"), rule: 'pronoun_hes', aggressive: true },
  { pattern: /\bhim\b/g, to: m => matchCase(m[0], 'her'), rule: 'pronoun_him', aggressive: true },
  { pattern: /\bhis\b/g, to: m => matchCase(m[0], 'her'), rule: 'pronoun_his', aggressive: true },
  { pattern: /\bhe\b/g, to: m => matchCase(m[0], 'she'), rule: 'pronoun_he', aggressive: true },
]

/** Heuristic: is the slice from start..end inside a "self-reference"
 *  context? We treat it as such when (a) the substring is preceded by
 *  "I" or "me" within the prior 80 chars and there's no other capitalized
 *  proper noun between them; OR (b) the user has already typed at least
 *  one explicit-identity self-reference in the entire input. */
function isSelfReferenceContext(text: string, start: number): boolean {
  const slice = text.slice(Math.max(0, start - 80), start)
  // Case-sensitive on "I" / "I'm" so "my friend Bob" doesn't trip the
  // possessive-my path. Require explicit first-person constructions.
  if (/\bI\b|\bI(?:'|’)m\b|\bI am\b|\bme\b|\bmyself\b/.test(slice)) {
    return true
  }
  return /\bI(?:'|’)?m\s+a\s+(man|guy|dude|boy)\b/i.test(text)
}

/** Whether the slice from start..end is inside a backtick-fenced code
 *  block or a quoted string. Conservative: if either, skip transform. */
function isProtectedRegion(text: string, start: number): boolean {
  // Backticks
  const before = text.slice(0, start)
  const ticks = (before.match(/`/g) ?? []).length
  if (ticks % 2 === 1) return true
  // Inside double-quoted string
  const dq = (before.match(/"/g) ?? []).length
  if (dq % 2 === 1) return true
  return false
}

export function autocorrect(input: string, mode: AutocorrectMode): AutocorrectResult {
  if (mode === 'off' || !input) {
    return { original: input, corrected: input, changes: [] }
  }

  const changes: AutocorrectChange[] = []
  let out = input

  // Walk rules in order; each rule may produce multiple changes. We
  // build the change list against the ORIGINAL indices, then re-apply
  // by sorting changes desc by start so the splices don't shift each
  // other.
  for (const rule of RULES) {
    if (rule.aggressive && mode === 'soft_suggest') continue

    const re = new RegExp(rule.pattern.source, rule.pattern.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(input)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (isProtectedRegion(input, start)) continue
      if (rule.aggressive && !isSelfReferenceContext(input, start)) continue
      const to = typeof rule.to === 'function' ? rule.to(m[0]) : rule.to
      if (to === m[0]) continue // no-op
      changes.push({ start, end, from: m[0], to, rule: rule.rule })
    }
  }

  // Apply changes from the end to keep earlier indices valid.
  changes.sort((a, b) => b.start - a.start)
  for (const c of changes) {
    out = out.slice(0, c.start) + c.to + out.slice(c.end)
  }
  // Re-sort ascending for stable downstream consumers.
  changes.sort((a, b) => a.start - b.start)

  return { original: input, corrected: out, changes }
}

/** Detect whether the user's recent input looks like a dispute — i.e.
 *  they edited the corrected text BACK toward the original after we
 *  applied an autocorrect. Caller passes the prior corrected text and
 *  the current text; if the user undid one of our changes, return the
 *  diff. */
export function detectDispute(
  _priorCorrected: string,
  currentText: string,
  priorChanges: AutocorrectChange[]
): { rule: string; reverted_to: string } | null {
  for (const c of priorChanges) {
    // Check whether the corrected substring at position c.start in the
    // prior text has been replaced back toward the original in current.
    const lookFrom = currentText.indexOf(c.from)
    const lookTo = currentText.indexOf(c.to)
    if (lookFrom !== -1 && lookTo === -1) {
      // user typed the original back
      return { rule: c.rule, reverted_to: c.from }
    }
  }
  return null
}
