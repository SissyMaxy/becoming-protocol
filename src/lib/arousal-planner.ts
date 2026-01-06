/**
 * Arousal Planner - Daily Prescription Generation
 *
 * Auto-generates daily arousal plans based on current state, denial streak,
 * and chastity status. Includes edge sessions, check-ins, and milestones.
 */

import type { ArousalState } from '../types/arousal';
import type {
  PlannedEdgeSession,
  ArousalCheckIn,
  PrescriptionContext,
  TodaysPlanView,
  TimeBlock,
  SessionType,
  PlanIntensity,
  CheckInType,
  MilestoneType,
  DbDailyArousalPlan,
  DbPlannedEdgeSession,
  DbArousalCheckIn,
  DbChastityMilestone,
} from '../types/arousal-planner';
import {
  STATE_CONFIGS,
  TIME_BLOCK_CONFIG,
  dbPlanToPlan,
  dbSessionToSession,
  dbCheckInToCheckIn,
  dbMilestoneToMilestone,
} from '../types/arousal-planner';
import { supabase } from './supabase';
import { getTodayDate } from './protocol';

// ============================================
// DENIAL DAY MULTIPLIERS
// ============================================

interface DenialMultiplier {
  edgeMultiplier: number;
  durationMultiplier: number;
  intensityBoost: boolean;
}

function getDenialDayMultiplier(denialDays: number): DenialMultiplier {
  if (denialDays <= 2) {
    // Recovery phase
    return { edgeMultiplier: 1.0, durationMultiplier: 1.0, intensityBoost: false };
  } else if (denialDays <= 4) {
    // Building phase
    return { edgeMultiplier: 1.25, durationMultiplier: 1.1, intensityBoost: false };
  } else if (denialDays <= 7) {
    // Accelerating phase
    return { edgeMultiplier: 1.5, durationMultiplier: 1.25, intensityBoost: true };
  } else if (denialDays <= 14) {
    // Peak phase
    return { edgeMultiplier: 1.75, durationMultiplier: 1.5, intensityBoost: true };
  } else {
    // Maintenance phase (15+ days)
    return { edgeMultiplier: 1.5, durationMultiplier: 1.25, intensityBoost: false };
  }
}

// ============================================
// PLAN INTENSITY CALCULATION
// ============================================

function calculatePlanIntensity(
  state: ArousalState,
  denialDays: number,
  isLocked: boolean
): PlanIntensity {
  const stateConfig = STATE_CONFIGS[state];

  // Base intensity from state
  let intensity: PlanIntensity = 'moderate';

  if (stateConfig.intensity === 'gentle') {
    intensity = 'light';
  } else if (stateConfig.intensity === 'intense') {
    intensity = 'intense';
  }

  // Adjust based on denial days
  if (denialDays >= 8 && state === 'sweet_spot') {
    intensity = 'extreme';
  } else if (denialDays >= 5 && state === 'building') {
    intensity = 'intense';
  }

  // Chastity can increase intensity
  if (isLocked && intensity !== 'extreme') {
    const intensityOrder: PlanIntensity[] = ['light', 'moderate', 'intense', 'extreme'];
    const currentIndex = intensityOrder.indexOf(intensity);
    if (currentIndex < intensityOrder.length - 1) {
      intensity = intensityOrder[currentIndex + 1];
    }
  }

  // Cooldown states stay light
  if (state === 'overload' || state === 'post_release') {
    intensity = 'light';
  }

  return intensity;
}

// ============================================
// SESSION SCHEDULING
// ============================================

interface SessionPrescription {
  timeBlock: TimeBlock;
  scheduledTime: string;
  sessionType: SessionType;
  targetEdges: number;
  targetDurationMinutes: number;
  intensityLevel: 'gentle' | 'moderate' | 'intense';
  recommendedPatterns: string[];
  affirmationFocus?: string;
  specialInstructions?: string;
}

