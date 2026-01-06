/**
 * Weekend Storage Layer
 *
 * Database operations for weekend activities, sessions, plans, and integration progress.
 */

import { supabase } from './supabase';
import type {
  WeekendActivity,
  WeekendSession,
  WeekendPlan,
  GinaIntegrationProgress,
  PlannedActivity,
  ActivityFeedback,
  WeekendActivityCategory,
  IntegrationLevel
} from '../types/weekend';
import {
  ALL_WEEKEND_ACTIVITIES,
  getActivityById as getLocalActivityById
} from '../data/weekend-activities';

// Get the current authenticated user's ID
async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('No authenticated user');
  }
  return user.id;
}

// Default integration progress
const createDefaultProgress = (): Omit<GinaIntegrationProgress, 'id' | 'userId' | 'updatedAt'> => ({
  currentLevel: 1,
  levelGinaFeminizing: 1,
  levelSharedActivities: 1,
  levelIntimacy: 1,
  levelSupport: 1,
  milestones: {},
  totalGinaFeminizingSessions: 0,
  totalSharedSessions: 0,
  totalIntimacySessions: 0,
  totalSupportSessions: 0,
  ginaAvgEngagement: 0,
  ginaInitiatedCount: 0,
  lockedActivities: []
});

// =====================================================
// Activities (read from local data, synced with DB)
// =====================================================

/**
 * Get all active weekend activities
 * Uses local data as source of truth
 */
export function getWeekendActivities(): WeekendActivity[] {
  return ALL_WEEKEND_ACTIVITIES.filter(a => a.active);
}

/**
 * Get activity by ID
 */
export function getActivityById(activityId: string): WeekendActivity | undefined {
  return getLocalActivityById(activityId);
}

/**
 * Get activities by category
 */
export function getActivitiesByCategory(category: WeekendActivityCategory): WeekendActivity[] {
  return ALL_WEEKEND_ACTIVITIES.filter(a => a.category === category && a.active);
}

/**
 * Get activities up to a certain integration level
 */
export function getActivitiesByMaxLevel(maxLevel: IntegrationLevel): WeekendActivity[] {
  return ALL_WEEKEND_ACTIVITIES.filter(a => a.integrationLevel <= maxLevel && a.active);
}

/**
 * Get activities for a specific time block
 */
export function getActivitiesForTimeBlock(
  timeBlock: 'morning' | 'afternoon' | 'evening',
  maxLevel: IntegrationLevel
): WeekendActivity[] {
  return ALL_WEEKEND_ACTIVITIES.filter(a =>
    a.active &&
    a.integrationLevel <= maxLevel &&
    (a.bestTime === timeBlock || a.bestTime === 'flexible')
  );
}

// =====================================================
// Sessions (logged activities)
// =====================================================

/**
 * Save a weekend session
 */
export async function saveWeekendSession(session: Omit<WeekendSession, 'id' | 'userId' | 'createdAt'>): Promise<WeekendSession> {
  const userId = await getAuthUserId();

  const dbSession = {
    user_id: userId,
    session_date: session.sessionDate,
    day_of_week: session.dayOfWeek,
    time_block: session.timeBlock,
    activity_id: session.activityId,
    started_at: session.startedAt,
    completed_at: session.completedAt,
    duration_minutes: session.durationMinutes,
    completed: session.completed,
    gina_participated: session.ginaParticipated,
    gina_initiated: session.ginaInitiated,
    gina_engagement_rating: session.ginaEngagementRating,
    feminization_rating: session.feminizationRating,
    connection_rating: session.connectionRating,
    enjoyment_rating: session.enjoymentRating,
    photos_captured: session.photosCaptured,
    notes: session.notes,
    gina_reactions: session.ginaReactions,
    what_worked: session.whatWorked,
    what_to_improve: session.whatToImprove,
    would_repeat: session.wouldRepeat,
    suggested_followup: session.suggestedFollowup
  };

  const { data, error } = await supabase
    .from('weekend_sessions')
    .upsert(dbSession, { onConflict: 'user_id,session_date,activity_id' })
    .select()
    .single();

  if (error) {
    console.error('Error saving weekend session:', error);
    throw error;
  }

  return mapDbSessionToApp(data);
}

