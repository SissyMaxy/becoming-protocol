// Types for the "life as a woman" surfaces (sniffies outbound + hypno
// trance + gooning/chastity v2 + Mommy as content editor). Mirrors the
// DB row shapes from migrations 367-371. snake_case here matches what
// supabase-js returns; UI components map to camelCase where convenient.

export interface LifeAsWomanSettings {
  user_id: string
  master_enabled: boolean
  sniffies_outbound_enabled: boolean
  sniffies_outbound_intensity: number
  hypno_trance_enabled: boolean
  hypno_trance_intensity: number
  hypno_visual_enabled: boolean
  hypno_wake_bridge_enabled: boolean
  gooning_enabled: boolean
  gooning_intensity: number
  chastity_v2_enabled: boolean
  kink_curriculum_enabled: boolean
  kink_curriculum_intensity: number
  content_editor_enabled: boolean
  content_editor_intensity: number
  cross_platform_consistency_enabled: boolean
}

export type SniffiesDraftStatus = 'pending' | 'sent' | 'discarded' | 'expired'
export type SniffiesDraftIntent =
  | 'open' | 'advance' | 'tease' | 'logistics' | 'closer' | 'aftercare' | 'redirect'

export interface SniffiesDraft {
  id: string
  user_id: string
  contact_id: string | null
  text_for_user: string
  mommy_voice_note: string | null
  intent: SniffiesDraftIntent
  status: SniffiesDraftStatus
  sent_at: string | null
  discard_reason: string | null
  created_at: string
  updated_at: string
}

export interface SniffiesContact {
  id: string
  user_id: string
  display_name: string
  kinks_mentioned: string[]
  outcomes: string[]
  excluded_from_persona: boolean
  last_seen_at: string | null
}

export interface SniffiesProfileCuration {
  user_id: string
  bio_text: string | null
  photo_criteria: string | null
  chat_voice_patterns: string | null
  kink_positioning: string[]
  last_curated_at: string | null
  bio_accepted_at: string | null
}

export interface SniffiesMeetChoreography {
  id: string
  user_id: string
  contact_id: string | null
  meet_at: string
  meet_location: string | null
  outfit_brief: string | null
  what_to_bring: string | null
  what_to_feel_for: string | null
  opening_line: string | null
  escape_plan: string | null
  live_cue_audio_path: string | null
  post_meet_debrief_due_at: string | null
  debrief_submitted_at: string | null
  debrief_text: string | null
  debrief_slip_armed: boolean
  status: 'planned' | 'briefed' | 'in_progress' | 'debriefed' | 'cancelled'
}

export interface HypnoTranceSession {
  id: string
  user_id: string
  session_date: string
  induction_text: string | null
  deepening_text: string | null
  payload_text: string | null
  emergence_text: string | null
  induction_audio_path: string | null
  deepening_audio_path: string | null
  payload_audio_path: string | null
  emergence_audio_path: string | null
  theme: string
  visual_loop: string | null
  status: 'drafted' | 'scheduled' | 'in_progress' | 'completed' | 'aborted'
  paired_with_arousal: boolean
}

export interface TranceTrigger {
  id: string
  user_id: string
  phrase: string
  effect: 'go-under' | 'arousal-spike' | 'voice-feminize' | 'submission-deepen'
  exposure_count: number
  arming_threshold: number
  armed_at: string | null
  last_casual_use_at: string | null
  last_pairing_at: string | null
  status: 'pairing' | 'armed' | 'retired'
}

export interface GooningSession {
  id: string
  user_id: string
  title: string
  duration_minutes: number
  edge_target_count: number
  outcome: 'deny' | 'release' | 'sissygasm_only'
  structure_json: Array<{
    label: string
    duration_seconds: number
    text: string
    edge_target_index?: number | null
  }>
  theme: string | null
  status: 'drafted' | 'rendered' | 'in_progress' | 'completed' | 'aborted'
  edges_logged: number
  edges_biometric_confirmed: number
}

export interface ChastityV2 {
  id: string
  user_id: string
  starts_at: string
  earliest_release_at: string
  gates_json: Array<{ kind: string; target: number; current: number }>
  release_phrase: string
  status: 'pending' | 'active' | 'released' | 'revoked'
  starter_note: string | null
  release_note: string | null
}

export interface KinkCurriculum {
  id: string
  user_id: string
  kink_kind:
    | 'cock_shame_replacement'
    | 'sissygasm_only_release'
    | 'voice_during_release'
    | 'cage_acceptance'
    | 'panty_dependence'
    | 'mama_possession'
  stage: number
  corrections_total: number
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  narrative_note: string | null
}

export interface MommyEditorialNote {
  id: string
  user_id: string
  target_table: string
  target_id: string
  rewritten_text: string | null
  mommy_voice_note: string | null
  posting_recommendation: string | null
  audience_archetype: 'whale' | 'lurker' | 'repeat_customer' | 'new_follower' | 'general'
  projected_engagement: number | null
  status: 'pending' | 'accepted' | 'declined' | 'used' | 'stale'
  created_at: string
}

export interface MommyContentPrompt {
  id: string
  user_id: string
  for_date: string
  shoot_direction: string | null
  post_idea: string | null
  fan_response_strategy: string | null
  audience_focus: 'whale' | 'lurker' | 'repeat_customer' | 'new_follower' | 'general'
  status: 'pending' | 'acknowledged' | 'completed' | 'skipped'
}
