/**
 * Session validator — checks login status for all enabled platforms.
 * Run: npx tsx check-all-sessions.ts
 */

import { chromium } from 'playwright';
import { PLATFORMS } from './config';

interface SessionCheck {
  platform: string;
  url: string;
  loggedIn: boolean;
  finalUrl: string;
  pageTitle: string;
  error?: string;
}

async function checkPlatform(name: string, config: { profileDir: string; url: string }): Promise<SessionCheck> {
  const result: SessionCheck = {
    platform: name,
    url: config.url,
    loggedIn: false,
    finalUrl: '',
    pageTitle: '',
  };

  const STEALTH = new Set(['onlyfans', 'sniffies']);
  const useStealth = STEALTH.has(name);

  let context;
  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      ...(useStealth ? { channel: 'chrome' } : {}),
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-position=-2400,-2400',
      ],
      ...(useStealth ? { ignoreDefaultArgs: ['--enable-automation'] } : {}),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    if (useStealth) {
      const p = context.pages()[0] || await context.newPage();
      await p.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
    }

    const page = context.pages()[0] || await context.newPage();

    // Platform-specific check URLs and login detection
    const checks: Record<string, { checkUrl: string; loginIndicators: string[]; loggedInIndicators: string[] }> = {
      twitter: {
        checkUrl: 'https://x.com/home',
        loginIndicators: ['/login', '/i/flow', 'single_sign_on'],
        loggedInIndicators: [],
      },
      reddit: {
        checkUrl: 'https://old.reddit.com/user/me/',
        loginIndicators: ['/login', '/register'],
        loggedInIndicators: ['/user/'],
      },
      fansly: {
        checkUrl: 'https://fansly.com/softmaxy/posts',
        loginIndicators: [],
        loggedInIndicators: ['softmaxy', '/posts'],
      },
      onlyfans: {
        checkUrl: 'https://onlyfans.com/my/statistics',
        loginIndicators: ['/auth', '/login'],
        loggedInIndicators: ['/my/'],
      },
      chaturbate: {
        checkUrl: 'https://chaturbate.com/accounts/editprofile/',
        loginIndicators: ['/auth/login', '/accounts/login'],
        loggedInIndicators: ['editprofile'],
      },
      fetlife: {
        checkUrl: 'https://fetlife.com/home',
        loginIndicators: ['/login', '/users/sign_in'],
        loggedInIndicators: ['/home'],
      },
      sniffies: {
        checkUrl: 'https://sniffies.com/messages',
        loginIndicators: [],
        loggedInIndicators: ['messages', 'chats', 'inbox'],
      },
    };

    const check = checks[name] || { checkUrl: config.url, loginIndicators: ['/login'], loggedInIndicators: [] };

    await page.goto(check.checkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(4000);

    result.finalUrl = page.url();
    result.pageTitle = await page.title().catch(() => '');

    // Check for login redirect
    const isLoginPage = check.loginIndicators.some(indicator => result.finalUrl.includes(indicator));

    // Check for logged-in indicators
    const isLoggedIn = check.loggedInIndicators.length > 0
      ? check.loggedInIndicators.some(indicator => result.finalUrl.includes(indicator))
      : !isLoginPage;

    // Also check for login buttons/links on page
    const loginButtons = await page.locator(
      'a[href*="login"], a[href*="sign_in"], button:has-text("Log In"), button:has-text("Sign In"), button:has-text("Sign Up")'
    ).count();

    // Sniffies special case: landing on homepage = not logged in
    if (name === 'sniffies' && (result.finalUrl === 'https://sniffies.com/' || result.finalUrl.endsWith('sniffies.com'))) {
      result.loggedIn = false;
    } else {
      result.loggedIn = isLoggedIn && !isLoginPage;
    }

  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    if (context) await context.close().catch(() => {});
  }

  return result;
}

async function main() {
  console.log('=== Session Validator ===\n');

  const platforms = Object.entries(PLATFORMS).filter(([, cfg]) => cfg.enabled);
  console.log(`Checking ${platforms.length} enabled platforms...\n`);

  const results: SessionCheck[] = [];

  for (const [name, config] of platforms) {
    process.stdout.write(`  ${name}... `);
    const result = await checkPlatform(name, config);
    results.push(result);

    if (result.error) {
      console.log(`ERROR: ${result.error}`);
    } else if (result.loggedIn) {
      console.log(`✓ LOGGED IN (${result.finalUrl})`);
    } else {
      console.log(`✗ NOT LOGGED IN → ${result.finalUrl}`);
    }
  }

  console.log('\n=== Summary ===');
  const alive = results.filter(r => r.loggedIn);
  const dead = results.filter(r => !r.loggedIn && !r.error);
  const errored = results.filter(r => r.error);

  if (alive.length > 0) {
    console.log(`\n  ✓ Active (${alive.length}): ${alive.map(r => r.platform).join(', ')}`);
  }
  if (dead.length > 0) {
    console.log(`\n  ✗ Need re-login (${dead.length}): ${dead.map(r => r.platform).join(', ')}`);
    console.log(`    Run: npx tsx login.ts`);
  }
  if (errored.length > 0) {
    console.log(`\n  ⚠ Errors (${errored.length}): ${errored.map(r => `${r.platform} (${r.error})`).join(', ')}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
