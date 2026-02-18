// Escalation System Types
// Types for the perpetual escalation architecture
//
// CORE DESIGN PRINCIPLE:
// Arousal is the engine that drives all transformation.
// Identity shifts deeper the more aroused you become.
//
// HIERARCHY:
// 1. DRIVER DOMAINS (arousal-based) - These create the receptive state
//    - Arousal: The primary engine (edges, gooning, denial, hypno)
//    - Sissification: Practices reinforced through arousal
//    - Submission: Obedience deepened during aroused states
//
// 2. OUTCOME DOMAINS (shaped by arousal) - These are the results
//    - Identity: Shifts extracted during peak arousal states
//    - Feminization: Lowest priority, follows from above

// ============================================
// ESCALATION DOMAINS
// ============================================

export type EscalationDomain =
  | 'arousal'
  | 'sissification'
  | 'submission'
  | 'identity'
  | 'feminization';

// Domain tier determines whether it's a driver or outcome
export type DomainTier = 'driver' | 'outcome';

export const DOMAIN_TIERS: Record<EscalationDomain, DomainTier> = {
  arousal: 'driver',
  sissification: 'driver',
  submission: 'driver',
  identity: 'outcome',
  feminization: 'outcome',
};

// Priority order: lower number = higher priority
export const DOMAIN_PRIORITY: Record<EscalationDomain, number> = {
  arousal: 1,        // Highest - the engine
  sissification: 2,  // Core practice
  submission: 3,     // Deepening obedience
  identity: 4,       // Outcome of arousal work
  feminization: 5,   // Lowest priority
};

// Domains ordered by priority (for UI display)
export const ESCALATION_DOMAINS: EscalationDomain[] = [
  'arousal',
  'sissification',
  'submission',
  'identity',
  'feminization',
];

// Driver domains only
export const DRIVER_DOMAINS: EscalationDomain[] = [
  'arousal',
  'sissification',
  'submission',
];

// Outcome domains only
export const OUTCOME_DOMAINS: EscalationDomain[] = [
  'identity',
  'feminization',
];

export const ESCALATION_DOMAIN_LABELS: Record<EscalationDomain, string> = {
  arousal: 'Arousal',
  sissification: 'Sissification',
  submission: 'Submission',
  identity: 'Identity',
  feminization: 'Feminization',
};

export const ESCALATION_DOMAIN_DESCRIPTIONS: Record<EscalationDomain, string> = {
  arousal: 'The engine - edges, gooning, denial, hypno trance',
  sissification: 'Sissy practices, training, and lifestyle',
  submission: 'Service, obedience, chastity, handler dynamics',
  identity: 'Self-concept shifts extracted during peak arousal',
  feminization: 'Presentation, voice, movement, appearance',
};

export const DOMAIN_MAX_LEVELS: Record<EscalationDomain, number> = {
  arousal: 10,       // Deep progression - the core engine
  sissification: 8,  // Extensive sissy journey
  submission: 8,     // Deep service progression
  identity: 7,       // Identity shifts (gated by arousal)
  feminization: 5,   // Lower priority, fewer levels
};

export const ESCALATION_DOMAIN_COLORS: Record<EscalationDomain, string> = {
  arousal: '#ef4444',        // Red - Heat, desire, the engine
  sissification: '#f472b6',  // Rose - Sissy pink
  submission: '#6366f1',     // Indigo - Service, depth
  identity: '#8b5cf6',       // Purple - Core self
  feminization: '#ec4899',   // Pink - Feminine appearance
};

export const ESCALATION_DOMAIN_ICONS: Record<EscalationDomain, string> = {
  arousal: 'Flame',
  sissification: 'Sparkles',
  submission: 'Crown',
  identity: 'User',
  feminization: 'Shirt',
};

// ============================================
// AROUSAL GATING FOR OUTCOME DOMAINS
// ============================================
// Identity and Feminization progression require arousal states

