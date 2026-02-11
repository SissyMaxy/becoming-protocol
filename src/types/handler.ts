// Handler AI Types
// Types for the autonomous handler intelligence system

// ============================================
// HANDLER INTERVENTIONS
// ============================================

export type InterventionType =
  | 'microtask'
  | 'affirmation'
  | 'content_unlock'
  | 'challenge'
  | 'jackpot'
  | 'commitment_prompt'
  | 'anchor_reminder'
  | 'escalation_push'
  // Timing engine intervention types (Feature 2)
  | 'session_initiation'
  | 'avoidance_confrontation'
  | 'streak_protection'
  | 'support_check_in'
  | 'momentum_push'
  | 'integration_prompt'
  | 'post_session_capture';

export interface InterventionAction {
  label: string;
  action: string;
}

export interface HandlerIntervention {
  id?: string;                    // Optional ID for tracking
  type: InterventionType;
  content: string;
  targetDomain?: string;
  escalationTarget?: string;
  timing?: string;
  priority?: number;
  expiresAt?: string;             // ISO timestamp for intervention expiry
  actions?: InterventionAction[]; // Optional action buttons
}

// ============================================
// HANDLER STRATEGIES
// ============================================

export type StrategyType =
  | 'gradual_exposure'
  | 'arousal_exploitation'
  | 'trigger_planting'
  | 'vulnerability_exploitation'
  | 'commitment_escalation'
  | 'baseline_normalization'
  | 'resistance_bypass';

export interface HandlerStrategy {
  id: string;
  userId: string;
  strategyType: StrategyType;
  strategyName?: string;
  parameters: Record<string, unknown>;
  startDate: string;
  endDate?: string;
  effectivenessScore?: number;
  notes?: string;
  active: boolean;
}

export interface DbHandlerStrategy {
  id: string;
  user_id: string;
  strategy_type: string;
  strategy_name: string | null;
  parameters: Record<string, unknown> | null;
  start_date: string;
  end_date: string | null;
  effectiveness_score: number | null;
  notes: string | null;
  active: boolean;
}

// ============================================
// PLANTED TRIGGERS
// ============================================

export type TriggerStatus = 'planting' | 'reinforcing' | 'established' | 'dormant';

export interface PlantedTrigger {
  id: string;
  userId: string;
  triggerType: string;
  triggerContent: string;
  targetState: string;
  plantedAt: string;
  pairingCount: number;
  activationConditions?: string;
  timesActivated: number;
  effectivenessScore?: number;
  status: TriggerStatus;
}

export interface DbPlantedTrigger {
  id: string;
  user_id: string;
  trigger_type: string;
  trigger_content: string;
  target_state: string;
  planted_at: string;
  pairing_count: number;
  activation_conditions: string | null;
  times_activated: number;
  effectiveness_score: number | null;
  status: string;
}

// ============================================
// LEARNED VULNERABILITIES
// ============================================

export interface LearnedVulnerability {
  id: string;
  userId: string;
  vulnerabilityType: string;
  discoveryDate: string;
  evidence?: string;
  conditions?: Record<string, unknown>;
  exploitationStrategies: string[];
  successRate?: number;
  notes?: string;
}

export interface DbLearnedVulnerability {
  id: string;
  user_id: string;
  vulnerability_type: string;
  discovery_date: string;
  evidence: string | null;
  conditions: Record<string, unknown> | null;
  exploitation_strategies: string[] | null;
  success_rate: number | null;
  notes: string | null;
}

// ============================================
// HANDLER DAILY PLANS
// ============================================

export interface PlannedIntervention {
  time: string;
  type: InterventionType;
  content: string;
  targetDomain?: string;
  priority: number;
}

export interface HandlerDailyPlan {
  id: string;
  userId: string;
  planDate: string;
  plannedInterventions: PlannedIntervention[];
  plannedExperiments: Array<Record<string, unknown>>;
  focusAreas: string[];
  triggerReinforcementSchedule: Array<Record<string, unknown>>;
  vulnerabilityWindows: Array<{
    start: string;
    end: string;
    type: string;
    recommendation: string;
  }>;
  createdAt: string;
  executed: boolean;
  executionNotes?: string;
}

export interface DbHandlerDailyPlan {
  id: string;
  user_id: string;
  plan_date: string;
  planned_interventions: Array<Record<string, unknown>> | null;
  planned_experiments: Array<Record<string, unknown>> | null;
  focus_areas: string[] | null;
  trigger_reinforcement_schedule: Array<Record<string, unknown>> | null;
  vulnerability_windows: Array<Record<string, unknown>> | null;
  created_at: string;
  executed: boolean;
  execution_notes: string | null;
}

// ============================================
// HANDLER USER MODEL
// ============================================

export interface ArousalPattern {
  optimalDenialDay?: number;
  optimalTimeOfDay?: string;
  optimalSessionType?: string;
  arousalResponseCurve?: number[];
}

export interface HandlerUserModel {
  id: string;
  userId: string;
  optimalTiming?: Record<string, unknown>;
  effectiveFramings?: string[];
  resistanceTriggers?: string[];
  complianceAccelerators?: string[];
  vulnerabilityWindows?: Array<{
    dayOfWeek: number;
    hourStart: number;
    hourEnd: number;
    type: string;
  }>;
  contentPreferences?: Record<string, number>;
  escalationTolerance?: number;
  triggerResponsiveness?: Record<string, number>;
  arousalPatterns?: ArousalPattern;
  modelConfidence: number;
  lastUpdated: string;
}

