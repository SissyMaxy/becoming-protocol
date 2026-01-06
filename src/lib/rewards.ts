// Core reward calculations and API

import { supabase } from './supabase';
import type {
  UserRewardState,
  DbUserRewardState,
  PointSource,
  PointTransaction,
  DbPointTransaction,
  LevelInfo,
  LevelUpEvent,
  PointAwardResult,
} from '../types/rewards';
import {
  LEVEL_THRESHOLDS,
  LEVEL_TITLES,
} from '../types/rewards';

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

// ============================================
// MAPPERS
// ============================================

export function mapDbToRewardState(db: DbUserRewardState): UserRewardState {
  return {
    id: db.id,
    userId: db.user_id,
    totalPoints: db.total_points,
    currentLevel: db.current_level,
    levelTitle: db.level_title,
    xpInCurrentLevel: db.xp_in_current_level,
    currentStreak: db.current_streak,
    currentStreakMultiplier: Number(db.current_streak_multiplier),
    dailyNarrationCount: db.daily_narration_count,
    lifetimeNarrationCount: db.lifetime_narration_count,
    narrationStreak: db.narration_streak,
    lastNarrationDate: db.last_narration_date,
    anchoringSessionsThisWeek: db.anchoring_sessions_this_week,
    rewardSessionsThisWeek: db.reward_sessions_this_week,
    lastSessionDate: db.last_session_date,
    weekStartDate: db.week_start_date,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function mapDbToPointTransaction(db: DbPointTransaction): PointTransaction {
  return {
    id: db.id,
    userId: db.user_id,
    points: db.points,
    multiplier: Number(db.multiplier),
    finalPoints: db.final_points,
    source: db.source as PointSource,
    sourceId: db.source_id || undefined,
    sourceDetails: db.source_details || undefined,
    createdAt: db.created_at,
  };
}

// ============================================
// STREAK MULTIPLIER CALCULATION
// ============================================

/**
 * Calculate streak multiplier based on current streak length
 * Caps at 2.0x for 60+ days
 */
export function calculateStreakMultiplier(streak: number): number {
  if (streak >= 60) return 2.0;
  if (streak >= 30) return 1.75;
  if (streak >= 14) return 1.5;
  if (streak >= 7) return 1.25;
  return 1.0;
}

/**
 * Get the multiplier tier label for display
 */
export function getMultiplierTierLabel(streak: number): string {
  if (streak >= 60) return '60+ days (2.0x)';
  if (streak >= 30) return '30+ days (1.75x)';
  if (streak >= 14) return '14+ days (1.5x)';
  if (streak >= 7) return '7+ days (1.25x)';
  return 'Building streak (1.0x)';
}

/**
 * Get days until next multiplier tier
 */
export function getDaysToNextTier(streak: number): number | null {
  if (streak >= 60) return null; // Max tier
  if (streak >= 30) return 60 - streak;
  if (streak >= 14) return 30 - streak;
  if (streak >= 7) return 14 - streak;
  return 7 - streak;
}

// ============================================
// LEVEL CALCULATION
// ============================================

/**
 * Calculate level info from total points
 */
export function calculateLevel(totalPoints: number): LevelInfo {
  let level = 1;

  // Find the highest level threshold we've passed
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalPoints >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }

  // Calculate XP within current level
  const xpForCurrentLevel = LEVEL_THRESHOLDS[level - 1];
  const xpForNextLevel = level < 10
    ? LEVEL_THRESHOLDS[level] - xpForCurrentLevel
    : 0; // Max level
  const xpInLevel = totalPoints - xpForCurrentLevel;

  // Calculate progress percentage
  const progress = level < 10
    ? Math.min(100, (xpInLevel / xpForNextLevel) * 100)
    : 100;

  return {
    level,
    title: LEVEL_TITLES[level - 1],
    xpInLevel,
    xpForNextLevel,
    progress,
  };
}

/**
 * Get XP needed to reach a specific level
 */
export function getXpForLevel(level: number): number {
  if (level < 1 || level > 10) return 0;
  return LEVEL_THRESHOLDS[level - 1];
}

/**
 * Check if adding points would cause a level up
 */
export function wouldLevelUp(currentPoints: number, pointsToAdd: number): LevelUpEvent | null {
  const currentLevel = calculateLevel(currentPoints).level;
  const newLevel = calculateLevel(currentPoints + pointsToAdd).level;

  if (newLevel > currentLevel) {
    return {
      from: currentLevel,
      to: newLevel,
      newTitle: LEVEL_TITLES[newLevel - 1],
    };
  }

  return null;
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Get the current user's reward state
 */
export async function getRewardState(): Promise<UserRewardState | null> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_reward_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No row found - user doesn't have reward state yet
      return null;
    }
    console.error('Failed to get reward state:', error);
    throw error;
  }

  return mapDbToRewardState(data as DbUserRewardState);
}

