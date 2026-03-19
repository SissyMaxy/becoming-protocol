/**
 * Content Distribution Pipeline
 *
 * Vault ingestion → approval → copy generation → scheduling → posting.
 * Eliminates all friction between capture and publication.
 */

import { supabase } from '../supabase';
import { HandlerParameters } from '../handler-parameters';
import { invokeWithAuth } from '../handler-ai';

// ============================================
// VAULT INGESTION
// ============================================

export interface VaultItem {
  id: string;
  fileUrl: string;
  fileType: 'photo' | 'video' | 'audio' | 'clip';
  source: string;
  explicitnessLevel: number;
  approvalStatus: string;
  contentTags: string[];
}

/**
 * Ingest content into the vault.
 * Auto-approves if explicitness is within standing permission threshold.
 */
export async function ingestToVault(
  userId: string,
  fileUrl: string,
  fileType: 'photo' | 'video' | 'audio' | 'clip',
  source: string,
  options: {
    explicitnessLevel?: number;
    contentTags?: string[];
    sourceSessionId?: string;
    durationSeconds?: number;
  } = {},
): Promise<string | null> {
  const explicitness = options.explicitnessLevel || 1;

  // Check standing permission for auto-approval
  const { data: permission } = await supabase
    .from('handler_standing_permissions')
    .select('parameters')
    .eq('user_id', userId)
    .eq('permission_domain', 'content_auto_approve')
    .eq('granted', true)
    .maybeSingle();

  const autoApproveThreshold = (permission?.parameters as Record<string, unknown>)?.max_explicitness as number || 0;
  const approvalStatus = explicitness <= autoApproveThreshold ? 'auto_approved' : 'pending';

  const { data, error } = await supabase.from('content_vault').insert({
    user_id: userId,
    file_url: fileUrl,
    file_type: fileType,
    source,
    explicitness_level: explicitness,
    content_tags: options.contentTags || [],
    approval_status: approvalStatus,
    approved_at: approvalStatus !== 'pending' ? new Date().toISOString() : null,
    source_session_id: options.sourceSessionId || null,
    duration_seconds: options.durationSeconds || null,
  }).select('id').maybeSingle();

  if (error) {
    console.error('[Vault] Ingestion failed:', error.message);
    return null;
  }

  // If auto-approved, trigger distribution scheduling
  if (approvalStatus === 'auto_approved' && data?.id) {
    scheduleDistribution(userId, data.id).catch(() => {});
  }

  return data?.id || null;
}

/**
 * Approve a pending vault item.
 */
export async function approveVaultItem(itemId: string): Promise<void> {
  const { data } = await supabase.from('content_vault').update({
    approval_status: 'approved',
    approved_at: new Date().toISOString(),
  }).eq('id', itemId).select('user_id').maybeSingle();

  if (data?.user_id) {
    scheduleDistribution(data.user_id, itemId).catch(() => {});
  }
}

// ============================================
// COPY GENERATION
// ============================================

/**
 * Generate platform-specific captions for a vault item.
 */
export async function generateCopy(
  userId: string,
  vaultItemId: string,
  platform: string,
): Promise<string> {
  const { data: item } = await supabase
    .from('content_vault')
    .select('file_type, content_tags, explicitness_level')
    .eq('id', vaultItemId)
    .maybeSingle();

  if (!item) return '';

  // Get recent top-performing captions for this platform
  const { data: topPosts } = await supabase
    .from('content_posts')
    .select('caption, likes, comments')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('post_status', 'posted')
    .order('likes', { ascending: false })
    .limit(3);

  const topCaptions = (topPosts || []).map(p => p.caption).filter(Boolean);

  const platformRules: Record<string, string> = {
    twitter: 'Max 280 chars. Teasing, drives to link. No explicit language.',
    reddit: 'Subreddit-appropriate title. Not spammy. Engaging question or statement.',
    fansly: 'Longer, personal, builds connection. Can be explicit. First person.',
    onlyfans: 'Intimate, personal. Reward subscribers. Can reference DMs.',
  };

  const prompt = `Write a ${platform} caption for ${item.file_type} content.
Tags: ${(item.content_tags || []).join(', ')}
Explicitness: ${item.explicitness_level}/5
${platformRules[platform] || 'Write engaging copy.'}
${topCaptions.length > 0 ? `\nTop performing captions on ${platform}:\n${topCaptions.join('\n')}` : ''}
Output ONLY the caption text.`;

  const { data, error } = await invokeWithAuth('handler-ai', {
    action: 'generate',
    userPrompt: prompt,
    maxTokens: 150,
  });

  if (error || !data) return '';
  return typeof data === 'string' ? data : (data as Record<string, unknown>)?.response as string || '';
}

// ============================================
// SCHEDULING
// ============================================

/**
 * Schedule distribution of an approved vault item across platforms.
 */