function generateSessionPrescriptions(
  context: PrescriptionContext
): SessionPrescription[] {
  const { currentState, denialDays, isChastityLocked, preferredSessionTimes, maxDailyEdges, includeNightSession } = context;
  const stateConfig = STATE_CONFIGS[currentState];
  const multiplier = getDenialDayMultiplier(denialDays);

  // Calculate number of sessions
  let sessionCount = stateConfig.maxSessions;

  // Adjust for chastity (locked = more controlled sessions)
  if (isChastityLocked && sessionCount > 1) {
    sessionCount = Math.max(1, sessionCount - 1); // Fewer but more intentional
  }

  // Determine time blocks to use
  let timeBlocks: TimeBlock[] = preferredSessionTimes || ['morning', 'afternoon', 'evening'];

  // Filter out night if not desired
  if (!includeNightSession) {
    timeBlocks = timeBlocks.filter(t => t !== 'night');
  }

  // Limit to session count
  timeBlocks = timeBlocks.slice(0, sessionCount);

  const sessions: SessionPrescription[] = [];

  for (let i = 0; i < timeBlocks.length; i++) {
    const timeBlock = timeBlocks[i];
    const blockConfig = TIME_BLOCK_CONFIG[timeBlock];

    // Calculate edges with multiplier
    const baseEdges = Math.floor(
      (stateConfig.edgesPerSession.min + stateConfig.edgesPerSession.max) / 2
    );
    let targetEdges = Math.round(baseEdges * multiplier.edgeMultiplier);

    // Cap at maxDailyEdges if specified (divide among sessions)
    if (maxDailyEdges) {
      const maxPerSession = Math.ceil(maxDailyEdges / timeBlocks.length);
      targetEdges = Math.min(targetEdges, maxPerSession);
    }

    // Calculate duration with multiplier
    const baseDuration = Math.floor(
      (stateConfig.durationMinutes.min + stateConfig.durationMinutes.max) / 2
    );
    const targetDuration = Math.round(baseDuration * multiplier.durationMultiplier);

    // Determine intensity
    let intensityLevel = stateConfig.intensity;
    if (multiplier.intensityBoost && intensityLevel !== 'intense') {
      intensityLevel = intensityLevel === 'gentle' ? 'moderate' : 'intense';
    }

    // Determine session type based on state and time
    let sessionType: SessionType = 'edge_training';
    if (currentState === 'sweet_spot' && i === timeBlocks.length - 1) {
      sessionType = 'goon'; // Evening sweet spot = goon session
    } else if (currentState === 'overload') {
      sessionType = 'maintenance'; // Cooldown maintenance
    } else if (stateConfig.primaryGoal === 'maintenance') {
      sessionType = 'maintenance';
    } else if (isChastityLocked && currentState === 'building') {
      sessionType = 'denial'; // Locked + building = denial training
    }

    // Generate patterns based on state
    const patterns = generatePatterns(currentState, sessionType, denialDays);

    // Affirmation focus
    const affirmationFocus = getAffirmationFocus(currentState, denialDays);

    sessions.push({
      timeBlock,
      scheduledTime: blockConfig.defaultTime,
      sessionType,
      targetEdges,
      targetDurationMinutes: targetDuration,
      intensityLevel,
      recommendedPatterns: patterns,
      affirmationFocus,
      specialInstructions: stateConfig.specialNote,
    });
  }

  return sessions;
}

function generatePatterns(state: ArousalState, sessionType: SessionType, denialDays: number): string[] {
  const patterns: string[] = [];

  // Base patterns by state
  switch (state) {
    case 'post_release':
    case 'recovery':
      patterns.push('slow_build', 'gentle_touch', 'breath_focus');
      break;
    case 'baseline':
      patterns.push('steady_rhythm', 'edge_hold', 'tension_release');
      break;
    case 'building':
      patterns.push('progressive_intensity', 'edge_riding', 'denial_affirmations');
      break;
    case 'sweet_spot':
      patterns.push('peak_riding', 'extended_edge', 'deep_submission');
      break;
    case 'overload':
      patterns.push('controlled_descent', 'calming_breath', 'grounding');
      break;
  }

  // Add session type specific patterns
  if (sessionType === 'goon') {
    patterns.push('mindless_stroking', 'porn_loop', 'verbal_degradation');
  } else if (sessionType === 'denial') {
    patterns.push('lock_focus', 'ownership_mantra', 'cage_awareness');
  }

  // Add denial day patterns
  if (denialDays >= 7) {
    patterns.push('desperate_edge', 'leak_encouragement');
  }

  return patterns.slice(0, 3); // Return top 3
}

function getAffirmationFocus(state: ArousalState, denialDays: number): string {
  if (state === 'sweet_spot') {
    return 'You belong in this state. This aching is your purpose.';
  } else if (state === 'building') {
    return 'Each edge builds your devotion. The ache makes you better.';
  } else if (state === 'overload') {
    return 'Control through release of control. Find your calm center.';
  } else if (denialDays >= 7) {
    return `Day ${denialDays} of denial. You were made for this.`;
  } else if (state === 'post_release') {
    return 'Rest and recover. The journey begins again.';
  }
  return 'Focus on sensation. Stay present in your body.';
}

