/**
 * Pure progress calculator for the onboarding wizard.
 *
 * No DB, no React — just functions that take a stored OnboardingProgress
 * and answer "which step should we resume at?" / "are we done?". Unit
 * tested in src/__tests__/lib/onboarding-progress.test.ts.
 */

import {
  ONBOARDING_STEPS,
  type OnboardingProgress,
  type OnboardingStepId,
} from './types';

/**
 * A step counts as "done" if it has an ack_at timestamp OR (for
 * skippable steps) it's marked skipped.
 */
export function isStepComplete(
  stepId: OnboardingStepId,
  progress: OnboardingProgress,
): boolean {
  const entry = progress[stepId];
  if (!entry) return false;
  if (entry.ack_at) return true;
  const def = ONBOARDING_STEPS.find(s => s.id === stepId);
  if (def && !def.required && entry.skipped === true) return true;
  return false;
}

/**
 * Required steps that aren't yet acked. Skipped-but-skippable steps are
 * not "remaining" — the user passed them.
 */
export function remainingSteps(progress: OnboardingProgress): OnboardingStepId[] {
  return ONBOARDING_STEPS
    .filter(s => !isStepComplete(s.id, progress))
    .map(s => s.id);
}

/**
 * Where to resume the wizard. Returns the first step the user hasn't
 * cleared. If everything is complete, returns 'done'.
 */
export function resumeAt(progress: OnboardingProgress): OnboardingStepId {
  const remaining = remainingSteps(progress);
  return remaining[0] ?? 'done';
}

/**
 * The wizard is finished iff every required step is acked AND step 'done'
 * itself is acked. Skippable steps don't block completion. Even when the
 * caller decides to also set `onboarding_completed_at` in user_state,
 * this remains the source of truth for "did the user actually walk
 * through every required step?"
 */
export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  for (const step of ONBOARDING_STEPS) {
    if (!step.required) continue;
    if (!isStepComplete(step.id, progress)) return false;
  }
  return true;
}

/**
 * 0..1 progress fraction. Required + skipped-skippable both count as done.
 */
export function progressFraction(progress: OnboardingProgress): number {
  const total = ONBOARDING_STEPS.length;
  const done = ONBOARDING_STEPS.filter(s => isStepComplete(s.id, progress)).length;
  return total === 0 ? 1 : done / total;
}

/**
 * Given the step the user is currently on, return the next step id.
 * Used by the wizard's "Next" handler. Caller is responsible for
 * tracking acked vs unacked progress; this is just the linear walk.
 */
export function nextStepAfter(current: OnboardingStepId): OnboardingStepId {
  const idx = ONBOARDING_STEPS.findIndex(s => s.id === current);
  if (idx === -1 || idx === ONBOARDING_STEPS.length - 1) return 'done';
  return ONBOARDING_STEPS[idx + 1].id;
}

/**
 * Mark a step as acked (timestamp now).
 */
export function ackStep(
  progress: OnboardingProgress,
  stepId: OnboardingStepId,
  extra: Record<string, unknown> = {},
): OnboardingProgress {
  return {
    ...progress,
    [stepId]: {
      ...(progress[stepId] ?? {}),
      ...extra,
      ack_at: new Date().toISOString(),
    },
  };
}

/**
 * Mark a skippable step as skipped. No-op for required steps — required
 * steps must be acked, not skipped.
 */
export function skipStep(
  progress: OnboardingProgress,
  stepId: OnboardingStepId,
): OnboardingProgress {
  const def = ONBOARDING_STEPS.find(s => s.id === stepId);
  if (!def || def.required) return progress;
  return {
    ...progress,
    [stepId]: {
      ...(progress[stepId] ?? {}),
      skipped: true,
      ack_at: new Date().toISOString(),
    },
  };
}
