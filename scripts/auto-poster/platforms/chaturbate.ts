import { chromium, type BrowserContext } from 'playwright';
import { PLATFORMS } from '../config';
import fs from 'fs';

export async function postToChaturbate(
  caption: string,
  mediaPath?: string,
): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  const config = PLATFORMS.chaturbate;
  if (!config.enabled) return { success: false, error: 'Chaturbate disabled' };

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();

    // Navigate to Chaturbate bio/profile update or blog post area
    await page.goto('https://chaturbate.com/b/edit/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check if logged in
    const bioArea = page.locator('textarea, [contenteditable="true"], #id_about_me').first();
    try {
      await bioArea.waitFor({ timeout: 10000 });
    } catch {
      // Try the blog/post area instead
      await page.goto('https://chaturbate.com/blog/new/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      const blogArea = page.locator('textarea, [contenteditable="true"], #id_body').first();
      try {
        await blogArea.waitFor({ timeout: 5000 });
      } catch {
        return { success: false, error: 'Not logged in to Chaturbate. Run: npm run login' };
      }

      await blogArea.click();
      await blogArea.fill(caption);
      await page.waitForTimeout(1000);

      if (mediaPath && fs.existsSync(mediaPath)) {
        const fileInput = page.locator('input[type="file"]').first();
        try {
          await fileInput.setInputFiles(mediaPath);
          await page.waitForTimeout(3000);
        } catch { /* no file upload on this page */ }
      }

      const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();
      await submitButton.click();
      await page.waitForTimeout(3000);

      return { success: true };
    }

    // Update bio/about section with latest post caption
    await bioArea.click();
    const currentBio = await bioArea.inputValue().catch(() => '');
    // Prepend new content to bio
    const newBio = `${caption}\n\n---\n\n${currentBio}`;
    await bioArea.fill(newBio);
    await page.waitForTimeout(1000);

    if (mediaPath && fs.existsSync(mediaPath)) {
      const fileInput = page.locator('input[type="file"]').first();
      try {
        await fileInput.setInputFiles(mediaPath);
        await page.waitForTimeout(3000);
      } catch { /* no file upload */ }
    }

    const saveButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Save")').first();
    await saveButton.click();
    await page.waitForTimeout(3000);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  } finally {
    if (context) await context.close();
  }
}