// ============================================
// CHECK-IN SCHEDULING
// ============================================

interface CheckInPrescription {
  scheduledTime: string;
  checkInType: CheckInType;
}

function generateCheckInPrescriptions(
  context: PrescriptionContext
): CheckInPrescription[] {
  const { isChastityLocked, currentState } = context;
  const checkIns: CheckInPrescription[] = [];

  // Base check-ins: morning, midday, evening
  checkIns.push({ scheduledTime: '08:00', checkInType: 'morning' });
  checkIns.push({ scheduledTime: '13:00', checkInType: 'midday' });
  checkIns.push({ scheduledTime: '20:00', checkInType: 'evening' });

  // Add extra check-in if locked
  if (isChastityLocked) {
    checkIns.push({ scheduledTime: '16:00', checkInType: 'midday' });
  }

  // Add check-in if in overload (monitor for slip risk)
  if (currentState === 'overload') {
    checkIns.push({ scheduledTime: '22:00', checkInType: 'evening' });
  }

  // Sort by time
  checkIns.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  return checkIns;
}

// ============================================
// MILESTONE GENERATION
// ============================================

interface MilestonePrescription {
  milestoneType: MilestoneType;
  title: string;
  description?: string;
  targetValue?: number;
  targetState?: ArousalState;
  deadlineTime?: string;
  pointsValue: number;
}

function generateMilestonePrescriptions(
  context: PrescriptionContext,
  totalTargetEdges: number
): MilestonePrescription[] {
  const { isChastityLocked, currentState, denialDays } = context;
  const milestones: MilestonePrescription[] = [];

  // Stay locked milestone (if locked)
  if (isChastityLocked) {
    milestones.push({
      milestoneType: 'stay_locked',
      title: 'Stay Locked All Day',
      description: 'Maintain chastity from morning to bedtime',
      deadlineTime: '23:59',
      pointsValue: 25,
    });
  }

  // Edge count milestone
  if (totalTargetEdges > 0) {
    milestones.push({
      milestoneType: 'edge_count',
      title: `Reach ${totalTargetEdges} Edges`,
      description: `Complete your daily edge target`,
      targetValue: totalTargetEdges,
      pointsValue: 15,
    });
  }

  // Maintain state milestone (if in sweet spot)
  if (currentState === 'sweet_spot') {
    milestones.push({
      milestoneType: 'maintain_state',
      title: 'Maintain Sweet Spot',
      description: 'Stay in sweet spot without slipping into overload',
      targetState: 'sweet_spot',
      pointsValue: 30,
    });
  }

  // Denial day milestone
  const nextMilestoneDay = getNextDenialMilestone(denialDays);
  if (nextMilestoneDay && nextMilestoneDay === denialDays + 1) {
    milestones.push({
      milestoneType: 'denial_day',
      title: `Day ${nextMilestoneDay} of Denial`,
      description: `Reach ${nextMilestoneDay} days without release`,
      targetValue: nextMilestoneDay,
      pointsValue: nextMilestoneDay >= 14 ? 50 : nextMilestoneDay >= 7 ? 30 : 20,
    });
  }

  // Special milestone for long streaks
  if (denialDays === 6) {
    milestones.push({
      milestoneType: 'special',
      title: 'One Week Milestone Eve',
      description: 'Tomorrow marks one full week of denial',
      pointsValue: 10,
    });
  } else if (denialDays === 13) {
    milestones.push({
      milestoneType: 'special',
      title: 'Two Week Milestone Eve',
      description: 'Tomorrow marks two full weeks of denial',
      pointsValue: 10,
    });
  }

  return milestones;
}

function getNextDenialMilestone(currentDays: number): number | null {
  const milestones = [3, 5, 7, 10, 14, 21, 30];
  return milestones.find(m => m > currentDays) || null;
}

// ============================================
// MAIN PRESCRIPTION GENERATOR
// ============================================

export interface GeneratedPrescription {
  planIntensity: PlanIntensity;
  totalTargetEdges: number;
  totalTargetDurationMinutes: number;
  checkInTimes: string[];
  sessions: SessionPrescription[];
  checkIns: CheckInPrescription[];
  milestones: MilestonePrescription[];
}

