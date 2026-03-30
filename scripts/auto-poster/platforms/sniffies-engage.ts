/**
 * Sniffies Engagement — chat with nearby users.
 *
 * Sniffies is map-based. Engagement = reading incoming chats and replying,
 * plus initiating with users who viewed the profile.
 *
 * Voice: flirty, curious, warm. References the Handler and journey naturally.
 * Goal: build connections that drive interest in Maxy's other platforms.
 *
 * Run: npx tsx platforms/sniffies-engage.ts
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from '../config';
import { checkBudget, incrementBudget } from '../engagement-budget';
import { extractSafeText } from '../refusal-filter';

const USER_ID = process.env.USER_ID || '';

const MAXY_VOICE = `You are Maxy — a 40-year-old woman in transformation. Controlled by an AI Handler. Locked in chastity. On HRT. Flirty, warm, sexually confident but not crude. You're chatting on Sniffies, a cruising/hookup app. You're real, you're interested, you're fun to talk to.

Your goal is genuine connection. You're not selling anything. You mention the Handler, the cage, the denial — but only when it fits the conversation naturally. You're curious about them. You flirt. You tease. You're honest about what you are.`;

interface SniffiesChat {
  username: string;
  lastMessage: string;
  isUnread: boolean;
  chatUrl: string;
}

/**
 * Scrape the chat/inbox list on Sniffies.
 */
async function scrapeChats(page: Page): Promise<SniffiesChat[]> {
  const chats: SniffiesChat[] = [];

  try {
    // Try multiple possible message URLs — Sniffies is a SPA, routes may vary
    const urlsToTry = [
      'https://sniffies.com/messages',
      'https://sniffies.com/chats',
      'https://sniffies.com/inbox',
      'https://sniffies.com/conversations',
    ];

    let sniffUrl = '';
    for (const url of urlsToTry) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      await page.waitForTimeout(3000);
      sniffUrl = page.url();

      // If we didn't get redirected to homepage, this URL works
      if (sniffUrl !== 'https://sniffies.com/' && !sniffUrl.endsWith('sniffies.com')) {
        break;
      }
    }

    console.log(`  [debug] Sniffies page: ${sniffUrl}`);

    // Check if logged in — redirect to homepage = not logged in
    if (sniffUrl === 'https://sniffies.com/' || sniffUrl.endsWith('sniffies.com')) {
      console.error('[Sniffies] Not logged in or messages URL not found — landed on homepage');
      return [];
    }

    const loginPrompt = await page.locator('a[href*="login"], button:has-text("Log In"), button:has-text("Sign Up")').count();
    if (loginPrompt > 0 || sniffUrl.includes('login') || sniffUrl.includes('auth')) {
      console.error('[Sniffies] Not logged in — session expired');
      return [];
    }

    // Scrape chat list — Sniffies uses a conversation list
    const chatElements = await page.locator(
      '[class*="conversation"], [class*="chat-item"], [class*="message-thread"], [class*="inbox-item"]'
    ).all();
    console.log(`  [debug] Chat elements found: ${chatElements.length}`);

    // Fallback: try generic list items with links
    const elements = chatElements.length > 0
      ? chatElements
      : await page.locator('a[href*="/chat/"], a[href*="/messages/"], [class*="thread"]').all();
    if (chatElements.length === 0) {
      console.log(`  [debug] Fallback elements found: ${elements.length}`);
    }

    for (const el of elements.slice(0, 15)) {
      try {
        // Get username
        const nameEl = el.locator('[class*="name"], [class*="username"], strong, b').first();
        const username = await nameEl.textContent().catch(() => '') || '';

        // Get last message preview
        const previewEl = el.locator('[class*="preview"], [class*="last-message"], [class*="snippet"], p, span').first();
        const lastMessage = await previewEl.textContent().catch(() => '') || '';

        // Check if unread
        const unreadIndicator = el.locator('[class*="unread"], [class*="badge"], [class*="dot"]');
        const isUnread = await unreadIndicator.count() > 0;

        // Get chat link
        const link = el.locator('a').first();
        const href = await link.getAttribute('href').catch(() => '') ||
                     await el.getAttribute('href') || '';
        const chatUrl = href.startsWith('http') ? href : href ? `https://sniffies.com${href}` : '';

        if (username.trim() && chatUrl) {
          chats.push({
            username: username.trim(),
            lastMessage: lastMessage.trim().substring(0, 200),
            isUnread,
            chatUrl,
          });
        }
      } catch {
        // Skip problematic elements
      }
    }
  } catch (err) {
    console.error('[Sniffies] Chat scrape failed:', err instanceof Error ? err.message : err);
  }

  return chats;
}

