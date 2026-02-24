// Goals Library
// Core logic for goal-based training system

import { supabase } from './supabase';
import { getTodayDate, getYesterdayDate, getLocalDateString } from './protocol';
import type {
  Goal,
  DailyGoalCompletion,
  GoalTemplate,
  DrillTemplate,
  GoalWithDrills,
  TodaysGoalWithDrills,
  GoalCompletionInput,
  DbGoal,
  DbDrill,
  DbDailyGoalCompletion,
  DbGoalTemplate,
  DbDrillTemplate,
  Domain,
} from '../types/goals';
import {
  dbGoalToGoal,
  dbDrillToDrill,
  dbCompletionToCompletion,
  dbGoalTemplateToTemplate,
  dbDrillTemplateToTemplate,
  DOMAIN_PRIORITY,
} from '../types/goals';

// ============================================
// GOAL QUERIES
// ============================================

/**
 * Get all active goals for a user with their drills (max 3 per goal)
 */
export async function getActiveGoals(userId: string): Promise<GoalWithDrills[]> {
  const { data: goals, error: goalsError } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('sort_order');

  if (goalsError) throw goalsError;
  if (!goals || goals.length === 0) return [];

  const goalIds = goals.map(g => g.id);

  const { data: drills, error: drillsError } = await supabase
    .from('drills')
    .select('*')
    .in('goal_id', goalIds)
    .eq('active', true)
    .order('sort_order');

  if (drillsError) throw drillsError;

  return (goals as DbGoal[]).map(dbGoal => ({
    ...dbGoalToGoal(dbGoal),
    drills: (drills as DbDrill[] || [])
      .filter(d => d.goal_id === dbGoal.id)
      .slice(0, 3)  // Max 3 drills per goal
      .map(dbDrillToDrill),
  }));
}

/**
 * Get all goals for a user (any status)
 */
export async function getAllGoals(userId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order');

  if (error) throw error;
  return (data as DbGoal[] || []).map(dbGoalToGoal);
}

/**
 * Get a single goal with its drills
 */
export async function getGoalWithDrills(goalId: string): Promise<GoalWithDrills | null> {
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (goalError) {
    if (goalError.code === 'PGRST116') return null;
    throw goalError;
  }

  const { data: drills, error: drillsError } = await supabase
    .from('drills')
    .select('*')
    .eq('goal_id', goalId)
    .eq('active', true)
    .order('sort_order');

  if (drillsError) throw drillsError;

  return {
    ...dbGoalToGoal(goal as DbGoal),
    drills: (drills as DbDrill[] || []).map(dbDrillToDrill),
  };
}

/**
 * Get today's goals with completion status and drills
 */
