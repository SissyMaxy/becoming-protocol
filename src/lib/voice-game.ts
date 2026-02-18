/**
 * Voice Game Database Operations
 * CRUD operations for voice affirmation game
 */

import { supabase } from './supabase';
import type {
  Affirmation,
  AffirmationCategory,
  VoiceGameDifficulty,
  VoiceGameSession,
  VoiceGameAttempt,
  VoiceGameProgress,
  VoiceGameSettings,
  VoiceGameAchievement,
  DbVoiceAffirmation,
  DbVoiceGameSession,
  DbVoiceGameProgress,
  DbVoiceGameSettings,
} from '../types/voice-game';
import {
  mapDbAffirmation,
  mapDbSession,
  mapDbProgress,
  mapDbSettings,
} from '../types/voice-game';

// Re-export mappers for convenience
export {
  mapDbAffirmation,
  mapDbSession,
  mapDbProgress,
  mapDbSettings,
} from '../types/voice-game';

// ============================================
// AFFIRMATIONS
// ============================================

/**
 * Get all active affirmations
 */
export async function getAffirmations(): Promise<Affirmation[]> {
  const { data, error } = await supabase
    .from('voice_affirmations')
    .select('*')
    .eq('is_active', true)
    .order('difficulty', { ascending: true });

  if (error) {
    console.error('Failed to fetch affirmations:', error);
    return [];
  }

  return (data as DbVoiceAffirmation[]).map(mapDbAffirmation);
}

/**
 * Get affirmations for a session based on difficulty and categories
 */
export async function getAffirmationsForSession(
  difficulty: VoiceGameDifficulty,
  categories: AffirmationCategory[],
  count: number
): Promise<Affirmation[]> {
  // Get affirmations at or below the selected difficulty
  const { data, error } = await supabase
    .from('voice_affirmations')
    .select('*')
    .eq('is_active', true)
    .lte('difficulty', difficulty)
    .in('category', categories);

  if (error) {
    console.error('Failed to fetch affirmations for session:', error);
    return [];
  }

  const affirmations = (data as DbVoiceAffirmation[]).map(mapDbAffirmation);

  // Shuffle and return requested count
  const shuffled = [...affirmations].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get affirmations by category
 */
export async function getAffirmationsByCategory(
  category: AffirmationCategory
): Promise<Affirmation[]> {
  const { data, error } = await supabase
    .from('voice_affirmations')
    .select('*')
    .eq('is_active', true)
    .eq('category', category)
    .order('difficulty', { ascending: true });

  if (error) {
    console.error('Failed to fetch affirmations by category:', error);
    return [];
  }

  return (data as DbVoiceAffirmation[]).map(mapDbAffirmation);
}

// ============================================
// SESSIONS
// ============================================

/**
 * Create a new game session
 */
export async function createSession(
  difficulty: VoiceGameDifficulty,
  categories: AffirmationCategory[]
): Promise<VoiceGameSession> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('voice_game_sessions')
    .insert({
      user_id: userData.user.id,
      difficulty,
      categories,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create session:', error);
    throw error;
  }

  return mapDbSession(data as DbVoiceGameSession);
}

/**
 * Update session progress
 */
export async function updateSessionProgress(
  sessionId: string,
  updates: Partial<{
    affirmationsAttempted: number;
    affirmationsCompleted: number;
    currentStreak: number;
    longestStreak: number;
    totalPoints: number;
    averageAccuracy: number;
  }>
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};

  if (updates.affirmationsAttempted !== undefined) {
    dbUpdates.affirmations_attempted = updates.affirmationsAttempted;
  }
  if (updates.affirmationsCompleted !== undefined) {
    dbUpdates.affirmations_completed = updates.affirmationsCompleted;
  }
  if (updates.currentStreak !== undefined) {
    dbUpdates.current_streak = updates.currentStreak;
  }
  if (updates.longestStreak !== undefined) {
    dbUpdates.longest_streak = updates.longestStreak;
  }
  if (updates.totalPoints !== undefined) {
    dbUpdates.total_points = updates.totalPoints;
  }
  if (updates.averageAccuracy !== undefined) {
    dbUpdates.average_accuracy = updates.averageAccuracy;
  }

  const { error } = await supabase
    .from('voice_game_sessions')
    .update(dbUpdates)
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to update session:', error);
    throw error;
  }
}

/**
 * Complete a session
 */
export async function completeSession(sessionId: string): Promise<VoiceGameSession> {
  const { data, error } = await supabase
    .from('voice_game_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    console.error('Failed to complete session:', error);
    throw error;
  }

  return mapDbSession(data as DbVoiceGameSession);
}

/**
 * Abandon a session
 */
