/**
 * Ratchet & Commitment System Functions
 *
 * Core functions for managing psychological commitment mechanisms:
 * - Covenant signing and enforcement
 * - Confession vault and key admissions
 * - First-time milestones
 * - Streak value calculation
 * - Identity affirmations
 */

import { supabase } from './supabase';
import {
  Covenant,
  CovenantTerm,
  Confession,
  KeyAdmission,
  FirstMilestone,
  MilestoneType,
  StreakSnapshot,
  StreakValue,
  IdentityAffirmation,
  DeletionAttempt,
  WishlistArchiveItem,
  WishlistRemovalReason,
  mapDbToCovenant,
  mapDbToConfession,
  mapDbToFirstMilestone,
  calculateStreakValue,
  CONFESSION_PROMPTS,
} from '../types/ratchets';
import { getPermanenceRatchetScore } from './content/permanence-tracker';

// ============================================
// COVENANT FUNCTIONS
// ============================================

export async function getCovenant(userId: string): Promise<Covenant | null> {
  const { data, error } = await supabase
    .from('covenant')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .single();

  if (error || !data) return null;
  return mapDbToCovenant(data);
}

export async function signCovenant(
  userId: string,
  terms: CovenantTerm[],
  selfConsequence: string,
  durationType: 'phase4' | 'days' | 'permanent' = 'phase4',
  durationValue?: number
): Promise<Covenant> {
  const { data, error } = await supabase
    .from('covenant')
    .insert({
      user_id: userId,
      terms,
      self_consequence: selfConsequence,
      duration_type: durationType,
      duration_value: durationValue,
    })
    .select()
    .single();

  if (error) throw error;

  // Record as first milestone
  await recordFirstMilestone(userId, 'first_covenant');

  return mapDbToCovenant(data);
}

export async function recordCovenantViolation(
  userId: string,
  violationType: string
): Promise<void> {
  const { error } = await supabase
    .from('covenant')
    .update({
      violations: supabase.rpc('increment', { x: 1 }),
      last_violation_at: new Date().toISOString(),
      last_violation_type: violationType,
    })
    .eq('user_id', userId)
    .eq('active', true);

  if (error) throw error;
}

// ============================================
// CONFESSION FUNCTIONS
// ============================================

export async function recordConfession(
  userId: string,
  response: string,
  prompt?: string,
  source: 'journal' | 'ai_conversation' | 'prompted' = 'journal'
): Promise<Confession> {
  const { data, error } = await supabase
    .from('confessions')
    .insert({
      user_id: userId,
      prompt,
      response,
      source,
    })
    .select()
    .single();

  if (error) throw error;
  return mapDbToConfession(data);
}

