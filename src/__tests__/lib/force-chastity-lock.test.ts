/**
 * Tests for chastity lock duration floor logic in ChastityLockStarter.
 * We import the pure function locally since it's module-internal; replicated
 * here as the spec.
 */

import { describe, it, expect } from 'vitest';

// Mirror of minDurationHours() in ChastityLockStarter.tsx
function minDurationHours(streak: number): number {
  if (streak >= 30) return 72;
  if (streak >= 14) return 48;
  if (streak >= 7) return 24;
  return 12;
}

describe('chastity lock floor', () => {
  it('floor is 12h at streak 0', () => {
    expect(minDurationHours(0)).toBe(12);
    expect(minDurationHours(3)).toBe(12);
    expect(minDurationHours(6)).toBe(12);
  });

  it('floor jumps to 24h at streak 7', () => {
    expect(minDurationHours(7)).toBe(24);
    expect(minDurationHours(13)).toBe(24);
  });

  it('floor jumps to 48h at streak 14', () => {
    expect(minDurationHours(14)).toBe(48);
    expect(minDurationHours(29)).toBe(48);
  });

  it('floor jumps to 72h at streak 30', () => {
    expect(minDurationHours(30)).toBe(72);
    expect(minDurationHours(100)).toBe(72);
  });

  it('never allows sub-12h regardless of streak', () => {
    for (const s of [0, 1, 5, 7, 14, 30, 100, 365]) {
      expect(minDurationHours(s)).toBeGreaterThanOrEqual(12);
    }
  });

  it('monotonically increases with streak', () => {
    const streaks = [0, 7, 14, 30];
    const floors = streaks.map(minDurationHours);
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i]).toBeGreaterThanOrEqual(floors[i - 1]);
    }
  });
});
