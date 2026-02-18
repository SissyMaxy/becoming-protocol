// ============================================
// Narrative / Showrunner Types
// ============================================

export type ArcType =
  | 'domain_deep_dive'
  | 'challenge'
  | 'denial'
  | 'funding'
  | 'vulnerability'
  | 'fan_driven'
  | 'milestone'
  | 'style_outfit'
  | 'voice'
  | 'chastity'
  | 'obedience'
  | 'body';

export type BeatType =
  | 'setup'
  | 'progress'
  | 'setback'
  | 'breakthrough'
  | 'climax'
  | 'reflection'
  | 'tease'
  | 'cam_session'
  | 'fan_interaction'
  | 'funding_push';

export type CaptureType =
  | 'photo_before_after'
  | 'photo_process'
  | 'photo_result'
  | 'photo_outfit'
  | 'photo_body'
  | 'video_short'
  | 'video_routine'
  | 'video_try_on'
  | 'audio_clip'
  | 'audio_voice_compare'
  | 'screenshot_stats'
  | 'text_reflection'
  | 'cam_recording'
  | 'cam_highlight'
  | 'timelapse'
  | 'none';

export type ArcStatus = 'planned' | 'active' | 'climax' | 'resolved' | 'abandoned';
export type BeatStatus = 'planned' | 'active' | 'captured' | 'posted' | 'skipped';

// ============================================
// Story Arc
// ============================================

export interface StoryArc {
  id: string;
  userId: string;
  title: string;
  arcType: ArcType;
  domain?: string;
  narrativePlan: NarrativePlan;
  transformationGoal?: string;
  escalationTarget?: string;
  sissificationAngle?: string;
  stakesDescription?: string;
  currentBeat: number;
  totalBeats: number;
  startDate?: string;
  targetEndDate?: string;
  actualEndDate?: string;
  fanPollId?: string;
  fanHookActive?: string;
  engagementScore?: number;
  revenueAttributedCents: number;
  camSessionsCompleted: number;
  submissionCount: number;
  vetoCount: number;
  status: ArcStatus;
  createdAt: string;
}

export interface NarrativePlan {
  beats: PlannedBeat[];
  contentMix?: Record<string, number>;
  camSessionsPlanned?: number;
  fundingMilestoneLink?: string;
}

export interface PlannedBeat {
  day: number;
  beatType: BeatType;
  taskDomain?: string;
  taskCategory?: string;
  captureType?: CaptureType;
  captureInstructions: string;
  narrativeFraming?: string;
  fanHook?: string;
  sissificationFraming?: string;
  isCam?: boolean;
  requiresSubmission?: boolean;
}

export interface DbStoryArc {
  id: string;
  user_id: string;
  title: string;
  arc_type: string;
  domain: string | null;
  narrative_plan: Record<string, unknown>;
  transformation_goal: string | null;
  escalation_target: string | null;
  sissification_angle: string | null;
  stakes_description: string | null;
  current_beat: number;
  total_beats: number;
  start_date: string | null;
  target_end_date: string | null;
  actual_end_date: string | null;
  fan_poll_id: string | null;
  fan_hook_active: string | null;
  engagement_score: number | null;
  revenue_attributed_cents: number;
  cam_sessions_completed: number;
  submission_count: number;
  veto_count: number;
  status: string;
  created_at: string;
}

// ============================================
// Content Beat
// ============================================

export interface ContentBeat {
  id: string;
  userId: string;
  arcId?: string;
  beatType: BeatType;
  beatNumber?: number;
  scheduledDate?: string;
  taskId?: string;
  taskDomain?: string;
  taskCategory?: string;
  taskInstructionsOverride?: string;
  captureType?: CaptureType;
  captureInstructions: string;
  requiresSubmission: boolean;
  camSessionId?: string;
  isCamBeat: boolean;
  narrativeFraming?: string;
  fanHook?: string;
  suggestedCaptionDirection?: string;
  sissificationFraming?: string;
  vaultContentId?: string;
  executedAt?: string;
  captionUsed?: string;
  platformPostedTo?: string;
  status: BeatStatus;
  createdAt: string;
  // Joined fields (from arc)
  arcTitle?: string;
  arcDomain?: string;
}

export interface DbContentBeat {
  id: string;
  user_id: string;
  arc_id: string | null;
  beat_type: string;
  beat_number: number | null;
  scheduled_date: string | null;
  task_id: string | null;
  task_domain: string | null;
  task_category: string | null;
  task_instructions_override: string | null;
  capture_type: string | null;
  capture_instructions: string;
  requires_submission: boolean;
  cam_session_id: string | null;
  is_cam_beat: boolean;
  narrative_framing: string | null;
  fan_hook: string | null;
  suggested_caption_direction: string | null;
  sissification_framing: string | null;
  vault_content_id: string | null;
  executed_at: string | null;
  caption_used: string | null;
  platform_posted_to: string | null;
  status: string;
  created_at: string;
}

// ============================================
// Funding Milestone
// ============================================

export type FundingStatus = 'active' | 'funded' | 'fulfilled' | 'cancelled';

