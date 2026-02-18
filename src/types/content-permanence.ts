/**
 * Content Permanence Tracking Types
 * Irreversibility measurement layer (#3)
 */

// ============================================
// UNION TYPES
// ============================================

export type ContentPermanenceType =
  | 'photo'
  | 'video'
  | 'voice_clip'
  | 'text_post'
  | 'cam_recording'
  | 'live_stream'
  | 'profile_update';

export type PermanencePlatform =
  | 'local_only'
  | 'onlyfans'
  | 'fansly'
  | 'twitter'
  | 'reddit'
  | 'discord'
  | 'other';

export type CopyEstimationMethod =
  | 'platform_analytics'
  | 'handler_estimate'
  | 'manual_input'
  | 'scraper_detection';

export type DeletionOutcome =
  | 'successful'
  | 'partial'
  | 'failed_copies_exist';

// ============================================
// TABLE INTERFACES
// ============================================

export interface ContentPermanence {
  id: string;
  user_id: string;
  content_ref: string;
  content_type: ContentPermanenceType;
  platform: PermanencePlatform | null;
  permanence_tier: number;
  tier_justification: string;
  face_visible: boolean;
  voice_audible: boolean;
  identifying_marks_visible: boolean;
  legal_name_connected: boolean;
  posted_at: string | null;
  estimated_views: number;
  estimated_saves: number;
  estimated_external_copies: number;
  copy_estimation_method: CopyEstimationMethod | null;
  sober_acknowledged: boolean;
  sober_acknowledged_at: string | null;
  sober_arousal_at_acknowledgment: number | null;
  acknowledgment_statement: string | null;
  ratchet_weight: number;
  can_be_deleted: boolean;
  deletion_attempted: boolean;
  deletion_attempted_at: string | null;
  deletion_outcome: DeletionOutcome | null;
  created_at: string;
  updated_at: string;
}

export interface PermanenceAcknowledgment {
  id: string;
  user_id: string;
  content_permanence_id: string;
  acknowledged_at: string;
  arousal_level: number;
  denial_day: number | null;
  statement: string;
  was_sober: boolean;
  handler_prompted: boolean;
  time_since_posting: string | null;
  created_at: string;
}

export interface PermanenceTierTransition {
  id: string;
  user_id: string;
  content_permanence_id: string;
  from_tier: number;
  to_tier: number;
  transition_reason: string;
  sober_at_transition: boolean;
  arousal_at_transition: number | null;
  handler_initiated: boolean;
  created_at: string;
}

// ============================================
// VIEW / COMPOSITE INTERFACES
// ============================================

export interface PermanenceSummary {
  user_id: string;
  total_content_pieces: number;
  pieces_by_tier: Record<string, number>;
  total_ratchet_weight: number;
  total_estimated_external_copies: number;
  sober_acknowledged_count: number;
  unacknowledged_count: number;
  highest_tier_reached: number;
  platforms_used: string[];
  avg_estimated_copies_tier_4_plus: number;
}

export interface TierClassification {
  tier: number;
  justification: string;
  ratchetWeight: number;
}
