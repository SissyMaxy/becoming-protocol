// Denial Engine (Features 11 & 39)
// Variable reinforcement scheduling + Handler-controlled denial authority
// The user's arousal belongs to the Handler. Release eligibility is not a user decision.

import { supabase } from './supabase';
import { getActiveGates } from './compliance-gates';
import { getIgnoredSessionsThisCycle } from './handler-initiated-sessions';

// ===========================================
// TYPES
// ===========================================

export interface DenialCycle {
  id: string;
  userId: string;
  cycleStart: string;
  minimumDays: number;
  maximumDays: number;
  targetDay: number | null;      // Hidden from user
  actualReleaseDay: number | null;
  releaseEarned: boolean;
  engagementScore: number | null;
}

export interface EngagementMetrics {
  averageDepth: number;           // 1-10
  goalsHonored: number;
  tasksDeclined: number;
  sessionsCompleted: number;
  sessionsCompletedThisCycle: number;
  voicePracticeDays: number;
  reflectionsLogged: number;
}

export interface DenialAuthority {
  userId: string;
  cycleStart: string;
  handlerMinimum: number;         // Handler's chosen minimum (hidden)
  handlerMaximum: number;         // Handler's chosen maximum (hidden)
  releaseEligible: boolean;       // Handler's current determination
  releaseBlockedReasons: string[]; // Why she can't release (if any)
  earnedRelease: boolean;         // Has she actually earned it?
}

export interface ComplianceHistory {
  complianceRate: number;         // 0-1
  averageEngagementThisCycle: number;
  tasksDeclinedThisWeek: number;
  voicePracticeDaysSince: number;
  reflectionsLoggedThisCycle: number;
}

export interface ReleaseConditions {
  mustCompleteReflection: boolean;
  reflectionWindowSeconds: number;
  mustSayName: boolean;
  mustBeDressed: boolean;
  mustUseVoice: boolean;
  positionRequirement?: string;
  deviceRequirement?: string;
  recordingRequired: boolean;
  nextCycleMinimum: number;
}

// ===========================================
// VARIABLE REINFORCEMENT SCHEDULING (Feature 11)
// ===========================================

const MIN_DENIAL_DAYS = 3;
const MAX_DENIAL_DAYS = 10;

/**
 * Calculate release timing based on engagement, not calendar.
 * The user never sees the probability. She only sees "Not yet" or "You've earned this."
 */
export function calculateReleaseTiming(
  engagement: EngagementMetrics,
  currentCycleDay: number
): { eligible: boolean; probability: number } {
  if (currentCycleDay < MIN_DENIAL_DAYS) {
    return { eligible: false, probability: 0 };
  }

  if (currentCycleDay >= MAX_DENIAL_DAYS) {
    return { eligible: true, probability: 0.95 };
  }

  // Base probability increases with days
  let probability = ((currentCycleDay - MIN_DENIAL_DAYS) / (MAX_DENIAL_DAYS - MIN_DENIAL_DAYS)) * 0.5;

  // High engagement increases probability (reward genuine effort)
  if (engagement.averageDepth >= 8) probability += 0.15;
  if (engagement.goalsHonored >= 2) probability += 0.1;
  if (engagement.sessionsCompleted >= 3) probability += 0.1;

  // Low engagement decreases probability (can't coast)
  if (engagement.averageDepth < 5) probability -= 0.2;
  if (engagement.tasksDeclined >= 3) probability -= 0.15;

  // Voice practice bonus
  if (engagement.voicePracticeDays >= 3) probability += 0.1;

  return {
    eligible: currentCycleDay >= MIN_DENIAL_DAYS,
    probability: Math.max(0.05, Math.min(0.9, probability)),
  };
}

/**
 * Generate denial response - the user never sees the probability.
 */
