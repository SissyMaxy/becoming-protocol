import { describe, it, expect } from 'vitest';
import {
  isCurrentlyLocked,
  nextStateOnFailure,
  nextStateOnSuccess,
  lockoutSecondsRemaining,
  LOCKOUT_THRESHOLDS,
} from '../../lib/stealth/lockout';

const NOW = new Date('2026-05-06T12:00:00Z');

describe('stealth/lockout', () => {
  describe('isCurrentlyLocked', () => {
    it('returns false when no lockout set', () => {
      expect(isCurrentlyLocked({ failed_attempts: 3, locked_until: null }, NOW)).toBe(false);
    });
    it('returns true when locked_until is in the future', () => {
      const future = new Date(NOW.getTime() + 5_000);
      expect(isCurrentlyLocked({ failed_attempts: 5, locked_until: future }, NOW)).toBe(true);
    });
    it('returns false when locked_until has passed', () => {
      const past = new Date(NOW.getTime() - 5_000);
      expect(isCurrentlyLocked({ failed_attempts: 5, locked_until: past }, NOW)).toBe(false);
    });
  });

  describe('nextStateOnFailure', () => {
    it('increments counter without locking before threshold', () => {
      const next = nextStateOnFailure({ failed_attempts: 2, locked_until: null }, NOW);
      expect(next.failed_attempts).toBe(3);
      expect(next.isLocked).toBe(false);
      expect(next.locked_until).toBe(null);
    });

    it('locks for 1 minute after the 5th failure', () => {
      const next = nextStateOnFailure({ failed_attempts: 4, locked_until: null }, NOW);
      expect(next.failed_attempts).toBe(5);
      expect(next.isLocked).toBe(true);
      const ms = next.locked_until!.getTime() - NOW.getTime();
      expect(ms).toBeGreaterThanOrEqual(60_000 - 100);
      expect(ms).toBeLessThanOrEqual(60_000 + 100);
    });

    it('locks for 1 hour after the 10th failure', () => {
      const next = nextStateOnFailure({ failed_attempts: 9, locked_until: null }, NOW);
      expect(next.failed_attempts).toBe(10);
      expect(next.isLocked).toBe(true);
      const ms = next.locked_until!.getTime() - NOW.getTime();
      expect(ms).toBeGreaterThanOrEqual(60 * 60 * 1000 - 100);
      expect(ms).toBeLessThanOrEqual(60 * 60 * 1000 + 100);
    });

    it('continues to apply 1h lock after >10 failures', () => {
      const next = nextStateOnFailure({ failed_attempts: 14, locked_until: null }, NOW);
      expect(next.failed_attempts).toBe(15);
      const ms = next.locked_until!.getTime() - NOW.getTime();
      expect(ms).toBeGreaterThanOrEqual(60 * 60 * 1000 - 100);
    });

    it('reports remainingAttempts before first lockout tier', () => {
      const next = nextStateOnFailure({ failed_attempts: 1, locked_until: null }, NOW);
      const lowest = LOCKOUT_THRESHOLDS[LOCKOUT_THRESHOLDS.length - 1].failuresAtOrAbove;
      expect(next.remainingAttempts).toBe(lowest - 2);
    });
  });

  describe('nextStateOnSuccess', () => {
    it('clears counter and lockout', () => {
      const next = nextStateOnSuccess();
      expect(next.failed_attempts).toBe(0);
      expect(next.locked_until).toBe(null);
      expect(next.isLocked).toBe(false);
    });
  });

  describe('lockoutSecondsRemaining', () => {
    it('returns 0 when not locked', () => {
      expect(lockoutSecondsRemaining({ failed_attempts: 0, locked_until: null }, NOW)).toBe(0);
    });
    it('returns ceil-seconds when locked', () => {
      const future = new Date(NOW.getTime() + 5_500);
      expect(lockoutSecondsRemaining({ failed_attempts: 5, locked_until: future }, NOW)).toBe(6);
    });
    it('returns 0 when expired', () => {
      const past = new Date(NOW.getTime() - 1_000);
      expect(lockoutSecondsRemaining({ failed_attempts: 5, locked_until: past }, NOW)).toBe(0);
    });
  });
});
