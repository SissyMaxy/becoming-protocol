// ============================================
// Industry Module Types — Sprint 1 Foundation
// Shoot prescriptions, denial calendar, audience,
// autonomous marketing, content queue, consequences
// ============================================

// ============================================
// Union Types (match DB CHECK constraints)
// ============================================

export type ShootType =
  | 'photo_set'
  | 'short_video'
  | 'cage_check'
  | 'outfit_of_day'
  | 'toy_showcase'
  | 'tease_video'
  | 'progress_photo'
  | 'edge_capture';

export type ShootStatus =
  | 'prescribed'
  | 'in_progress'
  | 'captured'
  | 'ready_to_post'
  | 'posted'
  | 'skipped';

export type PollType =
  | 'denial_release'
  | 'outfit_choice'
  | 'content_choice'
  | 'challenge'
  | 'timer'
  | 'prediction'
  | 'punishment'
  | 'general';

export type PollStatus = 'draft' | 'active' | 'closed';

export type ChallengeStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export type AutonomousActionType =
  | 'community_comment'
  | 'community_post'
  | 'creator_dm'
  | 'poll_posted'
  | 'engagement_reply'
  | 'follow'
  | 'cross_promo'
  | 'milestone_post'
  | 'text_post'
  | 'repost'
  | 'subreddit_comment';

export type ContentQueueStatus = 'queued' | 'posted' | 'failed' | 'skipped';

export type CommunityTargetStatus = 'active' | 'paused';

export type ConsequenceType =
  | 'easier_tomorrow'
  | 'audience_poll'
  | 'handler_public_post'
  | 'full_accountability';

export type ShootDifficulty = 'easy' | 'medium' | 'high_arousal' | 'premium';

// ============================================
// Shot List Entry (JSONB in shoot_prescriptions)
// ============================================

export interface ShotListEntry {
  ref: string;
  count?: number;
  durationSeconds?: number;
  notes?: string;
}

// ============================================
// Poll Option (JSONB in audience_polls)
// ============================================

export interface PollOption {
  id: string;
  label: string;
  votes: number;
  platformSpecificId?: string;
}

// ============================================
// Multiplication Post (JSONB in content_multiplication_plans)
// ============================================

export interface MultiplicationPost {
  platform: string;
  contentType: string;
  scheduledDay: number;
  caption: string;
  mediaSelection: string[];
  status: 'planned' | 'queued' | 'posted' | 'skipped';
}

// ============================================
// Shoot Prescription
// ============================================

