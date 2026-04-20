/**
 * Engagement Budget — tracks daily engagement counts per platform.
 * Prevents over-engagement that could trigger spam detection.
 */

import 'dotenv/config';
import { supabase } from './config';
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_LIMITS: Record<string, Record<string, number>> = {
  twitter: { reply: 20, follow: 25, unfollow: 20, quote_tweet: 4, dm: 10 },
  reddit: { comment: 8, original_post: 2 },
  fetlife: { group_discussion: 3, blog_post: 1 },
  fansly: { subscriber_reply: 999, original_post: 3 },
  onlyfans: { subscriber_reply: 999, original_post: 1 },
  // Sniffies: keep propositioning men who want to meet. Hookup context —
  // the platform doesn't spam-flag like Twitter; high ceiling is intentional.
  sniffies: { chat: 200 },
};

function getDefaultLimit(platform: string, type: string): number {
  return DEFAULT_LIMITS[platform]?.[type] ?? 10;
}

function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check if we're under the daily budget for a given platform/type.
 */
export async function checkBudget(
  sb: SupabaseClient,
  userId: string,
  platform: string,
  type: string,
  limit?: number,
): Promise<boolean> {
  const maxAllowed = limit ?? getDefaultLimit(platform, type);
  const today = todayDate();

  const { data } = await sb
    .from('platform_engagement_budget')
    .select('count')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('platform', platform)
    .eq('engagement_type', type)
    .single();

  if (!data) return true; // No row = 0 usage
  return (data.count || 0) < maxAllowed;
}

/**
 * Increment today's count for a given platform/type.
 * Upserts the row if it doesn't exist.
 */
export async function incrementBudget(
  sb: SupabaseClient,
  userId: string,
  platform: string,
  type: string,
): Promise<void> {
  const today = todayDate();
  const maxAllowed = getDefaultLimit(platform, type);

  // Try to fetch existing row
  const { data: existing } = await sb
    .from('platform_engagement_budget')
    .select('id, count')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('platform', platform)
    .eq('engagement_type', type)
    .single();

  if (existing) {
    await sb
      .from('platform_engagement_budget')
      .update({ count: (existing.count || 0) + 1 })
      .eq('id', existing.id);
  } else {
    await sb.from('platform_engagement_budget').insert({
      user_id: userId,
      date: today,
      platform,
      engagement_type: type,
      count: 1,
      max_allowed: maxAllowed,
    });
  }
}

/**
 * Get all platform budgets for today.
 */
export async function getDailyBudget(
  sb: SupabaseClient,
  userId: string,
): Promise<Array<{ platform: string; engagement_type: string; count: number; max_allowed: number }>> {
  const today = todayDate();

  const { data } = await sb
    .from('platform_engagement_budget')
    .select('platform, engagement_type, count, max_allowed')
    .eq('user_id', userId)
    .eq('date', today);

  return data || [];
}

// Direct invocation — show today's budget
if (require.main === module) {
  const userId = process.env.USER_ID || '';
  if (!userId) {
    console.error('Missing USER_ID');
    process.exit(1);
  }

  getDailyBudget(supabase, userId).then(budget => {
    console.log('[Budget] Today\'s engagement usage:\n');
    if (budget.length === 0) {
      console.log('  No engagement recorded today.');
    } else {
      for (const row of budget) {
        console.log(`  ${row.platform}/${row.engagement_type}: ${row.count}/${row.max_allowed}`);
      }
    }

    // Show defaults for platforms with no rows
    console.log('\nDefault limits:');
    for (const [platform, types] of Object.entries(DEFAULT_LIMITS)) {
      for (const [type, limit] of Object.entries(types)) {
        console.log(`  ${platform}/${type}: ${limit}/day`);
      }
    }

    process.exit(0);
  });
}
