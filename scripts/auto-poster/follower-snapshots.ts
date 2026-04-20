// Follower Snapshot Writer
//
// Captures current follower/sub counts across platforms into
// platform_follower_snapshots. Fed by existing engines that already scrape
// these numbers (Followback, subscriber scrape, etc.). Growth engines read
// the slope to prove or disprove that what we're shipping is working.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function snapshotFollowers(
  sb: SupabaseClient,
  userId: string,
  platform: string,
  data: { followerCount?: number; followingCount?: number; paidSubCount?: number; revenueCents24h?: number },
): Promise<void> {
  try {
    await sb.from('platform_follower_snapshots').insert({
      user_id: userId,
      platform,
      follower_count: data.followerCount ?? 0,
      following_count: data.followingCount ?? 0,
      paid_sub_count: data.paidSubCount ?? null,
      revenue_cents_24h: data.revenueCents24h ?? 0,
    });
  } catch (err) {
    console.error(`[snapshot] ${platform} failed:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Compute follower slope over N days. Returns null if not enough history.
 */
export async function getFollowerSlope(
  sb: SupabaseClient,
  userId: string,
  platform: string,
  days: number = 7,
): Promise<{ delta: number; current: number; previous: number } | null> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await sb.from('platform_follower_snapshots')
    .select('follower_count, captured_at')
    .eq('user_id', userId)
    .eq('platform', platform)
    .gte('captured_at', since)
    .order('captured_at', { ascending: true });
  if (!data || data.length < 2) return null;
  const current = data[data.length - 1].follower_count;
  const previous = data[0].follower_count;
  return { delta: current - previous, current, previous };
}
