import { describe, it, expect } from 'vitest'
import { penaltyMayApply, previewState } from '../../lib/penalty-preview'

// Regression guard for the Penalty Preview Rail (wish 31e1b144, mig 601).
// Pins the fail-closed rule: no penalty without a surfaced preview + grace.

const NOW = new Date('2026-06-05T18:00:00Z')
const fortyMinAgo = new Date(NOW.getTime() - 40 * 60_000)
const tenMinAgo = new Date(NOW.getTime() - 10 * 60_000)

describe('penaltyMayApply', () => {
  it('FALSE when no preview exists (fail-closed)', () => {
    expect(penaltyMayApply({ exists: false, cancelled: false, surfacedAt: fortyMinAgo, graceMinutes: 30, now: NOW })).toBe(false)
  })
  it('FALSE when the preview was never surfaced', () => {
    expect(penaltyMayApply({ exists: true, cancelled: false, surfacedAt: null, graceMinutes: 30, now: NOW })).toBe(false)
  })
  it('FALSE when cancelled', () => {
    expect(penaltyMayApply({ exists: true, cancelled: true, surfacedAt: fortyMinAgo, graceMinutes: 30, now: NOW })).toBe(false)
  })
  it('FALSE inside the grace window (not enough notice)', () => {
    expect(penaltyMayApply({ exists: true, cancelled: false, surfacedAt: tenMinAgo, graceMinutes: 30, now: NOW })).toBe(false)
  })
  it('TRUE once surfaced + grace elapsed', () => {
    expect(penaltyMayApply({ exists: true, cancelled: false, surfacedAt: fortyMinAgo, graceMinutes: 30, now: NOW })).toBe(true)
  })
})

describe('previewState', () => {
  const base = { cancelled: false, applied: false, graceMinutes: 30, now: NOW }
  it('not_shown / in_grace / live progression', () => {
    expect(previewState({ ...base, surfacedAt: null })).toBe('not_shown')
    expect(previewState({ ...base, surfacedAt: tenMinAgo })).toBe('in_grace')
    expect(previewState({ ...base, surfacedAt: fortyMinAgo })).toBe('live')
  })
  it('cancelled and applied take precedence', () => {
    expect(previewState({ ...base, surfacedAt: fortyMinAgo, cancelled: true })).toBe('cancelled')
    expect(previewState({ ...base, surfacedAt: fortyMinAgo, applied: true })).toBe('applied')
  })
})
