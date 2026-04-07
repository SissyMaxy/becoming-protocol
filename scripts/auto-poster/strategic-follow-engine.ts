/**
 * Strategic Follow Engine — search niche queries and follow relevant accounts.
 *
 * Each cycle:
 *   1. Pick 2 random niche search queries
 *   2. Search Twitter for recent tweets matching those queries
 *   3. Extract author handles, check profiles for quality
 *   4. Follow accounts that pass bot/spam and follower-count filters
 *   5. Log follows via follow-manager for later stale-check
 *
 * Run: npx tsx strategic-follow-engine.ts
 * Scheduled: called by scheduler.ts on follow ticks
 */

import 'dotenv/config';
import { type Page } from 'playwright';
import { supabase, PLATFORMS } from './config';
import { followUser, isAlreadyTracked, isBotOrSpam } from './follow-manager';

const USER_ID = process.env.USER_ID || '';
const OWN_HANDLE = process.env.TWITTER_HANDLE || 'softmaxy';

// ── Niche search queries ────────────────────────────────────────────

interface FollowSearchQuery {
  query: string;
  label: string;
}

const FOLLOW_SEARCHES: FollowSearchQuery[] = [
  { label: 'sissy content', query: '"sissy" (hypno OR caption OR training OR journey OR dress)' },
  { label: 'feminization', query: '"feminize" OR "feminization" OR "forced fem"' },
  { label: 'chastity', query: '"chastity" (cage OR locked OR keyholder OR denial)' },
  { label: 'good girl kink', query: '"good girl" (sissy OR femboy OR bimbo OR cage)' },
  { label: 'denial', query: '"orgasm denial" OR "edging" OR "days locked"' },
  { label: 'femboy', query: '"femboy" (cute OR outfit OR first time OR help)' },
  { label: 'HRT journey', query: '"started HRT" OR "months on HRT" OR "HRT update"' },
  { label: 'voice training', query: '"voice training" (trans OR mtf OR progress)' },
  { label: 'trans selfie', query: '"trans girl" selfie OR "mtf selfie" OR "transition selfie"' },
  { label: 'coming out', query: '"came out as trans" OR "egg cracked" OR "finally came out"' },
  { label: 'trans timeline', query: '"transition timeline" OR "mtf timeline" OR "HRT timeline"' },
  { label: 'trans life', query: '"trans woman" (life OR journey OR experience OR day)' },
];

// ── Follower count check ────────────────────────────────────────────

interface FollowerStats {
  followers: number;
  following: number;
  valid: boolean;
}

async function getFollowerStats(page: Page, handle: string): Promise<FollowerStats> {
  const empty = { followers: 0, following: 0, valid: false };

  try {
    // We should already be on the profile page (navigated by caller)
    // Look for the followers/following links
    const followersLink = page.locator(`a[href="/${handle}/verified_followers"], a[href="/${handle}/followers"]`).first();
    const followingLink = page.locator(`a[href="/${handle}/following"]`).first();

    let followers = 0;
    let following = 0;

    try {
      const followersText = await followersLink.textContent({ timeout: 5000 });
      if (followersText) {
        followers = parseCompactNumber(followersText);
      }
    } catch {
      // Try alternative: look for span containing "Followers"
      try {
        const altEl = page.locator('a[href*="followers"] span span').first();
        const altText = await altEl.textContent({ timeout: 3000 });
        if (altText) followers = parseCompactNumber(altText);
      } catch {
        console.log(`  [Follow] Could not read follower count for @${handle}`);
        return empty;
      }
    }

    try {
      const followingText = await followingLink.textContent({ timeout: 5000 });
      if (followingText) {
        following = parseCompactNumber(followingText);
      }
    } catch {
      // Non-critical, proceed with 0
    }

    return { followers, following, valid: true };
  } catch (err) {
    console.log(`  [Follow] Stats read failed for @${handle}:`, err instanceof Error ? err.message : err);
    return empty;
  }
}

