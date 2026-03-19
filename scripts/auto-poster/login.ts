/**
 * Login Script
 *
 * Opens a browser for each enabled platform so you can log in manually.
 * Saves the session to a persistent browser profile.
 * Run once: npm run login
 */

import { chromium } from 'playwright';
import { PLATFORMS } from './config';
import fs from 'fs';

async function loginToPlatform(name: string, config: { url: string; profileDir: string }) {
  console.log(`\n=== Logging in to ${name} ===`);
  console.log(`Opening ${config.url}...`);
  console.log('Log in manually. When done, close the browser window.\n');

  // Ensure profile directory exists
  fs.mkdirSync(config.profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(config.url);

  // Wait for the user to close the browser
  await new Promise<void>((resolve) => {
    context.on('close', () => resolve());
  });

  console.log(`${name} session saved to ${config.profileDir}`);
}

async function main() {
  const platforms = Object.entries(PLATFORMS).filter(([, cfg]) => cfg.enabled);

  if (platforms.length === 0) {
    console.log('No platforms enabled. Edit .env to enable platforms.');
    return;
  }

  console.log('=== Browser Login Setup ===');
  console.log(`Platforms to log in: ${platforms.map(([name]) => name).join(', ')}`);
  console.log('A browser will open for each platform. Log in manually, then close the window.\n');

  for (const [name, config] of platforms) {
    await loginToPlatform(name, config);
  }

  console.log('\n=== All logins complete ===');
  console.log('Run "npm start" to begin auto-posting.');
}

main().catch(console.error);
