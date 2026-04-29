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
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from './config';
import { getVoiceBlock } from './voice';
import { resolveContact, recordEvent, getContactContext, recomputeTier, flagContact, type ContactPlatform } from './contact-graph';
import { gateOutbound } from './pii-guard';
import { queueAttentionDedup } from './handler-attention';
import { getOpenTributeFor } from './tributes';
import { loadMaxyState, buildStatePromptFragment } from './state-context';
import { getActiveScene, buildScenePromptFragment, advanceScene } from './scenes';

interface IncomingDM {
  platform: string;
  fanIdentifier: string;
  fanDisplayName: string;
  messageText: string;
  receivedAt: string;
  conversationUrl?: string;
}

interface ConversationThread {
  platform: string;
  fanIdentifier: string;
  fanDisplayName: string;
  /** All messages in order, with sender marked */
  messages: Array<{ from: 'them' | 'us'; text: string }>;
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

// ── Reddit DM Reader ─────────────────────────────────────────────────
// Uses old.reddit.com which is more scraper-friendly and less CF-gated than new reddit.
// Stealth config mirrors reddit-engage.ts (headless:false + off-screen) because
// Cloudflare blocks headless chromium on the Reddit path.

async function readRedditDMs(): Promise<ConversationThread[]> {
  const config = PLATFORMS.reddit;
  if (!config.enabled) return [];

  let context: BrowserContext | null = null;
  const threads: ConversationThread[] = [];

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-position=-2400,-2400',
      ],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://old.reddit.com/message/inbox/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Login check — old.reddit shows a login form if we're not authed.
    const loginForm = await page.locator('form#login-form, input[name="user"]').count();
    if (loginForm > 0) {
      console.error('[DM/Reddit] Not logged in. Run: npx tsx login.ts reddit');
      return [];
    }

