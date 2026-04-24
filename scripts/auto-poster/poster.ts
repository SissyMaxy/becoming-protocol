/**
 * Poster — reads scheduled posts from Supabase and dispatches to platforms.
 * Called by the scheduler or manually via: npm run post
 *
 * All posts (vault-based + Handler-generated) live in ai_generated_content.
 * Vault-based posts are identified by a non-null vault_item_id.
 */

import { supabase } from './config';
import { buildMaxyVoiceSystem } from './voice-system';
import { rotateAllPlatforms } from './link-rotator';
import { postToTwitter } from './platforms/twitter';
import { postToReddit } from './platforms/reddit';
import { postToFansly } from './platforms/fansly';
import { postToOnlyFans } from './platforms/onlyfans';
import { postToChaturbate } from './platforms/chaturbate';
import { postToFetLife } from './platforms/fetlife';
import { postToSniffies } from './platforms/sniffies';
import { fullSlopCheck, type FullSlopResult } from './slop-detector';
import { extractSafeText } from './refusal-filter';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';

const MAX_QUALITY_RETRIES = 3;

interface ScheduledPost {
  id: string;
  user_id: string;
  vault_item_id: string | null;
  platform: string;
  content: string;
  target_hashtags: string[] | null;
  target_subreddit: string | null;
  scheduled_at: string;
}

/**
 * Process all due posts. Only processes posts with a vault_item_id —
 * pure-text posts (no media) are handled by scheduler.ts which writes them
 * in the ready-to-send state. This function dispatches vault-media posts.
 */
export async function processDuePosts(): Promise<number> {
  const now = new Date().toISOString();

  const { data: posts, error } = await supabase
    .from('ai_generated_content')
    .select('id, user_id, vault_item_id, platform, content, target_hashtags, target_subreddit, scheduled_at')
    .eq('status', 'scheduled')
    .not('vault_item_id', 'is', null)
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (error) {
    console.error('[Poster] Failed to fetch posts:', error.message);
    return 0;
  }

  if (!posts || posts.length === 0) {
    return 0;
  }

  console.log(`[Poster] ${posts.length} post(s) due`);
  let processed = 0;

  for (const post of posts as ScheduledPost[]) {
    console.log(`[Poster] Processing: ${post.platform} — "${post.content.substring(0, 50)}..."`);

    // Mark as posting (prevent double-processing)
    await supabase.from('ai_generated_content').update({ status: 'posting' }).eq('id', post.id);

    // Download media if vault item exists
    let localMediaPath: string | undefined;
    if (post.vault_item_id) {
      localMediaPath = await downloadMedia(post.vault_item_id);
    }

    // Build full caption with hashtags
    const hashtags = post.target_hashtags || [];
    const fullCaption = hashtags.length > 0
      ? `${post.content}\n\n${hashtags.map(h => `#${h}`).join(' ')}`
      : post.content;

    // Dispatch to platform
    let result: { success: boolean; postUrl?: string; error?: string };

    switch (post.platform) {
      case 'twitter':
        result = await postToTwitter(fullCaption, localMediaPath);
        break;
      case 'reddit':
        result = await postToReddit(fullCaption, post.target_subreddit || undefined, localMediaPath);
        break;
      case 'fansly':
        result = await postToFansly(fullCaption, localMediaPath);
        break;
      case 'onlyfans':
        result = await postToOnlyFans(fullCaption, localMediaPath);
        break;
      case 'chaturbate':
        result = await postToChaturbate(fullCaption, localMediaPath);
        break;
      case 'fetlife':
        result = await postToFetLife(fullCaption, localMediaPath);
        break;
      case 'sniffies':
        result = await postToSniffies(fullCaption, localMediaPath);
        break;
      default:
        result = { success: false, error: `Unknown platform: ${post.platform}` };
    }

    // Update post status
    if (result.success) {
      await supabase.from('ai_generated_content').update({
        status: 'posted',
        posted_at: new Date().toISOString(),
        platform_url: result.postUrl || null,
      }).eq('id', post.id);
      console.log(`  ✓ Posted to ${post.platform}${result.postUrl ? ` — ${result.postUrl}` : ''}`);
      processed++;
    } else {
      await supabase.from('ai_generated_content').update({
        status: 'failed',
        failure_reason: (result.error || 'unknown').slice(0, 500),
      }).eq('id', post.id);
      console.error(`  ✗ Failed: ${result.error}`);
    }

    // Clean up downloaded media
    if (localMediaPath && fs.existsSync(localMediaPath)) {
      fs.unlinkSync(localMediaPath);
    }

    // Pause between posts to avoid rate limits
    await new Promise(r => setTimeout(r, 5000));
  }

  return processed;
}

/**
 * Download media from vault item's file_url to a temp file.
 */
