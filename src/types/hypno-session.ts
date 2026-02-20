/**
 * Hypno Session Telemetry Types
 *
 * Types for session event logging, summaries, and ritual anchors.
 * Maps to: hypno_session_events, hypno_session_summary, ritual_anchors tables.
 */

// ============================================
// SESSION EVENTS
// ============================================

export type SessionEventType =
  | 'start'
  | 'video_change'
  | 'arousal_peak'
  | 'trance_flag'
  | 'skip'
  | 'end'
  | 'lovense_intensity_change'
  | 'commitment_extracted'
  | 'anchor_triggered';

export interface HypnoSessionEvent {
  id: string;
  session_id: string;
  event_type: SessionEventType;
  hypno_library_id?: string;
  timestamp: string;
  lovense_intensity?: number;
  device_data?: Record<string, unknown>;
  notes?: string;
}

// ============================================
// SESSION SUMMARY
// ============================================

export interface HypnoSessionSummary {
  id: string;
  session_id: string;
  started_at: string;
  ended_at: string;
  total_duration_minutes: number;
  denial_day_at_session: number;
  videos_played: string[];
  videos_skipped: string[];
  peak_arousal_level: number;
  peak_arousal_video?: string;
  peak_arousal_timestamp?: string;
  trance_depth_self_report: number; // 1-5
  post_session_mood?: string;
  commitment_extracted: boolean;
  commitment_text?: string;
  content_captured: boolean;
  capture_clip_count: number;
  ritual_anchors_active: string[];
  playlist_id?: string;
  handler_notes?: string;
}

// ============================================
// RITUAL ANCHORS
// ============================================

export type AnchorType =
  | 'scent'
  | 'phrase'
  | 'position'
  | 'device_pattern'
  | 'lighting'
  | 'sound'
  | 'clothing'
  | 'sequence';

export type AnchorStrength = 'nascent' | 'forming' | 'established' | 'conditioned';

export interface RitualAnchor {
  id: string;
  user_id: string;
  anchor_type: AnchorType;
  anchor_value: string;
  sessions_paired: number;
  first_paired?: string;
  last_paired?: string;
  estimated_strength: AnchorStrength;
  autonomous_trigger_observed: boolean;
  handler_notes?: string;
  active: boolean;
}

// ============================================
// STANDING PERMISSIONS
// ============================================

export type PermissionDomain =
  | 'session_auto_start'
  | 'content_auto_approve'
  | 'content_full_autonomy'
  | 'outfit_auto_prescribe'
  | 'schedule_auto_block'
  | 'fan_auto_respond'
  | 'cam_auto_schedule'
  | 'ambient_conditioning'
  | 'briefing_auto_curate'
  | 'hrt_pipeline_active';

export interface StandingPermission {
  id: string;
  user_id: string;
  permission_domain: PermissionDomain;
  granted: boolean;
  granted_at: string;
  parameters?: Record<string, unknown>;
  handler_notes?: string;
}

// ============================================
// POST-SESSION CHECK-IN
// ============================================

export interface PostSessionCheckIn {
  trance_depth: number; // 1-5
  mood?: string; // one line, optional
}

// ============================================
// RITUAL SESSION PHASES
// ============================================

export type RitualPhase =
  | 'pre_session'
  | 'opening'
  | 'session'
  | 'closing'
  | 'check_in';

// ============================================
// INITIAL ANCHORS (seed data)
// ============================================

export const INITIAL_ANCHORS: Omit<RitualAnchor, 'id' | 'user_id' | 'sessions_paired' | 'first_paired' | 'last_paired' | 'estimated_strength' | 'autonomous_trigger_observed'>[] = [
  {
    anchor_type: 'phrase',
    anchor_value: 'Good girl. Settle in.',
    handler_notes: 'Opening phrase — played via speech synthesis at session start',
    active: true,
  },
  {
    anchor_type: 'device_pattern',
    anchor_value: 'three_short_pulses_then_steady_low',
    handler_notes: 'Lovense: 3x 0.5s pulses at intensity 8, then steady at intensity 3',
    active: true,
  },
  {
    anchor_type: 'scent',
    anchor_value: 'session_candle',
    handler_notes: 'Handler prescribes specific scent — update value when chosen',
    active: true,
  },
  {
    anchor_type: 'position',
    anchor_value: 'legs_crossed_hands_on_thighs_chin_down_earbuds_in',
    handler_notes: 'Prescribed body position for all sessions',
    active: true,
  },
];
