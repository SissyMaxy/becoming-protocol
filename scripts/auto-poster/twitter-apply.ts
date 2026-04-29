/**
 * Twitter Profile Apply — pushes Handler-decided profile config to the live
 * X account via Playwright. One-shot operation, not a recurring engine.
 *
 * What it does:
 *   1. Launches the persistent Twitter profile (must be logged in to new account)
 *   2. Navigates to https://x.com/settings/profile
 *   3. Fills display_name, bio, website
 *   4. Saves
 *   5. Marks twitter_profile_config.applied_at
 *
 * What it does NOT do (yet):
 *   - Profile photo / header (require image files; do those manually)
 *   - NSFW media + DM-permission settings (require navigating multiple pages
 *     with toggle switches; finicky DOM, do those manually for now)
 *   - Post + pin tweet — separate --pin flag (riskier on day-1 accounts)
 *
 * Run:
 *   npm run twitter-apply              # apply bio + display + website
 *   npm run twitter-apply --pin        # also post + pin the configured tweet
 *   npm run twitter-apply --dry-run    # show what would be applied, do nothing
 *
 * SAFETY: this writes to the live account. Run AFTER you've logged in
 * (npx tsx login.ts twitter) and verified the right account is active.
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { supabase, PLATFORMS } from './config';

const USER_ID = process.env.USER_ID || '';

interface ApplyResult {
  ok: boolean;
  applied: string[];
  failed: Array<{ field: string; reason: string }>;
  skipped: string[];
}

async function loadConfig() {
  const { data, error } = await supabase
    .from('twitter_profile_config')
    .select('*')
    .eq('user_id', USER_ID)
    .maybeSingle();
  if (error) throw new Error(`config read failed: ${error.message}`);
  if (!data) throw new Error('twitter_profile_config not found — run: npm run twitter-profile init');
  return data;
}

async function isLoggedIn(page: Page): Promise<boolean> {
  // Logged-in state: profile-icon side nav exists, login button absent.
  await page.waitForTimeout(2500);
  const loginBtns = await page.locator('a[href="/login"], a[href="/i/flow/login"], [data-testid="login"]').count().catch(() => 0);
  if (loginBtns > 0) return false;
  const sideNav = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"]').count().catch(() => 0);
  return sideNav > 0;
}

async function clickByCandidates(page: Page, selectors: string[], opts: { timeout?: number } = {}): Promise<boolean> {
  const timeout = opts.timeout ?? 3000;
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout }).catch(() => false)) {
        await el.click();
        return true;
      }
    } catch { continue; }
  }
  return false;
}

async function fillField(page: Page, label: string, selectors: string[], value: string): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click({ delay: 100 });
        await page.waitForTimeout(200);
        // Select-all + delete to clear, then type — preserves humanlike timing
        await page.keyboard.press('Control+A').catch(() => {});
        await page.keyboard.press('Delete').catch(() => {});
        await page.waitForTimeout(150);
        await page.keyboard.type(value, { delay: 30 });
        return true;
      }
    } catch (err) {
      console.log(`    [debug] ${label} selector ${sel} failed:`, err instanceof Error ? err.message.slice(0, 80) : err);
      continue;
    }
  }
  return false;
}

async function applyProfileFields(page: Page, cfg: any, dryRun: boolean): Promise<ApplyResult> {
  const result: ApplyResult = { ok: true, applied: [], failed: [], skipped: [] };

  // Open profile editor. X's edit-profile lives at /settings/profile
  // OR is reached by clicking "Edit profile" on the profile page. Try both.
  const editUrls = [
    'https://x.com/settings/profile',
    'https://twitter.com/settings/profile',
  ];
  let opened = false;
  for (const url of editUrls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      // Detect Edit Profile UI by looking for a textarea named description or similar
      const fields = await page.locator('input[name="displayName"], textarea[name="description"], input[name="url"], [data-testid="UserName-input"], [data-testid="UserDescription-input"]').count().catch(() => 0);
      if (fields > 0) { opened = true; break; }
    } catch { continue; }
  }

  if (!opened) {
    // Fallback: click edit-profile from the profile page
    try {
      await page.goto('https://x.com/' + (cfg.handle || ''), { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      const clicked = await clickByCandidates(page, [
        '[data-testid="editProfileButton"]',
        'a[href*="/settings/profile"]',
        'a:has-text("Edit profile")',
        'button:has-text("Edit profile")',
      ], { timeout: 5000 });
      if (clicked) { await page.waitForTimeout(2500); opened = true; }
    } catch {}
  }

  if (!opened) {
    result.ok = false;
    result.failed.push({ field: 'open_editor', reason: 'could not open profile editor on x.com or twitter.com' });
    return result;
  }

  // Display name
  if (cfg.display_name) {
    if (dryRun) {
      result.skipped.push(`display_name (dry-run): would set to "${cfg.display_name}"`);
    } else {
      const ok = await fillField(page, 'display_name', [
        'input[name="displayName"]',
        '[data-testid="UserName-input"]',
        'input[aria-label*="Name" i]:not([type="checkbox"]):not([type="radio"])',
      ], cfg.display_name);
      ok ? result.applied.push(`display_name → "${cfg.display_name}"`)
         : result.failed.push({ field: 'display_name', reason: 'no input matched' });
    }
  }

  // Bio
  if (cfg.bio) {
    if (dryRun) {
      result.skipped.push(`bio (dry-run): would set to "${cfg.bio}"`);
    } else {
      const ok = await fillField(page, 'bio', [
        'textarea[name="description"]',
        '[data-testid="UserDescription-input"]',
        'textarea[aria-label*="Bio" i]',
      ], cfg.bio);
      ok ? result.applied.push(`bio (${cfg.bio.length} chars)`)
         : result.failed.push({ field: 'bio', reason: 'no textarea matched' });
    }
  }

  // Website (use Fansly URL or any configured website)
  const website = cfg.website_url || process.env.FANSLY_PUBLIC_URL;
  if (website) {
    if (dryRun) {
      result.skipped.push(`website (dry-run): would set to "${website}"`);
    } else {
      const ok = await fillField(page, 'website', [
        'input[name="url"]',
        '[data-testid="UserUrl-input"]',
        'input[aria-label*="Website" i]',
      ], website);
      ok ? result.applied.push(`website → ${website}`)
         : result.failed.push({ field: 'website', reason: 'no input matched' });
    }
  }

  // Save
  if (!dryRun && (result.applied.length > 0)) {
    const saved = await clickByCandidates(page, [
      '[data-testid="Profile_Save_Button"]',
      'button:has-text("Save")',
      '[role="button"]:has-text("Save")',
    ], { timeout: 5000 });
    if (saved) {
      await page.waitForTimeout(3000);
      result.applied.push('saved');
    } else {
      result.failed.push({ field: 'save_button', reason: 'could not find Save button — changes may not have persisted' });
      result.ok = false;
    }
  }

  return result;
}

async function postAndPinTweet(page: Page, tweetText: string, dryRun: boolean): Promise<{ ok: boolean; reason?: string; tweetUrl?: string }> {
  if (dryRun) return { ok: true, reason: `dry-run: would post + pin: "${tweetText}"` };

  try {
    await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Composer is a contenteditable div
    const composer = page.locator('[data-testid="tweetTextarea_0"], [contenteditable="true"][role="textbox"]').first();
    if (!(await composer.isVisible({ timeout: 5000 }).catch(() => false))) {
      return { ok: false, reason: 'composer not found' };
    }
    await composer.click();
    await page.waitForTimeout(300);
    await page.keyboard.type(tweetText, { delay: 30 });
    await page.waitForTimeout(500);

    const posted = await clickByCandidates(page, [
      '[data-testid="tweetButton"]',
      '[data-testid="tweetButtonInline"]',
      'button:has-text("Post")',
    ], { timeout: 5000 });
    if (!posted) return { ok: false, reason: 'post button not found' };

    await page.waitForTimeout(5000);

    // Capture the URL of the just-posted tweet for pinning
    // Strategy: navigate to profile, find the most recent tweet, get its URL
    const handle = await page.evaluate(() => {
      const link = document.querySelector('[data-testid="AppTabBar_Profile_Link"]') as HTMLAnchorElement | null;
      return link?.href ? new URL(link.href).pathname.replace(/^\//, '') : null;
    });
    if (!handle) return { ok: false, reason: 'could not detect handle for pin lookup' };

    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3500);

    // Find the first tweet card, open the more-actions menu, click Pin
    const moreBtn = page.locator('[data-testid="caret"]').first();
    if (!(await moreBtn.isVisible({ timeout: 4000 }).catch(() => false))) {
      return { ok: false, reason: 'tweet posted but caret menu not found for pinning' };
    }
    await moreBtn.click();
    await page.waitForTimeout(800);
    const pinClicked = await clickByCandidates(page, [
      '[data-testid="pinToProfile"]',
      'div[role="menuitem"]:has-text("Pin to your profile")',
      'span:has-text("Pin to your profile")',
    ], { timeout: 4000 });
    if (!pinClicked) return { ok: false, reason: 'tweet posted but pin menu item not found' };

    await page.waitForTimeout(800);
    // Confirm dialog
    await clickByCandidates(page, [
      '[data-testid="confirmationSheetConfirm"]',
      'button:has-text("Pin")',
    ], { timeout: 3000 });
    await page.waitForTimeout(2000);

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const includePin = args.includes('--pin');

  const cfg = await loadConfig();
  console.log(`[twitter-apply] Loaded Handler config:`);
  console.log(`  display_name: ${cfg.display_name || '(unset)'}`);
  console.log(`  bio:          ${cfg.bio ? cfg.bio.slice(0, 70) + (cfg.bio.length > 70 ? '...' : '') : '(unset)'}`);
  console.log(`  website:      ${cfg.website_url || process.env.FANSLY_PUBLIC_URL || '(unset)'}`);
  console.log(`  pinned tweet: ${cfg.pinned_tweet_text ? cfg.pinned_tweet_text.slice(0, 70) + '...' : '(unset)'}`);
  console.log(`  mode:         ${dryRun ? 'DRY-RUN' : 'LIVE WRITE'}${includePin ? ' + post-and-pin' : ''}\n`);

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(PLATFORMS.twitter.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled', '--window-position=-2400,-2400'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 20000 });

    if (!(await isLoggedIn(page))) {
      console.error('[twitter-apply] ✗ Not logged in. Run: npx tsx login.ts twitter');
      process.exit(1);
    }
    console.log('[twitter-apply] ✓ Logged in. Applying profile fields...\n');

    const fieldsResult = await applyProfileFields(page, cfg, dryRun);
    for (const a of fieldsResult.applied) console.log(`  ✓ ${a}`);
    for (const s of fieldsResult.skipped) console.log(`  · ${s}`);
    for (const f of fieldsResult.failed) console.log(`  ✗ ${f.field}: ${f.reason}`);

    let pinResult: { ok: boolean; reason?: string } | null = null;
    if (includePin && cfg.pinned_tweet_text) {
      console.log('\n[twitter-apply] Posting and pinning tweet...');
      pinResult = await postAndPinTweet(page, cfg.pinned_tweet_text, dryRun);
      console.log(pinResult.ok ? `  ✓ pin: ${pinResult.reason || 'posted and pinned'}`
                                : `  ✗ pin failed: ${pinResult.reason}`);
    }

    if (!dryRun && fieldsResult.applied.length > 0 && fieldsResult.failed.length === 0) {
      const stamp = new Date().toISOString();
      await supabase.from('twitter_profile_config').update({
        applied_at: stamp,
        applied_by: 'auto:twitter-apply',
        updated_at: stamp,
      }).eq('user_id', USER_ID);
      console.log(`\n[twitter-apply] ✓ Marked applied_at = ${stamp}`);
      console.log('[twitter-apply] Run: npm run twitter-status — to see updated readiness gate');
    }

    if (fieldsResult.failed.length > 0) {
      await page.screenshot({ path: '.debug-twitter-apply-failed.png' });
      console.log(`\n[twitter-apply] Saved screenshot: .debug-twitter-apply-failed.png`);
    }
  } catch (err) {
    console.error('[twitter-apply] fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    if (context) await context.close();
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
