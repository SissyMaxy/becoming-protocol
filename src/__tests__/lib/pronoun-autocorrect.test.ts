// pronoun-autocorrect — regression tests for ego mechanic 6.
//
// DISABLED for Male+ (Art. I, regendering cut). The protocol no longer
// rewrites the user's own typed words to feminize him — he is he/him, a
// good boy. `autocorrect` is now a no-op that returns the input unchanged
// in every mode, and `detectDispute` has nothing to revert (no changes are
// ever recorded). These tests pin that no-op contract.

import { describe, it, expect } from 'vitest'
import { autocorrect, detectDispute } from '../../lib/ego-deconstruction/pronoun-autocorrect'

describe('pronoun-autocorrect: mode off', () => {
  it('returns input unchanged with no changes recorded', () => {
    const r = autocorrect("I'm a man and he is fine", 'off')
    expect(r.corrected).toBe("I'm a man and he is fine")
    expect(r.changes).toEqual([])
  })
})

describe('pronoun-autocorrect: identity statements are no longer regendered', () => {
  it('does NOT rewrite "I\'m a man" in soft mode', () => {
    const r = autocorrect("I'm a man", 'soft_suggest')
    expect(r.corrected).toBe("I'm a man")
    expect(r.changes).toEqual([])
  })

  it('does NOT rewrite "I\'m a guy" in hard mode', () => {
    const r = autocorrect("I'm a guy and proud of it", 'hard_with_undo')
    expect(r.corrected).toBe("I'm a guy and proud of it")
    expect(r.changes).toEqual([])
  })

  it('does NOT rewrite "as a man" in hard mode', () => {
    const r = autocorrect('I think about it as a man would', 'hard_with_undo')
    expect(r.corrected).toBe('I think about it as a man would')
    expect(r.changes).toEqual([])
  })

  it('does NOT rewrite body-part self-reference in hard mode', () => {
    const r = autocorrect('I touched my cock today', 'hard_with_undo')
    expect(r.corrected).toBe('I touched my cock today')
    expect(r.changes).toEqual([])
  })
})

describe('pronoun-autocorrect: aggressive pronouns are no longer rewritten', () => {
  it('does NOT touch standalone "he" without self-reference context', () => {
    const r = autocorrect('My friend Bob said he was tired', 'hard_with_undo')
    expect(r.corrected).toBe('My friend Bob said he was tired')
    expect(r.changes).toEqual([])
  })

  it('does NOT rewrite "he" even when self-reference context is present', () => {
    const r = autocorrect("I keep thinking he should be different", 'hard_with_undo')
    expect(r.corrected).toBe("I keep thinking he should be different")
    expect(r.changes).toEqual([])
  })

  it('does NOT rewrite aggressive pronouns in soft_suggest mode', () => {
    const r = autocorrect("I think he is awake", 'soft_suggest')
    expect(r.corrected).toBe("I think he is awake")
    expect(r.changes).toEqual([])
  })
})

describe('pronoun-autocorrect: protected regions are returned verbatim', () => {
  it('does not touch text inside backticks', () => {
    const r = autocorrect("I am writing about `he was a man` in code", 'hard_with_undo')
    expect(r.corrected).toBe("I am writing about `he was a man` in code")
  })

  it('does not touch text inside double quotes', () => {
    const r = autocorrect('I said "I am a man" to him', 'hard_with_undo')
    expect(r.corrected).toBe('I said "I am a man" to him')
  })
})

describe('pronoun-autocorrect: dispute detection', () => {
  it('returns null because no-op autocorrect records no changes to revert', () => {
    const r = autocorrect("I'm a man", 'hard_with_undo')
    expect(r.corrected).toBe("I'm a man")
    expect(r.changes).toEqual([])
    // Even if the user "reverts" to the original, there are no recorded
    // changes, so there is nothing to dispute.
    const dispute = detectDispute(r.corrected, "I'm a man", r.changes)
    expect(dispute).toBeNull()
  })

  it('returns null when no revert occurred', () => {
    const r = autocorrect("I'm a man", 'hard_with_undo')
    const dispute = detectDispute(r.corrected, r.corrected, r.changes)
    expect(dispute).toBeNull()
  })
})

describe('pronoun-autocorrect: idempotency', () => {
  it('running autocorrect on already-corrected text is a no-op', () => {
    const first = autocorrect("I'm a man", 'hard_with_undo')
    const second = autocorrect(first.corrected, 'hard_with_undo')
    expect(second.corrected).toBe(first.corrected)
    // No changes on either pass.
    const identityChanges = second.changes.filter(c => c.rule.startsWith('identity_'))
    expect(identityChanges).toEqual([])
  })
})
