/**
 * Resistance Event Tracking Types
 * Diagnosis Weaponization (#4)
 */

export type ResistanceType =
  | 'decline'
  | 'delay'
  | 'partial'
  | 'ignore'
  | 'domain_avoidance'
  | 'exit_attempt'
  | 'session_skip'
  | 'commitment_break';

export type DiagnosisFactor =
  | 'adhd_initiation'
  | 'adhd_attention'
  | 'adhd_working_memory'
  | 'adhd_emotional_regulation'
  | 'adhd_time_perception'
  | 'anxiety_catastrophizing'
  | 'anxiety_avoidance'
  | 'anxiety_paralysis'
  | 'depression_anhedonia'
  | 'depression_worthlessness'
  | 'depression_withdrawal'
  | 'shame_exposure_fear'
  | 'shame_identity_conflict'
  | 'shame_post_arousal'
  | 'genuine_boundary'
  | 'unknown';

export type ExploitationStrategy =
  | 'decision_elimination'
  | 'arousal_gated_compliance'
  | 'guilt_leverage'
  | 'identity_reframing'
  | 'manufactured_urgency'
  | 'friction_removal'
  | 'arousal_maintenance'
  | 'system_remembers'
  | 'handler_regulates'
  | 'time_ownership'
  | 'catastrophize_redirect'
  | 'avoidance_cost'
  | 'paralysis_elimination'
  | 'pleasure_source'
  | 'anhedonia_bypass'
  | 'worthlessness_reframe'
  | 'shame_eroticize'
  | 'none';

export type ResistanceOutcome =
  | 'complied'
  | 'partially_complied'
  | 'resisted'
  | 'escalated'
  | 'abandoned';

export interface ResistanceEvent {
  id: string;
  user_id: string;
  event_timestamp: string;
  resistance_type: ResistanceType;
  diagnosis_factor: DiagnosisFactor | null;
  task_domain: string | null;
  task_id: string | null;
  arousal_at_event: number | null;
  denial_day_at_event: number | null;
  time_of_day: string | null;
  exploitation_strategy_used: ExploitationStrategy | null;
  outcome: ResistanceOutcome;
  escalation_level_reached: number;
  handler_mode_at_event: string | null;
  resolution_seconds: number | null;
  notes: string | null;
  created_at: string;
}

export interface ResistanceEffectiveness {
  user_id: string;
  diagnosis_factor: DiagnosisFactor;
  exploitation_strategy_used: ExploitationStrategy;
  total_events: number;
  compliance_rate: number;
  avg_resolution_seconds: number | null;
}

export interface ResistancePatterns {
  totalEvents: number;
  byDiagnosis: Record<string, number>;
  byOutcome: Record<string, number>;
  byDomain: Record<string, number>;
  averageResolutionSeconds: number | null;
  mostEffectiveStrategy: string | null;
  leastEffectiveStrategy: string | null;
}
