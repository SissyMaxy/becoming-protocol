import { chromium, type BrowserContext } from 'playwright';
import { PLATFORMS } from '../config';
import fs from 'fs';

export async function postToFetLife(
  caption: string,
  mediaPath?: string,
): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  const config = PLATFORMS.fetlife;
  if (!config.enabled) return { success: false, error: 'FetLife disabled' };

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();

    if (mediaPath && fs.existsSync(mediaPath)) {
      // Photo/video upload — FetLife has a dedicated upload page
      await page.goto('https://fetlife.com/photos/new', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // Check if logged in
      const fileInput = page.locator('input[type="file"]').first();
      try {
        await fileInput.waitFor({ timeout: 10000 });
      } catch {
        return { success: false, error: 'Not logged in to FetLife. Run: npm run login' };
      }

      // Upload media
      await fileInput.setInputFiles(mediaPath);
      await page.waitForTimeout(5000);

      // Add caption/description
      const captionField = page.locator('textarea[name*="caption"], textarea[name*="description"], textarea#photo_caption, textarea').first();
      try {
        await captionField.fill(caption);
        await page.waitForTimeout(1000);
      } catch { /* caption field may not exist */ }

      // Submit
      const submitButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Upload"), button:has-text("Save")').first();
      await submitButton.click();
      await page.waitForTimeout(5000);

      const postUrl = page.url().includes('/photos/') ? page.url() : undefined;
      return { success: true, postUrl };
    } else {
      // Text post — FetLife writing/status
      await page.goto('https://fetlife.com/statuses/new', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // Find the text area
      const textArea = page.locator('textarea, [contenteditable="true"], #status_body').first();
      try {
        await textArea.waitFor({ timeout: 10000 });
      } catch {
        return { success: false, error: 'Not logged in to FetLife. Run: npm run login' };
      }

      await textArea.click();
      await textArea.fill(caption);
      await page.waitForTimeout(1000);

      // Submit
      const submitButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Post"), button:has-text("Share")').first();
      await submitButton.click();
      await page.waitForTimeout(3000);

      return { success: true };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  } finally {
    if (context) await context.close();
  }
}