export function generateDenialResponse(
  eligible: boolean,
  probability: number,
  denialDay: number
): { released: boolean; message: string } {
  if (!eligible) {
    return {
      released: false,
      message: `Day ${denialDay}. You're not even close. Keep going.`,
    };
  }

  // Roll the dice
  const released = Math.random() < probability;

  if (released) {
    return {
      released: true,
      message: `Day ${denialDay}. You've been so good. You've earned what comes next.`,
    };
  }

  return {
    released: false,
    message: `Day ${denialDay}. Not tonight. I know you're desperate. That's exactly where I want you. Tomorrow might be different. Or it might not.`,
  };
}

// ===========================================
// HANDLER-CONTROLLED DENIAL AUTHORITY (Feature 39)
// ===========================================

/**
 * Handler evaluates release eligibility DAILY.
 * Even when eligible, variable schedule determines if she actually earns it.
 */
export async function evaluateReleaseEligibility(
  userId: string,
  denialDay: number,
  engagement: EngagementMetrics,
  compliance: ComplianceHistory
): Promise<DenialAuthority> {
  const blockedReasons: string[] = [];

  // Calculate minimum based on behavior
  const minimum = calculateMinimum(compliance);

  // Minimum days not met
  if (denialDay < minimum) {
    blockedReasons.push(`Day ${denialDay} of minimum ${minimum}`);
  }

  // Compliance gates active
  const activeGates = await getActiveGates(userId);
  const releaseGates = activeGates.filter(g => g.blockedFeature === 'release_eligibility');
  if (releaseGates.length > 0) {
    blockedReasons.push('Compliance gate: unfulfilled Handler session');
  }

  // Ignored sessions this cycle
  const ignoredSessions = await getIgnoredSessionsThisCycle(userId);
  if (ignoredSessions > 0) {
    blockedReasons.push(`${ignoredSessions} ignored session(s) this cycle`);
  }

  // Voice avoidance
  if (compliance.voicePracticeDaysSince >= 3) {
    blockedReasons.push('Voice avoidance: 3+ days without practice');
  }

  // Not enough sessions completed this cycle
  if (engagement.sessionsCompletedThisCycle < Math.min(denialDay, 5)) {
    blockedReasons.push('Insufficient session engagement this cycle');
  }

  // Engagement quality too low
  if (compliance.averageEngagementThisCycle < 6) {
    blockedReasons.push('Average engagement below threshold');
  }

  const eligible = blockedReasons.length === 0 && denialDay >= minimum;

  // Even if eligible, Handler uses variable schedule
  const { probability } = calculateReleaseTiming(engagement, denialDay);
  const earned = eligible && Math.random() < probability;

  // Get current cycle start
  const { data: cycleData } = await supabase
    .from('denial_cycles')
    .select('cycle_start')
    .eq('user_id', userId)
    .order('cycle_start', { ascending: false })
    .limit(1)
    .single();

  return {
    userId,
    cycleStart: cycleData?.cycle_start || new Date().toISOString(),
    handlerMinimum: minimum,
    handlerMaximum: minimum + 5,
    releaseEligible: eligible,
    releaseBlockedReasons: blockedReasons,
    earnedRelease: earned,
  };
}

/**
 * The minimum itself adjusts based on behavior.
 */
function calculateMinimum(history: ComplianceHistory): number {
  let base = MIN_DENIAL_DAYS;

  // Good compliance shortens minimum
  if (history.complianceRate > 0.9) base -= 1;

  // Poor compliance extends minimum
  if (history.complianceRate < 0.7) base += 2;
  if (history.tasksDeclinedThisWeek >= 3) base += 1;

  return Math.max(2, Math.min(base, 10));
}

/**
 * Generate release conditions - release is never "free."
 */
export function generateReleaseConditions(
  denialDay: number,
  daysOnProtocol: number,
  voicePracticeHours: number,
  selfReferenceRatio: number,
  submissionDepth: string
): ReleaseConditions {
  return {
    mustCompleteReflection: true,
    reflectionWindowSeconds: 60,
    mustSayName: selfReferenceRatio < 0.5, // If she's not saying Maxy yet, require it
    mustBeDressed: true,
    mustUseVoice: voicePracticeHours >= 5, // Only if she's practiced enough
    positionRequirement: submissionDepth === 'eager' || submissionDepth === 'deep' ? 'kneeling' : undefined,
    deviceRequirement: undefined, // Could be set based on physical practice levels
    recordingRequired: daysOnProtocol >= 30, // After first month
    nextCycleMinimum: Math.max(MIN_DENIAL_DAYS, denialDay), // Next cycle at least as long
  };
}

