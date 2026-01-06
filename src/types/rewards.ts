// Neurochemistry Reward System Types

// ============================================
// CONSTANTS
// ============================================

export const POINT_VALUES = {
  task_complete: 10,
  streak_day: 5,
  skip_resistance_base: 15,
  skip_resistance_max: 75,
  session_complete: 50,
  narration_10: 10,
  narration_25: 25,
  narration_50: 50,
  notification_response: 5,
  jackpot: 50,
} as const;

export const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2250, 3250, 5000, 7500] as const;

export const LEVEL_TITLES = [
  'Curious',      // 1
  'Exploring',    // 2
  'Awakening',    // 3
  'Embracing',    // 4
  'Transforming', // 5
  'Becoming',     // 6
  'Flourishing',  // 7
  'Radiant',      // 8
  'Transcendent', // 9
  'Complete',     // 10
] as const;

export const STREAK_MULTIPLIER_TIERS = {
  0: 1.0,   // 0-6 days
  7: 1.25,  // 7-13 days
  14: 1.5,  // 14-29 days
  30: 1.75, // 30-59 days
  60: 2.0,  // 60+ days
} as const;

export const ACHIEVEMENT_POINTS: Record<AchievementRarity, number> = {
  common: 25,
  uncommon: 50,
  rare: 100,
  epic: 250,
  legendary: 500,
};

export const NARRATION_MILESTONES = [10, 25, 50] as const;

export const SESSION_REQUIREMENTS = {
  anchoringPerWeek: 3,
  rewardPerWeek: 1,
} as const;

// ============================================
// POINTS & LEVELS
// ============================================

export type PointSource =
  | 'task_complete'
  | 'streak_day'
  | 'achievement'
  | 'skip_resistance'
  | 'session_complete'
  | 'narration_milestone'
  | 'notification_response'
  | 'jackpot'
  | 'bonus';

export interface UserRewardState {
  id: string;
  userId: string;
  totalPoints: number;
  currentLevel: number;
  levelTitle: string;
  xpInCurrentLevel: number;
  currentStreak: number;
  currentStreakMultiplier: number;
  dailyNarrationCount: number;
  lifetimeNarrationCount: number;
  narrationStreak: number;
  lastNarrationDate: string | null;
  anchoringSessionsThisWeek: number;
  rewardSessionsThisWeek: number;
  lastSessionDate: string | null;
  weekStartDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbUserRewardState {
  id: string;
  user_id: string;
  total_points: number;
  current_level: number;
  level_title: string;
  xp_in_current_level: number;
  current_streak: number;
  current_streak_multiplier: number;
  daily_narration_count: number;
  lifetime_narration_count: number;
  narration_streak: number;
  last_narration_date: string | null;
  anchoring_sessions_this_week: number;
  reward_sessions_this_week: number;
  last_session_date: string | null;
  week_start_date: string;
  created_at: string;
  updated_at: string;
}

export interface PointTransaction {
  id: string;
  userId: string;
  points: number;
  multiplier: number;
  finalPoints: number;
  source: PointSource;
  sourceId?: string;
  sourceDetails?: Record<string, unknown>;
  createdAt: string;
}

export interface DbPointTransaction {
  id: string;
  user_id: string;
  points: number;
  multiplier: number;
  final_points: number;
  source: string;
  source_id: string | null;
  source_details: Record<string, unknown> | null;
  created_at: string;
}

export interface LevelInfo {
  level: number;
  title: string;
  xpInLevel: number;
  xpForNextLevel: number;
  progress: number; // 0-100
}

// ============================================
// ACHIEVEMENTS
// ============================================

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type AchievementCategory =
  | 'streak'
  | 'level'
  | 'sessions'
  | 'engagement'
  | 'narration'
  | 'anchors'
  | 'investment'
  | 'special';

export type AchievementConditionType =
  | 'streak'
  | 'level'
  | 'sessions'
  | 'narration_count'
  | 'anchors'
  | 'total_points'
  | 'investment';

export interface AchievementCondition {
  type: AchievementConditionType;
  value: number;
  domain?: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  category: AchievementCategory;
  points: number;
  unlockCondition: AchievementCondition;
  isHidden: boolean;
  createdAt: string;
}

export interface DbAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  category: string;
  points: number;
  unlock_condition: Record<string, unknown>;
  is_hidden: boolean;
  created_at: string;
}

export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: string;
  achievement?: Achievement;
  unlockedAt: string;
  pointsAwarded: number;
}

export interface DbUserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  points_awarded: number;
}

// Event for celebration modal
export interface AchievementUnlockedEvent {
  achievement: Achievement;
  pointsAwarded: number;
}

// ============================================
// SENSORY ANCHORS
// ============================================

export type AnchorType =
  | 'scent'
  | 'underwear'
  | 'tucking'
  | 'jewelry'
  | 'nail_polish'
  | 'makeup'
  | 'clothing'
  | 'custom';

