// Mantra accounting invariants (FEM §3, mig 637).
//
//  - milestonesCrossed returns EVERY tier crossed by one delta (the old
//    lowest-only return swallowed the higher tiers on a big catch-up).
//  - capVoiceReps: voice reps ≤ floor(duration_s / 2); no duration → 0
//    (fail-closed rep honesty).
//  - applyDrillIdempotent (pure TS mirror of the mantra_apply_drill RPC):
//    resubmitting the same session id never double-counts.

import { describe, it, expect } from 'vitest';
import {
  MANTRA_MILESTONES,
  milestonesCrossed,
  milestoneCrossed,
  capVoiceReps,
  weightedReps,
  applyDrillIdempotent,
} from '../../../supabase/functions/_shared/mantra-milestone';

describe('milestonesCrossed — multi-tier', () => {
  it('single tier crossing returns exactly that tier', () => {
    const crossed = milestonesCrossed(900, 1_100);
    expect(crossed.map(c => c.threshold)).toEqual([1_000]);
  });

  it('a big delta crosses MULTIPLE tiers, lowest first', () => {
    const crossed = milestonesCrossed(500, 15_000);
    expect(crossed.map(c => c.threshold)).toEqual([1_000, 10_000]);
  });

  it('crossing everything returns all three tiers', () => {
    const crossed = milestonesCrossed(0, 250_000);
    expect(crossed.map(c => c.threshold)).toEqual([1_000, 10_000, 100_000]);
  });

  it('no crossing → empty', () => {
    expect(milestonesCrossed(1_200, 9_000)).toEqual([]);
    expect(milestonesCrossed(1_000, 1_000)).toEqual([]);
  });

  it('back-compat milestoneCrossed returns the lowest crossed tier', () => {
    expect(milestoneCrossed(500, 15_000)?.threshold).toBe(1_000);
    expect(milestoneCrossed(1_200, 1_300)).toBeNull();
  });

  it('milestone copy carries no telemetry numbers', () => {
    for (const m of MANTRA_MILESTONES) {
      expect(m.line).not.toMatch(/\d/);
    }
  });
});

describe('capVoiceReps — rep honesty ceiling', () => {
  it('caps at floor(duration_s / 2)', () => {
    expect(capVoiceReps(100, 10)).toBe(5);
    expect(capVoiceReps(3, 10)).toBe(3);
    expect(capVoiceReps(5, 9)).toBe(4);
  });

  it('no duration → zero verifiable voice reps (fail-closed)', () => {
    expect(capVoiceReps(50, undefined)).toBe(0);
    expect(capVoiceReps(50, null)).toBe(0);
    expect(capVoiceReps(50, 0)).toBe(0);
    expect(capVoiceReps(50, -3)).toBe(0);
  });

  it('never negative, never fractional', () => {
    expect(capVoiceReps(-5, 100)).toBe(0);
    expect(capVoiceReps(2.9, 100)).toBe(2);
  });
});

describe('weightedReps', () => {
  it('voice 1.0x, typed 0.5x', () => {
    expect(weightedReps({ voiceReps: 10, typedReps: 4, pairedWithArousal: false })).toBe(12);
  });
  it('arousal pairing triples the whole submission', () => {
    expect(weightedReps({ voiceReps: 10, typedReps: 4, pairedWithArousal: true })).toBe(36);
  });
});

describe('applyDrillIdempotent — RPC semantics mirror', () => {
  it('first apply bumps; resubmit with same session id does NOT double-count', () => {
    const state = { appliedSessionIds: new Set<string>(), lifetimeTotal: 100 };

    const first = applyDrillIdempotent(state, 'session-A', 30);
    expect(first.inserted).toBe(true);
    expect(first.prevTotal).toBe(100);
    expect(first.newTotal).toBe(130);

    const resubmit = applyDrillIdempotent(state, 'session-A', 30);
    expect(resubmit.inserted).toBe(false);
    expect(resubmit.prevTotal).toBe(130);
    expect(resubmit.newTotal).toBe(130); // NO bump

    expect(state.lifetimeTotal).toBe(130);
  });

  it('distinct sessions each count once', () => {
    const state = { appliedSessionIds: new Set<string>(), lifetimeTotal: 0 };
    applyDrillIdempotent(state, 'a', 10);
    applyDrillIdempotent(state, 'b', 10);
    applyDrillIdempotent(state, 'a', 10); // dup
    applyDrillIdempotent(state, 'b', 10); // dup
    expect(state.lifetimeTotal).toBe(20);
  });

  it('lifetime total stays ≡ sum of applied sessions (derived-counter law)', () => {
    const state = { appliedSessionIds: new Set<string>(), lifetimeTotal: 0 };
    const submissions: Array<[string, number]> = [['a', 12], ['b', 7.5], ['a', 12], ['c', 30], ['b', 7.5]];
    const uniqueSum = 12 + 7.5 + 30;
    for (const [id, w] of submissions) applyDrillIdempotent(state, id, w);
    expect(state.lifetimeTotal).toBe(uniqueSum);
  });
});
