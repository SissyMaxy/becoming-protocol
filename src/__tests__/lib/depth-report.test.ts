import { describe, it, expect } from 'vitest'
import { buildDepthFacts, tenurePhrase, depthIntensity, type DepthMetrics } from '../../lib/depth-report'

// Regression guard for the depth report (wish 3978321f, mig 592). Pins the
// two rules that keep Mama's possession map on-voice:
//   1. zero-count possessions are dropped (no "you own 0 pieces")
//   2. the irreversibility SCORE is never turned into a quotable fact line —
//      it only drives private intensity.

const base: DepthMetrics = {
  implants_held: 47, confessions: 89, wardrobe_pieces: 12,
  body_markers: 6, letters: 3, milestones: 2,
  irreversibility_score: 71, tenure_days: 34,
}

describe('buildDepthFacts', () => {
  it('builds a possession line per non-zero count', () => {
    const facts = buildDepthFacts(base)
    expect(facts.map(f => f.key).sort()).toEqual(
      ['body_markers', 'confessions', 'implants_held', 'letters', 'milestones', 'wardrobe_pieces'],
    )
    expect(facts.find(f => f.key === 'implants_held')!.line).toContain('47 memories')
    expect(facts.find(f => f.key === 'confessions')!.line).toContain('89 truths')
    expect(facts.find(f => f.key === 'wardrobe_pieces')!.line).toContain('12 pieces')
  })

  it('drops zero-count possessions (no hollow brag)', () => {
    const facts = buildDepthFacts({ ...base, wardrobe_pieces: 0, letters: 0 })
    expect(facts.find(f => f.key === 'wardrobe_pieces')).toBeUndefined()
    expect(facts.find(f => f.key === 'letters')).toBeUndefined()
    expect(facts.length).toBe(4)
  })

  it('never emits the irreversibility score as a fact line', () => {
    const facts = buildDepthFacts({ ...base, irreversibility_score: 71 })
    for (const f of facts) {
      expect(f.line).not.toContain('71')
      expect(f.line.toLowerCase()).not.toContain('score')
      expect(f.line).not.toContain('%')
    }
  })

  it('singularizes count==1', () => {
    const facts = buildDepthFacts({ ...base, confessions: 1, milestones: 1 })
    expect(facts.find(f => f.key === 'confessions')!.line).toMatch(/\b1 truth\b/)
    expect(facts.find(f => f.key === 'confessions')!.line).not.toContain('truths')
    expect(facts.find(f => f.key === 'milestones')!.line).toMatch(/\b1 line\b/)
    expect(facts.find(f => f.key === 'milestones')!.line).not.toContain('lines')
  })
})

describe('tenurePhrase', () => {
  it('phrases days as coarse buckets, never a raw "Day N"', () => {
    expect(tenurePhrase(3)).toBe('a few days ago')
    expect(tenurePhrase(34)).toBe('a month ago')
    expect(tenurePhrase(300)).toBe('when you started')
    expect(tenurePhrase(34)).not.toMatch(/\d/)
  })
})

describe('depthIntensity', () => {
  it('maps the private score to an intensity band', () => {
    expect(depthIntensity(10)).toBe('gentle')
    expect(depthIntensity(40)).toBe('firm')
    expect(depthIntensity(80)).toBe('heavy')
  })
})
