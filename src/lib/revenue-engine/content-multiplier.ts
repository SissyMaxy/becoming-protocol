/**
 * Content Multiplication
 *
 * Every piece of content Maxy provides becomes 5-10+ posts across platforms.
 * One photo is not one post. The Handler extracts maximum value from minimum input.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
import { MAXY_VOICE_PROMPT, selectBestSubreddit } from './voice';
import type { ContentDerivative } from '../../types/revenue-engine';

// ── Caption generator ───────────────────────────────────────────────

async function generateCaption(
  client: Anthropic,
  _userId: string,
  item: Record<string, unknown>,
  derivative: ContentDerivative,
): Promise<string> {
  const prompt = `
Write a caption for a ${derivative.type} post on ${derivative.platform}.
Strategy: ${derivative.caption_strategy}

Content description: ${item.description || 'photo/video content'}
Content type: ${item.content_type || 'general'}
Tags: ${(item.content_tags as string[] || []).join(', ')}

${derivative.platform === 'fansly' || derivative.platform === 'onlyfans'
    ? 'This is for a paid platform — be intimate, personal, exclusive.'
    : 'This is for a free platform — be suggestive, drive to paid platforms.'}

${derivative.type === 'throwback' ? 'This is a throwback/repost. Frame it nostalgically.' : ''}
${derivative.type === 'clip_teaser' ? 'This is a teaser clip. Drive viewers to see the full version.' : ''}
${derivative.type === 'caption_post' ? 'Write a sissy/feminization caption to overlay on the image. 1-3 sentences, evocative.' : ''}

Write ONLY the caption text. 1-3 sentences max.
  `;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: MAXY_VOICE_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
}

// ── Multiplication engine ───────────────────────────────────────────

/**
 * When a new vault item is approved, generate all possible
 * derivative content from it.
 */
export async function multiplyContent(
  client: Anthropic,
  userId: string,
  vaultItemId: string,
): Promise<{ derivativesCreated: number }> {
  const { data: item } = await supabase
    .from('content_vault')
    .select('*')
    .eq('id', vaultItemId)
    .single();

  if (!item) return { derivativesCreated: 0 };

  const derivatives: ContentDerivative[] = [];
  const fileType = item.media_type || item.file_type;

  if (fileType === 'photo' || fileType === 'image') {
    // Original photo — full quality to paid platforms
    derivatives.push({
      platform: 'fansly', type: 'premium_post',
      caption_strategy: 'intimate, personal',
      delay_hours: 0,
    });
    derivatives.push({
      platform: 'onlyfans', type: 'premium_post',
      caption_strategy: 'intimate, personal',
      delay_hours: 2,
    });

    // Cropped/teaser version for free platforms
    derivatives.push({
      platform: 'twitter', type: 'teaser',
      caption_strategy: 'thirst, drive to paid',
      delay_hours: 48,
      crop: 'suggestive_crop',
    });
    derivatives.push({
      platform: 'reddit', type: 'teaser',
      caption_strategy: 'subreddit_appropriate_title',
      delay_hours: 72,
      subreddit: selectBestSubreddit(item.content_tags),
    });

    // Caption version — photo with text overlay
    derivatives.push({
      platform: 'twitter', type: 'caption_post',
      caption_strategy: 'sissy_caption_overlay',
      delay_hours: 96,
    });

    // Throwback re-post weeks later
    derivatives.push({
      platform: 'twitter', type: 'throwback',
      caption_strategy: 'remember_this_night',
      delay_hours: 24 * 14,
    });
  }

  if (fileType === 'video') {
    // Full video to paid platforms
    derivatives.push({
      platform: 'fansly', type: 'premium_post',
      caption_strategy: 'intimate, personal',
      delay_hours: 0,
    });
    derivatives.push({
      platform: 'onlyfans', type: 'premium_post',
      caption_strategy: 'intimate, personal',
      delay_hours: 2,
    });

    // Clip extraction — first 5 seconds as teaser
    derivatives.push({
      platform: 'twitter', type: 'clip_teaser',
      clip: { start: 0, end: 5 },
      caption_strategy: 'see_the_rest_on_fansly',
      delay_hours: 48,
    });

    // Audio extraction
    derivatives.push({
      platform: 'twitter', type: 'audio_clip',
      extract: 'audio_only',
      caption_strategy: 'close_your_eyes_and_listen',
      delay_hours: 72,
    });

    // GIF extraction — best 3-second loop
    derivatives.push({
      platform: 'twitter', type: 'gif_loop',
      caption_strategy: 'loop_tease',
      delay_hours: 120,
    });

    // Screenshot extraction — best frame as photo
    derivatives.push({
      platform: 'reddit', type: 'screenshot_post',
      caption_strategy: 'still_from_video',
      delay_hours: 96,
      subreddit: selectBestSubreddit(item.content_tags),
    });
  }

  // Generate captions and schedule all derivatives
  let created = 0;
  for (const d of derivatives) {
    const scheduledAt = new Date(Date.now() + d.delay_hours * 60 * 60 * 1000);

    const caption = await generateCaption(client, userId, item, d);
    if (!caption) continue;

    const { error } = await supabase.from('content_posts').insert({
      user_id: userId,
      vault_item_id: vaultItemId,
      platform: d.platform,
      caption,
      subreddit: d.subreddit || null,
      hashtags: [],
      scheduled_at: scheduledAt.toISOString(),
      post_status: 'scheduled',
      caption_variant: d.type,
    });

    if (!error) created++;
  }

  return { derivativesCreated: created };
}

/**
 * Get the multiplication factor for recent vault items.
 * Shows how many posts each piece of content generated.
 */
export async function getMultiplicationStats(
  userId: string,
  days: number = 30,
): Promise<{
  totalVaultItems: number;
  totalDerivatives: number;
  averageMultiplier: number;
}> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data: vaultItems } = await supabase
    .from('content_vault')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', since);

  if (!vaultItems || vaultItems.length === 0) {
    return { totalVaultItems: 0, totalDerivatives: 0, averageMultiplier: 0 };
  }

  const ids = vaultItems.map(v => v.id);
  const { count } = await supabase
    .from('content_posts')
    .select('id', { count: 'exact', head: true })
    .in('vault_item_id', ids);

  const totalDerivatives = count || 0;
  return {
    totalVaultItems: vaultItems.length,
    totalDerivatives,
    averageMultiplier: vaultItems.length > 0 ? totalDerivatives / vaultItems.length : 0,
  };
}
