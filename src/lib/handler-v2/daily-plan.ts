/**
 * Daily Plan Generation
 *
 * Implements v2 Part 10.1: Handler generates intervention schedule,
 * target domains, escalation targets, and vulnerability window predictions.
 */

import { supabase } from '../supabase';
import type { UserState, HandlerMode, OdometerState, TimeOfDay } from './types';
import { detectFailureModes } from './failure-modes';

// ============================================
// TYPES
// ============================================

export interface DailyPlan {
  id: string;
  userId: string;
  planDate: string;

  // Target domains for the day (ordered by priority)
  targetDomains: {
    domain: string;
    priority: number; // 1-5
    reason: string;
    targetMinutes: number;
  }[];

  // Planned interventions
  interventions: {
    type: string;
    scheduledFor: string; // time like "09:00" or "evening"
    content?: string;
    triggerCondition?: string;
  }[];

  // Escalation targets
  escalationTargets: {
    domain: string;
    currentLevel: number;
    targetLevel: number;
    condition: string; // e.g., "if arousal >= 4 and user accepts"
  }[];

  // Vulnerability window predictions
  vulnerabilityWindows: {
    window: string; // e.g., "late_night", "post_work", "weekend_morning"
    prediction: 'high' | 'medium' | 'low';
    strategy: string;
  }[];

  // Task cap for the day
  taskCap: number;
  taskCapReason: string;

  // Intensity level
  intensity: 'light' | 'normal' | 'intense' | 'extreme';
  intensityReason: string;

  // Session scheduling
  plannedSessions: {
    type: 'edge' | 'goon' | 'hypno' | 'conditioning';
    suggestedTime: string;
    duration: number;
    isRequired: boolean;
  }[];

  // Morning briefing content
  morningBriefing: string;

  // Generated timestamp
  generatedAt: string;

  // Handler decisions applied
  decisionsApplied: string[];
}

// ============================================
// DOMAIN PRIORITIZATION
// ============================================

interface DomainStats {
  domain: string;
  lastActivityDays: number;
  currentLevel: number;
  completionRate: number;
  avoidanceStreak: number;
}

