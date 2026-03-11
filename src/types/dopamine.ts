/**
 * Dopamine Delivery System Types
 */

export type DopamineNotificationType =
  | 'micro_task'
  | 'affirmation'
  | 'content_unlock'
  | 'challenge'
  | 'jackpot'
  | 'milestone'
  | 'handler_message'
  | 'performance_validation';

export type RewardTier = 'none' | 'low' | 'medium' | 'high' | 'jackpot';

export interface NotificationPayload {
  type: DopamineNotificationType;
  rewardTier: RewardTier;
  title: string;
  body: string;
  hapticPattern?: string;
  pointsAwarded?: number;
  contentUnlocked?: string;
  actionUrl?: string;
  ginaSafe: boolean;
}

export interface PendingReward {
  type: DopamineNotificationType;
  message: string;
  title: string;
  hapticPattern?: string;
  deliverAfter: string;
  triggerEvent: string;
  pointsAwarded?: number;
  ginaSafe: boolean;
}

export interface SuppressedSignal {
  type: string;
  detail: string;
  suppressedAt: string;
  handlerSeen: boolean;
}

export interface DopamineState {
  userId: string;
  notificationsToday: number;
  notificationsTarget: number;
  lastNotificationAt: string | null;
  rewardsToday: Record<RewardTier, number>;
  bestResponseHours: number[];
  worstResponseHours: number[];
  avgOpenRate: number;
  avgTaskAfterRate: number;
  suppressedSignals: SuppressedSignal[];
  pendingRewards: PendingReward[];
  nextMilestoneThreshold: number;
  surpriseRewardProbability: number;
}

export interface DbDopamineState {
  id: string;
  user_id: string;
  notifications_today: number;
  notifications_target: number;
  last_notification_at: string | null;
  rewards_today: Record<RewardTier, number>;
  best_response_hours: number[];
  worst_response_hours: number[];
  avg_open_rate: number;
  avg_task_after_rate: number;
  suppressed_signals: SuppressedSignal[];
  pending_rewards: PendingReward[];
  next_milestone_threshold: number;
  surprise_reward_probability: number;
  updated_at: string;
  created_at: string;
}

export function mapDbToDopamineState(row: DbDopamineState): DopamineState {
  return {
    userId: row.user_id,
    notificationsToday: row.notifications_today,
    notificationsTarget: row.notifications_target,
    lastNotificationAt: row.last_notification_at,
    rewardsToday: row.rewards_today ?? { none: 0, low: 0, medium: 0, high: 0, jackpot: 0 },
    bestResponseHours: row.best_response_hours ?? [],
    worstResponseHours: row.worst_response_hours ?? [],
    avgOpenRate: Number(row.avg_open_rate),
    avgTaskAfterRate: Number(row.avg_task_after_rate),
    suppressedSignals: row.suppressed_signals ?? [],
    pendingRewards: row.pending_rewards ?? [],
    nextMilestoneThreshold: row.next_milestone_threshold,
    surpriseRewardProbability: Number(row.surprise_reward_probability),
  };
}