export interface ShootPrescription {
  id: string;
  userId: string;
  title: string;
  denialDay: number | null;
  shootType: ShootType;
  outfit: string;
  setup: string | null;
  mood: string | null;
  shotList: ShotListEntry[];
  handlerNote: string | null;
  estimatedMinutes: number;
  denialBadgeColor: string | null;
  contentLevel: string | null;
  pollId: string | null;
  scheduledFor: string | null;
  mediaPaths: string[];
  selectedMedia: string[];
  primaryPlatform: string;
  secondaryPlatforms: string[];
  captionDraft: string | null;
  hashtags: string | null;
  status: ShootStatus;
  skippedAt: string | null;
  skipConsequence: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Shoot Reference Image
// ============================================

export interface ShootReferenceImage {
  id: string;
  poseName: string;
  angle: string;
  bodyPosition: string;
  lighting: string | null;
  cameraPosition: string | null;
  svgData: string;
  description: string | null;
  tags: string[];
  difficulty: number;
  createdAt: string;
}

// ============================================
// Denial Day Content Map
// ============================================

export interface DenialDayContentMap {
  id: string;
  denialDay: number;
  mood: string;
  contentTypes: string[];
  audienceHooks: string[];
  engagementStrategy: string;
  shootDifficulty: ShootDifficulty | null;
  redditSubs: string[];
  handlerNotes: string | null;
  optimalShootTypes: ShootType[];
  createdAt: string;
}

// ============================================
// Denial Cycle Shoot (template)
// ============================================

export interface DenialCycleShoot {
  id: string;
  denialDay: number;
  title: string;
  shootType: ShootType;
  durationMinutes: number;
  mood: string | null;
  setup: string | null;
  outfit: string | null;
  shotCount: number;
  shotDescriptions: ShotListEntry[];
  platforms: {
    primary: string;
    sub?: string;
    secondary?: string[];
  };
  captionTemplate: string | null;
  pollType: PollType | null;
  handlerNote: string | null;
  createdAt: string;
}

// ============================================
// Audience Poll
// ============================================

export interface AudiencePoll {
  id: string;
  userId: string;
  question: string;
  pollType: PollType;
  options: PollOption[];
  platformsPosted: string[];
  platformPollIds: Record<string, string>;
  handlerIntent: string | null;
  winningOptionId: string | null;
  resultHonored: boolean | null;
  resultPostId: string | null;
  status: PollStatus;
  expiresAt: string | null;
  postedAt: string | null;
  createdAt: string;
}

// ============================================
// Audience Challenge
// ============================================

export interface AudienceChallenge {
  id: string;
  userId: string;
  fanUsername: string | null;
  platform: string | null;
  suggestion: string;
  handlerEvaluation: string | null;
  handlerModifiedVersion: string | null;
  status: ChallengeStatus;
  shootPrescriptionId: string | null;
  engagementScore: number | null;
  createdAt: string;
}

// ============================================
// Handler Autonomous Action
// ============================================

export interface HandlerAutonomousAction {
  id: string;
  userId: string;
  actionType: AutonomousActionType;
  platform: string;
  target: string | null;
  contentText: string | null;
  handlerIntent: string | null;
  result: Record<string, unknown>;
  createdAt: string;
}

// ============================================
// Content Queue Item
// ============================================

export interface ContentQueueItem {
  id: string;
  userId: string;
  sourceShootId: string | null;
  multiplicationPlanId: string | null;
  platform: string;
  contentType: string;
  mediaPaths: string[];
  caption: string | null;
  hashtags: string[];
  denialDayBadge: number | null;
  scheduledFor: string | null;
  postedAt: string | null;
  status: ContentQueueStatus;
  engagementStats: Record<string, unknown>;
  createdAt: string;
}

// ============================================
// Community Target
// ============================================

export interface CommunityTarget {
  id: string;
  userId: string;
  platform: string;
  communityId: string;
  communityName: string;
  engagementStrategy: string | null;
  postingFrequency: string | null;
  voiceConfig: Record<string, unknown>;
  contentTypesAllowed: string[];
  rulesSummary: string | null;
  followersAttributed: number;
  karmaEarned: number;
  totalPosts: number;
  totalComments: number;
  lastPostAt: string | null;
  lastEngagementAt: string | null;
  status: CommunityTargetStatus;
  createdAt: string;
}

// ============================================
// Skip Consequence
// ============================================

export interface SkipConsequence {
  id: string;
  userId: string;
  shootPrescriptionId: string;
  skipDate: string;
  consecutiveSkips: number;
  consequenceType: ConsequenceType;
  consequenceExecuted: boolean;
  consequenceDetails: string | null;
  createdAt: string;
}

// ============================================
// Content Multiplication Plan
// ============================================

export interface ContentMultiplicationPlan {
  id: string;
  userId: string;
  sourceShootId: string;
  totalPostsPlanned: number;
  posts: MultiplicationPost[];
  createdAt: string;
}

// ============================================
// Fan Profile Extension (extends fan_profiles from 067)
// ============================================

export interface FanProfileMemory {
  fanPreferences: Record<string, unknown>;
  triggerContent: string | null;
  communicationStyle: string | null;
  personalDetailsShared: Record<string, unknown>;
  engagementPattern: string | null;
  whaleStatus: boolean;
  handlerRelationshipNotes: string | null;
}

// ============================================
// DB Row Types (snake_case) + Mappers
// ============================================

export interface DbShootPrescription {
  id: string;
  user_id: string;
  title: string;
  denial_day: number | null;
  shoot_type: string;
  outfit: string;
  setup: string | null;
  mood: string | null;
  shot_list: ShotListEntry[];
  handler_note: string | null;
  estimated_minutes: number;
  denial_badge_color: string | null;
  content_level: string | null;
  poll_id: string | null;
  scheduled_for: string | null;
  media_paths: string[];
  selected_media: string[];
  primary_platform: string;
  secondary_platforms: string[];
  caption_draft: string | null;
  hashtags: string | null;
  status: string;
  skipped_at: string | null;
  skip_consequence: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbShootReferenceImage {
  id: string;
  pose_name: string;
  angle: string;
  body_position: string;
  lighting: string | null;
  camera_position: string | null;
  svg_data: string;
  description: string | null;
  tags: string[];
  difficulty: number;
  created_at: string;
}

export interface DbDenialDayContentMap {
  id: string;
  denial_day: number;
  mood: string;
  content_types: string[];
  audience_hooks: string[];
  engagement_strategy: string;
  shoot_difficulty: string | null;
  reddit_subs: string[];
  handler_notes: string | null;
  optimal_shoot_types: string[];
  created_at: string;
}

export interface DbDenialCycleShoot {
  id: string;
  denial_day: number;
  title: string;
  shoot_type: string;
  duration_minutes: number;
  mood: string | null;
  setup: string | null;
  outfit: string | null;
  shot_count: number;
  shot_descriptions: ShotListEntry[];
  platforms: Record<string, unknown>;
  caption_template: string | null;
  poll_type: string | null;
  handler_note: string | null;
  created_at: string;
}

export interface DbAudiencePoll {
  id: string;
  user_id: string;
  question: string;
  poll_type: string;
  options: PollOption[];
  platforms_posted: string[];
  platform_poll_ids: Record<string, string>;
  handler_intent: string | null;
  winning_option_id: string | null;
  result_honored: boolean | null;
  result_post_id: string | null;
  status: string;
  expires_at: string | null;
  posted_at: string | null;
  created_at: string;
}

export interface DbAudienceChallenge {
  id: string;
  user_id: string;
  fan_username: string | null;
  platform: string | null;
  suggestion: string;
  handler_evaluation: string | null;
  handler_modified_version: string | null;
  status: string;
  shoot_prescription_id: string | null;
  engagement_score: number | null;
  created_at: string;
}

export interface DbHandlerAutonomousAction {
  id: string;
  user_id: string;
  action_type: string;
  platform: string;
  target: string | null;
  content_text: string | null;
  handler_intent: string | null;
  result: Record<string, unknown>;
  created_at: string;
}

export interface DbContentQueueItem {
  id: string;
  user_id: string;
  source_shoot_id: string | null;
  multiplication_plan_id: string | null;
  platform: string;
  content_type: string;
  media_paths: string[];
  caption: string | null;
  hashtags: string[];
  denial_day_badge: number | null;
  scheduled_for: string | null;
  posted_at: string | null;
  status: string;
  engagement_stats: Record<string, unknown>;
  created_at: string;
}

export interface DbCommunityTarget {
  id: string;
  user_id: string;
  platform: string;
  community_id: string;
  community_name: string;
  engagement_strategy: string | null;
  posting_frequency: string | null;
  voice_config: Record<string, unknown>;
  content_types_allowed: string[];
  rules_summary: string | null;
  followers_attributed: number;
  karma_earned: number;
  total_posts: number;
  total_comments: number;
  last_post_at: string | null;
  last_engagement_at: string | null;
  status: string;
  created_at: string;
}

export interface DbSkipConsequence {
  id: string;
  user_id: string;
  shoot_prescription_id: string;
  skip_date: string;
  consecutive_skips: number;
  consequence_type: string;
  consequence_executed: boolean;
  consequence_details: string | null;
  created_at: string;
}

export interface DbContentMultiplicationPlan {
  id: string;
  user_id: string;
  source_shoot_id: string;
  total_posts_planned: number;
  posts: MultiplicationPost[];
  created_at: string;
}

// ============================================
// Mappers
// ============================================

export function mapShootPrescription(row: DbShootPrescription): ShootPrescription {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    denialDay: row.denial_day,
    shootType: row.shoot_type as ShootType,
    outfit: row.outfit,
    setup: row.setup,
    mood: row.mood,
    shotList: row.shot_list ?? [],
    handlerNote: row.handler_note,
    estimatedMinutes: row.estimated_minutes,
    denialBadgeColor: row.denial_badge_color,
    contentLevel: row.content_level,
    pollId: row.poll_id,
    scheduledFor: row.scheduled_for,
    mediaPaths: row.media_paths ?? [],
    selectedMedia: row.selected_media ?? [],
    primaryPlatform: row.primary_platform,
    secondaryPlatforms: row.secondary_platforms ?? [],
    captionDraft: row.caption_draft,
    hashtags: row.hashtags,
    status: row.status as ShootStatus,
    skippedAt: row.skipped_at,
    skipConsequence: row.skip_consequence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapShootReferenceImage(row: DbShootReferenceImage): ShootReferenceImage {
  return {
    id: row.id,
    poseName: row.pose_name,
    angle: row.angle,
    bodyPosition: row.body_position,
    lighting: row.lighting,
    cameraPosition: row.camera_position,
    svgData: row.svg_data,
    description: row.description,
    tags: row.tags ?? [],
    difficulty: row.difficulty,
    createdAt: row.created_at,
  };
}

export function mapDenialDayContentMap(row: DbDenialDayContentMap): DenialDayContentMap {
  return {
    id: row.id,
    denialDay: row.denial_day,
    mood: row.mood,
    contentTypes: row.content_types ?? [],
    audienceHooks: row.audience_hooks ?? [],
    engagementStrategy: row.engagement_strategy,
    shootDifficulty: row.shoot_difficulty as ShootDifficulty | null,
    redditSubs: row.reddit_subs ?? [],
    handlerNotes: row.handler_notes,
    optimalShootTypes: (row.optimal_shoot_types ?? []) as ShootType[],
    createdAt: row.created_at,
  };
}

export function mapDenialCycleShoot(row: DbDenialCycleShoot): DenialCycleShoot {
  return {
    id: row.id,
    denialDay: row.denial_day,
    title: row.title,
    shootType: row.shoot_type as ShootType,
    durationMinutes: row.duration_minutes,
    mood: row.mood,
    setup: row.setup,
    outfit: row.outfit,
    shotCount: row.shot_count,
    shotDescriptions: row.shot_descriptions ?? [],
    platforms: row.platforms as DenialCycleShoot['platforms'],
    captionTemplate: row.caption_template,
    pollType: row.poll_type as PollType | null,
    handlerNote: row.handler_note,
    createdAt: row.created_at,
  };
}

export function mapAudiencePoll(row: DbAudiencePoll): AudiencePoll {
  return {
    id: row.id,
    userId: row.user_id,
    question: row.question,
    pollType: row.poll_type as PollType,
    options: row.options ?? [],
    platformsPosted: row.platforms_posted ?? [],
    platformPollIds: row.platform_poll_ids ?? {},
    handlerIntent: row.handler_intent,
    winningOptionId: row.winning_option_id,
    resultHonored: row.result_honored,
    resultPostId: row.result_post_id,
    status: row.status as PollStatus,
    expiresAt: row.expires_at,
    postedAt: row.posted_at,
    createdAt: row.created_at,
  };
}

export function mapAudienceChallenge(row: DbAudienceChallenge): AudienceChallenge {
  return {
    id: row.id,
    userId: row.user_id,
    fanUsername: row.fan_username,
    platform: row.platform,
    suggestion: row.suggestion,
    handlerEvaluation: row.handler_evaluation,
    handlerModifiedVersion: row.handler_modified_version,
    status: row.status as ChallengeStatus,
    shootPrescriptionId: row.shoot_prescription_id,
    engagementScore: row.engagement_score,
    createdAt: row.created_at,
  };
}

export function mapHandlerAutonomousAction(row: DbHandlerAutonomousAction): HandlerAutonomousAction {
  return {
    id: row.id,
    userId: row.user_id,
    actionType: row.action_type as AutonomousActionType,
    platform: row.platform,
    target: row.target,
    contentText: row.content_text,
    handlerIntent: row.handler_intent,
    result: row.result ?? {},
    createdAt: row.created_at,
  };
}

export function mapContentQueueItem(row: DbContentQueueItem): ContentQueueItem {
  return {
    id: row.id,
    userId: row.user_id,
    sourceShootId: row.source_shoot_id,
    multiplicationPlanId: row.multiplication_plan_id,
    platform: row.platform,
    contentType: row.content_type,
    mediaPaths: row.media_paths ?? [],
    caption: row.caption,
    hashtags: row.hashtags ?? [],
    denialDayBadge: row.denial_day_badge,
    scheduledFor: row.scheduled_for,
    postedAt: row.posted_at,
    status: row.status as ContentQueueStatus,
    engagementStats: row.engagement_stats ?? {},
    createdAt: row.created_at,
  };
}

export function mapCommunityTarget(row: DbCommunityTarget): CommunityTarget {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    communityId: row.community_id,
    communityName: row.community_name,
    engagementStrategy: row.engagement_strategy,
    postingFrequency: row.posting_frequency,
    voiceConfig: row.voice_config ?? {},
    contentTypesAllowed: row.content_types_allowed ?? [],
    rulesSummary: row.rules_summary,
    followersAttributed: row.followers_attributed,
    karmaEarned: row.karma_earned,
    totalPosts: row.total_posts,
    totalComments: row.total_comments,
    lastPostAt: row.last_post_at,
    lastEngagementAt: row.last_engagement_at,
    status: row.status as CommunityTargetStatus,
    createdAt: row.created_at,
  };
}

export function mapSkipConsequence(row: DbSkipConsequence): SkipConsequence {
  return {
    id: row.id,
    userId: row.user_id,
    shootPrescriptionId: row.shoot_prescription_id,
    skipDate: row.skip_date,
    consecutiveSkips: row.consecutive_skips,
    consequenceType: row.consequence_type as ConsequenceType,
    consequenceExecuted: row.consequence_executed,
    consequenceDetails: row.consequence_details,
    createdAt: row.created_at,
  };
}

export function mapContentMultiplicationPlan(row: DbContentMultiplicationPlan): ContentMultiplicationPlan {
  return {
    id: row.id,
    userId: row.user_id,
    sourceShootId: row.source_shoot_id,
    totalPostsPlanned: row.total_posts_planned,
    posts: row.posts ?? [],
    createdAt: row.created_at,
  };
}