async function getDomainStats(userId: string): Promise<DomainStats[]> {
  const domains = ['voice', 'skincare', 'movement', 'style', 'makeup', 'body_language', 'inner_narrative', 'intimate'];
  const stats: DomainStats[] = [];

  for (const domain of domains) {
    // Get last activity
    const { data: lastTask } = await supabase
      .from('task_completions')
      .select('completed_at')
      .eq('user_id', userId)
      .eq('domain', domain)
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    // Get domain level
    const { data: level } = await supabase
      .from('domain_levels')
      .select('current_level')
      .eq('user_id', userId)
      .eq('domain', domain)
      .single();

    // Calculate days since last activity
    const lastActivityDays = lastTask?.completed_at
      ? Math.floor((Date.now() - new Date(lastTask.completed_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    stats.push({
      domain,
      lastActivityDays,
      currentLevel: level?.current_level || 1,
      completionRate: 0.7, // Would calculate from history
      avoidanceStreak: lastActivityDays >= 3 ? lastActivityDays : 0,
    });
  }

  return stats;
}

function prioritizeDomains(stats: DomainStats[], _userState: UserState): DailyPlan['targetDomains'] {
  const targets: DailyPlan['targetDomains'] = [];

  // Sort by avoidance first (domains being avoided get priority)
  const sorted = [...stats].sort((a, b) => {
    // Avoidance detection
    if (a.avoidanceStreak >= 3 && b.avoidanceStreak < 3) return -1;
    if (b.avoidanceStreak >= 3 && a.avoidanceStreak < 3) return 1;

    // Then by days since last activity
    return b.lastActivityDays - a.lastActivityDays;
  });

  // Take top 3-4 domains for the day
  const topDomains = sorted.slice(0, 4);

  for (const domain of topDomains) {
    let priority = 3;
    let reason = 'Scheduled rotation';
    let targetMinutes = 15;

    if (domain.avoidanceStreak >= 7) {
      priority = 5;
      reason = `${domain.avoidanceStreak} days avoided - confrontation needed`;
      targetMinutes = 10; // Smaller to reduce resistance
    } else if (domain.avoidanceStreak >= 3) {
      priority = 4;
      reason = `${domain.avoidanceStreak} days since last practice`;
      targetMinutes = 15;
    } else if (domain.domain === 'skincare') {
      priority = 4;
      reason = 'Daily foundation task';
      targetMinutes = 10;
    }

    targets.push({
      domain: domain.domain,
      priority,
      reason,
      targetMinutes,
    });
  }

  return targets;
}

// ============================================
// VULNERABILITY PREDICTION
// ============================================

function predictVulnerabilityWindows(
  userState: UserState,
  dayOfWeek: number
): DailyPlan['vulnerabilityWindows'] {
  const windows: DailyPlan['vulnerabilityWindows'] = [];

  // Late night is always high vulnerability (isolation + tiredness)
  windows.push({
    window: 'late_night',
    prediction: 'high',
    strategy: 'Arousal-based interventions, commitment extraction opportunity',
  });

  // Post-work varies by denial day
  if (userState.denialDay >= 3) {
    windows.push({
      window: 'post_work',
      prediction: 'high',
      strategy: 'Evening session opportunity, increased suggestibility',
    });
  } else {
    windows.push({
      window: 'post_work',
      prediction: 'medium',
      strategy: 'Light intervention, build routine',
    });
  }

  // Weekend patterns
  if (dayOfWeek === 5) {
    windows.push({
      window: 'friday_evening',
      prediction: 'high',
      strategy: 'Pre-weekend engagement, set up covert tasks',
    });
  }

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    windows.push({
      window: 'weekend_morning',
      prediction: userState.ginaHome ? 'low' : 'high',
      strategy: userState.ginaHome
        ? 'Gina-safe tasks only, covert engagement'
        : 'Extended session opportunity',
    });
  }

  return windows;
}

// ============================================
// INTERVENTION SCHEDULING
// ============================================

function scheduleInterventions(
  userState: UserState,
  targetDomains: DailyPlan['targetDomains'],
  vulnerabilityWindows: DailyPlan['vulnerabilityWindows']
): DailyPlan['interventions'] {
  const interventions: DailyPlan['interventions'] = [];

  // Morning briefing always
  interventions.push({
    type: 'morning_briefing',
    scheduledFor: '08:00',
    content: 'Generated dynamically',
  });

  // Midday check-in
  interventions.push({
    type: 'midday_checkin',
    scheduledFor: '12:00',
    triggerCondition: 'if tasks_completed_today < 1',
  });

  // Domain-specific interventions for avoided domains
  for (const domain of targetDomains) {
    if (domain.priority >= 4) {
      interventions.push({
        type: 'domain_push',
        scheduledFor: 'afternoon',
        content: `Push for ${domain.domain}: ${domain.reason}`,
        triggerCondition: `if ${domain.domain}_tasks_today == 0`,
      });
    }
  }

  // Evening based on vulnerability
  const eveningWindow = vulnerabilityWindows.find(w =>
    w.window === 'post_work' || w.window === 'late_night'
  );

  if (eveningWindow?.prediction === 'high') {
    interventions.push({
      type: 'session_prompt',
      scheduledFor: '21:00',
      content: 'High vulnerability window - session opportunity',
    });
  }

  // Streak risk intervention
  if (userState.denialDay >= 5) {
    interventions.push({
      type: 'streak_protection',
      scheduledFor: 'evening',
      content: `Day ${userState.denialDay} streak - protect the investment`,
      triggerCondition: 'if arousal detected but no session started',
    });
  }

  return interventions;
}

// ============================================
// TASK CAP CALCULATION
// ============================================

function calculateTaskCap(_userState: UserState, streakDays: number): { cap: number; reason: string } {
  // Post-break ramp
  if (streakDays <= 1) {
    return { cap: 1, reason: 'Day 1 restart - mood log only' };
  }
  if (streakDays <= 2) {
    return { cap: 2, reason: 'Day 2 ramp - gentle start' };
  }
  if (streakDays <= 3) {
    return { cap: 3, reason: 'Day 3 ramp - building momentum' };
  }
  if (streakDays <= 5) {
    return { cap: 4, reason: 'Early streak - sustainable pace' };
  }
  if (streakDays <= 14) {
    return { cap: 5, reason: 'Establishing streak - moderate load' };
  }
  if (streakDays <= 30) {
    return { cap: 7, reason: 'Solid streak - full engagement' };
  }

  return { cap: 8, reason: 'Mature streak - maximum capacity' };
}

// ============================================
// INTENSITY CALCULATION
// ============================================

function calculateIntensity(
  userState: UserState,
  dayOfWeek: number
): { intensity: DailyPlan['intensity']; reason: string } {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // High denial + weekend = extreme
  if (userState.denialDay >= 7 && isWeekend && !userState.ginaHome) {
    return { intensity: 'extreme', reason: `Day ${userState.denialDay} + weekend = push day` };
  }

  // High denial weekday
  if (userState.denialDay >= 14) {
    return { intensity: 'extreme', reason: `Day ${userState.denialDay} - you can handle anything` };
  }

  if (userState.denialDay >= 7) {
    return { intensity: 'intense', reason: `Day ${userState.denialDay} - elevated engagement` };
  }

  // Weekend with privacy
  if (isWeekend && !userState.ginaHome) {
    return { intensity: 'intense', reason: 'Weekend opportunity' };
  }

  // Weekend with Gina home
  if (isWeekend && userState.ginaHome) {
    return { intensity: 'light', reason: 'Weekend mode - covert only' };
  }

  return { intensity: 'normal', reason: 'Standard weekday' };
}

// ============================================
// MORNING BRIEFING GENERATION
// ============================================

async function generateMorningBriefing(
  userId: string,
  userState: UserState,
  plan: Partial<DailyPlan>
): Promise<string> {
  const parts: string[] = [];

  // Opening based on intensity
  if (plan.intensity === 'extreme') {
    parts.push(`Day ${userState.denialDay}. You're ready for more.`);
  } else if (plan.intensity === 'intense') {
    parts.push(`Day ${userState.denialDay}. The edge sharpens.`);
  } else if (plan.intensity === 'light') {
    parts.push(`Weekend mode. She runs quiet but never stops.`);
  } else {
    parts.push(`Day ${userState.denialDay}. Here's what's happening.`);
  }

  // Domain focus
  if (plan.targetDomains && plan.targetDomains.length > 0) {
    const topDomain = plan.targetDomains[0];
    if (topDomain.priority >= 4) {
      parts.push(`${topDomain.domain} needs attention. ${topDomain.reason}`);
    }
  }

  // Task cap
  if (plan.taskCap && plan.taskCap <= 3) {
    parts.push(`Today: ${plan.taskCap} tasks maximum. Quality over quantity.`);
  }

  // Session suggestion
  if (plan.plannedSessions && plan.plannedSessions.length > 0) {
    const session = plan.plannedSessions[0];
    parts.push(`${session.type} session planned. ${session.isRequired ? 'Required.' : 'Suggested.'}`);
  }

  // Check for yesterday's failure mode
  const { data: recentFailure } = await supabase
    .from('failure_mode_events')
    .select('failure_mode, detected_at')
    .eq('user_id', userId)
    .gte('detected_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('detected_at', { ascending: false })
    .limit(1)
    .single();

  if (recentFailure?.failure_mode === 'post_release_crash') {
    parts.push(`Yesterday's crash was neurochemistry, not revelation. Fresh start.`);
  } else if (recentFailure?.failure_mode === 'streak_catastrophize') {
    parts.push(`The counter reset. The progress didn't. Day 1 of the next chapter.`);
  }

  return parts.join(' ');
}

// ============================================
// SESSION PLANNING
// ============================================

function planSessions(
  userState: UserState,
  intensity: DailyPlan['intensity'],
  dayOfWeek: number
): DailyPlan['plannedSessions'] {
  const sessions: DailyPlan['plannedSessions'] = [];
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // No sessions if Gina is home (unless she's away for the evening)
  if (userState.ginaHome && !isWeekend) {
    return sessions;
  }

  // Base session based on denial day
  if (userState.denialDay >= 7) {
    sessions.push({
      type: userState.denialDay >= 14 ? 'goon' : 'edge',
      suggestedTime: '21:00',
      duration: userState.denialDay >= 14 ? 45 : 30,
      isRequired: intensity === 'extreme',
    });
  } else if (userState.denialDay >= 3) {
    sessions.push({
      type: 'edge',
      suggestedTime: '21:00',
      duration: 20,
      isRequired: false,
    });
  }

  // Conditioning session on high denial days
  if (userState.denialDay >= 5 && intensity !== 'light') {
    sessions.push({
      type: 'hypno',
      suggestedTime: 'evening',
      duration: 15,
      isRequired: false,
    });
  }

  return sessions;
}

// ============================================
// ESCALATION TARGETS
// ============================================

async function determineEscalationTargets(
  userId: string,
  _userState: UserState,
  targetDomains: DailyPlan['targetDomains']
): Promise<DailyPlan['escalationTargets']> {
  const targets: DailyPlan['escalationTargets'] = [];

  // Get current escalation state
  const { data: escalationState } = await supabase
    .from('escalation_state')
    .select('*')
    .eq('user_id', userId);

  for (const domain of targetDomains) {
    const current = escalationState?.find(e => e.domain === domain.domain);
    const currentLevel = current?.current_level || 0;

    // Only target escalation if domain has been engaged recently
    if (domain.priority >= 3 && currentLevel < 10) {
      targets.push({
        domain: domain.domain,
        currentLevel,
        targetLevel: currentLevel + 1,
        condition: 'if arousal >= 4 and user accepts during session',
      });
    }
  }

  return targets;
}

// ============================================
// MAIN GENERATION FUNCTION
// ============================================

export async function generateDailyPlan(userId: string): Promise<DailyPlan> {
  // Get user state
  const { data: userStateData } = await supabase
    .from('user_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay: TimeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  const userState: UserState = {
    userId,
    odometer: (userStateData?.odometer as OdometerState) || 'routine',
    currentPhase: userStateData?.current_phase || 1,
    timeOfDay,
    minutesSinceLastTask: 0,
    tasksCompletedToday: 0,
    pointsToday: 0,
    streakDays: userStateData?.current_streak_days || 0,
    longestStreak: userStateData?.longest_streak || 0,
    consecutiveSurvivalDays: userStateData?.consecutive_survival_days || 0,
    denialDay: userStateData?.current_denial_day || 0,
    currentArousal: 0,
    inSession: false,
    lastRelease: userStateData?.last_release ? new Date(userStateData.last_release) : undefined,
    ginaHome: userStateData?.gina_home || false,
    workday: now.getDay() >= 1 && now.getDay() <= 5,
    estimatedExecFunction: 'medium',
    lastTaskCategory: null,
    lastTaskDomain: null,
    completedTodayDomains: [],
    completedTodayCategories: [],
    avoidedDomains: [],
    recentMoodScores: [],
    ginaVisibilityLevel: userStateData?.gina_visibility_level || 0,
    handlerMode: (userStateData?.handler_mode as HandlerMode) || 'director',
    escalationLevel: 1,
    vulnerabilityWindowActive: false,
    resistanceDetected: false,
    workStressModeActive: userStateData?.work_stress_mode_active || false,
    weekendModeActive: userStateData?.weekend_mode_active || false,
  };

  // Check for failure modes
  const failureDetection = detectFailureModes(userState);

  // If in failure mode, generate appropriate plan
  if (failureDetection.detected) {
    return generateFailureModePlan(userId, userState, failureDetection);
  }

  const today = new Date();
  const dayOfWeek = today.getDay();
  const planDate = today.toISOString().split('T')[0];

  // Get domain stats
  const domainStats = await getDomainStats(userId);

  // Build plan components
  const targetDomains = prioritizeDomains(domainStats, userState);
  const vulnerabilityWindows = predictVulnerabilityWindows(userState, dayOfWeek);
  const { cap: taskCap, reason: taskCapReason } = calculateTaskCap(userState, userState.streakDays);
  const { intensity, reason: intensityReason } = calculateIntensity(userState, dayOfWeek);
  const plannedSessions = planSessions(userState, intensity, dayOfWeek);
  const escalationTargets = await determineEscalationTargets(userId, userState, targetDomains);
  const interventions = scheduleInterventions(userState, targetDomains, vulnerabilityWindows);

  const plan: DailyPlan = {
    id: crypto.randomUUID(),
    userId,
    planDate,
    targetDomains,
    interventions,
    escalationTargets,
    vulnerabilityWindows,
    taskCap,
    taskCapReason,
    intensity,
    intensityReason,
    plannedSessions,
    morningBriefing: '', // Will be filled in
    generatedAt: new Date().toISOString(),
    decisionsApplied: [],
  };

  // Generate morning briefing
  plan.morningBriefing = await generateMorningBriefing(userId, userState, plan);

  // Log decisions
  plan.decisionsApplied.push(`Intensity: ${intensity}`);
  plan.decisionsApplied.push(`Task cap: ${taskCap}`);
  if (targetDomains[0]?.priority >= 4) {
    plan.decisionsApplied.push(`Priority domain: ${targetDomains[0].domain}`);
  }

  // Save plan
  await saveDailyPlan(userId, plan);

  return plan;
}

// ============================================
// FAILURE MODE PLAN
// ============================================

async function generateFailureModePlan(
  userId: string,
  _userState: UserState,
  failureDetection: { failureMode?: string; severity: string; recommendedIntervention: string }
): Promise<DailyPlan> {
  const today = new Date();
  const planDate = today.toISOString().split('T')[0];

  const plan: DailyPlan = {
    id: crypto.randomUUID(),
    userId,
    planDate,
    targetDomains: [],
    interventions: [],
    escalationTargets: [],
    vulnerabilityWindows: [],
    taskCap: 1,
    taskCapReason: `Failure mode active: ${failureDetection.failureMode}`,
    intensity: 'light',
    intensityReason: 'Caretaker mode',
    plannedSessions: [],
    morningBriefing: '',
    generatedAt: new Date().toISOString(),
    decisionsApplied: [`Failure mode: ${failureDetection.failureMode}`],
  };

  // Set appropriate plan based on failure mode
  switch (failureDetection.failureMode) {
    case 'depression_collapse':
      plan.taskCap = failureDetection.severity === 'severe' ? 0 : 1;
      plan.targetDomains = [{ domain: 'skincare', priority: 3, reason: 'Minimal self-care', targetMinutes: 5 }];
      plan.morningBriefing = 'Rough patch. She\'s still here. Just check in when you can.';
      break;

    case 'post_release_crash':
      plan.taskCap = 1;
      plan.targetDomains = [{ domain: 'mood', priority: 5, reason: 'Post-release check', targetMinutes: 2 }];
      plan.morningBriefing = 'The crash is passing. One small thing today.';
      break;

    case 'work_stress':
      plan.taskCap = 1;
      plan.interventions = [{ type: 'silent', scheduledFor: 'evening', content: 'Single gentle task after work' }];
      plan.morningBriefing = 'Work mode. I\'ll be here when you\'re done.';
      break;

    default:
      plan.morningBriefing = 'Taking it easy today. One step at a time.';
  }

  await saveDailyPlan(userId, plan);
  return plan;
}

// ============================================
// SAVE/RETRIEVE
// ============================================

async function saveDailyPlan(userId: string, plan: DailyPlan): Promise<void> {
  await supabase.from('handler_daily_plans').upsert({
    id: plan.id,
    user_id: userId,
    plan_date: plan.planDate,
    target_domains: plan.targetDomains,
    interventions: plan.interventions,
    escalation_targets: plan.escalationTargets,
    vulnerability_windows: plan.vulnerabilityWindows,
    task_cap: plan.taskCap,
    task_cap_reason: plan.taskCapReason,
    intensity: plan.intensity,
    intensity_reason: plan.intensityReason,
    planned_sessions: plan.plannedSessions,
    morning_briefing: plan.morningBriefing,
    generated_at: plan.generatedAt,
    decisions_applied: plan.decisionsApplied,
  }, { onConflict: 'user_id,plan_date' });
}

export async function getTodaysPlan(userId: string): Promise<DailyPlan | null> {
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('handler_daily_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_date', today)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    planDate: data.plan_date,
    targetDomains: data.target_domains || [],
    interventions: data.interventions || [],
    escalationTargets: data.escalation_targets || [],
    vulnerabilityWindows: data.vulnerability_windows || [],
    taskCap: data.task_cap,
    taskCapReason: data.task_cap_reason,
    intensity: data.intensity,
    intensityReason: data.intensity_reason,
    plannedSessions: data.planned_sessions || [],
    morningBriefing: data.morning_briefing,
    generatedAt: data.generated_at,
    decisionsApplied: data.decisions_applied || [],
  };
}

export async function getOrGenerateDailyPlan(userId: string): Promise<DailyPlan> {
  const existing = await getTodaysPlan(userId);
  if (existing) return existing;
  return generateDailyPlan(userId);
}