// Get current time window for filtering goals
function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export async function getTodaysGoals(userId: string): Promise<TodaysGoalWithDrills[]> {
  const today = getTodayDate();
  const currentTime = getTimeOfDay();

  // Get active goals
  const { data: goals, error: goalsError } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('sort_order');

  if (goalsError) throw goalsError;
  if (!goals || goals.length === 0) return [];

  const goalIds = goals.map(g => g.id);

  // Get drills and completions in parallel
  const [drillsResult, completionsResult] = await Promise.all([
    supabase
      .from('drills')
      .select('*')
      .in('goal_id', goalIds)
      .eq('active', true)
      .order('sort_order'),
    supabase
      .from('daily_goal_completions')
      .select('*')
      .eq('user_id', userId)
      .eq('completed_date', today)
      .in('goal_id', goalIds),
  ]);

  if (drillsResult.error) throw drillsResult.error;
  if (completionsResult.error) throw completionsResult.error;

  const drills = (drillsResult.data as DbDrill[]) || [];
  const completions = (completionsResult.data as DbDailyGoalCompletion[]) || [];
  const completionMap = new Map(completions.map(c => [c.goal_id, c]));

  const mappedGoals = (goals as DbGoal[]).map(dbGoal => {
    const goal = dbGoalToGoal(dbGoal);
    const completion = completionMap.get(goal.id);
    const goalDrills = drills
      .filter(d => d.goal_id === goal.id)
      .slice(0, 3)  // Max 3 drills per goal
      .map(dbDrillToDrill);
    const usedDrill = completion?.drill_id
      ? goalDrills.find(d => d.id === completion.drill_id)
      : null;

    const graduationProgress = goal.graduationThreshold > 0
      ? Math.min(100, Math.round((goal.consecutiveDays / goal.graduationThreshold) * 100))
      : 100;

    return {
      goalId: goal.id,
      goalName: goal.name,
      goalDomain: goal.domain,
      goalDescription: goal.description,
      consecutiveDays: goal.consecutiveDays,
      graduationThreshold: goal.graduationThreshold,
      graduationProgress,
      completedToday: !!completion,
      drillUsedId: completion?.drill_id || null,
      drillUsedName: usedDrill?.name || null,
      drills: goalDrills,
    };
  });

  // Filter by suitable times - exclude goals not suitable for current time of day
  // But always show goals that are already completed today (so user sees their progress)
  const timeFilteredGoals = mappedGoals.filter(g => {
    // Always show completed goals
    if (g.completedToday) return true;

    // Check time suitability from the source goal data
    const dbGoal = (goals as DbGoal[]).find(db => db.id === g.goalId);
    const suitableTimes = dbGoal?.suitable_times || ['any'];

    // 'any' or matching current time passes the filter
    return suitableTimes.includes('any') || suitableTimes.includes(currentTime);
  });

  // Filter out goals with zero drills (empty picker prevention)
  const withDrills = timeFilteredGoals.filter(g => g.drills.length > 0);
  if (withDrills.length < timeFilteredGoals.length) {
    console.warn(
      '[goals] Hiding goals with 0 drills:',
      timeFilteredGoals.filter(g => g.drills.length === 0).map(g => g.goalName)
    );
  }

  // STRENGTHENED: Sort by domain priority - arousal first, skincare last
  return withDrills.sort((a, b) => {
    const priorityA = a.goalDomain ? (DOMAIN_PRIORITY[a.goalDomain] ?? 99) : 99;
    const priorityB = b.goalDomain ? (DOMAIN_PRIORITY[b.goalDomain] ?? 99) : 99;
    return priorityA - priorityB;
  });
}

// ============================================
// GOAL MUTATIONS
// ============================================

/**
 * Complete a goal with a selected drill
 */
export async function completeGoal(input: GoalCompletionInput): Promise<DailyGoalCompletion> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const today = getTodayDate();

  // Insert completion
  const { data: completion, error: completionError } = await supabase
    .from('daily_goal_completions')
    .insert({
      user_id: user.id,
      goal_id: input.goalId,
      drill_id: input.drillId,
      completed_date: today,
      notes: input.notes || null,
      felt_good: input.feltGood ?? null,
    })
    .select()
    .single();

  if (completionError) throw completionError;

  // Update goal stats
  const { error: updateError } = await supabase
    .from('goals')
    .update({
      total_completions: supabase.rpc('increment', { x: 1 }),
      consecutive_days: supabase.rpc('increment', { x: 1 }),
    })
    .eq('id', input.goalId);

  // If the RPC method doesn't exist, do it manually
  if (updateError) {
    const { data: goal } = await supabase
      .from('goals')
      .select('consecutive_days, total_completions, longest_streak')
      .eq('id', input.goalId)
      .single();

    if (goal) {
      const newConsecutive = (goal.consecutive_days || 0) + 1;
      await supabase
        .from('goals')
        .update({
          consecutive_days: newConsecutive,
          total_completions: (goal.total_completions || 0) + 1,
          longest_streak: Math.max(goal.longest_streak || 0, newConsecutive),
        })
        .eq('id', input.goalId);
    }
  }

  return dbCompletionToCompletion(completion as DbDailyGoalCompletion);
}

/**
 * Abandon a goal with reason
 */
