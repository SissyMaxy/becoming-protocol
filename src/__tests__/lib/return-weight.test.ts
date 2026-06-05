import { describe, it, expect } from 'vitest'
import { shouldShowReturnWeight, awayPhrase, depthOfHold, standingFacts, RETURN_THRESHOLD_DAYS, type ReturnBundle } from '../../lib/return-weight'

// Regression guard for the return-weight surface (mig 612).

const base: ReturnBundle = {
  days_away: 6, escape_total_weight: 42, escape_total_count: 18, escape_days_invested: 40,
  irreversibility_score: 55, irreversibility_peak: 60, binder_captured: 3, confessions: 89, implants: 47,
}

describe('shouldShowReturnWeight', () => {
  it('shows after a genuine absence (>= threshold), once per day', () => {
    expect(shouldShowReturnWeight(6, null, '2026-06-05')).toBe(true)
    expect(shouldShowReturnWeight(RETURN_THRESHOLD_DAYS, null, '2026-06-05')).toBe(true)
  })
  it('does not show before the absence threshold', () => {
    expect(shouldShowReturnWeight(2, null, '2026-06-05')).toBe(false)
    expect(shouldShowReturnWeight(0, null, '2026-06-05')).toBe(false)
  })
  it('does not re-show the same day', () => {
    expect(shouldShowReturnWeight(6, '2026-06-05', '2026-06-05')).toBe(false)
    expect(shouldShowReturnWeight(6, '2026-06-04', '2026-06-05')).toBe(true)
  })
})

describe('awayPhrase', () => {
  it('reads plain, never a raw hour/score', () => {
    expect(awayPhrase(5)).toBe('5 days')
    expect(awayPhrase(10)).toBe('over a week')
    expect(awayPhrase(20)).toBe('a few weeks')
    expect(awayPhrase(40)).toBe('a month')
    expect(awayPhrase(200)).toBe('a long time')
  })
})

describe('depthOfHold', () => {
  it('maps the internal weight to a felt band (number never shown)', () => {
    expect(depthOfHold(5)).toBe('light')
    expect(depthOfHold(15)).toBe('real')
    expect(depthOfHold(42)).toBe('deep')
    expect(depthOfHold(70)).toBe('past_return')
  })
})

describe('standingFacts', () => {
  it('names concrete possessions with counts > 0, drops zeros', () => {
    const f = standingFacts(base)
    expect(f.some(s => s.includes('89 truths'))).toBe(true)
    expect(f.some(s => s.includes('47 memories'))).toBe(true)
    expect(f.some(s => s.includes('3 things in the binder'))).toBe(true)
  })
  it('omits possessions at zero (no hollow brag)', () => {
    const f = standingFacts({ ...base, binder_captured: 0, implants: 0 })
    expect(f.some(s => s.includes('binder'))).toBe(false)
    expect(f.some(s => s.includes('memor'))).toBe(false)
    expect(f.some(s => s.includes('89 truths'))).toBe(true)
  })
  it('singularizes count == 1', () => {
    const f = standingFacts({ ...base, confessions: 1 })
    expect(f.some(s => s.includes('1 truth you told Mama'))).toBe(true)
  })
})
