/**
 * Followback Engine — scan followers list and follow back real accounts.
 *
 * Cycle:
 *   1. Navigate to own followers page
 *   2. Scroll to load ~50-80 follower handles
 *   3. Upsert into twitter_followers_snapshot (track last_seen_at)
 *   4. Process unprocessed followers: bot check, dedup, follow
 *   5. Rate-limited with 15-30s random delays
 *
 * Run: npx tsx followback-engine.ts [maxFollows]
 * Scheduled: called by scheduler.ts
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { supabase, PLATFORMS } from './config';
import { followUser, isAlreadyTracked, isBotOrSpam } from './follow-manager';

const USER_ID = process.env.USER_ID || '';
const OWN_HANDLE = process.env.TWITTER_HANDLE || 'softmaxy';

// ── Scrape follower/following counts from profile page ──────────────

async function scrapeAndRecordFollowerCount(page: Page, followerPageCount?: number): Promise<void> {
  try {
    await page.goto(`https://x.com/${OWN_HANDLE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    let followers = 0;
    let following = 0;

    // Grab the full header text once — all strategies parse from this
    const headerText = await page.locator('[data-testid="primaryColumn"]').first()
      .textContent({ timeout: 5000 }).catch(() => '');

    if (headerText) {
      // Twitter concatenates without spaces: "0 Following0 Followers" or "1,234 Following567 Followers"
      // Use regex that handles optional whitespace between number and label
      const followersMatch = headerText.match(/([\d,.]+[KkMm]?)\s*Followers/);
      if (followersMatch) followers = parseProfileCount(followersMatch[1]);

      const followingMatch = headerText.match(/([\d,.]+[KkMm]?)\s*Following/);
      if (followingMatch) following = parseProfileCount(followingMatch[1]);
    }

    // If profile header says 0 but we counted real followers from the followers page, use that
    if (!followers && followerPageCount && followerPageCount > 0) {
      console.log(`[Followback] Profile says 0 followers but followers page has ${followerPageCount} — using page count`);
      followers = followerPageCount;
    }

    if (followers > 0) {
      const { error } = await supabase
        .from('twitter_follower_counts')
        .insert({
          user_id: USER_ID,
          follower_count: followers,
          following_count: following,
        });

      if (error) {
        console.error('[Followback] Failed to record follower count:', error.message);
      } else {
        console.log(`[Followback] Recorded: ${followers} followers, ${following} following`);
      }

      // Unified snapshot for cross-platform growth tracking
      try {
        const { snapshotFollowers } = await import('./follower-snapshots');
        await snapshotFollowers(supabase, USER_ID, 'twitter', {
          followerCount: followers,
          followingCount: following,
        });
      } catch {}
    } else {
      console.log('[Followback] Could not scrape follower count (profile says 0, no fallback available)');
    }
  } catch (err) {
    console.error('[Followback] Follower count scrape failed:', err instanceof Error ? err.message : err);
  }
}

/** Parse "1,234" / "1.2K" / "12M" into a number */
function parseProfileCount(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/,/g, '').trim().toLowerCase();
  const m = cleaned.match(/([\d.]+)\s*([km])?/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (m[2] === 'k') n *= 1000;
  if (m[2] === 'm') n *= 1000000;
  return Math.round(n);
}

// ── Scrape follower handles from the followers page ─────────────────