/**
 * Get sessions for a specific weekend
 */
export async function getSessionsForWeekend(weekendStart: string): Promise<WeekendSession[]> {
  const userId = await getAuthUserId();

  // Weekend is Saturday and Sunday
  const saturday = weekendStart;
  const sundayDate = new Date(weekendStart);
  sundayDate.setDate(sundayDate.getDate() + 1);
  const sunday = sundayDate.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('weekend_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('session_date', [saturday, sunday])
    .order('session_date', { ascending: true });

  if (error) {
    console.error('Error fetching weekend sessions:', error);
    return [];
  }

  return (data || []).map(mapDbSessionToApp);
}

/**
 * Get sessions for today
 */
export async function getTodaySessions(): Promise<WeekendSession[]> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('weekend_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_date', today)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching today sessions:', error);
    return [];
  }

  return (data || []).map(mapDbSessionToApp);
}

/**
 * Get recent sessions
 */
export async function getRecentSessions(limit: number = 20): Promise<WeekendSession[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('weekend_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('session_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent sessions:', error);
    return [];
  }

  return (data || []).map(mapDbSessionToApp);
}

/**
 * Complete an activity with feedback
 */
export async function completeActivity(
  activityId: string,
  feedback: ActivityFeedback
): Promise<WeekendSession> {
  const today = new Date().toISOString().split('T')[0];
  const dayOfWeek = new Date().getDay();

  const session: Omit<WeekendSession, 'id' | 'userId' | 'createdAt'> = {
    sessionDate: today,
    dayOfWeek: dayOfWeek === 0 ? 'sunday' : 'saturday',
    timeBlock: getCurrentTimeBlock(),
    activityId,
    completedAt: new Date().toISOString(),
    completed: feedback.completed,
    ginaParticipated: feedback.ginaParticipated,
    ginaInitiated: feedback.ginaInitiated || false,
    ginaEngagementRating: feedback.ginaEngagementRating,
    feminizationRating: feedback.feminizationRating,
    connectionRating: feedback.connectionRating,
    enjoymentRating: feedback.enjoymentRating,
    photosCaptured: feedback.photosCaptured || 0,
    notes: feedback.notes,
    ginaReactions: feedback.ginaReactions,
    wouldRepeat: feedback.wouldRepeat ?? true
  };

  return saveWeekendSession(session);
}

// =====================================================
// Plans (weekend prescriptions)
// =====================================================

/**
 * Save a weekend plan
 */
export async function saveWeekendPlan(plan: Omit<WeekendPlan, 'id' | 'userId' | 'createdAt'>): Promise<void> {
  const userId = await getAuthUserId();

  const dbPlan = {
    user_id: userId,
    weekend_start: plan.weekendStart,
    saturday_activities: JSON.stringify(plan.saturdayActivities),
    sunday_activities: JSON.stringify(plan.sundayActivities),
    saturday_theme: plan.saturdayTheme,
    sunday_theme: plan.sundayTheme,
    weekend_focus: plan.weekendFocus,
    gina_involvement_level: plan.ginaInvolvementLevel,
    intimacy_goal: plan.intimacyGoal,
    feminization_focus: plan.feminizationFocus,
    stretch_activity: plan.stretchActivity ? JSON.stringify(plan.stretchActivity) : null,
    intimacy_suggestion: plan.intimacySuggestion ? JSON.stringify(plan.intimacySuggestion) : null,
    finalized: plan.finalized
  };

  const { error } = await supabase
    .from('weekend_plans')
    .upsert(dbPlan, { onConflict: 'user_id,weekend_start' });

  if (error) {
    console.error('Error saving weekend plan:', error);
    throw error;
  }
}

