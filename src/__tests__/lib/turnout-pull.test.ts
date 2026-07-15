// Pure-function tests for the turn-out pull meter (DESIGN_TURNOUT_LADDER §5).
// Confirms the tier is monotonic in cursor position and that the voice
// translator never emits a rung code, ordinal, or day-count.

import { describe, it, expect } from 'vitest';
import { computeTurnoutTier } from '../../lib/turnout/turnoutPull';
import { turnoutPullToPhrase } from '../../lib/persona/dommy-mommy';

describe('computeTurnoutTier', () => {
  it('is 0 at the first rung (T0, ordinal 0)', () => {
    expect(computeTurnoutTier({ ordinal: 0, maxOrdinal: 8 })).toBe(0);
  });

  it('is 0 when maxOrdinal is unknown (no ladder rows yet)', () => {
    expect(computeTurnoutTier({ ordinal: 3, maxOrdinal: 0 })).toBe(0);
  });

  it('is monotonically non-decreasing as the cursor advances', () => {
    let prev = -1;
    for (let ordinal = 0; ordinal <= 8; ordinal++) {
      const tier = computeTurnoutTier({ ordinal, maxOrdinal: 8 });
      expect(tier).toBeGreaterThanOrEqual(prev);
      prev = tier;
    }
  });

  it('reaches the max tier at the last rung (T8, ordinal 8)', () => {
    expect(computeTurnoutTier({ ordinal: 8, maxOrdinal: 8 })).toBe(5);
  });

  it('never exceeds the 0-5 range even with an out-of-bounds ordinal', () => {
    const tier = computeTurnoutTier({ ordinal: 500, maxOrdinal: 8 });
    expect(tier).toBeLessThanOrEqual(5);
    expect(tier).toBeGreaterThanOrEqual(0);
  });

  it('clamps negative input to 0', () => {
    expect(computeTurnoutTier({ ordinal: -3, maxOrdinal: 8 })).toBe(0);
  });
});

describe('turnoutPullToPhrase', () => {
  it('returns a distinct sensory phrase for every tier 0-5', () => {
    const phrases = [0, 1, 2, 3, 4, 5].map(turnoutPullToPhrase);
    expect(new Set(phrases).size).toBe(phrases.length);
    for (const p of phrases) expect(p.length).toBeGreaterThan(0);
  });

  it('never emits a /10 score, a day-count, or a digit', () => {
    for (const t of [0, 1, 2, 3, 4, 5]) {
      const phrase = turnoutPullToPhrase(t);
      expect(phrase).not.toMatch(/\d+\s*\/\s*10/);
      expect(phrase).not.toMatch(/\bday\s+\d+\b/i);
      expect(phrase).not.toMatch(/\d/);
    }
  });

  it('clamps out-of-range and non-finite input', () => {
    expect(turnoutPullToPhrase(-3)).toBe(turnoutPullToPhrase(0));
    expect(turnoutPullToPhrase(99)).toBe(turnoutPullToPhrase(5));
    expect(turnoutPullToPhrase(null)).toBe(turnoutPullToPhrase(0));
    expect(turnoutPullToPhrase(undefined)).toBe(turnoutPullToPhrase(0));
  });
});