export async function abandonGoal(goalId: string, reason: string): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update({
      status: 'abandoned',
      abandoned_at: new Date().toISOString(),
      abandon_reason: reason,
    })
    .eq('id', goalId)
    .select()
    .single();

  if (error) throw error;
  return dbGoalToGoal(data as DbGoal);
}

/**
 * Pause a goal
 */
export async function pauseGoal(goalId: string): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
    })
    .eq('id', goalId)
    .select()
    .single();

  if (error) throw error;
  return dbGoalToGoal(data as DbGoal);
}

/**
 * Resume a paused goal
 */
export async function resumeGoal(goalId: string): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update({
      status: 'active',
      paused_at: null,
    })
    .eq('id', goalId)
    .select()
    .single();

  if (error) throw error;
  return dbGoalToGoal(data as DbGoal);
}

/**
 * Graduate a goal (mark as internalized)
 */
export async function graduateGoal(goalId: string): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update({
      status: 'graduated',
      graduated_at: new Date().toISOString(),
    })
    .eq('id', goalId)
    .select()
    .single();

  if (error) throw error;
  return dbGoalToGoal(data as DbGoal);
}

// ============================================
// STREAK MANAGEMENT
// ============================================

/**
 * Check and reset streaks for missed days
 * Should be called on app load
 */
export async function checkAndResetStreaks(userId: string): Promise<void> {
  const yesterdayStr = getYesterdayDate();

  // Get active goals with streaks
  const { data: goals, error: goalsError } = await supabase
    .from('goals')
    .select('id, consecutive_days')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('consecutive_days', 0);

  if (goalsError || !goals) return;

  // Get yesterday's completions
  const { data: completions, error: completionsError } = await supabase
    .from('daily_goal_completions')
    .select('goal_id')
    .eq('user_id', userId)
    .eq('completed_date', yesterdayStr);

  if (completionsError) return;

  const completedGoalIds = new Set((completions || []).map(c => c.goal_id));

  // Reset streaks for goals not completed yesterday
  const goalsToReset = goals.filter(g => !completedGoalIds.has(g.id));

  if (goalsToReset.length > 0) {
    await supabase
      .from('goals')
      .update({ consecutive_days: 0 })
      .in('id', goalsToReset.map(g => g.id));
  }
}

/**
 * Check if any goals should auto-graduate
 */
export async function checkForGraduations(userId: string): Promise<Goal[]> {
  const { data: goals, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error || !goals) return [];

  const graduatingGoals: Goal[] = [];

  for (const dbGoal of goals as DbGoal[]) {
    if (dbGoal.consecutive_days >= dbGoal.graduation_threshold) {
      const graduated = await graduateGoal(dbGoal.id);
      graduatingGoals.push(graduated);
    }
  }

  return graduatingGoals;
}

// ============================================
// TEMPLATES
// ============================================

/**
 * Get all goal templates
 */
export async function getGoalTemplates(): Promise<GoalTemplate[]> {
  const { data, error } = await supabase
    .from('goal_templates')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (error) throw error;
  return (data as DbGoalTemplate[] || []).map(dbGoalTemplateToTemplate);
}

/**
 * Get drill templates for a goal template
 */
export async function getDrillTemplates(goalTemplateId: string): Promise<DrillTemplate[]> {
  const { data, error } = await supabase
    .from('drill_templates')
    .select('*')
    .eq('goal_template_id', goalTemplateId)
    .order('sort_order');

  if (error) throw error;
  return (data as DbDrillTemplate[] || []).map(dbDrillTemplateToTemplate);
}

/**
 * Create a goal from a template
 */
