/**
 * Adaptive Feminization Intelligence System - Core Library
 * Vector scoring, prescription generation, and learning
 */

import { supabase } from './supabase';
import { ALL_VECTORS, getVectorById } from '../data/vector-definitions';
import type {
  VectorId,
  UserVectorState,
  UserContext,
  VectorScore,
  VectorPrescription,
  DailyPrescription,
  ScoringWeights,
  UserLearningProfile,
  IrreversibilityMarker,
  LockInStatus,
  VectorProgressUpdate,
} from '../types/adaptive-feminization';

// ============================================================
// USER VECTOR STATE
// ============================================================

export async function getUserVectorStates(userId: string): Promise<UserVectorState[]> {
  const { data, error } = await supabase
    .from('user_vector_states')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

  return (data || []).map(row => ({
    vectorId: row.vector_id as VectorId,
    currentLevel: row.current_level,
    subComponentScores: row.sub_component_scores || {},
    velocityTrend: row.velocity_trend,
    lastActivityDate: row.last_activity_date,
    totalEngagementMinutes: row.total_engagement_minutes,
    streakDays: row.streak_days,
    peakLevel: row.peak_level,
    lockedIn: row.locked_in,
    lockInDate: row.lock_in_date,
  }));
}

export async function getOrCreateVectorState(
  userId: string,
  vectorId: VectorId
): Promise<UserVectorState> {
  // Try to get existing state
  const { data: existing } = await supabase
    .from('user_vector_states')
    .select('*')
    .eq('user_id', userId)
    .eq('vector_id', vectorId)
    .single();

  if (existing) {
    return {
      vectorId: existing.vector_id as VectorId,
      currentLevel: existing.current_level,
      subComponentScores: existing.sub_component_scores || {},
      velocityTrend: existing.velocity_trend,
      lastActivityDate: existing.last_activity_date,
      totalEngagementMinutes: existing.total_engagement_minutes,
      streakDays: existing.streak_days,
      peakLevel: existing.peak_level,
      lockedIn: existing.locked_in,
      lockInDate: existing.lock_in_date,
    };
  }

  // Create new state
  const { data: newState, error } = await supabase
    .from('user_vector_states')
    .insert({
      user_id: userId,
      vector_id: vectorId,
      current_level: 0,
      sub_component_scores: {},
      velocity_trend: 'steady',
      total_engagement_minutes: 0,
      streak_days: 0,
      peak_level: 0,
      locked_in: false,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    vectorId: newState.vector_id as VectorId,
    currentLevel: newState.current_level,
    subComponentScores: newState.sub_component_scores || {},
    velocityTrend: newState.velocity_trend,
    lastActivityDate: newState.last_activity_date,
    totalEngagementMinutes: newState.total_engagement_minutes,
    streakDays: newState.streak_days,
    peakLevel: newState.peak_level,
    lockedIn: newState.locked_in,
    lockInDate: newState.lock_in_date,
  };
}

// ============================================================
// VECTOR SCORING
// ============================================================

const DEFAULT_WEIGHTS: ScoringWeights = {
  baseWeight: 0.4,
  contextWeight: 0.25,
  urgencyWeight: 0.15,
  phaseWeight: 0.1,
  synergyWeight: 0.1,
};

export function calculateVectorScore(
  vectorId: VectorId,
  userState: UserVectorState | undefined,
  context: UserContext,
  allStates: UserVectorState[],
  weights: ScoringWeights = DEFAULT_WEIGHTS
): VectorScore {
  const vector = getVectorById(vectorId);
  if (!vector) {
    return {
      vectorId,
      baseScore: 0,
      contextMultiplier: 1,
      urgencyBoost: 0,
      phaseBoost: 0,
      synergyBoost: 0,
      finalScore: 0,
      reasoning: ['Vector not found'],
    };
  }

  const reasoning: string[] = [];
  const level = userState?.currentLevel || 0;

  // Base score: inverse of current level (lower levels = higher priority)
  // But also consider if they're making progress (momentum)
  let baseScore = (10 - level) * 10; // 0-100 scale
  reasoning.push(`Base: Level ${level.toFixed(1)} → ${baseScore.toFixed(0)} points`);

  // Context multiplier based on vector's context factors
  let contextMultiplier = 1.0;

  // Check denial state context
  if (vector.contextFactors.includes('denial_state')) {
    if (context.denial.currentDay >= 7) {
      contextMultiplier += 0.3;
      reasoning.push('Denial boost: Day 7+ (+30%)');
    } else if (context.denial.currentDay >= 3) {
      contextMultiplier += 0.15;
      reasoning.push('Denial boost: Day 3+ (+15%)');
    }
  }

  // Check arousal level context
  if (vector.contextFactors.includes('arousal_level')) {
    if (context.denial.arousalBaseline === 'desperate') {
      contextMultiplier += 0.25;
      reasoning.push('High arousal boost (+25%)');
    } else if (context.denial.arousalBaseline === 'high') {
      contextMultiplier += 0.15;
      reasoning.push('Elevated arousal boost (+15%)');
    }
  }

  // Time availability
  if (vector.contextFactors.includes('time_availability')) {
    if (context.timeAvailability.minutesAvailable < 15) {
      contextMultiplier -= 0.3;
      reasoning.push('Low time penalty (-30%)');
    } else if (context.timeAvailability.minutesAvailable >= 60) {
      contextMultiplier += 0.1;
      reasoning.push('Extended time available (+10%)');
    }
  }

  // Social safety
  if (vector.contextFactors.includes('social_safety')) {
    if (context.socialSafety.currentLocation === 'home_alone') {
      contextMultiplier += 0.2;
      reasoning.push('Private space boost (+20%)');
    } else if (context.socialSafety.currentLocation === 'public_risky') {
      contextMultiplier -= 0.4;
      reasoning.push('Risky location penalty (-40%)');
    }
  }

  // Energy level
  if (vector.contextFactors.includes('energy_level')) {
    if (context.emotionalState.motivationLevel === 'high') {
      contextMultiplier += 0.1;
      reasoning.push('High motivation (+10%)');
    } else if (context.emotionalState.motivationLevel === 'low') {
      contextMultiplier -= 0.2;
      reasoning.push('Low motivation (-20%)');
    }
  }

  // Emotional state
  if (vector.contextFactors.includes('emotional_state')) {
    if (context.emotionalState.overallMood === 'struggling') {
      // For some vectors, struggling mood might be time for gentler work
      if (vector.category === 'sissification') {
        contextMultiplier -= 0.3;
        reasoning.push('Struggling mood - gentler approach (-30%)');
      }
    } else if (context.emotionalState.overallMood === 'excellent') {
      contextMultiplier += 0.1;
      reasoning.push('Excellent mood (+10%)');
    }
  }

  contextMultiplier = Math.max(0.5, Math.min(2.0, contextMultiplier));

  // Urgency boost for neglected vectors
  let urgencyBoost = 0;
  if (userState?.lastActivityDate) {
    const daysSinceActivity = Math.floor(
      (Date.now() - new Date(userState.lastActivityDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceActivity > 14) {
      urgencyBoost = 20;
      reasoning.push(`Neglected ${daysSinceActivity} days (+20 urgency)`);
    } else if (daysSinceActivity > 7) {
      urgencyBoost = 10;
      reasoning.push(`Inactive ${daysSinceActivity} days (+10 urgency)`);
    } else if (daysSinceActivity > 3) {
      urgencyBoost = 5;
      reasoning.push(`${daysSinceActivity} days since activity (+5 urgency)`);
    }
  } else {
    // Never engaged
    urgencyBoost = 15;
    reasoning.push('Never engaged (+15 urgency)');
  }

  // Phase boost for phase-required vectors
  let phaseBoost = 0;
  if (context.phaseRequirements.includes(vectorId)) {
    phaseBoost = 15;
    reasoning.push('Phase focus area (+15)');
  }

  // Synergy boost for vectors with dependencies that are progressing
  let synergyBoost = 0;
  for (const depId of vector.crossVectorDependencies) {
    const depState = allStates.find(s => s.vectorId === depId);
    if (depState && depState.currentLevel >= 3) {
      synergyBoost += 2;
    }
  }
  if (synergyBoost > 0) {
    synergyBoost = Math.min(synergyBoost, 10);
    reasoning.push(`Cross-vector synergy (+${synergyBoost})`);
  }

  // Calculate final score
  const finalScore =
    (baseScore * weights.baseWeight * contextMultiplier) +
    (urgencyBoost * weights.urgencyWeight) +
    (phaseBoost * weights.phaseWeight) +
    (synergyBoost * weights.synergyWeight);

  return {
    vectorId,
    baseScore,
    contextMultiplier,
    urgencyBoost,
    phaseBoost,
    synergyBoost,
    finalScore,
    reasoning,
  };
}

export function scoreAllVectors(
  userStates: UserVectorState[],
  context: UserContext,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): VectorScore[] {
  const stateMap = new Map(userStates.map(s => [s.vectorId, s]));

  return ALL_VECTORS.map(vector =>
    calculateVectorScore(
      vector.id,
      stateMap.get(vector.id),
      context,
      userStates,
      weights
    )
  ).sort((a, b) => b.finalScore - a.finalScore);
}

// ============================================================
// PRESCRIPTION GENERATION
// ============================================================

export function generatePrescriptions(
  scores: VectorScore[],
  userStates: UserVectorState[],
  context: UserContext,
  options?: {
    forceVectors?: VectorId[];
    excludeVectors?: VectorId[];
    maxDuration?: number;
  }
): VectorPrescription[] {
  let candidates = [...scores];

  // Apply exclusions
  if (options?.excludeVectors?.length) {
    candidates = candidates.filter(s => !options.excludeVectors!.includes(s.vectorId));
  }

  // Apply forced vectors
  if (options?.forceVectors?.length) {
    const forced = candidates.filter(s => options.forceVectors!.includes(s.vectorId));
    const others = candidates.filter(s => !options.forceVectors!.includes(s.vectorId));
    candidates = [...forced, ...others];
  }

  const prescriptions: VectorPrescription[] = [];
  let totalTime = 0;
  const maxTime = options?.maxDuration || context.timeAvailability.minutesAvailable;

  // Select primary, secondary, tertiary
  for (let i = 0; i < candidates.length && prescriptions.length < 3; i++) {
    const score = candidates[i];
    const vector = getVectorById(score.vectorId);
    if (!vector) continue;

    // Estimate duration based on vector type
    let suggestedDuration = 15; // default
    if (vector.category === 'feminization') {
      if (vector.id.includes('training') || vector.id.includes('therapy')) {
        suggestedDuration = 30;
      } else if (vector.id.includes('integration') || vector.id.includes('processing')) {
        suggestedDuration = 20;
      }
    } else {
      // Sissification vectors often require more focus
      if (vector.id.includes('conditioning') || vector.id.includes('training')) {
        suggestedDuration = 25;
      }
    }

    // Check if fits in available time
    if (totalTime + suggestedDuration > maxTime && prescriptions.length > 0) {
      continue;
    }

    const priority = prescriptions.length === 0 ? 'primary'
      : prescriptions.length === 1 ? 'secondary'
      : 'tertiary';

    // Generate suggested tasks based on vector and level
    const userState = userStates.find(s => s.vectorId === score.vectorId);
    const level = userState?.currentLevel || 0;
    const suggestedTasks = generateTaskSuggestions(score.vectorId, level);

    // Generate context notes
    const contextNotes: string[] = [];
    if (context.denial.currentDay >= 7) {
      contextNotes.push('High denial state - use this energy');
    }
    if (context.socialSafety.currentLocation === 'home_alone') {
      contextNotes.push('Private time - can be more expressive');
    }
    if (context.emotionalState.recentEuphoria) {
      contextNotes.push('Recent euphoria - ride the momentum');
    }

    prescriptions.push({
      vectorId: score.vectorId,
      priority,
      score: score.finalScore,
      reasoning: score.reasoning.join('; '),
      suggestedDuration,
      suggestedTasks,
      contextNotes,
    });

    totalTime += suggestedDuration;
  }

  return prescriptions;
}

function generateTaskSuggestions(vectorId: VectorId, currentLevel: number): string[] {
  const vector = getVectorById(vectorId);
  if (!vector) return [];

  const tasks: string[] = [];

  // Add milestone-based suggestions
  const nextMilestone = vector.milestones.find(m => m.level > currentLevel);
  if (nextMilestone) {
    tasks.push(`Work toward: ${nextMilestone.name}`);
    if (nextMilestone.requirements.length > 0) {
      tasks.push(nextMilestone.requirements[0]);
    }
  }

  // Add sub-component based suggestions
  const lowestSubComponent = vector.subComponents
    .sort((a, b) => b.weight - a.weight)[0];
  if (lowestSubComponent) {
    tasks.push(`Focus on: ${lowestSubComponent.name}`);
  }

  return tasks.slice(0, 3);
}

export async function saveDailyPrescription(
  userId: string,
  context: UserContext,
  prescriptions: VectorPrescription[]
): Promise<DailyPrescription> {
  const totalTime = prescriptions.reduce((sum, p) => sum + p.suggestedDuration, 0);

  // Generate focus message
  const primaryVector = prescriptions[0];
  const vector = primaryVector ? getVectorById(primaryVector.vectorId) : null;
  const focusMessage = vector
    ? `Today's focus: ${vector.name}. ${vector.description}`
    : 'Continue your journey with intention.';

  // Generate insights
  const insights: string[] = [];
  if (context.denial.currentDay >= 7) {
    insights.push('Extended denial is amplifying your receptivity');
  }
  if (prescriptions.some(p => getVectorById(p.vectorId)?.category === 'sissification')) {
    insights.push('Sissification vectors are optimal in your current state');
  }

  const validUntil = new Date();
  validUntil.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from('daily_prescriptions')
    .insert({
      user_id: userId,
      context,
      prescriptions,
      total_estimated_time: totalTime,
      focus_message: focusMessage,
      adaptive_insights: insights,
      valid_until: validUntil.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    generatedAt: data.generated_at,
    validUntil: data.valid_until,
    context: data.context,
    prescriptions: data.prescriptions,
    totalEstimatedTime: data.total_estimated_time,
    focusMessage: data.focus_message,
    adaptiveInsights: data.adaptive_insights,
  };
}

export async function getActivePrescription(userId: string): Promise<DailyPrescription | null> {
  const { data, error } = await supabase
    .from('daily_prescriptions')
    .select('*')
    .eq('user_id', userId)
    .gt('valid_until', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    generatedAt: data.generated_at,
    validUntil: data.valid_until,
    context: data.context,
    prescriptions: data.prescriptions,
    totalEstimatedTime: data.total_estimated_time,
    focusMessage: data.focus_message,
    adaptiveInsights: data.adaptive_insights,
  };
}

// ============================================================
// PROGRESS TRACKING
// ============================================================

export async function updateVectorProgress(
  userId: string,
  vectorId: VectorId,
  progressDelta: number,
  engagementMinutes: number,
  subComponentId?: string,
  subComponentDelta?: number
): Promise<VectorProgressUpdate> {
  const vector = getVectorById(vectorId);
  if (!vector) throw new Error(`Vector not found: ${vectorId}`);

  // Get current state
  const currentState = await getOrCreateVectorState(userId, vectorId);
  const previousLevel = currentState.currentLevel;

  // Calculate new level
  const newLevel = Math.min(10, Math.max(0, previousLevel + progressDelta));

  // Update sub-component scores
  const newSubScores = { ...currentState.subComponentScores };
  if (subComponentId && subComponentDelta) {
    const current = newSubScores[subComponentId] || 0;
    newSubScores[subComponentId] = Math.min(100, Math.max(0, current + subComponentDelta));
  }

  // Check for new milestones
  const milestonesAchieved = vector.milestones.filter(
    m => m.level > previousLevel && m.level <= newLevel
  );

  // Check for lock-in
  const newLockIns: LockInStatus[] = [];
  if (!currentState.lockedIn && newLevel >= vector.lockInThreshold) {
    newLockIns.push({
      vectorId,
      isLockedIn: true,
      lockInLevel: Math.floor(newLevel),
      lockInDate: new Date().toISOString(),
      regressionResistance: 50 + (newLevel * 5),
      permanenceScore: newLevel * 10,
    });
  }

  // Create irreversibility markers for irreversible milestones
  const irreversibilityMarkers: IrreversibilityMarker[] = milestonesAchieved
    .filter(m => m.isIrreversible)
    .map(m => ({
      id: crypto.randomUUID(),
      vectorId,
      milestoneName: m.name,
      achievedAt: new Date().toISOString(),
      level: m.level,
      message: m.irreversibilityMessage || `Reached ${m.name}`,
      acknowledged: false,
    }));

  // Update database
  const { error: updateError } = await supabase
    .from('user_vector_states')
    .update({
      current_level: newLevel,
      sub_component_scores: newSubScores,
      peak_level: Math.max(currentState.peakLevel, newLevel),
      total_engagement_minutes: currentState.totalEngagementMinutes + engagementMinutes,
      last_activity_date: new Date().toISOString(),
      locked_in: currentState.lockedIn || newLockIns.length > 0,
      lock_in_date: newLockIns.length > 0 ? new Date().toISOString() : currentState.lockInDate,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('vector_id', vectorId);

  if (updateError) throw updateError;

  // Record progress history
  await supabase.from('vector_progress_history').insert({
    user_id: userId,
    vector_id: vectorId,
    level: newLevel,
    sub_component_scores: newSubScores,
  });

  // Save irreversibility markers
  if (irreversibilityMarkers.length > 0) {
    await supabase.from('irreversibility_markers').insert(
      irreversibilityMarkers.map(m => ({
        user_id: userId,
        vector_id: m.vectorId,
        milestone_name: m.milestoneName,
        level: m.level,
        message: m.message,
        acknowledged: false,
      }))
    );
  }

  // Update lock-in status
  if (newLockIns.length > 0) {
    await supabase.from('vector_lock_in_status').upsert(
      newLockIns.map(l => ({
        user_id: userId,
        vector_id: l.vectorId,
        is_locked_in: l.isLockedIn,
        lock_in_level: l.lockInLevel,
        lock_in_date: l.lockInDate,
        regression_resistance: l.regressionResistance,
        permanence_score: l.permanenceScore,
      })),
      { onConflict: 'user_id,vector_id' }
    );
  }

  return {
    vectorId,
    previousLevel,
    newLevel,
    subComponentUpdates: newSubScores,
    milestonesAchieved,
    newLockIns,
    irreversibilityMarkers,
  };
}

// ============================================================
// ENGAGEMENT RECORDING
// ============================================================

export async function recordEngagement(
  userId: string,
  vectorId: VectorId,
  context: UserContext,
  engagement: {
    prescribedPriority?: 'primary' | 'secondary' | 'tertiary';
    wasFollowed: boolean;
    engagementQuality: 'excellent' | 'good' | 'mediocre' | 'poor';
    durationMinutes: number;
    outcomeNotes?: string;
  }
): Promise<void> {
  await supabase.from('vector_engagement_records').insert({
    user_id: userId,
    vector_id: vectorId,
    context,
    prescribed_priority: engagement.prescribedPriority,
    was_followed: engagement.wasFollowed,
    engagement_quality: engagement.engagementQuality,
    duration_minutes: engagement.durationMinutes,
    outcome_notes: engagement.outcomeNotes,
  });
}

// ============================================================
// IRREVERSIBILITY
// ============================================================

export async function getIrreversibilityMarkers(userId: string): Promise<IrreversibilityMarker[]> {
  const { data, error } = await supabase
    .from('irreversibility_markers')
    .select('*')
    .eq('user_id', userId)
    .order('achieved_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(row => ({
    id: row.id,
    vectorId: row.vector_id as VectorId,
    milestoneName: row.milestone_name,
    achievedAt: row.achieved_at,
    level: row.level,
    message: row.message,
    acknowledged: row.acknowledged,
    celebratedAt: row.celebrated_at,
  }));
}

export async function acknowledgeIrreversibilityMarker(
  userId: string,
  markerId: string
): Promise<void> {
  await supabase
    .from('irreversibility_markers')
    .update({
      acknowledged: true,
      celebrated_at: new Date().toISOString(),
    })
    .eq('id', markerId)
    .eq('user_id', userId);
}

export async function getLockInStatuses(userId: string): Promise<LockInStatus[]> {
  const { data, error } = await supabase
    .from('vector_lock_in_status')
    .select('*')
    .eq('user_id', userId)
    .eq('is_locked_in', true);

  if (error) throw error;

  return (data || []).map(row => ({
    vectorId: row.vector_id as VectorId,
    isLockedIn: row.is_locked_in,
    lockInLevel: row.lock_in_level,
    lockInDate: row.lock_in_date,
    regressionResistance: row.regression_resistance,
    permanenceScore: row.permanence_score,
  }));
}

// ============================================================
// LEARNING SYSTEM
// ============================================================

export async function updateLearningPattern(
  userId: string,
  vectorId: VectorId
): Promise<void> {
  // Get recent engagement records
  const { data: records } = await supabase
    .from('vector_engagement_records')
    .select('*')
    .eq('user_id', userId)
    .eq('vector_id', vectorId)
    .order('timestamp', { ascending: false })
    .limit(50);

  if (!records || records.length < 5) return;

  // Analyze patterns
  const timeOfDayCount: Record<string, number> = {};
  const denialDayCount: Record<number, number> = {};
  let totalDuration = 0;
  let completedCount = 0;
  let qualitySum = 0;

  const qualityMap = { excellent: 4, good: 3, mediocre: 2, poor: 1 };

  for (const record of records) {
    // Time of day
    const hour = new Date(record.timestamp).getHours();
    const timeOfDay = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    timeOfDayCount[timeOfDay] = (timeOfDayCount[timeOfDay] || 0) + 1;

    // Denial day
    if (record.context?.denial?.currentDay) {
      const day = record.context.denial.currentDay;
      denialDayCount[day] = (denialDayCount[day] || 0) + 1;
    }

    totalDuration += record.duration_minutes;
    if (record.was_followed) completedCount++;
    qualitySum += qualityMap[record.engagement_quality as keyof typeof qualityMap] || 2;
  }

  // Determine optimal times
  const optimalTimeOfDay = Object.entries(timeOfDayCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([time]) => time);

  const optimalDenialDay = Object.entries(denialDayCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => parseInt(day));

  // Update learning pattern
  await supabase.from('user_learning_patterns').upsert({
    user_id: userId,
    vector_id: vectorId,
    optimal_time_of_day: optimalTimeOfDay,
    optimal_denial_day: optimalDenialDay,
    average_engagement_duration: Math.round(totalDuration / records.length),
    completion_rate: (completedCount / records.length) * 100,
    quality_trend: qualitySum / records.length > 2.5 ? 'improving' : 'stable',
    last_updated: new Date().toISOString(),
  }, { onConflict: 'user_id,vector_id' });
}

export async function getUserLearningProfile(userId: string): Promise<UserLearningProfile | null> {
  const { data, error } = await supabase
    .from('user_learning_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  return {
    userId: data.user_id,
    patterns: [], // Loaded separately if needed
    preferredVectors: data.preferred_vectors,
    avoidedVectors: data.avoided_vectors,
    optimalSessionLength: data.optimal_session_length,
    peakProductivityTimes: data.peak_productivity_times,
    contextSensitivities: data.context_sensitivities,
    lastUpdated: data.last_updated,
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function getDayOfWeek(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

export function createDefaultContext(
  denialDay: number = 0,
  arousalBaseline: 'low' | 'medium' | 'high' | 'desperate' = 'medium'
): UserContext {
  return {
    denial: {
      currentDay: denialDay,
      targetDay: 14,
      edgesCompleted: 0,
      edgeDebt: 0,
      arousalBaseline,
      ruinedOrgasms: 0,
    },
    timeAvailability: {
      minutesAvailable: 30,
      isWeekend: [0, 6].includes(new Date().getDay()),
      isEvening: new Date().getHours() >= 18,
      hasPrivacy: true,
    },
    socialSafety: {
      currentLocation: 'home_alone',
      canPresentFeminine: true,
      riskTolerance: 'medium',
      supportPersonNearby: false,
    },
    emotionalState: {
      overallMood: 'good',
      recentEuphoria: false,
      recentDysphoria: false,
      anxietyLevel: 'none',
      motivationLevel: 'medium',
    },
    recentActivity: {
      tasksCompletedToday: 0,
      vectorsEngagedToday: [],
    },
    currentPhase: 1,
    phaseRequirements: [],
  };
}