export async function abandonSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('voice_game_sessions')
    .update({
      status: 'abandoned',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to abandon session:', error);
    throw error;
  }
}

/**
 * Get user's recent sessions
 */
export async function getRecentSessions(limit = 10): Promise<VoiceGameSession[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from('voice_game_sessions')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch recent sessions:', error);
    return [];
  }

  return (data as DbVoiceGameSession[]).map(mapDbSession);
}

// ============================================
// ATTEMPTS
// ============================================

/**
 * Record an attempt
 */
export async function recordAttempt(attempt: {
  sessionId: string;
  affirmationId: string;
  spokenText: string;
  accuracy: number;
  isSuccess: boolean;
  attemptNumber: number;
  durationMs?: number;
}): Promise<VoiceGameAttempt> {
  const { data, error } = await supabase
    .from('voice_game_attempts')
    .insert({
      session_id: attempt.sessionId,
      affirmation_id: attempt.affirmationId,
      spoken_text: attempt.spokenText,
      accuracy: attempt.accuracy,
      is_success: attempt.isSuccess,
      attempt_number: attempt.attemptNumber,
      duration_ms: attempt.durationMs || 0,
      reward_sent: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to record attempt:', error);
    throw error;
  }

  return {
    id: data.id,
    sessionId: data.session_id,
    affirmationId: data.affirmation_id,
    spokenText: data.spoken_text,
    accuracy: data.accuracy,
    isSuccess: data.is_success,
    rewardSent: data.reward_sent,
    attemptNumber: data.attempt_number,
    durationMs: data.duration_ms,
    createdAt: data.created_at,
  };
}

/**
 * Mark an attempt as reward sent
 */
export async function markRewardSent(attemptId: string): Promise<void> {
  const { error } = await supabase
    .from('voice_game_attempts')
    .update({ reward_sent: true })
    .eq('id', attemptId);

  if (error) {
    console.error('Failed to mark reward sent:', error);
  }
}

// ============================================
// PROGRESS
// ============================================

/**
 * Get user's progress
 */
export async function getProgress(): Promise<VoiceGameProgress | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('voice_game_progress')
    .select('*')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch progress:', error);
    return null;
  }

  if (!data) return null;

  return mapDbProgress(data as DbVoiceGameProgress);
}

/**
 * Update progress after session completion
 */
export async function updateProgress(session: VoiceGameSession): Promise<VoiceGameProgress> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');

  // Get current progress
  const current = await getProgress();
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Calculate streak
  let newStreak = 1;
  if (current?.lastPlayedAt) {
    const lastDate = new Date(current.lastPlayedAt).toISOString().split('T')[0];
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    if (lastDate === today) {
      // Same day, keep streak
      newStreak = current.currentStreak;
    } else if (lastDate === yesterday) {
      // Consecutive day, increment streak
      newStreak = current.currentStreak + 1;
    }
    // Otherwise streak resets to 1
  }

  const newProgress = {
    user_id: userData.user.id,
    total_sessions: (current?.totalSessions || 0) + 1,
    total_affirmations: (current?.totalAffirmations || 0) + session.affirmationsCompleted,
    current_streak: newStreak,
    longest_streak: Math.max(newStreak, current?.longestStreak || 0),
    last_played_at: now.toISOString(),
    average_accuracy: calculateNewAverage(
      current?.averageAccuracy || 0,
      current?.totalAffirmations || 0,
      session.averageAccuracy,
      session.affirmationsCompleted
    ),
    highest_difficulty: Math.max(
      session.difficulty,
      current?.highestDifficulty || 1
    ) as VoiceGameDifficulty,
    total_points_earned: (current?.totalPointsEarned || 0) + session.totalPoints,
    updated_at: now.toISOString(),
  };

  const { data, error } = await supabase
    .from('voice_game_progress')
    .upsert(newProgress, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('Failed to update progress:', error);
    throw error;
  }

  return mapDbProgress(data as DbVoiceGameProgress);
}

/**
 * Calculate new weighted average
 */
function calculateNewAverage(
  oldAverage: number,
  oldCount: number,
  newValue: number,
  newCount: number
): number {
  if (oldCount + newCount === 0) return 0;
  return (oldAverage * oldCount + newValue * newCount) / (oldCount + newCount);
}

// ============================================
// SETTINGS
// ============================================

/**
 * Get user's settings
 */
export async function getSettings(): Promise<VoiceGameSettings | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('voice_game_settings')
    .select('*')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch settings:', error);
    return null;
  }

  if (!data) {
    // Return default settings
    return getDefaultSettings(userData.user.id);
  }

  return mapDbSettings(data as DbVoiceGameSettings);
}

/**
 * Get default settings
 */