// ===========================================
// DENIAL CYCLE MANAGEMENT
// ===========================================

/**
 * Start a new denial cycle.
 */
export async function startDenialCycle(userId: string): Promise<DenialCycle | null> {
  const { data, error } = await supabase
    .from('denial_cycles')
    .insert({
      user_id: userId,
      cycle_start: new Date().toISOString(),
      minimum_days: MIN_DENIAL_DAYS,
      maximum_days: MAX_DENIAL_DAYS,
      target_day: null,
      actual_release_day: null,
      release_earned: false,
      engagement_score: null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error starting denial cycle:', error);
    return null;
  }

  // Also update denial_state
  await supabase
    .from('denial_state')
    .upsert({
      user_id: userId,
      current_denial_day: 0,
      is_locked: true,
      lock_started_at: new Date().toISOString(),
    });

  return mapDbToCycle(data);
}

/**
 * Complete a denial cycle (release).
 */
export async function completeDenialCycle(
  userId: string,
  denialDay: number,
  earned: boolean,
  engagementScore: number
): Promise<boolean> {
  // Update current cycle
  const { error } = await supabase
    .from('denial_cycles')
    .update({
      actual_release_day: denialDay,
      release_earned: earned,
      engagement_score: engagementScore,
    })
    .eq('user_id', userId)
    .is('actual_release_day', null);

  if (error) {
    console.error('Error completing denial cycle:', error);
    return false;
  }

  // Update denial_state
  await supabase
    .from('denial_state')
    .update({
      current_denial_day: 0,
      is_locked: false,
      last_release_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return true;
}

/**
 * Increment denial day.
 */
export async function incrementDenialDay(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('denial_state')
    .select('current_denial_day')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error getting denial day:', error);
    return 0;
  }

  const newDay = (data?.current_denial_day || 0) + 1;

  await supabase
    .from('denial_state')
    .update({
      current_denial_day: newDay,
      total_denial_days: supabase.rpc('increment_total_denial', { user_id_param: userId }),
    })
    .eq('user_id', userId);

  return newDay;
}

/**
 * Extend denial minimum (punishment).
 */
export async function extendDenialMinimum(userId: string, additionalDays: number): Promise<boolean> {
  const { error } = await supabase
    .from('denial_cycles')
    .update({
      minimum_days: supabase.rpc('add_to_minimum', { days: additionalDays }),
    })
    .eq('user_id', userId)
    .is('actual_release_day', null);

  if (error) {
    console.error('Error extending denial minimum:', error);
    return false;
  }

  return true;
}

/**
 * Get current denial state.
 */
export async function getDenialState(userId: string): Promise<{
  denialDay: number;
  isLocked: boolean;
  lastRelease: string | null;
  longestStreak: number;
} | null> {
  const { data, error } = await supabase
    .from('denial_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error getting denial state:', error);
    return null;
  }

  return {
    denialDay: data.current_denial_day || 0,
    isLocked: data.is_locked || false,
    lastRelease: data.last_release_at,
    longestStreak: data.longest_streak || 0,
  };
}

/**
 * Get engagement metrics for variable schedule calculation.
 */
export async function getEngagementMetrics(userId: string): Promise<EngagementMetrics> {
  // Get session depth data
  const { data: sessionData } = await supabase
    .from('session_depth')
    .select('engagement_rating')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  const depths = (sessionData || []).map(s => s.engagement_rating || 5);
  const averageDepth = depths.length > 0
    ? depths.reduce((a, b) => a + b, 0) / depths.length
    : 5;

  // Get goals honored
  const { count: goalsHonored } = await supabase
    .from('goals')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('fulfilled', true)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Get tasks declined this week
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: tasksDeclined } = await supabase
    .from('resistance_costs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', 'declined_task')
    .gte('created_at', weekAgo);

  // Get sessions completed
  const { count: sessionsCompleted } = await supabase
    .from('session_depth')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Get cycle start for this-cycle metrics
  const { data: cycleData } = await supabase
    .from('denial_cycles')
    .select('cycle_start')
    .eq('user_id', userId)
    .order('cycle_start', { ascending: false })
    .limit(1)
    .single();

  const cycleStart = cycleData?.cycle_start || weekAgo;

  const { count: sessionsThisCycle } = await supabase
    .from('session_depth')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', cycleStart);

  // Get voice practice days
  const { count: voiceDays } = await supabase
    .from('voice_practice_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekAgo);

  // Get reflections logged
  const { count: reflections } = await supabase
    .from('post_release_captures')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', cycleStart);

  return {
    averageDepth,
    goalsHonored: goalsHonored || 0,
    tasksDeclined: tasksDeclined || 0,
    sessionsCompleted: sessionsCompleted || 0,
    sessionsCompletedThisCycle: sessionsThisCycle || 0,
    voicePracticeDays: voiceDays || 0,
    reflectionsLogged: reflections || 0,
  };
}

/**
 * Get compliance history for minimum calculation.
 */
export async function getComplianceHistory(userId: string): Promise<ComplianceHistory> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Calculate compliance rate from tasks
  const { count: completedTasks } = await supabase
    .from('task_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekAgo);

  const { count: assignedTasks } = await supabase
    .from('daily_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekAgo);

  const complianceRate = assignedTasks ? (completedTasks || 0) / assignedTasks : 1;

  // Get average engagement this cycle
  const { data: cycleData } = await supabase
    .from('denial_cycles')
    .select('cycle_start')
    .eq('user_id', userId)
    .order('cycle_start', { ascending: false })
    .limit(1)
    .single();

  const cycleStart = cycleData?.cycle_start || weekAgo;

  const { data: sessionData } = await supabase
    .from('session_depth')
    .select('engagement_rating')
    .eq('user_id', userId)
    .gte('created_at', cycleStart);

  const ratings = (sessionData || []).map(s => s.engagement_rating || 5);
  const avgEngagement = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : 5;

  // Tasks declined this week
  const { count: tasksDeclined } = await supabase
    .from('resistance_costs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', 'declined_task')
    .gte('created_at', weekAgo);

  // Voice practice - days since last
  const { data: voiceData } = await supabase
    .from('voice_practice_log')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const daysSinceVoice = voiceData
    ? Math.floor((Date.now() - new Date(voiceData.created_at).getTime()) / (24 * 60 * 60 * 1000))
    : 7;

  // Reflections this cycle
  const { count: reflections } = await supabase
    .from('narrative_reflections')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', cycleStart);

  return {
    complianceRate,
    averageEngagementThisCycle: avgEngagement,
    tasksDeclinedThisWeek: tasksDeclined || 0,
    voicePracticeDaysSince: daysSinceVoice,
    reflectionsLoggedThisCycle: reflections || 0,
  };
}

// ===========================================
// HELPERS
// ===========================================

function mapDbToCycle(db: Record<string, unknown>): DenialCycle {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    cycleStart: db.cycle_start as string,
    minimumDays: (db.minimum_days as number) || MIN_DENIAL_DAYS,
    maximumDays: (db.maximum_days as number) || MAX_DENIAL_DAYS,
    targetDay: db.target_day as number | null,
    actualReleaseDay: db.actual_release_day as number | null,
    releaseEarned: (db.release_earned as boolean) || false,
    engagementScore: db.engagement_score as number | null,
  };
}

export default {
  calculateReleaseTiming,
  generateDenialResponse,
  evaluateReleaseEligibility,
  generateReleaseConditions,
  startDenialCycle,
  completeDenialCycle,
  incrementDenialDay,
  extendDenialMinimum,
  getDenialState,
  getEngagementMetrics,
  getComplianceHistory,
};
