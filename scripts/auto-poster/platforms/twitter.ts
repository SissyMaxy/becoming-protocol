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
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-position=-2400,-2400',  // offscreen so it doesn't interrupt
      ],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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

    // Type caption character-by-character to avoid bot detection
    await composeBox.click();
    await page.waitForTimeout(500);
    await composeBox.pressSequentially(caption, { delay: 30 });
    await page.waitForTimeout(1500);

    // Upload media if provided
    if (mediaPath && fs.existsSync(mediaPath)) {
      const fileInput = page.locator('input[type="file"][accept*="image"], input[type="file"][accept*="video"]').first();
      await fileInput.setInputFiles(mediaPath);
      await page.waitForTimeout(3000); // Wait for upload
    }

    // Click post button
    const postButton = page.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]').first();
    await postButton.click();
    await page.waitForTimeout(5000);

    // Verify the tweet actually posted:
    // After successful post, Twitter redirects away from compose or shows the toast/snackbar.
    // If compose box is still visible with text, the post likely failed.
    const currentUrl = page.url();
    const postUrl = currentUrl.includes('/status/') ? currentUrl : undefined;

    // Check if we're still on the compose page with content (= failed)
    const stillOnCompose = currentUrl.includes('/compose/');
    if (stillOnCompose) {
      // Check for error toast
      const errorToast = page.locator('[data-testid="toast"], [role="alert"]').first();
      const hasError = await errorToast.isVisible().catch(() => false);
      const errorText = hasError ? await errorToast.textContent().catch(() => 'Unknown error') : null;

      // Check if compose box still has our text (button click didn't work)
      const boxStillFilled = await composeBox.textContent().catch(() => '');
      if (boxStillFilled && boxStillFilled.length > 0) {
        // Take screenshot for debugging
        const screenshotPath = path.join(__dirname, '..', '.debug-twitter-fail.png');
        await page.screenshot({ path: screenshotPath });
        return {
          success: false,
          error: errorText || 'Tweet appears to have failed — still on compose page. Screenshot saved to .debug-twitter-fail.png',
        };
      }
    }

    return { success: true, postUrl };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  } finally {
    if (context) await context.close();
  }
}