async function scrapeFollowerHandles(page: Page): Promise<string[]> {
  const handles: string[] = [];
  const seen = new Set<string>();

  try {
    await page.goto(`https://x.com/${OWN_HANDLE}/followers`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    // Wait for the follower list to appear
    try {
      await page.waitForSelector('[data-testid="UserCell"]', { timeout: 10000 });
    } catch {
      console.log('[Followback] No follower cells found — page may not have loaded');
      return handles;
    }

    // Scroll 3-4 times to load more followers
    const scrollCount = 3 + Math.floor(Math.random() * 2); // 3 or 4
    for (let i = 0; i < scrollCount; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500 + Math.floor(Math.random() * 1000));
    }

    // Scrape all user cells
    const userCells = await page.locator('[data-testid="UserCell"]').all();
    console.log(`[Followback] Found ${userCells.length} follower cells`);

    for (const cell of userCells) {
      try {
        // Look for user profile links within the cell
        const links = await cell.locator('a[role="link"][href^="/"]').all();
        for (const link of links) {
          const href = await link.getAttribute('href').catch(() => '') || '';
          if (!href || href.includes('/status/') || href.includes('/search') || href === '/') continue;

          const handle = href.replace(/^\//, '').split('/')[0];
          if (!handle) continue;

          // Skip own handle
          const hLower = handle.toLowerCase().replace(/_/g, '');
          const ownLower = OWN_HANDLE.toLowerCase().replace(/_/g, '');
          if (hLower === ownLower || handle.toLowerCase() === OWN_HANDLE.toLowerCase()) continue;

          if (!seen.has(handle.toLowerCase())) {
            seen.add(handle.toLowerCase());
            handles.push(handle);
          }
          break; // Only need first valid link per cell
        }
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.error('[Followback] Failed to scrape followers:', err instanceof Error ? err.message : err);
  }

  return handles;
}

// ── Upsert followers into snapshot table ────────────────────────────

async function upsertFollowerSnapshots(handles: string[]): Promise<void> {
  const now = new Date().toISOString();

  for (const handle of handles) {
    try {
      await supabase
        .from('twitter_followers_snapshot')
        .upsert(
          {
            user_id: USER_ID,
            handle: handle.toLowerCase(),
            last_seen_at: now,
          },
          { onConflict: 'user_id,handle' },
        );
    } catch (err) {
      console.error(`[Followback] Upsert failed for @${handle}:`, err instanceof Error ? err.message : err);
    }
  }
}

// ── Get unprocessed followers ───────────────────────────────────────

async function getUnprocessedFollowers(): Promise<string[]> {
  const { data, error } = await supabase
    .from('twitter_followers_snapshot')
    .select('handle')
    .eq('user_id', USER_ID)
    .eq('processed', false)
    .order('last_seen_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[Followback] Failed to fetch unprocessed:', error.message);
    return [];
  }

  return (data || []).map(r => r.handle);
}

// ── Mark follower as processed ──────────────────────────────────────

async function markProcessed(handle: string): Promise<void> {
  try {
    await supabase
      .from('twitter_followers_snapshot')
      .update({ processed: true })
      .eq('user_id', USER_ID)
      .eq('handle', handle.toLowerCase());
  } catch (err) {
    console.error(`[Followback] Failed to mark @${handle} processed:`, err instanceof Error ? err.message : err);
  }
}

// ── Main cycle ──────────────────────────────────────────────────────

export async function runFollowbackCycle(
  page: Page,
  maxFollows: number = 8,
): Promise<{ scanned: number; followed: number; skippedBot: number; alreadyFollowing: number }> {
  let scanned = 0;
  let followed = 0;
  let skippedBot = 0;
  let alreadyFollowing = 0;

  if (!USER_ID) {
    console.error('[Followback] Missing USER_ID');
    return { scanned, followed, skippedBot, alreadyFollowing };
  }

  // Step 1: Scrape followers page first (so we have a fallback count)
  console.log(`[Followback] Navigating to @${OWN_HANDLE}/followers...`);
  const handles = await scrapeFollowerHandles(page);
  scanned = handles.length;
  console.log(`[Followback] Scraped ${scanned} follower handles`);

  if (scanned > 0) {
    console.log(`[Followback] Upserting ${scanned} followers into snapshot...`);
    await upsertFollowerSnapshots(handles);
  }

  // Step 2: Record follower count — profile header, with snapshot total as fallback
  // Use total unique followers from snapshot table (more accurate than single-page scrape)
  let snapshotTotal = scanned;
  try {
    const { count } = await supabase
      .from('twitter_followers_snapshot')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', USER_ID);
    if (count && count > snapshotTotal) snapshotTotal = count;
  } catch { /* use scanned count */ }

  await scrapeAndRecordFollowerCount(page, snapshotTotal > 0 ? snapshotTotal : undefined);

  // Step 5-7: Process unprocessed followers
  const unprocessed = await getUnprocessedFollowers();
  console.log(`[Followback] ${unprocessed.length} unprocessed followers to check`);

  for (const handle of unprocessed) {
    if (followed >= maxFollows) {
      console.log(`[Followback] Hit max follows (${maxFollows}), stopping`);
      break;
    }

    // Check if browser is still alive
    try {
      await page.evaluate(() => true);
    } catch {
      console.log('[Followback] Browser closed — stopping');
      break;
    }

    console.log(`[Followback] Processing @${handle}...`);

    // Already tracked?
    try {
      const tracked = await isAlreadyTracked(handle, USER_ID);
      if (tracked) {
        console.log(`  Already tracked — skipping`);
        alreadyFollowing++;
        await markProcessed(handle);
        continue;
      }
    } catch (err) {
      console.error(`  isAlreadyTracked error:`, err instanceof Error ? err.message : err);
    }

    // Bot/spam check
    try {
      const botCheck = await isBotOrSpam(page, handle);
      if (botCheck.isBot) {
        console.log(`  Bot/spam detected (${botCheck.reasons.join(', ')}) — skipping`);
        skippedBot++;
        await markProcessed(handle);
        continue;
      }
    } catch (err) {
      console.error(`  isBotOrSpam error:`, err instanceof Error ? err.message : err);
      // If bot check fails, skip rather than follow blindly
      await markProcessed(handle);
      continue;
    }

    // Follow
    try {
      await followUser(page, handle, USER_ID, 'followback');
      console.log(`  Followed @${handle}`);
      followed++;
      await markProcessed(handle);
    } catch (err) {
      console.error(`  Follow failed for @${handle}:`, err instanceof Error ? err.message : err);
      await markProcessed(handle);
    }

    // Rate limit — 15-30 seconds between follows
    if (followed < maxFollows) {
      const delay = 15000 + Math.floor(Math.random() * 15000);
      console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { scanned, followed, skippedBot, alreadyFollowing };
}

// Direct invocation
if (require.main === module) {
  if (!USER_ID) {
    console.error('Missing USER_ID');
    process.exit(1);
  }

  const config = PLATFORMS.twitter;
  if (!config.enabled) {
    console.error('Twitter not enabled. Set ENABLE_TWITTER=true');
    process.exit(1);
  }

  const maxFollows = parseInt(process.argv[2] || '8', 10);
  console.log(`[Followback Engine] Starting cycle (max ${maxFollows} follows)...\n`);

  (async () => {
    let context: BrowserContext | null = null;

    try {
      context = await chromium.launchPersistentContext(config.profileDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--window-position=-2400,-2400',
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });

      const page = context.pages()[0] || await context.newPage();
      const result = await runFollowbackCycle(page, maxFollows);

      console.log(`\n[Followback Engine] Done: ${result.followed} followed, ${result.skippedBot} bots skipped, ${result.alreadyFollowing} already following out of ${result.scanned} scanned`);
    } catch (err) {
      console.error('Fatal:', err);
    } finally {
      if (context) await context.close();
    }

    process.exit(0);
  })();
}
