/**
 * Engagement Engine
 *
 * Active engagement with other accounts.
 * The Handler doesn't just post — it socializes as Maxy.
 * Discovers targets, generates contextual replies, builds visibility.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
// MAXY_VOICE_PROMPT will be used when engagement replies use AI generation
import type { EngagementTarget, EngagementTargetType } from '../../types/revenue-engine';

// ── Engagement cycle ────────────────────────────────────────────────

/**
 * Run a single engagement cycle: pick targets and generate replies.
 * Scheduled every 3 hours.
 */
export async function runEngagementCycle(
  _client: Anthropic,
  userId: string,
): Promise<{ targetsEngaged: number }> {
  const { data: targets } = await supabase
    .from('engagement_targets')
    .select('*')
    .eq('user_id', userId)
    .order('last_interaction_at', { ascending: true, nullsFirst: true })
    .limit(10);

  if (!targets || targets.length === 0) return { targetsEngaged: 0 };

  let engaged = 0;

  for (const target of targets as EngagementTarget[]) {
    const replyPrompt = `
You are Maxy. Write a reply to a post by @${target.target_handle} on ${target.platform}.
They are a ${target.target_type}.

Your strategy for this account: ${target.strategy || 'Build familiarity. Be genuine. Stand out from generic replies.'}

Write a reply that:
- Is genuinely engaging, not sycophantic
- Shows personality
- Makes them want to check out your profile
- Is 1-2 sentences max

Output ONLY the reply text.
    `;

    // Queue the engagement reply for the auto-poster to pick up
    // The auto-poster's Playwright scripts will:
    // 1. Navigate to target's profile
    // 2. Find their most recent post
    // 3. Post this reply
    await supabase.from('ai_generated_content').insert({
      user_id: userId,
      content_type: 'reply',
      platform: target.platform,
      content: '', // Auto-poster fills after fetching target's latest post
      target_account: target.target_handle,
      generation_prompt: replyPrompt,
      generation_strategy: 'engagement',
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
    });

    await supabase.from('engagement_targets').update({
      interactions_count: (target.interactions_count || 0) + 1,
      last_interaction_at: new Date().toISOString(),
    }).eq('id', target.id);

    engaged++;
  }

  return { targetsEngaged: engaged };
}

// ── Target discovery ────────────────────────────────────────────────

/**
 * Add a new engagement target.
 */
export async function addEngagementTarget(
  userId: string,
  params: {
    platform: string;
    handle: string;
    type: EngagementTargetType;
    followerCount?: number;
    engagementRate?: number;
    strategy?: string;
  },
): Promise<EngagementTarget | null> {
  // Check for duplicate
  const { data: existing } = await supabase
    .from('engagement_targets')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', params.platform)
    .eq('target_handle', params.handle)
    .maybeSingle();

  if (existing) return null;

  const { data, error } = await supabase
    .from('engagement_targets')
    .insert({
      user_id: userId,
      platform: params.platform,
      target_handle: params.handle,
      target_type: params.type,
      follower_count: params.followerCount || null,
      engagement_rate: params.engagementRate || null,
      strategy: params.strategy || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[engagement] addTarget error:', error.message);
    return null;
  }

  return data as EngagementTarget;
}

/**
 * Batch-add engagement targets discovered by the auto-poster's browser automation.
 */
export async function bulkAddTargets(
  userId: string,
  targets: Array<{
    platform: string;
    handle: string;
    type: EngagementTargetType;
    followerCount?: number;
    strategy?: string;
  }>,
): Promise<number> {
  let added = 0;
  for (const t of targets) {
    const result = await addEngagementTarget(userId, t);
    if (result) added++;
  }
  return added;
}

/**
 * Get engagement targets for a platform, ordered by least recently interacted.
 */
export async function getTargetsForPlatform(
  userId: string,
  platform: string,
  limit: number = 10,
): Promise<EngagementTarget[]> {
  const { data } = await supabase
    .from('engagement_targets')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', platform)
    .order('last_interaction_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  return (data || []) as EngagementTarget[];
}

/**
 * Update target with follow-back or DM status.
 */
export async function updateTargetStatus(
  targetId: string,
  updates: {
    followed_back?: boolean;
    dm_opened?: boolean;
    collaboration_potential?: string;
  },
): Promise<void> {
  await supabase
    .from('engagement_targets')
    .update(updates)
    .eq('id', targetId);
}

/**
 * Remove targets that haven't engaged back after many interactions.
 */
export async function pruneUnresponsiveTargets(
  userId: string,
  minInteractions: number = 10,
): Promise<number> {
  const { data } = await supabase
    .from('engagement_targets')
    .select('id')
    .eq('user_id', userId)
    .eq('followed_back', false)
    .eq('dm_opened', false)
    .gte('interactions_count', minInteractions);

  if (!data || data.length === 0) return 0;

  const ids = data.map(t => t.id);
  await supabase
    .from('engagement_targets')
    .delete()
    .in('id', ids);

  return ids.length;
}
