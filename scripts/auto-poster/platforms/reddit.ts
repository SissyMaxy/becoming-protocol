import { chromium, type BrowserContext } from 'playwright';
import { PLATFORMS } from '../config';
import fs from 'fs';

export async function postToReddit(
  content: string,
  subreddit?: string,
  mediaPath?: string,
): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  // Parse "TITLE: xxx\n\nbody" format if present
  let title = content;
  let body = '';
  const titleMatch = content.match(/^TITLE:\s*(.+?)(?:\n\n([\s\S]*))?$/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
    body = (titleMatch[2] || '').trim();
  }
  const config = PLATFORMS.reddit;
  if (!config.enabled) return { success: false, error: 'Reddit disabled' };

  const targetSubreddit = subreddit || config.subreddit;
  if (!targetSubreddit) return { success: false, error: 'No subreddit configured' };

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();

    // Navigate to submit page
    const submitUrl = `https://www.reddit.com/r/${targetSubreddit}/submit`;
    await page.goto(submitUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check if logged in
    try {
      await page.waitForSelector('[name="title"], [placeholder*="title" i]', { timeout: 10000 });
    } catch {
      return { success: false, error: 'Not logged in to Reddit. Run: npm run login' };
    }

    if (mediaPath && fs.existsSync(mediaPath)) {
      // Image/video post
      // Click "Images & Video" tab if visible
      const mediaTab = page.locator('button:has-text("Images"), button:has-text("Image")').first();
      try {
        await mediaTab.click({ timeout: 3000 });
        await page.waitForTimeout(1000);
      } catch {
        // Tab might not exist on new Reddit UI
      }

      // Upload file
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(mediaPath);
      await page.waitForTimeout(5000); // Wait for upload
    }

    // Fill title
    const titleInput = page.locator('[name="title"], [placeholder*="title" i], textarea').first();
    await titleInput.fill(title);
    await page.waitForTimeout(1000);

    // Fill body text if present
    if (body) {
      // Reddit's text post body is usually a contenteditable div or second textarea
      const bodyInput = page.locator('[data-testid="post-body"], [role="textbox"]:not([name="title"]), .DraftEditor-root, [contenteditable="true"]').first();
      try {
        await bodyInput.click({ timeout: 3000 });
        await bodyInput.pressSequentially(body, { delay: 15 });
        await page.waitForTimeout(1000);
      } catch {
        // Body field not found — post will go through as title-only
        console.log('[Reddit] Could not find body field — posting title only');
      }
    }

    // Click post/submit
    const submitButton = page.locator('button:has-text("Post"), button[type="submit"]:has-text("Post")').first();
    await submitButton.click();
    await page.waitForTimeout(5000);

    // Capture post URL
    const currentUrl = page.url();
    const postUrl = currentUrl.includes('/comments/') ? currentUrl : undefined;

    return { success: true, postUrl };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  } finally {
    if (context) await context.close();
  }
}
