import { describe, it, expect } from 'vitest'
import { detectUxFriction } from '../../lib/ux-friction'

// Regression guard for the adaptive-loop friction detector (wish d93efde1,
// mig 599). The load-bearing property is PRECISION: arousal/roleplay phrasing
// in the protocol's chat corpus must NOT register as product friction (each
// false positive files a spurious code-wish).

describe('detectUxFriction — true positives', () => {
  const hits: [string, string][] = [
    ['the voice gate counter isn\'t working', 'not_working'],
    ['honestly it would be more useful to do a quick voice exercise', 'would_be_better'],
    ['this card is broken', 'broken'],
    ['this is annoying, the form keeps resetting', 'this_is_annoying'],
    ['what does this even do', 'what_should_this_do'],
    ['i can\'t figure out where the confession goes', 'cant_figure_out'],
    ['the page is stuck and won\'t load', 'ui_element_broken'],
  ]
  it.each(hits)('flags %j → %s', (text, kind) => {
    expect(detectUxFriction(text)).toBe(kind)
  })
})

describe('detectUxFriction — precision (no false positives on filthy chat)', () => {
  const misses = [
    'i can\'t take it mommy please',
    'this is too much i\'m going to cum',
    'i can\'t stop thinking about you',
    'mama this feels so good',
    'i need you so bad right now',
    'please i can\'t hold it any longer',
    'you broke me mommy',          // "broke" but not the \bbroken\b token
    'yes',
  ]
  it.each(misses)('does NOT flag %j', (text) => {
    expect(detectUxFriction(text)).toBeNull()
  })
})
