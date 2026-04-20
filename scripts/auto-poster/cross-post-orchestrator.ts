// Cross-Post Orchestrator
//
// When a content_brief hits ready_to_post, this generates platform-specific
// captions from the single submission and queues each as a separate
// ai_generated_content row. One photo → different caption/crop for Twitter,
// Fansly, Reddit, FetLife.
//
// Each platform gets voice-appropriate text: Twitter is short/punchy,
// Fansly is personal/warm (subs are paying), Reddit needs a title+body,
// FetLife gets kink-literate prose.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { buildMaxyVoiceSystem, type VoiceFlavor } from './voice-system';
import { extractSafeText } from './refusal-filter';
import { rotateAllPlatforms } from './link-rotator';

interface ReadyBrief {
  id: string;
  brief_type: string;
  feminization_directives: Record<string, any>;
  caption_angle: string | null;
  target_platforms: string[];
  narrative_beat: string | null;
}

interface Submission {
  asset_url: string | null;
  asset_text: string | null;
}

const PLATFORM_CONFIGS: Record<string, { flavor: VoiceFlavor; maxTokens: number; instruction: string }> = {
  twitter: {
    flavor: 'reply',
    maxTokens: 120,
    instruction: '1-2 sentences. Under 280 chars. Lowercase, casual. One emoji max. No hashtags.',
  },
  fansly: {
    flavor: 'subscriber',
    maxTokens: 200,
    instruction: '1-3 sentences. Personal, warm — subs pay to feel close. No hashtags, no "link in bio."',
  },
  fetlife: {
    flavor: 'fetlife',
    maxTokens: 400,
    instruction: '3-6 sentences. First-person kink-literate narrative. This is a personal post, not a promo.',
  },
};

function getRedditFlavor(sub: string): VoiceFlavor {
  const kinkSubs = ['sissification', 'feminization', 'Sissy', 'sissychastity', 'chastity'];
  return kinkSubs.includes(sub) ? 'reddit_kink' : 'reddit_sfw';
}

async function generatePlatformCaption(
  client: Anthropic,
  sb: SupabaseClient,
  userId: string,
  brief: ReadyBrief,
  platform: string,
): Promise<string | null> {
  const isReddit = platform.startsWith('reddit:');
  const subreddit = isReddit ? platform.replace('reddit:', '') : '';
  const config = isReddit
    ? { flavor: getRedditFlavor(subreddit), maxTokens: 300, instruction: `Reddit post for r/${subreddit}. Format: TITLE: ...\nBODY: ... (1-4 sentences, lowercase, real)` }
    : PLATFORM_CONFIGS[platform];

  if (!config) return null;

  const voice = await buildMaxyVoiceSystem(sb, userId, config.flavor);
  const d = brief.feminization_directives || {};

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: config.maxTokens,
    system: `${voice}\n\nYou are writing a caption for ${isReddit ? `r/${subreddit}` : platform}.\n${config.instruction}\n\nContext:\n- Asset: ${[d.outfit, d.pose, d.framing].filter(Boolean).join('; ')}\n- Angle: ${brief.caption_angle || 'natural'}\n${brief.narrative_beat ? `- Theme: ${brief.narrative_beat}` : ''}\n\nOutput ONLY the caption text.`,
    messages: [{ role: 'user', content: 'Write the caption.' }],
  });

  const text = extractSafeText(response, 5, `cross-post ${platform}`);
  if (!text) return null;

  // Link rotation (skips fansly/sniffies/DM contexts)
  return rotateAllPlatforms(text, platform, { rate: 0.25 });
}

/**
 * Takes a ready_to_post brief, generates platform-specific captions for each
 * target, and queues them as ai_generated_content rows for the poster to pick up.
 */
export async function orchestrateCrossPost(
  sb: SupabaseClient,
  client: Anthropic,
  userId: string,
  brief: ReadyBrief,
  submission: Submission,
): Promise<{ queued: number; platforms: string[] }> {
  let queued = 0;
  const posted: string[] = [];

  for (const platform of brief.target_platforms) {
    const caption = await generatePlatformCaption(client, sb, userId, brief, platform);
    if (!caption) continue;

    const isReddit = platform.startsWith('reddit:');
    const cleanPlatform = isReddit ? 'reddit' : platform;

    await sb.from('ai_generated_content').insert({
      user_id: userId,
      content_type: isReddit ? 'reddit_post' : `${cleanPlatform}_post`,
      platform: cleanPlatform,
      content: caption,
      generation_strategy: 'cross_post_brief',
      target_subreddit: isReddit ? platform.replace('reddit:', '') : undefined,
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
    });

    queued++;
    posted.push(platform);
  }

  // Mark brief as posted
  if (queued > 0) {
    await sb.from('content_production_briefs')
      .update({
        status: 'posted',
        published_at: new Date().toISOString(),
        performance: { queued_platforms: posted },
      })
      .eq('id', brief.id);
  }

  return { queued, platforms: posted };
}

/**
 * Find and process all ready_to_post production briefs.
 */
export async function processReadyBriefs(
  sb: SupabaseClient,
  client: Anthropic,
  userId: string,
): Promise<number> {
  const { data: briefs } = await sb
    .from('content_production_briefs')
    .select('id, brief_type, feminization_directives, caption_angle, target_platforms, narrative_beat')
    .eq('user_id', userId)
    .eq('status', 'ready_to_post')
    .lte('scheduled_publish_at', new Date().toISOString())
    .order('scheduled_publish_at', { ascending: true })
    .limit(5);

  if (!briefs || briefs.length === 0) return 0;

  let total = 0;
  for (const brief of briefs) {
    const { data: sub } = await sb.from('content_submissions')
      .select('asset_url, asset_text')
      .eq('brief_id', brief.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = await orchestrateCrossPost(sb, client, userId, brief as ReadyBrief, sub || { asset_url: null, asset_text: null });
    total += result.queued;
    if (result.queued > 0) {
      console.log(`  [cross-post] ${brief.id.slice(0, 8)} → ${result.platforms.join(', ')} (${result.queued} queued)`);
    }
  }
  return total;
}
