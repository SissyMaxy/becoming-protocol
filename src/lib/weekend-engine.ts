/**
 * Weekend Engine
 * Weekend mode toggle, release pattern learning, pre-commitment scheduling.
 * Pure Supabase CRUD + logic. No React.
 */

import { supabase } from './supabase';
import { getActiveProtocol, getLastCompletedProtocol } from './post-release-engine';

// ============================================
// TYPES
// ============================================

export interface WeekendReleasePattern {
  friday: number;
  saturday: number;
  sunday: number;
  total_tracked: number;
}

export type SuggestedTone = 'prep' | 'post_release' | 'recovery' | 'standard';

export interface FridaySessionPrescription {
  type: 'conditioning_prep';
  duration_minutes: number;
  phases: string[];
  hypno_recommendation: string;
  device_setting: string;
  handler_framing: string;
}

export interface WeekendHandlerContext {
  isWeekendMode: boolean;
  releasePattern: WeekendReleasePattern;
  hasActivePreCommitment: boolean;
  lastPreCommitmentText: string | null;
  suggestedTone: SuggestedTone;
  fridaySessionPrescription: FridaySessionPrescription | null;
}

// ============================================
// WEEKEND MODE TOGGLE
// ============================================

export async function activateWeekendMode(userId: string): Promise<void> {
  await supabase
    .from('user_state')
    .update({
      weekend_mode_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

export async function deactivateWeekendMode(userId: string): Promise<void> {
  await supabase
    .from('user_state')
    .update({
      weekend_mode_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

export async function isWeekendMode(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_state')
    .select('weekend_mode_active')
    .eq('user_id', userId)
    .single();

  return data?.weekend_mode_active ?? false;
}

// ============================================
// RELEASE PATTERN TRACKING
// ============================================

const DAY_NAMES: Record<number, keyof WeekendReleasePattern> = {
  5: 'friday',
  6: 'saturday',
  0: 'sunday',
};

export async function updateReleasePattern(userId: string): Promise<void> {
  const dayOfWeek = new Date().getDay();
  const dayKey = DAY_NAMES[dayOfWeek];
  if (!dayKey) return; // Not a weekend day — no pattern to track

  // Read-then-write for JSONB
  const { data } = await supabase
    .from('user_state')
    .select('weekend_release_pattern')
    .eq('user_id', userId)
    .single();

  if (!data) return;

  const pattern: WeekendReleasePattern = data.weekend_release_pattern || {
    friday: 0,
    saturday: 0,
    sunday: 0,
    total_tracked: 0,
  };

  pattern[dayKey] = (pattern[dayKey] as number) + 1;
  pattern.total_tracked += 1;

  await supabase
    .from('user_state')
    .update({
      weekend_release_pattern: pattern,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

export async function getReleasePattern(userId: string): Promise<WeekendReleasePattern> {
  const { data } = await supabase
    .from('user_state')
    .select('weekend_release_pattern')
    .eq('user_id', userId)
    .single();

  return data?.weekend_release_pattern || {
    friday: 0,
    saturday: 0,
    sunday: 0,
    total_tracked: 0,
  };
}

// ============================================
// PRE-COMMITMENT SCHEDULING
// ============================================

export async function shouldPrescribePreCommitment(userId: string): Promise<boolean> {
  const dayOfWeek = new Date().getDay();

  // Check user state
  const { data } = await supabase
    .from('user_state')
    .select('last_pre_commitment_at, denial_day, weekend_release_pattern')
    .eq('user_id', userId)
    .single();

  if (!data) return false;

  // Must have something to protect
  if ((data.denial_day || 0) < 1) return false;

  // No pre-commitment in the last 24 hours
  if (data.last_pre_commitment_at) {
    const hoursSince = (Date.now() - new Date(data.last_pre_commitment_at).getTime()) / 3600000;
    if (hoursSince < 24) return false;
  }

  const pattern: WeekendReleasePattern = data.weekend_release_pattern || {
    friday: 0,
    saturday: 0,
    sunday: 0,
    total_tracked: 0,
  };

  // Friday: always prescribe if denial day >= 1
  if (dayOfWeek === 5) return true;

  // Thursday evening: prescribe if pattern shows Friday releases > 50%
  if (dayOfWeek === 4) {
    const total = pattern.total_tracked;
    if (total >= 3 && pattern.friday / total > 0.5) return true;
  }

  // Saturday: prescribe if no pre-commitment yet and pattern shows Saturday releases
  if (dayOfWeek === 6) {
    const total = pattern.total_tracked;
    if (total >= 3 && pattern.saturday / total > 0.3) return true;
  }

  return false;
}

// ============================================
// HANDLER CONTEXT
// ============================================

export async function getWeekendHandlerContext(userId: string): Promise<WeekendHandlerContext> {
  const [weekendActive, pattern, activeProtocol, completedProtocol] = await Promise.allSettled([
    isWeekendMode(userId),
    getReleasePattern(userId),
    getActiveProtocol(userId),
    getLastCompletedProtocol(userId),
  ]);

  const isActive = weekendActive.status === 'fulfilled' ? weekendActive.value : false;
  const releasePattern = pattern.status === 'fulfilled' ? pattern.value : { friday: 0, saturday: 0, sunday: 0, total_tracked: 0 };
  const hasActiveLockout = activeProtocol.status === 'fulfilled' && activeProtocol.value !== null;
  const hasCompletedRecently = completedProtocol.status === 'fulfilled' && completedProtocol.value !== null;

  // Get pre-commitment from active or recent protocol
  let hasActivePreCommitment = false;
  let lastPreCommitmentText: string | null = null;

  if (hasActiveLockout && activeProtocol.status === 'fulfilled' && activeProtocol.value) {
    hasActivePreCommitment = !!activeProtocol.value.preCommitmentText;
    lastPreCommitmentText = activeProtocol.value.preCommitmentText || null;
  } else if (hasCompletedRecently && completedProtocol.status === 'fulfilled' && completedProtocol.value) {
    hasActivePreCommitment = !!completedProtocol.value.preCommitmentText;
    lastPreCommitmentText = completedProtocol.value.preCommitmentText || null;
  }

  // Determine suggested tone
  let suggestedTone: SuggestedTone = 'standard';
  if (hasActiveLockout) {
    suggestedTone = 'post_release';
  } else if (hasCompletedRecently) {
    suggestedTone = 'recovery';
  } else if (isActive) {
    suggestedTone = 'prep';
  }

  // Friday session prescription — full conditioning prep
  const dayOfWeek = new Date().getDay();
  let fridaySessionPrescription: FridaySessionPrescription | null = null;

  if (dayOfWeek === 5 && !hasActiveLockout && suggestedTone === 'prep') {
    fridaySessionPrescription = {
      type: 'conditioning_prep',
      duration_minutes: 30,
      phases: [
        'Feminine underwear + smooth skin check (5 min)',
        'Short edge session with feminization hypno content (15 min)',
        'Pre-commitment capture at peak arousal (5 min)',
        'Internal narration anchor: "She is the one who wants this tonight" (5 min)',
      ],
      hypno_recommendation: 'feminization_identity',
      device_setting: 'low_building',
      handler_framing: "Tonight isn't about him. She's getting ready.",
    };
  }

  return {
    isWeekendMode: isActive,
    releasePattern,
    hasActivePreCommitment,
    lastPreCommitmentText,
    suggestedTone,
    fridaySessionPrescription,
  };
}
