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
import { resolveContact, recordEvent, recomputeTier, type ContactPlatform } from './contact-graph';

interface PendingReply {
  id: string;
  platform: string;
  subscriber_id: string;
  incoming_message: string;
  handler_response: string;
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

async function sendTwitterDM(fanId: string, message: string): Promise<boolean> {
  const config = PLATFORMS.twitter;
  if (!config.enabled) return false;

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://x.com/messages', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Handle PIN gate
    if (page.url().includes('pin/recovery') || page.url().includes('chat/pin')) {
      const passcode = process.env.TWITTER_DM_PIN;
      if (passcode && passcode.length === 4) {
        for (const digit of passcode) {
          await page.keyboard.press(digit);
          await page.waitForTimeout(200);
        }
        await page.waitForTimeout(5000);
      }
    }

    // Click into the conversation by name
    const convoLink = page.locator(`text=${fanId}`).first();
    const hasConvo = await convoLink.isVisible().catch(() => false);
    if (!hasConvo) {
      console.error(`[DM-Send/Twitter] Conversation not found for: ${fanId}`);
      return false;
    }
    await convoLink.click();
    await page.waitForTimeout(3000);

    // Type into the message input — new Twitter chat UI
    // Try multiple selectors, then fall back to keyboard typing
    const msgBox = page.locator('[data-testid="dmComposerTextInput"], [role="textbox"], [contenteditable="true"]').first();
    const hasBox = await msgBox.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBox) {
      await msgBox.click();
      await msgBox.pressSequentially(message, { delay: 25 });
    } else {
      // Fallback: click in the chat area and type
      await page.keyboard.type(message, { delay: 25 });
    }
    await page.waitForTimeout(500);

    // Send — try button first, then Enter key
    const sendBtn = page.locator('[data-testid="dmComposerSendButton"], button[aria-label="Send"]').first();
    const hasSend = await sendBtn.isVisible().catch(() => false);
    if (hasSend) {
      await sendBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(2000);

    return true;
  } catch (err) {
    console.error('[DM-Send/Twitter] Error:', err);
    return false;
  } finally {
    if (context) await context.close();
  }
}

export async function sendPendingDMReplies(): Promise<number> {
  // Get unsent outbound replies
  const { data: pending, error } = await supabase
    .from('paid_conversations')
    .select('id, platform, subscriber_id, incoming_message, handler_response')
    .eq('message_direction', 'outbound')
    .is('sent_at', null)
    .neq('handler_response', '')
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
          success = await sendFanslyDM(reply.subscriber_id, reply.handler_response);
          break;
        case 'onlyfans':
          success = await sendOnlyFansDM(reply.subscriber_id, reply.handler_response);
          break;
        case 'twitter':
          success = await sendTwitterDM(reply.subscriber_id, reply.handler_response);
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
        console.log(`  ✓ Sent to ${platform}/${reply.subscriber_id}`);
        sent++;

        // Contact graph: log the actual send (dm_out with sent=true).
        // The queued-reply event was logged by dm-reader; this records the delivered moment.
        const userId = process.env.USER_ID || '';
        if (userId) {
          try {
            const graphPlatform = (
              ['twitter', 'fansly', 'onlyfans'].includes(platform) ? platform : 'dm'
            ) as ContactPlatform;
            const contact = await resolveContact(supabase, userId, graphPlatform, reply.subscriber_id);
            await recordEvent(supabase, userId, contact.id, 'dm_out', 'out', graphPlatform, reply.handler_response, 0, { sent: true });
            await recomputeTier(supabase, contact.id);
          } catch (err) {
            console.error(`  [contact-graph] send record failed:`, err instanceof Error ? err.message : err);
          }
        }
      } else {
        console.error(`  ✗ Failed: ${platform}/${reply.subscriber_id}`);
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
