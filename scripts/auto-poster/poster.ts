/**
 * Poster — reads scheduled posts from Supabase and dispatches to platforms.
 * Called by the scheduler or manually via: npm run post
 *
 * Processes both content_posts (vault-based) and ai_generated_content
 * (Handler-generated text posts from the revenue engine).
 */

import { supabase } from './config';
import { postToTwitter } from './platforms/twitter';
import { postToReddit } from './platforms/reddit';
import { postToFansly } from './platforms/fansly';
import { postToOnlyFans } from './platforms/onlyfans';
import { postToChaturbate } from './platforms/chaturbate';
import { postToFetLife } from './platforms/fetlife';
import { postToSniffies } from './platforms/sniffies';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';

interface ScheduledPost {
  id: string;
  user_id: string;
  vault_item_id: string | null;
  platform: string;
  caption: string;
  hashtags: string[];
  subreddit: string | null;
  scheduled_at: string;
}

/**
 * Process all due posts.
 */
export async function processDuePosts(): Promise<number> {
  const now = new Date().toISOString();

  const { data: posts, error } = await supabase
    .from('content_posts')
    .select('*')
    .eq('post_status', 'scheduled')
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
    console.log(`[Poster] Processing: ${post.platform} — "${post.caption.substring(0, 50)}..."`);

    // Mark as posting (prevent double-processing)
    await supabase.from('content_posts').update({ post_status: 'posting' }).eq('id', post.id);

    // Download media if vault item exists
    let localMediaPath: string | undefined;
    if (post.vault_item_id) {
      localMediaPath = await downloadMedia(post.vault_item_id);
    }

    // Build full caption with hashtags
    const fullCaption = post.hashtags?.length > 0
      ? `${post.caption}\n\n${post.hashtags.map(h => `#${h}`).join(' ')}`
      : post.caption;

    // Dispatch to platform
    let result: { success: boolean; postUrl?: string; error?: string };

    switch (post.platform) {
      case 'twitter':
        result = await postToTwitter(fullCaption, localMediaPath);
        break;
      case 'reddit':
        result = await postToReddit(fullCaption, post.subreddit || undefined, localMediaPath);
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
      await supabase.from('content_posts').update({
        post_status: 'posted',
        posted_at: new Date().toISOString(),
        platform_url: result.postUrl || null,
      }).eq('id', post.id);
      console.log(`  ✓ Posted to ${post.platform}${result.postUrl ? ` — ${result.postUrl}` : ''}`);
      processed++;
    } else {
      await supabase.from('content_posts').update({
        post_status: 'failed',
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
 * These are text-only posts generated by the Handler.
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
  let processed = 0;

  for (const post of posts as AIScheduledPost[]) {
    // Skip empty content (engagement replies that need target's post fetched first)
    if (!post.content || post.content.trim() === '') {
      console.log(`  ⊘ Skipping empty content for ${post.platform}/${post.content_type}`);
      continue;
    }

    console.log(`[Poster/AI] Processing: ${post.platform} — "${post.content.substring(0, 50)}..."`);

    // Mark as posting
    await supabase.from('ai_generated_content').update({ status: 'posting' as never }).eq('id', post.id);

    // Build caption with hashtags if present
    const fullCaption = post.target_hashtags?.length > 0
      ? `${post.content}\n\n${post.target_hashtags.map(h => `#${h}`).join(' ')}`
      : post.content;

    // Dispatch to platform (text-only, no media)
    let result: { success: boolean; postUrl?: string; error?: string };

    switch (post.platform) {
      case 'twitter':
        result = await postToTwitter(fullCaption);
        break;
      case 'reddit':
        result = await postToReddit(fullCaption, post.target_subreddit || undefined);
        break;
      case 'fansly':
        result = await postToFansly(fullCaption);
        break;
      case 'onlyfans':
        result = await postToOnlyFans(fullCaption);
        break;
      case 'fetlife':
        result = await postToFetLife(fullCaption);
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
