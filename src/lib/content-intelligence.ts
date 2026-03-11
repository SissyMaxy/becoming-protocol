/**
 * Content Intelligence Engine
 * Analyzes performance data, computes strategy recommendations, generates quick summaries.
 * The brain that closes the feedback loop between content output and Handler prescriptions.
 * Pure Supabase logic. No React.
 */

import { supabase } from './supabase';
import type {
  DbContentPerformanceSnapshot,
  DbContentStrategyState,
  ContentStrategyState,
  QuickPerformanceSummary,
  PlatformPerformance,
  ContentTypePerformance,
  DenialDayPerformance,
  SkipPatternEntry,
} from '../types/content-intelligence';

// ============================================
// PERFORMANCE SNAPSHOT
// ============================================

/**
 * Snapshot posted content_queue items that haven't been snapshotted recently.
 * Called on app open or daily.
 */
export async function snapshotContentPerformance(userId: string): Promise<number> {
  // Get posted items with engagement data that haven't been snapshotted in the last 12 hours
  const twelveHoursAgo = new Date(Date.now() - 12 * 3600000).toISOString();

  const { data: postedItems } = await supabase
    .from('content_queue')
    .select('id, platform, content_type, source_shoot_id, denial_day_badge, posted_at, engagement_stats')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .eq('performance_logged', true);

  if (!postedItems || postedItems.length === 0) return 0;

  // Check which ones we already have recent snapshots for
  const { data: recentSnapshots } = await supabase
    .from('content_performance_snapshots')
    .select('content_queue_id')
    .eq('user_id', userId)
    .gte('snapshotted_at', twelveHoursAgo);

  const recentIds = new Set((recentSnapshots || []).map((s: { content_queue_id: string }) => s.content_queue_id));
  const toSnapshot = postedItems.filter((item: { id: string }) => !recentIds.has(item.id));

  if (toSnapshot.length === 0) return 0;

  // Get shoot types for items linked to shoots
  const shootIds = toSnapshot
    .map((item: { source_shoot_id: string | null }) => item.source_shoot_id)
    .filter(Boolean);

  let shootTypeMap: Record<string, string> = {};
  if (shootIds.length > 0) {
    const { data: shoots } = await supabase
      .from('shoot_prescriptions')
      .select('id, shoot_type, exposure_level')
      .in('id', shootIds);

    if (shoots) {
      for (const s of shoots) {
        shootTypeMap[s.id] = s.shoot_type;
      }
    }
  }

  // Create snapshots
  const snapshots = toSnapshot.map((item: {
    id: string;
    platform: string;
    content_type: string;
    source_shoot_id: string | null;
    denial_day_badge: number | null;
    posted_at: string | null;
    engagement_stats: Record<string, number> | null;
  }) => {
    const stats = item.engagement_stats || {};
    const views = stats.views || 0;
    const likes = stats.likes || 0;
    const comments = stats.comments || 0;
    const tips = stats.tips_earned || 0;
    const newFollowers = stats.new_followers || 0;

    const postedDate = item.posted_at ? new Date(item.posted_at) : null;

    return {
      user_id: userId,
      content_queue_id: item.id,
      platform: item.platform,
      content_type: item.content_type,
      shoot_type: item.source_shoot_id ? (shootTypeMap[item.source_shoot_id] || null) : null,
      denial_day_at_post: item.denial_day_badge,
      exposure_level_at_post: null,
      posted_at: item.posted_at,
      views,
      likes,
      comments,
      tips_earned: tips,
      new_followers: newFollowers,
      engagement_rate: views > 0 ? (likes + comments) / views : null,
      revenue_per_view: views > 0 ? tips / views : null,
      posted_hour: postedDate ? postedDate.getUTCHours() : null,
      posted_day_of_week: postedDate ? postedDate.getUTCDay() : null,
    };
  });

  const { error } = await supabase
    .from('content_performance_snapshots')
    .insert(snapshots);

  if (error) {
    console.error('Snapshot insert error:', error);
    return 0;
  }

  return snapshots.length;
}

