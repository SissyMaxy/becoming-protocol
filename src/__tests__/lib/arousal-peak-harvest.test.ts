import { describe, it, expect } from 'vitest'
import { shouldHarvest } from '../../lib/arousal-peak-harvest'

// Regression guard for the arousal-peak harvest gate (wish d6936722, mig 604).

const NOW = new Date('2026-06-05T18:00:00Z')
const twoHrAgo = new Date(NOW.getTime() - 2 * 3600_000)
const tenMinAgo = new Date(NOW.getTime() - 10 * 60_000)
const base = { persona: 'dommy_mommy', cooldownUntil: null, lastDrillAt: null, lastHarvestAt: null, now: NOW }

describe('shouldHarvest', () => {
  it('harvests for dommy_mommy with no recent drill/nudge and no cooldown', () => {
    expect(shouldHarvest(base)).toBe(true)
    expect(shouldHarvest({ ...base, lastDrillAt: twoHrAgo, lastHarvestAt: twoHrAgo })).toBe(true)
  })
  it('skips for non-dommy_mommy personas', () => {
    expect(shouldHarvest({ ...base, persona: 'therapist' })).toBe(false)
    expect(shouldHarvest({ ...base, persona: null })).toBe(false)
  })
  it('skips while safeword cooldown is active', () => {
    expect(shouldHarvest({ ...base, cooldownUntil: new Date(NOW.getTime() + 3600_000) })).toBe(false)
  })
  it('merges with existing asks — skips if a drill landed in the last hour', () => {
    expect(shouldHarvest({ ...base, lastDrillAt: tenMinAgo })).toBe(false)
  })
  it('skips if a harvest nudge already fired in the last hour (no double-ask)', () => {
    expect(shouldHarvest({ ...base, lastHarvestAt: tenMinAgo })).toBe(false)
  })
})