export function generateDailyPrescription(context: PrescriptionContext): GeneratedPrescription {
  // Generate sessions
  const sessions = generateSessionPrescriptions(context);

  // Calculate totals
  const totalTargetEdges = sessions.reduce((sum, s) => sum + s.targetEdges, 0);
  const totalTargetDurationMinutes = sessions.reduce((sum, s) => sum + s.targetDurationMinutes, 0);

  // Generate check-ins
  const checkIns = generateCheckInPrescriptions(context);
  const checkInTimes = checkIns.map(c => c.scheduledTime);

  // Generate milestones
  const milestones = generateMilestonePrescriptions(context, totalTargetEdges);

  // Calculate plan intensity
  const planIntensity = calculatePlanIntensity(
    context.currentState,
    context.denialDays,
    context.isChastityLocked
  );

  return {
    planIntensity,
    totalTargetEdges,
    totalTargetDurationMinutes,
    checkInTimes,
    sessions,
    checkIns,
    milestones,
  };
}

// ============================================
// DATABASE OPERATIONS
// ============================================

export async function getOrCreateTodayPlan(
  userId: string,
  context: PrescriptionContext
): Promise<TodaysPlanView | null> {
  const today = getTodayDate();

  // Try to get existing plan
  const existingPlan = await getTodayPlan(userId);
  if (existingPlan) {
    return existingPlan;
  }

  // Generate new prescription
  const prescription = generateDailyPrescription(context);

  // Create plan in database
  const { data: planData, error: planError } = await supabase
    .from('daily_arousal_plans')
    .insert({
      user_id: userId,
      plan_date: today,
      arousal_state_at_generation: context.currentState,
      denial_day_at_generation: context.denialDays,
      chastity_locked_at_generation: context.isChastityLocked,
      plan_intensity: prescription.planIntensity,
      total_target_edges: prescription.totalTargetEdges,
      total_target_duration_minutes: prescription.totalTargetDurationMinutes,
      check_in_times: prescription.checkInTimes,
      check_ins_total: prescription.checkIns.length,
    })
    .select()
    .single();

  if (planError || !planData) {
    console.error('Failed to create daily plan:', planError);
    return null;
  }

  const planId = planData.id;

  // Insert sessions
  const sessionInserts = prescription.sessions.map((s, idx) => ({
    plan_id: planId,
    user_id: userId,
    scheduled_time: s.scheduledTime,
    scheduled_date: today,
    time_block: s.timeBlock,
    session_type: s.sessionType,
    target_edges: s.targetEdges,
    target_duration_minutes: s.targetDurationMinutes,
    intensity_level: s.intensityLevel,
    recommended_patterns: s.recommendedPatterns,
    affirmation_focus: s.affirmationFocus,
    special_instructions: s.specialInstructions,
    sort_order: idx,
  }));

  if (sessionInserts.length > 0) {
    const { error: sessionsError } = await supabase
      .from('planned_edge_sessions')
      .insert(sessionInserts);

    if (sessionsError) {
      console.error('Failed to create planned sessions:', sessionsError);
    }
  }

  // Insert check-ins
  const checkInInserts = prescription.checkIns.map((c, idx) => ({
    plan_id: planId,
    user_id: userId,
    scheduled_time: c.scheduledTime,
    scheduled_date: today,
    check_in_type: c.checkInType,
    sort_order: idx,
  }));

  if (checkInInserts.length > 0) {
    const { error: checkInsError } = await supabase
      .from('arousal_check_ins')
      .insert(checkInInserts);

    if (checkInsError) {
      console.error('Failed to create check-ins:', checkInsError);
    }
  }

  // Insert milestones
  const milestoneInserts = prescription.milestones.map((m, idx) => ({
    plan_id: planId,
    user_id: userId,
    milestone_type: m.milestoneType,
    title: m.title,
    description: m.description,
    target_value: m.targetValue,
    target_state: m.targetState,
    deadline_time: m.deadlineTime,
    points_value: m.pointsValue,
    sort_order: idx,
  }));

  if (milestoneInserts.length > 0) {
    const { error: milestonesError } = await supabase
      .from('chastity_milestones')
      .insert(milestoneInserts);

    if (milestonesError) {
      console.error('Failed to create milestones:', milestonesError);
    }
  }

  // Return the full view
  return getTodayPlan(userId);
}

