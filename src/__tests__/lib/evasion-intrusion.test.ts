import { describe, it, expect } from 'vitest'
import { shouldReactToEvasion } from '../../lib/evasion-intrusion'

// Regression guard for evasion-reactive intrusions (wish a1a46348, mig 605).

const NOW = new Date('2026-06-05T18:00:00Z')
const base = { eventType: 'evasion', persona: 'dommy_mommy', cooldownUntil: null, evasionIntrusionsToday: 0, now: NOW }

describe('shouldReactToEvasion', () => {
  it('reacts to an evasion signal for dommy_mommy under cap', () => {
    expect(shouldReactToEvasion(base)).toBe(true)
  })
  it('ignores non-evasion signals (friction_chat etc.)', () => {
    expect(shouldReactToEvasion({ ...base, eventType: 'friction_chat' })).toBe(false)
  })
  it('skips for non-dommy_mommy personas', () => {
    expect(shouldReactToEvasion({ ...base, persona: 'therapist' })).toBe(false)
  })
  it('skips while safeword cooldown is active', () => {
    expect(shouldReactToEvasion({ ...base, cooldownUntil: new Date(NOW.getTime() + 3600_000) })).toBe(false)
  })
  it('enforces the 1/day cap (breaks the evasion->intrusion->evasion loop)', () => {
    expect(shouldReactToEvasion({ ...base, evasionIntrusionsToday: 1 })).toBe(false)
    expect(shouldReactToEvasion({ ...base, evasionIntrusionsToday: 3 })).toBe(false)
  })
})
