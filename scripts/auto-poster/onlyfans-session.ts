/**
 * OnlyFans Persistent Session — keeps a Firefox browser open for the entire scheduler run.
 *
 * OnlyFans actively kills Playwright's Chromium. Firefox works but sessions
 * don't persist across restarts. So we keep the browser open.
 *
 * On first use: launches Firefox, if not logged in you log in manually.
 * Browser stays open for all subsequent ticks.
 */

import { type BrowserContext, type Page } from 'playwright';
import { PLATFORMS } from './config';
import { launchInvisible } from './invisible-launch';

let ofContext: BrowserContext | null = null;
let ofPage: Page | null = null;
let loginAttempted = false;

/**
 * Get the persistent OnlyFans page, launching Firefox if needed.
 */
export async function getOnlyFansPage(): Promise<Page | null> {
  const config = PLATFORMS.onlyfans;
  if (!config.enabled) return null;

  // Already have a live page
  if (ofPage && ofContext) {
    try {
      await ofPage.evaluate(() => true);
      return ofPage;
    } catch {
      ofPage = null;
      try { await ofContext.close(); } catch {}
      ofContext = null;
    }
  }

  if (loginAttempted) return null;
  loginAttempted = true;

  console.log('[OnlyFans] Launching persistent Firefox session...');

  try {
    ofContext = await launchInvisible({
      engine: 'firefox',
      profileDir: config.profileDir + '-firefox',
      viewport: { width: 1280, height: 800 },
      requireHeaded: true,  // OnlyFans kills Playwright Chromium + detects headless
    });

    ofPage = ofContext.pages()[0] || await ofContext.newPage();
    await ofPage.goto('https://onlyfans.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await ofPage.waitForTimeout(5000);

    const currentUrl = ofPage.url();
    const hasLogin = currentUrl.includes('/auth') || currentUrl.includes('return_to');
    const loginBtns = await ofPage.locator('a:has-text("Log in"), button:has-text("Log in")').count();

    if (hasLogin || loginBtns > 0) {
      console.log('[OnlyFans] Not logged in. Run `npx tsx login-firefox.ts onlyfans` in a separate terminal.');
      console.log('[OnlyFans] Scheduler will NOT open a visible browser. Skipping until login is present.');
      try { await ofContext.close(); } catch {}
      ofContext = null;
      ofPage = null;
      loginAttempted = false;
      return null;
    }

    console.log('[OnlyFans] ✓ Logged in — persistent session active');
    return ofPage;
  } catch (err) {
    console.error('[OnlyFans] Failed to launch:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Close the persistent OnlyFans browser.
 */
export async function closeOnlyFansSession(): Promise<void> {
  if (ofContext) {
    try { await ofContext.close(); } catch {}
    ofContext = null;
    ofPage = null;
  }
}
