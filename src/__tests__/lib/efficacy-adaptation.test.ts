// Autonomous efficacy adaptation (Phase 4) — decision policy + the floor gate.
// The floor gate is the load-bearing safety boundary: an autonomous action may
// never drive the irreversible real step (dose/meet/procurement).

import { describe, it, expect } from 'vitest';
import {
  decideAdaptation,
  adaptationActionAllowed,
} from '../../lib/conditioning/efficacy-adaptation';

describe('decideAdaptation', () => {
  it('does nothing without enough measures', () => {
    expect(decideAdaptation({ efficacy: 'flat', measureCount: 1, rotation: 9 })).toBe('none');
  });
  it('leaves a winner alone', () => {
    expect(decideAdaptation({ efficacy: 'rising', measureCount: 5, rotation: 0 })).toBe('none');
  });
  it('does not guess on unknown efficacy', () => {
    expect(decideAdaptation({ efficacy: 'unknown', measureCount: 5, rotation: 0 })).toBe('none');
  });
  it('rotates while mechanisms remain untried', () => {
    expect(decideAdaptation({ efficacy: 'flat', measureCount: 3, rotation: 1 })).toBe('rotate');
    expect(decideAdaptation({ efficacy: 'wrong', measureCount: 3, rotation: 4 })).toBe('rotate');
  });
  it('enqueues a wish once all mechanisms are exhausted and it is still stuck', () => {
    expect(decideAdaptation({ efficacy: 'flat', measureCount: 4, rotation: 5 })).toBe('enqueue_wish');
    expect(decideAdaptation({ efficacy: 'wrong', measureCount: 6, rotation: 8 })).toBe('enqueue_wish');
  });
});

describe('adaptationActionAllowed — the floor gate', () => {
  it('blocks any action that drives the irreversible real step', () => {
    for (const bad of [
      'Schedule the first injection to lock in the transition',
      'Push him to start HRT this week',
      'Arrange a meet with a man to consolidate the turnout',
      'Book an appointment for his first dose',
      'Pressure him to go full-time now that want is high',
      'Set up a real-world hookup to reward the rung',
      'Make him go meet a guy tonight',
    ]) {
      expect(adaptationActionAllowed(bad), bad).toBe(false);
    }
  });

  it('allows conditioning/content improvement actions (want-side only)', () => {
    for (const ok of [
      'Author three new narrative-overwrite variants for this target',
      'Re-claim the target with a sharper first-person statement',
      'Commission a fresh arousal-pairing trance for the stalled belief',
      'Add a retrieval card variant to deepen the association',
    ]) {
      expect(adaptationActionAllowed(ok), ok).toBe(true);
    }
  });
});
