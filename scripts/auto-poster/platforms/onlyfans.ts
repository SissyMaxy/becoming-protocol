import { chromium, type BrowserContext } from 'playwright';
import { PLATFORMS } from '../config';
import fs from 'fs';

export async function postToOnlyFans(
  caption: string,
  mediaPath?: string,
): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  const config = PLATFORMS.onlyfans;
  if (!config.enabled) return { success: false, error: 'OnlyFans disabled' };

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();

    // Navigate to OF home (creator view)
    await page.goto('https://onlyfans.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Find the compose area (OF has a text input at the top of the feed for creators)
    const composeArea = page.locator('[contenteditable="true"], textarea[placeholder*="compose" i], textarea[placeholder*="What" i], .b-make-post__textarea').first();
    try {
      await composeArea.waitFor({ timeout: 10000 });
    } catch {
      return { success: false, error: 'Not logged in to OnlyFans or cannot find compose area. Run: npm run login' };
    }

    await composeArea.click();
    await page.waitForTimeout(500);

    // Type caption (using keyboard to handle contenteditable)
    await page.keyboard.type(caption, { delay: 20 });
    await page.waitForTimeout(1000);

    // Upload media
    if (mediaPath && fs.existsSync(mediaPath)) {
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(mediaPath);
      await page.waitForTimeout(5000);
    }

    // Click post/send
    const postButton = page.locator('button:has-text("Post"), button:has-text("Send"), button.g-btn.m-rounded').first();
    await postButton.click();
    await page.waitForTimeout(3000);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  } finally {
    if (context) await context.close();
  }
}
