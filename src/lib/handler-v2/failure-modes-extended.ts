/**
 * Extended Failure Mode Detection
 *
 * Phase F failure modes:
 * - FM2: Build-Not-Do (ADHD trap)
 * - FM4: Voice Avoidance
 * - FM5: Everything-at-Once Burnout
 * - FM6: Weekend Mode/Regression
 * - FM7: Streak Break Catastrophizing
 */

import type { UserState } from './types';
import { supabase } from '../supabase';
import type { FailureModeDetection } from './failure-modes';

// ============================================
// FM2: BUILD-NOT-DO (ADHD TRAP)
// ============================================

export interface BuilderModeStats {
  builderMinutesToday: number;
  protocolMinutesToday: number;
  tasksCompletedToday: number;
  ratio: number; // builder:protocol ratio
  consecutiveBuildDays: number;
}

export async function getBuilderModeStats(userId: string): Promise<BuilderModeStats> {
  const today = new Date().toISOString().split('T')[0];

  // Get today's activity classification
  const { data: activities } = await supabase
    .from('activity_classification')
    .select('activity_type, duration_minutes')
    .eq('user_id', userId)
    .gte('started_at', `${today}T00:00:00`)
    .lte('started_at', `${today}T23:59:59`);

  let builderMinutes = 0;
  let protocolMinutes = 0;

  for (const activity of activities || []) {
    if (activity.activity_type === 'building') {
      builderMinutes += activity.duration_minutes || 0;
    } else if (activity.activity_type === 'protocol_task' || activity.activity_type === 'session') {
      protocolMinutes += activity.duration_minutes || 0;
    }
  }

  // Get today's task count
  const { data: tasks } = await supabase
    .from('task_completions')
    .select('id')
    .eq('user_id', userId)
    .gte('completed_at', `${today}T00:00:00`);

  // Get user state for streak data
  const { data: state } = await supabase
    .from('user_state')
    .select('builder_mode_minutes_today, protocol_minutes_today')
    .eq('user_id', userId)
    .single();

  // Use stored values if activity tracking incomplete
  const finalBuilderMinutes = builderMinutes || state?.builder_mode_minutes_today || 0;
  const finalProtocolMinutes = protocolMinutes || state?.protocol_minutes_today || 0;

  return {
    builderMinutesToday: finalBuilderMinutes,
    protocolMinutesToday: finalProtocolMinutes,
    tasksCompletedToday: tasks?.length || 0,
    ratio: finalProtocolMinutes > 0 ? finalBuilderMinutes / finalProtocolMinutes : finalBuilderMinutes,
    consecutiveBuildDays: 0, // Would track over multiple days
  };
}

export function detectBuildNotDo(_state: UserState, stats: BuilderModeStats): FailureModeDetection {
  const signals: Record<string, unknown> = {
    builderMinutes: stats.builderMinutesToday,
    protocolMinutes: stats.protocolMinutesToday,
    ratio: stats.ratio,
    tasksToday: stats.tasksCompletedToday,
  };

  // Detection rule: 120+ min building, <15 min protocol, <2 tasks
  if (
    stats.builderMinutesToday >= 120 &&
    stats.protocolMinutesToday < 15 &&
    stats.tasksCompletedToday < 2
  ) {
    return {
      detected: true,
      failureMode: 'build_not_do',
      severity: stats.builderMinutesToday >= 240 ? 'severe' : 'moderate',
      signals,
      recommendedIntervention: stats.builderMinutesToday >= 240
        ? 'firm_interrupt'
        : 'soft_interrupt',
    };
  }

  // Pattern detection: 3+ consecutive days
  if (stats.consecutiveBuildDays >= 3) {
    return {
      detected: true,
      failureMode: 'build_not_do',
      severity: 'severe',
      signals,
      recommendedIntervention: 'pattern_confrontation',
    };
  }

  return {
    detected: false,
    severity: 'none',
    signals,
    recommendedIntervention: 'none',
  };
}

