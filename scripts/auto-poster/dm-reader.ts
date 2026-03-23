/**
 * DM Reader — scrapes incoming DMs from paid platforms.
 *
 * Priority platforms: Fansly, OnlyFans (paid DM revenue).
 * Secondary: Twitter (engagement), FetLife (community).
 *
 * Flow:
 *   1. Open platform DM/messages page via Playwright
 *   2. Scrape unread conversations
 *   3. Store new messages in paid_conversations table
 *   4. Queue AI response generation via handler-revenue edge function
 *
 * Run: npm run read-dms
 * Scheduled: alongside auto-poster poll (every 15 min)
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { supabase, PLATFORMS } from './config';

interface IncomingDM {
  platform: string;
  fanIdentifier: string;
  fanDisplayName: string;
  messageText: string;
  receivedAt: string;
  conversationUrl?: string;
}

// ── Fansly DM Reader ─────────────────────────────────────────────────

async function readFanslyDMs(): Promise<IncomingDM[]> {
  const config = PLATFORMS.fansly;
  if (!config.enabled) return [];

  let context: BrowserContext | null = null;
  const messages: IncomingDM[] = [];

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://fansly.com/messages', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Check if logged in
    const notLoggedIn = await page.locator('button:has-text("Log In"), a:has-text("Log In")').count();
    if (notLoggedIn > 0) {
      console.error('[DM/Fansly] Not logged in. Run: npm run login');
      return [];
    }

    // Get conversation list — look for unread indicators
    const conversations = await page.locator('[class*="conversation"], [class*="message-thread"], [class*="chat-item"]').all();
    console.log(`[DM/Fansly] Found ${conversations.length} conversation(s)`);

    // Process up to 10 most recent conversations
    const limit = Math.min(conversations.length, 10);
    for (let i = 0; i < limit; i++) {
      try {
        const convo = conversations[i];

        // Check for unread indicator
        const hasUnread = await convo.locator('[class*="unread"], [class*="badge"], [class*="dot"]').count();
        if (hasUnread === 0) continue;

        // Extract fan name
        const nameEl = convo.locator('[class*="name"], [class*="username"]').first();
        const fanName = await nameEl.textContent().catch(() => 'unknown');

        // Click into conversation
        await convo.click();
        await page.waitForTimeout(2000);

        // Read latest messages from the fan (not from us)
        const messageEls = await page.locator('[class*="message"]:not([class*="own"]):not([class*="sent"])').all();
        const recentMessages = messageEls.slice(-3); // Last 3 messages from fan

        for (const msgEl of recentMessages) {
          const text = await msgEl.textContent().catch(() => '');
          if (text && text.trim().length > 0) {
            messages.push({
              platform: 'fansly',
              fanIdentifier: fanName?.trim() || 'unknown',
              fanDisplayName: fanName?.trim() || 'unknown',
              messageText: text.trim(),
              receivedAt: new Date().toISOString(),
              conversationUrl: page.url(),
            });
          }
        }
      } catch (err) {
        console.error(`[DM/Fansly] Error reading conversation ${i}:`, err);
      }
    }
  } catch (err) {
    console.error('[DM/Fansly] Error:', err);
  } finally {
    if (context) await context.close();
  }

  return messages;
}

// ── OnlyFans DM Reader ───────────────────────────────────────────────

async function readOnlyFansDMs(): Promise<IncomingDM[]> {
  const config = PLATFORMS.onlyfans;
  if (!config.enabled) return [];

  let context: BrowserContext | null = null;
  const messages: IncomingDM[] = [];

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://onlyfans.com/my/chats', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Check if logged in
    const notLoggedIn = await page.locator('a[href="/"]').count() === 0;
    if (notLoggedIn) {
      const loginBtn = await page.locator('button:has-text("Log in"), a:has-text("Log in")').count();
      if (loginBtn > 0) {
        console.error('[DM/OnlyFans] Not logged in. Run: npm run login');
        return [];
      }
    }

    // Get chat list
    const chatItems = await page.locator('.b-chats__item, [class*="chat-list-item"], [class*="conversation-item"]').all();
    console.log(`[DM/OnlyFans] Found ${chatItems.length} chat(s)`);

    const limit = Math.min(chatItems.length, 10);
    for (let i = 0; i < limit; i++) {
      try {
        const chat = chatItems[i];

        // Check for unread
        const hasUnread = await chat.locator('.b-chats__item__count, [class*="unread"], [class*="badge"]').count();
        if (hasUnread === 0) continue;

        // Get fan name
        const nameEl = chat.locator('.b-chats__item__name, [class*="username"]').first();
        const fanName = await nameEl.textContent().catch(() => 'unknown');

        // Click into chat
        await chat.click();
        await page.waitForTimeout(2000);

        // Read incoming messages
        const incomingMsgs = await page.locator('.b-chat__message--incoming .b-chat__message__text, [class*="message-incoming"]').all();
        const recentMsgs = incomingMsgs.slice(-3);

        for (const msgEl of recentMsgs) {
          const text = await msgEl.textContent().catch(() => '');
          if (text && text.trim().length > 0) {
            messages.push({
              platform: 'onlyfans',
              fanIdentifier: fanName?.trim() || 'unknown',
              fanDisplayName: fanName?.trim() || 'unknown',
              messageText: text.trim(),
              receivedAt: new Date().toISOString(),
              conversationUrl: page.url(),
            });
          }
        }
      } catch (err) {
        console.error(`[DM/OnlyFans] Error reading chat ${i}:`, err);
      }
    }
  } catch (err) {
    console.error('[DM/OnlyFans] Error:', err);
  } finally {
    if (context) await context.close();
  }

  return messages;
}

// ── Twitter DM Reader ────────────────────────────────────────────────

async function readTwitterDMs(): Promise<IncomingDM[]> {
  const config = PLATFORMS.twitter;
  if (!config.enabled) return [];

  let context: BrowserContext | null = null;
  const messages: IncomingDM[] = [];

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://x.com/messages', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Get conversation list
    const convos = await page.locator('[data-testid="conversation"], [class*="DirectMessage"]').all();
    console.log(`[DM/Twitter] Found ${convos.length} conversation(s)`);

    const limit = Math.min(convos.length, 5);
    for (let i = 0; i < limit; i++) {
      try {
        const convo = convos[i];

        // Check for unread indicator
        const hasUnread = await convo.locator('[class*="unread"], [class*="badge"]').count();
        if (hasUnread === 0) continue;

        const nameEl = convo.locator('[class*="name"]').first();
        const fanName = await nameEl.textContent().catch(() => 'unknown');

        await convo.click();
        await page.waitForTimeout(2000);

        // Read messages not from us (the other side of the conversation)
        const allMsgs = await page.locator('[data-testid="messageEntry"]').all();
        const recentMsgs = allMsgs.slice(-3);

        for (const msgEl of recentMsgs) {
          const text = await msgEl.textContent().catch(() => '');
          if (text && text.trim().length > 0) {
            messages.push({
              platform: 'twitter',
              fanIdentifier: fanName?.trim() || 'unknown',
              fanDisplayName: fanName?.trim() || 'unknown',
              messageText: text.trim(),
              receivedAt: new Date().toISOString(),
              conversationUrl: page.url(),
            });
          }
        }
      } catch (err) {
        console.error(`[DM/Twitter] Error reading convo ${i}:`, err);
      }
    }
  } catch (err) {
    console.error('[DM/Twitter] Error:', err);
  } finally {
    if (context) await context.close();
  }

  return messages;
}

// ── Store messages + queue responses ─────────────────────────────────

async function storeAndQueueResponses(messages: IncomingDM[]): Promise<number> {
  if (messages.length === 0) return 0;

  let stored = 0;

  for (const msg of messages) {
    // Check if we already have this message (dedup by platform + fan + text)
    const { count } = await supabase
      .from('paid_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('platform', msg.platform)
      .eq('fan_identifier', msg.fanIdentifier)
      .eq('last_fan_message', msg.messageText);

    if ((count || 0) > 0) {
      continue; // Already stored
    }

    // Check if fan is a known subscriber
    const { data: subscriber } = await supabase
      .from('gfe_subscribers')
      .select('id, tier, display_name')
      .eq('platform', msg.platform)
      .eq('platform_username', msg.fanIdentifier)
      .maybeSingle();

    // Upsert the conversation
    const { error } = await supabase.from('paid_conversations').upsert({
      platform: msg.platform,
      fan_identifier: msg.fanIdentifier,
      fan_display_name: msg.fanDisplayName,
      subscriber_id: subscriber?.id || null,
      tier: subscriber?.tier || 'basic',
      last_fan_message: msg.messageText,
      last_fan_message_at: msg.receivedAt,
      status: 'needs_response',
      conversation_url: msg.conversationUrl,
    }, {
      onConflict: 'platform,fan_identifier',
    });

    if (error) {
      console.error(`[DM] Store error for ${msg.platform}/${msg.fanIdentifier}:`, error.message);
    } else {
      console.log(`[DM] Stored: ${msg.platform}/${msg.fanIdentifier} — "${msg.messageText.substring(0, 40)}..."`);
      stored++;
    }
  }

  // Queue response generation for conversations needing response
  if (stored > 0) {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (supabaseUrl && serviceKey) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/handler-revenue`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'respond_dm' }),
        });
        console.log(`[DM] Queued response generation: ${response.status}`);
      } catch (err) {
        console.error('[DM] Failed to queue response generation:', err);
      }
    }
  }

  return stored;
}

// ── Main entry point ─────────────────────────────────────────────────

export async function readAllDMs(): Promise<{ total: number; stored: number; byPlatform: Record<string, number> }> {
  console.log('[DM] Starting DM read cycle...');

  const byPlatform: Record<string, number> = {};
  const allMessages: IncomingDM[] = [];

  // Read from each platform sequentially (can't share browser contexts)
  const fanslyMsgs = await readFanslyDMs();
  byPlatform.fansly = fanslyMsgs.length;
  allMessages.push(...fanslyMsgs);

  const ofMsgs = await readOnlyFansDMs();
  byPlatform.onlyfans = ofMsgs.length;
  allMessages.push(...ofMsgs);

  const twitterMsgs = await readTwitterDMs();
  byPlatform.twitter = twitterMsgs.length;
  allMessages.push(...twitterMsgs);

  console.log(`[DM] Read ${allMessages.length} message(s) across ${Object.keys(byPlatform).length} platform(s)`);

  // Store and queue responses
  const stored = await storeAndQueueResponses(allMessages);

  return { total: allMessages.length, stored, byPlatform };
}

// Direct invocation
if (require.main === module) {
  readAllDMs().then(result => {
    console.log(`[DM] Done: ${result.total} read, ${result.stored} stored`);
    console.log(`[DM] By platform:`, result.byPlatform);
    process.exit(0);
  }).catch(err => {
    console.error('[DM] Fatal:', err);
    process.exit(1);
  });
}