export type ArousalGateLevel = 'building' | 'sweet_spot' | 'overload';

export interface OutcomeDomainGate {
  domain: EscalationDomain;
  requiredArousalLevel: ArousalGateLevel;
  requiredArousalDuration?: number; // minutes at arousal level
  description: string;
}

// STRENGTHENED: Identity requires OVERLOAD state for extended duration
// The deeper the arousal, the deeper the identity shift
export const OUTCOME_DOMAIN_GATES: OutcomeDomainGate[] = [
  {
    domain: 'identity',
    requiredArousalLevel: 'overload',
    requiredArousalDuration: 10, // 10 minutes at overload before identity can shift
    description: 'Identity shifts only when completely overwhelmed by arousal',
  },
  {
    domain: 'feminization',
    requiredArousalLevel: 'sweet_spot',
    requiredArousalDuration: 5, // Now requires sweet_spot for 5 min
    description: 'Feminization requires sustained peak arousal',
  },
];

// Helper to check if an outcome domain can progress given current arousal
export function canOutcomeDomainProgress(
  domain: EscalationDomain,
  currentArousalLevel: ArousalGateLevel,
  minutesAtLevel: number = 0
): boolean {
  const tier = DOMAIN_TIERS[domain];
  if (tier === 'driver') return true; // Drivers always can progress

  const gate = OUTCOME_DOMAIN_GATES.find(g => g.domain === domain);
  if (!gate) return true;

  const arousalLevels: ArousalGateLevel[] = ['building', 'sweet_spot', 'overload'];
  const requiredIndex = arousalLevels.indexOf(gate.requiredArousalLevel);
  const currentIndex = arousalLevels.indexOf(currentArousalLevel);

  if (currentIndex < requiredIndex) return false;
  if (gate.requiredArousalDuration && minutesAtLevel < gate.requiredArousalDuration) return false;

  return true;
}

// ============================================
// ESCALATION STATE
// ============================================

export interface EscalationState {
  id: string;
  userId: string;
  domain: EscalationDomain;
  currentLevel: number;
  currentDescription?: string;
  nextLevelDescription?: string;
  lastEscalationDate?: string;
  escalationCount: number;
  createdAt: string;
}

export interface DbEscalationState {
  id: string;
  user_id: string;
  domain: string;
  current_level: number;
  current_description: string | null;
  next_level_description: string | null;
  last_escalation_date: string | null;
  escalation_count: number;
  created_at: string;
}

// ============================================
// ESCALATION EVENTS
// ============================================

export type TriggerMethod = 'arousal_commitment' | 'handler_push' | 'gina_directed' | 'organic';

export interface EscalationEvent {
  id: string;
  userId: string;
  domain: EscalationDomain;
  fromLevel: number;
  toLevel: number;
  description?: string;
  triggerMethod?: TriggerMethod;
  arousalLevelAtCommitment?: number;
  resistanceEncountered: boolean;
  resistanceBypassed?: boolean;
  createdAt: string;
}

export interface DbEscalationEvent {
  id: string;
  user_id: string;
  domain: string;
  from_level: number;
  to_level: number;
  description: string | null;
  trigger_method: string | null;
  arousal_level_at_commitment: number | null;
  resistance_encountered: boolean;
  resistance_bypassed: boolean | null;
  created_at: string;
}

// ============================================
// BOUNDARY DISSOLUTION
// ============================================

export type DissolutionMethod = 'gradual_exposure' | 'arousal_bypass' | 'hypno_conditioning' | 'gina_command';

export interface BoundaryDissolution {
  id: string;
  userId: string;
  boundaryDescription: string;
  domain?: string;
  firstIdentified: string;
  dissolutionStarted?: string;
  dissolutionCompleted?: string;
  method?: DissolutionMethod;
  nowBaseline: boolean;
  notes?: string;
}

