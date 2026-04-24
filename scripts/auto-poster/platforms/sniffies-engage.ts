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
import { resolveContact, recordEvent, getContactContext, recomputeTier, flagContact } from '../contact-graph';
import { gateOutbound } from '../pii-guard';
import { queueAttentionDedup } from '../handler-attention';
import { extractContactIntelligence } from '../contact-intelligence';
import { buildMaxyVoiceSystem } from '../voice-system';
import { loadMaxyState, buildStatePromptFragment } from '../state-context';
import { loadMaxyFactsBlock, needsMaxyInput } from '../grounded-facts';
import { consumePendingForChat, markPendingSent, markPendingFailed } from '../pending-outbound-sender';

const USER_ID = process.env.USER_ID || '';

const MAXY_REPLY_VOICE = `You are Maxy — a 40-year-old trans woman on HRT. Flirty, forward, sexually playful. You're on Sniffies, a cruising/hookup app. Your profile says trans and transitioning — people already know what they're getting.

You're replying to someone who messaged you. Be flirty, curious, and real. People on here often ask about your thong color — that's the vibe. Don't be precious about it. Be fun.

Keep messages SHORT — 1-2 sentences max. This is chat, not email.

BANNED PHRASES: "hits different", "energy", "honestly" as opener, "ngl", "the way..."`;

const MAXY_OPENER_VOICE = `You are Maxy — a 40-year-old trans woman on HRT. On Sniffies, a cruising/hookup app. Your profile is visible — trans, transitioning, kink-friendly.

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

/**
 * Strip meta-commentary from model outputs. Haiku occasionally leaks its
 * reasoning before the actual reply — e.g.:
 *   "they seem checked out, maybe respond with something light. something like:
 *
 *    nah just vibing. what're you into?"
 *
 * We want only the last line here. This runs as a belt-and-braces gate after
 * the prompt-level instruction to prevent meta-commentary.
 */
function stripMetaCommentary(text: string): string {
  let t = text.trim();

  // If there's an explicit "something like:" marker (with or without colon),
  // take everything after it.
  const markers = [
    /something like\s*:\s*\n?/i,
    /here'?s (?:a |her |what she'?d say):?\s*\n?/i,
    /the reply\s*:\s*\n?/i,
    /her message\s*:\s*\n?/i,
  ];
  for (const m of markers) {
    const idx = t.search(m);
    if (idx >= 0) {
      const after = t.slice(idx).replace(m, '').trim();
      if (after.length >= 2) t = after;
    }
  }

  // If the output has multiple paragraphs and the first paragraph looks like
  // meta-reasoning (starts with "they", "looks like", "maybe", etc.), keep only
  // the last non-empty paragraph as the reply.
  const paras = t.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paras.length >= 2) {
    const metaOpeners = /^(they\b|looks like|maybe|seems like|it sounds|i'd|honestly i|you could|the best)/i;
    if (metaOpeners.test(paras[0])) {
      t = paras[paras.length - 1];
    }
  }

  // Strip wrapping quotes if present — model sometimes wraps the reply in "..."
  t = t.replace(/^["'`](.+)["'`]$/s, '$1').trim();

  return t;
}

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

    // We may be inside a single conversation — try clicking a back/close button
    // to return to the chat list. Common patterns: arrow icon, "Back", "Close", "<".
    const backBtn = page.locator(
      'button[aria-label*="back" i], a[aria-label*="back" i], ' +
      'button[aria-label*="close" i], button:has-text("Back"), ' +
      '[class*="back-button"], [class*="back-btn"], [class*="chat-header"] button:first-child'
    ).first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
      const recentsAfter = await page.locator('text=Recents').isVisible().catch(() => false);
      if (recentsAfter) return true;
    }

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
 * Uses page.evaluate with innerText parsing — Sniffies uses hashed class names
 * so CSS selectors are unreliable. Instead we walk the DOM structurally.
 */