/**
 * Get the current weekend's plan
 */
export async function getCurrentWeekendPlan(): Promise<WeekendPlan | null> {
  const userId = await getAuthUserId();

  // Get this weekend's Saturday date
  const today = new Date();
  const dayOfWeek = today.getDay();
  let saturday: Date;

  if (dayOfWeek === 0) {
    // Sunday - Saturday was yesterday
    saturday = new Date(today);
    saturday.setDate(today.getDate() - 1);
  } else if (dayOfWeek === 6) {
    // Saturday - today
    saturday = today;
  } else {
    // Weekday - get next Saturday
    saturday = new Date(today);
    saturday.setDate(today.getDate() + (6 - dayOfWeek));
  }

  const weekendStart = saturday.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('weekend_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('weekend_start', weekendStart)
    .maybeSingle();

  if (error) {
    console.error('Error fetching weekend plan:', error);
    return null;
  }

  if (!data) return null;

  return mapDbPlanToApp(data);
}

/**
 * Get a weekend plan by date
 */
export async function getWeekendPlan(weekendStart: string): Promise<WeekendPlan | null> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('weekend_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('weekend_start', weekendStart)
    .maybeSingle();

  if (error) {
    console.error('Error fetching weekend plan:', error);
    return null;
  }

  if (!data) return null;

  return mapDbPlanToApp(data);
}

// =====================================================
// Integration Progress
// =====================================================

/**
 * Get Gina integration progress
 */
export async function getGinaIntegrationProgress(): Promise<GinaIntegrationProgress> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('gina_integration_progress')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching integration progress:', error);
  }

  if (!data) {
    // Return default progress
    return {
      id: '',
      userId,
      ...createDefaultProgress(),
      updatedAt: new Date().toISOString()
    };
  }

  return mapDbProgressToApp(data);
}

/**
 * Update integration progress
 */
export async function updateGinaIntegrationProgress(
  progress: Partial<GinaIntegrationProgress>
): Promise<void> {
  const userId = await getAuthUserId();

  const dbProgress: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString()
  };

  if (progress.currentLevel !== undefined) dbProgress.current_level = progress.currentLevel;
  if (progress.levelGinaFeminizing !== undefined) dbProgress.level_gina_feminizing = progress.levelGinaFeminizing;
  if (progress.levelSharedActivities !== undefined) dbProgress.level_shared_activities = progress.levelSharedActivities;
  if (progress.levelIntimacy !== undefined) dbProgress.level_intimacy = progress.levelIntimacy;
  if (progress.levelSupport !== undefined) dbProgress.level_support = progress.levelSupport;
  if (progress.lockedActivities !== undefined) dbProgress.locked_activities = progress.lockedActivities;

  const { error } = await supabase
    .from('gina_integration_progress')
    .upsert(dbProgress, { onConflict: 'user_id' });

  if (error) {
    console.error('Error updating integration progress:', error);
    throw error;
  }
}

/**
 * Record a milestone
 */
export async function recordMilestone(milestone: string): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase.rpc('record_gina_milestone', {
    p_user_id: userId,
    p_milestone: milestone
  });

  if (error) {
    console.error('Error recording milestone:', error);
    throw error;
  }
}

/**
 * Get completed activity IDs (for ratchet tracking)
 */
export async function getCompletedActivityIds(): Promise<string[]> {
  const progress = await getGinaIntegrationProgress();
  return progress.lockedActivities;
}

// =====================================================
// Helper Functions
// =====================================================

