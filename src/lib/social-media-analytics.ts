/**
 * Social Media Analytics — data loading for the socials dashboard.
 * Queries ai_generated_content and related tables.
 */

import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────────────

export interface PlatformStats {
  platform: string;
  postsToday: number;
  postsThisWeek: number;
  repliesToday: number;
  repliesThisWeek: number;
  scheduledCount: number;
  failedToday: number;
}

export interface RecentPost {
  id: string;
  platform: string;
  contentType: string;
  content: string;
  status: string;
  scheduledAt: string | null;
  postedAt: string | null;
  targetAccount: string | null;
  targetSubreddit: string | null;
  generationStrategy: string | null;
}

export interface DailyActivity {
  date: string;
  posts: number;
  replies: number;
  failed: number;
}

export interface QualityMetrics {
  totalGenerated: number;
  totalPosted: number;
  totalFailed: number;
  passRate: number;
  avgAttemptsBeforePost: number;
}

export interface SocialDashboardData {
  platformStats: PlatformStats[];
  recentPosts: RecentPost[];
  recentReplies: RecentPost[];
  scheduledQueue: RecentPost[];
  dailyActivity: DailyActivity[];
  quality: QualityMetrics;
}

// ── Helpers ──────────────────────────────────────────────────────────

function startOfDay(daysAgo: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function mapRow(row: Record<string, unknown>): RecentPost {
  return {
    id: row.id as string,
    platform: row.platform as string,
    contentType: row.content_type as string,
    content: row.content as string,
    status: row.status as string,
    scheduledAt: row.scheduled_at as string | null,
    postedAt: row.posted_at as string | null,
    targetAccount: row.target_account as string | null,
    targetSubreddit: row.target_subreddit as string | null,
    generationStrategy: row.generation_strategy as string | null,
  };
}

// ── Data loaders ─────────────────────────────────────────────────────

export async function loadSocialDashboard(userId: string): Promise<SocialDashboardData> {
  const todayStart = startOfDay(0);
  const weekStart = startOfDay(7);

  // Run all queries in parallel
  const [
    allRecent,
    scheduled,
    weekActivity,
  ] = await Promise.all([
    // All content from last 7 days
    supabase
      .from('ai_generated_content')
      .select('id, platform, content_type, content, status, scheduled_at, posted_at, target_account, target_subreddit, generation_strategy')
      .eq('user_id', userId)
      .gte('created_at', weekStart)
      .order('created_at', { ascending: false })
      .limit(500),

    // Scheduled queue
    supabase
      .from('ai_generated_content')
      .select('id, platform, content_type, content, status, scheduled_at, posted_at, target_account, target_subreddit, generation_strategy')
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(50),

    // Daily counts for chart (last 14 days)
    supabase
      .from('ai_generated_content')
      .select('status, content_type, posted_at, created_at')
      .eq('user_id', userId)
      .gte('created_at', startOfDay(14))
      .limit(1000),
  ]);

  const rows = (allRecent.data || []) as Record<string, unknown>[];
  const scheduledRows = (scheduled.data || []) as Record<string, unknown>[];
  const activityRows = (weekActivity.data || []) as Record<string, unknown>[];

  // ── Platform stats ──
  const platforms = ['twitter', 'reddit', 'fetlife', 'fansly', 'onlyfans', 'sniffies'];
  const platformStats: PlatformStats[] = platforms.map(platform => {
    const platformRows = rows.filter(r => r.platform === platform);
    const todayRows = platformRows.filter(r => {
      const ts = (r.posted_at || r.created_at) as string;
      return ts && ts >= todayStart;
    });

    return {
      platform,
      postsToday: todayRows.filter(r => r.content_type !== 'reply' && r.status === 'posted').length,
      postsThisWeek: platformRows.filter(r => r.content_type !== 'reply' && r.status === 'posted').length,
      repliesToday: todayRows.filter(r => r.content_type === 'reply' && r.status === 'posted').length,
      repliesThisWeek: platformRows.filter(r => r.content_type === 'reply' && r.status === 'posted').length,
      scheduledCount: scheduledRows.filter(r => r.platform === platform).length,
      failedToday: todayRows.filter(r => r.status === 'failed').length,
    };
  }).filter(s => s.postsToday + s.postsThisWeek + s.repliesToday + s.repliesThisWeek + s.scheduledCount > 0);

  // ── Recent posts (non-reply) ──
  const recentPosts = rows
    .filter(r => r.content_type !== 'reply' && r.status === 'posted')
    .slice(0, 20)
    .map(mapRow);

  // ── Recent replies ──
  const recentReplies = rows
    .filter(r => r.content_type === 'reply' && r.status === 'posted')
    .slice(0, 20)
    .map(mapRow);

  // ── Scheduled queue ──
  const scheduledQueue = scheduledRows.map(mapRow);

  // ── Daily activity chart ──
  const dailyMap: Record<string, DailyActivity> = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dailyMap[key] = { date: key, posts: 0, replies: 0, failed: 0 };
  }

  for (const row of activityRows) {
    const ts = (row.posted_at || row.created_at) as string;
    if (!ts) continue;
    const dateKey = ts.split('T')[0];
    if (!dailyMap[dateKey]) continue;

    if (row.status === 'failed') {
      dailyMap[dateKey].failed++;
    } else if (row.status === 'posted') {
      if (row.content_type === 'reply') {
        dailyMap[dateKey].replies++;
      } else {
        dailyMap[dateKey].posts++;
      }
    }
  }

  const dailyActivity = Object.values(dailyMap);

  // ── Quality metrics ──
  const totalPosted = rows.filter(r => r.status === 'posted').length;
  const totalFailed = rows.filter(r => r.status === 'failed').length;
  const totalGenerated = totalPosted + totalFailed;

  const quality: QualityMetrics = {
    totalGenerated,
    totalPosted,
    totalFailed,
    passRate: totalGenerated > 0 ? Math.round((totalPosted / totalGenerated) * 100) : 0,
    avgAttemptsBeforePost: totalPosted > 0 ? Math.round(((totalGenerated / totalPosted) + Number.EPSILON) * 10) / 10 : 0,
  };

  return {
    platformStats,
    recentPosts,
    recentReplies,
    scheduledQueue,
    dailyActivity,
    quality,
  };
}