export interface DbBoundaryDissolution {
  id: string;
  user_id: string;
  boundary_description: string;
  domain: string | null;
  first_identified: string;
  dissolution_started: string | null;
  dissolution_completed: string | null;
  method: string | null;
  now_baseline: boolean;
  notes: string | null;
}

// ============================================
// SERVICE PROGRESSION
// ============================================

export type ServiceStage =
  | 'fantasy'
  | 'content_consumption'
  | 'online_interaction'
  | 'first_encounter'
  | 'regular_service'
  | 'organized_availability'
  | 'gina_directed';

export const SERVICE_STAGES: ServiceStage[] = [
  'fantasy',
  'content_consumption',
  'online_interaction',
  'first_encounter',
  'regular_service',
  'organized_availability',
  'gina_directed',
];

export const SERVICE_STAGE_LABELS: Record<ServiceStage, string> = {
  fantasy: 'Fantasy Only',
  content_consumption: 'Content Consumption',
  online_interaction: 'Online Interaction',
  first_encounter: 'First Encounter',
  regular_service: 'Regular Service',
  organized_availability: 'Organized Availability',
  gina_directed: 'Gina-Directed',
};

export interface ServiceProgression {
  id: string;
  userId: string;
  stage: ServiceStage;
  enteredAt: string;
  activities: string[];
  comfortLevel?: number;
  arousalAssociation?: number;
  notes?: string;
}

export interface DbServiceProgression {
  id: string;
  user_id: string;
  stage: string;
  entered_at: string;
  activities: string[] | null;
  comfort_level: number | null;
  arousal_association: number | null;
  notes: string | null;
}

// ============================================
// SERVICE ENCOUNTERS
// ============================================

export type EncounterType = 'online' | 'anonymous' | 'regular' | 'directed';

export const ENCOUNTER_TYPES: EncounterType[] = [
  'online',
  'anonymous',
  'regular',
  'directed',
];

export const ENCOUNTER_TYPE_LABELS: Record<EncounterType, string> = {
  online: 'Online',
  anonymous: 'Anonymous',
  regular: 'Regular',
  directed: 'Directed by Gina',
};

export const ENCOUNTER_TYPE_COLORS: Record<EncounterType, string> = {
  online: '#3b82f6',
  anonymous: '#6b7280',
  regular: '#8b5cf6',
  directed: '#ef4444',
};

export interface ServiceEncounter {
  id: string;
  userId: string;
  encounterType: EncounterType;
  date: string;
  description?: string;
  ginaAware: boolean;
  ginaDirected: boolean;
  activities: string[];
  psychologicalImpact?: string;
  escalationEffect?: string;
  arousalLevel?: number;
}

export interface DbServiceEncounter {
  id: string;
  user_id: string;
  encounter_type: string;
  date: string;
  description: string | null;
  gina_aware: boolean;
  gina_directed: boolean;
  activities: string[] | null;
  psychological_impact: string | null;
  escalation_effect: string | null;
  arousal_level: number | null;
}

export function mapDbToServiceEncounter(db: DbServiceEncounter): ServiceEncounter {
  return {
    id: db.id,
    userId: db.user_id,
    encounterType: db.encounter_type as EncounterType,
    date: db.date,
    description: db.description || undefined,
    ginaAware: db.gina_aware,
    ginaDirected: db.gina_directed,
    activities: db.activities || [],
    psychologicalImpact: db.psychological_impact || undefined,
    escalationEffect: db.escalation_effect || undefined,
    arousalLevel: db.arousal_level || undefined,
  };
}

// Activity templates by stage
export const STAGE_ACTIVITY_TEMPLATES: Record<ServiceStage, string[]> = {
  fantasy: ['Fantasized about service', 'Wrote service fantasy', 'Dreamed about serving'],
  content_consumption: ['Watched sissy service content', 'Read service erotica', 'Listened to service hypno'],
  online_interaction: ['Chatted with a Dom', 'Cammed for someone', 'Sent photos', 'Received instructions'],
  first_encounter: ['Met someone IRL', 'First service experience', 'Glory hole visit'],
  regular_service: ['Regular service session', 'Scheduled meetup', 'On-call service'],
  organized_availability: ['Available on schedule', 'Multiple partners', 'Structured service'],
  gina_directed: ['Gina sent me to serve', 'Gina arranged encounter', 'Gina directed service'],
};

