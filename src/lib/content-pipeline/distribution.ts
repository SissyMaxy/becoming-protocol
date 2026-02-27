/**
 * Content Pipeline — Distribution
 *
 * Plan, execute, and track content distribution across platforms.
 * Platform posting is stubbed until API credentials are configured.
 */

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type { Distribution, Platform, PostStatus, PlatformMode } from '../../types/content-pipeline';
import { PLATFORM_MODES } from '../../types/content-pipeline';

// ── Plan distribution ───────────────────────────────────

export async function planDistribution(
  userId: string,
  vaultId: string
): Promise<Distribution[]> {
  // Get the vault item
  const { data: item } = await supabase
    .from('content_vault')
    .select('*')
    .eq('id', vaultId)
    .eq('user_id', userId)
    .single();

  if (!item) return [];

  // AI generates per-platform captions and optimal times
  const { data: aiResult } = await invokeWithAuth('handler-ai', {
    action: 'plan_distribution',
    content: {
      media_type: item.media_type,
      content_type: item.content_type,
      description: item.description || '',
      platform_suitability: item.platform_suitability || {},
      quality_rating: item.quality_rating,
    },
  });

  // Fallback if AI unavailable
  const plans = (aiResult && Array.isArray((aiResult as Record<string, unknown>).distributions))
    ? (aiResult as Record<string, unknown>).distributions as Array<{
        platform: Platform;
        caption: string;
        hashtags: string[];
        scheduled_at: string;
        strategy: string;
      }>
    : [{
        platform: 'twitter' as Platform,
        caption: item.description || '',
        hashtags: [] as string[],
        scheduled_at: new Date(Date.now() + 3600000).toISOString(),
        strategy: 'default',
      }];

  const rows: Distribution[] = [];

  for (const plan of plans) {
    const { data, error } = await supabase
      .from('content_distribution')
      .insert({
        user_id: userId,
        vault_id: vaultId,
        platform: plan.platform,
        caption: plan.caption,
        hashtags: plan.hashtags || [],
        scheduled_at: plan.scheduled_at,
        post_status: 'scheduled',
        handler_strategy: plan.strategy || null,
        narrative_arc_id: item.narrative_arc_id || null,
        auto_generated: true,
      })
      .select('*')
      .single();

    if (!error && data) {
      rows.push(data as Distribution);
    }
  }

  // Mark vault item as distributed
  if (rows.length > 0) {
    await supabase
      .from('content_vault')
      .update({
        approval_status: 'distributed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', vaultId)
      .eq('user_id', userId);
  }

  return rows;
}

// ── Execute distribution (API vs post-pack) ─────────────

export async function executeDistribution(distributionId: string): Promise<boolean> {
  const { data: dist } = await supabase
    .from('content_distribution')
    .select('*')
    .eq('id', distributionId)
    .single();

  if (!dist) return false;

  const mode: PlatformMode = PLATFORM_MODES[dist.platform as Platform] || 'post_pack';

  if (mode === 'api') {
    // API platforms (Twitter, Moltbook): auto-post via API
    // TODO: Wire real Twitter/Moltbook API calls here
    const { error } = await supabase
      .from('content_distribution')
      .update({
        post_status: 'posted' as PostStatus,
        posted_at: new Date().toISOString(),
        post_url: `https://${dist.platform}.com/stub/${distributionId}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', distributionId);

    return !error;
  }

  // Post-pack platforms (Reddit, Fansly): mark as ready for David to paste
  const { error } = await supabase
    .from('content_distribution')
    .update({
      post_status: 'ready_for_manual' as PostStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', distributionId);

  return !error;
}

// ── Mark post-pack as manually posted ───────────────────

export async function markManuallyPosted(distributionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('content_distribution')
    .update({
      post_status: 'posted' as PostStatus,
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', distributionId);

  return !error;
}

// ── Get pending post packs ──────────────────────────────

export async function getPendingPostPacks(userId: string): Promise<Distribution[]> {
  const { data, error } = await supabase
    .from('content_distribution')
    .select('*')
    .eq('user_id', userId)
    .eq('post_status', 'ready_for_manual')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[distribution] getPendingPostPacks error:', error);
    return [];
  }

  return (data || []) as Distribution[];
}

// ── Cancel distribution ─────────────────────────────────

export async function cancelDistribution(distributionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('content_distribution')
    .update({
      post_status: 'cancelled' as PostStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', distributionId);

  return !error;
}

// ── Refresh metrics (platform stub) ─────────────────────

export async function refreshDistributionMetrics(distributionId: string): Promise<boolean> {
  // TODO: Pull real metrics from platform APIs
  // For now, no-op
  console.log('[distribution] refreshDistributionMetrics stub called for:', distributionId);
  return true;
}

// ── Today's schedule ────────────────────────────────────

export async function getTodaySchedule(userId: string): Promise<Distribution[]> {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const { data, error } = await supabase
    .from('content_distribution')
    .select('*')
    .eq('user_id', userId)
    .gte('scheduled_at', startOfDay)
    .lt('scheduled_at', endOfDay)
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('[distribution] getTodaySchedule error:', error);
    return [];
  }

  return (data || []) as Distribution[];
}

// ── Batch mark posted ────────────────────────────────────

export async function batchMarkPosted(distributionIds: string[]): Promise<number> {
  let count = 0;
  for (const id of distributionIds) {
    const success = await markManuallyPosted(id);
    if (success) count++;
  }
  return count;
}

// ── Skip distribution ────────────────────────────────────

export async function skipDistribution(distributionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('content_distribution')
    .update({
      post_status: 'cancelled' as PostStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', distributionId);

  return !error;
}

// ── Get distributions grouped by day ─────────────────────

export async function getUpcomingDistributions(
  userId: string,
  days: number = 7
): Promise<Distribution[]> {
  const now = new Date();
  const endDate = new Date(now.getTime() + days * 86400000);

  const { data, error } = await supabase
    .from('content_distribution')
    .select('*')
    .eq('user_id', userId)
    .in('post_status', ['scheduled', 'ready_for_manual', 'draft'])
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', endDate.toISOString())
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('[distribution] getUpcomingDistributions error:', error);
    return [];
  }
  return (data || []) as Distribution[];
}

// ── Distribution history ────────────────────────────────

export async function getDistributionHistory(
  userId: string,
  start: string,
  end: string
): Promise<Distribution[]> {
  const { data, error } = await supabase
    .from('content_distribution')
    .select('*')
    .eq('user_id', userId)
    .gte('scheduled_at', start)
    .lte('scheduled_at', end)
    .order('scheduled_at', { ascending: false });

  if (error) {
    console.error('[distribution] getDistributionHistory error:', error);
    return [];
  }

  return (data || []) as Distribution[];
}
