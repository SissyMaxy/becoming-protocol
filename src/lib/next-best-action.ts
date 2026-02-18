/**
 * Next Best Action Engine
 *
 * Intelligently recommends the next action based on user state,
 * time of day, streaks, and engagement patterns.
 */

import { supabase } from './supabase';
import type { FeminizationDomain } from '../types/task-bank';

// ============================================
// TYPES
// ============================================

export type ActionType =
  | 'start_session'
  | 'complete_task'
  | 'morning_ritual'
  | 'reminder_check'
  | 'commitment_followup'
  | 'streak_maintenance'
  | 'anchor_practice'
  | 'voice_practice'
  | 'reflection'
  | 'rest';

export interface NextAction {
  type: ActionType;
  title: string;
  description: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  estimatedMinutes: number;
  reasoning: string;
  domain?: FeminizationDomain;
  actionData?: Record<string, unknown>;
}

export interface UserContext {
  userId: string;
  currentHour: number;
  denialDay: number;
  streakDays: number;
  tasksCompletedToday: number;
  lastSessionMinutes: number | null;
  lastActivityMinutes: number | null;
  hasOverdueCommitments: boolean;
  arousalLevel: number;
  isLocked: boolean;
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Get the next best action for the user based on current context
 */
export async function getNextBestAction(userId: string): Promise<NextAction> {
  const context = await buildUserContext(userId);
  const actions = await generateCandidateActions(context);

  // Score and rank actions
  const scoredActions = actions.map(action => ({
    action,
    score: scoreAction(action, context),
  }));

  scoredActions.sort((a, b) => b.score - a.score);

  return scoredActions[0]?.action || getDefaultAction(context);
}

/**
 * Get top N recommended actions
 */
export async function getTopActions(userId: string, count: number = 3): Promise<NextAction[]> {
  const context = await buildUserContext(userId);
  const actions = await generateCandidateActions(context);

  const scoredActions = actions.map(action => ({
    action,
    score: scoreAction(action, context),
  }));

  scoredActions.sort((a, b) => b.score - a.score);

  return scoredActions.slice(0, count).map(sa => sa.action);
}

// ============================================
// CONTEXT BUILDING
// ============================================

async function buildUserContext(userId: string): Promise<UserContext> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Get denial state
  const { data: denialState } = await supabase
    .from('denial_state')
    .select('current_denial_day, is_locked, streak_days')
    .eq('user_id', userId)
    .maybeSingle();

  // Get today's arousal
  const { data: arousalPlan } = await supabase
    .from('daily_arousal_plans')
    .select('current_arousal_level')
    .eq('user_id', userId)
    .eq('plan_date', today)
    .maybeSingle();

