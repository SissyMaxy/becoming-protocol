/**
 * Gina Discovery Engineering Types
 * Investment tracking, readiness scoring, marriage restructuring.
 */

export type GinaInvestmentType =
  | 'unknowing_participation'
  | 'active_participation'
  | 'verbal_approval'
  | 'physical_participation'
  | 'financial_participation'
  | 'initiated_by_gina'
  | 'defended_to_others'
  | 'identity_reinforcement';

export type GinaDiscoveryPhase =
  | 'pre_awareness'
  | 'ambient_exposure'
  | 'plausible_deniability'
  | 'soft_discovery'
  | 'guided_conversation'
  | 'full_disclosure'
  | 'active_partnership';

export type MarriageMilestoneKey =
  | 'gina_sees_feminine_item'
  | 'gina_comments_positively'
  | 'gina_purchases_feminine_item'
  | 'gina_uses_pet_name'
  | 'gina_initiates_dynamic'
  | 'gina_directs_activity'
  | 'gina_discusses_with_others'
  | 'gina_defends_dynamic'
  | 'gina_sets_expectations'
  | 'gina_takes_control';

export type PlannedDiscoveryType =
  | 'organic_discovery'
  | 'engineered_stumble'
  | 'guided_conversation'
  | 'direct_disclosure';

export interface GinaInvestment {
  id: string;
  user_id: string;
  event_timestamp: string;
  investment_type: GinaInvestmentType;
  channel: string | null;
  description: string;
  investment_weight: number;
  arousal_context: boolean;
  gina_initiated: boolean;
  gina_aware: boolean;
  handler_seeded: boolean;
  evidence_ref: string | null;
  notes: string | null;
  created_at: string;
}

export interface GinaDiscoveryState {
  id: string;
  user_id: string;
  current_readiness_score: number;
  readiness_factors: Record<string, number>;
  discovery_phase: GinaDiscoveryPhase;
  last_assessment_at: string | null;
  total_investments: number;
  total_investment_weight: number;
  gina_initiated_count: number;
  channels_with_positive_seeds: number;
  highest_channel_rung: number;
  discovery_risk_events: unknown[];
  planned_discovery_type: PlannedDiscoveryType | null;
  planned_discovery_date: string | null;
  blocker_notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface MarriageRestructuringMilestone {
  id: string;
  user_id: string;
  milestone_key: MarriageMilestoneKey;
  achieved: boolean;
  achieved_at: string | null;
  evidence_description: string | null;
  gina_initiated: boolean;
  ratchet_power: number;
  created_at: string;
}

export interface GinaInvestmentSummary {
  user_id: string;
  total_investments: number;
  total_weight: number;
  gina_initiated_count: number;
  gina_initiated_weight: number;
  investments_by_channel: Record<string, number>;
  investments_last_7_days: number;
  investments_last_30_days: number;
  average_weight: number;
}

export interface ReadinessScore {
  score: number;
  factors: Record<string, number>;
  phase: GinaDiscoveryPhase;
  recommendation: string;
}

export interface ParallelSeedSuggestion {
  channel: string;
  currentRung: number;
  suggestedAction: string;
  rationale: string;
  estimatedWeight: number;
}