export async function scheduleDistribution(
  userId: string,
  vaultItemId: string,
): Promise<number> {
  const params = new HandlerParameters(userId);
  const exclusivityHours = await params.get<number>('distribution.exclusivity_window_hours', 48);
  const maxDaily = await params.get<number>('distribution.max_auto_posts_per_day', 4);

  // Check daily post count
  const today = new Date().toISOString().split('T')[0];
  const { count: todayCount } = await supabase
    .from('content_posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('scheduled_at', `${today}T00:00:00`)
    .lt('scheduled_at', `${today}T23:59:59`);

  if ((todayCount || 0) >= maxDaily) return 0;

  const platforms = ['onlyfans', 'twitter', 'reddit'];
  let scheduled = 0;
  const now = new Date();

  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];
    // OF gets content first, others wait exclusivity window
    const delay = i === 0 ? 0 : exclusivityHours * 60 * 60 * 1000;
    const scheduledAt = new Date(now.getTime() + delay + (i * 2 * 60 * 60 * 1000)); // Stagger by 2h

    const caption = await generateCopy(userId, vaultItemId, platform);
    if (!caption) continue;

    const { error } = await supabase.from('content_posts').insert({
      user_id: userId,
      vault_item_id: vaultItemId,
      platform,
      caption,
      hashtags: [],
      scheduled_at: scheduledAt.toISOString(),
      post_status: 'scheduled',
    });

    if (!error) scheduled++;
  }

  if (scheduled > 0) {
    await supabase.from('content_vault').update({
      distribution_status: 'scheduled',
    }).eq('id', vaultItemId);
  }

  return scheduled;
}

// ============================================
// FAN INTERACTIONS
// ============================================

/**
 * Ingest a fan interaction (comment, DM, tip).
 * Classifies sentiment and auto-responds if appropriate.
 */
export async function ingestFanInteraction(
  userId: string,
  platform: string,
  interactionType: string,
  fanId: string,
  fanName: string,
  content: string,
): Promise<void> {
  // Simple sentiment classification
  const lower = content.toLowerCase();
  const toxicWords = /hate|ugly|fake|disgusting|kill|die|trash/;
  const positiveWords = /love|amazing|beautiful|gorgeous|hot|incredible|perfect|stunning/;

  let sentiment: 'positive' | 'neutral' | 'negative' | 'toxic' = 'neutral';
  if (toxicWords.test(lower)) sentiment = 'toxic';
  else if (positiveWords.test(lower)) sentiment = 'positive';

  const responseStatus = sentiment === 'toxic' ? 'ignored' : sentiment === 'positive' ? 'pending' : 'pending';
  const briefingWorthy = sentiment === 'positive' && content.length > 20;

  await supabase.from('fan_interactions').insert({
    user_id: userId,
    platform,
    interaction_type: interactionType,
    fan_identifier: fanId,
    fan_display_name: fanName,
    content,
    sentiment,
    response_status: responseStatus,
    briefing_worthy: briefingWorthy,
    conditioning_aligned: false,
  });
}

/**
 * Generate auto-response for a fan interaction.
 */
export async function generateFanResponse(
  _userId: string,
  interactionId: string,
): Promise<string | null> {
  const { data: interaction } = await supabase
    .from('fan_interactions')
    .select('*')
    .eq('id', interactionId)
    .maybeSingle();

  if (!interaction || interaction.sentiment === 'toxic') return null;

  const prompt = `Write a brief, warm response as Maxy to this fan message:
"${interaction.content}"
Platform: ${interaction.platform}
Keep it personal, appreciative, 1-2 sentences. In character.`;

  const { data, error } = await invokeWithAuth('handler-ai', {
    action: 'generate',
    userPrompt: prompt,
    maxTokens: 100,
  });

  if (error || !data) return null;
  const response = typeof data === 'string' ? data : (data as Record<string, unknown>)?.response as string || '';

  if (response) {
    await supabase.from('fan_interactions').update({
      response_text: response,
      response_status: 'draft_ready',
    }).eq('id', interactionId);
  }

  return response;
}

// ============================================
// ENGAGEMENT MONITORING
// ============================================

/**
 * Get pending vault items awaiting approval.
 */
export async function getPendingVaultItems(userId: string): Promise<VaultItem[]> {
  const { data } = await supabase
    .from('content_vault')
    .select('*')
    .eq('user_id', userId)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false });

  return (data || []).map(d => ({
    id: d.id,
    fileUrl: d.file_url,
    fileType: d.file_type,
    source: d.source,
    explicitnessLevel: d.explicitness_level,
    approvalStatus: d.approval_status,
    contentTags: d.content_tags || [],
  }));
}

/**
 * Get scheduled posts.
 */
export async function getScheduledPosts(userId: string): Promise<Array<{
  id: string;
  platform: string;
  caption: string;
  scheduledAt: string;
  status: string;
}>> {
  const { data } = await supabase
    .from('content_posts')
    .select('id, platform, caption, scheduled_at, post_status')
    .eq('user_id', userId)
    .eq('post_status', 'scheduled')
    .order('scheduled_at', { ascending: true })
    .limit(20);

  return (data || []).map(d => ({
    id: d.id,
    platform: d.platform,
    caption: d.caption,
    scheduledAt: d.scheduled_at,
    status: d.post_status,
  }));
}
