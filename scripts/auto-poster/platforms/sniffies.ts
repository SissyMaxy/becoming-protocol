import { chromium, type BrowserContext } from 'playwright';
import { PLATFORMS } from '../config';
import fs from 'fs';

export async function postToSniffies(
  caption: string,
  mediaPath?: string,
): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  const config = PLATFORMS.sniffies;
  if (!config.enabled) return { success: false, error: 'Sniffies disabled' };

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
      geolocation: { latitude: 0, longitude: 0 },
      permissions: ['geolocation'],
    });

    const page = context.pages()[0] || await context.newPage();

    // Navigate to Sniffies profile/edit area
    await page.goto('https://sniffies.com/profile/edit', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Sniffies is map-based — posting is typically profile bio updates or direct messages
    // Look for bio/about text area
    const bioArea = page.locator('textarea, [contenteditable="true"], input[name*="bio"], input[name*="about"]').first();
    try {
      await bioArea.waitFor({ timeout: 10000 });
    } catch {
      return { success: false, error: 'Not logged in to Sniffies. Run: npm run login' };
    }

    await bioArea.click();
    await bioArea.fill(caption);
    await page.waitForTimeout(1000);

    // Upload photo if available
    if (mediaPath && fs.existsSync(mediaPath)) {
      const fileInput = page.locator('input[type="file"]').first();
      try {
        await fileInput.setInputFiles(mediaPath);
        await page.waitForTimeout(3000);
      } catch { /* no file upload on this page */ }
    }

    // Save profile
    const saveButton = page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').first();
    await saveButton.click();
    await page.waitForTimeout(3000);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  } finally {
    if (context) await context.close();
  }
}
