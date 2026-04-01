/**
 * Firefox login for Sniffies — Firefox has less bot detection than Chrome/Chromium.
 *
 * Usage: npx tsx login-firefox.ts sniffies
 */

import { firefox } from 'playwright';
import { PLATFORMS } from './config';
import fs from 'fs';

const LOGIN_URLS: Record<string, string> = {
  sniffies: 'https://sniffies.com/',
  onlyfans: 'https://onlyfans.com/',
};

async function main() {
  const platform = process.argv[2]?.toLowerCase() || 'sniffies';
  const config = PLATFORMS[platform as keyof typeof PLATFORMS];

  if (!config) {
    console.log('Usage: npx tsx login-firefox.ts sniffies');
    return;
  }

  const profileDir = config.profileDir + '-firefox';
  fs.mkdirSync(profileDir, { recursive: true });

  const loginUrl = LOGIN_URLS[platform] || config.url;

  console.log(`=== Firefox Login: ${platform} ===`);
  console.log(`Profile: ${profileDir}`);
  console.log(`Opening ${loginUrl}...`);
  console.log('Log in, browse around, wait 15s, then close the window.\n');

  const context = await firefox.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    ...(platform === 'sniffies' && 'geolocation' in config ? {
      geolocation: (config as any).geolocation,
      permissions: ['geolocation'],
    } : {}),
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(loginUrl);

  await new Promise<void>(resolve => {
    context.on('close', resolve);
  });

  console.log(`\n${platform} Firefox session saved to ${profileDir}`);
  console.log('\nNow run: npx tsx test-sniffies-firefox.ts');
}

main().catch(console.error);
