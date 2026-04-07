/**
 * Engage-Follow Engine — follow people who interact with our tweets.
 *
 * Cycle:
 *   1. Navigate to own profile, find recent tweets with engagement
 *   2. For each engaged tweet: scrape reply authors + likers
 *   3. Dedupe interactor handles
 *   4. Bot-check, dedup against existing follows, then follow
 *   5. Rate-limited with 15-30s random delays
 *
 * Run: npx tsx engage-follow-engine.ts [maxFollows]
 * Scheduled: called by scheduler.ts
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { supabase, PLATFORMS } from './config';
import { followUser, isAlreadyTracked, isBotOrSpam } from './follow-manager';

const USER_ID = process.env.USER_ID || '';
const OWN_HANDLE = process.env.TWITTER_HANDLE || 'softmaxy';

// ── Types ───────────────────────────────────────────────────────────

interface OwnTweet {
  url: string;
  replyCount: number;
  likeCount: number;
  timestamp: string;
}

// ── Scrape our recent tweets from profile ───────────────────────────

async function scrapeOwnRecentTweets(page: Page): Promise<OwnTweet[]> {
  const tweets: OwnTweet[] = [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

  try {
    await page.goto(`https://x.com/${OWN_HANDLE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    // Wait for tweets to load
    try {
      await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
    } catch {
      console.log('[EngageFollow] No tweets found on profile');
      return tweets;
    }

    // Scroll once to load a few more
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    const tweetEls = await page.locator('[data-testid="tweet"]').all();
    console.log(`[EngageFollow] Found ${tweetEls.length} tweets on profile`);

    for (const tweetEl of tweetEls.slice(0, 15)) {
      try {
        // Check timestamp — only want last 24h
        const timeEl = tweetEl.locator('time').first();
        const datetime = await timeEl.getAttribute('datetime').catch(() => '') || '';
        if (!datetime) continue;

        const tweetTime = new Date(datetime).getTime();
        if (tweetTime < cutoff) continue; // Older than 24h, skip

        // Get tweet URL
        const linkEl = timeEl.locator('xpath=ancestor::a').first();
        const href = await linkEl.getAttribute('href').catch(() => '') || '';
        if (!href || !href.includes('/status/')) continue;
        const tweetUrl = `https://x.com${href}`;

        // Verify this is our own tweet (not a retweet)
        const authorLinks = await tweetEl.locator('a[role="link"][href^="/"]').all();
        let isOwnTweet = false;
        for (const link of authorLinks) {
          const linkHref = await link.getAttribute('href').catch(() => '') || '';
          if (!linkHref || linkHref.includes('/status/')) continue;
          const handle = linkHref.replace(/^\//, '').split('/')[0].toLowerCase();
          if (handle === OWN_HANDLE.toLowerCase()) {
            isOwnTweet = true;
            break;
          }
        }
        if (!isOwnTweet) continue;

        // Get engagement counts
        let replyCount = 0;
        let likeCount = 0;

        try {
          const replyEl = tweetEl.locator('[data-testid="reply"]').first();
          const replyText = await replyEl.textContent().catch(() => '') || '';
          replyCount = parseInt(replyText.replace(/[^0-9]/g, '')) || 0;
        } catch { /* no reply count visible */ }

        try {
          const likeEl = tweetEl.locator('[data-testid="like"], [data-testid="unlike"]').first();
          const likeText = await likeEl.textContent().catch(() => '') || '';
          likeCount = parseInt(likeText.replace(/[^0-9]/g, '')) || 0;
        } catch { /* no like count visible */ }

        // Only include tweets with some engagement
        if (replyCount > 0 || likeCount > 0) {
          tweets.push({
            url: tweetUrl,
            replyCount,
            likeCount,
            timestamp: datetime,
          });
        }
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.error('[EngageFollow] Failed to scrape own tweets:', err instanceof Error ? err.message : err);
  }

  return tweets;
}

// ── Scrape reply authors from a tweet page ──────────────────────────