function getDefaultSettings(userId: string): VoiceGameSettings {
  return {
    id: '',
    userId,
    defaultDifficulty: 2,
    preferredCategories: ['identity', 'feminine', 'transformation'],
    hapticRewardsEnabled: true,
    hapticIntensityMultiplier: 1.0,
    voiceRecognitionLanguage: 'en-US',
    showSubtitles: true,
    affirmationsPerSession: 10,
    autoAdvanceOnSuccess: true,
    retryLimit: 3,
    streakProtectionEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update settings
 */
export async function updateSettings(
  settings: Partial<VoiceGameSettings>
): Promise<VoiceGameSettings> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');

  const dbSettings: Record<string, unknown> = {
    user_id: userData.user.id,
    updated_at: new Date().toISOString(),
  };

  if (settings.defaultDifficulty !== undefined) {
    dbSettings.default_difficulty = settings.defaultDifficulty;
  }
  if (settings.preferredCategories !== undefined) {
    dbSettings.preferred_categories = settings.preferredCategories;
  }
  if (settings.hapticRewardsEnabled !== undefined) {
    dbSettings.haptic_rewards_enabled = settings.hapticRewardsEnabled;
  }
  if (settings.hapticIntensityMultiplier !== undefined) {
    dbSettings.haptic_intensity_multiplier = settings.hapticIntensityMultiplier;
  }
  if (settings.voiceRecognitionLanguage !== undefined) {
    dbSettings.voice_recognition_language = settings.voiceRecognitionLanguage;
  }
  if (settings.showSubtitles !== undefined) {
    dbSettings.show_subtitles = settings.showSubtitles;
  }
  if (settings.affirmationsPerSession !== undefined) {
    dbSettings.affirmations_per_session = settings.affirmationsPerSession;
  }
  if (settings.autoAdvanceOnSuccess !== undefined) {
    dbSettings.auto_advance_on_success = settings.autoAdvanceOnSuccess;
  }
  if (settings.retryLimit !== undefined) {
    dbSettings.retry_limit = settings.retryLimit;
  }
  if (settings.streakProtectionEnabled !== undefined) {
    dbSettings.streak_protection_enabled = settings.streakProtectionEnabled;
  }

  const { data, error } = await supabase
    .from('voice_game_settings')
    .upsert(dbSettings, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('Failed to update settings:', error);
    throw error;
  }

  return mapDbSettings(data as DbVoiceGameSettings);
}

// ============================================
// ACHIEVEMENTS
// ============================================

/**
 * Get all achievements
 */
export async function getAchievements(): Promise<VoiceGameAchievement[]> {
  const { data, error } = await supabase
    .from('voice_game_achievements')
    .select('*')
    .order('points', { ascending: true });

  if (error) {
    console.error('Failed to fetch achievements:', error);
    return [];
  }

  return data.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    conditionType: a.condition_type,
    conditionValue: a.condition_value,
    points: a.points,
    rarity: a.rarity,
  }));
}

/**
 * Get user's unlocked achievements
 */
export async function getUnlockedAchievements(): Promise<string[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from('voice_game_user_achievements')
    .select('achievement_id')
    .eq('user_id', userData.user.id);

  if (error) {
    console.error('Failed to fetch unlocked achievements:', error);
    return [];
  }

  return data.map((a) => a.achievement_id);
}

/**
 * Check and unlock achievements
 */
export async function checkAchievements(
  progress: VoiceGameProgress
): Promise<VoiceGameAchievement[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  // Get all achievements and currently unlocked
  const [allAchievements, unlockedIds] = await Promise.all([
    getAchievements(),
    getUnlockedAchievements(),
  ]);

  const newlyUnlocked: VoiceGameAchievement[] = [];

  for (const achievement of allAchievements) {
    if (unlockedIds.includes(achievement.id)) continue;

    let earned = false;
    const condition = achievement.conditionValue as Record<string, unknown>;

    switch (achievement.conditionType) {
      case 'affirmations_spoken':
        earned = progress.totalAffirmations >= (condition.value as number);
        break;
      case 'streak_days':
        earned = progress.currentStreak >= (condition.value as number);
        break;
      case 'difficulty_reached':
        earned = progress.highestDifficulty >= (condition.value as number);
        break;
      case 'accuracy_threshold':
        earned = progress.averageAccuracy >= (condition.value as number);
        break;
      // Add more condition types as needed
    }

    if (earned) {
      // Unlock achievement
      const { error } = await supabase
        .from('voice_game_user_achievements')
        .insert({
          user_id: userData.user.id,
          achievement_id: achievement.id,
        });

      if (!error) {
        newlyUnlocked.push(achievement);
      }
    }
  }

  return newlyUnlocked;
}
