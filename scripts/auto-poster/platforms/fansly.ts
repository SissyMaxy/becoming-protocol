import { chromium, type BrowserContext } from 'playwright';
import { PLATFORMS } from '../config';
import fs from 'fs';

export async function postToFansly(
  caption: string,
  mediaPath?: string,
): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  const config = PLATFORMS.fansly;
  if (!config.enabled) return { success: false, error: 'Fansly disabled' };

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();

    // Navigate to Fansly
    await page.goto('https://fansly.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Look for the create post / compose area
    // Fansly has a "New Post" button or compose area on the creator dashboard
    const newPostButton = page.locator('button:has-text("New Post"), [class*="new-post"], [class*="create-post"]').first();
    try {
      await newPostButton.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch {
      // Might already be on compose page or different UI
    }

    // Find the text input area
    const textArea = page.locator('textarea, [contenteditable="true"], [class*="post-text"]').first();
    try {
      await textArea.waitFor({ timeout: 10000 });
    } catch {
      return { success: false, error: 'Not logged in to Fansly or cannot find compose area. Run: npm run login' };
    }

    await textArea.click();
    await textArea.fill(caption);
    await page.waitForTimeout(1000);

    // Upload media
    if (mediaPath && fs.existsSync(mediaPath)) {
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(mediaPath);
      await page.waitForTimeout(5000);
    }

    // Click post
    const postButton = page.locator('button:has-text("Post"), button:has-text("Publish"), button:has-text("Send")').first();
    await postButton.click();
    await page.waitForTimeout(3000);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  } finally {
    if (context) await context.close();
  }
}