export async function createGoalFromTemplate(templateId: string): Promise<GoalWithDrills> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get template
  const { data: template, error: templateError } = await supabase
    .from('goal_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (templateError) throw templateError;

  // Get drill templates (limit to 3)
  const { data: drillTemplates, error: drillError } = await supabase
    .from('drill_templates')
    .select('*')
    .eq('goal_template_id', templateId)
    .order('sort_order')
    .limit(3);

  if (drillError) throw drillError;

  // Create goal
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .insert({
      user_id: user.id,
      name: template.name,
      domain: template.domain,
      description: template.description,
      graduation_threshold: template.graduation_threshold,
      is_system_assigned: true,
    })
    .select()
    .single();

  if (goalError) throw goalError;

  // Create drills from templates
  const drillInserts = (drillTemplates as DbDrillTemplate[] || []).map(dt => ({
    goal_id: goal.id,
    name: dt.name,
    instruction: dt.instruction,
    estimated_minutes: dt.estimated_minutes,
    difficulty: dt.difficulty,
    category: dt.category,
    points: dt.points,
    affirmation: dt.affirmation,
    sort_order: dt.sort_order,
  }));

  const { data: drills, error: drillsError } = await supabase
    .from('drills')
    .insert(drillInserts)
    .select();

  if (drillsError) throw drillsError;

  return {
    ...dbGoalToGoal(goal as DbGoal),
    drills: (drills as DbDrill[] || []).map(dbDrillToDrill),
  };
}

// ============================================
// ANALYTICS / RECOMMENDATIONS
// ============================================

/**
 * Get domains the user hasn't practiced in X days
 */
export async function getDecayingDomains(userId: string, dayThreshold: number = 5): Promise<Domain[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - dayThreshold);
  const cutoffStr = getLocalDateString(cutoffDate);

  // Get recent completions grouped by domain
  const { data: recentCompletions, error } = await supabase
    .from('daily_goal_completions')
    .select('goals!inner(domain)')
    .eq('user_id', userId)
    .gte('completed_date', cutoffStr);

  if (error) throw error;

  const recentDomains = new Set(
    (recentCompletions || [])
      .map((c: { goals: { domain: string | null } | { domain: string | null }[] }) => {
        const goals = c.goals;
        if (Array.isArray(goals)) {
          return goals[0]?.domain;
        }
        return goals?.domain;
      })
      .filter(Boolean)
  );

  // STRENGTHENED: Prioritize arousal-based domains, skincare is last
  const allDomains: Domain[] = [
    'arousal', 'conditioning', 'chastity',  // Highest priority
    'mindset', 'identity',                   // Sissification
    'social',                                // Submission
    'movement', 'voice', 'style', 'skincare' // Lowest priority
  ];
  return allDomains.filter(d => !recentDomains.has(d));
}

/**
 * Get the overall streak (days with all goals completed)
 */
export async function getOverallStreak(userId: string): Promise<number> {
  // Get active goals count
  const { data: goals, error: goalsError } = await supabase
    .from('goals')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (goalsError || !goals || goals.length === 0) return 0;

  const goalCount = goals.length;
  const goalIds = goals.map(g => g.id);

  // Get completions for the last 365 days
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 365);

  const { data: completions, error: completionsError } = await supabase
    .from('daily_goal_completions')
    .select('completed_date, goal_id')
    .eq('user_id', userId)
    .in('goal_id', goalIds)
    .gte('completed_date', getLocalDateString(startDate))
    .order('completed_date', { ascending: false });

  if (completionsError || !completions) return 0;

  // Group by date
  const completionsByDate = new Map<string, Set<string>>();
  for (const c of completions) {
    if (!completionsByDate.has(c.completed_date)) {
      completionsByDate.set(c.completed_date, new Set());
    }
    completionsByDate.get(c.completed_date)!.add(c.goal_id);
  }

  // Count consecutive days where all goals were completed
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = getLocalDateString(checkDate);

    const completedGoals = completionsByDate.get(dateStr);
    if (completedGoals && completedGoals.size >= goalCount) {
      streak++;
    } else if (i > 0) {
      // Allow today to be incomplete, but break on any other incomplete day
      break;
    }
  }

  return streak;
}

/**
 * Count total goals completed today
 */
export async function getTodaysCompletionCount(userId: string): Promise<{ completed: number; total: number }> {
  const today = getTodayDate();

  const [goalsResult, completionsResult] = await Promise.all([
    supabase
      .from('goals')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase
      .from('daily_goal_completions')
      .select('goal_id')
      .eq('user_id', userId)
      .eq('completed_date', today),
  ]);

  const total = goalsResult.data?.length || 0;
  const completed = completionsResult.data?.length || 0;

  return { completed, total };
}