export const ANCHOR_TYPE_INFO: Record<AnchorType, { label: string; emoji: string; examples: string }> = {
  scent: { label: 'Scent', emoji: '🌸', examples: 'Perfume, body spray, candle' },
  underwear: { label: 'Underwear', emoji: '🩲', examples: 'Panties, bra, lingerie' },
  tucking: { label: 'Tucking', emoji: '✨', examples: 'Gaff, tape, tucking underwear' },
  jewelry: { label: 'Jewelry', emoji: '💎', examples: 'Necklace, earrings, bracelet' },
  nail_polish: { label: 'Nail Polish', emoji: '💅', examples: 'Color, top coat, press-ons' },
  makeup: { label: 'Makeup', emoji: '💄', examples: 'Lipstick, mascara, foundation' },
  clothing: { label: 'Clothing', emoji: '👗', examples: 'Dress, skirt, top' },
  custom: { label: 'Custom', emoji: '⭐', examples: 'Any other anchor you use' },
};

export interface UserAnchor {
  id: string;
  userId: string;
  anchorType: AnchorType;
  name: string;
  isActive: boolean;
  effectivenessRating?: number;
  timesUsed: number;
  lastUsedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbUserAnchor {
  id: string;
  user_id: string;
  anchor_type: string;
  name: string;
  is_active: boolean;
  effectiveness_rating: number | null;
  times_used: number;
  last_used_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnchorInput {
  anchorType: AnchorType;
  name: string;
  notes?: string;
}

export interface AnchorEffectivenessLog {
  id: string;
  userId: string;
  anchorId: string;
  sessionId?: string;
  effectivenessRating: number;
  arousalChange: number;
  recordedAt: string;
}

export interface DbAnchorEffectivenessLog {
  id: string;
  user_id: string;
  anchor_id: string;
  session_id: string | null;
  effectiveness_rating: number;
  arousal_change: number;
  recorded_at: string;
}

// ============================================
// AROUSAL SESSIONS
// ============================================

export type SessionType = 'anchoring' | 'reward';
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

export interface ArousalSession {
  id: string;
  userId: string;
  sessionType: SessionType;
  preArousalLevel?: number;
  activeAnchors: string[];
  preNotes?: string;
  contentId?: string;
  contentStartedAt?: string;
  contentDurationSeconds?: number;
  postArousalLevel?: number;
  experienceQuality?: number;
  anchorEffectiveness?: number;
  postNotes?: string;
  startedAt: string;
  completedAt?: string;
  pointsAwarded: number;
  status: SessionStatus;
}

export interface DbArousalSession {
  id: string;
  user_id: string;
  session_type: string;
  pre_arousal_level: number | null;
  active_anchors: string[] | null;
  pre_notes: string | null;
  content_id: string | null;
  content_started_at: string | null;
  content_duration_seconds: number | null;
  post_arousal_level: number | null;
  experience_quality: number | null;
  anchor_effectiveness: number | null;
  post_notes: string | null;
  started_at: string;
  completed_at: string | null;
  points_awarded: number;
  status: string;
}

export interface SessionStartInput {
  sessionType: SessionType;
  activeAnchors: string[];
  preArousalLevel: number;
  preNotes?: string;
}

export interface SessionCompleteInput {
  postArousalLevel: number;
  experienceQuality: number;
  anchorEffectiveness?: number;
  postNotes?: string;
}

export interface SessionGateStatus {
  anchoringSessionsThisWeek: number;
  requiredAnchoring: number;
  rewardSessionsEarned: number;
  rewardSessionsUsed: number;
  canStartRewardSession: boolean;
  weekResetsAt: string;
}

// ============================================
// CONTENT LIBRARY
// ============================================

export type ContentType = 'audio' | 'text' | 'video' | 'image' | 'hypno';
export type ContentTier = 'daily' | 'earned' | 'premium' | 'vault';

export interface ContentUnlockRequirement {
  type: 'sessions' | 'achievement' | 'level' | 'points';
  value: number | string;
}

export interface RewardContent {
  id: string;
  title: string;
  description?: string;
  contentType: ContentType;
  tier: ContentTier;
  contentUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  unlockRequirement?: ContentUnlockRequirement;
  tags: string[];
  intensityLevel?: number;
  isActive: boolean;
  createdAt: string;
}

export interface DbRewardContent {
  id: string;
  title: string;
  description: string | null;
  content_type: string;
  tier: string;
  content_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  unlock_requirement: Record<string, unknown> | null;
  tags: string[] | null;
  intensity_level: number | null;
  is_active: boolean;
  created_at: string;
}

export interface UserContentUnlock {
  id: string;
  userId: string;
  contentId: string;
  content?: RewardContent;
  unlockedAt: string;
  unlockSource?: string;
  timesPlayed: number;
  lastPlayedAt?: string;
}

export interface DbUserContentUnlock {
  id: string;
  user_id: string;
  content_id: string;
  unlocked_at: string;
  unlock_source: string | null;
  times_played: number;
  last_played_at: string | null;
}

// ============================================
// NOTIFICATIONS
// ============================================

export type NotificationType =
  | 'micro_task'
  | 'affirmation'
  | 'content_unlock'
  | 'challenge'
  | 'jackpot'
  | 'anchor_reminder';

export type NotificationStatus =
  | 'pending'
  | 'sent'
  | 'opened'
  | 'responded'
  | 'expired'
  | 'dismissed';

export const NOTIFICATION_TYPE_WEIGHTS: Record<NotificationType, number> = {
  micro_task: 40,
  affirmation: 25,
  content_unlock: 20,
  challenge: 10,
  jackpot: 5,
  anchor_reminder: 0, // Not in default rotation
};

export interface NotificationPayload {
  title: string;
  body: string;
  action?: string;
  data?: Record<string, unknown>;
}

export interface ScheduledNotification {
  id: string;
  userId: string;
  notificationType: NotificationType;
  scheduledFor: string;
  expiresAt?: string;
  payload: NotificationPayload;
  pointsPotential: number;
  bonusMultiplier: number;
  sentAt?: string;
  openedAt?: string;
  respondedAt?: string;
  responseData?: Record<string, unknown>;
  status: NotificationStatus;
  createdAt: string;
}

export interface DbScheduledNotification {
  id: string;
  user_id: string;
  notification_type: string;
  scheduled_for: string;
  expires_at: string | null;
  payload: Record<string, unknown>;
  points_potential: number;
  bonus_multiplier: number;
  sent_at: string | null;
  opened_at: string | null;
  responded_at: string | null;
  response_data: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

export interface NotificationTemplate {
  id: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  actionText?: string;
  points: number;
  conditions?: Record<string, unknown>;
  weight: number;
  isActive: boolean;
  createdAt: string;
}

export interface DbNotificationTemplate {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  action_text: string | null;
  points: number;
  conditions: Record<string, unknown> | null;
  weight: number;
  is_active: boolean;
  created_at: string;
}

export interface UserNotificationSettings {
  id: string;
  userId: string;
  notificationsEnabled: boolean;
  earliestHour: number;
  latestHour: number;
  minNotificationsPerDay: number;
  maxNotificationsPerDay: number;
  typeWeights: Record<NotificationType, number>;
  pushToken?: string;
  pushProvider?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbUserNotificationSettings {
  id: string;
  user_id: string;
  notifications_enabled: boolean;
  earliest_hour: number;
  latest_hour: number;
  min_notifications_per_day: number;
  max_notifications_per_day: number;
  type_weights: Record<string, number>;
  push_token: string | null;
  push_provider: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// CONTEXT & EVENTS
// ============================================

export interface RewardContextState {
  rewardState: UserRewardState | null;
  achievements: UserAchievement[];
  anchors: UserAnchor[];
  sessionGate: SessionGateStatus | null;
  isLoading: boolean;
}

export interface RewardContextEvents {
  levelUpEvent: LevelUpEvent | null;
  achievementUnlockedEvent: AchievementUnlockedEvent | null;
  narrationMilestoneEvent: NarrationMilestoneEvent | null;
}

export interface LevelUpEvent {
  from: number;
  to: number;
  newTitle: string;
}

export interface NarrationMilestoneEvent {
  milestone: number;
  pointsAwarded: number;
  dailyCount: number;
}

export interface RewardContextActions {
  // Points
  addPoints: (points: number, source: PointSource, sourceId?: string, details?: Record<string, unknown>) => Promise<{ newTotal: number; levelUp?: LevelUpEvent }>;

  // Narration
  incrementNarration: () => Promise<{ newCount: number; milestoneReached?: number; pointsAwarded?: number }>;
  resetDailyNarration: () => Promise<void>;

  // Achievements
  checkAchievements: () => Promise<UserAchievement[]>;

  // Sessions
  getSessionGateStatus: () => Promise<SessionGateStatus>;
  startSession: (input: SessionStartInput) => Promise<ArousalSession>;
  completeSession: (sessionId: string, input: SessionCompleteInput) => Promise<{ session: ArousalSession; pointsAwarded: number }>;
  abandonSession: (sessionId: string) => Promise<void>;

  // Anchors
  addAnchor: (input: AnchorInput) => Promise<UserAnchor>;
  toggleAnchor: (anchorId: string, isActive: boolean) => Promise<void>;
  updateAnchorEffectiveness: (anchorId: string, rating: number) => Promise<void>;
  deleteAnchor: (anchorId: string) => Promise<void>;

  // State
  refreshRewardState: () => Promise<void>;

  // Event dismissals
  dismissLevelUp: () => void;
  dismissAchievementUnlocked: () => void;
  dismissNarrationMilestone: () => void;
}

// ============================================
// HELPER TYPES
// ============================================

export interface AchievementCheckContext {
  streak?: number;
  level?: number;
  totalSessions?: number;
  narrationCount?: number;
  anchorsCount?: number;
  totalPoints?: number;
  totalInvested?: number;
}

export interface PointAwardResult {
  transaction: PointTransaction;
  newTotal: number;
  levelUp?: LevelUpEvent;
}

export interface SessionCompleteResult {
  session: ArousalSession;
  pointsAwarded: number;
  newAchievements: UserAchievement[];
}
