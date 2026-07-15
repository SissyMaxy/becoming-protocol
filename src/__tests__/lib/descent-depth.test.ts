// Pure-function tests for the cinematic descent-depth meter
// (DESIGN_RECONDITIONING_ENGINE §4). Confirms the tier is monotonic in its
// inputs and that the voice translator never emits a number/day-count.

import { describe, it, expect } from 'vitest';
import { computeDescentTier, phaseWeight } from '../../lib/reconditioning/descentDepth';
import { descentTierToPhrase } from '../../lib/persona/dommy-mommy';

describe('phaseWeight', () => {
  it('orders phases induction < install < reinforce < reconsolidate/measure < retain', () => {
    expect(phaseWeight('induction')).toBeLessThan(phaseWeight('install'));
    expect(phaseWeight('install')).toBeLessThan(phaseWeight('reinforce'));
    expect(phaseWeight('reinforce')).toBeLessThan(phaseWeight('reconsolidate'));
    expect(phaseWeight('reconsolidate')).toBe(phaseWeight('measure'));
    expect(phaseWeight('measure')).toBeLessThan(phaseWeight('retain'));
  });

  it('unknown/null phase weighs 0', () => {
    expect(phaseWeight(null)).toBe(0);
    expect(phaseWeight(undefined)).toBe(0);
    expect(phaseWeight('bogus')).toBe(0);
  });
});

describe('computeDescentTier', () => {
  it('is 0 with no signal at all', () => {
    expect(computeDescentTier({ completedTrances: 0, armedTriggers: 0, maxProgramPhaseWeight: 0 })).toBe(0);
  });

  it('is monotonically non-decreasing as completed trances rise', () => {
    let prev = -1;
    for (const n of [0, 1, 5, 15, 30, 60]) {
      const tier = computeDescentTier({ completedTrances: n, armedTriggers: 0, maxProgramPhaseWeight: 0 });
      expect(tier).toBeGreaterThanOrEqual(prev);
      prev = tier;
    }
  });

  it('is monotonically non-decreasing as armed triggers rise', () => {
    let prev = -1;
    for (const n of [0, 1, 2, 4, 8]) {
      const tier = computeDescentTier({ completedTrances: 0, armedTriggers: n, maxProgramPhaseWeight: 0 });
      expect(tier).toBeGreaterThanOrEqual(prev);
      prev = tier;
    }
  });

  it('never exceeds the 0-5 range even with heavy inputs', () => {
    const tier = computeDescentTier({ completedTrances: 500, armedTriggers: 50, maxProgramPhaseWeight: 5 });
    expect(tier).toBeLessThanOrEqual(5);
    expect(tier).toBeGreaterThanOrEqual(0);
  });

  it('a running retain-phase program alone pushes the tier above 0', () => {
    const tier = computeDescentTier({ completedTrances: 0, armedTriggers: 0, maxProgramPhaseWeight: phaseWeight('retain') });
    expect(tier).toBeGreaterThan(0);
  });
});

describe('descentTierToPhrase', () => {
  it('returns a distinct sensory phrase for every tier 0-5', () => {
    const phrases = [0, 1, 2, 3, 4, 5].map(descentTierToPhrase);
    expect(new Set(phrases).size).toBe(phrases.length);
    for (const p of phrases) expect(p.length).toBeGreaterThan(0);
  });

  it('never emits a /10 score or a day-count', () => {
    for (const t of [0, 1, 2, 3, 4, 5]) {
      const phrase = descentTierToPhrase(t);
      expect(phrase).not.toMatch(/\d+\s*\/\s*10/);
      expect(phrase).not.toMatch(/\bday\s+\d+\b/i);
      expect(phrase).not.toMatch(/\d/);
    }
  });

  it('clamps out-of-range and non-finite input', () => {
    expect(descentTierToPhrase(-3)).toBe(descentTierToPhrase(0));
    expect(descentTierToPhrase(99)).toBe(descentTierToPhrase(5));
    expect(descentTierToPhrase(null)).toBe(descentTierToPhrase(0));
    expect(descentTierToPhrase(undefined)).toBe(descentTierToPhrase(0));
  });
});