export async function getConfessions(
  userId: string,
  limit = 50
): Promise<Confession[]> {
  const { data, error } = await supabase
    .from('confessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map(mapDbToConfession);
}

export async function getKeyAdmissions(userId: string): Promise<KeyAdmission[]> {
  const { data, error } = await supabase
    .from('key_admissions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function markConfessionAsKeyAdmission(
  confessionId: string,
  admissionText: string,
  admissionType?: string
): Promise<void> {
  const { data: confession } = await supabase
    .from('confessions')
    .select('user_id')
    .eq('id', confessionId)
    .single();

  if (!confession) throw new Error('Confession not found');

  // Update confession
  await supabase
    .from('confessions')
    .update({ is_key_admission: true })
    .eq('id', confessionId);

  // Create key admission record
  await supabase
    .from('key_admissions')
    .insert({
      user_id: confession.user_id,
      confession_id: confessionId,
      admission_text: admissionText,
      admission_type: admissionType,
    });
}

export async function getRandomConfessionPrompt(): Promise<string> {
  const index = Math.floor(Math.random() * CONFESSION_PROMPTS.length);
  return CONFESSION_PROMPTS[index];
}

export async function recordKeyAdmissionShown(admissionId: string): Promise<void> {
  const { error } = await supabase
    .from('key_admissions')
    .update({
      times_shown: supabase.rpc('increment', { x: 1 }),
      last_shown_at: new Date().toISOString(),
    })
    .eq('id', admissionId);

  if (error) throw error;
}

// Get a relevant admission to show when user is backsliding
export async function getAdmissionForBacksliding(
  userId: string
): Promise<KeyAdmission | null> {
  const { data, error } = await supabase
    .from('key_admissions')
    .select('*')
    .eq('user_id', userId)
    .order('times_shown', { ascending: true }) // Show least-shown first
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

// ============================================
// FIRST MILESTONE FUNCTIONS
// ============================================

export async function recordFirstMilestone(
  userId: string,
  milestoneType: MilestoneType,
  context?: { streak?: number; phase?: number; investment?: number }
): Promise<FirstMilestone | null> {
  // Check if already exists
  const { data: existing } = await supabase
    .from('first_milestones')
    .select('id')
    .eq('user_id', userId)
    .eq('milestone_type', milestoneType)
    .single();

  if (existing) return null; // Already recorded

  const { data, error } = await supabase
    .from('first_milestones')
    .insert({
      user_id: userId,
      milestone_type: milestoneType,
      context,
    })
    .select()
    .single();

  if (error) throw error;
  return mapDbToFirstMilestone(data);
}

export async function getFirstMilestones(userId: string): Promise<FirstMilestone[]> {
  const { data, error } = await supabase
    .from('first_milestones')
    .select('*')
    .eq('user_id', userId)
    .order('achieved_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapDbToFirstMilestone);
}

export async function hasMilestone(
  userId: string,
  milestoneType: MilestoneType
): Promise<boolean> {
  const { data } = await supabase
    .from('first_milestones')
    .select('id')
    .eq('user_id', userId)
    .eq('milestone_type', milestoneType)
    .single();

  return !!data;
}

// ============================================
// STREAK VALUE FUNCTIONS
// ============================================

export async function createStreakSnapshot(
  userId: string,
  streakLength: number,
  data: Partial<StreakValue>,
  reason: 'daily' | 'milestone' | 'near_break' | 'manual' = 'daily'
): Promise<StreakSnapshot> {
  const psychValue = calculateStreakValue(streakLength, data);

  const { data: snapshot, error } = await supabase
    .from('streak_snapshots')
    .insert({
      user_id: userId,
      streak_length: streakLength,
      snapshot_reason: reason,
      tasks_completed: data.tasksCompleted || 0,
      practice_minutes: (data.practiceHours || 0) * 60,
      edges_total: data.edgesWithoutRelease || 0,
      investment_during: data.investmentDuring || 0,
      levels_gained: data.levelsGained || 0,
      journal_entries: data.journalEntries || 0,
      letters_written: data.lettersWritten || 0,
      psychological_value: psychValue,
    })
    .select()
    .single();

  if (error) throw error;
  return snapshot;
}

export async function getLatestStreakSnapshot(
  userId: string
): Promise<StreakSnapshot | null> {
  const { data, error } = await supabase
    .from('streak_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

// ============================================
// IDENTITY AFFIRMATION FUNCTIONS
// ============================================

export async function recordAffirmation(
  userId: string,
  affirmationType: IdentityAffirmation['affirmationType'],
  statement: string,
  context: { streak: number; phase: number; investment: number }
): Promise<IdentityAffirmation> {
  const { data, error } = await supabase
    .from('identity_affirmations')
    .insert({
      user_id: userId,
      affirmation_type: affirmationType,
      statement,
      streak_at_time: context.streak,
      phase_at_time: context.phase,
      investment_at_time: context.investment,
    })
    .select()
    .single();

  if (error) throw error;

  // Record as first milestone if first one
  await recordFirstMilestone(userId, 'first_identity_affirmation', {
    streak: context.streak,
    phase: context.phase,
    investment: context.investment,
  });

  return data;
}

export async function getAffirmations(userId: string): Promise<IdentityAffirmation[]> {
  const { data, error } = await supabase
    .from('identity_affirmations')
    .select('*')
    .eq('user_id', userId)
    .order('affirmed_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ============================================
// DELETION GAUNTLET FUNCTIONS
// ============================================

export async function startDeletionAttempt(userId: string): Promise<DeletionAttempt> {
  const { data, error } = await supabase
    .from('deletion_attempts')
    .insert({
      user_id: userId,
      step_reached: 1,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateDeletionAttempt(
  attemptId: string,
  step: number,
  stopped?: { reason: DeletionAttempt['stoppedReason'] }
): Promise<void> {
  const update: Record<string, unknown> = { step_reached: step };

  if (stopped) {
    update.stopped_at_step = step;
    update.stopped_reason = stopped.reason;
  }

  const { error } = await supabase
    .from('deletion_attempts')
    .update(update)
    .eq('id', attemptId);

  if (error) throw error;
}

export async function completeDeletionAttempt(
  attemptId: string,
  finalReason: string
): Promise<void> {
  const { error } = await supabase
    .from('deletion_attempts')
    .update({
      completed: true,
      completed_at: new Date().toISOString(),
      final_reason: finalReason,
    })
    .eq('id', attemptId);

  if (error) throw error;
}

// ============================================
// WISHLIST ARCHIVE FUNCTIONS
// ============================================

export async function archiveWishlistItem(
  userId: string,
  item: {
    originalItemId?: string;
    name: string;
    category?: string;
    estimatedPrice?: number;
    addedAt?: Date;
  },
  removalReason: WishlistRemovalReason
): Promise<WishlistArchiveItem> {
  const { data, error } = await supabase
    .from('wishlist_archive')
    .insert({
      user_id: userId,
      original_item_id: item.originalItemId,
      name: item.name,
      category: item.category,
      estimated_price: item.estimatedPrice,
      added_at: item.addedAt?.toISOString(),
      removal_reason: removalReason,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getWishlistArchive(userId: string): Promise<WishlistArchiveItem[]> {
  const { data, error } = await supabase
    .from('wishlist_archive')
    .select('*')
    .eq('user_id', userId)
    .order('removed_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getWishlistDesireProfile(
  userId: string
): Promise<{ totalEverAdded: number; totalValueEverWanted: number; byCategory: Record<string, number> }> {
  const { data: archived } = await supabase
    .from('wishlist_archive')
    .select('category, estimated_price')
    .eq('user_id', userId);

  const { data: current } = await supabase
    .from('wishlist_items')
    .select('category, estimated_price')
    .eq('user_id', userId);

  const all = [...(archived || []), ...(current || [])];

  const byCategory: Record<string, number> = {};
  let totalValue = 0;

  all.forEach(item => {
    if (item.category) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    }
    totalValue += item.estimated_price || 0;
  });

  return {
    totalEverAdded: all.length,
    totalValueEverWanted: totalValue,
    byCategory,
  };
}

// ============================================
// UTILITY: Check if should show ratchet
// ============================================

export interface RatchetCheckResult {
  shouldShowCovenant: boolean;
  shouldShowAffirmation: boolean;
  affirmationType?: IdentityAffirmation['affirmationType'];
  shouldShowConfessionPrompt: boolean;
}

export async function checkRatchetTriggers(
  userId: string,
  currentDay: number,
  currentPhase: number
): Promise<RatchetCheckResult> {
  const result: RatchetCheckResult = {
    shouldShowCovenant: false,
    shouldShowAffirmation: false,
    shouldShowConfessionPrompt: false,
  };

  // Check covenant - show at day 7 if not signed
  if (currentDay >= 7) {
    const covenant = await getCovenant(userId);
    if (!covenant) {
      result.shouldShowCovenant = true;
    }
  }

  // Check affirmations - at key milestones
  const affirmations = await getAffirmations(userId);
  const hasDay30 = affirmations.some(a => a.affirmationType === 'day30');
  const hasPhase2 = affirmations.some(a => a.affirmationType === 'phase2');
  const hasPhase3 = affirmations.some(a => a.affirmationType === 'phase3');

  if (currentDay >= 30 && !hasDay30) {
    result.shouldShowAffirmation = true;
    result.affirmationType = 'day30';
  } else if (currentPhase >= 2 && !hasPhase2) {
    result.shouldShowAffirmation = true;
    result.affirmationType = 'phase2';
  } else if (currentPhase >= 3 && !hasPhase3) {
    result.shouldShowAffirmation = true;
    result.affirmationType = 'phase3';
  }

  // Show confession prompt periodically (every 3-5 days)
  const lastConfession = await supabase
    .from('confessions')
    .select('created_at')
    .eq('user_id', userId)
    .eq('source', 'prompted')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastConfession.data) {
    result.shouldShowConfessionPrompt = true;
  } else {
    const daysSince = Math.floor(
      (Date.now() - new Date(lastConfession.data.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince >= 3) {
      result.shouldShowConfessionPrompt = true;
    }
  }

  return result;
}

// ============================================
// GOAL-AWARE RATCHET FUNCTIONS
// ============================================

export interface GoalRatchetCheckResult {
  shouldShowGoalCovenant: boolean;
  goalForCovenant?: { id: string; name: string; consecutiveDays: number };
  shouldShowGoalAffirmation: boolean;
  goalForAffirmation?: { id: string; name: string; consecutiveDays: number };
  streakAtRisk: boolean;
  streakValue: number;
}

/**
 * Check goal-specific ratchet triggers
 * - Goal covenant at day 7 of a goal
 * - Goal affirmation at milestone days (10, 20, 30)
 * - Streak risk warning when all goals not completed
 */
export async function checkGoalRatchetTriggers(
  userId: string
): Promise<GoalRatchetCheckResult> {
  const result: GoalRatchetCheckResult = {
    shouldShowGoalCovenant: false,
    shouldShowGoalAffirmation: false,
    streakAtRisk: false,
    streakValue: 0,
  };

  // Get active goals
  const { data: goals, error } = await supabase
    .from('goals')
    .select('id, name, consecutive_days, covenant_id, has_affirmation')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error || !goals) return result;

  // Check for goal covenant trigger (day 7 without covenant)
  const goalNeedingCovenant = goals.find(
    g => g.consecutive_days >= 7 && !g.covenant_id
  );
  if (goalNeedingCovenant) {
    result.shouldShowGoalCovenant = true;
    result.goalForCovenant = {
      id: goalNeedingCovenant.id,
      name: goalNeedingCovenant.name,
      consecutiveDays: goalNeedingCovenant.consecutive_days,
    };
  }

  // Check for goal affirmation trigger (day 10, 20, or 30 milestones)
  const affirmationMilestones = [10, 20, 30];
  const goalNeedingAffirmation = goals.find(g => {
    const atMilestone = affirmationMilestones.some(
      m => g.consecutive_days >= m && g.consecutive_days < m + 1
    );
    return atMilestone && !g.has_affirmation;
  });

  if (goalNeedingAffirmation) {
    result.shouldShowGoalAffirmation = true;
    result.goalForAffirmation = {
      id: goalNeedingAffirmation.id,
      name: goalNeedingAffirmation.name,
      consecutiveDays: goalNeedingAffirmation.consecutive_days,
    };
  }

  // Calculate total streak value at risk
  const totalStreakDays = goals.reduce((sum, g) => sum + g.consecutive_days, 0);
  result.streakValue = calculateGoalStreakValue(totalStreakDays, goals.length);

  // Check if streak is at risk (incomplete goals today)
  const today = new Date().toISOString().split('T')[0];
  const { data: todayCompletions } = await supabase
    .from('daily_goal_completions')
    .select('goal_id')
    .eq('user_id', userId)
    .eq('completed_date', today);

  const completedGoalIds = new Set((todayCompletions || []).map(c => c.goal_id));
  const incompleteGoals = goals.filter(g => !completedGoalIds.has(g.id));

  if (incompleteGoals.length > 0) {
    // Check if it's late in the day (after 8pm)
    const hour = new Date().getHours();
    if (hour >= 20) {
      result.streakAtRisk = true;
    }
  }

  return result;
}

/**
 * Calculate psychological value of goal streaks
 */
function calculateGoalStreakValue(totalStreakDays: number, goalCount: number): number {
  // Base value: 10 points per day per goal
  const baseValue = totalStreakDays * 10;

  // Multiplier for multiple active goals (commitment compound)
  const commitmentMultiplier = 1 + (goalCount - 1) * 0.2;

  // Streak length bonus (longer streaks are more valuable)
  const avgStreak = goalCount > 0 ? totalStreakDays / goalCount : 0;
  const lengthBonus = avgStreak >= 30 ? 2.0 : avgStreak >= 14 ? 1.5 : avgStreak >= 7 ? 1.25 : 1.0;

  return Math.round(baseValue * commitmentMultiplier * lengthBonus);
}

/**
 * Bind a covenant to a specific goal
 */
export async function bindCovenantToGoal(
  covenantId: string,
  goalId: string
): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .update({ covenant_id: covenantId })
    .eq('id', goalId);

  if (error) throw error;
}

/**
 * Record a goal-specific affirmation
 */
export async function recordGoalAffirmation(
  userId: string,
  goalId: string,
  statement: string,
  consecutiveDays: number
): Promise<IdentityAffirmation> {
  // Record the affirmation
  const { data, error } = await supabase
    .from('identity_affirmations')
    .insert({
      user_id: userId,
      goal_id: goalId,
      affirmation_type: 'goal_milestone',
      statement,
      streak_at_time: consecutiveDays,
      phase_at_time: 0,
      investment_at_time: 0,
    })
    .select()
    .single();

  if (error) throw error;

  // Mark goal as having affirmation
  await supabase
    .from('goals')
    .update({ has_affirmation: true })
    .eq('id', goalId);

  return data;
}

/**
 * Get all affirmations for a specific goal
 */
export async function getGoalAffirmations(goalId: string): Promise<IdentityAffirmation[]> {
  const { data, error } = await supabase
    .from('identity_affirmations')
    .select('*')
    .eq('goal_id', goalId)
    .order('affirmed_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Record when a goal streak breaks (for reflection)
 */
export async function recordGoalStreakBreak(
  userId: string,
  _goalId: string,
  streakLength: number,
  reason?: string
): Promise<void> {
  // Create a confession-like record for the streak break
  await supabase
    .from('confessions')
    .insert({
      user_id: userId,
      prompt: `My ${streakLength}-day streak on a goal just broke.`,
      response: reason || 'Streak broken without reflection.',
      source: 'journal',
    });

  // Record as a milestone if it was a significant streak
  if (streakLength >= 7) {
    await recordFirstMilestone(userId, 'first_streak_break', {
      streak: streakLength,
    });
  }
}

/**
 * Get the psychological cost of abandoning a goal
 */
export async function getGoalAbandonmentCost(goalId: string): Promise<{
  daysPursuing: number;
  totalCompletions: number;
  longestStreak: number;
  hasAffirmation: boolean;
  hasCovenant: boolean;
  psychologicalCost: number;
}> {
  const { data: goal, error } = await supabase
    .from('goals')
    .select('started_at, total_completions, longest_streak, has_affirmation, covenant_id')
    .eq('id', goalId)
    .single();

  if (error || !goal) {
    return {
      daysPursuing: 0,
      totalCompletions: 0,
      longestStreak: 0,
      hasAffirmation: false,
      hasCovenant: false,
      psychologicalCost: 0,
    };
  }

  const daysPursuing = Math.floor(
    (Date.now() - new Date(goal.started_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Calculate psychological cost
  let cost = 0;
  cost += daysPursuing * 5; // Days pursuing
  cost += goal.total_completions * 10; // Completions
  cost += goal.longest_streak * 15; // Best streak
  if (goal.has_affirmation) cost += 100; // Affirmation made
  if (goal.covenant_id) cost += 200; // Covenant bound

  return {
    daysPursuing,
    totalCompletions: goal.total_completions,
    longestStreak: goal.longest_streak,
    hasAffirmation: goal.has_affirmation,
    hasCovenant: !!goal.covenant_id,
    psychologicalCost: cost,
  };
}

// ============================================
// CONTENT PERMANENCE RATCHET
// ============================================

/**
 * Get the content permanence contribution to overall irreversibility.
 * Aggregates ratchet weights from all registered content permanence records.
 */
export async function getContentRatchetContribution(userId: string): Promise<number> {
  return getPermanenceRatchetScore(userId);
}
