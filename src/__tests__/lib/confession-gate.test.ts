import { describe, it, expect } from 'vitest'
import { shouldGateConfession } from '../../lib/confession-gate'

// Regression guard for the confession gate (wish 187f616e, migration 591).
// Pins the rule: Mama withholds the morning only when a dommy_mommy user,
// not on the recovery (aftercare) band, has an unanswered confession older
// than 12h. Parity mirror of confession_gate_should_be_active() in SQL.

const NOW = new Date('2026-06-05T13:00:00Z')
const thirteenHoursAgo = new Date(NOW.getTime() - 13 * 3600_000)
const oneHourAgo = new Date(NOW.getTime() - 1 * 3600_000)

describe('shouldGateConfession', () => {
  it('gates when dommy_mommy, firm band, confession unanswered >12h', () => {
    expect(shouldGateConfession({
      persona: 'dommy_mommy', effectiveBand: 'firm',
      pendingConfessionCreatedAt: thirteenHoursAgo, now: NOW,
    })).toBe(true)
  })

  it('does NOT gate on the recovery band (aftercare floor is exempt)', () => {
    expect(shouldGateConfession({
      persona: 'dommy_mommy', effectiveBand: 'recovery',
      pendingConfessionCreatedAt: thirteenHoursAgo, now: NOW,
    })).toBe(false)
  })

  it('does NOT gate before 12h have passed (not "last night\'s" yet)', () => {
    expect(shouldGateConfession({
      persona: 'dommy_mommy', effectiveBand: 'firm',
      pendingConfessionCreatedAt: oneHourAgo, now: NOW,
    })).toBe(false)
  })

  it('does NOT gate when no confession is pending (answered/none)', () => {
    expect(shouldGateConfession({
      persona: 'dommy_mommy', effectiveBand: 'firm',
      pendingConfessionCreatedAt: null, now: NOW,
    })).toBe(false)
  })

  it('does NOT gate for non-dommy_mommy personas', () => {
    expect(shouldGateConfession({
      persona: 'therapist', effectiveBand: 'firm',
      pendingConfessionCreatedAt: thirteenHoursAgo, now: NOW,
    })).toBe(false)
    expect(shouldGateConfession({
      persona: null, effectiveBand: 'firm',
      pendingConfessionCreatedAt: thirteenHoursAgo, now: NOW,
    })).toBe(false)
  })

  it('cruel band still gates (only recovery is exempt)', () => {
    expect(shouldGateConfession({
      persona: 'dommy_mommy', effectiveBand: 'cruel',
      pendingConfessionCreatedAt: thirteenHoursAgo, now: NOW,
    })).toBe(true)
  })
})
