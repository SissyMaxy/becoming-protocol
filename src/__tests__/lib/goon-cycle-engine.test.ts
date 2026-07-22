import { describe, it, expect } from 'vitest';
import {
  clampIntensity,
  scaleTarget,
  adaptRampDurationMs,
  adaptPeakHoldMs,
  nextAffirmationIndex,
} from '../../hooks/useGoonCycleEngine';

describe('useGoonCycleEngine pure helpers', () => {
  it('clampIntensity keeps values in 0-100 and rounds', () => {
    expect(clampIntensity(-10)).toBe(0);
    expect(clampIntensity(150)).toBe(100);
    expect(clampIntensity(42.6)).toBe(43);
  });

  it('scaleTarget scales by multiplier and clamps', () => {
    expect(scaleTarget(60, 1)).toBe(60);
    expect(scaleTarget(60, 1.5)).toBe(90);
    expect(scaleTarget(90, 1.5)).toBe(100); // clamped
    expect(scaleTarget(60, 0.5)).toBe(30);
    // Bad multipliers fall back to 1x.
    expect(scaleTarget(60, 0)).toBe(60);
    expect(scaleTarget(60, NaN)).toBe(60);
  });

  it('adaptRampDurationMs steepens (shortens) when HR is not climbing', () => {
    expect(adaptRampDurationMs(30000, 'rising')).toBe(30000); // no change
    expect(adaptRampDurationMs(30000, null)).toBe(30000);
    expect(adaptRampDurationMs(30000, 'stable')).toBe(24000);
    expect(adaptRampDurationMs(30000, 'falling')).toBe(18000);
    // Steeper for falling than stable.
    expect(adaptRampDurationMs(30000, 'falling')).toBeLessThan(adaptRampDurationMs(30000, 'stable'));
  });

  it('adaptPeakHoldMs cuts the hold short on an HR spike, lengthens when falling', () => {
    expect(adaptPeakHoldMs(15000, 'rising')).toBe(7500);
    expect(adaptPeakHoldMs(15000, 'stable')).toBe(15000);
    expect(adaptPeakHoldMs(15000, 'falling')).toBe(18000);
    expect(adaptPeakHoldMs(15000, null)).toBe(15000);
  });

  it('nextAffirmationIndex never repeats the current index', () => {
    const len = 5;
    for (let cur = 0; cur < len; cur++) {
      for (const rand of [0, 0.25, 0.5, 0.75, 0.999]) {
        const next = nextAffirmationIndex(cur, len, rand);
        expect(next).not.toBe(cur);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(len);
      }
    }
  });

  it('nextAffirmationIndex handles degenerate lengths', () => {
    expect(nextAffirmationIndex(0, 1, 0.5)).toBe(0);
    expect(nextAffirmationIndex(0, 0, 0.5)).toBe(0);
  });
});