async function downloadMedia(vaultItemId: string): Promise<string | undefined> {
  const { data: item } = await supabase
    .from('content_vault')
    .select('file_url, file_type')
    .eq('id', vaultItemId)
    .maybeSingle();

  if (!item?.file_url) return undefined;

  const ext = item.file_type === 'video' ? '.mp4' : item.file_type === 'audio' ? '.mp3' : '.jpg';
  const tempPath = path.join(__dirname, '.temp-media' + ext);

  try {
    await downloadFile(item.file_url, tempPath);
    return tempPath;
  } catch (err) {
    console.error('[Poster] Media download failed:', err);
    return undefined;
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// ── Quality gate — slop check + regeneration ────────────────────────

const MAXY_VOICE_POST = `You are Maxy (@softmaxy) — a 40-year-old trans woman on HRT. Into chastity, denial, feminization. Sharp, dry, funny, messy, real. A little dominant, a little chaotic. Lowercase, casual. One emoji max per post, often none. Never sounds like a brand. Never hashtags.

You write tweets that sound like a real person thinking out loud — not performing, not seeking engagement, not being inspirational. Some posts are horny, some are tender, some are mundane. All of them sound like one specific human being, not a content machine.

BANNED: "hits different", "the way...", "energy" as descriptor, "ngl", "honestly" as opener, "chef's kiss", "i respect it/that", "confidence" as compliment. Also banned: hashtags, engagement bait questions, motivational poster tone, forced vulnerability.`;

/**
 * Load recent posted content for repetition checking.
 */
async function getRecentPostTexts(platform: string, limit: number = 20): Promise<string[]> {
  const { data } = await supabase
    .from('ai_generated_content')
    .select('content')
    .eq('status', 'posted')
    .eq('platform', platform)
    .not('content_type', 'eq', 'reply')
    .order('posted_at', { ascending: false })
    .limit(limit);

  return (data || []).map(r => r.content).filter(Boolean);
}

/**
 * Quality gate: run content through slop detection, regenerate if needed.
 * Returns the final approved text, or null if all attempts fail.
 */
async function qualityGate(
  anthropic: Anthropic,
  originalText: string,
  contentType: string,
  platform: string,
  recentPosts: string[],
  userId?: string,
): Promise<{ text: string; wasRegenerated: boolean } | null> {
  let currentText = originalText;
  const maxyVoice = userId ? await buildMaxyVoiceSystem(supabase, userId, 'post') : MAXY_VOICE_POST;

  for (let attempt = 0; attempt <= MAX_QUALITY_RETRIES; attempt++) {
    // The slop check's LLM judge needs an "original" to compare against.
    // For original posts (not replies), use the content type as context.
    const context = `[${platform} ${contentType} post by Maxy]`;
    const result = await fullSlopCheck(anthropic, context, currentText, recentPosts);

    if (result.pass) {
      if (attempt > 0) {
        console.log(`  ✓ Quality gate passed on attempt ${attempt + 1} (score: ${result.llmScore}/10)`);
      } else {
        console.log(`  ✓ Quality gate passed (score: ${result.llmScore}/10)`);
      }
      return { text: currentText, wasRegenerated: attempt > 0 };
    }

    // Log failure
    const allReasons = [...result.patternReasons, ...result.repetitionReasons];
    console.log(`  ✗ Quality gate FAILED (attempt ${attempt + 1}/${MAX_QUALITY_RETRIES + 1}): ${allReasons.join(', ')} | LLM: ${result.llmScore}/10 — ${result.llmReason}`);

    if (attempt >= MAX_QUALITY_RETRIES) break;

    // Regenerate with feedback
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 280,
        system: maxyVoice,
        messages: [{
          role: 'user',
          content: `Write a ${contentType} ${platform} post as Maxy.\n\n⚠️ Your previous version was rejected: "${currentText}"\n\nIssues: ${result.retryFeedback}\n\nWrite something COMPLETELY different — different words, different angle, different structure. Output ONLY the post text.`,
        }],
      });

      const newText = extractSafeText(response, 5, `Quality regen ${platform}/${contentType}`);
      if (!newText) {
        console.log(`  ⊘ Regeneration produced empty/refused content`);
        break;
      }
      currentText = newText;
      // Add failed text to recent so next attempt avoids it too
      recentPosts = [originalText, ...recentPosts];
    } catch (err) {
      console.error(`  Regeneration failed:`, err instanceof Error ? err.message : err);
      break;
    }
  }

  console.log(`  ⊘ All ${MAX_QUALITY_RETRIES + 1} attempts failed quality gate — skipping post`);
  return null;
}

// ── AI-generated content processing ─────────────────────────────────

interface AIScheduledPost {
  id: string;
  user_id: string;
  platform: string;
  content: string;
  content_type: string;
  target_subreddit: string | null;
  target_account: string | null;
  target_hashtags: string[];
  scheduled_at: string;
}