/** Parse "1.2K", "50K", "1.5M", "432" etc. into a number */
function parseCompactNumber(text: string): number {
  const cleaned = text.replace(/[^0-9.KkMm]/g, '').trim();
  const match = cleaned.match(/^([\d.]+)\s*([KkMm])?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'K') return Math.round(num * 1000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  return Math.round(num);
}

// ── Extract handles from search results ─────────────────────────────

async function extractHandlesFromSearch(page: Page, query: FollowSearchQuery, maxHandles: number = 20): Promise<string[]> {
  const handles: string[] = [];

  try {
    const encoded = encodeURIComponent(query.query);
    await page.goto(`https://x.com/search?q=${encoded}&src=typed_query&f=live`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    const tweets = await page.locator('[data-testid="tweet"]').all();

    for (const tweet of tweets.slice(0, 25)) {
      if (handles.length >= maxHandles) break;

      try {
        const userLinks = await tweet.locator('a[role="link"][href^="/"]').all();
        for (const link of userLinks) {
          const href = await link.getAttribute('href').catch(() => '') || '';
          if (href && !href.includes('/status/') && !href.includes('/search') && href !== '/') {
            const handle = href.replace(/^\//, '').split('/')[0];
            if (handle && !handles.includes(handle)) {
              handles.push(handle);
            }
            break;
          }
        }
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.error(`[Follow] Search failed for "${query.label}":`, err instanceof Error ? err.message : err);
  }

  return handles;
}

// ── Main cycle ──────────────────────────────────────────────────────

export async function runStrategicFollowCycle(
  page: Page,
  maxFollows: number = 10,
): Promise<{ searched: number; profilesChecked: number; followed: number; skippedBot: number }> {
  let searched = 0;
  let profilesChecked = 0;
  let followed = 0;
  let skippedBot = 0;

  if (!USER_ID) {
    console.error('[Follow] Missing USER_ID');
    return { searched, profilesChecked, followed, skippedBot };
  }

  // Pick 2 random queries
  const shuffled = [...FOLLOW_SEARCHES].sort(() => Math.random() - 0.5);
  const queries = shuffled.slice(0, 2);

  for (const query of queries) {
    if (followed >= maxFollows) break;

    console.log(`[Follow] Searching: "${query.label}"...`);
    searched++;

    const handles = await extractHandlesFromSearch(page, query);
    console.log(`  Found ${handles.length} handles`);

    // Dedupe and skip own handle
    const ownLower = OWN_HANDLE.toLowerCase();
    const uniqueHandles = handles.filter(h => h.toLowerCase() !== ownLower);

    for (const handle of uniqueHandles) {
      if (followed >= maxFollows) break;

      // Check if already tracked
      try {
        const tracked = await isAlreadyTracked(handle, USER_ID);
        if (tracked) {
          console.log(`  @${handle} — already tracked, skipping`);
          continue;
        }
      } catch (err) {
        console.log(`  @${handle} — tracking check failed, skipping:`, err instanceof Error ? err.message : err);
        continue;
      }

      profilesChecked++;

      // Navigate to profile
      try {
        await page.goto(`https://x.com/${handle}`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await page.waitForTimeout(2000);
      } catch (err) {
        console.log(`  @${handle} — profile load failed:`, err instanceof Error ? err.message : err);
        continue;
      }

      // Check if account is suspended or doesn't exist
      try {
        const bodyText = await page.locator('body').textContent({ timeout: 3000 });
        if (bodyText && (bodyText.includes('Account suspended') || bodyText.includes('doesn\u2019t exist') || bodyText.includes("This account doesn't exist"))) {
          console.log(`  @${handle} — account suspended or missing, skipping`);
          continue;
        }
      } catch {
        // Non-critical
      }

      // Bot/spam check
      try {
        const botCheck = await isBotOrSpam(page, handle);
        if (botCheck.isBot) {
          console.log(`  @${handle} — bot/spam detected (${botCheck.reasons.join(', ')}), skipping`);
          skippedBot++;
          continue;
        }
      } catch (err) {
        console.log(`  @${handle} — bot check failed, skipping:`, err instanceof Error ? err.message : err);
        continue;
      }

      // Follower count check
      const stats = await getFollowerStats(page, handle);
      if (!stats.valid) {
        console.log(`  @${handle} — could not read follower stats, skipping`);
        continue;
      }

      if (stats.followers < 10) {
        console.log(`  @${handle} — too few followers (${stats.followers}), likely dead account`);
        continue;
      }

      if (stats.followers > 100_000) {
        console.log(`  @${handle} — too many followers (${stats.followers}), won't follow back`);
        continue;
      }

      // Sweet spot: 10–50K is ideal, 50K–100K is acceptable
      const quality = stats.followers >= 10 && stats.followers <= 50_000 ? 'ideal' : 'acceptable';
      console.log(`  @${handle} — ${stats.followers} followers (${quality})`);

      // Follow
      try {
        await followUser(page, handle, USER_ID, 'strategic', query.label);
        followed++;
        console.log(`  ✓ Followed @${handle} (${followed}/${maxFollows})`);
      } catch (err) {
        console.log(`  @${handle} — follow failed:`, err instanceof Error ? err.message : err);
        continue;
      }

      // Random delay 20-40 seconds
      const delay = 20000 + Math.floor(Math.random() * 20000);
      console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.log(`[Follow] Cycle done: searched=${searched} checked=${profilesChecked} followed=${followed} skippedBot=${skippedBot}`);
  return { searched, profilesChecked, followed, skippedBot };
}

// Direct invocation
if (require.main === module) {
  (async () => {
    const { chromium } = await import('playwright');
    const config = PLATFORMS.twitter;

    if (!config.enabled) {
      console.log('[Follow] Twitter disabled');
      process.exit(0);
    }

    const maxFollows = parseInt(process.argv[2] || '10', 10);
    console.log(`[Strategic Follow Engine] Starting cycle (max ${maxFollows} follows)...\n`);

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
      const result = await runStrategicFollowCycle(page, maxFollows);
      console.log(`\n[Strategic Follow Engine] Done:`, result);
    } finally {
      await context.close();
    }

    process.exit(0);
  })().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
