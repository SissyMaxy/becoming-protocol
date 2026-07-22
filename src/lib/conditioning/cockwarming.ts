/**
 * Cockwarming — pure helpers for the warming track (WS3).
 *
 * The warming ladder (mig 698) has 5 rungs. The trance render (session_cockwarming,
 * mig 699) comes in two intensity tiers; the hold timer target grows per rung.
 * These are pure so they can be unit-tested away from the view.
 */

import type { AudioSessionIntensity } from '../audio-sessions/template-selector';

/** Rung order (1..5) → trance intensity tier. First warm holds are gentle;
 * the kneeling/partnered depth is firm. (No 'cruel' — cockwarming is tender.) */
export function warmingTierForRung(rungOrder: number): AudioSessionIntensity {
  return rungOrder <= 2 ? 'gentle' : 'firm';
}

/** Rung order (1..5) → hold-timer target in seconds. Longer, stiller holds
 * as the ladder climbs. partnered_warming (5) mirrors rung 4's target. */
export function warmingHoldTargetSeconds(rungOrder: number): number {
  const minutes: Record<number, number> = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 20 };
  return (minutes[rungOrder] ?? 5) * 60;
}
