import { chromium } from 'playwright';
import { PLATFORMS } from './config';

(async () => {
  const ctx = await chromium.launchPersistentContext(PLATFORMS.twitter.profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  const p = ctx.pages()[0] || await ctx.newPage();
  await p.goto('https://x.com/home');
  await p.waitForTimeout(5000);
  console.log('URL:', p.url());
  console.log('Title:', await p.title());
  await ctx.close();
})();
