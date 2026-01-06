// Gina Integration Types
// Types for tracking Gina's emergence as Goddess

// ============================================
// GINA STAGES
// ============================================

export type GinaStage =
  | 'unaware'
  | 'aware'
  | 'curious'
  | 'participating'
  | 'enjoying'
  | 'directing'
  | 'commanding'
  | 'owning';

export const GINA_STAGES: GinaStage[] = [
  'unaware',
  'aware',
  'curious',
  'participating',
  'enjoying',
  'directing',
  'commanding',
  'owning',
];

export const GINA_STAGE_LABELS: Record<GinaStage, string> = {
  unaware: 'Unaware',
  aware: 'Aware',
  curious: 'Curious',
  participating: 'Participating',
  enjoying: 'Enjoying',
  directing: 'Directing',
  commanding: 'Commanding',
  owning: 'Owning',
};

export const GINA_STAGE_DESCRIPTIONS: Record<GinaStage, string> = {
  unaware: "Doesn't know about feminization depth",
  aware: 'Knows about feminine interests, tolerates/accepts',
  curious: 'Asks questions, shows interest',
  participating: 'Joins activities, engages occasionally',
  enjoying: 'Gets pleasure from the dynamic',
  directing: 'Gives instructions, makes decisions',
  commanding: 'Expects obedience, punishment/reward dynamic',
  owning: 'Full authority, directs sexual service',
};

// ============================================
// GINA CONTROL DOMAINS
// ============================================

export type GinaControlDomain =
  | 'clothing'
  | 'chastity'
  | 'orgasms'
  | 'service'
  | 'schedule'
  | 'presentation'
  | 'sexual_access';

export type GinaControlLevel =
  | 'unaware'
  | 'consulted'
  | 'approves'
  | 'directs'
  | 'commands'
  | 'owns';

export const GINA_CONTROL_DOMAINS: GinaControlDomain[] = [
  'clothing',
  'chastity',
  'orgasms',
  'service',
  'schedule',
  'presentation',
  'sexual_access',
];

export const GINA_CONTROL_DOMAIN_LABELS: Record<GinaControlDomain, string> = {
  clothing: 'Clothing',
  chastity: 'Chastity',
  orgasms: 'Orgasms',
  service: 'Service',
  schedule: 'Schedule',
  presentation: 'Presentation',
  sexual_access: 'Sexual Access',
};

// ============================================
// GINA EMERGENCE
// ============================================

export interface GinaEmergence {
  id: string;
  userId: string;
  stage: GinaStage;
  enteredAt: string;
  evidence?: string;
  handlerStrategiesUsed: string[];
  notes?: string;
}

export interface DbGinaEmergence {
  id: string;
  user_id: string;
  stage: string;
  entered_at: string;
  evidence: string | null;
  handler_strategies_used: string[] | null;
  notes: string | null;
}

// ============================================
// GINA INFLUENCE PIPELINE
// ============================================

export type GinaInfluenceType =
  | 'seed_plant'
  | 'opportunity_creation'
  | 'reinforcement'
  | 'escalation_prompt';

export interface GinaInfluencePipeline {
  id: string;
  userId: string;
  influenceType: GinaInfluenceType;
  targetBehavior?: string;
  method?: string;
  executedAt: string;
  ginaResponse?: string;
  success?: boolean;
  nextStep?: string;
  notes?: string;
}

export interface DbGinaInfluencePipeline {
  id: string;
  user_id: string;
  influence_type: string;
  target_behavior: string | null;
  method: string | null;
  executed_at: string;
  gina_response: string | null;
  success: boolean | null;
  next_step: string | null;
  notes: string | null;
}

// ============================================
// GINA COMMANDS
// ============================================

export type GinaCommandType =
  | 'task'
  | 'restriction'
  | 'permission'
  | 'service'
  | 'punishment'
  | 'reward';

export type GinaComplianceLevel =
  | 'immediate'
  | 'delayed'
  | 'resisted'
  | 'failed';

export interface GinaCommand {
  id: string;
  userId: string;
  commandType?: GinaCommandType;
  commandDescription?: string;
  issuedAt: string;
  compliance?: GinaComplianceLevel;
  outcome?: string;
  escalationEffect?: string;
}