async function scrapeReplyAuthors(page: Page, tweetUrl: string): Promise<string[]> {
  const authors: string[] = [];
  const seen = new Set<string>();

  try {
    await page.goto(tweetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    // Wait for replies to load below the main tweet
    try {
      await page.waitForSelector('[data-testid="tweet"]', { timeout: 8000 });
    } catch {
      return authors;
    }

    // Scroll once to load more replies
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    // Get all tweet elements — first one is the main tweet, rest are replies
    const tweetEls = await page.locator('[data-testid="tweet"]').all();

    // Skip the first tweet (that's our own), process replies
    for (const replyEl of tweetEls.slice(1, 20)) {
      try {
        const links = await replyEl.locator('a[role="link"][href^="/"]').all();
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
            authors.push(handle);
          }
          break; // First valid link per reply
        }
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.error(`[EngageFollow] Failed to scrape replies for ${tweetUrl}:`, err instanceof Error ? err.message : err);
  }

  return authors;
}

// ── Scrape likers from a tweet's likes list ─────────────────────────

async function scrapeLikers(page: Page, tweetUrl: string): Promise<string[]> {
  const likers: string[] = [];
  const seen = new Set<string>();

  try {
    // Navigate to the likes page for this tweet
    // Tweet URL format: https://x.com/user/status/123456
    // Likes URL: https://x.com/user/status/123456/likes
    const likesUrl = tweetUrl.endsWith('/') ? `${tweetUrl}likes` : `${tweetUrl}/likes`;

    await page.goto(likesUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    // Check if the likes list loaded (may not be available for all tweets)
    try {
      await page.waitForSelector('[data-testid="UserCell"]', { timeout: 8000 });
    } catch {
      // Likes list didn't load — may be hidden or no likes
      console.log(`  No likes list available for ${tweetUrl}`);
      return likers;
    }

    // Scroll once to load more
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    const userCells = await page.locator('[data-testid="UserCell"]').all();

    for (const cell of userCells.slice(0, 30)) {
      try {
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
            likers.push(handle);
          }
          break;
        }
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.error(`[EngageFollow] Failed to scrape likers for ${tweetUrl}:`, err instanceof Error ? err.message : err);
  }

  return likers;
}

// ── Main cycle ──────────────────────────────────────────────────────

export async function runEngageFollowCycle(
  page: Page,
  maxFollows: number = 8,
): Promise<{ tweetsScanned: number; interactorsFound: number; followed: number }> {
  let tweetsScanned = 0;
  let followed = 0;
  const allInteractors = new Map<string, string>(); // handle -> source tweet URL

  if (!USER_ID) {
    console.error('[EngageFollow] Missing USER_ID');
    return { tweetsScanned, interactorsFound: 0, followed };
  }

  // Step 1-2: Find our recent engaged tweets
  console.log(`[EngageFollow] Scanning @${OWN_HANDLE} profile for engaged tweets...`);
  const ownTweets = await scrapeOwnRecentTweets(page);
  console.log(`[EngageFollow] Found ${ownTweets.length} tweets with engagement in last 24h`);

  // Step 3: For each engaged tweet, scrape interactors
  for (const tweet of ownTweets) {
    if (followed >= maxFollows) break;

    // Check if browser is still alive
    try {
      await page.evaluate(() => true);
    } catch {
      console.log('[EngageFollow] Browser closed — stopping');
      break;
    }

    tweetsScanned++;
    console.log(`[EngageFollow] Tweet ${tweetsScanned}: ${tweet.url} (${tweet.replyCount} replies, ${tweet.likeCount} likes)`);

    // Scrape reply authors
    if (tweet.replyCount > 0) {
      const replyAuthors = await scrapeReplyAuthors(page, tweet.url);
      console.log(`  Found ${replyAuthors.length} reply authors`);
      for (const handle of replyAuthors) {
        if (!allInteractors.has(handle.toLowerCase())) {
          allInteractors.set(handle.toLowerCase(), tweet.url);
        }
      }
    }

    // Scrape likers
    if (tweet.likeCount > 0) {
      const likers = await scrapeLikers(page, tweet.url);
      console.log(`  Found ${likers.length} likers`);
      for (const handle of likers) {
        if (!allInteractors.has(handle.toLowerCase())) {
          allInteractors.set(handle.toLowerCase(), tweet.url);
        }
      }
    }

    // Small delay between tweet scrapes to avoid rate limiting
    await page.waitForTimeout(2000 + Math.floor(Math.random() * 2000));
  }

  const interactorsFound = allInteractors.size;
  console.log(`[EngageFollow] ${interactorsFound} unique interactors found across ${tweetsScanned} tweets`);

  // Step 4-5: Process each interactor
  for (const [handle, sourceTweetUrl] of allInteractors) {
    if (followed >= maxFollows) {
      console.log(`[EngageFollow] Hit max follows (${maxFollows}), stopping`);
      break;
    }

    // Check if browser is still alive
    try {
      await page.evaluate(() => true);
    } catch {
      console.log('[EngageFollow] Browser closed — stopping');
      break;
    }

    console.log(`[EngageFollow] Processing @${handle}...`);

    // Already tracked?
    try {
      const tracked = await isAlreadyTracked(handle, USER_ID);
      if (tracked) {
        console.log(`  Already tracked — skipping`);
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
        continue;
      }
    } catch (err) {
      console.error(`  isBotOrSpam error:`, err instanceof Error ? err.message : err);
      // If bot check fails, skip rather than follow blindly
      continue;
    }

    // Follow
    try {
      await followUser(page, handle, USER_ID, 'engage_follow', sourceTweetUrl);
      console.log(`  Followed @${handle} (source: ${sourceTweetUrl})`);
      followed++;
    } catch (err) {
      console.error(`  Follow failed for @${handle}:`, err instanceof Error ? err.message : err);
    }

    // Rate limit — 15-30 seconds between follows
    if (followed < maxFollows) {
      const delay = 15000 + Math.floor(Math.random() * 15000);
      console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { tweetsScanned, interactorsFound, followed };
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
  console.log(`[Engage-Follow Engine] Starting cycle (max ${maxFollows} follows)...\n`);

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
      const result = await runEngageFollowCycle(page, maxFollows);

      console.log(`\n[Engage-Follow Engine] Done: ${result.followed} followed out of ${result.interactorsFound} interactors found across ${result.tweetsScanned} tweets`);
    } catch (err) {
      console.error('Fatal:', err);
    } finally {
      if (context) await context.close();
    }

    process.exit(0);
  })();
}
