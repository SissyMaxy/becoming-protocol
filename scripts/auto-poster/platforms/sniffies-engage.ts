/**
 * Sniffies Engagement — chat with nearby users.
 *
 * Sniffies is a map-based SPA. Everything happens on one page.
 * The chat panel is a sidebar opened via the chat bubble icon at bottom-left.
 * Chats are listed in "Recents" tab with username, preview, and unread badges.
 *
 * IMPORTANT: Must use real Chrome (channel: 'chrome') — Playwright's Chromium
 * gets blocked by Sniffies bot detection. Also needs geolocation permission.
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

const MAXY_REPLY_VOICE = `You are Maxy — a 40-year-old NB person on HRT, transitioning. Flirty, forward, sexually playful. You're on Sniffies, a cruising/hookup app. Your profile says NB and transitioning — people already know what they're getting.

You're replying to someone who messaged you. Be flirty, curious, and real. People on here often ask about your thong color — that's the vibe. Don't be precious about it. Be fun.

Keep messages SHORT — 1-2 sentences max. This is chat, not email.

BANNED PHRASES: "hits different", "energy", "honestly" as opener, "ngl", "the way..."`;

const MAXY_OPENER_VOICE = `You are Maxy — a 40-year-old NB person on HRT, transitioning. On Sniffies, a cruising/hookup app. Your profile is visible — NB, transitioning, kink-friendly.

You're sending a FIRST MESSAGE to someone nearby. They haven't messaged you. Be:
- Short: 1 sentence max. This is a hookup app, not a love letter.
- Flirty but not desperate. You're interested, not begging.
- Specific if possible — reference something from their profile pic or status.
- Casual. "hey" is fine. A question is better. Something playful is best.

Do NOT: Sound like a bot. Send a form letter. Be overly sexual in the opener. Write more than 1-2 sentences.

Examples of good openers:
- "you look like trouble and i'm into it"
- "that jawline though 👀"
- "hey, you close? your pic caught my eye"
- "cute. what are you looking for tonight"

Output ONLY the message text.`;

interface SniffiesChat {
  username: string;
  lastMessage: string;
  isUnread: boolean;
  index: number; // position in the chat list for clicking
}

/**
 * Open the chat panel if it's not already visible.
 */
async function openChatPanel(page: Page): Promise<boolean> {
  try {
    // Check if chat panel is already open (look for "Recents" text)
    const recentsVisible = await page.locator('text=Recents').isVisible().catch(() => false);
    if (recentsVisible) return true;

    // Click the chat bubble icon at bottom-left of the screen
    // It's typically a speech bubble SVG in the bottom nav
    const chatIcon = page.locator(
      'button:near(:text("PLUS")):left-of(:text("PLUS")), ' +
      'a:near(:text("PLUS")):left-of(:text("PLUS")), ' +
      '[class*="chat-trigger"], ' +
      '[class*="messages-trigger"]'
    ).first();

    // Fallback: look for the bottom-left icon area
    if (await chatIcon.isVisible().catch(() => false)) {
      await chatIcon.click({ force: true });
      await page.waitForTimeout(2000);
      return true;
    }

    // Try clicking the bottom-left area where the chat icon lives
    // Based on the screenshot, it's at approximately (125, 770)
    await page.click('body', { position: { x: 125, y: 770 } });
    await page.waitForTimeout(2000);

    // Verify the panel opened
    const opened = await page.locator('text=Recents').isVisible().catch(() => false);
    return opened;
  } catch {
    return false;
  }
}

/**
 * Scrape chat list from the open sidebar panel.
 */
