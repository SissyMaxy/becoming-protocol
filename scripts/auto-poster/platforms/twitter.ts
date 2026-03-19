import { chromium, type BrowserContext, type Page } from 'playwright';
import { PLATFORMS } from '../config';
import fs from 'fs';
import path from 'path';

export async function postToTwitter(caption: string, mediaPath?: string): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  const config = PLATFORMS.twitter;
  if (!config.enabled) return { success: false, error: 'Twitter disabled' };

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();

    // Navigate to compose
    await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check if logged in (compose box should be visible)
    const composeBox = page.locator('[data-testid="tweetTextarea_0"], [role="textbox"]').first();
    try {
      await composeBox.waitFor({ timeout: 10000 });
    } catch {
      return { success: false, error: 'Not logged in to Twitter. Run: npm run login' };
    }

    // Type caption
    await composeBox.click();
    await composeBox.fill(caption);
    await page.waitForTimeout(1000);

    // Upload media if provided
    if (mediaPath && fs.existsSync(mediaPath)) {
      const fileInput = page.locator('input[type="file"][accept*="image"], input[type="file"][accept*="video"]').first();
      await fileInput.setInputFiles(mediaPath);
      await page.waitForTimeout(3000); // Wait for upload
    }

    // Click post button
    const postButton = page.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]').first();
    await postButton.click();
    await page.waitForTimeout(3000);

    // Try to capture post URL
    const currentUrl = page.url();
    const postUrl = currentUrl.includes('/status/') ? currentUrl : undefined;

    return { success: true, postUrl };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  } finally {
    if (context) await context.close();
  }
}
