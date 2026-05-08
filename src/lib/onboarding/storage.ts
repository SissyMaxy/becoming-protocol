/**
 * Onboarding persistence — read/write user_state.onboarding_progress
 * and the related identity / intensity / voice columns.
 *
 * The wizard persists after every step ack so a session crash leaves
 * the user resumable. Failures are logged and re-thrown so the wizard
 * UI can show "couldn't save — try again" rather than silently losing
 * the user's choices.
 */

import { supabase } from '../supabase';
import type { OnboardingProgress, IntensityLevel } from './types';

export interface OnboardingState {
  progress: OnboardingProgress;
  completedAt: string | null;
  feminineName: string | null;
  pronouns: string | null;
  currentHonorific: string | null;
  gaslightIntensity: IntensityLevel;
  mantraIntensity: IntensityLevel;
  personaIntensity: IntensityLevel;
  prefersMommyVoice: boolean;
}

const DEFAULT_STATE: OnboardingState = {
  progress: {},
  completedAt: null,
  feminineName: null,
  pronouns: null,
  currentHonorific: null,
  gaslightIntensity: 'off',
  mantraIntensity: 'off',
  personaIntensity: 'off',
  prefersMommyVoice: false,
};

interface DbRow {
  onboarding_progress?: OnboardingProgress | null;
  onboarding_completed_at?: string | null;
  feminine_name?: string | null;
  pronouns?: string | null;
  current_honorific?: string | null;
  gaslight_intensity?: IntensityLevel | null;
  mantra_intensity?: IntensityLevel | null;
  persona_intensity?: IntensityLevel | null;
  prefers_mommy_voice?: boolean | null;
}

export async function loadOnboardingState(userId: string): Promise<OnboardingState> {
  const { data, error } = await supabase
    .from('user_state')
    .select(
      'onboarding_progress, onboarding_completed_at, feminine_name, pronouns, current_honorific, gaslight_intensity, mantra_intensity, persona_intensity, prefers_mommy_voice',
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // If the row doesn't exist yet (new user before user_state seeded),
    // return defaults. Other errors propagate so the wizard can retry.
    if ((error as { code?: string }).code === 'PGRST116') return DEFAULT_STATE;
    throw error;
  }
  const row = (data ?? {}) as DbRow;
  return {
    progress: row.onboarding_progress ?? {},
    completedAt: row.onboarding_completed_at ?? null,
    feminineName: row.feminine_name ?? null,
    pronouns: row.pronouns ?? null,
    currentHonorific: row.current_honorific ?? null,
    gaslightIntensity: (row.gaslight_intensity ?? 'off') as IntensityLevel,
    mantraIntensity: (row.mantra_intensity ?? 'off') as IntensityLevel,
    personaIntensity: (row.persona_intensity ?? 'off') as IntensityLevel,
    prefersMommyVoice: row.prefers_mommy_voice ?? false,
  };
}

interface SavePatch {
  progress?: OnboardingProgress;
  completedAt?: string | null;
  feminineName?: string | null;
  pronouns?: string | null;
  currentHonorific?: string | null;
  gaslightIntensity?: IntensityLevel;
  mantraIntensity?: IntensityLevel;
  personaIntensity?: IntensityLevel;
  prefersMommyVoice?: boolean;
}

export async function saveOnboardingPatch(userId: string, patch: SavePatch): Promise<void> {
  const update: Record<string, unknown> = { user_id: userId };
  if (patch.progress !== undefined) update.onboarding_progress = patch.progress;
  if (patch.completedAt !== undefined) update.onboarding_completed_at = patch.completedAt;
  if (patch.feminineName !== undefined) update.feminine_name = patch.feminineName;
  if (patch.pronouns !== undefined) update.pronouns = patch.pronouns;
  if (patch.currentHonorific !== undefined) update.current_honorific = patch.currentHonorific;
  if (patch.gaslightIntensity !== undefined) update.gaslight_intensity = patch.gaslightIntensity;
  if (patch.mantraIntensity !== undefined) update.mantra_intensity = patch.mantraIntensity;
  if (patch.personaIntensity !== undefined) update.persona_intensity = patch.personaIntensity;
  if (patch.prefersMommyVoice !== undefined) update.prefers_mommy_voice = patch.prefersMommyVoice;

  const { error } = await supabase
    .from('user_state')
    .upsert(update, { onConflict: 'user_id' });
  if (error) throw error;
}