async function scrapeChats(page: Page): Promise<SniffiesChat[]> {
  const chats: SniffiesChat[] = [];

  try {
    // Go to Sniffies main page
    await page.goto('https://sniffies.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log(`  [debug] Sniffies page: ${currentUrl}`);

    // Check for login (if redirected away or login prompts appear)
    const loginBtns = await page.locator('button:has-text("Log In"), button:has-text("Sign Up"), button:has-text("Sign In")').count();
    if (loginBtns > 0) {
      console.error('[Sniffies] Login prompt detected — session expired');
      return [];
    }

    // Check if logged in — URL /map or no login buttons means authenticated
    const isLoggedIn = currentUrl.includes('/map') || loginBtns === 0;
    if (!isLoggedIn) {
      console.error('[Sniffies] Not logged in');
      return [];
    }
    console.log(`  [debug] Logged in, opening chat panel...`);

    // Open the chat panel
    const panelOpened = await openChatPanel(page);
    if (!panelOpened) {
      console.error('[Sniffies] Could not open chat panel');
      return [];
    }

    // Click "Unread" filter to prioritize unread messages
    // Sniffies has an active-indicator overlay that intercepts clicks — use force
    const unreadFilter = page.locator('text=Unread').first();
    if (await unreadFilter.isVisible().catch(() => false)) {
      await unreadFilter.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // Scrape chat list items
    // Based on the screenshot: each chat has an avatar, username, timestamp, and message preview
    // The chat items are in a scrollable list under the Recents/Screened/Unread filters
    const chatItems = await page.locator(
      '[class*="conversation"], [class*="chat-item"], [class*="chat-list"] > *, [class*="message-list"] > *'
    ).all();
    console.log(`  [debug] Chat items (class-based): ${chatItems.length}`);

    if (chatItems.length > 0) {
      for (let i = 0; i < Math.min(chatItems.length, 10); i++) {
        try {
          const item = chatItems[i];
          // Extract text content — should have username and message preview
          const fullText = await item.textContent().catch(() => '') || '';

          // Skip promotional items (So.Gay, Sniffies Plus, etc.)
          if (fullText.includes('So.Gay') || fullText.includes('Sniffies Plus') || fullText.includes('Upgrade')) continue;

          // Try to find username and message within the item
          const strongEl = item.locator('strong, b, [class*="name"]').first();
          const username = await strongEl.textContent().catch(() => '') || '';

          // Get the message preview — usually the last text element
          const spans = await item.locator('span, p, div').allTextContents().catch(() => []);
          const lastMessage = spans.filter(s => s.trim().length > 1 && !s.includes('ago') && s !== username.trim()).pop() || '';

          // Check for unread indicator (NEW badge, dot, etc.)
          const hasNew = fullText.includes('NEW') || await item.locator('[class*="unread"], [class*="badge"], [class*="new"]').count() > 0;

          if (username.trim()) {
            chats.push({
              username: username.trim(),
              lastMessage: lastMessage.trim().substring(0, 200),
              isUnread: hasNew,
              index: i,
            });
          }
        } catch {
          continue;
        }
      }
    }

    // If class-based didn't work, try a different approach — look for the list area
    // and grab items by structure
    if (chats.length === 0) {
      console.log(`  [debug] Trying alternate scrape method...`);

      // Take screenshot for debugging
      await page.screenshot({ path: '.debug-sniffies-chats.png' });

      // Try grabbing all elements that look like chat entries (have timestamps)
      const timeElements = await page.locator('text=/\\d+ minutes? ago|\\d+ hours? ago|a few seconds ago/').all();
      console.log(`  [debug] Found ${timeElements.length} time indicators (chat entries)`);

      for (let i = 0; i < Math.min(timeElements.length, 10); i++) {
        try {
          // Go up to the parent chat item
          const parent = timeElements[i].locator('xpath=ancestor::*[3]');
          const fullText = await parent.textContent().catch(() => '') || '';

          if (fullText.includes('So.Gay') || fullText.includes('Sniffies Plus')) continue;

          // Find username-like text (before the timestamp)
          const parts = fullText.split(/\d+ (minutes?|hours?|seconds?) ago/);
          const beforeTime = parts[0]?.trim() || '';

          // The username is typically a short word before the message
          const lines = beforeTime.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          const username = lines.find(l => l.length > 0 && l.length < 30 && !l.includes('NEW')) || '';
          const lastMsg = lines.filter(l => l !== username && !l.includes('NEW')).pop() || '';

          if (username) {
            chats.push({
              username,
              lastMessage: lastMsg.substring(0, 200),
              isUnread: fullText.includes('NEW'),
              index: i,
            });
          }
        } catch {
          continue;
        }
      }
    }

    // Switch back to "Recents" if we filtered to "Unread"
    const recentsTab = page.locator('text=Recents').first();
    if (await recentsTab.isVisible().catch(() => false)) {
      await recentsTab.click({ force: true });
      await page.waitForTimeout(500);
    }

  } catch (err) {
    console.error('[Sniffies] Chat scrape failed:', err instanceof Error ? err.message : err);
  }

  return chats;
}

/**
 * Click into a specific chat and read recent messages.
 */
async function readAndReplyChat(
  page: Page,
  chat: SniffiesChat,
  client: Anthropic,
  state: Record<string, unknown>,
): Promise<{ success: boolean; reply?: string }> {
  try {
    // Find and click the chat item by looking for the username text
    const chatItem = page.locator(`text="${chat.username}"`).first();
    if (!await chatItem.isVisible().catch(() => false)) {
      console.log(`  Could not find chat item for ${chat.username}`);
      return { success: false };
    }

    await chatItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Read the recent messages in the chat thread
    // Messages are typically in a scrollable area with bubbles
    const messageEls = await page.locator(
      '[class*="message"], [class*="bubble"], [class*="chat-msg"], [class*="msg-text"]'
    ).all();

    const messages: string[] = [];
    for (const msg of messageEls.slice(-10)) {
      const text = await msg.textContent().catch(() => '') || '';
      if (text.trim() && text.trim().length > 1) {
        messages.push(text.trim());
      }
    }

    console.log(`  [debug] Read ${messages.length} messages in chat with ${chat.username}`);

    // Generate reply
    const context = messages.length > 0
      ? messages.map((m, i) => `${i + 1}: "${m}"`).join('\n')
      : '(New conversation — they messaged you first)';

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `${MAXY_REPLY_VOICE}\n\nYou are replying in a Sniffies chat with "${chat.username}".\n${state.denialDay ? `You're on day ${state.denialDay} of denial.` : ''}`,
      messages: [{
        role: 'user',
        content: `Chat with ${chat.username}:\n${context}\n\nWrite Maxy's reply. Output ONLY the message.`,
      }],
    });

    const reply = extractSafeText(response, 3, `Sniffies @${chat.username}`);
    if (!reply) return { success: false };

    console.log(`  Reply: "${reply}"`);

    // Find the message input and type
    const inputBox = page.locator(
      'textarea, input[type="text"], [contenteditable="true"], input[placeholder*="message" i], input[placeholder*="type" i]'
    ).last();

    const hasInput = await inputBox.isVisible().catch(() => false);
    if (!hasInput) {
      console.error(`  [debug] No message input found in chat`);
      return { success: false };
    }

    await inputBox.click();
    await page.waitForTimeout(300);
    await inputBox.pressSequentially(reply, { delay: 25 });
    await page.waitForTimeout(500);

    // Send — try send button, then Enter key
    const sendBtn = page.locator(
      'button[type="submit"], button:has-text("Send"), [class*="send"], [aria-label*="send" i]'
    ).first();

    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click();
    } else {
      await inputBox.press('Enter');
    }
    await page.waitForTimeout(1500);

    return { success: true, reply };
  } catch (err) {
    console.error(`[Sniffies] Chat interaction failed:`, err instanceof Error ? err.message : err);
    return { success: false };
  }
}

