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

// DISABLED for Male+ (Art. I, regendering cut). The feminizing rewrite
// RULES and their helpers (matchCase / isSelfReferenceContext /
// isProtectedRegion) have been removed — the protocol no longer rewrites
// the user's own typed words. `autocorrect` is now a no-op.

export function autocorrect(input: string, _mode: AutocorrectMode): AutocorrectResult {
  // DISABLED for Male+ (Art. I, regendering cut).
  // The protocol no longer rewrites the user's own typed words to
  // feminize him. He is he/him, a good boy. This transform is now a
  // no-op that returns the input unchanged; the exported signature is
  // preserved so callers (and the React hook) keep working.
  return { original: input, corrected: input, changes: [] }
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