export async function getTodayPlan(userId: string): Promise<TodaysPlanView | null> {
  const today = getTodayDate();

  // Get plan
  const { data: planData, error: planError } = await supabase
    .from('daily_arousal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_date', today)
    .maybeSingle();

  if (planError || !planData) {
    return null;
  }

  const plan = dbPlanToPlan(planData as DbDailyArousalPlan);

  // Get sessions
  const { data: sessionsData } = await supabase
    .from('planned_edge_sessions')
    .select('*')
    .eq('plan_id', plan.id)
    .order('sort_order');

  const sessions = (sessionsData || []).map(s => dbSessionToSession(s as DbPlannedEdgeSession));

  // Get check-ins
  const { data: checkInsData } = await supabase
    .from('arousal_check_ins')
    .select('*')
    .eq('plan_id', plan.id)
    .order('sort_order');

  const checkIns = (checkInsData || []).map(c => dbCheckInToCheckIn(c as DbArousalCheckIn));

  // Get milestones
  const { data: milestonesData } = await supabase
    .from('chastity_milestones')
    .select('*')
    .eq('plan_id', plan.id)
    .order('sort_order');

  const milestones = (milestonesData || []).map(m => dbMilestoneToMilestone(m as DbChastityMilestone));

  // Calculate computed values
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // Find next scheduled item
  const upcomingSessions = sessions.filter(
    s => s.status === 'scheduled' && s.scheduledTime > currentTime
  );
  const upcomingCheckIns = checkIns.filter(
    c => c.status === 'scheduled' && c.scheduledTime > currentTime
  );

  let nextScheduledItem: PlannedEdgeSession | ArousalCheckIn | null = null;
  let nextItemType: 'session' | 'check_in' | null = null;

  const nextSession = upcomingSessions[0];
  const nextCheckIn = upcomingCheckIns[0];

  if (nextSession && nextCheckIn) {
    if (nextSession.scheduledTime < nextCheckIn.scheduledTime) {
      nextScheduledItem = nextSession;
      nextItemType = 'session';
    } else {
      nextScheduledItem = nextCheckIn;
      nextItemType = 'check_in';
    }
  } else if (nextSession) {
    nextScheduledItem = nextSession;
    nextItemType = 'session';
  } else if (nextCheckIn) {
    nextScheduledItem = nextCheckIn;
    nextItemType = 'check_in';
  }

  // Calculate progress
  const sessionsCompleted = sessions.filter(s => s.status === 'completed').length;
  const checkInsCompleted = checkIns.filter(c => c.status === 'completed').length;
  const milestonesAchieved = milestones.filter(m => m.status === 'achieved').length;

  const totalItems = sessions.length + checkIns.length + milestones.length;
  const completedItems = sessionsCompleted + checkInsCompleted + milestonesAchieved;
  const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return {
    plan,
    sessions,
    checkIns,
    milestones,
    nextScheduledItem,
    nextItemType,
    overallProgress,
    sessionsCompleted,
    sessionsTotal: sessions.length,
    checkInsCompleted,
    checkInsTotal: checkIns.length,
    milestonesAchieved,
    milestonesTotal: milestones.length,
  };
}

// ============================================
// PLAN UPDATE OPERATIONS
// ============================================

export async function startPlannedSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('planned_edge_sessions')
    .update({
      status: 'started',
      started_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  return !error;
}

export async function completePlannedSession(
  sessionId: string,
  actualEdges: number,
  actualDurationMinutes: number,
  postSessionState: ArousalState,
  satisfactionRating?: number,
  actualSessionId?: string
): Promise<boolean> {
  const { error } = await supabase
    .from('planned_edge_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      actual_edges: actualEdges,
      actual_duration_minutes: actualDurationMinutes,
      post_session_state: postSessionState,
      satisfaction_rating: satisfactionRating,
      actual_session_id: actualSessionId,
    })
    .eq('id', sessionId);

  if (!error) {
    // Update plan edge count
    await updatePlanProgress(sessionId, actualEdges);
  }

  return !error;
}

export async function skipPlannedSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('planned_edge_sessions')
    .update({ status: 'skipped' })
    .eq('id', sessionId);

  return !error;
}

export async function completeCheckIn(
  checkInId: string,
  arousalLevel: number,
  stateReported: ArousalState,
  achingIntensity?: number,
  physicalSigns?: string[],
  notes?: string
): Promise<boolean> {
  const { error } = await supabase
    .from('arousal_check_ins')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      arousal_level: arousalLevel,
      state_reported: stateReported,
      aching_intensity: achingIntensity,
      physical_signs: physicalSigns,
      notes,
    })
    .eq('id', checkInId);

  if (!error) {
    // Update plan check-in count
    await updatePlanCheckInCount(checkInId);
  }

  return !error;
}

