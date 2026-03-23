/**
 * DM Sender — sends queued outbound DM replies via Playwright.
 *
 * Picks up responses from paid_conversations where:
 *   message_direction = 'outbound' AND sent_at IS NULL
 *
 * Run: npm run dm:send
 */

import { chromium, type BrowserContext } from 'playwright';
import { supabase, PLATFORMS } from './config';

interface PendingReply {
  id: string;
  platform: string;
  fan_identifier: string;
  last_fan_message: string;
  response_text: string;
}

async function sendFanslyDM(fanId: string, message: string): Promise<boolean> {
  const config = PLATFORMS.fansly;
  if (!config.enabled) return false;

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://fansly.com/messages', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Find the conversation with this fan
    const convos = await page.locator('[class*="conversation"], [class*="message-thread"], [class*="chat-item"]').all();
    for (const convo of convos) {
      const nameText = await convo.textContent().catch(() => '');
      if (nameText?.includes(fanId)) {
        await convo.click();
        await page.waitForTimeout(2000);

        // Type message
        const input = page.locator('textarea, [contenteditable="true"], input[type="text"]').last();
        await input.click();
        await input.fill(message);
        await page.waitForTimeout(500);

        // Send
        const sendBtn = page.locator('button:has-text("Send"), button[type="submit"]').first();
        await sendBtn.click();
        await page.waitForTimeout(2000);

        return true;
      }
    }

    console.error(`[DM-Send/Fansly] Conversation not found for: ${fanId}`);
    return false;
  } catch (err) {
    console.error('[DM-Send/Fansly] Error:', err);
    return false;
  } finally {
    if (context) await context.close();
  }
}

async function sendOnlyFansDM(fanId: string, message: string): Promise<boolean> {
  const config = PLATFORMS.onlyfans;
  if (!config.enabled) return false;

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://onlyfans.com/my/chats', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Find conversation
    const chats = await page.locator('.b-chats__item, [class*="chat-list-item"]').all();
    for (const chat of chats) {
      const nameText = await chat.textContent().catch(() => '');
      if (nameText?.includes(fanId)) {
        await chat.click();
        await page.waitForTimeout(2000);

        // Type message
        const input = page.locator('.b-chat__input textarea, [class*="chat-input"] textarea, textarea').last();
        await input.click();
        await input.fill(message);
        await page.waitForTimeout(500);

        // Send
        const sendBtn = page.locator('button:has-text("Send"), .b-chat__btn-submit, button[type="submit"]').first();
        await sendBtn.click();
        await page.waitForTimeout(2000);

        return true;
      }
    }

    console.error(`[DM-Send/OnlyFans] Conversation not found for: ${fanId}`);
    return false;
  } catch (err) {
    console.error('[DM-Send/OnlyFans] Error:', err);
    return false;
  } finally {
    if (context) await context.close();
  }
}

export async function sendPendingDMReplies(): Promise<number> {
  // Get unsent outbound replies
  const { data: pending, error } = await supabase
    .from('paid_conversations')
    .select('id, platform, fan_identifier, last_fan_message, response_text')
    .eq('message_direction', 'outbound')
    .is('sent_at', null)
    .not('response_text', 'is', null)
    .limit(10);

  if (error || !pending || pending.length === 0) return 0;

  console.log(`[DM-Send] ${pending.length} reply(ies) to send`);
  let sent = 0;

  // Group by platform to batch browser sessions
  const byPlatform: Record<string, PendingReply[]> = {};
  for (const p of pending as PendingReply[]) {
    if (!byPlatform[p.platform]) byPlatform[p.platform] = [];
    byPlatform[p.platform].push(p);
  }

  for (const [platform, replies] of Object.entries(byPlatform)) {
    for (const reply of replies) {
      let success = false;

      switch (platform) {
        case 'fansly':
          success = await sendFanslyDM(reply.fan_identifier, reply.response_text);
          break;
        case 'onlyfans':
          success = await sendOnlyFansDM(reply.fan_identifier, reply.response_text);
          break;
        default:
          console.log(`[DM-Send] Unsupported platform: ${platform}`);
          continue;
      }

      if (success) {
        await supabase
          .from('paid_conversations')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', reply.id);
        console.log(`  ✓ Sent to ${platform}/${reply.fan_identifier}`);
        sent++;
      } else {
        console.error(`  ✗ Failed: ${platform}/${reply.fan_identifier}`);
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  return sent;
}

// Direct invocation
if (require.main === module) {
  sendPendingDMReplies().then(count => {
    console.log(`[DM-Send] Done: ${count} reply(ies) sent`);
    process.exit(0);
  }).catch(err => {
    console.error('[DM-Send] Fatal:', err);
    process.exit(1);
  });
}
