import { describe, it, expect } from 'vitest';
import {
  descentTierToPhrase,
  turnoutPullToPhrase,
  computeDescentTier,
  computeTurnoutTier,
  phaseWeight,
} from '../../../api/handler/_lib/felt-sense';
// The src-side originals this api mirror must stay in sync with:
import { computeDescentTier as srcDescent, phaseWeight as srcPhaseWeight } from '../../lib/reconditioning/descentDepth';
import { computeTurnoutTier as srcTurnout } from '../../lib/turnout/turnoutPull';

describe('felt-sense (api mirror of src depth meters)', () => {
  it('descent tier math matches the src original across the range', () => {
    const cases = [
      { completedTrances: 0, armedTriggers: 0, maxProgramPhaseWeight: 0 },
      { completedTrances: 1, armedTriggers: 0, maxProgramPhaseWeight: 0 },
      { completedTrances: 15, armedTriggers: 2, maxProgramPhaseWeight: 3 },
      { completedTrances: 500, armedTriggers: 50, maxProgramPhaseWeight: 5 },
    ];
    for (const c of cases) {
      expect(computeDescentTier(c)).toBe(srcDescent(c));
    }
  });

  it('phaseWeight matches the src original', () => {
    for (const p of ['induction', 'install', 'reinforce', 'reconsolidate', 'measure', 'retain', 'nonsense']) {
      expect(phaseWeight(p)).toBe(srcPhaseWeight(p));
    }
  });

  it('turnout tier math matches the src original', () => {
    for (let ordinal = 0; ordinal <= 8; ordinal++) {
      const inp = { ordinal, maxOrdinal: 8 };
      expect(computeTurnoutTier(inp)).toBe(srcTurnout(inp));
    }
  });

  it('phrases never leak a number, tier, rung, or day-count', () => {
    for (let t = 0; t <= 5; t++) {
      expect(descentTierToPhrase(t)).not.toMatch(/\d/);
      expect(turnoutPullToPhrase(t)).not.toMatch(/\d|\bT\d\b|rung|tier/i);
    }
  });

  it('clamps out-of-range tiers to the surface / deepest phrase', () => {
    expect(descentTierToPhrase(-3)).toBe(descentTierToPhrase(0));
    expect(descentTierToPhrase(99)).toBe(descentTierToPhrase(5));
    expect(turnoutPullToPhrase(null)).toBe(turnoutPullToPhrase(0));
  });
});