/**
 * Get list of usernames we've already messaged on Sniffies (never double-message).
 */
async function getContactedUsers(sb: typeof supabase, userId: string): Promise<Set<string>> {
  const { data } = await sb
    .from('ai_generated_content')
    .select('target_account')
    .eq('user_id', userId)
    .eq('platform', 'sniffies')
    .in('status', ['posted', 'failed'])
    .order('posted_at', { ascending: false })
    .limit(200);

  const users = new Set<string>();
  for (const row of data || []) {
    if (row.target_account) users.add(row.target_account.toLowerCase());
  }
  return users;
}

/**
 * Browse the map and reach out to nearby cruisers.
 * Clicks profile bubbles, views profile, sends a short opener if they look like a match.
 */
async function outreachToNearbyCruisers(
  page: Page,
  client: Anthropic,
  sb: typeof supabase,
  userId: string,
  contactedUsers: Set<string>,
  maxOutreach: number = 2,
): Promise<{ sent: number }> {
  let sent = 0;

  try {
    // Make sure we're on the map view (close any open chat panel)
    await page.goto('https://sniffies.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Find profile markers/bubbles on the map
    // Sniffies shows circular profile pics on the map
    const profileBubbles = await page.locator(
      '[class*="marker"], [class*="avatar"], [class*="profile-pic"], [class*="user-bubble"], ' +
      'img[class*="avatar"], [class*="map-user"], [class*="cruiser"]'
    ).all();

    console.log(`  [debug] Map profile markers found: ${profileBubbles.length}`);

    if (profileBubbles.length === 0) {
      // Try clicking on visible profile images on the map
      const mapImages = await page.locator('img[src*="profile"], img[src*="avatar"], img[src*="thumb"]').all();
      console.log(`  [debug] Map images found: ${mapImages.length}`);
    }

    // Click on nearby profiles and check them out
    // Use the profile bubbles that are closest to center (where "You" marker is)
    const shuffled = [...profileBubbles].sort(() => Math.random() - 0.5);

    for (const bubble of shuffled.slice(0, maxOutreach * 3)) {
      if (sent >= maxOutreach) break;

      try {
        // Click the profile bubble
        await bubble.click({ force: true, timeout: 3000 });
        await page.waitForTimeout(2000);

        // Look for profile info that popped up
        const profileName = await page.locator(
          '[class*="profile-name"], [class*="username"], [class*="display-name"], ' +
          '[class*="user-info"] [class*="name"], h2, h3'
        ).first().textContent().catch(() => '') || '';

        const username = profileName.trim();
        if (!username || username.length < 2) {
          // Close popup and try next
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          continue;
        }

        // Skip if already contacted
        if (contactedUsers.has(username.toLowerCase())) {
          console.log(`  ⊘ Already contacted ${username}, skipping`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          continue;
        }

        console.log(`  [outreach] Found: ${username}`);

        // Look for a message button on the profile popup
        const msgBtn = page.locator(
          'button:has-text("Message"), button:has-text("Chat"), ' +
          '[class*="message-btn"], [class*="chat-btn"], ' +
          '[aria-label*="message" i], [aria-label*="chat" i]'
        ).first();

        const hasMsgBtn = await msgBtn.isVisible().catch(() => false);
        if (!hasMsgBtn) {
          console.log(`    No message button found, skipping`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          continue;
        }

        // Generate an opener
        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 80,
          system: MAXY_OPENER_VOICE,
          messages: [{
            role: 'user',
            content: `Send a first message to "${username}" on Sniffies. Output ONLY the message.`,
          }],
        });

        const opener = extractSafeText(response, 3, `Sniffies opener @${username}`);
        if (!opener) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          continue;
        }

        // Click message button
        await msgBtn.click({ force: true });
        await page.waitForTimeout(2000);

        // Type and send
        const inputBox = page.locator(
          'textarea, input[type="text"], [contenteditable="true"], ' +
          'input[placeholder*="message" i], input[placeholder*="type" i]'
        ).last();

        const hasInput = await inputBox.isVisible().catch(() => false);
        if (!hasInput) {
          console.log(`    No chat input found after clicking message`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          continue;
        }

        await inputBox.click();
        await page.waitForTimeout(300);
        await inputBox.pressSequentially(opener, { delay: 25 });
        await page.waitForTimeout(500);

        // Send
        const sendBtn = page.locator(
          'button[type="submit"], button:has-text("Send"), [class*="send"], [aria-label*="send" i]'
        ).first();

        if (await sendBtn.isVisible().catch(() => false)) {
          await sendBtn.click();
        } else {
          await inputBox.press('Enter');
        }
        await page.waitForTimeout(1500);

        console.log(`  ✓ Sent opener to ${username}: "${opener}"`);
        sent++;
        contactedUsers.add(username.toLowerCase());

        // Log it
        await sb.from('ai_generated_content').insert({
          user_id: userId,
          content_type: 'chat_reply',
          platform: 'sniffies',
          content: opener,
          generation_strategy: 'sniffies_outreach',
          target_account: username,
          status: 'posted',
          posted_at: new Date().toISOString(),
        });

        // Rate limit between outreach messages
        const delay = 15000 + Math.floor(Math.random() * 15000);
        await new Promise(r => setTimeout(r, delay));

      } catch {
        // Profile interaction failed, try next
        try { await page.keyboard.press('Escape'); } catch {}
        await page.waitForTimeout(500);
        continue;
      }
    }
  } catch (err) {
    console.error('[Sniffies] Outreach failed:', err instanceof Error ? err.message : err);
  }

  return { sent };
}

/**
 * Run a full Sniffies engagement cycle: reply to chats + outreach to nearby cruisers.
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

  // Load contacted users to avoid double-messaging
  const contactedUsers = await getContactedUsers(sb, userId);

  // --- Phase 1: Reply to existing chats ---
  const chats = await scrapeChats(page);
  if (chats.length > 0) {
    // Prioritize unread
    const sorted = [...chats].sort((a, b) => {
      if (a.isUnread && !b.isUnread) return -1;
      if (!a.isUnread && b.isUnread) return 1;
      return 0;
    });

    const unreadCount = chats.filter(c => c.isUnread).length;
    console.log(`[Sniffies] ${chats.length} chat(s), ${unreadCount} unread`);

    for (const chat of sorted.slice(0, maxReplies)) {
      const stillHasBudget = await checkBudget(sb, userId, 'sniffies', 'chat');
      if (!stillHasBudget) break;

      console.log(`[Sniffies] Replying to ${chat.username}${chat.isUnread ? ' (unread)' : ''}...`);
      attempted++;

      const result = await readAndReplyChat(page, chat, client, state);
      if (result.success && result.reply) {
        console.log(`  ✓ Replied to ${chat.username}`);
        posted++;
        contactedUsers.add(chat.username.toLowerCase());
        await incrementBudget(sb, userId, 'sniffies', 'chat');

        await sb.from('ai_generated_content').insert({
          user_id: userId,
          content_type: 'chat_reply',
          platform: 'sniffies',
          content: result.reply,
          generation_strategy: 'sniffies_chat',
          target_account: chat.username,
          status: 'posted',
          posted_at: new Date().toISOString(),
        });
      } else {
        console.log(`  ✗ Failed`);
        failed++;
      }

      const delay = 10000 + Math.floor(Math.random() * 10000);
      console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  } else {
    console.log('[Sniffies] No existing chats to reply to');
  }

  // --- Phase 2: Outreach to nearby cruisers (max 2 per cycle) ---
  const outreachBudget = await checkBudget(sb, userId, 'sniffies', 'chat');
  if (outreachBudget) {
    console.log('[Sniffies] Browsing map for nearby cruisers...');
    const outreach = await outreachToNearbyCruisers(page, client, sb, userId, contactedUsers, 2);
    if (outreach.sent > 0) {
      posted += outreach.sent;
      attempted += outreach.sent;
      console.log(`[Sniffies] Outreach: ${outreach.sent} openers sent`);
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
    console.error('Sniffies not enabled');
    process.exit(1);
  }

  const max = parseInt(process.argv[2] || '5', 10);
  console.log(`[Sniffies Engage] Starting (max ${max})...\n`);

  (async () => {
    const anthropic = new Anthropic();
    let context: BrowserContext | null = null;

    try {
      // Use real Chrome for Sniffies
      try {
        context = await chromium.launchPersistentContext(config.profileDir, {
          channel: 'chrome',
          headless: false,
          viewport: { width: 1280, height: 800 },
          args: ['--disable-blink-features=AutomationControlled', '--window-position=-2400,-2400'],
          ignoreDefaultArgs: ['--enable-automation'],
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          geolocation: config.geolocation,
          permissions: ['geolocation'],
        });
      } catch {
        context = await chromium.launchPersistentContext(config.profileDir, {
          headless: false,
          viewport: { width: 1280, height: 800 },
          args: ['--disable-blink-features=AutomationControlled', '--window-position=-2400,-2400'],
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          geolocation: config.geolocation,
          permissions: ['geolocation'],
        });
      }

      const page = context.pages()[0] || await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

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

      const result = await runSniffiesEngagement(page, supabase, anthropic, USER_ID, state, max);
      console.log(`\n[Sniffies] Done: ${result.posted} sent, ${result.failed} failed`);
    } catch (err) {
      console.error('Fatal:', err);
    } finally {
      if (context) await context.close();
    }

    process.exit(0);
  })();
}