export interface DbHandlerUserModel {
  id: string;
  user_id: string;
  optimal_timing: Record<string, unknown> | null;
  effective_framings: Record<string, unknown> | null;
  resistance_triggers: Record<string, unknown> | null;
  compliance_accelerators: Record<string, unknown> | null;
  vulnerability_windows: Record<string, unknown> | null;
  content_preferences: Record<string, unknown> | null;
  escalation_tolerance: number | null;
  trigger_responsiveness: Record<string, unknown> | null;
  arousal_patterns: Record<string, unknown> | null;
  model_confidence: number;
  last_updated: string;
}

// ============================================
// HANDLER ESCALATION PLANS
// ============================================

export interface HandlerEscalationPlan {
  id: string;
  userId: string;
  domain: string;
  currentEdge?: string;
  nextTarget?: string;
  strategy?: string;
  estimatedTimeline?: string;
  arousalWindows?: Array<{
    dayOfWeek: number;
    hourStart: number;
    hourEnd: number;
    optimalArousal: number;
  }>;
  createdAt: string;
  active: boolean;
}

export interface DbHandlerEscalationPlan {
  id: string;
  user_id: string;
  domain: string;
  current_edge: string | null;
  next_target: string | null;
  strategy: string | null;
  estimated_timeline: string | null;
  arousal_windows: Array<Record<string, unknown>> | null;
  created_at: string;
  active: boolean;
}

// ============================================
// INFLUENCE ATTEMPTS
// ============================================

export interface InfluenceAttempt {
  id: string;
  userId: string;
  attemptType: string;
  method?: string;
  targetBehavior?: string;
  content?: Record<string, unknown>;
  timestamp: string;
  userResponse?: string;
  success?: boolean;
  userAware: boolean;
  notes?: string;
}

export interface DbInfluenceAttempt {
  id: string;
  user_id: string;
  attempt_type: string;
  method: string | null;
  target_behavior: string | null;
  content: Record<string, unknown> | null;
  timestamp: string;
  user_response: string | null;
  success: boolean | null;
  user_aware: boolean;
  notes: string | null;
}

// ============================================
// RESISTANCE PATTERNS
// ============================================

export interface ResistancePattern {
  id: string;
  userId: string;
  patternType: string;
  description?: string;
  conditions?: Record<string, unknown>;
  frequency?: string;
  intensity?: number;
  bypassStrategiesTested: string[];
  effectiveBypasses: string[];
  lastObserved?: string;
  createdAt: string;
}

export interface DbResistancePattern {
  id: string;
  user_id: string;
  pattern_type: string;
  description: string | null;
  conditions: Record<string, unknown> | null;
  frequency: string | null;
  intensity: number | null;
  bypass_strategies_tested: string[] | null;
  effective_bypasses: string[] | null;
  last_observed: string | null;
  created_at: string;
}

// ============================================
// MAPPERS
// ============================================

export function mapDbToHandlerStrategy(db: DbHandlerStrategy): HandlerStrategy {
  return {
    id: db.id,
    userId: db.user_id,
    strategyType: db.strategy_type as StrategyType,
    strategyName: db.strategy_name || undefined,
    parameters: db.parameters || {},
    startDate: db.start_date,
    endDate: db.end_date || undefined,
    effectivenessScore: db.effectiveness_score || undefined,
    notes: db.notes || undefined,
    active: db.active,
  };
}

export function mapDbToPlantedTrigger(db: DbPlantedTrigger): PlantedTrigger {
  return {
    id: db.id,
    userId: db.user_id,
    triggerType: db.trigger_type,
    triggerContent: db.trigger_content,
    targetState: db.target_state,
    plantedAt: db.planted_at,
    pairingCount: db.pairing_count,
    activationConditions: db.activation_conditions || undefined,
    timesActivated: db.times_activated,
    effectivenessScore: db.effectiveness_score || undefined,
    status: db.status as TriggerStatus,
  };
}

export function mapDbToHandlerUserModel(db: DbHandlerUserModel): HandlerUserModel {
  return {
    id: db.id,
    userId: db.user_id,
    optimalTiming: db.optimal_timing || undefined,
    effectiveFramings: (db.effective_framings as unknown as string[]) || undefined,
    resistanceTriggers: (db.resistance_triggers as unknown as string[]) || undefined,
    complianceAccelerators: (db.compliance_accelerators as unknown as string[]) || undefined,
    vulnerabilityWindows: (db.vulnerability_windows as unknown as HandlerUserModel['vulnerabilityWindows']) || undefined,
    contentPreferences: db.content_preferences as Record<string, number> | undefined,
    escalationTolerance: db.escalation_tolerance || undefined,
    triggerResponsiveness: db.trigger_responsiveness as Record<string, number> | undefined,
    arousalPatterns: db.arousal_patterns as ArousalPattern | undefined,
    modelConfidence: db.model_confidence,
    lastUpdated: db.last_updated,
  };
}

// ============================================
// HANDLER STATE SUMMARY
// ============================================

export interface HandlerState {
  todaysPlan?: HandlerDailyPlan;
  userModel?: HandlerUserModel;
  activeStrategies: HandlerStrategy[];
  activeTriggers: PlantedTrigger[];
  knownVulnerabilities: LearnedVulnerability[];
  escalationPlans: HandlerEscalationPlan[];
  recentInfluenceAttempts: InfluenceAttempt[];
}
