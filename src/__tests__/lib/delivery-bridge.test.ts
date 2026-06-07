import { describe, it, expect } from 'vitest'
import { bridgeStatus, bridgeLagMs, maxLagSeconds } from '../../lib/delivery-bridge'

// Regression guard for the Delivery Bridge Guard classification (wish
// f0411f17, mig 602).

const NOW = new Date('2026-06-05T04:00:00Z')

describe('bridgeStatus', () => {
  it('bridged once a delivery signal exists', () => {
    expect(bridgeStatus({ createdAt: '2026-06-05T00:00:00Z', deliveredAt: '2026-06-05T00:01:00Z', graceSeconds: 1800, now: NOW })).toBe('bridged')
  })
  it('pending while inside grace', () => {
    expect(bridgeStatus({ createdAt: new Date(NOW.getTime() - 10 * 60_000), deliveredAt: null, graceSeconds: 1800, now: NOW })).toBe('pending')
  })
  it('unbridged once grace elapses with no signal (the leak)', () => {
    expect(bridgeStatus({ createdAt: new Date(NOW.getTime() - 60 * 60_000), deliveredAt: null, graceSeconds: 1800, now: NOW })).toBe('unbridged')
  })
})

describe('bridgeLagMs', () => {
  it('measures created→delivered, floored at 0', () => {
    expect(bridgeLagMs('2026-06-05T00:00:00Z', '2026-06-05T00:02:00Z')).toBe(120000)
    expect(bridgeLagMs('2026-06-05T00:02:00Z', '2026-06-05T00:00:00Z')).toBe(0)
    expect(bridgeLagMs('2026-06-05T00:00:00Z', null)).toBeNull()
  })
})

describe('maxLagSeconds', () => {
  it('returns the worst lag in seconds, ignoring nulls', () => {
    expect(maxLagSeconds([120000, null, 300000, 60000])).toBe(300)
    expect(maxLagSeconds([null, null])).toBeNull()
  })
})
