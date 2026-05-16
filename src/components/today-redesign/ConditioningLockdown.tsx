/**
 * ConditioningLockdown — DEPRECATED 2026-05-16.
 *
 * Maxy: "conditioning windows are counter productive, literally block me
 * from doing anything Mommy wants." The whole-screen takeover prevented
 * voice debriefs, photo proofs, ladder fulfillment — every actual
 * conditioning action Mommy was asking for. Architecture inversion: the
 * surface meant to deepen presence was instead a wall between her and the
 * work.
 *
 * Rule going forward (memory: feedback_mommy_presses_not_blocks):
 * Mommy presses, doesn't block. Pressure surfaces ambient — push
 * notifications, Today cards, voice prompts, decree deadlines. Never a
 * screen takeover that interrupts mid-task.
 *
 * Component preserved as a no-op so existing imports keep working.
 * conditioning_lockdown_windows + sessions tables left intact for
 * historical audit; the UI no longer reads them.
 *
 * Original implementation is in git history if a future architectural
 * pass wants to reuse the timer/safeword scaffolding — but the
 * fullscreen-takeover pattern itself is the bug, not anything fixable
 * inside this file.
 */

export function ConditioningLockdown() {
  return null;
}