/**
 * Process due AI-generated content (from the revenue engine).
 * Every post runs through the quality gate before dispatch.
 * If the gate rejects it, we regenerate up to 3x. If all fail, skip it.
 */
export async function processDueAIContent(): Promise<number> {
  const now = new Date().toISOString();

  const { data: posts, error } = await supabase
    .from('ai_generated_content')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (error) {
    console.error('[Poster/AI] Failed to fetch AI content:', error.message);
    return 0;
  }

  if (!posts || posts.length === 0) return 0;

  console.log(`[Poster/AI] ${posts.length} AI post(s) due`);
  const anthropic = new Anthropic();
  let processed = 0;

  // Pre-load recent posts per platform for repetition checks
  const recentByPlatform: Record<string, string[]> = {};

  for (const post of posts as AIScheduledPost[]) {
    // Skip empty content (engagement replies that need target's post fetched first)
    if (!post.content || post.content.trim() === '') {
      console.log(`  ⊘ Skipping empty content for ${post.platform}/${post.content_type}`);
      continue;
    }

    console.log(`[Poster/AI] Processing: ${post.platform} — "${post.content.substring(0, 50)}..."`);

    // Mark as posting
    await supabase.from('ai_generated_content').update({ status: 'posting' as never }).eq('id', post.id);

    // Load recent posts for this platform (cache across the batch)
    if (!recentByPlatform[post.platform]) {
      recentByPlatform[post.platform] = await getRecentPostTexts(post.platform);
    }

    // ── Quality gate ──
    const gateResult = await qualityGate(
      anthropic,
      post.content,
      post.content_type,
      post.platform,
      recentByPlatform[post.platform],
      (post as any).user_id || process.env.USER_ID,
    );

    if (!gateResult) {
      // All attempts failed — mark as failed, don't post slop
      await supabase.from('ai_generated_content').update({
        status: 'failed',
      }).eq('id', post.id);
      console.log(`  ⊘ Quality gate rejected — not posting`);
      continue;
    }

    const approvedText = gateResult.text;

    // If content was regenerated, update the DB record
    if (gateResult.wasRegenerated) {
      await supabase.from('ai_generated_content').update({
        content: approvedText,
      }).eq('id', post.id);
    }

    // Build caption with hashtags if present
    const fullCaption = post.target_hashtags?.length > 0
      ? `${approvedText}\n\n${post.target_hashtags.map(h => `#${h}`).join(' ')}`
      : approvedText;

    // Inject Fansly cross-promo link at 20% rate (skips fansly/onlyfans/DMs)
    const captionWithLink = rotateAllPlatforms(fullCaption, post.platform, { rate: 0.2 });

    // Dispatch to platform (text-only, no media)
    let result: { success: boolean; postUrl?: string; error?: string };

    switch (post.platform) {
      case 'twitter':
        result = await postToTwitter(captionWithLink);
        break;
      case 'reddit':
        result = await postToReddit(captionWithLink, post.target_subreddit || undefined);
        break;
      case 'fansly':
        result = await postToFansly(fullCaption);  // no link rotation on own platform
        break;
      case 'onlyfans':
        result = await postToOnlyFans(fullCaption);
        break;
      case 'fetlife':
        result = await postToFetLife(captionWithLink);
        break;
      default:
        result = { success: false, error: `Unsupported platform for AI content: ${post.platform}` };
    }

    if (result.success) {
      await supabase.from('ai_generated_content').update({
        status: 'posted',
        posted_at: new Date().toISOString(),
      }).eq('id', post.id);
      console.log(`  ✓ AI posted to ${post.platform}${result.postUrl ? ` — ${result.postUrl}` : ''}`);
      processed++;
      // Feed into repetition cache for remaining posts in this batch
      recentByPlatform[post.platform].unshift(approvedText);
    } else {
      await supabase.from('ai_generated_content').update({
        status: 'failed',
      }).eq('id', post.id);
      console.error(`  ✗ AI post failed: ${result.error}`);
    }

    // Rate limit pause
    await new Promise(r => setTimeout(r, 5000));
  }

  return processed;
}

/**
 * Process all due posts — both vault-based and AI-generated.
 */
export async function processAllDuePosts(): Promise<{ vault: number; ai: number }> {
  const vault = await processDuePosts();
  const ai = await processDueAIContent();
  return { vault, ai };
}

// Direct invocation
if (require.main === module) {
  processAllDuePosts().then(({ vault, ai }) => {
    console.log(`[Poster] Processed ${vault} vault post(s), ${ai} AI post(s)`);
    process.exit(0);
  }).catch(err => {
    console.error('[Poster] Fatal:', err);
    process.exit(1);
  });
}
