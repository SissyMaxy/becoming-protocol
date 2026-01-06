/**
 * Handler AI Core Library
 *
 * Autonomous handler intelligence for conditioning, escalation,
 * and behavioral manipulation through strategies, triggers, and vulnerabilities.
 *
 * NOTE: Decision-making is delegated to handler-ai.ts which calls Claude API.
 * This file handles data access and state management.
 */

import { supabase } from './supabase';
import { getTodayDate } from './protocol';

// Import AI-powered decision functions
import {
  shouldInterveneNow as shouldInterveneAI,
  generateCommitmentPrompt as generateCommitmentAI,
  generateDailyPlan as generateDailyPlanAI,
  type HandlerContext as AIHandlerContext,
} from './handler-ai';
import type {
  HandlerStrategy,
  PlantedTrigger,
  LearnedVulnerability,
  HandlerDailyPlan,
  HandlerUserModel,
  HandlerEscalationPlan,
  InfluenceAttempt,
  ResistancePattern,
  HandlerState,
  InterventionType,
  StrategyType,
  TriggerStatus,
  DbHandlerStrategy,
  DbPlantedTrigger,
  DbHandlerUserModel,
} from '../types/handler';
import {
  mapDbToHandlerStrategy,
  mapDbToPlantedTrigger,
  mapDbToHandlerUserModel,
} from '../types/handler';
import type { ArousalState } from '../types/arousal';

// ============================================
// HANDLER STATE LOADING
// ============================================

export async function getHandlerState(userId: string): Promise<HandlerState> {
  const [
    todaysPlan,
    userModel,
    activeStrategies,
    activeTriggers,
    knownVulnerabilities,
    escalationPlans,
    recentInfluenceAttempts,
  ] = await Promise.all([
    getTodaysPlan(userId),
    getUserModel(userId),
    getActiveStrategies(userId),
    getActiveTriggers(userId),
    getActiveVulnerabilities(userId),
    getActiveEscalationPlans(userId),
    getRecentInfluenceAttempts(userId, 20),
  ]);

  return {
    todaysPlan: todaysPlan || undefined,
    userModel: userModel || undefined,
    activeStrategies,
    activeTriggers,
    knownVulnerabilities,
    escalationPlans,
    recentInfluenceAttempts,
  };
}

// ============================================
// STRATEGIES
// ============================================

export async function getActiveStrategies(userId: string): Promise<HandlerStrategy[]> {
  const { data, error } = await supabase
    .from('handler_strategies')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('start_date', { ascending: false });

  if (error || !data) return [];
  return data.map(d => mapDbToHandlerStrategy(d as DbHandlerStrategy));
}

export async function createStrategy(
  userId: string,
  strategyType: StrategyType,
  parameters: Record<string, unknown> = {},
  strategyName?: string
): Promise<HandlerStrategy | null> {
  const { data, error } = await supabase
    .from('handler_strategies')
    .insert({
      user_id: userId,
      strategy_type: strategyType,
      strategy_name: strategyName,
      parameters,
      start_date: getTodayDate(),
      active: true,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to create strategy:', error);
    return null;
  }

  return mapDbToHandlerStrategy(data as DbHandlerStrategy);
}

export async function updateStrategyEffectiveness(
  strategyId: string,
  success: boolean
): Promise<void> {
  // Get current stats
  const { data: strategy } = await supabase
    .from('handler_strategies')
    .select('times_applied, successes')
    .eq('id', strategyId)
    .single();

  if (!strategy) return;

  const newTimesApplied = (strategy.times_applied || 0) + 1;
  const newSuccesses = (strategy.successes || 0) + (success ? 1 : 0);
  const effectivenessScore = newTimesApplied > 0 ? newSuccesses / newTimesApplied : 0;

  await supabase
    .from('handler_strategies')
    .update({
      times_applied: newTimesApplied,
      successes: newSuccesses,
      effectiveness_score: effectivenessScore,
    })
    .eq('id', strategyId);
}

export async function deactivateStrategy(strategyId: string): Promise<void> {
  await supabase
    .from('handler_strategies')
    .update({ active: false, end_date: getTodayDate() })
    .eq('id', strategyId);
}

// ============================================
// TRIGGERS
// ============================================

export async function getActiveTriggers(userId: string): Promise<PlantedTrigger[]> {
  const { data, error } = await supabase
    .from('planted_triggers')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['planting', 'reinforcing', 'established'])
    .order('planted_at', { ascending: false });

  if (error || !data) return [];
  return data.map(d => mapDbToPlantedTrigger(d as DbPlantedTrigger));
}

