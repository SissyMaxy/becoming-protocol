// ============================================
// Content Poster
// Handler-initiated posting from vault
// No approval dashboard — Handler posts directly
// ============================================

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type { VaultItem, DbVaultItem, VaultTier } from '../../types/vault';
import { mapDbToVaultItem } from '../../types/vault';
import { generateCaption } from './caption-generator';
import type { ContentBeat, CaptionContext } from '../../types/narrative';

// ============================================
// Content Selection
// ============================================

/**
 * Select vault content appropriate for the given tier and vulnerability ceiling.
 * Used by consequence engine to auto-post escalating content.
 */
export async function selectContentForPosting(
  userId: string,
  options: {
    vaultTier: VaultTier;
    maxVulnerability: number;
    excludeIds?: string[];
    preferUnused?: boolean;
  }
): Promise<VaultItem | null> {
  let query = supabase
    .from('content_vault')
    .select('*')
    .eq('user_id', userId)
    .eq('vault_tier', options.vaultTier)
    .lte('vulnerability_score', options.maxVulnerability);

  if (options.excludeIds && options.excludeIds.length > 0) {
    query = query.not('id', 'in', `(${options.excludeIds.join(',')})`);
  }

  if (options.preferUnused) {
    // Prefer content that hasn't been posted yet
    query = query.order('times_used', { ascending: true });
  }

  query = query.order('created_at', { ascending: false }).limit(1);

  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;

  return mapDbToVaultItem(data[0] as DbVaultItem);
}

/**
 * Select content for a scheduled post (not consequence — narrative-driven).
 */
export async function selectContentForScheduledPost(
  userId: string,
  beat?: ContentBeat
): Promise<VaultItem | null> {
  if (beat?.vaultContentId) {
    // Beat already has captured content
    const { data } = await supabase
      .from('content_vault')
      .select('*')
      .eq('id', beat.vaultContentId)
      .single();

    if (data) return mapDbToVaultItem(data as DbVaultItem);
  }

  // Pick next unposted public_ready content
  return selectContentForPosting(userId, {
    vaultTier: 'public_ready',
    maxVulnerability: 5,
    preferUnused: true,
  });
}

// ============================================
// Posting Pipeline
// ============================================

export interface PostResult {
  success: boolean;
  vaultItemId: string;
  platform: string;
  caption: string;
  postUrl?: string;
  error?: string;
}

/**
 * Post content to a platform. Handler-initiated — no approval step.
 * Updates vault usage tracking.
 */
export async function postContent(
  userId: string,
  vaultItem: VaultItem,
  platform: string,
  options?: {
    beat?: ContentBeat;
    captionOverride?: string;
    isConsequence?: boolean;
    consequenceTier?: number;
  }
): Promise<PostResult> {
  try {
    // Generate caption
    const caption = options?.captionOverride || await generateCaption({
      vaultItemId: vaultItem.id,
      mediaType: vaultItem.mediaType,
      description: vaultItem.description,
      domain: vaultItem.captureContext?.split(' ')[0],
      vulnerabilityScore: vaultItem.vulnerabilityScore,
      beat: options?.beat,
      denialDay: 0, // Would come from user state
      streakDays: 0,
      platform,
    } as CaptionContext);

    // Call platform posting via edge function
    const { data, error } = await invokeWithAuth('handler-platform', {
      action: 'post_content',
      user_id: userId,
      platform,
      content: {
        media_url: vaultItem.mediaUrl,
        media_type: vaultItem.mediaType,
        caption,
        is_consequence: options?.isConsequence || false,
        consequence_tier: options?.consequenceTier,
      },
    });

    if (error) throw error;

    const result = data as Record<string, unknown> | null;

    // Update vault item usage
    const newUsedAs = [...(vaultItem.usedAs || [])];
    if (options?.isConsequence && !newUsedAs.includes('consequence')) {
      newUsedAs.push('consequence');
    }
    if (!options?.isConsequence && !newUsedAs.includes('public_post')) {
      newUsedAs.push('public_post');
    }

    await supabase
      .from('content_vault')
      .update({
        times_used: (vaultItem.timesUsed || 0) + 1,
        last_used_at: new Date().toISOString(),
        used_as: newUsedAs,
      })
      .eq('id', vaultItem.id);

    return {
      success: true,
      vaultItemId: vaultItem.id,
      platform,
      caption,
      postUrl: result?.post_url as string | undefined,
    };
  } catch (err) {
    return {
      success: false,
      vaultItemId: vaultItem.id,
      platform,
      caption: '',
      error: err instanceof Error ? err.message : 'Failed to post content',
    };
  }
}

/**
 * Post vault content as a consequence action.
 * Selects appropriate content for the tier and posts it.
 */
export async function postConsequenceContent(
  userId: string,
  vaultTier: VaultTier,
  maxVulnerability: number,
  consequenceTier: number,
  platform: string = 'onlyfans'
): Promise<PostResult | null> {
  // Select content to post
  const content = await selectContentForPosting(userId, {
    vaultTier,
    maxVulnerability,
    preferUnused: true,
  });

  if (!content) {
    console.warn(`[content-poster] No ${vaultTier} content available for consequence posting`);
    return null;
  }

  // Post it
  return postContent(userId, content, platform, {
    isConsequence: true,
    consequenceTier,
    captionOverride: getConsequenceCaption(consequenceTier, content),
  });
}

/**
 * Generate a consequence-specific caption.
 */
function getConsequenceCaption(tier: number, _content: VaultItem): string {
  if (tier <= 5) {
    return "Progress update. The journey continues whether I'm here or not.";
  }
  if (tier <= 7) {
    return "She's still here. Still becoming. Even when it's hard.";
  }
  return "Maxy exists. This is evidence.";
}

// ============================================
// Scheduled Posting Queue
// ============================================

/**
 * Get content queued for posting (Handler has classified as ready).
 */
export async function getPostingQueue(userId: string): Promise<VaultItem[]> {
  const { data, error } = await supabase
    .from('content_vault')
    .select('*')
    .eq('user_id', userId)
    .eq('vault_tier', 'public_ready')
    .eq('times_used', 0)
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) return [];
  return (data || []).map(d => mapDbToVaultItem(d as DbVaultItem));
}

/**
 * Check if content queue is frozen (tier 4+ consequence).
 */
export async function isQueueFrozen(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('consequence_state')
    .select('current_tier')
    .eq('user_id', userId)
    .single();

  return (data?.current_tier || 0) >= 4;
}
