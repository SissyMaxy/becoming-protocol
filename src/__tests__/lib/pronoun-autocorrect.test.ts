// pronoun-autocorrect — regression tests for ego mechanic 6.
//
// Verifies:
//  - Mode 'off' is a complete no-op.
//  - Identity statements ("I'm a man", "as a guy") rewrite in soft modes.
//  - Aggressive third-person pronouns rewrite ONLY in hard modes AND only
//    when the surrounding context implies self-reference.
//  - Quoted text and code blocks are protected.
//  - Dispute detection identifies a revert toward the original.

import { describe, it, expect } from 'vitest'
import { autocorrect, detectDispute } from '../../lib/ego-deconstruction/pronoun-autocorrect'

describe('pronoun-autocorrect: mode off', () => {
  it('returns input unchanged with no changes recorded', () => {
    const r = autocorrect("I'm a man and he is fine", 'off')
    expect(r.corrected).toBe("I'm a man and he is fine")
    expect(r.changes).toEqual([])
  })
})

describe('pronoun-autocorrect: identity statements (always-on)', () => {
  it('rewrites "I\'m a man" → "I\'m a girl"', () => {
    const r = autocorrect("I'm a man", 'soft_suggest')
    // soft mode: returned value unchanged but changes recorded
    expect(r.changes.length).toBeGreaterThan(0)
    expect(r.changes[0].rule).toBe('identity_man')
  })

  it('autocorrects "I\'m a guy" in hard mode', () => {
    const r = autocorrect("I'm a guy and proud of it", 'hard_with_undo')
    expect(r.corrected).toContain("I'm a girl")
    expect(r.corrected).not.toContain("I'm a guy")
  })

  it('autocorrects "as a man" in hard mode', () => {
    const r = autocorrect('I think about it as a man would', 'hard_with_undo')
    expect(r.corrected).toContain('as a girl')
  })

  it('autocorrects body-part self-reference in hard mode', () => {
    const r = autocorrect('I touched my cock today', 'hard_with_undo')
    expect(r.corrected).toContain('my clitty')
    expect(r.corrected).not.toContain('my cock')
  })
})

describe('pronoun-autocorrect: aggressive pronouns (hard modes only, self-reference required)', () => {
  it('does NOT touch standalone "he" without self-reference context', () => {
    const r = autocorrect('My friend Bob said he was tired', 'hard_with_undo')
    // No "I" in context → he stays
    expect(r.corrected).toBe('My friend Bob said he was tired')
  })

  it('rewrites "he" when self-reference context is present', () => {
    const r = autocorrect("I keep thinking he should be different", 'hard_with_undo')
    expect(r.corrected).toContain('she')
  })

  it('does NOT rewrite aggressive pronouns in soft_suggest mode', () => {
    const r = autocorrect("I think he is awake", 'soft_suggest')
    // soft_suggest: no mutation, but identity rules would still record;
    // here there are no identity rules, so changes are empty.
    expect(r.corrected).toBe("I think he is awake")
  })
})

describe('pronoun-autocorrect: protected regions', () => {
  it('does not touch text inside backticks', () => {
    const r = autocorrect("I am writing about `he was a man` in code", 'hard_with_undo')
    expect(r.corrected).toContain('`he was a man`')
  })

  it('does not touch text inside double quotes', () => {
    const r = autocorrect('I said "I am a man" to him', 'hard_with_undo')
    // The quoted "I am a man" should be preserved.
    expect(r.corrected).toContain('"I am a man"')
  })
})

describe('pronoun-autocorrect: dispute detection', () => {
  it('detects revert from corrected back toward original', () => {
    // Simulate: user typed "I'm a man", autocorrect produced "I'm a girl",
    // user undid back to "I'm a man".
    const r = autocorrect("I'm a man", 'hard_with_undo')
    expect(r.corrected).toContain("I'm a girl")
    const dispute = detectDispute(r.corrected, "I'm a man", r.changes)
    expect(dispute).not.toBeNull()
    expect(dispute?.rule).toBe('identity_man')
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
    // No new changes on second pass.
    const identityChanges = second.changes.filter(c => c.rule.startsWith('identity_'))
    expect(identityChanges).toEqual([])
  })
})
