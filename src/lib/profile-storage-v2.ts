// v2 Profile Storage
// Saves onboarding data to the v2 profile tables:
// - profile_foundation
// - profile_history
// - profile_arousal

import { supabase } from './supabase';
import type { UserProfile } from '../components/Onboarding/types';

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('No authenticated user');
  }
  return user.id;
}

// Map age range string to approximate integer
function ageRangeToNumber(ageRange: string | undefined): number | null {
  const map: Record<string, number> = {
    '18-24': 21,
    '25-34': 30,
    '35-44': 40,
    '45-54': 50,
    '55+': 60,
  };
  return ageRange ? map[ageRange] || null : null;
}

// Map intensity preference to v2 difficulty_level
function intensityToDifficulty(intensity: string | undefined): string {
  const map: Record<string, string> = {
    'gentle': 'gentle',
    'normal': 'moderate',
    'challenging': 'firm',
  };
  return intensity ? map[intensity] || 'moderate' : 'moderate';
}

// Map partner support to awareness level (0-5)
function partnerSupportToLevel(support: string | undefined): number {
  const map: Record<string, number> = {
    'doesnt_know': 0,
    'unsupportive': 1,
    'neutral': 2,
    'supportive': 3,
    'very_supportive': 4,
  };
  return support ? map[support] ?? 0 : 0;
}

// Estimate private hours from schedule
function estimatePrivateHours(profile: Partial<UserProfile>): number {
  let hours = 0;
  if (profile.morningAvailable) hours += 2;
  if (profile.eveningAvailable) hours += 3;
  if (profile.workFromHome) hours += 2;
  return hours;
}

export const profileStorageV2 = {
  /**
   * Save profile to v2 tables (profile_foundation, profile_history, profile_arousal)
   */
  async saveProfile(profile: Partial<UserProfile>): Promise<void> {
    const userId = await getAuthUserId();

    // Save to profile_foundation
    const foundation = {
      user_id: userId,
      chosen_name: profile.preferredName || '',
      pronouns: profile.pronouns || 'she/her',
      age: ageRangeToNumber(profile.ageRange),
      living_situation: profile.livingSituation,
      work_situation: profile.workFromHome ? 'remote' : 'office',
      private_hours_daily: estimatePrivateHours(profile),
      partner_status: profile.hasPartner ? 'partnered' : 'single',
      partner_awareness_level: partnerSupportToLevel(profile.partnerSupportive),
      partner_reaction: profile.partnerNotes,
      difficulty_level: intensityToDifficulty(profile.preferredIntensity),
      updated_at: new Date().toISOString(),
    };

    const { error: foundationError } = await supabase
      .from('profile_foundation')
      .upsert(foundation, { onConflict: 'user_id' });

    if (foundationError) {
      console.error('Error saving profile_foundation:', foundationError);
      throw foundationError;
    }

    // Save to profile_history
    const history = {
      user_id: userId,
      previous_attempts: profile.journeyStage !== 'exploring',
      what_stopped_before: profile.resistancePatterns,
      dysphoria_frequency: profile.dysphoriaWorstTimes,
      dysphoria_triggers: profile.dysphoriaTriggers || [],
      euphoria_triggers: profile.euphoriaSeeks,
      peak_euphoria_moment: profile.euphoriaBestMoments,
    };

    const { error: historyError } = await supabase
      .from('profile_history')
      .upsert(history, { onConflict: 'user_id' });

    if (historyError) {
      console.error('Error saving profile_history:', historyError);
      throw historyError;
    }

    // Save to profile_arousal (with defaults - v1 onboarding doesn't capture these)
    const arousal = {
      user_id: userId,
      // These would be populated by a separate arousal intake step in v2
      // For now, leave as defaults
    };

    const { error: arousalError } = await supabase
      .from('profile_arousal')
      .upsert(arousal, { onConflict: 'user_id' });

    if (arousalError) {
      console.error('Error saving profile_arousal:', arousalError);
      throw arousalError;
    }

    // Also initialize user_state for the user
    const { error: stateError } = await supabase
      .from('user_state')
      .upsert({
        user_id: userId,
        handler_mode: 'director',
        odometer: 'coasting',
      }, { onConflict: 'user_id' });

    if (stateError) {
      console.error('Error initializing user_state:', stateError);
      // Don't throw - this is a non-critical initialization
    }
  },

  /**
   * Get profile from v2 tables
   */
  async getProfile(): Promise<UserProfile | null> {
    const userId = await getAuthUserId();

    // Fetch from all three tables
    const [foundationResult, historyResult] = await Promise.all([
      supabase
        .from('profile_foundation')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('profile_history')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    const foundation = foundationResult.data;
    const history = historyResult.data;

    if (!foundation) return null;

    // Map back to UserProfile
    const ageRangeMap: Record<number, string> = {
      21: '18-24',
      30: '25-34',
      40: '35-44',
      50: '45-54',
      60: '55+',
    };

    const difficultyMap: Record<string, string> = {
      'gentle': 'gentle',
      'moderate': 'normal',
      'firm': 'challenging',
      'relentless': 'challenging',
    };

    const supportMap: Record<number, string> = {
      0: 'doesnt_know',
      1: 'unsupportive',
      2: 'neutral',
      3: 'supportive',
      4: 'very_supportive',
    };

    return {
      preferredName: foundation.chosen_name,
      pronouns: foundation.pronouns,
      ageRange: foundation.age ? ageRangeMap[foundation.age] as UserProfile['ageRange'] : undefined,
      livingSituation: foundation.living_situation as UserProfile['livingSituation'],
      hasPartner: foundation.partner_status === 'partnered',
      partnerSupportive: supportMap[foundation.partner_awareness_level || 0] as UserProfile['partnerSupportive'],
      partnerNotes: foundation.partner_reaction,
      preferredIntensity: (difficultyMap[foundation.difficulty_level || 'moderate'] || 'normal') as UserProfile['preferredIntensity'],
      workFromHome: foundation.work_situation === 'remote',
      morningAvailable: (foundation.private_hours_daily || 0) >= 2,
      eveningAvailable: (foundation.private_hours_daily || 0) >= 3,
      // From history
      journeyStage: history?.previous_attempts ? 'started' : 'exploring',
      monthsOnJourney: 0,
      resistancePatterns: history?.what_stopped_before,
      dysphoriaWorstTimes: history?.dysphoria_frequency,
      dysphoriaTriggers: history?.dysphoria_triggers || [],
      euphoriaSeeks: history?.euphoria_triggers,
      euphoriaBestMoments: history?.peak_euphoria_moment,
      euphoriaTriggers: [],
      fears: [],
      busyDays: [],
    };
  },

  /**
   * Check if v2 onboarding is complete
   */
  async isOnboardingComplete(): Promise<boolean> {
    const userId = await getAuthUserId();

    // Check if profile_foundation has a record with chosen_name
    const { data, error } = await supabase
      .from('profile_foundation')
      .select('chosen_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return false;
    return !!data.chosen_name && data.chosen_name.length > 0;
  },

  /**
   * Get user's difficulty level
   */
  async getDifficultyLevel(): Promise<string> {
    const userId = await getAuthUserId();

    const { data, error } = await supabase
      .from('profile_foundation')
      .select('difficulty_level')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return 'moderate';
    return data.difficulty_level || 'moderate';
  },

  /**
   * Update difficulty level
   */
  async setDifficultyLevel(level: string): Promise<void> {
    const userId = await getAuthUserId();

    const { error } = await supabase
      .from('profile_foundation')
      .update({
        difficulty_level: level,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating difficulty_level:', error);
      throw error;
    }
  },
};
