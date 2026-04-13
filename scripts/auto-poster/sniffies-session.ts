/**
 * Sniffies Persistent Session — keeps a browser open for the entire scheduler run.
 *
 * Sniffies doesn't persist sessions across browser restarts. The only way to
 * maintain auth is to keep the browser open. This module manages a single
 * long-lived Firefox browser context that the scheduler reuses every tick.
 *
 * Flow:
 *   1. On first use, launches Firefox with Sniffies profile
 *   2. If not logged in, opens visible window for manual login
 *   3. Once logged in, moves window offscreen
 *   4. Returns the same page for each engagement cycle
 *   5. Browser stays open until the scheduler shuts down
 */

import { firefox, type BrowserContext, type Page } from 'playwright';
import { PLATFORMS } from './config';

let sniffiesContext: BrowserContext | null = null;
let sniffiesPage: Page | null = null;
let loginAttempted = false;

/**
 * Get the persistent Sniffies page, launching the browser if needed.
 * Returns null if Sniffies is disabled or login failed.
 */
export async function getSniffiesPage(): Promise<Page | null> {
  const config = PLATFORMS.sniffies;
  if (!config.enabled) return null;

  // Already have a live page
  if (sniffiesPage && sniffiesContext) {
    try {
      // Verify the page is still alive
      await sniffiesPage.evaluate(() => true);
      return sniffiesPage;
    } catch {
      // Page died, clean up and relaunch — reset loginAttempted so we can retry
      console.log('[Sniffies] Page died, will relaunch...');
      sniffiesPage = null;
      try { await sniffiesContext.close(); } catch {}
      sniffiesContext = null;
      loginAttempted = false;
    }
  }

  // Don't retry login more than once per run (but crashes reset this flag above)
  if (loginAttempted) return null;
  loginAttempted = true;

  console.log('[Sniffies] Launching persistent Firefox session...');

  try {
    sniffiesContext = await firefox.launchPersistentContext(
      config.profileDir + '-firefox',
      {
        headless: false,
        viewport: { width: 1280, height: 800 },
        geolocation: config.geolocation || { latitude: 43.0495, longitude: -88.0076 },
        permissions: ['geolocation'],
        args: ['--window-position=-2400,-2400'],  // offscreen so it doesn't pop up
      }
    );

    sniffiesPage = sniffiesContext.pages()[0] || await sniffiesContext.newPage();
    await sniffiesPage.goto('https://sniffies.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sniffiesPage.waitForTimeout(5000);

    // Check if logged in — URL containing /map means we're authenticated
    const currentUrl = sniffiesPage.url();
    const loginBtns = await sniffiesPage.locator(
      'button:has-text("Log In"), button:has-text("Sign Up"), button:has-text("Sign In")'
    ).count();
    const isLoggedIn = currentUrl.includes('/map') || loginBtns === 0;

    if (!isLoggedIn) {
      console.log('[Sniffies] Not logged in — opening visible window for manual login...');
      console.log('[Sniffies] Log in manually in the Firefox window. The engine will continue without Sniffies.');
      console.log('[Sniffies] After logging in, Sniffies will work on the next tick.\n');

      // Reset login flag so we can check again next tick
      loginAttempted = false;
      return null;
    }

    // Logged in — move window offscreen
    console.log('[Sniffies] ✓ Logged in — persistent session active');

    return sniffiesPage;
  } catch (err) {
    console.error('[Sniffies] Failed to launch:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Close the persistent Sniffies browser (called on shutdown).
 */
export async function closeSniffiesSession(): Promise<void> {
  if (sniffiesContext) {
    try { await sniffiesContext.close(); } catch {}
    sniffiesContext = null;
    sniffiesPage = null;
  }
}