// ============================================
// CONTENT ESCALATION
// ============================================

// Content themes aligned with the 5 core domains
// Primary themes map to driver domains (arousal, sissification, submission)
// Secondary themes support the primary progression
export type ContentTheme =
  // Arousal domain themes (highest priority)
  | 'gooning'
  | 'edging'
  | 'denial'
  | 'hypno'
  // Sissification domain themes
  | 'sissification'
  | 'sissy_training'
  | 'turning_out'
  // Submission domain themes
  | 'service'
  | 'submission'
  | 'chastity'
  | 'humiliation'
  // Service escalation themes
  | 'bbc'
  | 'gangbang'
  | 'gloryhole'
  // Feminization themes (lowest priority)
  | 'feminization';

// Map content themes to their primary domain
export const CONTENT_THEME_DOMAINS: Record<ContentTheme, EscalationDomain> = {
  gooning: 'arousal',
  edging: 'arousal',
  denial: 'arousal',
  hypno: 'arousal',
  sissification: 'sissification',
  sissy_training: 'sissification',
  turning_out: 'sissification',
  service: 'submission',
  submission: 'submission',
  chastity: 'submission',
  humiliation: 'submission',
  bbc: 'submission',
  gangbang: 'submission',
  gloryhole: 'submission',
  feminization: 'feminization',
};

export interface ContentEscalation {
  id: string;
  userId: string;
  contentType: string;
  theme: string;
  intensityLevel?: number;
  firstExposure: string;
  exposureCount: number;
  currentResponse?: string;
  nextIntensityTarget?: number;
  notes?: string;
}

export interface DbContentEscalation {
  id: string;
  user_id: string;
  content_type: string;
  theme: string;
  intensity_level: number | null;
  first_exposure: string;
  exposure_count: number;
  current_response: string | null;
  next_intensity_target: number | null;
  notes: string | null;
}

// ============================================
// AROUSAL COMMITMENT
// ============================================

export interface ArousalCommitmentExtraction {
  id: string;
  userId: string;
  sessionId?: string;
  arousalLevel: number;
  denialDay?: number;
  commitmentExtracted: string;
  domain?: string;
  escalationMagnitude?: number;
  wouldSoberAgree?: boolean;
  accepted: boolean;
  fulfilled?: boolean;
  becameBaseline: boolean;
  createdAt: string;
}

export interface DbArousalCommitmentExtraction {
  id: string;
  user_id: string;
  session_id: string | null;
  arousal_level: number;
  denial_day: number | null;
  commitment_extracted: string;
  domain: string | null;
  escalation_magnitude: number | null;
  would_sober_agree: boolean | null;
  accepted: boolean;
  fulfilled: boolean | null;
  became_baseline: boolean;
  created_at: string;
}

// ============================================
// ESCALATION LADDER DEFINITIONS
// ============================================

export interface EscalationLadderStep {
  level: number;
  name: string;
  description: string;
  commitmentText?: string;
  requirements?: string[];
}

export interface EscalationLadder {
  domain: EscalationDomain;
  steps: EscalationLadderStep[];
}

// ============================================
// EDGE FINDING
// ============================================

export interface CurrentEdge {
  domain: EscalationDomain;
  currentBaseline: number;
  edgeLocation: number;
  recentResistancePoints: string[];
  dissolvedBoundaries: string[];
  readyToPush: boolean;
}

