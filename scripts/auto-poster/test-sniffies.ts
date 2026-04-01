/**
 * Sniffies debug — figure out how the SPA works.
 * Opens a visible browser so you can see what's happening.
 *
 * Run: npx tsx test-sniffies.ts
 */

import { chromium } from 'playwright';
import { PLATFORMS } from './config';

async function main() {
  const config = PLATFORMS.sniffies;
  if (!config.enabled) {
    console.log('Sniffies not enabled');
    return;
  }

  console.log('=== Sniffies Debug ===\n');
  console.log('Opening with real Chrome (stealth mode)...\n');

  // Use real Chrome to avoid bot detection
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(config.profileDir, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--window-position=100,100',
        '--window-size=1280,800',
        '--disable-blink-features=AutomationControlled',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      permissions: ['geolocation'],
      geolocation: config.geolocation || { latitude: 43.0495, longitude: -88.0076 },
    });
  } catch {
    console.log('Real Chrome not available, using Playwright Chromium...');
    ctx = await chromium.launchPersistentContext(config.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--window-position=100,100',
        '--window-size=1280,800',
        '--disable-blink-features=AutomationControlled',
      ],
      permissions: ['geolocation'],
      geolocation: config.geolocation || { latitude: 43.0495, longitude: -88.0076 },
    });
  }

  const page = ctx.pages()[0] || await ctx.newPage();

  // Hide webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Step 1: Go to Sniffies
  console.log('1. Navigating to sniffies.com...');
  await page.goto('https://sniffies.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(5000);

  const url1 = page.url();
  const title1 = await page.title().catch(() => '');
  console.log(`   URL: ${url1}`);
  console.log(`   Title: ${title1}`);

  // Step 2: Check what's on the page
  console.log('\n2. Checking page state...');

  // Look for login/signup prompts
  const loginBtns = await page.locator('button:has-text("Log In"), button:has-text("Sign In"), a:has-text("Log In"), button:has-text("Sign Up")').count();
  console.log(`   Login/signup buttons: ${loginBtns}`);

  // Look for the map (means we're logged in)
  const mapEl = await page.locator('canvas, [class*="map"], [class*="Map"], #map').count();
  console.log(`   Map elements: ${mapEl}`);

  // Look for chat/message icons
  const chatIcons = await page.locator('[class*="chat"], [class*="message"], [class*="inbox"], [aria-label*="chat"], [aria-label*="message"]').count();
  console.log(`   Chat/message elements: ${chatIcons}`);

  // Look for navigation elements
  const navEls = await page.locator('nav, [class*="nav"], [class*="sidebar"], [class*="menu"]').count();
  console.log(`   Nav elements: ${navEls}`);

  // Step 3: Screenshot
  await page.screenshot({ path: '.debug-sniffies-main.png', fullPage: false });
  console.log('\n   Screenshot saved: .debug-sniffies-main.png');

  // Step 4: Try clicking the chat/message icon if found
  console.log('\n3. Looking for chat access...');

  // Sniffies typically has an envelope/chat icon in the header
  const possibleChatButtons = [
    'button[aria-label*="chat" i]',
    'button[aria-label*="message" i]',
    'button[aria-label*="inbox" i]',
    'a[href*="chat"]',
    'a[href*="message"]',
    '[class*="chat-icon"]',
    '[class*="message-icon"]',
    '[class*="inbox-icon"]',
    'svg[class*="chat"]',
    // Sniffies uses icons — try common positions
    'header button',
    'nav button',
  ];

  for (const sel of possibleChatButtons) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      const text = await page.locator(sel).first().textContent().catch(() => '') || '';
      const ariaLabel = await page.locator(sel).first().getAttribute('aria-label').catch(() => '') || '';
      console.log(`   Found: ${sel} (count=${count}, text="${text.substring(0, 30)}", aria="${ariaLabel}")`);
    }
  }

  // Step 5: Dump all buttons and links for analysis
  console.log('\n4. All interactive elements:');
  const allButtons = await page.locator('button, a[href]').all();
  for (const btn of allButtons.slice(0, 30)) {
    const tag = await btn.evaluate(el => el.tagName).catch(() => '');
    const text = await btn.textContent().catch(() => '') || '';
    const href = await btn.getAttribute('href').catch(() => '') || '';
    const ariaLabel = await btn.getAttribute('aria-label').catch(() => '') || '';
    const className = await btn.getAttribute('class').catch(() => '') || '';
    if (text.trim() || ariaLabel || href) {
      console.log(`   <${tag.toLowerCase()}> text="${text.trim().substring(0, 40)}" aria="${ariaLabel}" href="${href}" class="${className.substring(0, 40)}"`);
    }
  }

  console.log('\n5. Keeping browser open for 60 seconds — check it manually...');
  console.log('   Look for: chat icon, messages, profile menu');
  console.log('   Then close the browser window.\n');

  // Keep alive for manual inspection
  await new Promise<void>(resolve => {
    ctx.on('close', resolve);
    setTimeout(() => resolve(), 60000);
  });

  console.log('=== Done ===');
  try { await ctx.close(); } catch {}
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
