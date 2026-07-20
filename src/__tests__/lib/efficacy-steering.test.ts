// Efficacy steering — the 2-D (engagement × efficacy) policy (Phase 2).
// Pins: disengagement is still soften-only; engaged-but-flat escalates AND
// switches mechanism; engaged-and-rising rides it; safeword/phase untouched here.

import { describe, it, expect } from 'vitest';
import {
  computeSteering,
  classifyEfficacy,
  type DecreeRate,
} from '../../lib/conditioning/efficacy-steering';

const rate = (total: number, missed: number): DecreeRate => ({
  total, missed, skipRate: total > 0 ? missed / total : 0,
});

describe('classifyEfficacy', () => {
  it('is unknown with too few measures', () => {
    expect(classifyEfficacy(1, 'increase', 1)).toBe('unknown');
    expect(classifyEfficacy(null, 'increase', 5)).toBe('unknown');
  });
  it('flat on zero slope', () => {
    expect(classifyEfficacy(0, 'increase', 4)).toBe('flat');
  });
  it('rising when slope matches the desired direction', () => {
    expect(classifyEfficacy(1, 'increase', 4)).toBe('rising');
    expect(classifyEfficacy(-1, 'decrease', 4)).toBe('rising');
  });
  it('wrong when slope opposes the desired direction', () => {
    expect(classifyEfficacy(-1, 'increase', 4)).toBe('wrong');
    expect(classifyEfficacy(1, 'decrease', 4)).toBe('wrong');
  });
});

describe('computeSteering — disengagement stays soften-only', () => {
  it('softens on high skip regardless of efficacy, never switches', () => {
    const d = computeSteering(rate(10, 8), 3, 'flat');
    expect(d.nextIntensity).toBe(2);
    expect(d.switchMechanism).toBe(false);
  });
  it('bottoms out + suppresses when floored and still resisted', () => {
    const d = computeSteering(rate(10, 9), 1, 'wrong');
    expect(d.nextIntensity).toBe(1);
    expect(d.suppressToday).toBe(true);
    expect(d.switchMechanism).toBe(false);
  });
});

describe('computeSteering — engaged × efficacy', () => {
  it('engaged + flat → escalate AND switch mechanism', () => {
    const d = computeSteering(rate(10, 0), 2, 'flat');
    expect(d.nextIntensity).toBe(3);
    expect(d.switchMechanism).toBe(true);
  });
  it('engaged + wrong-way → escalate AND switch mechanism', () => {
    const d = computeSteering(rate(8, 0), 4, 'wrong');
    expect(d.nextIntensity).toBe(5);
    expect(d.switchMechanism).toBe(true);
  });
  it('engaged + rising → escalate, ride it (no switch)', () => {
    const d = computeSteering(rate(10, 0), 2, 'rising');
    expect(d.nextIntensity).toBe(3);
    expect(d.switchMechanism).toBe(false);
  });
  it('engaged + unknown → escalate on the clean streak (prior behavior), no switch', () => {
    const d = computeSteering(rate(10, 0), 2, 'unknown');
    expect(d.nextIntensity).toBe(3);
    expect(d.switchMechanism).toBe(false);
  });
  it('caps intensity at 5', () => {
    expect(computeSteering(rate(10, 0), 5, 'flat').nextIntensity).toBe(5);
  });
});

describe('computeSteering — low signal / moderate engagement', () => {
  it('holds with too little data', () => {
    expect(computeSteering(rate(2, 0), 3, 'flat')).toEqual({ nextIntensity: 3, suppressToday: false, switchMechanism: false });
  });
  it('holds at moderate skip (between soften and engaged bands)', () => {
    const d = computeSteering(rate(10, 2), 3, 'flat'); // skip 0.2
    expect(d.nextIntensity).toBe(3);
    expect(d.switchMechanism).toBe(false);
  });
});
