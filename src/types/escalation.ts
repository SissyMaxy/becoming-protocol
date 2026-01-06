// Escalation System Types
// Types for the perpetual escalation architecture

// ============================================
// ESCALATION DOMAINS
// ============================================

export type EscalationDomain =
  | 'identity'
  | 'presentation'
  | 'sissification'
  | 'chastity'
  | 'denial'
  | 'hypno'
  | 'sexual_service'
  | 'gina_dynamic';

export const ESCALATION_DOMAINS: EscalationDomain[] = [
  'identity',
  'presentation',
  'sissification',
  'chastity',
  'denial',
  'hypno',
  'sexual_service',
  'gina_dynamic',
];

export const ESCALATION_DOMAIN_LABELS: Record<EscalationDomain, string> = {
  identity: 'Identity',
  presentation: 'Presentation',
  sissification: 'Sissification',
  chastity: 'Chastity',
  denial: 'Denial',
  hypno: 'Hypno Depth',
  sexual_service: 'Sexual Service',
  gina_dynamic: 'Gina Dynamic',
};

export const DOMAIN_MAX_LEVELS: Record<EscalationDomain, number> = {
  identity: 5,
  presentation: 6,
  sissification: 7,
  chastity: 5,
  denial: 6,
  hypno: 5,
  sexual_service: 8,
  gina_dynamic: 7,
};

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
// CONTENT ESCALATION
// ============================================

export type ContentTheme =
  | 'feminization'
  | 'sissification'
  | 'service'
  | 'humiliation'
  | 'bbc'
  | 'gangbang'
  | 'gloryhole'
  | 'submission'
  | 'hypno'
  | 'chastity';

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
