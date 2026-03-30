/**
 * Validate engagement targets — check which Twitter handles actually exist and have tweets.
 * Run: npx tsx validate-targets.ts
 */

import { chromium } from 'playwright';
import { PLATFORMS } from './config';

const TARGETS = [
  'sissyhypno', 'feminization_', 'sissymaker', 'sissycaptions', 'crossdresserlife',
  'feminize_me', 'sissytraining101', 'bimbojourney', 'lockedlife', 'chastitycage',
  'deniedandlocked', 'keyholderlife', 'locktober365', 'orgasmdenial_', 'edgingdaily',
  'cagecheck', 'translater', 'transtimeline', 'hrtdiaries', 'transvoicetips',
  'eggirl_memes', 'transadulthood', 'transskincare', 'latebloomer_t', 'aidomme',
  'techkink', 'smartlockdom', 'lovenselife', 'quantifiedkink', 'algorithmdom',
  'biometrickink', 'whoopkink', 'kinkeducator', 'subspacedaily', 'dslifestyle',
  'fetlifepeople', 'kinkpositivity', 'aftercaredaily', 'protocoldaily', 'surrenderdaily',
];

(async () => {
  const ctx = await chromium.launchPersistentContext(PLATFORMS.twitter.profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled', '--window-position=-2400,-2400'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = ctx.pages()[0] || await ctx.newPage();
  const alive: string[] = [];
  const dead: string[] = [];

  for (const handle of TARGETS) {
    try {
      await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2500);

      const notFound = await page.locator('span:has-text("This account doesn"), span:has-text("Account suspended"), span:has-text("doesn\\'t exist")').count();
      const hasTweets = await page.locator('[data-testid="tweet"]').count();

      if (notFound > 0 || hasTweets === 0) {
        dead.push(handle);
        console.log(`  ✗ @${handle} — ${notFound > 0 ? 'not found/suspended' : 'no tweets'}`);
      } else {
        alive.push(handle);
        console.log(`  ✓ @${handle} — ${hasTweets} tweets visible`);
      }
    } catch {
      dead.push(handle);
      console.log(`  ✗ @${handle} — timeout/error`);
    }

    await page.waitForTimeout(1500); // rate limit
  }

  console.log(`\n=== Results ===`);
  console.log(`Alive (${alive.length}): ${alive.join(', ')}`);
  console.log(`Dead  (${dead.length}): ${dead.join(', ')}`);

  await ctx.close();
})();
