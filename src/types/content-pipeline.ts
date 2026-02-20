/**
 * Content Pipeline Types
 *
 * Types for the Handler-as-Showrunner content pipeline.
 * David doesn't manage content — he swipes approve/reject.
 */

// ── Union types ─────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved' | 'distributed' | 'archived';
export type PostStatus = 'draft' | 'scheduled' | 'ready_for_manual' | 'posted' | 'failed' | 'cancelled';
export type Platform = 'twitter' | 'reddit' | 'onlyfans' | 'fansly' | 'moltbook';
export type PlatformMode = 'api' | 'post_pack';

/** Twitter and Moltbook have working APIs. Reddit/Fansly use post-pack mode (Handler prepares, David pastes). */
export const PLATFORM_MODES: Record<Platform, PlatformMode> = {
  twitter: 'api',
  moltbook: 'api',
  reddit: 'post_pack',
  fansly: 'post_pack',
  onlyfans: 'api',
};
export type ContentType =
  | 'progress' | 'lifestyle' | 'explicit' | 'tease' | 'educational'
  | 'behind_the_scenes' | 'voice' | 'before_after' | 'journal_excerpt'
  | 'outfit' | 'routine' | 'cam_highlight' | 'milestone';
export type IdentificationRisk = 'none' | 'low' | 'medium' | 'high';
export type FanTier = 'casual' | 'regular' | 'supporter' | 'whale' | 'gfe';
export type ArcType =
  | 'transformation' | 'challenge' | 'milestone' | 'vulnerability'
  | 'fan_driven' | 'revenue_push' | 'seasonal' | 'recovery';
export type ArcStatus = 'planned' | 'active' | 'climax' | 'completed' | 'abandoned';
export type PermissionRuleType = 'explicitness_max' | 'content_type' | 'platform' | 'source' | 'full_autonomy';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageApprovalStatus = 'auto' | 'pending' | 'approved' | 'rejected';

// ── Vault ───────────────────────────────────────────────

export interface VaultItem {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video' | 'audio';
  thumbnail_url?: string;
  description?: string;
  source_type: string;

  // Pipeline fields (from 067 ALTER)
  quality_rating?: number;
  content_type?: ContentType;
  explicitness_level: number;
  identification_risk: IdentificationRisk;
  platform_suitability: Record<Platform, boolean>;
  narrative_arc_id?: string;
  handler_notes?: string;
  approval_status: ApprovalStatus;
  approved_at?: string;
  auto_approval_rule?: string;

  created_at: string;
  updated_at?: string;
}

// ── Distribution ────────────────────────────────────────

export interface Distribution {
  id: string;
  user_id: string;
  vault_id?: string;
  platform: Platform;
  caption?: string;
  hashtags: string[];
  scheduled_at?: string;
  posted_at?: string;
  post_url?: string;
  post_status: PostStatus;

  views: number;
  likes: number;
  comments: number;
  tips_cents: number;
  shares: number;

  handler_strategy?: string;
  narrative_arc_id?: string;
  auto_generated: boolean;

  created_at: string;
  updated_at?: string;
}

// ── Narrative Arcs ──────────────────────────────────────

export interface ArcBeat {
  week: number;
  beat: string;
  status: 'planned' | 'active' | 'completed' | 'skipped';
}

export interface NarrativeArc {
  id: string;
  user_id: string;
  title: string;
  arc_type: ArcType;
  domain_focus?: string;
  platform_emphasis: Platform[];
  beats: ArcBeat[];
  current_beat: number;
  arc_status: ArcStatus;
  revenue_generated_cents: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at?: string;
}

// ── Revenue ─────────────────────────────────────────────

export interface RevenueEntry {
  id: string;
  user_id: string;
  source: string;
  platform: string;
  amount_cents: number;
  currency: string;
  revenue_type?: string;
  distribution_id?: string;
  session_id?: string;
  period_date?: string;
  notes?: string;
  created_at: string;
}

export interface RevenueSummary {
  total_cents: number;
  this_month_cents: number;
  last_30d_cents: number;
  by_platform: Record<string, number>;
  by_type: Record<string, number>;
  daily_average_cents: number;
  trend: 'up' | 'down' | 'flat';
}

// ── Fan Profiles ────────────────────────────────────────

export interface FanProfile {
  id: string;
  user_id: string;
  platform: Platform;
  username: string;
  display_name?: string;
  engagement_score: number;
  total_spent_cents: number;
  message_count: number;
  tip_count: number;
  fan_tier: FanTier;
  notes?: string;
  last_interaction_at?: string;
  created_at: string;
  updated_at?: string;
}

// ── Fan Messages ────────────────────────────────────────

export interface FanMessage {
  id: string;
  user_id: string;
  fan_id: string;
  platform: string;
  direction: MessageDirection;
  message_text: string;
  handler_draft?: string;
  approval_status: MessageApprovalStatus;
  approved_at?: string;
  sent_at?: string;
  created_at: string;
}

// ── Content Calendar ────────────────────────────────────

export interface CalendarSlot {
  time: string;
  platform: Platform;
  vault_id?: string;
  distribution_id?: string;
  status: 'open' | 'assigned' | 'scheduled' | 'posted';
}

export interface ContentCalendarDay {
  id: string;
  user_id: string;
  calendar_date: string;
  slots: CalendarSlot[];
  narrative_arc_id?: string;
  beat_label?: string;
  revenue_target_cents: number;
  created_at: string;
  updated_at?: string;
}

// ── Standing Permissions ────────────────────────────────

export interface StandingPermission {
  id: string;
  user_id: string;
  rule_type: PermissionRuleType;
  rule_value: string;
  is_active: boolean;
  granted_denial_day?: number;
  granted_at: string;
  created_at: string;
}

// ── Content Briefing (morning briefing subset) ──────────

export interface ContentBriefing {
  revenue_yesterday_cents: number;
  revenue_this_month_cents: number;
  pending_approvals: number;
  pending_messages: number;
  today_schedule_count: number;
  active_arc_title?: string;
  handler_note: string;
}

// ── Vault Stats ─────────────────────────────────────────

export interface VaultStats {
  total: number;
  pending: number;
  approved: number;
  distributed: number;
  rejected: number;
  auto_approved: number;
  by_content_type: Record<string, number>;
}