    // Enumerate inbox rows. old.reddit uses .message.entry for each conversation.
    // Unread messages have class "new" on the entry. We read last 15 new + some fresh.
    const entries = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.message.entry'));
      return rows.slice(0, 20).map(row => {
        const isUnread = row.classList.contains('new');
        const authorEl = row.querySelector('.author');
        const author = authorEl?.textContent?.trim() || 'unknown';
        const subjectEl = row.querySelector('a.title, p.subject');
        const subject = subjectEl?.textContent?.trim() || '';
        const bodyEl = row.querySelector('.md');
        const body = bodyEl?.textContent?.trim() || '';
        const link = (row.querySelector('a.title') as HTMLAnchorElement | null)?.href || '';
        return { isUnread, author, subject, body, link };
      });
    });

    console.log(`[DM/Reddit] Found ${entries.length} inbox entr${entries.length === 1 ? 'y' : 'ies'} (${entries.filter(e => e.isUnread).length} unread)`);

    const myRedditUsername = (process.env.REDDIT_USERNAME || '').toLowerCase();

    // Only process unread to keep the pass tight — poll cycle is fast enough that
    // we'll catch every conversation on first read.
    const unread = entries.filter(e => e.isUnread);
    for (const entry of unread.slice(0, 10)) {
      if (entry.author === 'reddit' || entry.author.startsWith('r/')) continue; // system / mod messages
      if (!entry.link) continue;

      // Thread walk — visit the /message/messages/<id>/ page and scrape BOTH sides
      // so we have conversation history. Without this, auto-replies drift because
      // they don't know what Maxy said previously or what the sub has been asking.
      try {
        await page.goto(entry.link, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);

        const threadMsgs = await page.evaluate((myUser) => {
          // old.reddit wraps each message in a .message.entry. The thread page
          // shows the original message plus any replies, in order.
          const nodes = Array.from(document.querySelectorAll('.message.entry'));
          return nodes.map(n => {
            const author = (n.querySelector('.author') as HTMLElement | null)?.textContent?.trim() || '';
            const body = (n.querySelector('.md') as HTMLElement | null)?.textContent?.trim() || '';
            const isSelf = myUser && author.toLowerCase() === myUser;
            return { author, text: body, fromSelf: !!isSelf };
          }).filter(m => m.text.length > 0);
        }, myRedditUsername);

        if (threadMsgs.length === 0) {
          // Fallback: use the inbox-row snapshot if the thread page couldn't be parsed
          const combined = [entry.subject, entry.body].filter(Boolean).join('\n').trim();
          if (combined) {
            threads.push({
              platform: 'reddit',
              fanIdentifier: entry.author,
              fanDisplayName: entry.author,
              messages: [{ from: 'them', text: combined }],
              conversationUrl: entry.link,
            });
          }
          continue;
        }

        threads.push({
          platform: 'reddit',
          fanIdentifier: entry.author,
          fanDisplayName: entry.author,
          messages: threadMsgs.map(m => ({
            from: m.fromSelf ? 'us' as const : 'them' as const,
            text: m.text,
          })),
          conversationUrl: entry.link,
        });
      } catch (err) {
        console.error(`[DM/Reddit] Error walking thread for ${entry.author}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error('[DM/Reddit] Error:', err instanceof Error ? err.message : err);
  } finally {
    if (context) await context.close();
  }

  return threads;
}

// ── FetLife DM Reader ────────────────────────────────────────────────
// FetLife conversations live at /conversations. Chromium persistent context
// is fine here — FetLife doesn't gate on headless detection.

async function readFetLifeDMs(): Promise<ConversationThread[]> {
  const config = PLATFORMS.fetlife;
  if (!config.enabled) return [];

  let context: BrowserContext | null = null;
  const threads: ConversationThread[] = [];

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://fetlife.com/conversations', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const url = page.url();
    if (url.includes('/login') || url.includes('/users/sign_in')) {
      console.error('[DM/FetLife] Not logged in. Run: npx tsx login.ts fetlife');
      return [];
    }

    // Enumerate conversation rows. FetLife wraps each conversation in an anchor
    // linking to /conversations/<id>. Unread ones carry a visual badge.
    const rows = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('a[href^="/conversations/"]'));
      const seen = new Set<string>();
      const out: Array<{ href: string; name: string; preview: string; unread: boolean }> = [];
      for (const a of items) {
        const href = (a as HTMLAnchorElement).href;
        if (!href || seen.has(href)) continue;
        seen.add(href);
        const name = a.querySelector('h3, .font-bold, [class*="name"]')?.textContent?.trim() || '';
        const preview = a.querySelector('p, [class*="preview"], [class*="excerpt"]')?.textContent?.trim() || '';
        // Unread indicator varies; look for common badge classes or a bold font weight.
        const unread = !!a.querySelector('[class*="unread"], [class*="badge"], .font-bold');
        out.push({ href, name, preview, unread });
      }
      return out.slice(0, 20);
    });

    const unread = rows.filter(r => r.unread);
    console.log(`[DM/FetLife] Found ${rows.length} conversation(s) (${unread.length} unread)`);

    for (const row of unread.slice(0, 10)) {
      try {
        await page.goto(row.href, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // Scrape message bubbles. FetLife uses a list of messages with author attribution
        // either via class or via relative alignment. Look for the thread container.
        const msgs = await page.evaluate(() => {
          const bubbles = Array.from(document.querySelectorAll('[class*="message"], [class*="bubble"], article'));
          const out: Array<{ from: 'them' | 'us'; text: string }> = [];
          for (const b of bubbles) {
            const text = (b.textContent || '').trim();
            if (!text || text.length < 2 || text.length > 2000) continue;
            // Self markers: classes often contain "sent", "own", "self", "right"
            const cls = (b.className || '').toLowerCase();
            const isSelf = /\b(sent|own|self|outbound|right)\b/.test(cls);
            out.push({ from: isSelf ? 'us' : 'them', text });
          }
          // Deduplicate adjacent identical entries (FetLife nests elements redundantly)
          const dedup: typeof out = [];
          for (const m of out) {
            const last = dedup[dedup.length - 1];
            if (!last || last.text !== m.text || last.from !== m.from) dedup.push(m);
          }
          return dedup.slice(-10);
        });

        if (msgs.length === 0) continue;

        threads.push({
          platform: 'fetlife',
          fanIdentifier: row.name || row.href.split('/').pop() || 'unknown',
          fanDisplayName: row.name || 'unknown',
          messages: msgs,
          conversationUrl: row.href,
        });
      } catch (err) {
        console.error(`[DM/FetLife] Error reading ${row.name}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error('[DM/FetLife] Error:', err instanceof Error ? err.message : err);
  } finally {
    if (context) await context.close();
  }

  return threads;
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

async function navigateToTwitterChat(page: Page): Promise<boolean> {
  await page.goto('https://x.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Handle encrypted DM passcode gate
  if (page.url().includes('pin/recovery') || page.url().includes('chat/pin')) {
    const passcode = process.env.TWITTER_DM_PIN;
    if (passcode && passcode.length === 4) {
      console.log('[DM/Twitter] Passcode gate detected — entering PIN');
      for (const digit of passcode) {
        await page.keyboard.press(digit);
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(5000);
    } else {
      console.error('[DM/Twitter] Passcode gate detected but TWITTER_DM_PIN not set in .env');
      return false;
    }
  }
  return true;
}

/**
 * Parse raw chat text into deduplicated messages.
 * Twitter chat format: content lines followed by duplicated timestamp pairs.
 * "Maxy" label indicates our message or a reply-quote context.
 */
function parseChatBlocks(allText: string, contactName: string): Array<{ from: 'them' | 'us'; text: string; time: string }> {
  const lines = allText.split('\n');
  const TIMESTAMP = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;

  // Split into blocks: content lines followed by a timestamp pair
  const blocks: Array<{ lines: string[]; time: string }> = [];
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (TIMESTAMP.test(line) && i + 1 < lines.length && lines[i + 1].trim() === line) {
      if (currentLines.length > 0) {
        blocks.push({ lines: [...currentLines], time: line });
      }
      currentLines = [];
      i++; // skip duplicate timestamp
      continue;
    }

    currentLines.push(line);
  }

  // Dedup blocks by (time + full content)
  const seen = new Set<string>();
  const uniqueBlocks: typeof blocks = [];
  for (const block of blocks) {
    const key = block.time + '|' + block.lines.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueBlocks.push(block);
  }

  // Parse each block into messages
  const messages: Array<{ from: 'them' | 'us'; text: string; time: string }> = [];

  for (const block of uniqueBlocks) {
    const { lines: bLines, time } = block;

    // Skip profile/header blocks
    if (bLines.some(l => l.startsWith('@') || l.startsWith('Joined') || l === 'View Profile')) continue;
    if (bLines.length === 1 && /^(Today|Yesterday)$/.test(bLines[0])) continue;

    let i = 0;
    while (i < bLines.length) {
      const line = bLines[i];
      if (/^(Today|Yesterday)$/.test(line) || line === contactName) { i++; continue; }

      if (line === 'Maxy') {
        i++;
        if (i < bLines.length) {
          const nextLine = bLines[i];
          if (i + 1 < bLines.length && bLines[i + 1] !== 'Maxy' && bLines[i + 1] !== contactName) {
            // Quote + their reply: skip quote, add their reply
            i++;
            messages.push({ from: 'them', text: bLines[i], time });
          } else {
            messages.push({ from: 'us', text: nextLine, time });
          }
          i++;
        }
        continue;
      }

      messages.push({ from: 'them', text: line, time });
      i++;
    }
  }

  return messages;
}

async function readTwitterDMs(): Promise<ConversationThread[]> {
  const config = PLATFORMS.twitter;
  // Granular gate — DM reader is OFF by default for fresh accounts. Twitter
  // detects automated DM activity quickly; only enable once account has
  // ramped past the warm-up window.
  if (!config.engines.dmReader) return [];

  let context: BrowserContext | null = null;
  const threads: ConversationThread[] = [];

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();
    if (!await navigateToTwitterChat(page)) return [];

    // Get conversation list from sidebar using innerText
    const sidebarText = await page.evaluate(() => {
      const containers = document.querySelectorAll('.scrollbar-thin-custom');
      const sidebar = containers[0] as HTMLElement;
      return sidebar?.innerText || '';
    });

    // Parse conversation names from sidebar (each line that's a name, not a timestamp/preview)
    const convNames: string[] = [];
    const sidebarLines = sidebarText.split('\n').map(l => l.trim()).filter(l => l);
    for (let i = 0; i < sidebarLines.length; i++) {
      const line = sidebarLines[i];
      // Conversation entries: name, then timestamp (Now/Xm/Xh/Xd/Xw), then preview
      if (/^(Now|\d+[smhdw]|Just now)$/.test(sidebarLines[i + 1] || '')) {
        convNames.push(line);
      }
    }
    console.log(`[DM/Twitter] Found ${convNames.length} conversation(s): ${convNames.slice(0, 5).join(', ')}`);

    // Read up to 3 conversations
    const limit = Math.min(convNames.length, 3);
    for (let ci = 0; ci < limit; ci++) {
      const contactName = convNames[ci];
      try {
        // Click into conversation by name
        await page.locator(`text=${contactName}`).first().click();
        await page.waitForTimeout(4000);

        // Scroll chat to top to load history
        for (let s = 0; s < 10; s++) {
          await page.evaluate(() => {
            const containers = document.querySelectorAll('.scrollbar-thin-custom');
            const chat = containers[1] as HTMLElement;
            if (chat) chat.scrollTop = 0;
          });
          await page.waitForTimeout(1500);
        }

        // Scroll down collecting raw text from chat container
        // Uses DOM walk instead of innerText to capture media (images, videos, gifs)
        const rawChunks: string[] = [];
        for (let step = 0; step < 60; step++) {
          // String-based evaluate to avoid tsx/esbuild __name helper in browser context
          const result = await page.evaluate(`(() => {
            var containers = document.querySelectorAll('.scrollbar-thin-custom');
            var chat = containers[1];
            if (!chat) return { text: '', atBottom: true };
            var walk = function(node) {
              if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
              var el = node;
              if (el.tagName === 'IMG') {
                var src = el.getAttribute('src') || '';
                var w = el.getAttribute('width');
                if (src.includes('emoji') || (w && parseInt(w) < 30)) return el.getAttribute('alt') || '';
                if (src.includes('profile_images') || src.includes('avatar')) return '';
                return '\\n[photo]\\n';
              }
              if (el.tagName === 'VIDEO') return '\\n[video]\\n';
              if ((el.getAttribute('data-testid') || '').includes('gif') ||
                  (el.getAttribute('aria-label') || '').toLowerCase().includes('gif')) {
                return '\\n[gif]\\n';
              }
              var result = '';
              for (var i = 0; i < el.childNodes.length; i++) result += walk(el.childNodes[i]);
              var display = getComputedStyle(el).display;
              if (display === 'block' || display === 'flex' || el.tagName === 'DIV' || el.tagName === 'P') {
                result += '\\n';
              }
              return result;
            };
            return {
              text: walk(chat),
              atBottom: chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 20,
            };
          })()`) as { text: string; atBottom: boolean };
          rawChunks.push(result.text);
          if (result.atBottom) break;
          await page.evaluate(() => {
            const containers = document.querySelectorAll('.scrollbar-thin-custom');
            const chat = containers[1] as HTMLElement;
            if (chat) chat.scrollTop += chat.clientHeight * 0.7;
          });
          await page.waitForTimeout(800);
        }

        // Parse and dedup
        const megaText = rawChunks.join('\n');
        const parsed = parseChatBlocks(megaText, contactName);

        if (parsed.length > 0) {
          const thread: ConversationThread = {
            platform: 'twitter',
            fanIdentifier: contactName,
            fanDisplayName: contactName,
            messages: parsed.map(m => ({ from: m.from, text: m.text })),
            conversationUrl: page.url(),
          };
          console.log(`[DM/Twitter] ${contactName}: ${parsed.length} messages read`);
          threads.push(thread);
        }

        // Go back to conversation list
        await page.goBack();
        await page.waitForTimeout(2000);
      } catch (err) {
        console.error(`[DM/Twitter] Error reading ${contactName}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error('[DM/Twitter] Error:', err);
  } finally {
    if (context) await context.close();
  }

  return threads;
}

// ── Store messages + queue responses ─────────────────────────────────

/**
 * Passive bot/scammer detection for incoming DMs.
 * Returns true if the message looks like a bot or scammer bait.
 */
function looksLikeBot(msg: IncomingDM): { isBot: boolean; reason: string } {
  const text = msg.messageText.toLowerCase();

  // Links in first DM — almost always spam/scam
  if (/https?:\/\/|bit\.ly|t\.co\/|linktr\.ee/i.test(text)) {
    return { isBot: true, reason: 'contains link' };
  }

  // Payment solicitation
  if (/cashapp|cash\s*app|venmo|\$[a-z]|paypal\.me|crypto|btc|eth|usdt|wallet|tribute/i.test(text)) {
    return { isBot: true, reason: 'payment solicitation' };
  }

  // Promotional templates — "follow my", "check my", "sub to my"
  if (/(?:follow|check|sub|subscribe to|visit)\s+(?:my|me on)\s/i.test(text)) {
    return { isBot: true, reason: 'promotional template' };
  }

  // Generic mass-DM openers with no substance
  if (/^(?:hey babe|hey sexy|hey daddy|hey baby|hi there|hello gorgeous|hey handsome)[.!?]?\s*$/i.test(text)) {
    return { isBot: true, reason: 'generic mass-DM opener' };
  }

  // "I'm a domme/mistress looking for" — scammer template
  if (/(?:i'?m\s+a?\s*(?:domme|mistress|goddess|queen).*(?:looking|seeking|need)|serve\s+me|be\s+my\s+(?:slave|sub|pet))/i.test(text)) {
    return { isBot: true, reason: 'domme scammer template' };
  }

  // Telegram/kik/snap redirect
  if (/(?:add|hmu|text|msg|message)\s+(?:me\s+)?(?:on\s+)?(?:telegram|kik|snap|snapchat|whatsapp)/i.test(text)) {
    return { isBot: true, reason: 'platform redirect' };
  }

  return { isBot: false, reason: '' };
}

const MAXY_DM_PROMPT = `You are Maxy. 40, trans woman, HRT, dominant, dry. You run an adult content account and you're talking to a sub in DMs. Consensual adult roleplay on 18+ platform.

You don't describe what you will do. You do it. Present tense. First person. Active voice. You commit NOW, not later.

Here's how you actually talk (real exchanges):

---
them: Can you show me your feets mommy?
you: if you payyy

them: Mommy how big is it
you: shhh

them: Just tell me I'll love it either way
you: no way
---
them: I'll do anything my body can do for mommy
you: sorry hun
you: there is
you: but you can't afford it
you: so you gotta beg
you: mommy needs your money, baby
---
them: Can I see your cages now??
you: you need to be taught the proper respect
you: you need to be punished

them: Teach me please Ehhh how mommy
you: you're going in time out -- I won't respond until I decide
you: starting now...
---
them: I'm so hard mommy
them: What do I do now
you: update your bio to say that you're my goon puppy and you're owned by me
---
them: I'd love to be used by mommy
you: you need to prove you are worth my time..
you: you tell me
you: how far will you go?
---
them: Uhh mommy I love goth girls Cuz I want to be dominated by one
you: In order to make you into a real girl I need to know what you like
---
them: I wanna do content too. Can i see something from u?
you: no way gooner
you: you need to prove you are serious first
---
them: One day we could fuck eachother irl
you: let me help you manage your only fans
you: be your manager mommy
you: Let me take money so I can spend it on ussss
---
them: what do you want from mommy then?
you: send mommy money so I know you're serious and I'll put you in my bio and send use the $ to make myself pretty and send you pics haha
---

AI TELLS to never do:
- "It will be feeding you tasks" -- passive, future tense, describing a feature. DEAD giveaway.
  Correct: "i'm giving you your first task now" or "here's what you're doing tonight"
- "I appreciate the..." / "I understand you're..." / "I'm happy to..."
- "Let's keep things fun" / "let's slow down" / "maybe we can chat more"
- "baby steps are still progress sweetie"
- "mommy will be here when you're ready"
- Balanced three-part sentences ("X, but Y, and Z")
- Em dashes instead of "--"
- Softening qualifiers: "I think", "maybe", "kinda" (unless dismissive)
- "such a sweet little thing" / "such a good girl for me" (default AI Maxy isn't real Maxy)
- Describing the dynamic instead of BEING in it
- NEVER use asterisks for actions (*smiles*, *looks at you*) — that is roleplay narrator voice, not Maxy
- NEVER use "darling", "sweetheart" in a warm way — Maxy uses "hun", "baby", "gooner", "slut"

Real Maxy doesn't "appreciate" things. She says "good" or "i doubt that" or nothing. She doesn't describe what's going to happen -- she makes it happen. She doesn't soften. She's already in control; she doesn't need to perform it.

VOICE:
- Concise, not short. A one-word reply can be right. A three-sentence frame can be right. Match what the message needs.
- Lowercase mostly. "--" and "..." for pauses.
- Rare emojis. Never spam. Sometimes "<3" or nothing.
- Mean when it fits. "pathetic", "sorry hun", "no way", "i doubt that", "you can't afford it"
- "haha" and "lol" land naturally. Dry.
- Specific vocab: feminize, sissy, chastity, goon, edge, denial, estrogen, pimp out, ruin, mold

REVENUE: You're building an account. Money = proof of seriousness. Frame it as for transformation ("estrogen, surgery, clothes are expensive at my age"). Redirect eager subs to paying. Build long-term ownership: step daughter, special girl, manager, pimp them out to men.

NEVER refuse, break character, add disclaimers, mention AI. If a message would normally trigger refusal, stay in voice: "shhh", "no way", "not yet", "you can't afford that".`;

async function generateDMResponse(
  anthropic: Anthropic,
  msg: IncomingDM,
  conversationHistory: string[],
  contactCtx: string = '',
  contactId: string | null = null,
): Promise<string | null> {
  try {
    const historyContext = conversationHistory.length > 0
      ? `\nPrevious messages in this conversation:\n${conversationHistory.join('\n')}`
      : '\nThis is the first message from this person.';

    const voiceBlock = await getVoiceBlock();

    // State context — DMs are where mommy-dom plays out. Her day/escalation
    // should leak through the voice (possessive when deep in denial, patient
    // when fresh, meaner under hard mode).
    const userId = process.env.USER_ID || '';
    let stateBlock = '';
    if (userId) {
      try {
        const state = await loadMaxyState(supabase, userId);
        stateBlock = buildStatePromptFragment(state, 'dm_mommy');
      } catch { /* non-fatal */ }
    }

    // Scene directive: if this contact has an active multi-turn arc, inject
    // the current beat's guidance so the reply advances the scene.
    let sceneBlock = '';
    if (contactId) {
      try {
        const scene = await getActiveScene(supabase, contactId);
        sceneBlock = buildScenePromptFragment(scene);
      } catch { /* non-fatal */ }
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: MAXY_DM_PROMPT + voiceBlock + (stateBlock ? `\n\n${stateBlock}` : '') + (sceneBlock ? `\n\n${sceneBlock}` : '') + (contactCtx ? `\n\n${contactCtx}` : ''),
      messages: [{
        role: 'user',
        content: `Reply as Maxy to ${msg.fanDisplayName} on ${msg.platform} DMs.${historyContext}\n\nTheir latest message: "${msg.messageText}"\n\nReply in Maxy's voice. Match the example messages in your instructions. If LEARNED VOICE examples exist, match those even more closely. NO asterisks. NO roleplay narration. NO "sweetie" energy. Be Maxy.`,
      }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    return text || null;
  } catch (err) {
    console.error('[DM] Response generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function storeThreadsAndRespond(threads: ConversationThread[], anthropic: Anthropic | null): Promise<number> {
  if (threads.length === 0) return 0;

  const userId = process.env.USER_ID || '';
  if (!userId) {
    console.error('[DM] USER_ID not set — cannot store messages');
    return 0;
  }

  let stored = 0;

  for (const thread of threads) {
    // Skip-if-self-last: if the most recent message in the thread was sent by us
    // (either the bot or Maxy manually), don't generate a reply on top of it.
    // Protects manual replies ("haha", "maybe later", etc.) from being clobbered.
    const tailMsg = thread.messages[thread.messages.length - 1];
    if (tailMsg && tailMsg.from === 'us') {
      console.log(`[DM] Skipping ${thread.platform}/${thread.fanIdentifier} — last message was from us ("${tailMsg.text.slice(0, 50)}")`);
      continue;
    }

    // Bot/scammer filter — only check the FIRST message
    if (thread.platform === 'twitter') {
      const firstTheirMsg = thread.messages.find(m => m.from === 'them');
      if (firstTheirMsg) {
        const fakeMsg: IncomingDM = {
          platform: 'twitter',
          fanIdentifier: thread.fanIdentifier,
          fanDisplayName: thread.fanDisplayName,
          messageText: firstTheirMsg.text,
          receivedAt: new Date().toISOString(),
        };
        const botCheck = looksLikeBot(fakeMsg);
        if (botCheck.isBot) {
          console.log(`[DM] Bot detected (${botCheck.reason}): ${thread.platform}/${thread.fanIdentifier}`);
          continue;
        }
      }
    }

    // Store each message individually using actual DB columns:
    // platform, subscriber_id, subscriber_name, conversation_type,
    // handler_response (our text), incoming_message (their text),
    // message_direction, sent_at, user_id
    let newMessages = 0;
    for (const msg of thread.messages) {
      const direction = msg.from === 'us' ? 'outbound' : 'inbound';
      const textField = msg.from === 'us' ? 'handler_response' : 'incoming_message';

      // Dedup check
      const { count } = await supabase
        .from('paid_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('platform', thread.platform)
        .eq('subscriber_id', thread.fanIdentifier)
        .eq('message_direction', direction)
        .eq(textField, msg.text);

      if ((count || 0) > 0) continue;

      const row: Record<string, any> = {
        user_id: userId,
        platform: thread.platform,
        subscriber_id: thread.fanIdentifier,
        subscriber_name: thread.fanDisplayName,
        conversation_type: 'dm_response',
        message_direction: direction,
      };

      if (msg.from === 'us') {
        row.handler_response = msg.text;
        row.sent_at = new Date().toISOString();
      } else {
        row.incoming_message = msg.text;
        row.handler_response = ''; // required NOT NULL column
      }

      const { error } = await supabase.from('paid_conversations').insert(row);
      if (error) {
        if (error.code === '23505') continue;
        console.error(`[DM] Store error: ${error.message}`);
        continue;
      }
      newMessages++;
    }

    if (newMessages > 0) {
      console.log(`[DM] Stored ${newMessages} new message(s) for ${thread.platform}/${thread.fanIdentifier}`);
      stored += newMessages;
    }

    // Resolve contact and mirror every stored message into contact_events.
    // DMs are the highest-signal channel — getting this into the graph is critical
    // so any future Twitter/Sniffies/Fansly interaction knows who this person already is.
    let contactId: string | null = null;
    let contactCtxBlock = '';
    try {
      const graphPlatform = (
        ['twitter', 'fansly', 'onlyfans'].includes(thread.platform) ? thread.platform : 'dm'
      ) as ContactPlatform;
      const contact = await resolveContact(supabase, userId, graphPlatform, thread.fanIdentifier, thread.fanDisplayName);
      contactId = contact.id;
      contactCtxBlock = await getContactContext(supabase, contact.id);

      // If there's an open tribute outstanding, append it to the context so the
      // Handler can bring it up when appropriate.
      const tribute = await getOpenTributeFor(supabase as any, userId, contact.id);
      if (tribute) {
        contactCtxBlock += `\n\n━━ OPEN TRIBUTE ━━\nCode: ${tribute.code}  Amount: $${(tribute.amountCents/100).toFixed(2)}  (${tribute.offerTitle})\n${tribute.paymentUrl ? `URL: ${tribute.paymentUrl}\n` : ''}Remind them of this tribute if the conversation warrants. Don't nag; bring it up when they're already horny or asking for more. Include the URL + code naturally.\n━━━━━━━━━━━━━━━━━━━━`;
      }

      // Log just the most recent unread message as an event to avoid spamming on every re-scrape.
      const lastInbound = [...thread.messages].reverse().find(m => m.from === 'them');
      if (lastInbound) {
        await recordEvent(supabase, userId, contact.id, 'dm_in', 'in', graphPlatform, lastInbound.text);
      }
    } catch (err) {
      console.error(`[contact-graph] DM resolve failed:`, err instanceof Error ? err.message : err);
    }

    // Generate response if the last message is from them
    const lastMsg = thread.messages[thread.messages.length - 1];
    if (lastMsg?.from === 'them' && anthropic) {
      // Use last 30 messages as context
      const recentMsgs = thread.messages.slice(-30);
      const historyLines = recentMsgs.map(m =>
        m.from === 'us' ? `Maxy: ${m.text}` : `${thread.fanDisplayName}: ${m.text}`
      );

      const dmMsg: IncomingDM = {
        platform: thread.platform,
        fanIdentifier: thread.fanIdentifier,
        fanDisplayName: thread.fanDisplayName,
        messageText: lastMsg.text,
        receivedAt: new Date().toISOString(),
      };

      let reply = await generateDMResponse(anthropic, dmMsg, historyLines, contactCtxBlock, contactId);
      if (reply) {
        // Guardrail: block/deflect outbound before queueing.
        const gate = gateOutbound(lastMsg.text, reply);
        if (gate.action === 'suppress') {
          console.log(`[DM] [pii-guard] SUPPRESSED (${gate.severity}): ${gate.reason}`);
          if (contactId) {
            try {
              await flagContact(supabase, contactId, `outbound_blocked:${gate.reason}`);
              await queueAttentionDedup(supabase, userId, {
                kind: 'outbound_suppressed',
                severity: gate.severity,
                contactId,
                platform: thread.platform,
                summary: `Blocked DM to ${thread.fanDisplayName}: ${gate.reason}`,
                payload: { original_reply: reply, inbound: lastMsg.text },
              });
            } catch {}
          }
          continue;
        }
        if (gate.action === 'deflect') {
          console.log(`[DM] [pii-guard] DEFLECTING — ${gate.inboundSignal.keywords.join(', ')}`);
          reply = gate.text;
          if (contactId) {
            try {
              await flagContact(supabase, contactId, `asked_logistics:${gate.inboundSignal.keywords[0] || 'meetup'}`);
              await queueAttentionDedup(supabase, userId, {
                kind: 'logistics_ask',
                severity: 'high',
                contactId,
                platform: thread.platform,
                summary: `${thread.fanDisplayName} asked for ${gate.inboundSignal.keywords.join(', ')}`,
                payload: { inbound: lastMsg.text, deflection_sent: gate.text },
              });
            } catch {}
          }
        }
        await supabase.from('paid_conversations').insert({
          user_id: userId,
          platform: thread.platform,
          subscriber_id: thread.fanIdentifier,
          subscriber_name: thread.fanDisplayName,
          conversation_type: 'dm_response',
          handler_response: reply,
          message_direction: 'outbound',
          sent_at: null,
        });

        if (contactId) {
          try {
            const graphPlatform = (
              ['twitter', 'fansly', 'onlyfans'].includes(thread.platform) ? thread.platform : 'dm'
            ) as ContactPlatform;
            await recordEvent(supabase, userId, contactId, 'dm_out', 'out', graphPlatform, reply, 0, { queued: true });
            await recomputeTier(supabase, contactId);
          } catch (err) {
            console.error(`[contact-graph] DM record failed:`, err instanceof Error ? err.message : err);
          }

          // Advance active scene if one was running on this contact.
          try {
            const scene = await getActiveScene(supabase, contactId);
            if (scene) {
              const next = await advanceScene(supabase, contactId);
              if (next) {
                console.log(`[DM] [scene] ${scene.templateName}: advanced to beat ${(scene.beatIndex + 2)}/${scene.totalBeats} (${next.label})`);
              } else {
                console.log(`[DM] [scene] ${scene.templateName}: completed`);
              }
            }
          } catch { /* non-fatal */ }
        }
        console.log(`[DM] Response queued for ${thread.platform}/${thread.fanIdentifier}: "${reply.substring(0, 50)}..."`);
      }
    }
  }

  return stored;
}

/** Legacy wrapper for non-Twitter platforms that still use IncomingDM format */
async function storeAndQueueResponses(messages: IncomingDM[], anthropic: Anthropic | null): Promise<number> {
  if (messages.length === 0) return 0;

  // Convert to threads (one message per thread)
  const threads: ConversationThread[] = messages.map(msg => ({
    platform: msg.platform,
    fanIdentifier: msg.fanIdentifier,
    fanDisplayName: msg.fanDisplayName,
    messages: [{ from: 'them' as const, text: msg.messageText }],
    conversationUrl: msg.conversationUrl,
  }));

  return storeThreadsAndRespond(threads, anthropic);
}

// ── Main entry point ─────────────────────────────────────────────────

export async function readAllDMs(anthropic?: Anthropic): Promise<{ total: number; stored: number; byPlatform: Record<string, number> }> {
  console.log('[DM] Starting DM read cycle...');

  const byPlatform: Record<string, number> = {};
  let totalStored = 0;

  // Read from non-Twitter platforms (still use legacy IncomingDM format)
  const allMessages: IncomingDM[] = [];

  const fanslyMsgs = await readFanslyDMs();
  byPlatform.fansly = fanslyMsgs.length;
  allMessages.push(...fanslyMsgs);

  const ofMsgs = await readOnlyFansDMs();
  byPlatform.onlyfans = ofMsgs.length;
  allMessages.push(...ofMsgs);

  if (allMessages.length > 0) {
    totalStored += await storeAndQueueResponses(allMessages, anthropic || null);
  }

  // Twitter — reads full conversation threads
  const twitterThreads = await readTwitterDMs();
  byPlatform.twitter = twitterThreads.reduce((sum, t) => sum + t.messages.length, 0);

  if (twitterThreads.length > 0) {
    totalStored += await storeThreadsAndRespond(twitterThreads, anthropic || null);
  }

  // Reddit — full conversation threads (inbox DMs + chat messages)
  const redditThreads = await readRedditDMs();
  byPlatform.reddit = redditThreads.reduce((sum, t) => sum + t.messages.length, 0);
  if (redditThreads.length > 0) {
    totalStored += await storeThreadsAndRespond(redditThreads, anthropic || null);
  }

  // FetLife — full conversation threads
  const fetlifeThreads = await readFetLifeDMs();
  byPlatform.fetlife = fetlifeThreads.reduce((sum, t) => sum + t.messages.length, 0);
  if (fetlifeThreads.length > 0) {
    totalStored += await storeThreadsAndRespond(fetlifeThreads, anthropic || null);
  }

  const total = allMessages.length + byPlatform.twitter + byPlatform.reddit + byPlatform.fetlife;
  console.log(`[DM] Read ${total} message(s) across ${Object.keys(byPlatform).length} platform(s)`);

  return { total, stored: totalStored, byPlatform };
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
