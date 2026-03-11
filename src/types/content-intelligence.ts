/**
 * Content Intelligence Types
 * Performance tracking, strategy state, and content calendar.
 */

// ============================================
// Performance Snapshot
// ============================================

export interface ContentPerformanceSnapshot {
  id: string;
  userId: string;
  contentQueueId: string | null;
  platform: string;
  contentType: string;
  shootType: string | null;
  denialDayAtPost: number | null;
  exposureLevelAtPost: number | null;
  postedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  tipsEarned: number;
  newFollowers: number;
  engagementRate: number | null;
  revenuePerView: number | null;
  postedHour: number | null;
  postedDayOfWeek: number | null;
  snapshottedAt: string;
  createdAt: string;
}

export interface DbContentPerformanceSnapshot {
  id: string;
  user_id: string;
  content_queue_id: string | null;
  platform: string;
  content_type: string;
  shoot_type: string | null;
  denial_day_at_post: number | null;
  exposure_level_at_post: number | null;
  posted_at: string | null;
  views: number;
  likes: number;
  comments: number;
  tips_earned: number;
  new_followers: number;
  engagement_rate: number | null;
  revenue_per_view: number | null;
  posted_hour: number | null;
  posted_day_of_week: number | null;
  snapshotted_at: string;
  created_at: string;
}

// ============================================
// Strategy State
// ============================================

export interface PlatformPerformance {
  avg_views: number;
  avg_likes: number;
  avg_engagement: number;
  best_type: string | null;
  best_hour: number | null;
  post_count: number;
}

export interface ContentTypePerformance {
  avg_engagement: number;
  avg_revenue: number;
  count: number;
  completion_rate: number;
}

export interface TimingPerformance {
  best_hours: number[];
  worst_hours: number[];
  best_days: string[];
  worst_days: string[];
}

export interface DenialDayPerformance {
  avg_engagement: number;
  count: number;
}

export interface SkipPatternEntry {
  total: number;
  skipped: number;
  skip_rate: number;
  reasons: Record<string, number>;
}

export interface ContentStrategyState {
  id: string;
  userId: string;
  platformPerformance: Record<string, PlatformPerformance>;
  contentTypePerformance: Record<string, ContentTypePerformance>;
  timingPerformance: TimingPerformance;
  denialDayPerformance: Record<string, DenialDayPerformance>;
  skipPatterns: Record<string, SkipPatternEntry>;
  recommendedPlatformMix: Record<string, number>;
  recommendedShootFrequency: Record<string, number>;
  recommendedPostingTimes: Record<string, number[]>;
  weeklyPlan: Record<string, WeeklyPlanDay>;
  planGeneratedAt: string | null;
  weeklyRevenue: number;
  monthlyRevenue: number;
  revenueTrend: 'growing' | 'stable' | 'declining' | 'unknown';
  revenuePerHourOfEffort: number | null;
  lastAnalyzedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbContentStrategyState {
  id: string;
  user_id: string;
  platform_performance: Record<string, PlatformPerformance>;
  content_type_performance: Record<string, ContentTypePerformance>;
  timing_performance: TimingPerformance;
  denial_day_performance: Record<string, DenialDayPerformance>;
  skip_patterns: Record<string, SkipPatternEntry>;
  recommended_platform_mix: Record<string, number>;
  recommended_shoot_frequency: Record<string, number>;
  recommended_posting_times: Record<string, number[]>;
  weekly_plan: Record<string, WeeklyPlanDay>;
  plan_generated_at: string | null;
  weekly_revenue: number;
  monthly_revenue: number;
  revenue_trend: string;
  revenue_per_hour_of_effort: number | null;
  last_analyzed_at: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// Content Calendar
// ============================================

export interface WeeklyPlanDay {
  shoot: string | null;
  type: string;
  platform: string;
  post_time: number;
  notes: string;
  status?: 'pending' | 'done' | 'skipped';
}

// ============================================
// Quick Summary (for morning briefing / obfuscation layer)
// ============================================

export interface QuickPerformanceSummary {
  weeklyRevenue: number;
  weeklyViews: number;
  weeklyNewFollowers: number;
  topPostThisWeek: { platform: string; type: string; views: number; likes: number } | null;
  trend: 'up' | 'down' | 'stable';
  oneLineInsight: string;
}

// ============================================
// Mappers
// ============================================

export function mapDbToSnapshot(row: DbContentPerformanceSnapshot): ContentPerformanceSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    contentQueueId: row.content_queue_id,
    platform: row.platform,
    contentType: row.content_type,
    shootType: row.shoot_type,
    denialDayAtPost: row.denial_day_at_post,
    exposureLevelAtPost: row.exposure_level_at_post,
    postedAt: row.posted_at,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    tipsEarned: Number(row.tips_earned),
    newFollowers: row.new_followers,
    engagementRate: row.engagement_rate ? Number(row.engagement_rate) : null,
    revenuePerView: row.revenue_per_view ? Number(row.revenue_per_view) : null,
    postedHour: row.posted_hour,
    postedDayOfWeek: row.posted_day_of_week,
    snapshottedAt: row.snapshotted_at,
    createdAt: row.created_at,
  };
}

export function mapDbToStrategy(row: DbContentStrategyState): ContentStrategyState {
  return {
    id: row.id,
    userId: row.user_id,
    platformPerformance: row.platform_performance ?? {},
    contentTypePerformance: row.content_type_performance ?? {},
    timingPerformance: row.timing_performance ?? { best_hours: [], worst_hours: [], best_days: [], worst_days: [] },
    denialDayPerformance: row.denial_day_performance ?? {},
    skipPatterns: row.skip_patterns ?? {},
    recommendedPlatformMix: row.recommended_platform_mix ?? {},
    recommendedShootFrequency: row.recommended_shoot_frequency ?? {},
    recommendedPostingTimes: row.recommended_posting_times ?? {},
    weeklyPlan: row.weekly_plan ?? {},
    planGeneratedAt: row.plan_generated_at,
    weeklyRevenue: Number(row.weekly_revenue),
    monthlyRevenue: Number(row.monthly_revenue),
    revenueTrend: (row.revenue_trend as ContentStrategyState['revenueTrend']) ?? 'unknown',
    revenuePerHourOfEffort: row.revenue_per_hour_of_effort ? Number(row.revenue_per_hour_of_effort) : null,
    lastAnalyzedAt: row.last_analyzed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