export interface EscalationReadiness {
  domain: EscalationDomain;
  readinessScore: number; // 0-1
  optimalDenialDay?: number;
  optimalArousalLevel?: number;
  recommendation: 'push_now' | 'wait_for_optimal' | 'build_foundation';
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function mapDbToEscalationState(db: DbEscalationState): EscalationState {
  return {
    id: db.id,
    userId: db.user_id,
    domain: db.domain as EscalationDomain,
    currentLevel: db.current_level,
    currentDescription: db.current_description || undefined,
    nextLevelDescription: db.next_level_description || undefined,
    lastEscalationDate: db.last_escalation_date || undefined,
    escalationCount: db.escalation_count,
    createdAt: db.created_at,
  };
}

export function mapDbToEscalationEvent(db: DbEscalationEvent): EscalationEvent {
  return {
    id: db.id,
    userId: db.user_id,
    domain: db.domain as EscalationDomain,
    fromLevel: db.from_level,
    toLevel: db.to_level,
    description: db.description || undefined,
    triggerMethod: db.trigger_method as TriggerMethod | undefined,
    arousalLevelAtCommitment: db.arousal_level_at_commitment || undefined,
    resistanceEncountered: db.resistance_encountered,
    resistanceBypassed: db.resistance_bypassed || undefined,
    createdAt: db.created_at,
  };
}

// ============================================
// INFINITE ESCALATION — DYNAMIC LEVELS
// ============================================

export interface DynamicTaskTemplate {
  instructionTemplate: string;
  intensityMin: number;
  intensityMax: number;
  durationMin: number;
  durationMax: number;
  completionType: string;
  pointsMin: number;
  pointsMax: number;
}

export interface DynamicLevel {
  id: string;
  user_id: string;
  domain: string;
  level: number;
  title: string;
  description: string;
  entry_requirements: Record<string, unknown>;
  task_templates: DynamicTaskTemplate[];
  intensity_floor: number;
  intensity_ceiling: number | null;
  estimated_duration_days: number | null;
  dependency_domains: Array<{ domain: string; min_level: number }>;
  escalation_triggers: Array<{ condition: string; threshold: number }>;
  generated_by: 'handler' | 'manual' | 'system';
  generated_at: string;
  active: boolean;
  created_at: string;
}

export interface DomainEscalationState {
  id: string;
  user_id: string;
  domain: string;
  current_level: number;
  tasks_completed_at_current: number;
  tasks_completed_total: number;
  current_intensity_avg: number;
  peak_intensity_reached: number;
  level_entered_at: string;
  time_at_current_level: string | null;
  advancement_blocked_by: Array<{ domain: string; requiredLevel: number; currentLevel: number }>;
  advancement_ready: boolean;
  last_assessment_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InfiniteEscalationEvent {
  id: string;
  user_id: string;
  domain: string;
  from_level: number;
  to_level: number;
  trigger_reason: string;
  tasks_completed_at_previous: number | null;
  intensity_at_advancement: number | null;
  arousal_at_advancement: number | null;
  denial_day_at_advancement: number | null;
  handler_initiated: boolean;
  dependency_state: Record<string, unknown>;
  created_at: string;
}

export interface DomainDependency {
  id: string;
  user_id: string;
  domain: string;
  required_level: number;
  depends_on_domain: string;
  depends_on_level: number;
  rationale: string | null;
  handler_generated: boolean;
  active: boolean;
  created_at: string;
}

export interface EscalationOverview {
  domain: string;
  currentLevel: number;
  tasksCompletedAtCurrent: number;
  tasksCompletedTotal: number;
  peakIntensityReached: number;
  advancementReady: boolean;
  daysAtCurrentLevel: number;
  hasDynamicLevels: boolean;
  nextLevelExists: boolean;
}

export interface CrossDomainStatus {
  overallAverageLevel: number;
  lowestLevel: number;
  highestLevel: number;
  domainsAtMax: number;
  totalDomains: number;
}

export interface AdvancementAssessment {
  ready: boolean;
  currentLevel: number;
  blockedBy: Array<{ domain: string; requiredLevel: number; currentLevel: number }>;
  tasksCompleted: number;
  intensityAvg: number;
  recommendation: string;
}
