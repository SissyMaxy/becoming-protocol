import { describe, it, expect } from 'vitest';
import {
  scoreKinds,
  pickOffer,
  pickTier,
  CONDUCTOR_KINDS,
  type ConductorFeatures,
} from '../../../supabase/functions/_shared/session-conductor-core';

function base(over: Partial<ConductorFeatures> = {}): ConductorFeatures {
  return {
    denialDay: 3,
    recovery: 70,
    turnoutGapExtraDays: 0,
    isWednesday: false,
    activeWarmingRung: null,
    reconPhaseWeight: 2,
    daysSinceKind: {},
    efficacyEMA: {},
    ...over,
  };
}

describe('session-conductor-core (WS5)', () => {
  it('scores every kind and sorts descending', () => {
    const scores = scoreKinds(base());
    expect(scores).toHaveLength(CONDUCTOR_KINDS.length);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
    }
  });

  it('excludes cockwarming unless it is Wednesday with an active warming rung', () => {
    const notWed = scoreKinds(base({ isWednesday: false, activeWarmingRung: 2 }));
    expect(notWed.find((s) => s.kind === 'session_cockwarming')!.score).toBe(0);

    const wedNoRung = scoreKinds(base({ isWednesday: true, activeWarmingRung: null }));
    expect(wedNoRung.find((s) => s.kind === 'session_cockwarming')!.score).toBe(0);

    const wedRung = scoreKinds(base({ isWednesday: true, activeWarmingRung: 2 }));
    expect(wedRung.find((s) => s.kind === 'session_cockwarming')!.score).toBeGreaterThan(0);
  });

  it('picks cockwarming on Wednesday with an active rung (arc center of mass)', () => {
    const chosen = pickOffer(base({ isWednesday: true, activeWarmingRung: 1, denialDay: 1 }));
    expect(chosen?.kind).toBe('session_cockwarming');
  });

  it('suppresses arc-escalating kinds when pacing is widened', () => {
    const normal = scoreKinds(base()).find((s) => s.kind === 'session_goon')!.score;
    const widened = scoreKinds(base({ turnoutGapExtraDays: 3 })).find((s) => s.kind === 'session_goon')!.score;
    expect(widened).toBeLessThan(normal);
  });

  it('denial/edge fit rises with denial day', () => {
    const low = scoreKinds(base({ denialDay: 0 })).find((s) => s.kind === 'session_denial')!.score;
    const high = scoreKinds(base({ denialDay: 12 })).find((s) => s.kind === 'session_denial')!.score;
    expect(high).toBeGreaterThan(low);
  });

  it('caps tier to gentle when recovery is depleted', () => {
    expect(pickTier(base({ recovery: 20 }))).toBe('gentle');
    expect(pickTier(base({ recovery: 90, reconPhaseWeight: 5, denialDay: 8 }))).toBe('cruel');
    expect(pickTier(base({ recovery: 90, reconPhaseWeight: 3, denialDay: 5 }))).toBe('firm');
  });

  it('favors kinds not recently offered', () => {
    const stale = scoreKinds(base({ daysSinceKind: { session_edge: 30 } })).find((s) => s.kind === 'session_edge')!.score;
    const fresh = scoreKinds(base({ daysSinceKind: { session_edge: 0.1 } })).find((s) => s.kind === 'session_edge')!.score;
    expect(stale).toBeGreaterThan(fresh);
  });

  it('efficacy EMA scales a kind up or down', () => {
    const lowEma = scoreKinds(base({ efficacyEMA: { session_goon: 0.1 } })).find((s) => s.kind === 'session_goon')!.score;
    const highEma = scoreKinds(base({ efficacyEMA: { session_goon: 0.9 } })).find((s) => s.kind === 'session_goon')!.score;
    expect(highEma).toBeGreaterThan(lowEma);
  });
});
