// Narration correction counter logic

import { supabase } from './supabase';
import { addPoints, getOrCreateRewardState } from './rewards';
import { NARRATION_MILESTONES, POINT_VALUES } from '../types/rewards';

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

// ============================================
// MILESTONE POINTS
// ============================================

const MILESTONE_POINTS: Record<number, number> = {
  10: POINT_VALUES.narration_10,
  25: POINT_VALUES.narration_25,
  50: POINT_VALUES.narration_50,
};

// ============================================
// NARRATION OPERATIONS
// ============================================

/**
 * Increment the daily narration counter by 1
 * Returns the new count and any milestone reached
 */
export async function incrementNarration(): Promise<{
  newCount: number;
  milestoneReached?: number;
  pointsAwarded?: number;
}> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];

  // Ensure reward state exists
  await getOrCreateRewardState();

  // Get current state
  const { data: state, error: stateError } = await supabase
    .from('user_reward_state')
    .select('daily_narration_count, last_narration_date, lifetime_narration_count')
    .eq('user_id', userId)
    .single();

  if (stateError) {
    console.error('Failed to get narration state:', stateError);
    throw stateError;
  }

  // Reset count if new day
  const previousCount = state.last_narration_date === today
    ? state.daily_narration_count
    : 0;
  const newCount = previousCount + 1;
  const newLifetime = (state.lifetime_narration_count || 0) + 1;

  // Update state
  const { error: updateError } = await supabase
    .from('user_reward_state')
    .update({
      daily_narration_count: newCount,
      lifetime_narration_count: newLifetime,
      last_narration_date: today,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Failed to update narration count:', updateError);
    throw updateError;
  }

  // Check for milestone (only award once per milestone per day)
  const milestoneReached = NARRATION_MILESTONES.find(m => newCount === m);
  let pointsAwarded: number | undefined;

  if (milestoneReached) {
    const points = MILESTONE_POINTS[milestoneReached];
    await addPoints(points, 'narration_milestone', undefined, {
      milestone: milestoneReached,
      dailyCount: newCount,
    });
    pointsAwarded = points;
  }

  return { newCount, milestoneReached, pointsAwarded };
}

/**
 * Get current daily narration count
 */
export async function getDailyNarrationCount(): Promise<number> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('user_reward_state')
    .select('daily_narration_count, last_narration_date')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return 0; // No state yet
    console.error('Failed to get narration count:', error);
    throw error;
  }

  // Return 0 if it's a new day
  if (data.last_narration_date !== today) {
    return 0;
  }

  return data.daily_narration_count;
}

/**
 * Get lifetime narration count
 */
export async function getLifetimeNarrationCount(): Promise<number> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_reward_state')
    .select('lifetime_narration_count')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return 0;
    console.error('Failed to get lifetime narration count:', error);
    throw error;
  }

  return data.lifetime_narration_count || 0;
}

/**
 * Get narration streak (consecutive days hitting 10+)
 */
export async function getNarrationStreak(): Promise<number> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_reward_state')
    .select('narration_streak')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return 0;
    console.error('Failed to get narration streak:', error);
    throw error;
  }

  return data.narration_streak || 0;
}

/**
 * Reset daily narration and update streak
 * Called at the start of a new day or on app load when day changes
 */
export async function resetDailyNarration(): Promise<void> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];

  const { data: state, error: stateError } = await supabase
    .from('user_reward_state')
    .select('daily_narration_count, last_narration_date, narration_streak')
    .eq('user_id', userId)
    .single();

  if (stateError) {
    if (stateError.code === 'PGRST116') return; // No state yet
    console.error('Failed to get state for reset:', stateError);
    return; // Don't throw, shouldn't block app
  }

  // If already reset for today, skip
  if (state.last_narration_date === today && state.daily_narration_count === 0) {
    return;
  }

  // Calculate yesterday's date
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Update streak based on yesterday's performance
  let newStreak = state.narration_streak || 0;

  if (state.last_narration_date === yesterday) {
    // Yesterday was the last active day
    if (state.daily_narration_count >= 10) {
      // Hit goal yesterday, increment streak
      newStreak++;
    } else {
      // Missed goal yesterday, reset streak
      newStreak = 0;
    }
  } else if (state.last_narration_date !== today) {
    // Missed at least one day, reset streak
    newStreak = 0;
  }

  const { error: updateError } = await supabase
    .from('user_reward_state')
    .update({
      daily_narration_count: 0,
      narration_streak: newStreak,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Failed to reset daily narration:', updateError);
  }
}

/**
 * Get narration stats for display
 */
export async function getNarrationStats(): Promise<{
  dailyCount: number;
  dailyGoal: number;
  lifetimeCount: number;
  streak: number;
  nextMilestone: number | null;
  progressToNextMilestone: number;
}> {
  const dailyCount = await getDailyNarrationCount();
  const lifetimeCount = await getLifetimeNarrationCount();
  const streak = await getNarrationStreak();

  // Find next milestone
  const nextMilestone = NARRATION_MILESTONES.find(m => dailyCount < m) || null;
  const prevMilestone = NARRATION_MILESTONES.filter(m => dailyCount >= m).pop() || 0;

  // Calculate progress to next milestone
  let progressToNextMilestone = 0;
  if (nextMilestone) {
    const range = nextMilestone - prevMilestone;
    const current = dailyCount - prevMilestone;
    progressToNextMilestone = Math.min(100, (current / range) * 100);
  } else {
    progressToNextMilestone = 100; // All milestones hit
  }

  return {
    dailyCount,
    dailyGoal: 10, // First milestone is the "goal"
    lifetimeCount,
    streak,
    nextMilestone,
    progressToNextMilestone,
  };
}
