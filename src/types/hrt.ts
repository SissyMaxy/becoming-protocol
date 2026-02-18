/**
 * HRT Pipeline Types
 * 6-phase progression with sober checkpoints and Gina gating
 */

// ============================================
// UNION TYPES
// ============================================

export type HrtPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type GinaAwarenessLevel =
  | 'unaware'
  | 'suspects'
  | 'informed'
  | 'supportive'
  | 'participating';

export type DoseType =
  | 'estradiol_oral'
  | 'estradiol_sublingual'
  | 'estradiol_patch'
  | 'estradiol_injection'
  | 'spironolactone'
  | 'finasteride'
  | 'progesterone'
  | 'other';

export type EmotionalState =
  | 'euphoric'
  | 'positive'
  | 'neutral'
  | 'anxious'
  | 'dysphoric'
  | 'conflicted'
  | 'peaceful';

export type CheckpointType =
  | 'phase_entry'
  | 'phase_exit'
  | 'weekly_check'
  | 'gina_gate'
  | 'final_decision'
  | 'regret_check';

// ============================================
// TABLE INTERFACES
// ============================================

export interface HrtPipeline {
  id: string;
  user_id: string;
  current_phase: HrtPhase;
  phase_entered_at: string;
  phase_1_started_at: string | null;
  phase_1_completed_at: string | null;
  phase_2_started_at: string | null;
  phase_2_completed_at: string | null;
  phase_3_started_at: string | null;
  phase_3_completed_at: string | null;
  phase_4_started_at: string | null;
  phase_4_completed_at: string | null;
  phase_5_started_at: string | null;
  phase_5_completed_at: string | null;
  phase_6_started_at: string | null;
  sober_checkpoints_passed: number;
  last_sober_checkpoint_at: string | null;
  gina_awareness_level: GinaAwarenessLevel;
  gina_awareness_required_for_phase: number;
  gina_gate_passed: boolean;
  therapist_discussed: boolean;
  therapist_approved: boolean;
  endocrinologist_identified: boolean;
  appointment_scheduled: boolean;
  appointment_date: string | null;
  prescription_obtained: boolean;
  first_dose_date: string | null;
  blockers_identified: Array<{ blocker: string; added_at: string }>;
  blockers_resolved: Array<{ blocker: string; resolved_at: string }>;
  motivation_statements: Array<{ statement: string; arousal_level: number; recorded_at: string }>;
  fear_inventory: Array<{ fear: string; added_at: string }>;
  updated_at: string;
  created_at: string;
}

export interface HrtDailyLog {
  id: string;
  user_id: string;
  log_date: string;
  phase_at_log: number;
  dose_taken: boolean | null;
  dose_type: DoseType | null;
  dose_amount: string | null;
  missed_dose: boolean;
  physical_changes_noted: string | null;
  emotional_state: EmotionalState | null;
  arousal_level_at_log: number | null;
  was_sober: boolean;
  journal_entry: string | null;
  photo_taken: boolean;
  photo_ref: string | null;
  side_effects: string | null;
  energy_level: number | null;
  skin_changes: string | null;
  breast_sensitivity: number | null;
  mood_stability: number | null;
  libido_level: number | null;
  created_at: string;
}

export interface HrtSoberCheckpoint {
  id: string;
  user_id: string;
  checkpoint_phase: number;
  checkpoint_type: CheckpointType;
  arousal_level: number;
  was_sober: boolean;
  denial_day: number | null;
  statement: string;
  desire_level: number;
  confidence_level: number;
  fear_level: number;
  handler_prompted: boolean;
  passed: boolean;
  failure_reason: string | null;
  created_at: string;
}

// ============================================
// VIEW / COMPOSITE INTERFACES
// ============================================

export interface HrtProgressSummary {
  user_id: string;
  current_phase: HrtPhase;
  days_in_current_phase: number;
  total_sober_checkpoints_passed: number;
  total_daily_logs: number;
  total_doses_taken: number;
  days_on_hrt: number;
  gina_awareness_level: GinaAwarenessLevel;
  therapist_approved: boolean;
  has_appointment: boolean;
  avg_desire_level_sober: number | null;
  avg_emotional_state_on_hrt: EmotionalState | null;
}

export interface PhaseAdvancementResult {
  advanced: boolean;
  newPhase?: number;
  unmetRequirements?: string[];
  requirementsForNext?: string[];
}

export interface DoseStreak {
  currentStreak: number;
  longestStreak: number;
  totalDoses: number;
  missedDoses: number;
}
