/**
 * Content Recycler — Sprint 5
 * Repost content after 30 days to new communities.
 * Tracks which photos went where. Same image appears in 5+ subs over 2 months.
 * No subreddit sees the same image twice.
 */

import { supabase } from '../supabase';

// ============================================
// Types
// ============================================

interface PostingRecord {
  platform: string;
  community: string;
  postedAt: string;
  engagementScore: number;
}

interface RecycleCandidate {
  contentId: string;
  mediaUrl: string;
  originalCaption: string | null;
  performanceScore: number;
  daysSinceFirstPost: number;
  availableCommunities: string[];
  suggestedCommunity: string;
  recycleType: 'new_community' | 'throwback' | 'best_of' | 'progress_comparison';
}

// ============================================
// Constants
// ============================================

const RECYCLE_AFTER_DAYS = 30;
const MIN_PERFORMANCE_SCORE = 3; // out of 10, only recycle content that performed

// All content communities for recycling
const ALL_CONTENT_COMMUNITIES = [
  'r/sissies',
  'r/chastity',
  'r/LockedAndCaged',
  'r/FemBoys',
  'r/sissydressing',
  'r/chastitytraining',
  'r/GoonCaves',
];

// ============================================
// Core Functions
// ============================================

/**
 * Find content eligible for recycling.
 * Content must be 30+ days old and have been posted to at least one community.
 */
export async function getRecycleCandidates(
  userId: string,
  limit = 10,
): Promise<RecycleCandidate[]> {
  const cutoffDate = new Date(
    Date.now() - RECYCLE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Get content queue items that were posted 30+ days ago
  const { data: postedContent, error } = await supabase
    .from('content_queue')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .lte('posted_at', cutoffDate)
    .order('engagement_likes', { ascending: false })
    .limit(50);

  if (error || !postedContent) return [];

  // Group by media URL to find posting history per image
  const mediaHistory = new Map<string, PostingRecord[]>();
  for (const item of postedContent) {
    const url = item.media_url ?? item.content_text ?? '';
    if (!url) continue;

    if (!mediaHistory.has(url)) {
      mediaHistory.set(url, []);
    }
    mediaHistory.get(url)!.push({
      platform: item.platform,
      community: item.community_id ?? item.platform,
      postedAt: item.posted_at,
      engagementScore: calculateEngagementScore(item),
    });
  }

  const candidates: RecycleCandidate[] = [];

  for (const [mediaUrl, history] of mediaHistory.entries()) {
    const avgScore =
      history.reduce((sum, h) => sum + h.engagementScore, 0) / history.length;
    if (avgScore < MIN_PERFORMANCE_SCORE) continue;

    // Find communities this image hasn't been posted to
    const postedCommunities = new Set(history.map(h => h.community));
    const available = ALL_CONTENT_COMMUNITIES.filter(c => !postedCommunities.has(c));
    if (available.length === 0) continue;

    const firstPost = history.reduce((earliest, h) =>
      h.postedAt < earliest.postedAt ? h : earliest,
    );
    const daysSinceFirst = Math.floor(
      (Date.now() - new Date(firstPost.postedAt).getTime()) / (24 * 60 * 60 * 1000),
    );

    // Find the original content item for caption
    const original = postedContent.find(
      p => (p.media_url ?? p.content_text) === mediaUrl,
    );

    candidates.push({
      contentId: original?.id ?? '',
      mediaUrl,
      originalCaption: original?.caption_text ?? null,
      performanceScore: Math.round(avgScore * 10) / 10,
      daysSinceFirstPost: daysSinceFirst,
      availableCommunities: available,
      suggestedCommunity: pickBestCommunity(available, avgScore),
      recycleType: daysSinceFirst >= 60 ? 'throwback' : 'new_community',
    });
  }

  // Sort by performance score (best content recycled first)
  candidates.sort((a, b) => b.performanceScore - a.performanceScore);
  return candidates.slice(0, limit);
}

/**
 * Create a recycled post in the content queue.
 */
export async function createRecycledPost(
  userId: string,
  candidate: RecycleCandidate,
  newCaption: string,
  scheduledFor: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('content_queue')
    .insert({
      user_id: userId,
      platform: candidate.suggestedCommunity.startsWith('r/') ? 'reddit' : 'twitter',
      community_id: candidate.suggestedCommunity,
      content_text: newCaption,
      media_url: candidate.mediaUrl,
      scheduled_for: scheduledFor,
      status: 'queued',
      is_recycled: true,
      original_content_id: candidate.contentId || null,
      handler_intent: `Recycled content (${candidate.recycleType}). Original performance: ${candidate.performanceScore}/10. Day ${candidate.daysSinceFirstPost} since first post. New community: ${candidate.suggestedCommunity}.`,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Failed to create recycled post:', error);
    return null;
  }

  return data.id;
}

/**
 * Get recycling stats for context.
 */
export async function getRecyclingStats(
  userId: string,
): Promise<{
  eligibleForRecycle: number;
  recycledLast30d: number;
  avgRecyclePerformance: number;
}> {
  const cutoffDate = new Date(
    Date.now() - RECYCLE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [eligibleResult, recycledResult] = await Promise.allSettled([
    supabase
      .from('content_queue')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'posted')
      .lte('posted_at', cutoffDate),
    supabase
      .from('content_queue')
      .select('engagement_likes, engagement_comments')
      .eq('user_id', userId)
      .eq('is_recycled', true)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const eligible = eligibleResult.status === 'fulfilled' ? eligibleResult.value.count ?? 0 : 0;
  const recycled = recycledResult.status === 'fulfilled' ? recycledResult.value.data ?? [] : [];

  const avgPerf =
    recycled.length > 0
      ? recycled.reduce(
          (sum: number, r: { engagement_likes: number; engagement_comments: number }) =>
            sum + calculateEngagementScore(r),
          0,
        ) / recycled.length
      : 0;

  return {
    eligibleForRecycle: eligible,
    recycledLast30d: recycled.length,
    avgRecyclePerformance: Math.round(avgPerf * 10) / 10,
  };
}

/**
 * Build context string for Handler AI.
 */
export async function buildRecycleContext(userId: string): Promise<string> {
  try {
    const stats = await getRecyclingStats(userId);
    if (stats.eligibleForRecycle === 0 && stats.recycledLast30d === 0) return '';

    return `CONTENT RECYCLING: ${stats.eligibleForRecycle} eligible, ${stats.recycledLast30d} recycled (30d), avg perf ${stats.avgRecyclePerformance}/10`;
  } catch {
    return '';
  }
}

// ============================================
// Helpers
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateEngagementScore(item: any): number {
  const likes = item.engagement_likes ?? 0;
  const comments = item.engagement_comments ?? 0;
  // Simple scoring: each like = 1 point, each comment = 3 points, capped at 10
  return Math.min(10, (likes + comments * 3) / 5);
}

function pickBestCommunity(available: string[], performanceScore: number): string {
  // High-performing content goes to bigger communities
  if (performanceScore >= 7) {
    const bigSubs = available.filter(c =>
      ['r/sissies', 'r/FemBoys', 'r/chastity'].includes(c),
    );
    if (bigSubs.length > 0) return bigSubs[0];
  }

  // Otherwise pick the first available niche sub
  return available[0];
}