export interface FundingMilestone {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetAmountCents: number;
  currentAmountCents: number;
  rewardContent?: string;
  rewardTierMinimum?: number;
  transformationAction?: string;
  arcId?: string;
  status: FundingStatus;
  fundedAt?: string;
  fulfilledAt?: string;
  createdAt: string;
}

export interface DbFundingMilestone {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  target_amount_cents: number;
  current_amount_cents: number;
  reward_content: string | null;
  reward_tier_minimum: number | null;
  transformation_action: string | null;
  arc_id: string | null;
  status: string;
  funded_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
}

// ============================================
// Weekly Arc Plan (AI output)
// ============================================

export interface WeeklyArcPlan {
  resolveArcs: string[];
  newArcs: NewArcPlan[];
  camSessionsPlanned: CamSessionPlan[];
  pollsToLaunch: PollPlan[];
  weeklyRevenueTarget: number;
  contentMixPlan: Record<string, number>;
}

export interface NewArcPlan {
  title: string;
  arcType: ArcType;
  domain: string;
  duration: number;
  transformationGoal: string;
  sissificationAngle: string;
  fundingMilestoneLink?: string;
  beats: PlannedBeat[];
}

export interface CamSessionPlan {
  preferredDay: string;
  type: string;
  reason: string;
  minDuration: number;
  tipGoal: number;
}

export interface PollPlan {
  question: string;
  options: string[];
  closesInDays: number;
}

// ============================================
// Caption Context
// ============================================

export interface CaptionContext {
  vaultItemId: string;
  mediaType: string;
  description?: string;
  domain?: string;
  vulnerabilityScore?: number;
  beat?: ContentBeat;
  arc?: StoryArc;
  denialDay: number;
  streakDays: number;
  platform: string;
}

// ============================================
// Mappers
// ============================================

export function mapDbToStoryArc(db: DbStoryArc): StoryArc {
  return {
    id: db.id,
    userId: db.user_id,
    title: db.title,
    arcType: db.arc_type as ArcType,
    domain: db.domain || undefined,
    narrativePlan: db.narrative_plan as unknown as NarrativePlan,
    transformationGoal: db.transformation_goal || undefined,
    escalationTarget: db.escalation_target || undefined,
    sissificationAngle: db.sissification_angle || undefined,
    stakesDescription: db.stakes_description || undefined,
    currentBeat: db.current_beat,
    totalBeats: db.total_beats,
    startDate: db.start_date || undefined,
    targetEndDate: db.target_end_date || undefined,
    actualEndDate: db.actual_end_date || undefined,
    fanPollId: db.fan_poll_id || undefined,
    fanHookActive: db.fan_hook_active || undefined,
    engagementScore: db.engagement_score || undefined,
    revenueAttributedCents: db.revenue_attributed_cents,
    camSessionsCompleted: db.cam_sessions_completed,
    submissionCount: db.submission_count,
    vetoCount: db.veto_count,
    status: db.status as ArcStatus,
    createdAt: db.created_at,
  };
}

export function mapDbToContentBeat(db: DbContentBeat): ContentBeat {
  return {
    id: db.id,
    userId: db.user_id,
    arcId: db.arc_id || undefined,
    beatType: db.beat_type as BeatType,
    beatNumber: db.beat_number || undefined,
    scheduledDate: db.scheduled_date || undefined,
    taskId: db.task_id || undefined,
    taskDomain: db.task_domain || undefined,
    taskCategory: db.task_category || undefined,
    taskInstructionsOverride: db.task_instructions_override || undefined,
    captureType: (db.capture_type as CaptureType) || undefined,
    captureInstructions: db.capture_instructions,
    requiresSubmission: db.requires_submission,
    camSessionId: db.cam_session_id || undefined,
    isCamBeat: db.is_cam_beat,
    narrativeFraming: db.narrative_framing || undefined,
    fanHook: db.fan_hook || undefined,
    suggestedCaptionDirection: db.suggested_caption_direction || undefined,
    sissificationFraming: db.sissification_framing || undefined,
    vaultContentId: db.vault_content_id || undefined,
    executedAt: db.executed_at || undefined,
    captionUsed: db.caption_used || undefined,
    platformPostedTo: db.platform_posted_to || undefined,
    status: db.status as BeatStatus,
    createdAt: db.created_at,
  };
}

export function mapDbToFundingMilestone(db: DbFundingMilestone): FundingMilestone {
  return {
    id: db.id,
    userId: db.user_id,
    title: db.title,
    description: db.description || undefined,
    targetAmountCents: db.target_amount_cents,
    currentAmountCents: db.current_amount_cents,
    rewardContent: db.reward_content || undefined,
    rewardTierMinimum: db.reward_tier_minimum || undefined,
    transformationAction: db.transformation_action || undefined,
    arcId: db.arc_id || undefined,
    status: db.status as FundingStatus,
    fundedAt: db.funded_at || undefined,
    fulfilledAt: db.fulfilled_at || undefined,
    createdAt: db.created_at,
  };
}