// ============================================
// GOAL INITIALIZATION FOR NEW USERS
// ============================================

/**
 * Initialize default goals for a new user
 * Called during onboarding or first app load
 */
export async function initializeDefaultGoals(userId: string): Promise<GoalWithDrills[]> {
  // Check if user already has goals
  const { data: existingGoals } = await supabase
    .from('goals')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (existingGoals && existingGoals.length > 0) {
    // User already has goals
    return [];
  }

  // Get recommended starting templates (pick 2-3 based on priority)
  const { data: templates } = await supabase
    .from('goal_templates')
    .select('id, name, priority')
    .eq('active', true)
    .order('priority', { ascending: false })
    .limit(3);

  if (!templates || templates.length === 0) {
    return [];
  }

  // Create goals from top templates
  const createdGoals: GoalWithDrills[] = [];

  for (const template of templates) {
    try {
      const goal = await createGoalFromTemplate(template.id);
      createdGoals.push(goal);
    } catch (error) {
      console.error(`Failed to create goal from template ${template.name}:`, error);
    }
  }

  return createdGoals;
}

/**
 * Get graduated goals for a user
 */
export async function getGraduatedGoals(userId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'graduated')
    .order('graduated_at', { ascending: false });

  if (error) throw error;
  return (data as DbGoal[] || []).map(dbGoalToGoal);
}

/**
 * Get abandoned goals for a user (for reflection)
 */
export async function getAbandonedGoals(userId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'abandoned')
    .order('abandoned_at', { ascending: false });

  if (error) throw error;
  return (data as DbGoal[] || []).map(dbGoalToGoal);
}

/**
 * Recommend goals based on user's history and decay
 */
export async function recommendGoals(userId: string): Promise<{
  template: GoalTemplate;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
}[]> {
  const recommendations: {
    template: GoalTemplate;
    reason: string;
    urgency: 'high' | 'medium' | 'low';
  }[] = [];

  // Get current active goals
  const { data: activeGoals } = await supabase
    .from('goals')
    .select('domain')
    .eq('user_id', userId)
    .eq('status', 'active');

  const activeDomains = new Set((activeGoals || []).map(g => g.domain).filter(Boolean));

  // Get decaying domains (not practiced recently)
  const decayingDomains = await getDecayingDomains(userId, 5);

  // Get all available templates
  const templates = await getGoalTemplates();

  // Recommend templates for decaying domains (high urgency)
  for (const domain of decayingDomains) {
    if (!activeDomains.has(domain)) {
      const template = templates.find(t => t.domain === domain);
      if (template) {
        recommendations.push({
          template,
          reason: `You haven't practiced ${domain} in 5+ days`,
          urgency: 'high',
        });
      }
    }
  }

  // Recommend templates for domains not yet explored (medium urgency)
  // STRENGTHENED: Prioritize arousal-based domains, skincare is last
  const allDomains: Domain[] = [
    'arousal', 'conditioning', 'chastity',  // Highest priority
    'mindset', 'identity',                   // Sissification
    'social',                                // Submission
    'movement', 'voice', 'style', 'skincare' // Lowest priority
  ];
  const exploredDomains = new Set([...activeDomains, ...decayingDomains]);

  for (const domain of allDomains) {
    if (!exploredDomains.has(domain)) {
      const template = templates.find(t => t.domain === domain);
      if (template) {
        recommendations.push({
          template,
          reason: `Start exploring ${domain}`,
          urgency: 'medium',
        });
      }
    }
  }

  return recommendations;
}

// ============================================
// STREAK RISK & POINTS CALCULATION
// ============================================

/**
 * Calculate psychological value of goal streaks at risk
 */
