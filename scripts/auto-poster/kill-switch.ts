/**
 * Kill Switch — emergency deletion of content across all platforms.
 *
 * Usage:
 *   npx tsx kill-switch.ts                    # Delete all scheduled/pending posts
 *   npx tsx kill-switch.ts --post-id <uuid>   # Delete specific post
 *   npx tsx kill-switch.ts --platform twitter  # Delete all from one platform
 *
 * This does NOT delete already-posted content from platforms (that requires
 * manual login). It cancels anything queued and marks posted content for review.
 */

import { chromium, type BrowserContext } from 'playwright';
import { supabase, PLATFORMS } from './config';

interface KillOptions {
  postId?: string;
  platform?: string;
  deleteFromPlatform?: boolean; // Attempt Playwright deletion of posted content
}

/**
 * Cancel all scheduled/pending posts.
 */
async function cancelScheduledPosts(options: KillOptions): Promise<number> {
  let query = supabase
    .from('ai_generated_content')
    .update({ status: 'killed' })
    .in('status', ['scheduled', 'pending_review', 'posting']);

  if (options.postId) {
    query = query.eq('id', options.postId);
  }
  if (options.platform) {
    query = query.eq('platform', options.platform);
  }

  const { count } = await query.select('id', { count: 'exact', head: true });

  return count || 0;
}

/**
 * Attempt to delete a posted tweet via Playwright.
 */
async function deleteFromTwitter(postUrl: string): Promise<boolean> {
  const config = PLATFORMS.twitter;
  if (!config.enabled) return false;

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: false, // Need to see what we're deleting
      viewport: { width: 1280, height: 800 },
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Click the three-dot menu on the tweet
    const moreButton = page.locator('[data-testid="caret"]').first();
    await moreButton.click();
    await page.waitForTimeout(1000);

    // Click "Delete"
    const deleteOption = page.locator('[data-testid="Dropdown"] [role="menuitem"]:has-text("Delete")').first();
    await deleteOption.click();
    await page.waitForTimeout(1000);

    // Confirm deletion
    const confirmButton = page.locator('[data-testid="confirmationSheetConfirm"]').first();
    await confirmButton.click();
    await page.waitForTimeout(2000);

    return true;
  } catch (err) {
    console.error('[Kill] Twitter delete failed:', err);
    return false;
  } finally {
    if (context) await context.close();
  }
}

/**
 * Priority kill — cancel all queued content and optionally delete posted content.
 */
export async function killAll(options: KillOptions = {}): Promise<{
  cancelled: number;
  platformDeleted: number;
}> {
  console.log('[KILL SWITCH] Activating...');

  // 1. Cancel all scheduled posts
  const cancelled = await cancelScheduledPosts(options);
  console.log(`[KILL] Cancelled ${cancelled} scheduled post(s)`);

  let platformDeleted = 0;

  // 2. If deleteFromPlatform is set, attempt to delete recently posted content
  if (options.deleteFromPlatform) {
    const { data: recentPosts } = await supabase
      .from('ai_generated_content')
      .select('id, platform, platform_url')
      .eq('status', 'posted')
      .not('platform_url', 'is', null)
      .order('posted_at', { ascending: false })
      .limit(10);

    for (const post of recentPosts || []) {
      if (options.platform && post.platform !== options.platform) continue;

      let deleted = false;
      if (post.platform === 'twitter' && post.platform_url) {
        deleted = await deleteFromTwitter(post.platform_url);
      }
      // Other platforms: would need platform-specific deletion logic

      if (deleted) {
        await supabase.from('ai_generated_content')
          .update({ status: 'killed' })
          .eq('id', post.id);
        platformDeleted++;
        console.log(`[KILL] Deleted from ${post.platform}: ${post.platform_url}`);
      }
    }
  }

  console.log(`[KILL SWITCH] Complete: ${cancelled} cancelled, ${platformDeleted} deleted from platforms`);
  return { cancelled, platformDeleted };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: KillOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--post-id' && args[i + 1]) options.postId = args[++i];
    if (args[i] === '--platform' && args[i + 1]) options.platform = args[++i];
    if (args[i] === '--delete-from-platform') options.deleteFromPlatform = true;
  }

  killAll(options).then(result => {
    console.log('Result:', result);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
