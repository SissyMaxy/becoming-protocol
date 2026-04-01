/**
 * Test Sniffies with Firefox — check if the session persists.
 *
 * Run: npx tsx test-sniffies-firefox.ts
 */

import { firefox } from 'playwright';
import { PLATFORMS } from './config';

async function main() {
  const config = PLATFORMS.sniffies;
  if (!config.enabled) {
    console.log('Sniffies not enabled');
    return;
  }

  const profileDir = config.profileDir + '-firefox';
  console.log('=== Sniffies Firefox Test ===\n');
  console.log(`Profile: ${profileDir}`);

  const context = await firefox.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    geolocation: config.geolocation || { latitude: 43.0495, longitude: -88.0076 },
    permissions: ['geolocation'],
  });

  const page = context.pages()[0] || await context.newPage();

  console.log('1. Navigating to sniffies.com...');
  await page.goto('https://sniffies.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(5000);

  const url = page.url();
  console.log(`   URL: ${url}`);

  // Check for login
  const loginBtns = await page.locator('button:has-text("Log In"), button:has-text("Sign Up"), button:has-text("Sign In")').count();
  const mapEls = await page.locator('canvas').count();
  const chatEls = await page.locator('[class*="chat"], [class*="message"]').count();

  console.log(`   Login buttons: ${loginBtns}`);
  console.log(`   Map elements: ${mapEls}`);
  console.log(`   Chat elements: ${chatEls}`);

  // Sniffies detection: no login buttons = logged in (map may not use canvas)
  const isLoggedIn = loginBtns === 0 || url.includes('/map');
  if (!isLoggedIn) {
    console.log('\n   ✗ NOT LOGGED IN — login buttons found');
    console.log('   Run: npx tsx login-firefox.ts sniffies');
  } else {
    console.log('\n   ✓ LOGGED IN — Firefox session persisted!');

    // Try opening chat panel
    console.log('\n2. Looking for chat panel...');
    await page.screenshot({ path: '.debug-sniffies-firefox.png' });
    console.log('   Screenshot: .debug-sniffies-firefox.png');

    // Check for the Recents tab
    const recents = await page.locator('text=Recents').isVisible().catch(() => false);
    console.log(`   Recents tab visible: ${recents}`);

    if (!recents) {
      // Try clicking bottom-left chat icon area
      console.log('   Trying to open chat panel...');
      // Click various potential chat trigger areas
      const triggers = [
        'button[aria-label*="chat" i]',
        'button[aria-label*="message" i]',
        'a[aria-label*="chat" i]',
        '[class*="chat-trigger"]',
      ];
      for (const sel of triggers) {
        const count = await page.locator(sel).count();
        if (count > 0) {
          console.log(`   Found: ${sel}`);
          await page.locator(sel).first().click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    }

    // Screenshot with chat panel
    await page.screenshot({ path: '.debug-sniffies-firefox-chat.png' });
    console.log('   Chat screenshot: .debug-sniffies-firefox-chat.png');
  }

  console.log('\n3. Keeping browser open for 30s for manual inspection...');
  await new Promise<void>(resolve => {
    context.on('close', resolve);
    setTimeout(resolve, 30000);
  });

  console.log('=== Done ===');
  try { await context.close(); } catch {}
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
