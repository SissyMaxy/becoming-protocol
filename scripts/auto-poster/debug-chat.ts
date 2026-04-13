import 'dotenv/config';
import { chromium } from 'playwright';
import { PLATFORMS } from './config';

(async () => {
  const c = await chromium.launchPersistentContext(PLATFORMS.twitter.profileDir, {
    headless: true, viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const p = c.pages()[0] || await c.newPage();
  await p.goto('https://x.com/messages', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);

  if (p.url().includes('pin') || p.url().includes('chat')) {
    const pin = process.env.TWITTER_DM_PIN || '';
    for (const d of pin) { await p.keyboard.press(d); await p.waitForTimeout(200); }
    await p.waitForTimeout(5000);
  }

  // Click Goddess Katie
  await p.locator('text=Goddess Katie').first().click();
  await p.waitForTimeout(4000);

  // Scroll to bottom
  await p.evaluate(() => {
    const containers = document.querySelectorAll('.scrollbar-thin-custom');
    const chat = containers[1] as HTMLElement;
    if (chat) chat.scrollTop = chat.scrollHeight;
  });
  await p.waitForTimeout(2000);

  // Get raw text
  const chatText = await p.evaluate(() => {
    const containers = document.querySelectorAll('.scrollbar-thin-custom');
    return (containers[1] as HTMLElement)?.innerText || '';
  });

  // Show last 3000 chars
  console.log('=== RAW CHAT (last 3000 chars) ===');
  console.log(chatText.slice(-3000));
  console.log('=== END ===');

  await c.close();
  process.exit(0);
})();