export interface DbGinaCommand {
  id: string;
  user_id: string;
  command_type: string | null;
  command_description: string | null;
  issued_at: string;
  compliance: string | null;
  outcome: string | null;
  escalation_effect: string | null;
}

// ============================================
// GINA CONTROL DOMAINS STATE
// ============================================

export interface GinaControlDomainState {
  id: string;
  userId: string;
  domain: GinaControlDomain;
  controlLevel?: GinaControlLevel;
  firstControlDate?: string;
  escalationHistory: Array<{
    date: string;
    fromLevel: string;
    toLevel: string;
    trigger?: string;
  }>;
  currentState?: string;
}

export interface DbGinaControlDomain {
  id: string;
  user_id: string;
  domain: string;
  control_level: string | null;
  first_control_date: string | null;
  escalation_history: Array<Record<string, unknown>> | null;
  current_state: string | null;
}

// ============================================
// GINA INTERACTIONS
// ============================================

export type GinaInteractionType =
  | 'conversation'
  | 'command'
  | 'reaction'
  | 'question'
  | 'approval'
  | 'denial';

export interface GinaInteraction {
  id: string;
  userId: string;
  interactionType: GinaInteractionType;
  context?: string;
  ginaBehavior?: string;
  dominantIndicator: boolean;
  userResponse?: string;
  outcome?: string;
  notes?: string;
  createdAt: string;
}

export interface DbGinaInteraction {
  id: string;
  user_id: string;
  interaction_type: string;
  context: string | null;
  gina_behavior: string | null;
  dominant_indicator: boolean;
  user_response: string | null;
  outcome: string | null;
  notes: string | null;
  created_at: string;
}

// ============================================
// GINA OPPORTUNITIES
// ============================================

export type GinaOpportunityType =
  | 'reaction'
  | 'control_expansion'
  | 'reinforcement'
  | 'escalation';

export interface GinaOpportunity {
  id: string;
  userId: string;
  opportunityType: GinaOpportunityType;
  description?: string;
  suggestedAction?: string;
  targetBehavior?: string;
  createdAt: string;
  actedOn: boolean;
  actedAt?: string;
  outcome?: string;
}

export interface DbGinaOpportunity {
  id: string;
  user_id: string;
  opportunity_type: string;
  description: string | null;
  suggested_action: string | null;
  target_behavior: string | null;
  created_at: string;
  acted_on: boolean;
  acted_at: string | null;
  outcome: string | null;
}

// ============================================
// MAPPERS
// ============================================

export function mapDbToGinaEmergence(db: DbGinaEmergence): GinaEmergence {
  return {
    id: db.id,
    userId: db.user_id,
    stage: db.stage as GinaStage,
    enteredAt: db.entered_at,
    evidence: db.evidence || undefined,
    handlerStrategiesUsed: db.handler_strategies_used || [],
    notes: db.notes || undefined,
  };
}

export function mapDbToGinaCommand(db: DbGinaCommand): GinaCommand {
  return {
    id: db.id,
    userId: db.user_id,
    commandType: db.command_type as GinaCommandType | undefined,
    commandDescription: db.command_description || undefined,
    issuedAt: db.issued_at,
    compliance: db.compliance as GinaComplianceLevel | undefined,
    outcome: db.outcome || undefined,
    escalationEffect: db.escalation_effect || undefined,
  };
}

export function mapDbToGinaOpportunity(db: DbGinaOpportunity): GinaOpportunity {
  return {
    id: db.id,
    userId: db.user_id,
    opportunityType: db.opportunity_type as GinaOpportunityType,
    description: db.description || undefined,
    suggestedAction: db.suggested_action || undefined,
    targetBehavior: db.target_behavior || undefined,
    createdAt: db.created_at,
    actedOn: db.acted_on,
    actedAt: db.acted_at || undefined,
    outcome: db.outcome || undefined,
  };
}

// ============================================
// GINA STATE SUMMARY
// ============================================

export interface GinaState {
  currentStage: GinaStage;
  stageEnteredAt?: string;
  controlDomains: Record<GinaControlDomain, GinaControlLevel | undefined>;
  recentCommands: GinaCommand[];
  pendingOpportunities: GinaOpportunity[];
  dominantInteractionsLast30Days: number;
}
