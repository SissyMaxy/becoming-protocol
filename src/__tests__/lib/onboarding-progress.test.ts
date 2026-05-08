// Unit tests for the onboarding progress calculator. Pure functions
// — no DB, no React. Verifies which steps are remaining given a
// given OnboardingProgress, where to resume, and completion status.

import { describe, it, expect } from 'vitest';
import {
  ackStep,
  isOnboardingComplete,
  isStepComplete,
  nextStepAfter,
  progressFraction,
  remainingSteps,
  resumeAt,
  skipStep,
} from '../../lib/onboarding/progress';
import {
  ONBOARDING_STEPS,
  type OnboardingProgress,
  type OnboardingStepId,
} from '../../lib/onboarding/types';

const NOW = '2026-05-08T12:00:00.000Z';

function progressWithAcked(steps: OnboardingStepId[]): OnboardingProgress {
  const p: OnboardingProgress = {};
  for (const s of steps) p[s] = { ack_at: NOW };
  return p;
}

describe('isStepComplete', () => {
  it('returns false for an absent step', () => {
    expect(isStepComplete('hello', {})).toBe(false);
  });

  it('returns true for a step with ack_at', () => {
    expect(isStepComplete('hello', { hello: { ack_at: NOW } })).toBe(true);
  });

  it('returns true for a skippable step marked skipped', () => {
    expect(isStepComplete('identity', { identity: { skipped: true, ack_at: NOW } })).toBe(true);
  });

  it('returns false for a required step that is only marked skipped (not acked)', () => {
    // Required steps should never appear with skipped:true — but if they do
    // somehow, they don't count as complete.
    expect(isStepComplete('hello', { hello: { skipped: true } })).toBe(false);
  });
});

describe('remainingSteps', () => {
  it('returns every step on an empty progress', () => {
    expect(remainingSteps({})).toEqual(ONBOARDING_STEPS.map(s => s.id));
  });

  it('drops acked steps', () => {
    const p = progressWithAcked(['hello', 'choosing']);
    expect(remainingSteps(p)).not.toContain('hello');
    expect(remainingSteps(p)).not.toContain('choosing');
    expect(remainingSteps(p)).toContain('identity');
  });

  it('drops skipped skippable steps', () => {
    const p: OnboardingProgress = {
      hello: { ack_at: NOW },
      choosing: { ack_at: NOW },
      identity: { skipped: true, ack_at: NOW },
    };
    expect(remainingSteps(p)).not.toContain('identity');
  });
});

describe('resumeAt', () => {
  it('starts at hello when nothing is done', () => {
    expect(resumeAt({})).toBe('hello');
  });

  it('jumps past acked prefix steps', () => {
    expect(resumeAt(progressWithAcked(['hello', 'choosing']))).toBe('identity');
  });

  it('returns done when everything is complete', () => {
    const p: OnboardingProgress = {
      hello: { ack_at: NOW },
      choosing: { ack_at: NOW },
      identity: { skipped: true, ack_at: NOW },
      intensity: { ack_at: NOW },
      voice: { ack_at: NOW },
      calendar: { skipped: true, ack_at: NOW },
      stealth: { skipped: true, ack_at: NOW },
      aftercare: { ack_at: NOW },
      done: { ack_at: NOW },
    };
    expect(resumeAt(p)).toBe('done');
  });
});

describe('isOnboardingComplete', () => {
  it('false on empty', () => {
    expect(isOnboardingComplete({})).toBe(false);
  });

  it('false when only required is missing', () => {
    const p: OnboardingProgress = {
      hello: { ack_at: NOW },
      choosing: { ack_at: NOW },
      identity: { skipped: true, ack_at: NOW },
      intensity: { ack_at: NOW },
      voice: { ack_at: NOW },
      // skipped optional steps still count as complete
      calendar: { skipped: true, ack_at: NOW },
      stealth: { skipped: true, ack_at: NOW },
      // aftercare is required but missing
      done: { ack_at: NOW },
    };
    expect(isOnboardingComplete(p)).toBe(false);
  });

  it('true when every required step is acked', () => {
    const p: OnboardingProgress = {
      hello: { ack_at: NOW },
      choosing: { ack_at: NOW },
      // identity is skippable; can be entirely absent
      intensity: { ack_at: NOW },
      voice: { ack_at: NOW },
      // calendar and stealth absent — both skippable; remainingSteps would
      // include them, but isOnboardingComplete only requires required steps.
      aftercare: { ack_at: NOW },
      done: { ack_at: NOW },
    };
    expect(isOnboardingComplete(p)).toBe(true);
  });
});

describe('progressFraction', () => {
  it('is 0 when nothing is done', () => {
    expect(progressFraction({})).toBe(0);
  });

  it('is 1 when every step is complete', () => {
    const p: OnboardingProgress = {};
    for (const s of ONBOARDING_STEPS) p[s.id] = { ack_at: NOW };
    expect(progressFraction(p)).toBe(1);
  });

  it('is between 0 and 1 partway through', () => {
    const p = progressWithAcked(['hello', 'choosing']);
    const f = progressFraction(p);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
  });
});

describe('nextStepAfter', () => {
  it('walks from hello to choosing', () => {
    expect(nextStepAfter('hello')).toBe('choosing');
  });

  it('returns done when called on the last step', () => {
    expect(nextStepAfter('done')).toBe('done');
  });
});

describe('ackStep', () => {
  it('stamps ack_at and merges extras', () => {
    const next = ackStep({}, 'choosing', { safeword_acked: true });
    expect(next.choosing?.ack_at).toBeTruthy();
    expect(next.choosing?.safeword_acked).toBe(true);
  });
});

describe('skipStep', () => {
  it('refuses to skip a required step', () => {
    const next = skipStep({}, 'choosing');
    expect(next.choosing).toBeUndefined();
  });

  it('marks a skippable step as skipped', () => {
    const next = skipStep({}, 'identity');
    expect(next.identity?.skipped).toBe(true);
    expect(next.identity?.ack_at).toBeTruthy();
  });
});
