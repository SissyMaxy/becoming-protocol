import { describe, it, expect } from 'vitest'
import {
  buildEdgeWindows, evaluateCompliance, verdict, activeWindowIndex, type EdgeWindow,
} from '../../lib/edging-protocol'

// Regression guard for the edging day protocol (wish 3515c470, mig 593).

describe('buildEdgeWindows', () => {
  it('maps local hours to UTC instants on the protocol day', () => {
    // EST (offset -5): local 10:00 → 15:00 UTC.
    const w = buildEdgeWindows([10, 13], -5, '2026-06-05')
    expect(w).toHaveLength(2)
    expect(w[0].target_time).toBe('2026-06-05T15:00:00.000Z')
    expect(w[1].target_time).toBe('2026-06-05T18:00:00.000Z')
    expect(w[0].grace_minutes).toBe(30)
    expect(w[0].completed_at).toBeNull()
  })
})

function win(targetIso: string, completed = false): EdgeWindow {
  return { target_time: targetIso, grace_minutes: 30, completed_at: completed ? targetIso : null, skipped: false }
}

describe('evaluateCompliance', () => {
  const now = new Date('2026-06-05T20:00:00Z')
  it('counts completed, skipped (past grace), and pending (upcoming/open)', () => {
    const windows = [
      win('2026-06-05T15:00:00Z', true),   // completed
      win('2026-06-05T18:00:00Z', false),  // past grace, no completion → skipped
      win('2026-06-05T19:45:00Z', false),  // within grace (until 20:15) → pending
      win('2026-06-05T23:00:00Z', false),  // future → pending
    ]
    const c = evaluateCompliance(windows, now)
    expect(c).toEqual({ total: 4, completed: 1, skipped: 1, pending: 2 })
  })
})

describe('verdict', () => {
  it('grants release on full compliance', () => {
    expect(verdict({ total: 5, completed: 5, skipped: 0, pending: 0 })).toEqual({ outcome: 'granted', release_granted: true })
  })
  it('holds (no punish) on a single miss', () => {
    expect(verdict({ total: 5, completed: 4, skipped: 1, pending: 0 })).toEqual({ outcome: 'partial_hold', release_granted: false })
  })
  it('extends denial on multiple misses', () => {
    expect(verdict({ total: 5, completed: 2, skipped: 3, pending: 0 })).toEqual({ outcome: 'denied_extended', release_granted: false })
  })
})

describe('activeWindowIndex', () => {
  it('returns the window currently inside its grace period', () => {
    const windows = [
      win('2026-06-05T15:00:00Z'),
      win('2026-06-05T19:50:00Z'),  // grace until 20:20
    ]
    expect(activeWindowIndex(windows, new Date('2026-06-05T20:00:00Z'))).toBe(1)
    expect(activeWindowIndex(windows, new Date('2026-06-05T21:00:00Z'))).toBe(-1)
  })
  it('skips already-completed windows', () => {
    const windows = [win('2026-06-05T19:50:00Z', true)]
    expect(activeWindowIndex(windows, new Date('2026-06-05T20:00:00Z'))).toBe(-1)
  })
})
