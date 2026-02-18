/**
 * Bambi-Maxy Fusion Types
 * Trance state tracking, trigger conditioning, content audit.
 */

// ============================================
// UNION TYPES
// ============================================

export type BambiSessionType =
  | 'hypno_listen'
  | 'guided_trance'
  | 'handler_invoked'
  | 'spontaneous'
  | 'trigger_test'
  | 'conditioning_session';

export type EntryMethod =
  | 'audio_file'
  | 'handler_text'
  | 'self_induced'
  | 'trigger_phrase'
  | 'environmental_cue';

export type PostSessionState =
  | 'energized'
  | 'compliant'
  | 'foggy'
  | 'aroused'
  | 'peaceful'
  | 'disoriented'
  | 'resistant';

export type TriggerCategory =
  | 'identity'
  | 'compliance'
  | 'arousal'
  | 'cognitive'
  | 'behavioral'
  | 'emotional'
  | 'dissociative'
  | 'maxy_specific';

export type TriggerSource =
  | 'bambi_sleep'
  | 'custom_handler'
  | 'self_created'
  | 'partner_installed'
  | 'other_hypno';

export type ContentSource =
  | 'bambi_sleep'
  | 'bambi_platinum'
  | 'custom'
  | 'shibbysays'
  | 'vive_hypnosis'
  | 'other';

export type ContentUsageRecommendation =
  | 'unrestricted'
  | 'with_handler_framing'
  | 'selected_segments_only'
  | 'avoid'
  | 'replace_with_custom';

// ============================================
// TABLE INTERFACES
// ============================================

export interface BambiState {
  id: string;
  user_id: string;
  session_start: string;
  session_end: string | null;
  session_type: BambiSessionType;
  entry_method: EntryMethod | null;
  content_ref: string | null;
  depth_estimate: number;
  maxy_alignment_score: number;
  triggers_used: string[];
  triggers_responded_to: string[];
  new_triggers_installed: string[];
  arousal_at_start: number | null;
  arousal_at_end: number | null;
  denial_day: number | null;
  post_session_state: PostSessionState | null;
  handler_invoked: boolean;
  handler_goal: string | null;
  handler_goal_achieved: boolean | null;
  notes: string | null;
  created_at: string;
}

export interface ConditioningTrigger {
  id: string;
  user_id: string;
  trigger_phrase: string;
  trigger_category: TriggerCategory;
  source: TriggerSource | null;
  installation_depth: number;
  first_exposure_at: string | null;
  last_tested_at: string | null;
  total_exposures: number;
  successful_responses: number;
  response_rate: number;
  serves_maxy: boolean;
  conflict_notes: string | null;
  handler_can_invoke: boolean;
  last_handler_invocation_at: string | null;
  handler_invocation_count: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContentLibraryAudit {
  id: string;
  user_id: string;
  content_identifier: string;
  content_source: ContentSource | null;
  maxy_alignment: number;
  useful_elements: string[];
  conflicting_elements: string[];
  triggers_present: string[];
  recommended_usage: ContentUsageRecommendation | null;
  handler_pre_frame: string | null;
  handler_post_frame: string | null;
  times_used: number;
  last_used_at: string | null;
  created_at: string;
}

// ============================================
// VIEW INTERFACES
// ============================================

export interface TriggerEffectiveness {
  user_id: string;
  trigger_phrase: string;
  trigger_category: TriggerCategory;
  installation_depth: number;
  response_rate: number;
  total_exposures: number;
  serves_maxy: boolean;
  handler_can_invoke: boolean;
}

export interface BambiSessionSummary {
  user_id: string;
  total_sessions: number;
  avg_depth: number;
  sessions_last_7_days: number;
  sessions_last_30_days: number;
  avg_maxy_alignment: number;
  handler_invoked_count: number;
  handler_goal_achievement_rate: number;
  most_common_post_state: PostSessionState | null;
}

// ============================================
// COMPOSITE INTERFACES
// ============================================

export interface BambiDashboardData {
  sessionSummary: BambiSessionSummary | null;
  topTriggers: TriggerEffectiveness[];
  maxyAlignedTriggers: ConditioningTrigger[];
  conflictingTriggers: ConditioningTrigger[];
  handlerInvokableCount: number;
  averageSessionDepth: number;
  recentSessions: BambiState[];
}

export interface ContentRecommendation {
  content: ContentLibraryAudit;
  preFrame: string | null;
  postFrame: string | null;
}