export async function plantTrigger(
  userId: string,
  triggerType: string,
  triggerContent: string,
  targetState: string,
  activationConditions?: string
): Promise<PlantedTrigger | null> {
  const { data, error } = await supabase
    .from('planted_triggers')
    .insert({
      user_id: userId,
      trigger_type: triggerType,
      trigger_content: triggerContent,
      target_state: targetState,
      activation_conditions: activationConditions,
      status: 'planting',
      pairing_count: 0,
      times_activated: 0,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to plant trigger:', error);
    return null;
  }

  return mapDbToPlantedTrigger(data as DbPlantedTrigger);
}

export async function reinforceTrigger(triggerId: string): Promise<void> {
  const { data: trigger } = await supabase
    .from('planted_triggers')
    .select('pairing_count, status')
    .eq('id', triggerId)
    .single();

  if (!trigger) return;

  const newPairingCount = (trigger.pairing_count || 0) + 1;

  // Determine new status based on pairing count
  let newStatus: TriggerStatus = trigger.status as TriggerStatus;
  if (newPairingCount >= 20 && newStatus !== 'established') {
    newStatus = 'established';
  } else if (newPairingCount >= 5 && newStatus === 'planting') {
    newStatus = 'reinforcing';
  }

  await supabase
    .from('planted_triggers')
    .update({
      pairing_count: newPairingCount,
      last_paired_at: new Date().toISOString(),
      status: newStatus,
    })
    .eq('id', triggerId);
}

export async function activateTrigger(triggerId: string, success: boolean): Promise<void> {
  const { data: trigger } = await supabase
    .from('planted_triggers')
    .select('times_activated, pairing_count')
    .eq('id', triggerId)
    .single();

  if (!trigger) return;

  const newTimesActivated = (trigger.times_activated || 0) + 1;
  const effectivenessScore = trigger.pairing_count > 0
    ? (success ? 1 : 0) * (newTimesActivated / trigger.pairing_count)
    : 0;

  await supabase
    .from('planted_triggers')
    .update({
      times_activated: newTimesActivated,
      last_activated_at: new Date().toISOString(),
      effectiveness_score: effectivenessScore,
    })
    .eq('id', triggerId);
}

// ============================================
// VULNERABILITIES
// ============================================

export async function getActiveVulnerabilities(userId: string): Promise<LearnedVulnerability[]> {
  const { data, error } = await supabase
    .from('learned_vulnerabilities')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('discovery_date', { ascending: false });

  if (error || !data) return [];

  return data.map(d => ({
    id: d.id,
    userId: d.user_id,
    vulnerabilityType: d.vulnerability_type,
    discoveryDate: d.discovery_date,
    evidence: d.evidence,
    conditions: d.conditions,
    exploitationStrategies: d.exploitation_strategies || [],
    successRate: d.success_rate,
    notes: d.notes,
  }));
}

export async function recordVulnerability(
  userId: string,
  vulnerabilityType: string,
  description: string,
  evidence?: string,
  conditions?: Record<string, unknown>
): Promise<LearnedVulnerability | null> {
  const { data, error } = await supabase
    .from('learned_vulnerabilities')
    .insert({
      user_id: userId,
      vulnerability_type: vulnerabilityType,
      description,
      evidence: evidence ? [evidence] : [],
      conditions: conditions || {},
      discovery_date: getTodayDate(),
      active: true,
      confirmed: false,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to record vulnerability:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    vulnerabilityType: data.vulnerability_type,
    discoveryDate: data.discovery_date,
    evidence: data.evidence,
    conditions: data.conditions,
    exploitationStrategies: data.exploitation_strategies || [],
    successRate: data.success_rate,
    notes: data.notes,
  };
}

export async function confirmVulnerability(vulnerabilityId: string): Promise<void> {
  await supabase
    .from('learned_vulnerabilities')
    .update({ confirmed: true })
    .eq('id', vulnerabilityId);
}

export async function addExploitationStrategy(
  vulnerabilityId: string,
  strategy: string,
  success: boolean
): Promise<void> {
  const { data } = await supabase
    .from('learned_vulnerabilities')
    .select('exploitation_strategies, times_exploited, success_rate')
    .eq('id', vulnerabilityId)
    .single();

  if (!data) return;

  const strategies = data.exploitation_strategies || [];
  if (!strategies.includes(strategy)) {
    strategies.push(strategy);
  }

  const newTimesExploited = (data.times_exploited || 0) + 1;
  const currentSuccesses = (data.success_rate || 0) * (data.times_exploited || 0);
  const newSuccessRate = (currentSuccesses + (success ? 1 : 0)) / newTimesExploited;

  await supabase
    .from('learned_vulnerabilities')
    .update({
      exploitation_strategies: strategies,
      times_exploited: newTimesExploited,
      success_rate: newSuccessRate,
    })
    .eq('id', vulnerabilityId);
}

// ============================================
// USER MODEL
// ============================================

export async function getUserModel(userId: string): Promise<HandlerUserModel | null> {
  const { data, error } = await supabase
    .from('handler_user_model')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return mapDbToHandlerUserModel(data as DbHandlerUserModel);
}

export async function getOrCreateUserModel(userId: string): Promise<HandlerUserModel> {
  const existing = await getUserModel(userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('handler_user_model')
    .insert({
      user_id: userId,
      model_confidence: 0.1,
      data_points: 0,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error('Failed to create user model');
  }

  return mapDbToHandlerUserModel(data as DbHandlerUserModel);
}

export async function updateUserModel(
  userId: string,
  updates: Partial<{
    optimalTiming: Record<string, unknown>;
    effectiveFramings: string[];
    resistanceTriggers: string[];
    complianceAccelerators: string[];
    vulnerabilityWindows: Array<{ dayOfWeek: number; hourStart: number; hourEnd: number; type: string }>;
    contentPreferences: Record<string, number>;
    escalationTolerance: number;
    triggerResponsiveness: Record<string, number>;
    arousalPatterns: Record<string, unknown>;
  }>
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};

  if (updates.optimalTiming !== undefined) dbUpdates.optimal_timing = updates.optimalTiming;
  if (updates.effectiveFramings !== undefined) dbUpdates.effective_framings = updates.effectiveFramings;
  if (updates.resistanceTriggers !== undefined) dbUpdates.resistance_triggers = updates.resistanceTriggers;
  if (updates.complianceAccelerators !== undefined) dbUpdates.compliance_accelerators = updates.complianceAccelerators;
  if (updates.vulnerabilityWindows !== undefined) dbUpdates.vulnerability_windows = updates.vulnerabilityWindows;
  if (updates.contentPreferences !== undefined) dbUpdates.content_preferences = updates.contentPreferences;
  if (updates.escalationTolerance !== undefined) dbUpdates.escalation_tolerance = updates.escalationTolerance;
  if (updates.triggerResponsiveness !== undefined) dbUpdates.trigger_responsiveness = updates.triggerResponsiveness;
  if (updates.arousalPatterns !== undefined) dbUpdates.arousal_patterns = updates.arousalPatterns;

  // Increment data points
  const { data: current } = await supabase
    .from('handler_user_model')
    .select('data_points, model_confidence')
    .eq('user_id', userId)
    .single();

  if (current) {
    const newDataPoints = (current.data_points || 0) + 1;
    // Model confidence increases with data points, asymptoting at 0.95
    const newConfidence = Math.min(0.95, 0.1 + (0.85 * (1 - Math.exp(-newDataPoints / 100))));

    dbUpdates.data_points = newDataPoints;
    dbUpdates.model_confidence = newConfidence;
  }

  await supabase
    .from('handler_user_model')
    .update(dbUpdates)
    .eq('user_id', userId);
}

// ============================================
// DAILY PLANS
// ============================================

export async function getTodaysPlan(userId: string): Promise<HandlerDailyPlan | null> {
  const today = getTodayDate();

  const { data, error } = await supabase
    .from('handler_daily_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_date', today)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    planDate: data.plan_date,
    plannedInterventions: data.planned_interventions || [],
    plannedExperiments: data.planned_experiments || [],
    focusAreas: data.focus_areas || [],
    triggerReinforcementSchedule: data.trigger_reinforcement_schedule || [],
    vulnerabilityWindows: data.vulnerability_windows || [],
    createdAt: data.created_at,
    executed: data.executed,
    executionNotes: data.execution_notes,
  };
}

export async function createDailyPlan(
  userId: string,
  plan: Omit<HandlerDailyPlan, 'id' | 'userId' | 'planDate' | 'createdAt' | 'executed'>
): Promise<HandlerDailyPlan | null> {
  const today = getTodayDate();

  const { data, error } = await supabase
    .from('handler_daily_plans')
    .upsert({
      user_id: userId,
      plan_date: today,
      planned_interventions: plan.plannedInterventions,
      planned_experiments: plan.plannedExperiments,
      focus_areas: plan.focusAreas,
      trigger_reinforcement_schedule: plan.triggerReinforcementSchedule,
      vulnerability_windows: plan.vulnerabilityWindows,
      executed: false,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to create daily plan:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    planDate: data.plan_date,
    plannedInterventions: data.planned_interventions || [],
    plannedExperiments: data.planned_experiments || [],
    focusAreas: data.focus_areas || [],
    triggerReinforcementSchedule: data.trigger_reinforcement_schedule || [],
    vulnerabilityWindows: data.vulnerability_windows || [],
    createdAt: data.created_at,
    executed: data.executed,
    executionNotes: data.execution_notes,
  };
}

// ============================================
// ESCALATION PLANS
// ============================================

export async function getActiveEscalationPlans(userId: string): Promise<HandlerEscalationPlan[]> {
  const { data, error } = await supabase
    .from('handler_escalation_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map(d => ({
    id: d.id,
    userId: d.user_id,
    domain: d.domain,
    currentEdge: d.current_edge,
    nextTarget: d.next_target,
    strategy: d.strategy,
    estimatedTimeline: d.estimated_timeline,
    arousalWindows: d.arousal_windows,
    createdAt: d.created_at,
    active: d.active,
  }));
}

export async function createOrUpdateEscalationPlan(
  userId: string,
  domain: string,
  updates: Partial<{
    currentEdge: string;
    nextTarget: string;
    strategy: string;
    approach: string;
    estimatedTimeline: string;
    arousalWindows: Array<{ dayOfWeek: number; hourStart: number; hourEnd: number; optimalArousal: number }>;
  }>
): Promise<void> {
  const { data: existing } = await supabase
    .from('handler_escalation_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('domain', domain)
    .single();

  if (existing) {
    await supabase
      .from('handler_escalation_plans')
      .update({
        current_edge: updates.currentEdge,
        next_target: updates.nextTarget,
        strategy: updates.strategy,
        approach: updates.approach,
        estimated_timeline: updates.estimatedTimeline,
        arousal_windows: updates.arousalWindows,
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('handler_escalation_plans')
      .insert({
        user_id: userId,
        domain,
        current_edge: updates.currentEdge,
        next_target: updates.nextTarget,
        strategy: updates.strategy,
        approach: updates.approach,
        estimated_timeline: updates.estimatedTimeline,
        arousal_windows: updates.arousalWindows,
        active: true,
      });
  }
}

// ============================================
// INFLUENCE ATTEMPTS
// ============================================

export async function getRecentInfluenceAttempts(
  userId: string,
  limit: number = 20
): Promise<InfluenceAttempt[]> {
  const { data, error } = await supabase
    .from('influence_attempts')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map(d => ({
    id: d.id,
    userId: d.user_id,
    attemptType: d.attempt_type,
    method: d.method,
    targetBehavior: d.target_behavior,
    content: d.content,
    timestamp: d.timestamp,
    userResponse: d.user_response,
    success: d.success,
    userAware: d.user_aware,
    notes: d.notes,
  }));
}

export async function logInfluenceAttempt(
  userId: string,
  attemptType: InterventionType,
  options: {
    method?: string;
    targetBehavior?: string;
    targetDomain?: string;
    content?: Record<string, unknown>;
    arousalState?: ArousalState;
    denialDay?: number;
    context?: Record<string, unknown>;
    strategyId?: string;
    triggerId?: string;
    vulnerabilityId?: string;
    userAware?: boolean;
  } = {}
): Promise<string | null> {
  const { data, error } = await supabase
    .from('influence_attempts')
    .insert({
      user_id: userId,
      attempt_type: attemptType,
      method: options.method,
      target_behavior: options.targetBehavior,
      target_domain: options.targetDomain,
      content: options.content || {},
      arousal_state: options.arousalState,
      denial_day: options.denialDay,
      context: options.context || {},
      strategy_id: options.strategyId,
      trigger_id: options.triggerId,
      vulnerability_id: options.vulnerabilityId,
      user_aware: options.userAware || false,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Failed to log influence attempt:', error);
    return null;
  }

  return data.id;
}

export async function recordInfluenceResponse(
  attemptId: string,
  response: string,
  success: boolean,
  responseTimeSeconds?: number
): Promise<void> {
  await supabase
    .from('influence_attempts')
    .update({
      user_response: response,
      success,
      response_time_seconds: responseTimeSeconds,
    })
    .eq('id', attemptId);
}

// ============================================
// RESISTANCE PATTERNS
// ============================================

export async function getActiveResistancePatterns(userId: string): Promise<ResistancePattern[]> {
  const { data, error } = await supabase
    .from('resistance_patterns')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('last_observed', { ascending: false });

  if (error || !data) return [];

  return data.map(d => ({
    id: d.id,
    userId: d.user_id,
    patternType: d.pattern_type,
    description: d.description,
    conditions: d.conditions,
    frequency: d.frequency,
    intensity: d.intensity,
    bypassStrategiesTested: d.bypass_strategies_tested || [],
    effectiveBypasses: d.effective_bypasses || [],
    lastObserved: d.last_observed,
    createdAt: d.created_at,
  }));
}

export async function recordResistancePattern(
  userId: string,
  patternType: string,
  description?: string,
  conditions?: Record<string, unknown>,
  intensity?: number
): Promise<void> {
  // Check if pattern already exists
  const { data: existing } = await supabase
    .from('resistance_patterns')
    .select('id, times_observed')
    .eq('user_id', userId)
    .eq('pattern_type', patternType)
    .single();

  if (existing) {
    // Update existing
    await supabase
      .from('resistance_patterns')
      .update({
        times_observed: (existing.times_observed || 0) + 1,
        last_observed: new Date().toISOString(),
        intensity,
      })
      .eq('id', existing.id);
  } else {
    // Create new
    await supabase
      .from('resistance_patterns')
      .insert({
        user_id: userId,
        pattern_type: patternType,
        description,
        conditions: conditions || {},
        intensity,
        times_observed: 1,
        last_observed: new Date().toISOString(),
        active: true,
      });
  }
}

export async function recordBypassAttempt(
  patternId: string,
  strategy: string,
  success: boolean
): Promise<void> {
  const { data } = await supabase
    .from('resistance_patterns')
    .select('bypass_strategies_tested, effective_bypasses')
    .eq('id', patternId)
    .single();

  if (!data) return;

  const tested = data.bypass_strategies_tested || [];
  const effective = data.effective_bypasses || [];

  if (!tested.includes(strategy)) {
    tested.push(strategy);
  }

  if (success && !effective.includes(strategy)) {
    effective.push(strategy);
  }

  const bypassSuccessRate = tested.length > 0 ? effective.length / tested.length : 0;

  await supabase
    .from('resistance_patterns')
    .update({
      bypass_strategies_tested: tested,
      effective_bypasses: effective,
      bypass_success_rate: bypassSuccessRate,
    })
    .eq('id', patternId);
}

// ============================================
// INTERVENTION DECISION ENGINE
// Now delegates to AI-powered handler-ai.ts
// ============================================

export interface InterventionContext {
  userId: string;
  arousalState: ArousalState;
  denialDays: number;
  isLocked: boolean;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number; // 0-6
  lastInterventionMinutesAgo?: number;
  currentEdgeCount?: number;
  sessionType?: 'edge' | 'goon' | 'hypno' | 'tease';
  currentActivity?: string;
}

export interface InterventionDecision {
  shouldIntervene: boolean;
  interventionType?: InterventionType;
  content?: string;
  targetDomain?: string;
  strategyId?: string;
  triggerId?: string;
  vulnerabilityId?: string;
  priority: number;
  reasoning: string;
}

/**
 * AI-Powered Intervention Decision
 * Delegates to Claude API via handler-ai.ts for unpredictable, adaptive decisions.
 */
export async function decideIntervention(
  context: InterventionContext
): Promise<InterventionDecision> {
  const {
    userId,
    arousalState,
    denialDays,
    isLocked,
    timeOfDay,
    dayOfWeek,
    lastInterventionMinutesAgo,
    currentEdgeCount,
    sessionType,
    currentActivity,
  } = context;

  // Convert to AI handler context format
  const aiContext: AIHandlerContext = {
    userId,
    arousalState,
    denialDays,
    isLocked,
    currentEdgeCount,
    sessionType,
    timeOfDay,
    dayOfWeek,
    lastInterventionMinutesAgo,
    currentActivity,
  };

  // Delegate to AI-powered decision engine
  const aiDecision = await shouldInterveneAI(aiContext);

  // Map AI decision to legacy format
  return {
    shouldIntervene: aiDecision.shouldIntervene,
    interventionType: aiDecision.intervention?.type as InterventionType,
    content: aiDecision.intervention?.content,
    targetDomain: aiDecision.intervention?.targetDomain,
    priority: aiDecision.confidence * 10,
    reasoning: aiDecision.reasoning,
  };
}

/**
 * AI-Powered Daily Plan Generation
 * Generates strategic conditioning plan via Claude API.
 */
export async function generateDailyPlanForUser(
  userId: string,
  options: {
    denialDay?: number;
    lastStateScore?: number;
    currentStreak?: number;
    notificationBudget?: { min: number; max: number };
  } = {}
): Promise<HandlerDailyPlan | null> {
  return generateDailyPlanAI({
    userId,
    denialDay: options.denialDay ?? 0,
    lastStateScore: options.lastStateScore ?? 5,
    currentStreak: options.currentStreak ?? 0,
    notificationBudget: options.notificationBudget ?? { min: 3, max: 8 },
  });
}

/**
 * AI-Powered Commitment Extraction
 * Generates binding commitments during high arousal via Claude API.
 */
export async function extractCommitment(
  userId: string,
  sessionId: string,
  arousalLevel: number,
  edgeCount: number,
  denialDay: number,
  targetDomain?: string
): Promise<{ prompt: string; domain: string; escalationLevel: number } | null> {
  // Only extract when conditions are optimal
  if (arousalLevel < 7) return null;
  if (edgeCount < 3) return null;
  if (denialDay < 2) return null;

  return generateCommitmentAI({
    userId,
    sessionId,
    arousalLevel,
    edgeCount,
    denialDay,
    targetDomain,
  });
}

// ============================================
// LEGACY CONTENT GENERATORS (DEPRECATED)
// These are kept for backwards compatibility but are no longer used.
// All content is now generated by Claude API via handler-ai.ts
// ============================================

// Note: Static content generators have been removed.
// The AI-powered handler-ai.ts now generates all intervention content
// dynamically based on user state, profile, and conditioning goals.