async function scrapeChats(page: Page): Promise<SniffiesChat[]> {
  const chats: SniffiesChat[] = [];

  try {
    // Go to Sniffies main page
    await page.goto('https://sniffies.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log(`  [debug] Sniffies page: ${currentUrl}`);

    // Check for login
    const loginBtns = await page.locator('button:has-text("Log In"), button:has-text("Sign Up"), button:has-text("Sign In")').count();
    if (loginBtns > 0) {
      console.error('[Sniffies] Login prompt detected — session expired');
      return [];
    }

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

    await page.waitForTimeout(2000);

    // Take a debug screenshot every time so we can iterate on selectors
    await page.screenshot({ path: '.debug-sniffies-chats.png' });

    // Use evaluate to dump the chat panel structure from inside the browser
    // This avoids all the class-name guessing
    const rawChats = await page.evaluate(`(() => {
      // Strategy: find all elements containing timestamp patterns like "X ago"
      // then walk up to find the chat entry container, extract username + preview
      var results = [];
      var timeRegex = /(\\d+\\s+(seconds?|minutes?|hours?|days?)\\s+ago|a few seconds ago|just now)/i;
      var seen = new Set();

      // Walk all text nodes to find timestamps
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var node;
      while (node = walker.nextNode()) {
        var text = (node.textContent || '').trim();
        if (!timeRegex.test(text)) continue;

        // Walk up to find the clickable chat entry (usually 3-6 levels up)
        var entry = node.parentElement;
        for (var up = 0; up < 6 && entry; up++) {
          // Chat entries are typically 150-400px tall list items
          var rect = entry.getBoundingClientRect();
          if (rect.height > 40 && rect.height < 200 && rect.width > 100) break;
          entry = entry.parentElement;
        }
        if (!entry) continue;

        // Deduplicate by element reference
        var key = entry.innerText;
        if (seen.has(key)) continue;
        seen.add(key);

        var innerLines = entry.innerText.split('\\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });

        // Skip promo items
        var fullText = entry.innerText;
        if (fullText.includes('Sniffies Plus') || fullText.includes('So.Gay') || fullText.includes('Cruise Without') || fullText.includes('Upgrade')) continue;

        // Parse: typically lines are [username, timestamp, message_preview] or [prefix "from", username, timestamp, preview]
        var username = '';
        var preview = '';
        var isUnread = fullText.includes('NEW') || fullText.includes('new message');

        // Filter out timestamp lines and "from" prefix
        var contentLines = innerLines.filter(function(l) {
          return !timeRegex.test(l) && l !== 'NEW' && l !== 'from' && l !== 'Recents' && l !== 'Screened' && l !== 'Unread';
        });

        // "from Anonymous Cruiser" pattern — merge "from" prefix
        for (var i = 0; i < contentLines.length; i++) {
          if (contentLines[i].toLowerCase().startsWith('from ')) {
            contentLines[i] = contentLines[i].substring(5).trim();
          }
        }

        if (contentLines.length >= 2) {
          username = contentLines[0];
          preview = contentLines[contentLines.length - 1];
        } else if (contentLines.length === 1) {
          username = contentLines[0];
        }

        // Skip if username is too long (probably scraped a whole paragraph)
        if (username && username.length < 40) {
          results.push({
            username: username,
            lastMessage: preview.substring(0, 200),
            isUnread: isUnread,
            innerText: fullText.substring(0, 300),
          });
        }
      }
      return results;
    })()`) as Array<{ username: string; lastMessage: string; isUnread: boolean; innerText: string }>;

    console.log(`  [debug] evaluate found ${rawChats.length} chat entries`);
    for (let i = 0; i < rawChats.length; i++) {
      const c = rawChats[i];
      console.log(`  [debug]   ${i}: "${c.username}" ${c.isUnread ? '(unread)' : ''} — "${c.lastMessage.substring(0, 50)}"`);
      chats.push({
        username: c.username,
        lastMessage: c.lastMessage,
        isUnread: c.isUnread,
        index: i,
      });
    }

    // If evaluate found nothing, fall back to innerText dump of the left panel for debugging
    if (chats.length === 0) {
      const panelText = await page.evaluate(`(() => {
        // The chat panel is typically the left sidebar — find the narrower panel
        var panels = document.querySelectorAll('div, aside, nav, section');
        for (var i = 0; i < panels.length; i++) {
          var el = panels[i];
          var rect = el.getBoundingClientRect();
          if (rect.left < 50 && rect.width > 200 && rect.width < 500 && rect.height > 400) {
            return el.innerText.substring(0, 2000);
          }
        }
        return '(no panel found)';
      })()`) as string;
      console.log(`  [debug] Left panel text dump:\n${panelText.substring(0, 500)}`);
    }

  } catch (err) {
    console.error('[Sniffies] Chat scrape failed:', err instanceof Error ? err.message : err);
  }

  return chats;
}

/**
 * Click into a specific chat and read recent messages.
 * Uses evaluate-based DOM walking since Sniffies uses hashed class names.
 */
async function readAndReplyChat(
  page: Page,
  chat: SniffiesChat,
  client: Anthropic,
  state: Record<string, unknown>,
  sb: typeof supabase,
  userId: string,
): Promise<{ success: boolean; reply?: string }> {
  try {
    // Find and click the chat item. Strategy order matters:
    //   1. Position-based click via page.evaluate — finds the Nth chat entry in the list.
    //      Reliable because the scraper enumerated chats in list order already.
    //   2. Text-based selectors scoped to elements containing a timestamp (chat list items
    //      have timestamps; message bubbles don't) — avoids matching message content.
    //   3. Plain text selectors — last resort, fragile.
    let clicked = false;

    // Strategy 1: position-based click inside the browser
    try {
      const clickedByIndex = await page.evaluate((idx) => {
        const timeRegex = /(\d+\s+(seconds?|minutes?|hours?|days?)\s+ago|a few seconds ago|just now)/i;
        const seen = new Set<Element>();
        const entries: HTMLElement[] = [];
        const els = document.querySelectorAll('div, li, a, section');
        for (const el of els) {
          const text = (el as HTMLElement).innerText || '';
          if (!timeRegex.test(text)) continue;
          // Walk up to a reasonable chat-entry ancestor (100-800px wide, contains timestamp).
          let node: HTMLElement | null = el as HTMLElement;
          for (let hops = 0; hops < 6 && node && node.parentElement; hops++) {
            const r = node.getBoundingClientRect();
            if (r.width >= 100 && r.width <= 800 && r.height >= 40 && r.height <= 200) break;
            node = node.parentElement;
          }
          if (!node || seen.has(node)) continue;
          seen.add(node);
          entries.push(node);
        }
        if (idx >= entries.length) return false;
        entries[idx].click();
        return true;
      }, chat.index);
      if (clickedByIndex) clicked = true;
    } catch { /* fall through */ }

    // Strategy 2: scoped text selector — element containing username AND a timestamp sibling
    if (!clicked) {
      for (const selector of [
        `text="${chat.username}"`,
        `text="${chat.username}" >> nth=0`,
        `text=/${chat.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/i`,
      ]) {
        try {
          const el = page.locator(selector).first();
          if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
            await el.click({ force: true });
            clicked = true;
            break;
          }
        } catch { continue; }
      }
    }

    if (!clicked) {
      console.log(`  Could not find chat item for ${chat.username}`);
      return { success: false };
    }

    await page.waitForTimeout(3000);

    // Read messages using evaluate — extract all visible text blocks in the chat area
    // Sniffies chat messages appear as text blocks in a scrollable conversation view
    const messages = await page.evaluate(`(() => {
      var msgs = [];
      // Strategy: find the conversation area (right side or main area after clicking a chat)
      // Look for a scrollable container that appeared after clicking
      var containers = document.querySelectorAll('div, section');
      var chatArea = null;

      for (var i = 0; i < containers.length; i++) {
        var el = containers[i];
        var rect = el.getBoundingClientRect();
        var style = getComputedStyle(el);
        // Chat area: scrollable, tall, takes up a good portion of the screen
        if (rect.height > 200 && rect.width > 200 &&
            (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight) {
          // Prefer containers that have actual text content (messages)
          var text = el.innerText || '';
          if (text.length > 20 && !text.includes('Recents') && !text.includes('Screened')) {
            chatArea = el;
          }
        }
      }

      if (!chatArea) {
        // Fallback: just grab the main content area
        chatArea = document.querySelector('[role="main"], main') || document.body;
      }

      // Extract text blocks that look like messages with author attribution.
      // Sniffies bubbles for self vs other typically differ in alignment/position.
      // We compute each leaf text node's horizontal center relative to the chat
      // area — outbound (self) bubbles sit on the right, inbound (them) on left.
      var children = chatArea.querySelectorAll('p, span, div');
      var seen = new Set();
      var areaRect = chatArea.getBoundingClientRect();
      var areaMid = areaRect.left + areaRect.width / 2;
      for (var j = 0; j < children.length; j++) {
        var child = children[j];
        var text = (child.innerText || '').trim();
        if (!text || text.length < 2 || text.length > 500) continue;
        // Timestamps + distances — alone or concatenated (Sniffies UI combines them)
        if (/^\\d+\\s+(seconds?|minutes?|hours?|days?)\\s+ago$/i.test(text)) continue;
        if (/^\\d+(\\.\\d+)?\\s*(mi|miles?|ft|feet|km|m)$/i.test(text)) continue;
        if (/^\\d+\\s+(seconds?|minutes?|hours?|days?)\\s+ago\\s*\\d+(\\.\\d+)?\\s*(mi|miles?|ft|feet|km|m)$/i.test(text)) continue;
        if (/^(Recents|Screened|Unread|NEW|from|Send|Type|Block|Report|Sniffies|Anonymous Cruiser)$/i.test(text)) continue;
        if (/^typing\\.?\\.?\\.?$/i.test(text)) continue;
        if (/^(read|delivered|sent)$/i.test(text)) continue;
        if (/^you sent a reaction\\.?$/i.test(text)) continue;
        // Sniffies free-chat expiration chrome: "Expiring", "Expires in 5 hours", etc.
        if (/^expiring$/i.test(text)) continue;
        if (/^expires?\\s+in\\s+/i.test(text)) continue;
        if (/^(new match|active now|online|offline|away)$/i.test(text)) continue;

        // Photo markers — keep as scene context so the Handler knows photos came in.
        // fromSelf determined by wording, not bubble position (system labels are centered).
        var sentPhotoMatch = text.match(/^you sent (\\d+) photos?$/i);
        if (sentPhotoMatch) {
          var sentMarker = '[sent ' + sentPhotoMatch[1] + ' photo' + (sentPhotoMatch[1] === '1' ? '' : 's') + ']';
          if (!seen.has(sentMarker)) { seen.add(sentMarker); msgs.push({ text: sentMarker, fromSelf: true }); }
          continue;
        }
        var recvPhotoMatch = text.match(/^you received (\\d+) photos?$/i);
        if (recvPhotoMatch) {
          var recvMarker = '[received ' + recvPhotoMatch[1] + ' photo' + (recvPhotoMatch[1] === '1' ? '' : 's') + ']';
          if (!seen.has(recvMarker)) { seen.add(recvMarker); msgs.push({ text: recvMarker, fromSelf: false }); }
          continue;
        }
        // Bare "sent N photos" / "received N photos" variants
        var bareSentMatch = text.match(/^sent (\\d+) photos?$/i);
        if (bareSentMatch) {
          var bareSentMarker = '[sent ' + bareSentMatch[1] + ' photo' + (bareSentMatch[1] === '1' ? '' : 's') + ']';
          if (!seen.has(bareSentMarker)) { seen.add(bareSentMarker); msgs.push({ text: bareSentMarker, fromSelf: true }); }
          continue;
        }

        if (seen.has(text)) continue;

        var childDivs = child.querySelectorAll('div, p, span');
        var isLeaf = true;
        for (var k = 0; k < childDivs.length; k++) {
          if ((childDivs[k].innerText || '').trim() === text) { isLeaf = false; break; }
        }
        if (!isLeaf) continue;

        // Author detection via bubble position. Walk up to find the bubble
        // container that has meaningful width, then check its center vs areaMid.
        var bubble = child;
        for (var u = 0; u < 6 && bubble && bubble.parentElement; u++) {
          var r = bubble.getBoundingClientRect();
          if (r.width > 30 && r.width < areaRect.width * 0.9) break;
          bubble = bubble.parentElement;
        }
        var bRect = bubble ? bubble.getBoundingClientRect() : child.getBoundingClientRect();
        var bCenter = bRect.left + bRect.width / 2;
        var fromSelf = bCenter > areaMid;  // right side = outbound

        seen.add(text);
        msgs.push({ text: text, fromSelf: fromSelf });
      }
      return msgs.slice(-15);
    })()`) as Array<{ text: string; fromSelf: boolean }>;

    // Bulletproof self-detection: query every outbound reply the bot has sent
    // to this chat in the last 2 hours. Any scraped message whose text matches
    // an outbound is definitely self. This is independent of DOM heuristics.
    const outboundCutoff = new Date(Date.now() - 2 * 3600_000).toISOString();
    let recentOutbounds: Set<string> = new Set();
    try {
      const { data: out } = await sb
        .from('ai_generated_content')
        .select('content')
        .eq('user_id', userId)
        .eq('platform', 'sniffies')
        .eq('content_type', 'chat_reply')
        .eq('target_account', chat.username)
        .gte('posted_at', outboundCutoff);
      recentOutbounds = new Set((out || []).map(r => (r.content || '').trim()));
    } catch {}

    // Override fromSelf for any scraped message whose text matches a recent outbound.
    for (const m of messages) {
      if (recentOutbounds.has(m.text.trim())) m.fromSelf = true;
    }

    // Sanity check: the DOM bubble-position heuristic is unreliable under some
    // Sniffies layouts (single-column mobile-like views, floating panels). If
    // the scraper flagged >70% of messages as self, treat the heuristic as broken
    // and reset all non-cache-matched messages to `from them`. Losing manual-reply
    // detection is the lesser evil vs. every chat being skipped as self-reply.
    if (messages.length >= 3) {
      const selfCount = messages.filter(m => m.fromSelf).length;
      if (selfCount / messages.length > 0.7) {
        console.log(`  [debug] DOM heuristic flagged ${selfCount}/${messages.length} as self — distrusting, falling back to outbound-cache only`);
        for (const m of messages) {
          m.fromSelf = recentOutbounds.has(m.text.trim());
        }
      }
    }

    const lastMsg = messages[messages.length - 1];

    // Authoritative override: the chat-list preview is definitionally the newest
    // message in the conversation. For anonymous Sniffies chats there's no
    // username, so the preview text lives in chat.username; otherwise in
    // chat.lastMessage. Use whichever is populated.
    const effectivePreview = (chat.lastMessage && chat.lastMessage.trim()) || (chat.username || '').trim();
    if (lastMsg && effectivePreview) {
      const previewTrim = effectivePreview.replace(/[…\.]+$/, '').trim();
      const tailTrim = lastMsg.text.trim();
      const matchesPreview = previewTrim.length > 0 && (
        previewTrim === tailTrim ||
        (previewTrim.length >= 10 && tailTrim.startsWith(previewTrim)) ||
        (tailTrim.length >= 10 && previewTrim.startsWith(tailTrim))
      );
      if (matchesPreview && !recentOutbounds.has(tailTrim) && lastMsg.fromSelf) {
        console.log(`  [debug] Tail matches chat preview and isn't ours → overriding fromSelf to false`);
        lastMsg.fromSelf = false;
      }
    }

    console.log(`  [debug] Read ${messages.length} messages in chat with ${chat.username}`);
    if (lastMsg) {
      console.log(`  [debug]   last (${lastMsg.fromSelf ? 'me' : 'them'}): "${lastMsg.text.substring(0, 60)}"`);
    }

    // Chat-list preview self-check: the chat list shows the newest message in
    // the conversation. If that preview matches or is a prefix of any recent
    // outbound, the newest message is ours. This catches the case where DOM
    // message scraping fails silently and lastMsg is undefined — without it,
    // we'd fall through and reply to our own preview text.
    const previewText = (chat.lastMessage || '').trim().replace(/[…\.]+$/, '').trim();
    if (previewText.length > 0) {
      const outboundArr = [...recentOutbounds];
      const previewIsOurs = outboundArr.some(out =>
        out === previewText ||
        (previewText.length >= 15 && out.startsWith(previewText)) ||
        (out.length >= 15 && previewText.startsWith(out))
      );
      if (previewIsOurs) {
        console.log(`  Skipping: chat preview matches a recent outbound — we sent the last message.`);
        return { success: false };
      }
    }

    // Skip if the newest message is from the bot itself — otherwise the bot
    // replies to its own previous outbound and creates a self-conversation loop.
    if (lastMsg && lastMsg.fromSelf) {
      console.log(`  Skipping: last message was from us — waiting for them to respond.`);
      return { success: false };
    }

    // No messages scraped + chat not unread = preview is most likely our own
    // outbound that's too old to match recentOutbounds (>2h). Safest: skip.
    if (!lastMsg && !chat.isUnread) {
      console.log(`  Skipping: no messages scraped and chat not unread — likely our own last message.`);
      return { success: false };
    }

    // Resolve contact + record their last incoming message so the Handler has memory.
    let contactId: string | null = null;
    let contactCtxBlock = '';
    try {
      const contact = await resolveContact(sb, userId, 'sniffies', chat.username);
      contactId = contact.id;
      contactCtxBlock = await getContactContext(sb, contact.id);
      const lastInbound = [...messages].reverse().find(m => !m.fromSelf);
      const inboundSnippet = lastInbound ? lastInbound.text : chat.lastMessage;
      if (inboundSnippet) {
        await recordEvent(sb, userId, contact.id, 'chat_in', 'in', 'sniffies', inboundSnippet);
      }
    } catch (err) {
      console.error(`  [contact-graph] resolve/record failed:`, err instanceof Error ? err.message : err);
    }

    // Pending outbound check: if Maxy already wrote a reply manually via the
    // Handler chat, it's queued in pending_outbound. Send it verbatim — no
    // Claude rewrite. This is how the "needs Maxy" loop closes.
    const pending = await consumePendingForChat(sb, userId, 'sniffies', chat.username);
    if (pending) {
      console.log(`  [pending] Using Maxy's queued reply: "${pending.body.slice(0, 60)}"`);
      // Fall through: we set `reply` later to pending.body and skip Claude.
      // Handled below via pendingOutbound variable.
    }

    // Needs-Maxy detection: if the latest inbound is a question that requires
    // grounded state (availability, location, hard personal detail, or a
    // meetup commitment), skip Claude and queue Handler attention. Maxy
    // answers in the app; next tick picks up pending_outbound.
    const lastInboundForDetect = [...messages].reverse().find(m => !m.fromSelf);
    if (!pending && lastInboundForDetect) {
      const needs = needsMaxyInput(lastInboundForDetect.text);
      if (needs.needs) {
        console.log(`  [needs-maxy] ${needs.reason} (${needs.category}) — queueing attention, skipping auto-reply`);
        if (contactId) {
          await queueAttentionDedup(sb, userId, {
            kind: 'logistics_ask',
            severity: 'medium',
            contactId,
            platform: 'sniffies',
            summary: `${chat.username}: "${lastInboundForDetect.text.slice(0, 200)}" — ${needs.reason}`,
            payload: {
              category: needs.category,
              inbound: lastInboundForDetect.text,
              recent_messages: messages.slice(-5).map(m => ({ from: m.fromSelf ? 'me' : 'them', text: m.text })),
            },
          }, 30);
        }
        return { success: false };
      }
    }

    // Generate reply — include author markers so the model knows who said what.
    const context = messages.length > 0
      ? messages.map((m, i) => `${i + 1}. ${m.fromSelf ? 'Me' : 'Them'}: "${m.text}"`).join('\n')
      : `(New conversation — they messaged you. Preview: "${chat.lastMessage}")`;

    // Pull the Handler's current strategic briefing. This is what the Handler
    // in the Becoming app is pushing this week (escalation band, weak axes,
    // narrative theme, meetup stance). Without this, replies are voice-
    // consistent but strategy-blind.
    let handlerBriefing = '';
    try {
      const { data: briefing } = await sb
        .from('handler_briefing')
        .select('prompt_snippet')
        .eq('user_id', userId)
        .maybeSingle();
      if (briefing?.prompt_snippet) handlerBriefing = briefing.prompt_snippet;
    } catch {}

    // Pending-outbound short-circuit: if Maxy queued a manual reply via the
    // Handler, send her exact words. Skip Claude entirely.
    let reply: string;
    if (pending) {
      reply = pending.body;
    } else {
      // Voice: pulls from user_voice_corpus (same source the Handler learns from)
      // so the auto-poster mirrors Maxy's real cadence, not a static description.
      const maxyVoice = await buildMaxyVoiceSystem(sb, userId, 'reply');
      // Facts block: hard ground-truth Maxy may claim. Forces deflection on
      // anything not in the list. This is the anti-fabrication gate.
      const factsBlock = await loadMaxyFactsBlock(sb, userId);
      // State context: make replies feel her current day/escalation/arousal.
      const currentState = await loadMaxyState(sb, userId);
      const stateBlock = buildStatePromptFragment(currentState, 'dm_cruise');
      const systemPromptParts = [maxyVoice, factsBlock];
      systemPromptParts.push(`You are replying in a Sniffies chat with "${chat.username}".`);
      if (stateBlock) systemPromptParts.push(stateBlock);
      if (handlerBriefing) systemPromptParts.push(`HANDLER STRATEGY (this week's directives — follow them):\n${handlerBriefing}`);
      if (contactCtxBlock) systemPromptParts.push(contactCtxBlock);

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: systemPromptParts.join('\n\n') + `\n\nCRITICAL OUTPUT FORMAT: Respond with Maxy's message text ONLY. No explanation of your reasoning, no "something like:", no preamble, no meta-commentary, no quotes around the message, no "Here's a reply:". Just the text she would type, ready to paste into the chat input. If you explain what to say instead of saying it, the output is wrong.`,
        messages: [{
          role: 'user',
          content: `Chat with ${chat.username}:\n${context}\n\nMaxy's next message. Plain text only, no framing.`,
        }],
      });

      const extracted = extractSafeText(response, 3, `Sniffies @${chat.username}`);
      if (!extracted) return { success: false };
      reply = stripMetaCommentary(extracted);
      if (!reply || reply.length < 2) {
        console.log(`  [meta-strip] reply was entirely meta-commentary, skipping`);
        return { success: false };
      }
    }

    // PII guardrail — hardest gate on Sniffies since it's a cruising app.
    const lastInboundForGate = [...messages].reverse().find(m => !m.fromSelf);
    const inboundText = lastInboundForGate ? lastInboundForGate.text : chat.lastMessage;
    const gate = gateOutbound(inboundText, reply);
    if (gate.action === 'suppress') {
      console.log(`  [pii-guard] SUPPRESSED (${gate.severity}): ${gate.reason}`);
      console.log(`  [pii-guard] Original reply: "${reply}"`);
      if (contactId) {
        try {
          await flagContact(sb, contactId, `outbound_blocked:${gate.reason}`);
          await queueAttentionDedup(sb, userId, {
            kind: 'outbound_suppressed',
            severity: gate.severity,
            contactId,
            platform: 'sniffies',
            summary: `Blocked outbound to ${chat.username}: ${gate.reason}`,
            payload: { original_reply: reply, inbound: inboundText },
          });
        } catch {}
      }
      return { success: false };
    }
    if (gate.action === 'deflect') {
      console.log(`  [pii-guard] DEFLECTING — inbound asked for logistics (${gate.inboundSignal.keywords.join(', ')})`);
      reply = gate.text;
      if (contactId) {
        try {
          await flagContact(sb, contactId, `asked_logistics:${gate.inboundSignal.keywords[0] || 'meetup'}`);
          await queueAttentionDedup(sb, userId, {
            kind: 'logistics_ask',
            severity: 'high',
            contactId,
            platform: 'sniffies',
            summary: `${chat.username} asked for ${gate.inboundSignal.keywords.join(', ')}`,
            payload: { inbound: inboundText, deflection_sent: gate.text },
          });
        } catch {}
      }
    }

    console.log(`  Reply: "${reply}"`);

    // Find the message input using multiple strategies
    // Sniffies likely uses contenteditable, textarea, or a custom input component
    let inputFound = false;

    // Strategy 1: contenteditable div (most modern chat apps)
    const editables = page.locator('[contenteditable="true"]');
    const editableCount = await editables.count().catch(() => 0);
    if (editableCount > 0) {
      const inputBox = editables.last();
      if (await inputBox.isVisible().catch(() => false)) {
        await inputBox.click();
        await page.waitForTimeout(300);
        await inputBox.pressSequentially(reply, { delay: 25 });
        inputFound = true;
      }
    }

    // Strategy 2: textarea
    if (!inputFound) {
      const textareas = page.locator('textarea');
      const taCount = await textareas.count().catch(() => 0);
      if (taCount > 0) {
        const inputBox = textareas.last();
        if (await inputBox.isVisible().catch(() => false)) {
          await inputBox.click();
          await page.waitForTimeout(300);
          await inputBox.fill(reply);
          inputFound = true;
        }
      }
    }

    // Strategy 3: any visible input[type=text] at the bottom of the screen
    if (!inputFound) {
      const inputs = page.locator('input[type="text"]');
      const inputCount = await inputs.count().catch(() => 0);
      for (let i = inputCount - 1; i >= 0; i--) {
        const inp = inputs.nth(i);
        if (await inp.isVisible().catch(() => false)) {
          const box = await inp.boundingBox().catch(() => null);
          // Only use inputs in the bottom half of the screen (likely the chat input)
          if (box && box.y > 400) {
            await inp.click();
            await page.waitForTimeout(300);
            await inp.fill(reply);
            inputFound = true;
            break;
          }
        }
      }
    }

    // Strategy 4: use evaluate to find any focused/focusable input at the bottom
    if (!inputFound) {
      inputFound = await page.evaluate(`(() => {
        var inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
        for (var i = inputs.length - 1; i >= 0; i--) {
          var el = inputs[i];
          var rect = el.getBoundingClientRect();
          if (rect.height > 0 && rect.width > 0 && rect.y > 400) {
            el.focus();
            return true;
          }
        }
        return false;
      })()`) as boolean;

      if (inputFound) {
        await page.waitForTimeout(300);
        await page.keyboard.type(reply, { delay: 25 });
      }
    }

    if (!inputFound) {
      console.error(`  [debug] No message input found in chat`);
      await page.screenshot({ path: '.debug-sniffies-noinput.png' });
      return { success: false };
    }

    await page.waitForTimeout(500);

    // Send — try multiple approaches
    const sendBtn = page.locator(
      'button[type="submit"], button:has-text("Send"), [aria-label*="send" i], ' +
      'button svg, button img'  // Sniffies might use an icon button
    ).first();

    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click();
    } else {
      // Enter key to send
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(1500);

    // If this reply came from pending_outbound, mark it sent. Otherwise the
    // same row would fire every tick.
    if (pending) {
      try { await markPendingSent(sb, pending.id); } catch {}
    }

    // Log outbound reply to contact graph + refresh tier.
    if (contactId) {
      try {
        await recordEvent(sb, userId, contactId, 'chat_out', 'out', 'sniffies', reply);
        await recomputeTier(sb, contactId);
      } catch (err) {
        console.error(`  [contact-graph] record reply failed:`, err instanceof Error ? err.message : err);
      }

      // Extract structured intelligence from the conversation
      try {
        const fullConvo = [...messages, { text: reply, fromSelf: true }];
        const result = await extractContactIntelligence(sb, client, userId, contactId, chat.username, fullConvo);
        if (result.extracted) {
          console.log(`  [intel] stage=${result.stage} safety=${result.safety}/10`);
        }

        // Sniffies → Fansly funnel: after 3+ exchanges with a warm contact,
        // drop the Fansly link once. Check if we already dropped it for this contact.
        const outCount = messages.filter(m => m.fromSelf).length;
        if (outCount >= 3) {
          const { count: linkDropped } = await sb.from('contact_events')
            .select('id', { count: 'exact', head: true })
            .eq('contact_id', contactId)
            .eq('event_type', 'chat_out')
            .ilike('content', '%fansly%');
          if ((linkDropped ?? 0) === 0) {
            const fanslyUrl = process.env.FANSLY_PUBLIC_URL || 'https://fansly.com/SoftMaxy';
            const funnelMsg = `btw i post way more on fansly if you wanna see everything — ${fanslyUrl}`;
            // Type and send
            try {
              const input = page.locator('textarea, input[type="text"], [contenteditable="true"]').last();
              await input.fill(funnelMsg);
              await page.keyboard.press('Enter');
              await page.waitForTimeout(1500);
              await recordEvent(sb, userId, contactId, 'chat_out', 'out', 'sniffies', funnelMsg, 0, { strategy: 'fansly_funnel' });
              console.log(`  [funnel] Dropped Fansly link to ${chat.username}`);
            } catch {}
          }
        }
      } catch (err) {
        console.error(`  [intel] failed:`, err instanceof Error ? err.message : err);
      }
    }

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

        // Generate an opener — voice pulled from user_voice_corpus
        const openerVoice = await buildMaxyVoiceSystem(sb, userId, 'reply');
        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 80,
          system: `${openerVoice}\n\nYou are sending an opener on Sniffies — a cruising/hookup app. Direct, curious, not thirsty. Under 12 words.`,
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

        // Find input and type — use same multi-strategy approach as readAndReplyChat
        let outreachInputFound = false;

        // Try contenteditable first, then textarea, then text input
        for (const sel of ['[contenteditable="true"]', 'textarea', 'input[type="text"]']) {
          const els = page.locator(sel);
          const count = await els.count().catch(() => 0);
          if (count > 0) {
            const el = els.last();
            if (await el.isVisible().catch(() => false)) {
              await el.click();
              await page.waitForTimeout(300);
              if (sel === 'textarea' || sel === 'input[type="text"]') {
                await el.fill(opener);
              } else {
                await el.pressSequentially(opener, { delay: 25 });
              }
              outreachInputFound = true;
              break;
            }
          }
        }

        if (!outreachInputFound) {
          console.log(`    No chat input found after clicking message`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          continue;
        }

        await page.waitForTimeout(500);

        // Send
        const sendBtn = page.locator(
          'button[type="submit"], button:has-text("Send"), [aria-label*="send" i]'
        ).first();

        if (await sendBtn.isVisible().catch(() => false)) {
          await sendBtn.click();
        } else {
          await page.keyboard.press('Enter');
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

        // Register in contact graph — cold outbound, tier starts at stranger.
        try {
          const contact = await resolveContact(sb, userId, 'sniffies', username);
          await recordEvent(sb, userId, contact.id, 'chat_out', 'out', 'sniffies', opener, 0, { strategy: 'outreach' });
        } catch (err) {
          console.error(`  [contact-graph] outreach record failed:`, err instanceof Error ? err.message : err);
        }

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

    const targets = sorted.slice(0, maxReplies);
    for (let idx = 0; idx < targets.length; idx++) {
      const chat = targets[idx];
      const stillHasBudget = await checkBudget(sb, userId, 'sniffies', 'chat');
      if (!stillHasBudget) break;

      // Between iterations, fully reload the chat list. Just opening the panel
      // isn't enough — the conversation view overlays the list, so text-based
      // click selectors match message bubbles instead of list entries. A full
      // reload forces the SPA to drop the previous chat view entirely.
      if (idx > 0) {
        try {
          await page.goto('https://sniffies.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(2500);
        } catch {}
        const reopened = await openChatPanel(page);
        if (!reopened) {
          console.log(`[Sniffies] Could not return to chat panel — stopping reply loop`);
          break;
        }
        await page.waitForTimeout(2000);
      }

      console.log(`[Sniffies] Replying to ${chat.username}${chat.isUnread ? ' (unread)' : ''}...`);
      attempted++;

      const result = await readAndReplyChat(page, chat, client, state, sb, userId);
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
