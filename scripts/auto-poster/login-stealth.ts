/**
 * Stealth login — uses your real Chrome installation instead of Playwright's Chromium.
 * This bypasses bot detection that blocks Playwright's bundled browser.
 *
 * Usage:
 *   npx tsx login-stealth.ts onlyfans
 *   npx tsx login-stealth.ts sniffies
 *   npx tsx login-stealth.ts both
 */

import { chromium, firefox } from 'playwright';
import { PLATFORMS } from './config';
import fs from 'fs';

const LOGIN_URLS: Record<string, string> = {
  onlyfans: 'https://onlyfans.com/',
  sniffies: 'https://sniffies.com/',
};

async function loginWithRealChrome(platform: string) {
  const config = PLATFORMS[platform as keyof typeof PLATFORMS];
  if (!config) {
    console.error(`Unknown platform: ${platform}`);
    return;
  }

  const loginUrl = LOGIN_URLS[platform] || config.url;
  fs.mkdirSync(config.profileDir, { recursive: true });

  console.log(`\n=== ${platform.toUpperCase()} (Real Chrome) ===`);
  console.log(`Opening ${loginUrl}...`);
  console.log('Log in manually. Browse around after logging in. Wait 15 seconds. Then close.\n');

  // Try using your system Chrome installation
  try {
    const context = await chromium.launchPersistentContext(config.profileDir, {
      channel: 'chrome', // Uses your installed Chrome, not Playwright's Chromium
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--window-position=100,100',
        '--window-size=1280,800',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=AutomationControlled',
        '--disable-infobars',
        '--no-sandbox',
      ],
      ignoreDefaultArgs: ['--enable-automation'], // Remove the automation flag
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = context.pages()[0] || await context.newPage();

    // Hide webdriver property
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // Hide automation indicators
      (window as any).chrome = { runtime: {} };
    });

    await page.goto(loginUrl);

    // Wait for user to close
    await new Promise<void>(resolve => {
      context.on('close', resolve);
    });

    console.log(`${platform} session saved.`);
  } catch (err) {
    console.log(`Real Chrome failed: ${(err as Error).message}`);
    console.log('Trying Firefox instead...\n');
    await loginWithFirefox(platform, loginUrl, config.profileDir);
  }
}

async function loginWithFirefox(platform: string, loginUrl: string, profileDir: string) {
  // Firefox profile dir is separate
  const ffProfileDir = profileDir + '-firefox';
  fs.mkdirSync(ffProfileDir, { recursive: true });

  console.log(`Opening ${loginUrl} with Firefox...`);

  const context = await firefox.launchPersistentContext(ffProfileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(loginUrl);

  await new Promise<void>(resolve => {
    context.on('close', resolve);
  });

  console.log(`${platform} Firefox session saved to ${ffProfileDir}`);
  console.log(`\nNOTE: To use Firefox for this platform, update config.ts to use the Firefox profile dir.`);
}

async function main() {
  const platform = process.argv[2]?.toLowerCase();

  if (!platform) {
    console.log('Usage: npx tsx login-stealth.ts <platform>');
    console.log('Platforms: onlyfans, sniffies, both');
    return;
  }

  const targets = platform === 'both' ? ['onlyfans', 'sniffies'] : [platform];

  for (const t of targets) {
    await loginWithRealChrome(t);
  }

  console.log('\nDone. Run: npx tsx check-all-sessions.ts');
}

main().catch(console.error);