/**
 * Update engagement metrics on a content_queue item (manual entry).
 */
export async function updatePerformanceFromQueue(
  userId: string,
  contentQueueId: string,
  metrics: { views: number; likes: number; comments: number; tips: number; newFollowers?: number },
): Promise<void> {
  const engagementStats = {
    views: metrics.views,
    likes: metrics.likes,
    comments: metrics.comments,
    tips_earned: metrics.tips,
    new_followers: metrics.newFollowers ?? 0,
  };

  await supabase
    .from('content_queue')
    .update({
      engagement_stats: engagementStats,
      performance_logged: true,
      performance_logged_at: new Date().toISOString(),
    })
    .eq('id', contentQueueId)
    .eq('user_id', userId);
}

// ============================================
// ANALYSIS
// ============================================

/**
 * Full analysis run. Aggregates snapshots into strategy state.
 * Conservative — requires minimum data points before making recommendations.
 */
export async function analyzeContentPerformance(userId: string): Promise<void> {
  const { data: snapshots } = await supabase
    .from('content_performance_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('snapshotted_at', { ascending: false })
    .limit(500);

  if (!snapshots || snapshots.length < 3) return; // Not enough data

  const rows = snapshots as DbContentPerformanceSnapshot[];

  // 1. Platform performance
  const platformPerformance: Record<string, PlatformPerformance> = {};
  const byPlatform: Record<string, DbContentPerformanceSnapshot[]> = {};
  for (const r of rows) {
    if (!byPlatform[r.platform]) byPlatform[r.platform] = [];
    byPlatform[r.platform].push(r);
  }

  for (const [platform, items] of Object.entries(byPlatform)) {
    const avgViews = items.reduce((s, i) => s + i.views, 0) / items.length;
    const avgLikes = items.reduce((s, i) => s + i.likes, 0) / items.length;
    const avgEng = items.reduce((s, i) => s + (Number(i.engagement_rate) || 0), 0) / items.length;

    // Best type per platform
    const typeEngagement: Record<string, { total: number; count: number }> = {};
    for (const i of items) {
      const t = i.shoot_type || i.content_type;
      if (!typeEngagement[t]) typeEngagement[t] = { total: 0, count: 0 };
      typeEngagement[t].total += Number(i.engagement_rate) || 0;
      typeEngagement[t].count++;
    }
    const bestType = Object.entries(typeEngagement)
      .filter(([, v]) => v.count >= 2)
      .sort(([, a], [, b]) => (b.total / b.count) - (a.total / a.count))[0];

    // Best hour
    const hourEngagement: Record<number, { total: number; count: number }> = {};
    for (const i of items) {
      if (i.posted_hour !== null) {
        if (!hourEngagement[i.posted_hour]) hourEngagement[i.posted_hour] = { total: 0, count: 0 };
        hourEngagement[i.posted_hour].total += Number(i.engagement_rate) || 0;
        hourEngagement[i.posted_hour].count++;
      }
    }
    const bestHour = Object.entries(hourEngagement)
      .filter(([, v]) => v.count >= 2)
      .sort(([, a], [, b]) => (b.total / b.count) - (a.total / a.count))[0];

    platformPerformance[platform] = {
      avg_views: Math.round(avgViews),
      avg_likes: Math.round(avgLikes),
      avg_engagement: Math.round(avgEng * 10000) / 10000,
      best_type: bestType ? bestType[0] : null,
      best_hour: bestHour ? Number(bestHour[0]) : null,
      post_count: items.length,
    };
  }

  // 2. Content type performance
  const contentTypePerformance: Record<string, ContentTypePerformance> = {};
  const byType: Record<string, DbContentPerformanceSnapshot[]> = {};
  for (const r of rows) {
    const t = r.shoot_type || r.content_type;
    if (!byType[t]) byType[t] = [];
    byType[t].push(r);
  }

  for (const [type, items] of Object.entries(byType)) {
    const avgEng = items.reduce((s, i) => s + (Number(i.engagement_rate) || 0), 0) / items.length;
    const avgRev = items.reduce((s, i) => s + Number(i.tips_earned), 0) / items.length;

    contentTypePerformance[type] = {
      avg_engagement: Math.round(avgEng * 10000) / 10000,
      avg_revenue: Math.round(avgRev * 100) / 100,
      count: items.length,
      completion_rate: 1, // Updated separately from skip patterns
    };
  }

  // 3. Timing analysis
  const hourBuckets: Record<number, { total: number; count: number }> = {};
  const dayBuckets: Record<number, { total: number; count: number }> = {};
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  for (const r of rows) {
    if (r.posted_hour !== null) {
      if (!hourBuckets[r.posted_hour]) hourBuckets[r.posted_hour] = { total: 0, count: 0 };
      hourBuckets[r.posted_hour].total += Number(r.engagement_rate) || 0;
      hourBuckets[r.posted_hour].count++;
    }
    if (r.posted_day_of_week !== null) {
      if (!dayBuckets[r.posted_day_of_week]) dayBuckets[r.posted_day_of_week] = { total: 0, count: 0 };
      dayBuckets[r.posted_day_of_week].total += Number(r.engagement_rate) || 0;
      dayBuckets[r.posted_day_of_week].count++;
    }
  }

  const sortedHours = Object.entries(hourBuckets)
    .filter(([, v]) => v.count >= 2)
    .sort(([, a], [, b]) => (b.total / b.count) - (a.total / a.count));

  const sortedDays = Object.entries(dayBuckets)
    .filter(([, v]) => v.count >= 2)
    .sort(([, a], [, b]) => (b.total / b.count) - (a.total / a.count));

  const timingPerformance = {
    best_hours: sortedHours.slice(0, 3).map(([h]) => Number(h)),
    worst_hours: sortedHours.slice(-3).map(([h]) => Number(h)),
    best_days: sortedDays.slice(0, 2).map(([d]) => dayNames[Number(d)]),
    worst_days: sortedDays.slice(-2).map(([d]) => dayNames[Number(d)]),
  };

  // 4. Denial day correlation
  const denialDayPerformance: Record<string, DenialDayPerformance> = {};
  const denialBuckets: Record<string, { total: number; count: number }> = {
    '1-2': { total: 0, count: 0 },
    '3-4': { total: 0, count: 0 },
    '5+': { total: 0, count: 0 },
  };

  for (const r of rows) {
    if (r.denial_day_at_post !== null) {
      const bucket = r.denial_day_at_post <= 2 ? '1-2' : r.denial_day_at_post <= 4 ? '3-4' : '5+';
      denialBuckets[bucket].total += Number(r.engagement_rate) || 0;
      denialBuckets[bucket].count++;
    }
  }

  for (const [bucket, data] of Object.entries(denialBuckets)) {
    if (data.count >= 2) {
      denialDayPerformance[bucket] = {
        avg_engagement: Math.round((data.total / data.count) * 10000) / 10000,
        count: data.count,
      };
    }
  }

  // 5. Generate recommendations
  // Platform mix — weight by engagement-to-effort ratio
  const recommendedPlatformMix: Record<string, number> = {};
  const totalEngagement = Object.values(platformPerformance).reduce((s, p) => s + p.avg_engagement, 0);
  if (totalEngagement > 0) {
    for (const [platform, perf] of Object.entries(platformPerformance)) {
      recommendedPlatformMix[platform] = Math.round((perf.avg_engagement / totalEngagement) * 100) / 100;
    }
  }

  // Shoot frequency — more of what gets completed + performs well
  const recommendedShootFrequency: Record<string, number> = {};
  for (const [type, perf] of Object.entries(contentTypePerformance)) {
    if (perf.count < 2) continue;
    // Base: 1/week. If engagement > median, bump up.
    const medianEng = Object.values(contentTypePerformance)
      .map(p => p.avg_engagement)
      .sort((a, b) => a - b);
    const median = medianEng[Math.floor(medianEng.length / 2)] || 0;
    recommendedShootFrequency[type] = perf.avg_engagement >= median ? 3 : 1;
  }

  // Posting times per platform
  const recommendedPostingTimes: Record<string, number[]> = {};
  for (const [platform, perf] of Object.entries(platformPerformance)) {
    if (perf.best_hour !== null) {
      recommendedPostingTimes[platform] = [perf.best_hour];
    }
  }
  // Fill from global best hours
  if (timingPerformance.best_hours.length > 0) {
    for (const platform of Object.keys(platformPerformance)) {
      if (!recommendedPostingTimes[platform]) {
        recommendedPostingTimes[platform] = timingPerformance.best_hours.slice(0, 2);
      }
    }
  }

  // Revenue
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const weeklyRows = rows.filter(r => r.snapshotted_at >= sevenDaysAgo);
  const monthlyRows = rows.filter(r => r.snapshotted_at >= thirtyDaysAgo);

  const weeklyRevenue = weeklyRows.reduce((s, r) => s + Number(r.tips_earned), 0);
  const monthlyRevenue = monthlyRows.reduce((s, r) => s + Number(r.tips_earned), 0);

  // Trend: compare last 2 weeks
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const prevWeekRows = rows.filter(r => r.snapshotted_at >= twoWeeksAgo && r.snapshotted_at < sevenDaysAgo);
  const prevWeekRevenue = prevWeekRows.reduce((s, r) => s + Number(r.tips_earned), 0);

  let revenueTrend: string = 'unknown';
  if (prevWeekRevenue > 0) {
    const change = (weeklyRevenue - prevWeekRevenue) / prevWeekRevenue;
    revenueTrend = change > 0.1 ? 'growing' : change < -0.1 ? 'declining' : 'stable';
  }

  // Upsert strategy state
  await supabase
    .from('content_strategy_state')
    .upsert({
      user_id: userId,
      platform_performance: platformPerformance,
      content_type_performance: contentTypePerformance,
      timing_performance: timingPerformance,
      denial_day_performance: denialDayPerformance,
      recommended_platform_mix: recommendedPlatformMix,
      recommended_shoot_frequency: recommendedShootFrequency,
      recommended_posting_times: recommendedPostingTimes,
      weekly_revenue: weeklyRevenue,
      monthly_revenue: monthlyRevenue,
      revenue_trend: revenueTrend,
      last_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
}

// ============================================
// SKIP TRACKING (intelligence layer)
// ============================================

/**
 * Record a skip in the content strategy state.
 * Called alongside the existing skip-escalation system.
 */
export async function trackSkipForIntelligence(
  userId: string,
  shootType: string,
  reason?: string,
): Promise<void> {
  const { data: strategy } = await supabase
    .from('content_strategy_state')
    .select('skip_patterns')
    .eq('user_id', userId)
    .single();

  const patterns: Record<string, SkipPatternEntry> = strategy?.skip_patterns ?? {};
  const entry = patterns[shootType] ?? { total: 0, skipped: 0, skip_rate: 0, reasons: {} };

  entry.total = (entry.total ?? 0) + 1;
  entry.skipped = (entry.skipped ?? 0) + 1;
  entry.skip_rate = entry.total > 0 ? entry.skipped / entry.total : 0;

  if (reason) {
    entry.reasons = entry.reasons ?? {};
    entry.reasons[reason] = (entry.reasons[reason] ?? 0) + 1;
  }

  patterns[shootType] = entry;

  await supabase
    .from('content_strategy_state')
    .upsert(
      { user_id: userId, skip_patterns: patterns, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

/**
 * Record a shoot completion in the content strategy state.
 */
export async function trackCompletionForIntelligence(
  userId: string,
  shootType: string,
): Promise<void> {
  const { data: strategy } = await supabase
    .from('content_strategy_state')
    .select('skip_patterns')
    .eq('user_id', userId)
    .single();

  const patterns: Record<string, SkipPatternEntry> = strategy?.skip_patterns ?? {};
  const entry = patterns[shootType] ?? { total: 0, skipped: 0, skip_rate: 0, reasons: {} };

  entry.total = (entry.total ?? 0) + 1;
  // Don't increment skipped — this was a completion
  entry.skip_rate = entry.total > 0 ? entry.skipped / entry.total : 0;

  patterns[shootType] = entry;

  await supabase
    .from('content_strategy_state')
    .upsert(
      { user_id: userId, skip_patterns: patterns, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

// ============================================
// QUICK SUMMARY (obfuscation layer for Maxy)
// ============================================

/**
 * Lightweight summary for morning briefing. Maxy sees validation, not analytics.
 */
export async function getQuickPerformanceSummary(userId: string): Promise<QuickPerformanceSummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: snapshots } = await supabase
    .from('content_performance_snapshots')
    .select('views, likes, comments, tips_earned, new_followers, platform, content_type, shoot_type')
    .eq('user_id', userId)
    .gte('snapshotted_at', sevenDaysAgo)
    .order('views', { ascending: false });

  const rows = snapshots || [];

  const weeklyViews = rows.reduce((s: number, r: { views: number }) => s + r.views, 0);
  const weeklyRevenue = rows.reduce((s: number, r: { tips_earned: number }) => s + Number(r.tips_earned), 0);
  const weeklyNewFollowers = rows.reduce((s: number, r: { new_followers: number }) => s + r.new_followers, 0);

  const topPost = rows.length > 0
    ? { platform: rows[0].platform, type: rows[0].shoot_type || rows[0].content_type, views: rows[0].views, likes: rows[0].likes }
    : null;

  // Compute trend from strategy state
  const { data: strategy } = await supabase
    .from('content_strategy_state')
    .select('revenue_trend, content_type_performance')
    .eq('user_id', userId)
    .single();

  const trend = (strategy?.revenue_trend === 'growing' ? 'up'
    : strategy?.revenue_trend === 'declining' ? 'down'
    : 'stable') as QuickPerformanceSummary['trend'];

  // Generate one-line insight
  let oneLineInsight = 'Keep creating. The data is building.';
  if (strategy?.content_type_performance) {
    const types = Object.entries(strategy.content_type_performance as Record<string, ContentTypePerformance>)
      .filter(([, v]) => v.count >= 3)
      .sort(([, a], [, b]) => b.avg_engagement - a.avg_engagement);

    if (types.length >= 2) {
      const [bestType] = types[0];
      const ratio = Math.round(types[0][1].avg_engagement / types[types.length - 1][1].avg_engagement);
      if (ratio >= 2) {
        oneLineInsight = `${bestType.replace(/_/g, ' ')} content outperforms ${ratio}:1.`;
      }
    }
  }

  return {
    weeklyRevenue: Math.round(weeklyRevenue * 100) / 100,
    weeklyViews,
    weeklyNewFollowers,
    topPostThisWeek: topPost,
    trend,
    oneLineInsight,
  };
}

// ============================================
// STRATEGY RETRIEVAL
// ============================================

export async function getContentStrategy(userId: string): Promise<ContentStrategyState | null> {
  const { data } = await supabase
    .from('content_strategy_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) return null;

  // Inline mapping to avoid circular import
  const row = data as DbContentStrategyState;
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

/**
 * Get count of posts awaiting performance logging.
 */
export async function getUnloggedPostCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('content_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'posted')
    .eq('performance_logged', false);

  return count ?? 0;
}

/**
 * Get the next unlogged post for the PerformanceLogInput.
 */
export async function getNextUnloggedPost(userId: string): Promise<{
  id: string;
  platform: string;
  contentType: string;
  caption: string | null;
  postedAt: string | null;
} | null> {
  const { data } = await supabase
    .from('content_queue')
    .select('id, platform, content_type, caption, posted_at')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .eq('performance_logged', false)
    .order('posted_at', { ascending: true })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    platform: data.platform,
    contentType: data.content_type,
    caption: data.caption,
    postedAt: data.posted_at,
  };
}