function getCurrentTimeBlock(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function mapDbSessionToApp(data: Record<string, unknown>): WeekendSession {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    sessionDate: data.session_date as string,
    dayOfWeek: data.day_of_week as 'saturday' | 'sunday',
    timeBlock: data.time_block as 'morning' | 'afternoon' | 'evening',
    activityId: data.activity_id as string,
    startedAt: data.started_at as string | undefined,
    completedAt: data.completed_at as string | undefined,
    durationMinutes: data.duration_minutes as number | undefined,
    completed: data.completed as boolean,
    ginaParticipated: data.gina_participated as boolean,
    ginaInitiated: data.gina_initiated as boolean,
    ginaEngagementRating: data.gina_engagement_rating as number | undefined,
    feminizationRating: data.feminization_rating as number | undefined,
    connectionRating: data.connection_rating as number | undefined,
    enjoymentRating: data.enjoyment_rating as number | undefined,
    photosCaptured: data.photos_captured as number,
    notes: data.notes as string | undefined,
    ginaReactions: data.gina_reactions as string | undefined,
    whatWorked: data.what_worked as string | undefined,
    whatToImprove: data.what_to_improve as string | undefined,
    wouldRepeat: data.would_repeat as boolean,
    suggestedFollowup: data.suggested_followup as string | undefined,
    createdAt: data.created_at as string
  };
}

function mapDbPlanToApp(data: Record<string, unknown>): WeekendPlan {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    weekendStart: data.weekend_start as string,
    saturdayActivities: typeof data.saturday_activities === 'string'
      ? JSON.parse(data.saturday_activities)
      : (data.saturday_activities as PlannedActivity[]) || [],
    sundayActivities: typeof data.sunday_activities === 'string'
      ? JSON.parse(data.sunday_activities)
      : (data.sunday_activities as PlannedActivity[]) || [],
    saturdayTheme: data.saturday_theme as string | undefined,
    sundayTheme: data.sunday_theme as string | undefined,
    weekendFocus: data.weekend_focus as string,
    ginaInvolvementLevel: data.gina_involvement_level as 'light' | 'moderate' | 'deep',
    intimacyGoal: data.intimacy_goal as string | undefined,
    feminizationFocus: data.feminization_focus as string[],
    stretchActivity: data.stretch_activity
      ? (typeof data.stretch_activity === 'string'
        ? JSON.parse(data.stretch_activity)
        : data.stretch_activity) as WeekendPlan['stretchActivity']
      : undefined,
    intimacySuggestion: data.intimacy_suggestion
      ? (typeof data.intimacy_suggestion === 'string'
        ? JSON.parse(data.intimacy_suggestion)
        : data.intimacy_suggestion) as WeekendPlan['intimacySuggestion']
      : undefined,
    createdAt: data.created_at as string,
    finalized: data.finalized as boolean
  };
}

function mapDbProgressToApp(data: Record<string, unknown>): GinaIntegrationProgress {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    currentLevel: data.current_level as IntegrationLevel,
    levelGinaFeminizing: data.level_gina_feminizing as IntegrationLevel,
    levelSharedActivities: data.level_shared_activities as IntegrationLevel,
    levelIntimacy: data.level_intimacy as IntegrationLevel,
    levelSupport: data.level_support as IntegrationLevel,
    milestones: {
      firstNailPainting: data.first_nail_painting as string | undefined,
      firstMakeup: data.first_makeup as string | undefined,
      firstFullMakeup: data.first_full_makeup as string | undefined,
      firstPhotoshoot: data.first_photoshoot as string | undefined,
      firstCageCheck: data.first_cage_check as string | undefined,
      firstDressedIntimacy: data.first_dressed_intimacy as string | undefined,
      firstRoleReversal: data.first_role_reversal as string | undefined,
      firstNameUsage: data.first_name_usage as string | undefined
    },
    totalGinaFeminizingSessions: data.total_gina_feminizing_sessions as number,
    totalSharedSessions: data.total_shared_sessions as number,
    totalIntimacySessions: data.total_intimacy_sessions as number,
    totalSupportSessions: data.total_support_sessions as number,
    ginaAvgEngagement: data.gina_avg_engagement as number,
    ginaInitiatedCount: data.gina_initiated_count as number,
    lockedActivities: data.locked_activities as string[],
    updatedAt: data.updated_at as string
  };
}
