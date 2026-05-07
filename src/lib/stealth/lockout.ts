// Lockout state transitions for stealth_pin.
//
// Pure functions over the row state — no DB access, no clock access
// except via injected `now`. Easy to test exhaustively.
//
// Policy: after 5 failed attempts, lock for 1 minute; after 10, lock
// for 1 hour. Attempt counter resets to 0 on a successful verify or
// when the user manually resets the PIN.

export const LOCKOUT_THRESHOLDS = [
  { failuresAtOrAbove: 10, lockMs: 60 * 60 * 1000 },
  { failuresAtOrAbove: 5, lockMs: 60 * 1000 },
] as const;

export interface LockoutState {
  failed_attempts: number;
  locked_until: Date | null;
}

export interface LockoutDecision {
  failed_attempts: number;
  locked_until: Date | null;
  isLocked: boolean;
  remainingAttempts: number;
}

export function isCurrentlyLocked(state: LockoutState, now: Date): boolean {
  if (!state.locked_until) return false;
  return state.locked_until.getTime() > now.getTime();
}

export function nextStateOnFailure(state: LockoutState, now: Date): LockoutDecision {
  const failed_attempts = state.failed_attempts + 1;
  let locked_until: Date | null = state.locked_until;
  for (const tier of LOCKOUT_THRESHOLDS) {
    if (failed_attempts >= tier.failuresAtOrAbove) {
      locked_until = new Date(now.getTime() + tier.lockMs);
      break;
    }
  }
  const lowestThreshold = LOCKOUT_THRESHOLDS[LOCKOUT_THRESHOLDS.length - 1];
  const remainingAttempts = Math.max(0, lowestThreshold.failuresAtOrAbove - failed_attempts);
  return {
    failed_attempts,
    locked_until,
    isLocked: locked_until !== null && locked_until.getTime() > now.getTime(),
    remainingAttempts,
  };
}

export function nextStateOnSuccess(): LockoutDecision {
  return {
    failed_attempts: 0,
    locked_until: null,
    isLocked: false,
    remainingAttempts: LOCKOUT_THRESHOLDS[LOCKOUT_THRESHOLDS.length - 1].failuresAtOrAbove,
  };
}

export function lockoutSecondsRemaining(state: LockoutState, now: Date): number {
  if (!state.locked_until) return 0;
  const ms = state.locked_until.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 1000));
}