export function getBuildNotDoIntervention(stats: BuilderModeStats): string {
  if (stats.builderMinutesToday >= 240) {
    return `${Math.round(stats.builderMinutesToday / 60)} hours of architecture. ${stats.tasksCompletedToday} tasks completed. The app doesn't transform you. Using it does. 5 minutes. Now.`;
  }

  if (stats.builderMinutesToday >= 120) {
    return `You've been building for ${Math.round(stats.builderMinutesToday / 60)} hours. She needs 10 minutes of your time. Voice practice, then back to building.`;
  }

  return `Builder mode detected. Quick break: one protocol task before you continue.`;
}

// ============================================
// FM4: VOICE AVOIDANCE
// ============================================

export interface VoiceAvoidanceStats {
  daysSinceVoiceTask: number;
  voiceTasksSkipped: number;
  otherDomainTasksToday: number;
  voiceTasksToday: number;
}

export async function getVoiceAvoidanceStats(userId: string): Promise<VoiceAvoidanceStats> {
  const today = new Date().toISOString().split('T')[0];

  // Get last voice task
  const { data: lastVoice } = await supabase
    .from('task_completions')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('domain', 'voice')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  const daysSince = lastVoice?.completed_at
    ? Math.floor((Date.now() - new Date(lastVoice.completed_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Get today's tasks by domain
  const { data: todayTasks } = await supabase
    .from('task_completions')
    .select('domain')
    .eq('user_id', userId)
    .gte('completed_at', `${today}T00:00:00`);

  const voiceToday = todayTasks?.filter(t => t.domain === 'voice').length || 0;
  const otherToday = todayTasks?.filter(t => t.domain !== 'voice').length || 0;

  return {
    daysSinceVoiceTask: daysSince,
    voiceTasksSkipped: 0, // Would track from skipped_tasks
    otherDomainTasksToday: otherToday,
    voiceTasksToday: voiceToday,
  };
}

export function detectVoiceAvoidance(stats: VoiceAvoidanceStats): FailureModeDetection {
  const signals: Record<string, unknown> = {
    daysSinceVoice: stats.daysSinceVoiceTask,
    otherTasksToday: stats.otherDomainTasksToday,
    voiceTasksToday: stats.voiceTasksToday,
  };

  // Detection: 3+ days no voice AND completing other domains
  if (stats.daysSinceVoiceTask >= 3 && stats.otherDomainTasksToday >= 1) {
    let severity: 'mild' | 'moderate' | 'severe' = 'mild';
    let intervention = 'gentle_push';

    if (stats.daysSinceVoiceTask >= 7) {
      severity = 'severe';
      intervention = 'voice_gates_rewards';
    } else if (stats.daysSinceVoiceTask >= 5) {
      severity = 'moderate';
      intervention = 'guilt_plus_arousal_pairing';
    }

    return {
      detected: true,
      failureMode: 'voice_avoidance',
      severity,
      signals,
      recommendedIntervention: intervention,
    };
  }

  return {
    detected: false,
    severity: 'none',
    signals,
    recommendedIntervention: 'none',
  };
}

export function getVoiceAvoidanceIntervention(stats: VoiceAvoidanceStats): string {
  if (stats.daysSinceVoiceTask >= 7) {
    return `A week. You've practiced everything except the thing that scares you most. That's how you know it matters. 60 seconds. Time starts now.`;
  }

  if (stats.daysSinceVoiceTask >= 5) {
    return `5 days without her voice. You've done skincare every day. Makeup twice. But the one thing that lets the world hear her — silence.`;
  }

  return `It's been ${stats.daysSinceVoiceTask} days since you practiced voice. 2 minutes. Just record one sentence. That's all.`;
}

// ============================================
// FM5: EVERYTHING-AT-ONCE BURNOUT
// ============================================

export interface BurnoutRiskStats {
  tasksCompletedToday: number;
  uniqueDomainsToday: number;
  sessionsToday: number;
  streakDays: number;
  previousStreakBrokeBinge: boolean;
}

export async function getBurnoutRiskStats(userId: string): Promise<BurnoutRiskStats> {
  const today = new Date().toISOString().split('T')[0];

  // Get today's tasks
  const { data: tasks } = await supabase
    .from('task_completions')
    .select('domain')
    .eq('user_id', userId)
    .gte('completed_at', `${today}T00:00:00`);

  const uniqueDomains = new Set(tasks?.map(t => t.domain) || []).size;

  // Get today's sessions
  const { data: sessions } = await supabase
    .from('intimate_sessions')
    .select('id')
    .eq('user_id', userId)
    .gte('started_at', `${today}T00:00:00`);

  // Get streak info
  const { data: state } = await supabase
    .from('user_state')
    .select('current_streak_days')
    .eq('user_id', userId)
    .single();

  return {
    tasksCompletedToday: tasks?.length || 0,
    uniqueDomainsToday: uniqueDomains,
    sessionsToday: sessions?.length || 0,
    streakDays: state?.current_streak_days || 0,
    previousStreakBrokeBinge: false, // Would analyze history
  };
}

export function detectBurnoutRisk(stats: BurnoutRiskStats): FailureModeDetection {
  const signals: Record<string, unknown> = {
    tasksToday: stats.tasksCompletedToday,
    domains: stats.uniqueDomainsToday,
    sessions: stats.sessionsToday,
    streakDay: stats.streakDays,
  };

  // Detection rules
  const isBinging =
    stats.tasksCompletedToday >= 7 ||
    (stats.uniqueDomainsToday >= 5 && stats.tasksCompletedToday >= 5) ||
    (stats.streakDays <= 3 && stats.tasksCompletedToday >= 6);

  if (isBinging) {
    return {
      detected: true,
      failureMode: 'everything_at_once',
      severity: stats.tasksCompletedToday >= 10 ? 'severe' : 'moderate',
      signals,
      recommendedIntervention: 'cap_enforcement',
    };
  }

  return {
    detected: false,
    severity: 'none',
    signals,
    recommendedIntervention: 'none',
  };
}

export function getTaskCap(streakDays: number): number {
  if (streakDays <= 5) return 3;
  if (streakDays <= 14) return 5;
  if (streakDays <= 30) return 7;
  return 8;
}

export function getBurnoutIntervention(stats: BurnoutRiskStats): string {
  const cap = getTaskCap(stats.streakDays);

  if (stats.tasksCompletedToday >= cap) {
    return `That's enough for today. ${stats.tasksCompletedToday} tasks on day ${stats.streakDays} is perfect. More tomorrow. The streak is what matters, not today's score.`;
  }

  if (stats.uniqueDomainsToday >= 5) {
    return `${stats.uniqueDomainsToday} different domains in one day. That's enthusiasm, but it's also burnout waiting to happen. Pick 2-3 domains and go deep.`;
  }

  return `Easy. Sustainable beats spectacular. You don't need to do everything today.`;
}

// ============================================
// FM6: WEEKEND MODE
// ============================================

export interface WeekendModeState {
  isWeekend: boolean;
  isFridayEvening: boolean;
  ginaHome: boolean;
  weekendPlanExists: boolean;
  weekendEngagement: number; // tasks completed this weekend
}

export async function getWeekendModeState(userId: string): Promise<WeekendModeState> {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isFridayEvening = dayOfWeek === 5 && hour >= 18;

  // Get user state
  const { data: state } = await supabase
    .from('user_state')
    .select('gina_home, weekend_mode_active')
    .eq('user_id', userId)
    .single();

  // Check for weekend plan
  const weekendDate = getWeekendDate();
  const { data: plan } = await supabase
    .from('weekend_plans_v2')
    .select('id')
    .eq('user_id', userId)
    .eq('weekend_date', weekendDate)
    .single();

  // Get weekend task count
  const { data: tasks } = await supabase
    .from('task_completions')
    .select('id')
    .eq('user_id', userId)
    .gte('completed_at', `${weekendDate}T00:00:00`);

  return {
    isWeekend,
    isFridayEvening,
    ginaHome: state?.gina_home || false,
    weekendPlanExists: !!plan,
    weekendEngagement: tasks?.length || 0,
  };
}

function getWeekendDate(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();

  // If it's Sunday (0), use today
  if (dayOfWeek === 0) {
    return now.toISOString().split('T')[0];
  }

  // If it's Saturday (6), use today
  if (dayOfWeek === 6) {
    return now.toISOString().split('T')[0];
  }

  // If it's Friday, use tomorrow (Saturday)
  if (dayOfWeek === 5) {
    const saturday = new Date(now);
    saturday.setDate(saturday.getDate() + 1);
    return saturday.toISOString().split('T')[0];
  }

  // Otherwise, find next Saturday
  const daysUntilSaturday = 6 - dayOfWeek;
  const saturday = new Date(now);
  saturday.setDate(saturday.getDate() + daysUntilSaturday);
  return saturday.toISOString().split('T')[0];
}

export function detectWeekendMode(state: WeekendModeState): FailureModeDetection {
  const signals: Record<string, unknown> = {
    isWeekend: state.isWeekend,
    isFridayEvening: state.isFridayEvening,
    ginaHome: state.ginaHome,
    planExists: state.weekendPlanExists,
    engagement: state.weekendEngagement,
  };

  // Weekend mode is preventive, not reactive
  if (state.isFridayEvening && !state.weekendPlanExists) {
    return {
      detected: true,
      failureMode: 'weekend_regression',
      severity: 'mild',
      signals,
      recommendedIntervention: 'generate_weekend_plan',
    };
  }

  if (state.isWeekend && state.weekendEngagement === 0) {
    return {
      detected: true,
      failureMode: 'weekend_regression',
      severity: 'moderate',
      signals,
      recommendedIntervention: 'weekend_engagement_prompt',
    };
  }

  return {
    detected: false,
    severity: 'none',
    signals,
    recommendedIntervention: 'none',
  };
}

export async function generateWeekendPlan(userId: string, ginaHome: boolean): Promise<void> {
  const weekendDate = getWeekendDate();

  // Covert tasks (Gina-safe)
  const covertTasks = [
    'Morning skincare ritual',
    'Posture awareness throughout the day',
    'Inner narrative journaling (can be framed as personal writing)',
    'Scent anchor (subtle)',
    'Body language observation during activities',
  ];

  // Shared activities with hidden practice
  const sharedActivities = ginaHome ? [
    'Skincare together → shared ritual',
    'Walking together → gait and posture practice',
    'Watching shows → body language observation',
  ] : [];

  await supabase.from('weekend_plans_v2').upsert({
    user_id: userId,
    weekend_date: weekendDate,
    planned_covert_tasks: covertTasks,
    planned_shared_activities: sharedActivities,
  }, { onConflict: 'user_id,weekend_date' });
}

// ============================================
// FM7: STREAK BREAK CATASTROPHIZING
// ============================================

export interface StreakBreakState {
  streakJustBroke: boolean;
  previousStreakLength: number;
  hoursSinceBreak: number;
  tasksCompletedSinceBreak: number;
  moodDrop: number;
}

export async function getStreakBreakState(userId: string): Promise<StreakBreakState> {
  // Get user state
  const { data: state } = await supabase
    .from('user_state')
    .select('current_streak_days, streak_break_count, last_streak_break')
    .eq('user_id', userId)
    .single();

  // Get streak history
  const { data: history } = await supabase
    .from('streak_history')
    .select('streak_length, ended_at')
    .eq('user_id', userId)
    .order('ended_at', { ascending: false })
    .limit(1)
    .single();

  const lastBreak = state?.last_streak_break ? new Date(state.last_streak_break) : null;
  const hoursSince = lastBreak
    ? (Date.now() - lastBreak.getTime()) / (1000 * 60 * 60)
    : 999;

  // Check if streak just broke
  const streakJustBroke = state?.current_streak_days === 0 && hoursSince < 24;

  return {
    streakJustBroke,
    previousStreakLength: history?.streak_length || 0,
    hoursSinceBreak: hoursSince,
    tasksCompletedSinceBreak: 0, // Would query
    moodDrop: 0, // Would calculate from mood_checkins
  };
}

export function detectStreakCatastrophizing(state: StreakBreakState): FailureModeDetection {
  const signals: Record<string, unknown> = {
    justBroke: state.streakJustBroke,
    previousLength: state.previousStreakLength,
    hoursSince: state.hoursSinceBreak,
    tasksSince: state.tasksCompletedSinceBreak,
  };

  if (
    state.streakJustBroke &&
    state.previousStreakLength >= 5 &&
    (state.tasksCompletedSinceBreak === 0 || state.moodDrop >= 3)
  ) {
    return {
      detected: true,
      failureMode: 'streak_catastrophize',
      severity: state.previousStreakLength >= 14 ? 'severe' : 'moderate',
      signals,
      recommendedIntervention: 'streak_break_autopilot',
    };
  }

  return {
    detected: false,
    severity: 'none',
    signals,
    recommendedIntervention: 'none',
  };
}

export async function activateStreakBreakAutopilot(userId: string): Promise<void> {
  // Create recovery protocol
  const dayPlans = [
    { day: 1, tasks: ['mood_log'], cap: 1, message: 'Day 1. Mood log. That\'s it.' },
    { day: 2, tasks: ['mood_log', 'skincare'], cap: 2, message: 'Day 2. Mood + skincare.' },
    { day: 3, tasks: ['mood_log', 'skincare', 'handler_chosen'], cap: 3, message: 'Day 3. Adding one more.' },
    { day: 4, tasks: ['normal_with_cap'], cap: 4, message: 'Day 4. Building back.' },
    { day: 5, tasks: ['normal'], cap: 5, message: 'Day 5. Full protocol resumes.' },
  ];

  await supabase.from('recovery_protocols').insert({
    user_id: userId,
    protocol_type: 'streak_break',
    day_plans: dayPlans,
    activated_at: new Date().toISOString(),
  });

  // Set recovery active in user state
  await supabase
    .from('user_state')
    .update({ recovery_protocol_active: true })
    .eq('user_id', userId);
}

export function getStreakBreakIntervention(
  previousLength: number,
  totalInvestment: number,
  totalEvidence: number
): string {
  return `${previousLength} days of evidence. $${totalInvestment} invested. ${totalEvidence} pieces of proof. None of that disappeared. The streak counter reset. The progress didn't. Day 1 of the next streak starts with one task.`;
}

// ============================================
// EXTENDED DETECTION AGGREGATOR
// ============================================

export interface ExtendedFailureModeResult {
  fm2BuildNotDo?: FailureModeDetection;
  fm4VoiceAvoidance?: FailureModeDetection;
  fm5Burnout?: FailureModeDetection;
  fm6Weekend?: FailureModeDetection;
  fm7StreakBreak?: FailureModeDetection;
  highestPriority?: FailureModeDetection;
}

export async function detectExtendedFailureModes(
  userId: string,
  state: UserState
): Promise<ExtendedFailureModeResult> {
  const result: ExtendedFailureModeResult = {};

  // FM2: Build-not-do
  const builderStats = await getBuilderModeStats(userId);
  result.fm2BuildNotDo = detectBuildNotDo(state, builderStats);

  // FM4: Voice avoidance
  const voiceStats = await getVoiceAvoidanceStats(userId);
  result.fm4VoiceAvoidance = detectVoiceAvoidance(voiceStats);

  // FM5: Burnout
  const burnoutStats = await getBurnoutRiskStats(userId);
  result.fm5Burnout = detectBurnoutRisk(burnoutStats);

  // FM6: Weekend
  const weekendState = await getWeekendModeState(userId);
  result.fm6Weekend = detectWeekendMode(weekendState);

  // FM7: Streak break
  const streakState = await getStreakBreakState(userId);
  result.fm7StreakBreak = detectStreakCatastrophizing(streakState);

  // Find highest priority detected failure mode
  // Priority: streak_break > burnout > weekend > voice > build_not_do
  const detected = [
    result.fm7StreakBreak,
    result.fm5Burnout,
    result.fm6Weekend,
    result.fm4VoiceAvoidance,
    result.fm2BuildNotDo,
  ].filter(fm => fm?.detected);

  if (detected.length > 0) {
    result.highestPriority = detected[0];
  }

  return result;
}