  // Get tasks completed today
  const { count: tasksToday } = await supabase
    .from('task_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('completed_at', today);

  // Get last session
  const { data: lastSession } = await supabase
    .from('edge_sessions')
    .select('ended_at')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get last activity (any logged action)
  const { data: lastActivity } = await supabase
    .from('task_completions')
    .select('completed_at')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Check overdue commitments
  const { count: overdueCount } = await supabase
    .from('user_commitments')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('made_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  // Calculate minutes since last session/activity
  let lastSessionMinutes: number | null = null;
  if (lastSession?.ended_at) {
    lastSessionMinutes = Math.floor((Date.now() - new Date(lastSession.ended_at).getTime()) / 60000);
  }

  let lastActivityMinutes: number | null = null;
  if (lastActivity?.completed_at) {
    lastActivityMinutes = Math.floor((Date.now() - new Date(lastActivity.completed_at).getTime()) / 60000);
  }

  return {
    userId,
    currentHour: now.getHours(),
    denialDay: denialState?.current_denial_day || 0,
    streakDays: denialState?.streak_days || 0,
    tasksCompletedToday: tasksToday || 0,
    lastSessionMinutes,
    lastActivityMinutes,
    hasOverdueCommitments: (overdueCount || 0) > 0,
    arousalLevel: arousalPlan?.current_arousal_level || 0,
    isLocked: denialState?.is_locked || false,
  };
}

// ============================================
// ACTION GENERATION
// ============================================

async function generateCandidateActions(context: UserContext): Promise<NextAction[]> {
  const actions: NextAction[] = [];

  // Morning ritual (6am-10am, no tasks yet)
  if (context.currentHour >= 6 && context.currentHour <= 10 && context.tasksCompletedToday === 0) {
    actions.push({
      type: 'morning_ritual',
      title: 'Start Your Day',
      description: 'Begin with your morning affirmations and intention setting.',
      urgency: 'high',
      estimatedMinutes: 5,
      reasoning: 'Morning is the best time to set your intentions.',
    });
  }

  // Commitment follow-up (if overdue)
  if (context.hasOverdueCommitments) {
    actions.push({
      type: 'commitment_followup',
      title: 'Address Overdue Commitment',
      description: 'You have commitments that need attention.',
      urgency: 'critical',
      estimatedMinutes: 10,
      reasoning: 'Your aroused self made these promises. Honor them.',
    });
  }

  // Session recommendation (high arousal or long time since last)
  const hoursSinceSession = context.lastSessionMinutes !== null
    ? context.lastSessionMinutes / 60
    : 999;

  if (context.arousalLevel >= 5 || hoursSinceSession > 24) {
    const isHighArousal = context.arousalLevel >= 7;
    actions.push({
      type: 'start_session',
      title: isHighArousal ? 'Channel This Energy' : 'Edge Session',
      description: isHighArousal
        ? 'Your arousal is high. Use this vulnerability productively.'
        : 'Time for your daily session to maintain progress.',
      urgency: isHighArousal ? 'high' : 'medium',
      estimatedMinutes: 30,
      reasoning: isHighArousal
        ? `Arousal at ${context.arousalLevel}/10 - prime time for conditioning.`
        : `${Math.round(hoursSinceSession)} hours since last session.`,
    });
  }

  // Task completion (if few tasks today)
  if (context.tasksCompletedToday < 3) {
    actions.push({
      type: 'complete_task',
      title: 'Complete a Task',
      description: `You've completed ${context.tasksCompletedToday} tasks today.`,
      urgency: context.tasksCompletedToday === 0 ? 'high' : 'medium',
      estimatedMinutes: 10,
      reasoning: 'Daily tasks maintain your transformation momentum.',
    });
  }

  // Streak maintenance (evening check)
  if (context.currentHour >= 18 && context.currentHour <= 22) {
    if (context.streakDays > 0 && context.tasksCompletedToday < 2) {
      actions.push({
        type: 'streak_maintenance',
        title: 'Protect Your Streak',
        description: `${context.streakDays} day streak at risk!`,
        urgency: 'critical',
        estimatedMinutes: 15,
        reasoning: `Don't lose your ${context.streakDays} day streak.`,
      });
    }
  }

  // Voice practice (afternoon/evening)
  if (context.currentHour >= 14 && context.currentHour <= 20) {
    actions.push({
      type: 'voice_practice',
      title: 'Voice Practice',
      description: 'Spend a few minutes on your feminine voice.',
      urgency: 'low',
      estimatedMinutes: 10,
      domain: 'voice',
      reasoning: 'Your voice is key to your feminine expression.',
    });
  }

  // Anchor practice (if denial day 3+)
  if (context.denialDay >= 3) {
    actions.push({
      type: 'anchor_practice',
      title: 'Reinforce Your Anchors',
      description: 'Use your conditioning anchors to deepen your transformation.',
      urgency: 'medium',
      estimatedMinutes: 5,
      domain: 'conditioning',
      reasoning: `Day ${context.denialDay} denial makes you extra receptive.`,
    });
  }

  // Evening reflection (8pm-11pm)
  if (context.currentHour >= 20 && context.currentHour <= 23) {
    actions.push({
      type: 'reflection',
      title: 'Evening Reflection',
      description: 'Review your day and journal your thoughts.',
      urgency: 'low',
      estimatedMinutes: 10,
      reasoning: 'Reflection reinforces your progress.',
    });
  }

  // Rest recommendation (late night or lots of activity)
  if (context.currentHour >= 23 || context.currentHour < 6) {
    actions.push({
      type: 'rest',
      title: 'Rest Well',
      description: 'Sleep is important for your transformation journey.',
      urgency: 'medium',
      estimatedMinutes: 0,
      reasoning: 'Your body and mind need rest to integrate changes.',
    });
  }

  return actions;
}

// ============================================
// ACTION SCORING
// ============================================

function scoreAction(action: NextAction, context: UserContext): number {
  let score = 0;

  // Urgency base score
  const urgencyScores = { critical: 100, high: 70, medium: 40, low: 20 };
  score += urgencyScores[action.urgency];

  // Time-based bonuses
  if (action.type === 'morning_ritual' && context.currentHour <= 9) {
    score += 30; // Morning rituals best done early
  }

  if (action.type === 'start_session' && context.arousalLevel >= 6) {
    score += 25; // Sessions more valuable when aroused
  }

  if (action.type === 'reflection' && context.currentHour >= 20) {
    score += 15; // Reflection best in evening
  }

  // Streak protection is critical
  if (action.type === 'streak_maintenance') {
    score += context.streakDays * 2; // Longer streaks = more to lose
  }

  // Commitments are binding
  if (action.type === 'commitment_followup') {
    score += 50; // Always high priority
  }

  // Denial day bonuses
  if (context.denialDay >= 5 && action.type === 'anchor_practice') {
    score += 20; // High denial = good for conditioning
  }

  // Recent inactivity bonus
  if (context.lastActivityMinutes && context.lastActivityMinutes > 60 * 4) {
    if (action.type === 'complete_task' || action.type === 'start_session') {
      score += 15; // Been inactive, should do something
    }
  }

  return score;
}

// ============================================
// HELPERS
// ============================================

function getDefaultAction(context: UserContext): NextAction {
  // Fallback action if nothing specific is recommended
  if (context.currentHour >= 22 || context.currentHour < 6) {
    return {
      type: 'rest',
      title: 'Rest Well',
      description: 'Take care of yourself. Tomorrow brings new opportunities.',
      urgency: 'low',
      estimatedMinutes: 0,
      reasoning: 'Rest is part of the journey.',
    };
  }

  return {
    type: 'complete_task',
    title: 'Browse Your Tasks',
    description: 'Find something that calls to you.',
    urgency: 'low',
    estimatedMinutes: 10,
    reasoning: 'Small steps lead to big changes.',
  };
}

// ============================================
// ACTION EXECUTION HELPERS
// ============================================

export function getActionRoute(action: NextAction): string {
  switch (action.type) {
    case 'start_session':
      return '/sessions';
    case 'complete_task':
      return '/tasks';
    case 'morning_ritual':
      return '/morning';
    case 'commitment_followup':
      return '/commitments';
    case 'streak_maintenance':
      return '/tasks';
    case 'anchor_practice':
      return '/anchors';
    case 'voice_practice':
      return '/voice';
    case 'reflection':
      return '/journal';
    case 'rest':
      return '/'; // Stay on home
    default:
      return '/';
  }
}

export function getActionIcon(action: NextAction): string {
  switch (action.type) {
    case 'start_session':
      return 'Flame';
    case 'complete_task':
      return 'CheckSquare';
    case 'morning_ritual':
      return 'Sun';
    case 'commitment_followup':
      return 'AlertTriangle';
    case 'streak_maintenance':
      return 'Shield';
    case 'anchor_practice':
      return 'Anchor';
    case 'voice_practice':
      return 'Mic';
    case 'reflection':
      return 'BookOpen';
    case 'rest':
      return 'Moon';
    default:
      return 'Star';
  }
}

export function getUrgencyColor(urgency: NextAction['urgency']): string {
  switch (urgency) {
    case 'critical':
      return 'text-red-500';
    case 'high':
      return 'text-orange-500';
    case 'medium':
      return 'text-yellow-500';
    case 'low':
      return 'text-green-500';
    default:
      return 'text-gray-500';
  }
}
