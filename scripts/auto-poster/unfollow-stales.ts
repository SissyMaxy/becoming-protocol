/**
 * Unfollow Stales — prune accounts that didn't follow back.
 *
 * Each cycle:
 *   1. Query twitter_follows for stale follows (4+ days, no follow-back)
 *   2. Visit each profile to check for "Follows you" badge
 *   3. If they followed back: update record, keep following
 *   4. If they didn't: unfollow and update record
 *
 * Run: npx tsx unfollow-stales.ts
 * Scheduled: called by scheduler.ts on unfollow ticks
 */

import 'dotenv/config';
import { type Page } from 'playwright';
import { supabase, PLATFORMS } from './config';
import { unfollowUser } from './follow-manager';

const USER_ID = process.env.USER_ID || '';

// ── Check if a user follows us back ────────────────────────────────

async function checkFollowsYou(page: Page, handle: string): Promise<'follows_back' | 'no_follow' | 'error'> {
  try {
    await page.goto(`https://x.com/${handle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2500);

    // Check if account is suspended/missing
    try {
      const bodyText = await page.locator('body').textContent({ timeout: 3000 });
      if (bodyText && (bodyText.includes('Account suspended') || bodyText.includes('doesn\u2019t exist') || bodyText.includes("This account doesn't exist"))) {
        console.log(`  @${handle} — account suspended or gone`);
        return 'no_follow';
      }
    } catch {
      // Non-critical
    }

    // Look for "Follows you" badge — Twitter renders this as a small label near the username
    try {
      // The "Follows you" indicator appears as a span with specific text
      const followsYouEl = page.locator('span:text-is("Follows you")').first();
      const visible = await followsYouEl.isVisible({ timeout: 3000 });
      if (visible) {
        return 'follows_back';
      }
    } catch {
      // Not found via text match, try alternative selectors
    }

    // Alternative: look for the indicator near the user's display name area
    try {
      const indicator = page.locator('[data-testid="userFollowIndicator"]').first();
      const visible = await indicator.isVisible({ timeout: 2000 });
      if (visible) {
        return 'follows_back';
      }
    } catch {
      // Not found
    }

    // If neither selector found "Follows you", they don't follow us
    return 'no_follow';
  } catch (err) {
    console.log(`  @${handle} — profile check failed:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

// ── Main cycle ──────────────────────────────────────────────────────

export async function runUnfollowStalesCycle(
  page: Page,
  maxUnfollows: number = 10,
): Promise<{ checked: number; reciprocated: number; unfollowed: number; stillWaiting: number }> {
  let checked = 0;
  let reciprocated = 0;
  let unfollowed = 0;
  let stillWaiting = 0;

  if (!USER_ID) {
    console.error('[Unfollow] Missing USER_ID');
    return { checked, reciprocated, unfollowed, stillWaiting };
  }

  // Query stale follows: status='followed', no follow-back, older than 4 days
  const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleFollows, error } = await supabase
    .from('twitter_follows')
    .select('id, target_handle, followed_at')
    .eq('user_id', USER_ID)
    .eq('status', 'followed')
    .is('followed_back_at', null)
    .lt('followed_at', fourDaysAgo)
    .order('followed_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('[Unfollow] Query failed:', error.message);
    return { checked, reciprocated, unfollowed, stillWaiting };
  }

  if (!staleFollows || staleFollows.length === 0) {
    console.log('[Unfollow] No stale follows found');
    return { checked, reciprocated, unfollowed, stillWaiting };
  }

  console.log(`[Unfollow] Found ${staleFollows.length} stale follows to check`);

  for (const follow of staleFollows) {
    if (unfollowed >= maxUnfollows) {
      stillWaiting++;
      continue;
    }

    const handle = follow.target_handle;
    checked++;
    console.log(`[Unfollow] Checking @${handle} (followed ${follow.followed_at})...`);

    const result = await checkFollowsYou(page, handle);

    if (result === 'follows_back') {
      // They follow us — update record and keep
      console.log(`  ✓ @${handle} follows us back — keeping`);
      reciprocated++;

      try {
        await supabase
          .from('twitter_follows')
          .update({
            followed_back_at: new Date().toISOString(),
            status: 'followed_back',
          })
          .eq('id', follow.id);
      } catch (err) {
        console.log(`  @${handle} — DB update failed:`, err instanceof Error ? err.message : err);
      }
    } else if (result === 'no_follow') {
      // They don't follow us — unfollow
      console.log(`  ✗ @${handle} did not follow back — unfollowing`);

      try {
        await unfollowUser(page, handle, USER_ID);
        unfollowed++;
        console.log(`  ✓ Unfollowed @${handle} (${unfollowed}/${maxUnfollows})`);
      } catch (err) {
        console.log(`  @${handle} — unfollow failed:`, err instanceof Error ? err.message : err);
      }
    } else {
      // Error checking — skip for now, will retry next cycle
      console.log(`  @${handle} — check errored, will retry next cycle`);
      stillWaiting++;
      continue;
    }

    // Random delay 10-20 seconds
    const delay = 10000 + Math.floor(Math.random() * 10000);
    console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
    await new Promise(r => setTimeout(r, delay));
  }

  // Count remaining stale follows we didn't get to
  const remaining = staleFollows.length - checked;
  if (remaining > 0) {
    stillWaiting += remaining;
  }

  console.log(`[Unfollow] Cycle done: checked=${checked} reciprocated=${reciprocated} unfollowed=${unfollowed} stillWaiting=${stillWaiting}`);
  return { checked, reciprocated, unfollowed, stillWaiting };
}

// Direct invocation
if (require.main === module) {
  (async () => {
    const { chromium } = await import('playwright');
    const config = PLATFORMS.twitter;

    if (!config.enabled) {
      console.log('[Unfollow] Twitter disabled');
      process.exit(0);
    }

    const maxUnfollows = parseInt(process.argv[2] || '10', 10);
    console.log(`[Unfollow Stales] Starting cycle (max ${maxUnfollows} unfollows)...\n`);

    const context = await chromium.launchPersistentContext(config.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-position=-2400,-2400',
      ],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    try {
      const page = context.pages()[0] || await context.newPage();
      const result = await runUnfollowStalesCycle(page, maxUnfollows);
      console.log(`\n[Unfollow Stales] Done:`, result);
    } finally {
      await context.close();
    }

    process.exit(0);
  })().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
