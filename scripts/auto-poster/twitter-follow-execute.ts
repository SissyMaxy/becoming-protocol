/**
 * Twitter Follow Executor — pulls unfollowed handles from seed_follows and
 * actually presses the follow button on x.com.
 *
 * Safety rails (don't burn the account):
 *   - max 5 follows per invocation (override with --count N)
 *   - 45-120s random gap between follows (humanlike)
 *   - daily budget: max 8 follows per 24h (computed from followed_at timestamps)
 *   - random skip: 1-in-7 invocations does nothing (looks like Maxy "took a day off")
 *   - aborts if not logged in
 *
 * Execution does NOT depend on the readiness gate — following accounts is
 * normal day-1 behavior; the gate protects engines (replies/QT/DMs at scale).
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { supabase, PLATFORMS } from './config';

const USER_ID = process.env.USER_ID || '';

const DEFAULT_COUNT = 5;
const MIN_GAP_MS = 45_000;
const MAX_GAP_MS = 120_000;
const DAILY_BUDGET = 8;
const RANDOM_SKIP_CHANCE = 1 / 7;

interface SeedRow {
  handle: string;
  category: string;
  followed: boolean;
  followed_at: string | null;
  discovered_at?: string;
}

async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2500);
  const sideNav = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"]').count().catch(() => 0);
  return sideNav > 0;
}

async function followOne(page: Page, handle: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3500);

    // Detect account-not-found / suspended / blocked
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (/this account doesn't exist|account suspended|something went wrong/i.test(bodyText.slice(0, 500))) {
      return { ok: false, reason: 'account unavailable' };
    }

    // Already following?
    const alreadyFollowing = await page.locator('[data-testid$="-unfollow"]').count().catch(() => 0);
    if (alreadyFollowing > 0) return { ok: true, reason: 'already_following' };

    // Click the follow button. data-testid pattern is `<userId>-follow`
    const followBtn = page.locator(
      '[data-testid$="-follow"], button:has-text("Follow")[role]:not(:has-text("Following"))'
    ).first();
    if (!(await followBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      return { ok: false, reason: 'follow button not found' };
    }
    await followBtn.click();
    await page.waitForTimeout(1500);

    // Verify the click took
    const nowFollowing = await page.locator('[data-testid$="-unfollow"]').count().catch(() => 0);
    if (nowFollowing > 0) return { ok: true };
    return { ok: false, reason: 'click did not register' };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message.slice(0, 80) : 'unknown' };
  }
}

function parseArgs(): { count: number; force: boolean } {
  let count = DEFAULT_COUNT;
  let force = false;
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--count') count = Math.max(1, parseInt(process.argv[++i] || '5', 10));
    if (process.argv[i] === '--force') force = true;
  }
  return { count, force };
}

async function main() {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }
  const { count, force } = parseArgs();

  // Random skip — makes the cadence look like a human who sometimes doesn't open Twitter.
  if (!force && Math.random() < RANDOM_SKIP_CHANCE) {
    console.log('[follow] random skip — looking like a human takes patience');
    return;
  }

  // Daily budget check
  const { data: cfg } = await supabase
    .from('twitter_profile_config').select('seed_follows').eq('user_id', USER_ID).maybeSingle();
  const seeds: SeedRow[] = ((cfg?.seed_follows as SeedRow[]) || []);

  const now = Date.now();
  const followsLast24h = seeds.filter(s => s.followed_at && (now - new Date(s.followed_at).getTime()) < 24 * 3600_000).length;
  const remainingBudget = Math.max(0, DAILY_BUDGET - followsLast24h);
  if (remainingBudget === 0 && !force) {
    console.log(`[follow] daily budget exhausted (${followsLast24h}/${DAILY_BUDGET} in last 24h)`);
    return;
  }

  const targets = seeds.filter(s => !s.followed).slice(0, Math.min(count, force ? count : remainingBudget));
  if (targets.length === 0) {
    console.log('[follow] no unfollowed handles in queue. Run twitter-discover first.');
    return;
  }

  console.log(`[follow] following ${targets.length} (budget left: ${remainingBudget}/${DAILY_BUDGET})`);

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(PLATFORMS.twitter.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled', '--window-position=-2400,-2400'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = context.pages()[0] || await context.newPage();

    if (!(await isLoggedIn(page))) {
      console.error('[follow] not logged in — run: npx tsx login.ts twitter');
      process.exit(1);
    }

    // Read-modify-write loop. Refresh seed list after each follow so concurrent
    // discover runs don't get clobbered.
    let succeeded = 0, skipped = 0, failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const result = await followOne(page, target.handle);
      if (result.ok) {
        if (result.reason === 'already_following') skipped++;
        else { succeeded++; console.log(`  ✓ followed @${target.handle}  [${target.category}]`); }
      } else {
        failed++;
        console.log(`  ✗ @${target.handle} — ${result.reason}`);
      }

      // Mark in DB regardless (success or skip both mean "don't try again"; failure won't mark)
      if (result.ok) {
        const { data: latest } = await supabase
          .from('twitter_profile_config').select('seed_follows').eq('user_id', USER_ID).maybeSingle();
        const updated = ((latest?.seed_follows as SeedRow[]) || []).map(s =>
          s.handle.toLowerCase() === target.handle.toLowerCase()
            ? { ...s, followed: true, followed_at: new Date().toISOString() }
            : s
        );
        await supabase.from('twitter_profile_config')
          .update({ seed_follows: updated, updated_at: new Date().toISOString() })
          .eq('user_id', USER_ID);
      }

      // Human-cadence gap before next follow
      if (i < targets.length - 1) {
        const gap = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
        console.log(`    waiting ${Math.round(gap / 1000)}s...`);
        await page.waitForTimeout(gap);
      }
    }

    console.log(`[follow] done — ${succeeded} new, ${skipped} already-following, ${failed} failed`);
  } finally {
    if (context) await context.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
