// Reconditioning mechanism attribution (Phase 3) — selection rotation + attribution
// credit math. Mirrors mig 683 recon_select_mechanism / recon_attribute_efficacy.

import { describe, it, expect } from 'vitest';
import {
  selectMechanism,
  attributionCredit,
  emaUpdate,
  MECHANISMS,
  type MechanismScore,
} from '../../lib/conditioning/recon-mechanism';

describe('selectMechanism', () => {
  it('with no profile, returns the first mechanism (rotation 0) and rotates the list', () => {
    expect(selectMechanism([], 0)).toBe(MECHANISMS[0]);
    expect(selectMechanism([], 1)).toBe(MECHANISMS[1]);
    expect(selectMechanism([], MECHANISMS.length)).toBe(MECHANISMS[0]); // wraps
  });

  it('picks the best-effectiveness mechanism at rotation 0', () => {
    const profile: MechanismScore[] = [
      { mechanism: 'narrative', effectiveness: 0.8, sampleN: 4 },
      { mechanism: 'trance', effectiveness: 0.2, sampleN: 3 },
    ];
    expect(selectMechanism(profile, 0)).toBe('narrative');
  });

  it('a switch (rotation+1) moves to the next-best', () => {
    const profile: MechanismScore[] = [
      { mechanism: 'narrative', effectiveness: 0.8, sampleN: 4 },
      { mechanism: 'trance', effectiveness: 0.5, sampleN: 3 },
      { mechanism: 'arousal_pairing', effectiveness: 0.1, sampleN: 2 },
    ];
    expect(selectMechanism(profile, 1)).toBe('trance');
    expect(selectMechanism(profile, 2)).toBe('arousal_pairing');
  });

  it('untried mechanisms rank last (explored only after the profiled ones)', () => {
    const profile: MechanismScore[] = [
      { mechanism: 'narrative', effectiveness: 0.5, sampleN: 3 },
    ];
    // rotation 0 = the one profiled winner; later rotations reach untried ones.
    expect(selectMechanism(profile, 0)).toBe('narrative');
    expect(MECHANISMS).toContain(selectMechanism(profile, 3));
  });

  it('handles negative rotation safely', () => {
    expect(MECHANISMS).toContain(selectMechanism([], -1));
  });
});

describe('attributionCredit', () => {
  it('splits progress by delivery share', () => {
    expect(attributionCredit(1.0, 3, 6)).toBeCloseTo(0.5);
    expect(attributionCredit(0.4, 6, 6)).toBeCloseTo(0.4);
  });
  it('is zero with no deliveries', () => {
    expect(attributionCredit(1.0, 0, 0)).toBe(0);
  });
  it('carries the sign of progress (wrong-way movement debits)', () => {
    expect(attributionCredit(-0.6, 2, 4)).toBeCloseTo(-0.3);
  });
});

describe('emaUpdate', () => {
  it('blends old and new by alpha', () => {
    expect(emaUpdate(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(emaUpdate(1, 0, 0.3)).toBeCloseTo(0.7);
  });
});