export async function updateMilestoneProgress(
  milestoneId: string,
  currentValue: number
): Promise<boolean> {
  // Get milestone to check target
  const { data: milestone, error: fetchError } = await supabase
    .from('chastity_milestones')
    .select('*')
    .eq('id', milestoneId)
    .single();

  if (fetchError || !milestone) return false;

  const updates: Record<string, unknown> = {
    current_value: currentValue,
    status: 'in_progress',
  };

  // Check if achieved
  if (milestone.target_value && currentValue >= milestone.target_value) {
    updates.status = 'achieved';
    updates.achieved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('chastity_milestones')
    .update(updates)
    .eq('id', milestoneId);

  return !error;
}

export async function achieveMilestone(milestoneId: string): Promise<boolean> {
  const { error } = await supabase
    .from('chastity_milestones')
    .update({
      status: 'achieved',
      achieved_at: new Date().toISOString(),
    })
    .eq('id', milestoneId);

  return !error;
}

// ============================================
// INTERNAL HELPERS
// ============================================

async function updatePlanProgress(sessionId: string, edgesAchieved: number): Promise<void> {
  // Get plan ID from session
  const { data: session } = await supabase
    .from('planned_edge_sessions')
    .select('plan_id')
    .eq('id', sessionId)
    .single();

  if (!session) return;

  // Increment edges achieved
  const { data: plan } = await supabase
    .from('daily_arousal_plans')
    .select('edges_achieved')
    .eq('id', session.plan_id)
    .single();

  if (!plan) return;

  const newEdgeCount = (plan.edges_achieved || 0) + edgesAchieved;

  await supabase
    .from('daily_arousal_plans')
    .update({
      edges_achieved: newEdgeCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.plan_id);

  // Recalculate completion percentage
  await recalculatePlanCompletion(session.plan_id);
}

async function updatePlanCheckInCount(checkInId: string): Promise<void> {
  // Get plan ID from check-in
  const { data: checkIn } = await supabase
    .from('arousal_check_ins')
    .select('plan_id')
    .eq('id', checkInId)
    .single();

  if (!checkIn) return;

  // Increment check-ins completed
  const { data: plan } = await supabase
    .from('daily_arousal_plans')
    .select('check_ins_completed')
    .eq('id', checkIn.plan_id)
    .single();

  if (!plan) return;

  await supabase
    .from('daily_arousal_plans')
    .update({
      check_ins_completed: (plan.check_ins_completed || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', checkIn.plan_id);

  // Recalculate completion percentage
  await recalculatePlanCompletion(checkIn.plan_id);
}

async function recalculatePlanCompletion(planId: string): Promise<void> {
  // Get all items
  const [sessionsResult, checkInsResult, milestonesResult] = await Promise.all([
    supabase.from('planned_edge_sessions').select('status').eq('plan_id', planId),
    supabase.from('arousal_check_ins').select('status').eq('plan_id', planId),
    supabase.from('chastity_milestones').select('status').eq('plan_id', planId),
  ]);

  const sessions = sessionsResult.data || [];
  const checkIns = checkInsResult.data || [];
  const milestones = milestonesResult.data || [];

  const totalItems = sessions.length + checkIns.length + milestones.length;
  const completedItems =
    sessions.filter(s => s.status === 'completed').length +
    checkIns.filter(c => c.status === 'completed').length +
    milestones.filter(m => m.status === 'achieved').length;

  const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // Determine status
  let status: 'active' | 'completed' = 'active';
  if (percentage === 100) {
    status = 'completed';
  }

  await supabase
    .from('daily_arousal_plans')
    .update({
      completion_percentage: percentage,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);
}

// ============================================
// EXPIRATION HANDLING
// ============================================

export async function expireOldPlans(userId: string): Promise<void> {
  const today = getTodayDate();

  await supabase
    .from('daily_arousal_plans')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('plan_date', today);

  // Mark missed sessions
  await supabase
    .from('planned_edge_sessions')
    .update({ status: 'missed' })
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .lt('scheduled_date', today);

  // Mark missed check-ins
  await supabase
    .from('arousal_check_ins')
    .update({ status: 'missed' })
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .lt('scheduled_date', today);

  // Mark failed milestones
  await supabase
    .from('chastity_milestones')
    .update({ status: 'failed' })
    .eq('user_id', userId)
    .in('status', ['pending', 'in_progress'])
    .lt('created_at', today);
}