/**
 * Initialize reward state for a new user
 */
export async function initializeRewardState(): Promise<UserRewardState> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_reward_state')
    .insert({ user_id: userId })
    .select()
    .single();

  if (error) {
    console.error('Failed to initialize reward state:', error);
    throw error;
  }

  return mapDbToRewardState(data as DbUserRewardState);
}

/**
 * Get or create reward state for the current user
 */
export async function getOrCreateRewardState(): Promise<UserRewardState> {
  let state = await getRewardState();
  if (!state) {
    state = await initializeRewardState();
  }
  return state;
}

/**
 * Update streak and multiplier (called on day completion)
 */
export async function updateStreak(newStreak: number): Promise<void> {
  const userId = await getAuthUserId();
  const multiplier = calculateStreakMultiplier(newStreak);

  const { error } = await supabase
    .from('user_reward_state')
    .update({
      current_streak: newStreak,
      current_streak_multiplier: multiplier,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update streak:', error);
    throw error;
  }
}

// ============================================
// POINT OPERATIONS
// ============================================

/**
 * Add points to the user's total with streak multiplier
 * Returns the transaction and whether a level-up occurred
 */
export async function addPoints(
  points: number,
  source: PointSource,
  sourceId?: string,
  sourceDetails?: Record<string, unknown>
): Promise<PointAwardResult> {
  const userId = await getAuthUserId();

  // Get or create reward state
  let state = await getRewardState();
  if (!state) {
    state = await initializeRewardState();
  }

  // Apply streak multiplier
  const multiplier = state.currentStreakMultiplier;
  const finalPoints = Math.floor(points * multiplier);

  // Record transaction
  const { data: txData, error: txError } = await supabase
    .from('point_transactions')
    .insert({
      user_id: userId,
      points,
      multiplier,
      final_points: finalPoints,
      source,
      source_id: sourceId || null,
      source_details: sourceDetails || null,
    })
    .select()
    .single();

  if (txError) {
    console.error('Failed to record point transaction:', txError);
    throw txError;
  }

  // Calculate new total and level
  const newTotal = state.totalPoints + finalPoints;
  const levelInfo = calculateLevel(newTotal);

  // Check for level up
  const levelUp = levelInfo.level > state.currentLevel
    ? { from: state.currentLevel, to: levelInfo.level, newTitle: levelInfo.title }
    : undefined;

  // Update state
  const { error: updateError } = await supabase
    .from('user_reward_state')
    .update({
      total_points: newTotal,
      current_level: levelInfo.level,
      level_title: levelInfo.title,
      xp_in_current_level: levelInfo.xpInLevel,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Failed to update reward state:', updateError);
    throw updateError;
  }

  return {
    transaction: mapDbToPointTransaction(txData as DbPointTransaction),
    newTotal,
    levelUp,
  };
}

/**
 * Get recent point transactions
 */
export async function getPointTransactions(limit = 50): Promise<PointTransaction[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('point_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get point transactions:', error);
    throw error;
  }

  return (data as DbPointTransaction[]).map(mapDbToPointTransaction);
}

/**
 * Get total points earned today
 */
export async function getPointsEarnedToday(): Promise<number> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('point_transactions')
    .select('final_points')
    .eq('user_id', userId)
    .gte('created_at', `${today}T00:00:00Z`)
    .lt('created_at', `${today}T23:59:59Z`);

  if (error) {
    console.error('Failed to get today points:', error);
    throw error;
  }

  return (data || []).reduce((sum, tx) => sum + tx.final_points, 0);
}

/**
 * Get points earned by source type (for stats)
 */
export async function getPointsBySource(): Promise<Record<PointSource, number>> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('point_transactions')
    .select('source, final_points')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to get points by source:', error);
    throw error;
  }

  const bySource: Record<string, number> = {};
  for (const tx of data || []) {
    bySource[tx.source] = (bySource[tx.source] || 0) + tx.final_points;
  }

  return bySource as Record<PointSource, number>;
}

// ============================================
// WEEK RESET OPERATIONS
// ============================================

/**
 * Check if week has changed and reset session counts if needed
 * Called on app load/navigation
 */
export async function checkAndResetWeek(): Promise<void> {
  const userId = await getAuthUserId();

  // Call the database function to handle reset
  const { error } = await supabase.rpc('reset_weekly_sessions', {
    p_user_id: userId,
  });

  if (error) {
    console.error('Failed to check/reset week:', error);
    // Don't throw - this shouldn't block the app
  }
}

// ============================================
// LEADERBOARD / STATS (FUTURE)
// ============================================

/**
 * Get top points earners (if we implement social features)
 * Currently returns empty - placeholder for future
 */
export async function getLeaderboard(): Promise<Array<{
  userId: string;
  totalPoints: number;
  currentLevel: number;
  levelTitle: string;
}>> {
  // Future implementation
  return [];
}