export function calculatePointsAtRisk(
  overallStreak: number,
  totalGoals: number,
  totalConsecutiveDays: number
): number {
  // Base value: 10 points per streak day
  const baseValue = overallStreak * 10;

  // Goal commitment multiplier (more goals = more valuable commitment)
  const commitmentMultiplier = 1 + (totalGoals - 1) * 0.2;

  // Streak length bonus (longer streaks are more valuable)
  const lengthBonus =
    overallStreak >= 30 ? 2.0 :
    overallStreak >= 14 ? 1.5 :
    overallStreak >= 7 ? 1.25 : 1.0;

  // Individual goal streak value
  const goalStreakValue = totalConsecutiveDays * 5;

  return Math.round((baseValue * commitmentMultiplier * lengthBonus) + goalStreakValue);
}

/**
 * Get hours remaining until midnight (day reset)
 */
export function getHoursRemainingToday(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msRemaining = midnight.getTime() - now.getTime();
  return Math.floor(msRemaining / (1000 * 60 * 60));
}

/**
 * Check for goals needing identity affirmation
 * Triggers at Day 10, 20, 30 milestones
 */
export async function getGoalNeedingAffirmation(userId: string): Promise<Goal | null> {
  const affirmationMilestones = [10, 20, 30];

  const { data: goals, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('has_affirmation', false);

  if (error || !goals || goals.length === 0) return null;

  // Find goal at a milestone that hasn't had an affirmation yet
  for (const dbGoal of goals as DbGoal[]) {
    for (const milestone of affirmationMilestones) {
      // Check if consecutive days just crossed the milestone
      if (dbGoal.consecutive_days === milestone) {
        return dbGoalToGoal(dbGoal);
      }
    }
  }

  return null;
}

/**
 * Check if any goal just reached an affirmation milestone
 * Returns the goal if found, null otherwise
 */
export async function checkAffirmationMilestone(
  _goalId: string,
  newConsecutiveDays: number
): Promise<boolean> {
  const affirmationMilestones = [10, 20, 30];
  return affirmationMilestones.includes(newConsecutiveDays);
}

/**
 * Get streak risk status for display
 */
export async function getStreakRiskStatus(userId: string): Promise<{
  incompleteGoals: number;
  totalGoals: number;
  currentStreak: number;
  pointsAtRisk: number;
  hoursRemaining: number;
  isAtRisk: boolean;
} | null> {
  const today = getTodayDate();

  // Get active goals
  const { data: goals, error: goalsError } = await supabase
    .from('goals')
    .select('id, consecutive_days')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (goalsError || !goals || goals.length === 0) return null;

  // Get today's completions
  const { data: completions, error: completionsError } = await supabase
    .from('daily_goal_completions')
    .select('goal_id')
    .eq('user_id', userId)
    .eq('completed_date', today)
    .in('goal_id', goals.map(g => g.id));

  if (completionsError) return null;

  const completedGoalIds = new Set((completions || []).map(c => c.goal_id));
  const incompleteGoals = goals.filter(g => !completedGoalIds.has(g.id)).length;
  const totalGoals = goals.length;

  // Calculate values
  const overallStreak = await getOverallStreak(userId);
  const totalConsecutiveDays = goals.reduce((sum, g) => sum + g.consecutive_days, 0);
  const pointsAtRisk = calculatePointsAtRisk(overallStreak, totalGoals, totalConsecutiveDays);
  const hoursRemaining = getHoursRemainingToday();

  // At risk if there are incomplete goals and we have a streak to lose
  const isAtRisk = incompleteGoals > 0 && (overallStreak > 0 || totalConsecutiveDays > 0);

  return {
    incompleteGoals,
    totalGoals,
    currentStreak: overallStreak,
    pointsAtRisk,
    hoursRemaining,
    isAtRisk,
  };
}

/**
 * Break all goal streaks (called when user misses completing all goals)
 * This is the consequence - all progress resets
 */
export async function breakAllStreaks(userId: string): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .update({ consecutive_days: 0 })
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('consecutive_days', 0);

  if (error) {
    console.error('Failed to break streaks:', error);
    throw error;
  }
}
