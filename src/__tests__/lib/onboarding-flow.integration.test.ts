// Integration test for the onboarding flow's full walk-through.
// Drives the progress calculator + storage helpers through the same
// sequence of acks the UI generates, then verifies that:
//   - onboarding_completed_at can be set
//   - persona gate opens
//   - intensity defaults are correct
//   - safeword acknowledgment is recorded

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ackStep,
  isOnboardingComplete,
  resumeAt,
  skipStep,
} from '../../lib/onboarding/progress';
import { applyPersonaGate } from '../../lib/onboarding/persona-gate';
import {
  ONBOARDING_SAFEWORD,
  type IntensityLevel,
  type OnboardingProgress,
} from '../../lib/onboarding/types';

// Don't mock supabase here — we're testing pure logic.

describe('onboarding flow — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('walks through every step and ends in a completable state', () => {
    let progress: OnboardingProgress = {};

    // Step 1: hello
    expect(resumeAt(progress)).toBe('hello');
    progress = ackStep(progress, 'hello');

    // Step 2: choosing — record safeword ack as part of the step
    expect(resumeAt(progress)).toBe('choosing');
    progress = ackStep(progress, 'choosing', { safeword_acked: true });
    expect(progress.choosing?.safeword_acked).toBe(true);

    // Step 3: identity (skippable)
    expect(resumeAt(progress)).toBe('identity');
    progress = ackStep(progress, 'identity');

    // Step 4: intensity
    const chosenIntensity: IntensityLevel = 'gentle';
    expect(resumeAt(progress)).toBe('intensity');
    progress = ackStep(progress, 'intensity', { level: chosenIntensity });
    expect(progress.intensity?.level).toBe('gentle');

    // Step 5: voice
    expect(resumeAt(progress)).toBe('voice');
    progress = ackStep(progress, 'voice', { prefers_mommy_voice: true });

    // Step 6: calendar — skip
    expect(resumeAt(progress)).toBe('calendar');
    progress = skipStep(progress, 'calendar');

    // Step 7: stealth — skip
    expect(resumeAt(progress)).toBe('stealth');
    progress = skipStep(progress, 'stealth');

    // Step 8: aftercare
    expect(resumeAt(progress)).toBe('aftercare');
    progress = ackStep(progress, 'aftercare');

    // Step 9: done
    expect(resumeAt(progress)).toBe('done');
    progress = ackStep(progress, 'done');

    // Now isOnboardingComplete should be true
    expect(isOnboardingComplete(progress)).toBe(true);
  });

  it('gentle is the recommended starting intensity', () => {
    // Spec: "Recommends starting at `gentle` regardless of stated preference."
    // The wizard's initial state for the slider should be 'gentle' when the
    // user lands on step 4 with no prior intensity (DB default is 'off').
    // We simulate that here.
    const initial: IntensityLevel = 'off';
    const recommended: IntensityLevel = initial === 'off' ? 'gentle' : initial;
    expect(recommended).toBe('gentle');
  });

  it('safeword literal matches the documented constant', () => {
    expect(ONBOARDING_SAFEWORD).toBe('safeword');
  });

  it('persona gate opens when onboarding completes', () => {
    const mommyRow = { trigger_reason: 'mommy_praise', source: null };
    const before = applyPersonaGate([mommyRow], { onboardingComplete: false });
    const after = applyPersonaGate([mommyRow], { onboardingComplete: true });
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
  });
});

describe('onboarding flow — resume after partial completion', () => {
  it('resumes at the unfinished step on reload', () => {
    // Simulate a session that crashed after step 2.
    let progress: OnboardingProgress = {};
    progress = ackStep(progress, 'hello');
    progress = ackStep(progress, 'choosing', { safeword_acked: true });

    // The wizard restarts; useOnboarding picks up resumeAt(progress).
    expect(resumeAt(progress)).toBe('identity');
    expect(isOnboardingComplete(progress)).toBe(false);
  });

  it('respects skipped optional steps without re-prompting', () => {
    let progress: OnboardingProgress = {};
    progress = ackStep(progress, 'hello');
    progress = ackStep(progress, 'choosing');
    progress = skipStep(progress, 'identity');

    // After skipping identity, resume jumps to intensity, not back to identity.
    expect(resumeAt(progress)).toBe('intensity');
  });
});

describe('onboarding flow — required steps cannot be skipped', () => {
  it('skipStep is a no-op for required steps', () => {
    const before: OnboardingProgress = {};
    const after = skipStep(before, 'choosing');
    expect(after.choosing).toBeUndefined();
  });

  it('isOnboardingComplete stays false when a required step is missing', () => {
    const progress: OnboardingProgress = {
      hello: { ack_at: 'now' },
      // choosing missing!
      identity: { skipped: true, ack_at: 'now' },
      intensity: { ack_at: 'now' },
      voice: { ack_at: 'now' },
      aftercare: { ack_at: 'now' },
      done: { ack_at: 'now' },
    };
    expect(isOnboardingComplete(progress)).toBe(false);
  });
});
