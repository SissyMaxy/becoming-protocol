/**
 * useOnboarding — drives the welcome wizard.
 *
 * Loads stored progress, exposes the current step, and provides
 * `advance()` / `skip()` / `complete()` actions that persist to
 * user_state and update local state. Survives reload at the
 * unfinished step.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  loadOnboardingState,
  saveOnboardingPatch,
  type OnboardingState,
} from '../lib/onboarding/storage';
import {
  ackStep,
  isOnboardingComplete,
  resumeAt,
  skipStep,
} from '../lib/onboarding/progress';
import type { OnboardingStepId, IntensityLevel } from '../lib/onboarding/types';

interface AdvanceOptions {
  extra?: Record<string, unknown>;          // merged into progress[stepId]
  patch?: Partial<{
    feminineName: string | null;
    pronouns: string | null;
    currentHonorific: string | null;
    gaslightIntensity: IntensityLevel;
    mantraIntensity: IntensityLevel;
    personaIntensity: IntensityLevel;
    prefersMommyVoice: boolean;
  }>;
}

export interface UseOnboardingResult {
  loading: boolean;
  state: OnboardingState | null;
  currentStep: OnboardingStepId;
  saving: boolean;
  saveError: string | null;
  advance: (stepId: OnboardingStepId, opts?: AdvanceOptions) => Promise<void>;
  skip: (stepId: OnboardingStepId) => Promise<void>;
  complete: () => Promise<void>;
  goTo: (stepId: OnboardingStepId) => void;       // local-only, for "back"
}

export function useOnboarding(): UseOnboardingResult {
  const { user } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [currentStep, setCurrentStep] = useState<OnboardingStepId>('hello');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!user?.id || initialized.current) return;
    initialized.current = true;
    (async () => {
      try {
        const s = await loadOnboardingState(user.id);
        setState(s);
        setCurrentStep(resumeAt(s.progress));
      } catch (e) {
        console.error('[useOnboarding] load failed', e);
        setSaveError('Could not load onboarding state.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const advance = useCallback(async (
    stepId: OnboardingStepId,
    opts: AdvanceOptions = {},
  ) => {
    if (!user?.id || !state) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nextProgress = ackStep(state.progress, stepId, opts.extra ?? {});
      await saveOnboardingPatch(user.id, {
        progress: nextProgress,
        ...(opts.patch ?? {}),
      });
      const merged: OnboardingState = {
        ...state,
        progress: nextProgress,
        ...(opts.patch?.feminineName !== undefined && { feminineName: opts.patch.feminineName }),
        ...(opts.patch?.pronouns !== undefined && { pronouns: opts.patch.pronouns }),
        ...(opts.patch?.currentHonorific !== undefined && { currentHonorific: opts.patch.currentHonorific }),
        ...(opts.patch?.gaslightIntensity !== undefined && { gaslightIntensity: opts.patch.gaslightIntensity }),
        ...(opts.patch?.mantraIntensity !== undefined && { mantraIntensity: opts.patch.mantraIntensity }),
        ...(opts.patch?.personaIntensity !== undefined && { personaIntensity: opts.patch.personaIntensity }),
        ...(opts.patch?.prefersMommyVoice !== undefined && { prefersMommyVoice: opts.patch.prefersMommyVoice }),
      };
      setState(merged);
      setCurrentStep(resumeAt(nextProgress));
    } catch (e) {
      console.error('[useOnboarding] advance failed', e);
      setSaveError('Could not save your progress. Tap Continue again.');
    } finally {
      setSaving(false);
    }
  }, [user?.id, state]);

  const skip = useCallback(async (stepId: OnboardingStepId) => {
    if (!user?.id || !state) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nextProgress = skipStep(state.progress, stepId);
      await saveOnboardingPatch(user.id, { progress: nextProgress });
      const merged = { ...state, progress: nextProgress };
      setState(merged);
      setCurrentStep(resumeAt(nextProgress));
    } catch (e) {
      console.error('[useOnboarding] skip failed', e);
      setSaveError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }, [user?.id, state]);

  const complete = useCallback(async () => {
    if (!user?.id || !state) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nextProgress = ackStep(state.progress, 'done');
      if (!isOnboardingComplete(nextProgress)) {
        throw new Error('Required steps incomplete; cannot mark onboarding done.');
      }
      const completedAt = new Date().toISOString();
      await saveOnboardingPatch(user.id, {
        progress: nextProgress,
        completedAt,
      });
      setState({ ...state, progress: nextProgress, completedAt });
      setCurrentStep('done');
    } catch (e) {
      console.error('[useOnboarding] complete failed', e);
      setSaveError('Could not finalize. Try again.');
    } finally {
      setSaving(false);
    }
  }, [user?.id, state]);

  const goTo = useCallback((stepId: OnboardingStepId) => {
    setCurrentStep(stepId);
  }, []);

  return useMemo(() => ({
    loading,
    state,
    currentStep,
    saving,
    saveError,
    advance,
    skip,
    complete,
    goTo,
  }), [loading, state, currentStep, saving, saveError, advance, skip, complete, goTo]);
}
