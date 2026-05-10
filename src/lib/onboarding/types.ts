/**
 * Onboarding wizard — shared types.
 *
 * Step IDs are stable; reordering the wizard is a deliberate choice that
 * requires a migration to remap stored progress. Required steps must be
 * acked; skippable steps record `{ skipped: true }` and continue.
 */

export type OnboardingStepId =
  | 'hello'
  | 'choosing'
  | 'identity'
  | 'intensity'
  | 'voice'
  | 'calendar'
  | 'stealth'
  | 'aftercare'
  | 'done';

export interface OnboardingStepEntry {
  ack_at?: string;       // ISO timestamp the user advanced past this step
  skipped?: boolean;     // true if a skippable step was skipped
  // Step-specific payload — kept narrow on purpose; use top-level user_state
  // columns for anything that other systems read.
  [extra: string]: unknown;
}

export type OnboardingProgress = Partial<Record<OnboardingStepId, OnboardingStepEntry>>;

export type IntensityLevel = 'off' | 'gentle' | 'firm' | 'cruel';

export const INTENSITY_LEVELS: IntensityLevel[] = ['off', 'gentle', 'firm', 'cruel'];

export interface OnboardingStepDef {
  id: OnboardingStepId;
  label: string;
  required: boolean;     // false = step can be skipped (calendar, stealth, identity)
}

/**
 * The wizard's canonical step ordering. Only edit if you also handle
 * back-compat for stored onboarding_progress rows.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepDef[] = [
  { id: 'hello',     label: 'Welcome',                 required: true  },
  { id: 'choosing',  label: 'What you\'re choosing',   required: true  },
  { id: 'identity',  label: 'Identity',                required: false },
  { id: 'intensity', label: 'Intensity',               required: true  },
  { id: 'voice',     label: 'Voice',                   required: true  },
  { id: 'calendar',  label: 'Calendar',                required: false },
  { id: 'stealth',   label: 'Stealth',                 required: false },
  { id: 'aftercare', label: 'Aftercare',               required: true  },
  { id: 'done',      label: 'Done',                    required: true  },
] as const;

/**
 * The literal safeword the wizard teaches in step 2. Anywhere this word
 * appears in chat / settings input, the app exits to neutral aftercare
 * and disables persona content for 24 hours.
 */
export const ONBOARDING_SAFEWORD = 'safeword';