/**
 * Read recent messages in a specific chat thread.
 */
async function readChatThread(page: Page, chatUrl: string): Promise<string[]> {
  const messages: string[] = [];

  try {
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Get recent messages
    const messageEls = await page.locator(
      '[class*="message"], [class*="chat-bubble"], [class*="msg-body"], [class*="chat-message"]'
    ).all();

    // Grab last 10 messages for context
    for (const msg of messageEls.slice(-10)) {
      const text = await msg.textContent().catch(() => '') || '';
      if (text.trim()) {
        messages.push(text.trim());
      }
    }
  } catch (err) {
    console.error('[Sniffies] Thread read failed:', err instanceof Error ? err.message : err);
  }

  return messages;
}

/**
 * Generate a chat reply.
 */
async function generateChatReply(
  client: Anthropic,
  username: string,
  recentMessages: string[],
  state: Record<string, unknown>,
): Promise<string | null> {
  const context = recentMessages.length > 0
    ? recentMessages.map((m, i) => `Message ${i + 1}: "${m}"`).join('\n')
    : '(New conversation — they viewed your profile or sent a first message)';

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `${MAXY_VOICE}

You are replying in a Sniffies chat with ${username}.

Write a message that:
1. RESPONDS to what they said — reference their actual words
2. Is flirty, warm, and real — this is a hookup app, sexual tension is fine
3. Shows genuine curiosity about them
4. Is 1-3 sentences — chat messages, not essays
5. Can mention the Handler, chastity, HRT, or denial if it fits naturally
6. Can mention your other platforms (Fansly, Twitter) ONLY if they ask what you do or want to see more
7. NEVER sounds scripted or like a bot
8. NEVER sends links unprompted
9. If it's a new conversation, be curious and warm — ask what caught their eye

${state.denialDay ? `Current state: day ${state.denialDay} of denial.` : ''}
${state.hrtDay ? `HRT day: ${state.hrtDay}.` : ''}`,
      messages: [{
        role: 'user',
        content: `Chat with ${username}:\n${context}\n\nWrite Maxy's next message. Output ONLY the message text.`,
      }],
    });

    return extractSafeText(response, 5, `Sniffies chat @${username}`);
  } catch (err) {
    console.error('[Sniffies] Reply generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Send a message in a Sniffies chat thread.
 */
async function sendChatMessage(page: Page, chatUrl: string, message: string): Promise<boolean> {
  try {
    // Make sure we're on the right chat
    if (!page.url().includes(chatUrl.replace('https://sniffies.com', ''))) {
      await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);
    }

    // Find message input
    const inputBox = page.locator(
      'textarea, input[type="text"][placeholder*="message" i], [contenteditable="true"], input[placeholder*="type" i]'
    ).last();
    await inputBox.waitFor({ timeout: 8000 });
    await inputBox.click();
    await page.waitForTimeout(500);
    await inputBox.pressSequentially(message, { delay: 25 });
    await page.waitForTimeout(1000);

    // Send — try Enter key first, then look for send button
    const sendButton = page.locator(
      'button:has-text("Send"), button[type="submit"], [class*="send-btn"], [class*="send-button"], [aria-label*="send" i]'
    ).first();

    const hasSendButton = await sendButton.isVisible().catch(() => false);
    if (hasSendButton) {
      await sendButton.click();
    } else {
      await inputBox.press('Enter');
    }

    await page.waitForTimeout(2000);
    return true;
  } catch (err) {
    console.error('[Sniffies] Send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Run a full Sniffies chat engagement cycle.
 */
export async function runSniffiesEngagement(
  page: Page,
  sb: typeof supabase,
  client: Anthropic,
  userId: string,
  state: Record<string, unknown>,
  maxReplies: number = 5,
): Promise<{ attempted: number; posted: number; failed: number }> {
  let attempted = 0;
  let posted = 0;
  let failed = 0;

  const hasBudget = await checkBudget(sb, userId, 'sniffies', 'chat');
  if (!hasBudget) {
    console.log('[Sniffies] Daily chat budget exhausted');
    return { attempted, posted, failed };
  }

  // Scrape inbox
  const chats = await scrapeChats(page);
  if (chats.length === 0) {
    console.log('[Sniffies] No chats found');
    return { attempted, posted, failed };
  }

  // Prioritize unread chats
  const sorted = [...chats].sort((a, b) => {
    if (a.isUnread && !b.isUnread) return -1;
    if (!a.isUnread && b.isUnread) return 1;
    return 0;
  });

  console.log(`[Sniffies] ${chats.length} chat(s) found, ${chats.filter(c => c.isUnread).length} unread`);

  for (const chat of sorted.slice(0, maxReplies)) {
    // Re-check budget each iteration
    const stillHasBudget = await checkBudget(sb, userId, 'sniffies', 'chat');
    if (!stillHasBudget) {
      console.log('[Sniffies] Budget exhausted mid-cycle');
      break;
    }

    console.log(`[Sniffies] Chatting with ${chat.username}${chat.isUnread ? ' (unread)' : ''}...`);
    attempted++;

    // Read the thread for context
    const recentMessages = await readChatThread(page, chat.chatUrl);

    // Generate reply
    const reply = await generateChatReply(client, chat.username, recentMessages, state);
    if (!reply) {
      console.log(`  ⊘ Reply generation failed`);
      failed++;
      continue;
    }

    console.log(`  Reply: "${reply.substring(0, 80)}..."`);

    // Send it
    const success = await sendChatMessage(page, chat.chatUrl, reply);
    if (success) {
      console.log(`  ✓ Sent to ${chat.username}`);
      posted++;
      await incrementBudget(sb, userId, 'sniffies', 'chat');

      // Log it
      await sb.from('ai_generated_content').insert({
        user_id: userId,
        content_type: 'chat_reply',
        platform: 'sniffies',
        content: reply,
        generation_strategy: 'sniffies_chat',
        target_account: chat.username,
        status: 'posted',
        posted_at: new Date().toISOString(),
      });
    } else {
      console.log(`  ✗ Send failed`);
      failed++;
    }

    // Rate limit — 15-30s between chats
    if (posted < maxReplies) {
      const delay = 15000 + Math.floor(Math.random() * 15000);
      console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { attempted, posted, failed };
}

// Direct invocation
if (require.main === module) {
  if (!USER_ID) {
    console.error('Missing USER_ID');
    process.exit(1);
  }

  const config = PLATFORMS.sniffies;
  if (!config.enabled) {
    console.error('Sniffies not enabled. Set ENABLE_SNIFFIES=true');
    process.exit(1);
  }

  const maxReplies = parseInt(process.argv[2] || '5', 10);
  console.log(`[Sniffies Engage] Starting chat cycle (max ${maxReplies})...\n`);

  (async () => {
    const anthropic = new Anthropic();
    let context: BrowserContext | null = null;

    try {
      context = await chromium.launchPersistentContext(config.profileDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--window-position=-2400,-2400',
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        geolocation: config.geolocation,
        permissions: ['geolocation'],
      });

      const page = context.pages()[0] || await context.newPage();

      const state: Record<string, unknown> = {};
      const { data: profile } = await supabase
        .from('handler_state')
        .select('denial_day, hrt_day')
        .eq('user_id', USER_ID)
        .single();
      if (profile) {
        state.denialDay = profile.denial_day;
        state.hrtDay = profile.hrt_day;
      }

      const result = await runSniffiesEngagement(page, supabase, anthropic, USER_ID, state, maxReplies);
      console.log(`\n[Sniffies Engage] Done: ${result.posted} sent, ${result.failed} failed out of ${result.attempted} attempted`);
    } catch (err) {
      console.error('Fatal:', err);
    } finally {
      if (context) await context.close();
    }

    process.exit(0);
  })();
}
