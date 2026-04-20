/**
 * Voice Learner — captures Maxy's actual voice across platforms.
 *
 * Sources (in order of signal):
 *   - Twitter DMs (manually typed replies)
 *   - Own Twitter tweets + replies (from /with_replies)
 *   - Own Reddit posts + comments (from /user/<u>/)
 *   - Own FetLife writings (from /users/<u>/posts)
 *
 * Writes to `user_voice_corpus` and the local `.voice-training.json` dedup file.
 * Skips anything the bot already posted (matched via ai_generated_content).
 *
 * CLI:   npx tsx voice-learn.ts
 * Sched: called by scheduler.ts every ~16 ticks (4h)
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { supabase, PLATFORMS } from './config';
import * as fs from 'fs';
import * as path from 'path';

interface VoiceExample {
  timestamp: string;
  contact: string;
  theirMessage: string;
  context: string[];
  generatedReply: string;
  finalReply: string;
  wasEdited: boolean;
}

const VOICE_FILE = path.join(__dirname, '.voice-training.json');
const TWITTER_HANDLE = (process.env.TWITTER_HANDLE || 'softmaxy').replace(/^@/, '');
const REDDIT_USERNAME = (process.env.REDDIT_USERNAME || '').replace(/^u\//, '');
const FETLIFE_USERNAME = process.env.FETLIFE_USERNAME || '';

function resolveWriteUserId(): string | null {
  const list = process.env.VOICE_USER_IDS;
  if (list) return list.split(',').map(s => s.trim()).filter(Boolean)[0] || null;
  return process.env.MAXY_USER_ID || process.env.USER_ID || null;
}
const WRITE_USER_ID = resolveWriteUserId();

// ── Local DM corpus (legacy) ───────────────────────────────────────

function loadVoiceExamples(): VoiceExample[] {
  try {
    if (fs.existsSync(VOICE_FILE)) {
      return JSON.parse(fs.readFileSync(VOICE_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveVoiceExamples(examples: VoiceExample[]): void {
  fs.writeFileSync(VOICE_FILE, JSON.stringify(examples.slice(-200), null, 2));
}

// ── Bot-content filter ─────────────────────────────────────────────
// Anything auto-posted by the bot must NOT be counted as Maxy's voice —
// that would feed the model its own output and calcify drift.

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

async function loadBotContentSet(platform: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('ai_generated_content')
    .select('content')
    .eq('platform', platform)
    .in('status', ['posted', 'scheduled']);
  const set = new Set<string>();
  for (const r of data || []) {
    const c = (r.content as string) || '';
    if (c.length > 10) set.add(norm(c).slice(0, 200));
  }
  return set;
}

function isBotContent(text: string, botSet: Set<string>): boolean {
  const key = norm(text).slice(0, 200);
  if (key.length < 10) return false;
  if (botSet.has(key)) return true;
  // Partial match — any bot post that starts with this text (or vice versa)
  for (const b of botSet) {
    if (b.startsWith(key.slice(0, 80)) || key.startsWith(b.slice(0, 80))) return true;
  }
  return false;
}

// ── Ingest helper ──────────────────────────────────────────────────

async function ingestSamples(
  rows: Array<{ text: string; source: string; sourceCtx: Record<string, unknown>; signal: number }>,
): Promise<number> {
  if (!WRITE_USER_ID || rows.length === 0) return 0;

  // Dedup against existing corpus for this user (exact match on leading 200 chars)
  const prefixes = rows.map(r => norm(r.text).slice(0, 200));
  const { data: existing } = await supabase
    .from('user_voice_corpus')
    .select('text')
    .eq('user_id', WRITE_USER_ID)
    .order('created_at', { ascending: false })
    .limit(500);
  const existingSet = new Set((existing || []).map((r: any) => norm(r.text || '').slice(0, 200)));

  const fresh = rows.filter((r, i) => !existingSet.has(prefixes[i]));
  if (fresh.length === 0) return 0;

  const { error } = await supabase.from('user_voice_corpus').insert(
    fresh.map(r => ({
      user_id: WRITE_USER_ID,
      text: r.text.slice(0, 2000),
      source: r.source,
      source_context: { ...r.sourceCtx, origin: 'voice-learn' },
      length: r.text.length,
      signal_score: r.signal,
    }))
  );
  if (error) {
    console.error(`  [ingest] failed: ${error.message}`);
    return 0;
  }
  return fresh.length;
}

// ── Twitter DM scraping (legacy — kept for compatibility) ──────────

function parseDMMessages(text: string, contactName: string): Array<{ from: 'them' | 'us'; text: string }> {
  const lines = text.split('\n');
  const TIMESTAMP = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;
  const DATE_HEADER = /^(Today|Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
  const messages: Array<{ from: 'them' | 'us'; text: string }> = [];
  const skipPatterns = new Set(['is typing …', 'View Profile', 'Edited', 'New', 'Show more', 'Failed to load']);

  let currentSender: 'them' | 'us' = 'them';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (TIMESTAMP.test(line)) continue;
    if (DATE_HEADER.test(line)) continue;
    if (line.startsWith('@') || line.startsWith('Joined')) continue;
    if (skipPatterns.has(line)) continue;
    if (/^You reacted/.test(line)) continue;

    if (line === 'Maxy' || line === 'Soft_Maxy') { currentSender = 'us'; continue; }
    if (line === contactName) { currentSender = 'them'; continue; }

    messages.push({ from: currentSender, text: line });
  }

  return messages;
}

async function scrapeTwitterDMs(page: Page): Promise<number> {
  console.log('[voice-learn/twitter-dms] scraping…');
  await page.goto('https://x.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Handle PIN if prompted
  if (page.url().includes('pin') || page.url().includes('chat')) {
    const pin = process.env.TWITTER_DM_PIN || '';
    for (const d of pin) { await page.keyboard.press(d); await page.waitForTimeout(200); }
    await page.waitForTimeout(5000);
  }

  const sidebarText = await page.evaluate(() => {
    const containers = document.querySelectorAll('.scrollbar-thin-custom');
    return (containers[0] as HTMLElement)?.innerText || '';
  });

  const sidebarLines = sidebarText.split('\n').map(l => l.trim()).filter(l => l);
  const convNames: string[] = [];
  for (let i = 0; i < sidebarLines.length; i++) {
    const nextLine = sidebarLines[i + 1] || '';
    if (/^(Now|\d+[smhdw]|Just now)$/.test(nextLine)) {
      convNames.push(sidebarLines[i]);
    }
  }

  const existing = loadVoiceExamples();
  const existingKeys = new Set(existing.map(e => `${e.contact}|${e.finalReply}`));

  const { data: botReplies } = await supabase
    .from('paid_conversations')
    .select('subscriber_id, handler_response')
    .eq('platform', 'twitter')
    .eq('message_direction', 'outbound')
    .not('handler_response', 'eq', '')
    .not('handler_response', 'is', null);

  const botReplySet = new Set(
    (botReplies || []).map((r: any) => `${r.subscriber_id}|${r.handler_response}`)
  );

  let learned = 0;
  const newSamples: Array<{ text: string; source: string; sourceCtx: Record<string, unknown>; signal: number }> = [];

  for (const name of convNames.slice(0, 5)) {
    try {
      await page.locator(`text=${name}`).first().click();
      await page.waitForTimeout(3000);

      await page.evaluate(() => {
        const containers = document.querySelectorAll('.scrollbar-thin-custom');
        const chat = containers[1] as HTMLElement;
        if (chat) chat.scrollTop = chat.scrollHeight;
      });
      await page.waitForTimeout(1000);

      const chatText = await page.evaluate(() => {
        const containers = document.querySelectorAll('.scrollbar-thin-custom');
        return (containers[1] as HTMLElement)?.innerText || '';
      });

      const messages = parseDMMessages(chatText, name);

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.from !== 'us') continue;
        if (botReplySet.has(`${name}|${msg.text}`)) continue;
        if (msg.text.length < 5) continue;

        const theirMsg = messages.slice(0, i).reverse().find(m => m.from === 'them');
        if (!theirMsg) continue;

        const voiceKey = `${name}|${msg.text}`;
        if (existingKeys.has(voiceKey)) continue;

        const contextLines = messages.slice(Math.max(0, i - 5), i).map(m =>
          m.from === 'us' ? `Maxy: ${m.text}` : `${name}: ${m.text}`
        );

        existing.push({
          timestamp: new Date().toISOString(),
          contact: name,
          theirMessage: theirMsg.text,
          context: contextLines,
          generatedReply: '',
          finalReply: msg.text,
          wasEdited: true,
        });
        existingKeys.add(voiceKey);
        learned++;

        newSamples.push({
          text: msg.text,
          source: 'platform_dm',
          sourceCtx: { contact: name, their_message: theirMsg.text.slice(0, 500), platform: 'twitter' },
          signal: 8,
        });
      }

      await page.goBack();
      await page.waitForTimeout(1500);
    } catch (err) {
      console.error(`  [twitter-dm] ${name}: ${err instanceof Error ? err.message : err}`);
      await page.goBack().catch(() => {});
      await page.waitForTimeout(1500);
    }
  }

  saveVoiceExamples(existing);
  const ingested = await ingestSamples(newSamples);
  console.log(`  [twitter-dms] learned ${learned} new, ingested ${ingested}`);
  return ingested;
}

// ── Own Twitter tweets + replies ──────────────────────────────────

async function detectOwnTwitterHandle(page: Page): Promise<{ handle: string | null; loggedIn: boolean }> {
  const RESERVED = new Set([
    'home', 'explore', 'notifications', 'messages', 'settings', 'i', 'search',
    'login', 'signup', 'logout', 'tos', 'privacy', 'compose', 'intent',
  ]);
  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3500);
    const res = await page.evaluate((reservedArr) => {
      const reserved = new Set<string>(reservedArr as string[]);
      const loggedIn = !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="primaryColumn"]')
        && !document.body.innerText.includes('Log in to X');

      const a = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
      const txt = (a as HTMLElement)?.innerText || '';
      const m = txt.match(/@([A-Za-z0-9_]+)/);
      if (m) return { handle: m[1], loggedIn };

      const candidates: Record<string, number> = {};
      document.querySelectorAll('a[href^="/"]').forEach(el => {
        const href = (el as HTMLAnchorElement).getAttribute('href') || '';
        const m2 = href.match(/^\/([A-Za-z0-9_]+)$/);
        if (m2 && !reserved.has(m2[1].toLowerCase())) {
          candidates[m2[1]] = (candidates[m2[1]] || 0) + 1;
        }
      });
      const top = Object.entries(candidates).sort((a, b) => b[1] - a[1])[0];
      return { handle: top ? top[0] : null, loggedIn };
    }, Array.from(RESERVED));
    return res;
  } catch {
    return { handle: null, loggedIn: false };
  }
}

async function scrapeOwnTwitter(page: Page): Promise<number> {
  const { handle: detected, loggedIn } = await detectOwnTwitterHandle(page);
  if (!loggedIn) {
    console.log('[voice-learn/own-twitter] Twitter session NOT LOGGED IN — skipping. Re-login needed in browser profile.');
    return 0;
  }
  let handle = TWITTER_HANDLE;
  if (detected) {
    if (!handle || handle.toLowerCase() !== detected.toLowerCase()) {
      console.log(`[voice-learn/own-twitter] session handle detected: @${detected} (env was @${handle || 'unset'})`);
    }
    handle = detected;
  }
  if (!handle) {
    console.log('[voice-learn/own-twitter] could not resolve handle, skipping');
    return 0;
  }
  console.log(`[voice-learn/own-twitter] scraping @${handle}/with_replies…`);

  const botSet = await loadBotContentSet('twitter');

  try {
    await page.goto(`https://x.com/${handle}/with_replies`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);

    // Scroll to load more tweets (3 scrolls = ~60 tweets)
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 2000));
      await page.waitForTimeout(1500);
    }

    // Diagnostic: how many tweet-like elements are on the page?
    const diag = await page.evaluate(() => {
      const articles = document.querySelectorAll('article');
      const tweetArticles = document.querySelectorAll('article[data-testid="tweet"]');
      const tweetTexts = document.querySelectorAll('[data-testid="tweetText"]');
      const bodyText = (document.body.innerText || '').slice(0, 300);
      return { articles: articles.length, tweetArticles: tweetArticles.length, tweetTexts: tweetTexts.length, bodyHead: bodyText };
    });
    console.log(`  [own-twitter] page: ${diag.articles} <article>, ${diag.tweetArticles} [data-testid=tweet], ${diag.tweetTexts} tweetText`);
    if (diag.tweetArticles === 0) {
      console.log(`  [own-twitter] body head: ${diag.bodyHead.replace(/\n/g, ' | ')}`);
    }

    // Extract tweets — MUST filter by author (/with_replies shows the parent
    // tweet being replied to as well, which is authored by someone else).
    const raw = await page.evaluate((ownHandleLc) => {
      const out: Array<{ text: string; isReply: boolean; url: string; author: string }> = [];
      const articles = document.querySelectorAll('article[data-testid="tweet"], article');
      for (const article of Array.from(articles)) {
        const a = article as HTMLElement;
        const social = a.querySelector('[data-testid="socialContext"]');
        if (social && /reposted|retweeted/i.test(social.textContent || '')) continue;

        // Author = the first /<handle> link inside User-Name; compare case-insensitive + underscore-preserving
        const userNameEl = a.querySelector('[data-testid="User-Name"]');
        const userLink = userNameEl?.querySelector('a[href^="/"]') as HTMLAnchorElement | null;
        const authorHref = userLink?.getAttribute('href') || '';
        const am = authorHref.match(/^\/([A-Za-z0-9_]+)/);
        const author = am ? am[1].toLowerCase() : '';
        if (!author || author !== ownHandleLc) continue;

        const textEl = a.querySelector('[data-testid="tweetText"]');
        const text = (textEl as HTMLElement)?.innerText?.trim() || '';
        if (text.length < 8) continue;

        const isReply = /replying to/i.test(a.textContent || '');
        const linkEl = a.querySelector('a[href*="/status/"]');
        const url = linkEl?.getAttribute('href') || '';

        out.push({ text, isReply, url, author });
      }
      return out;
    }, handle.toLowerCase());

    // Extra defense: skip anything whose url path doesn't start with /<handle>/
    const handlePrefix = `/${handle.toLowerCase()}/`;
    const filtered = raw.filter(t => !t.url || t.url.toLowerCase().startsWith(handlePrefix));
    if (filtered.length < raw.length) {
      console.log(`  [own-twitter] dropped ${raw.length - filtered.length} by url-prefix guard`);
    }

    const samples: Array<{ text: string; source: string; sourceCtx: Record<string, unknown>; signal: number }> = [];
    for (const t of filtered) {
      if (isBotContent(t.text, botSet)) continue;
      samples.push({
        text: t.text,
        source: t.isReply ? 'own_twitter_reply' : 'own_twitter_post',
        sourceCtx: { platform: 'twitter', url: t.url || null, author: t.author },
        signal: 10,
      });
    }

    const ingested = await ingestSamples(samples);
    console.log(`  [own-twitter] scraped ${raw.length}, after bot-filter ${samples.length}, ingested ${ingested}`);
    return ingested;
  } catch (err) {
    console.error('  [own-twitter] failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}

// ── Own Reddit posts + comments ──────────────────────────────────

async function detectRedditUsername(page: Page): Promise<string | null> {
  try {
    // The most reliable path: /api/me.json returns logged-in user JSON
    await page.goto('https://www.reddit.com/api/me.json', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const body = await page.evaluate(() => document.body.innerText || '');
    const m = body.match(/"name"\s*:\s*"([A-Za-z0-9_-]+)"/);
    if (m) return m[1];
    // Fallback: /user/me redirects to /user/<handle> when logged in
    await page.goto('https://www.reddit.com/user/me', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);
    const finalUrl = page.url();
    const m2 = finalUrl.match(/\/user\/([A-Za-z0-9_-]+)/);
    if (m2 && m2[1] !== 'me') return m2[1];
    console.log(`  [reddit-detect] both paths failed. api body: "${body.slice(0, 120)}", final url: ${finalUrl}`);
    return null;
  } catch (err) {
    console.log(`  [reddit-detect] error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function scrapeOwnReddit(): Promise<number> {
  if (!PLATFORMS.reddit.enabled) return 0;

  const botSet = await loadBotContentSet('reddit');
  let context: BrowserContext | null = null;

  try {
    // Reddit detects headless Chromium — use the same stealth pattern as
    // reddit-engage.ts (visible but pushed off-screen).
    context = await chromium.launchPersistentContext(PLATFORMS.reddit.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-position=-2400,-2400',
        '--window-size=1,1',
      ],
    });
    const page = context.pages()[0] || await context.newPage();

    let username = REDDIT_USERNAME;
    if (!username) {
      const detected = await detectRedditUsername(page);
      if (detected) {
        console.log(`[voice-learn/own-reddit] session username detected: u/${detected}`);
        username = detected;
      }
    }
    if (!username) {
      console.log('[voice-learn/own-reddit] no REDDIT_USERNAME, session not logged in — skipping');
      return 0;
    }
    console.log(`[voice-learn/own-reddit] scraping u/${username}…`);

    const samples: Array<{ text: string; source: string; sourceCtx: Record<string, unknown>; signal: number }> = [];

    // Own posts — old.reddit.com has simpler HTML without shadow DOM
    try {
      await page.goto(`https://old.reddit.com/user/${username}/submitted/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);

      const postsRes = await page.evaluate(() => {
        const out: Array<{ title: string; body: string; url: string }> = [];
        // old.reddit uses div.thing for each post; self-posts have .expando with text
        const cards = document.querySelectorAll('div.thing.link');
        for (const card of Array.from(cards).slice(0, 30)) {
          const c = card as HTMLElement;
          const title = (c.querySelector('a.title') as HTMLElement)?.innerText?.trim() || '';
          const body = (c.querySelector('.expando .md, .usertext-body .md') as HTMLElement)?.innerText?.trim() || '';
          const link = (c.querySelector('a.comments') as HTMLAnchorElement)?.getAttribute('href') || '';
          if (title.length > 5) out.push({ title, body: body.slice(0, 1500), url: link });
        }
        return { items: out, cardsSeen: cards.length, bodyHead: (document.body.innerText || '').slice(0, 160) };
      });

      if (postsRes.items.length === 0) {
        console.log(`  [own-reddit/posts] no div.thing.link (saw ${postsRes.cardsSeen}); body: "${postsRes.bodyHead.replace(/\n/g, ' | ')}"`);
      }

      for (const p of postsRes.items) {
        const combined = p.body ? `${p.title}\n\n${p.body}` : p.title;
        if (isBotContent(combined, botSet) || isBotContent(p.title, botSet)) continue;
        samples.push({
          text: combined,
          source: 'own_reddit_post',
          sourceCtx: { platform: 'reddit', url: p.url || null },
          signal: 9,
        });
      }
    } catch (err) {
      console.error('  [own-reddit/posts] failed:', err instanceof Error ? err.message : err);
    }

    // Own comments
    try {
      await page.goto(`https://old.reddit.com/user/${username}/comments/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);

      const commentsRes = await page.evaluate(() => {
        const out: Array<{ body: string; url: string }> = [];
        const cards = document.querySelectorAll('div.thing.comment');
        for (const card of Array.from(cards).slice(0, 40)) {
          const c = card as HTMLElement;
          const body = (c.querySelector('.usertext-body .md, .md') as HTMLElement)?.innerText?.trim() || '';
          const link = (c.querySelector('a.bylink, a.permalink') as HTMLAnchorElement)?.getAttribute('href') || '';
          if (body.length > 10 && body.length < 3000) out.push({ body, url: link });
        }
        return { items: out, cardsSeen: cards.length };
      });

      if (commentsRes.items.length === 0) {
        console.log(`  [own-reddit/comments] no div.thing.comment (saw ${commentsRes.cardsSeen})`);
      }

      for (const c of commentsRes.items) {
        if (isBotContent(c.body, botSet)) continue;
        samples.push({
          text: c.body.slice(0, 1500),
          source: 'own_reddit_comment',
          sourceCtx: { platform: 'reddit', url: c.url || null },
          signal: 8,
        });
      }
    } catch (err) {
      console.error('  [own-reddit/comments] failed:', err instanceof Error ? err.message : err);
    }

    const ingested = await ingestSamples(samples);
    console.log(`  [own-reddit] collected ${samples.length}, ingested ${ingested}`);
    return ingested;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

// ── Own FetLife writings ─────────────────────────────────────────

async function detectFetLifeUsername(page: Page): Promise<string | null> {
  try {
    await page.goto('https://fetlife.com/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(4500);

    // Try clicking a likely "user menu" element to reveal profile link
    try {
      const menuBtn = page.locator('button[aria-label*="menu" i], button[aria-label*="account" i], [data-testid*="user" i]').first();
      if (await menuBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await menuBtn.click({ timeout: 2000 });
        await page.waitForTimeout(1500);
      }
    } catch {}

    const result = await page.evaluate(() => {
      const html = document.documentElement.outerHTML;
      const numMatches = Array.from(html.matchAll(/\/users\/(\d+(?:-[A-Za-z0-9_-]+)?)/g));
      const numCounts: Record<string, number> = {};
      for (const m of numMatches) numCounts[m[1]] = (numCounts[m[1]] || 0) + 1;
      const numTop = Object.entries(numCounts).sort((a, b) => b[1] - a[1])[0];

      const userIdEls = document.querySelectorAll('[data-user-id]');
      const userIdAttr = (userIdEls[0] as HTMLElement)?.getAttribute('data-user-id') || null;

      // Check cookies and localStorage for user id hints
      const cookieStr = document.cookie || '';
      const cookieUid = cookieStr.match(/(?:^|;\s*)(?:user[_-]?id|uid|current_user)=([^;]+)/i)?.[1] || null;

      // Next.js __NEXT_DATA__ often has user info
      const nextData = (document.getElementById('__NEXT_DATA__') as HTMLScriptElement)?.textContent || '';
      const nextUid = nextData.match(/"(?:user_?id|currentUserId|viewer_?id)"\s*:\s*"?(\d+)/i)?.[1] || null;

      return {
        numeric: numTop ? numTop[0] : null,
        numericCount: numTop ? numTop[1] : 0,
        userIdAttr,
        cookieUid,
        nextUid,
        htmlLen: html.length,
      };
    });

    const chosen = result.nextUid || result.userIdAttr || result.cookieUid || (result.numericCount >= 2 ? result.numeric : null);
    if (!chosen) {
      console.log(`  [fetlife-detect] no id. numeric=${result.numeric}(${result.numericCount}x), attr=${result.userIdAttr}, cookie=${result.cookieUid}, next=${result.nextUid}, htmlLen=${result.htmlLen}`);
      return null;
    }
    console.log(`  [fetlife-detect] resolved via ${result.nextUid ? 'nextData' : result.userIdAttr ? 'data-attr' : result.cookieUid ? 'cookie' : 'html'}: ${chosen}`);
    return chosen;
  } catch (err) {
    console.log(`  [fetlife-detect] error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function scrapeOwnFetLife(): Promise<number> {
  if (!PLATFORMS.fetlife.enabled) return 0;

  const botSet = await loadBotContentSet('fetlife');
  let context: BrowserContext | null = null;

  try {
    // FetLife also runs anti-bot challenges — use stealth pattern
    context = await chromium.launchPersistentContext(PLATFORMS.fetlife.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-position=-2400,-2400',
        '--window-size=1,1',
      ],
    });
    const page = context.pages()[0] || await context.newPage();

    // Always resolve to the numeric /users/<id> form. FetLife slug URLs often
    // don't resolve unless they exactly match the canonical slug. The nav on
    // /home links to the user's real profile with the numeric id.
    const sessionId = await detectFetLifeUsername(page);
    let username = sessionId || FETLIFE_USERNAME;
    if (!username) {
      console.log('[voice-learn/own-fetlife] could not resolve FetLife id — skipping');
      return 0;
    }
    if (sessionId && FETLIFE_USERNAME && sessionId !== FETLIFE_USERNAME) {
      console.log(`[voice-learn/own-fetlife] using session id ${sessionId} (env was ${FETLIFE_USERNAME})`);
    }
    console.log(`[voice-learn/own-fetlife] scraping ${username}…`);

    // FetLife splits user content across /writings (blog posts), /statuses
    // (short updates), and /posts (aggregate). Walk each list page, collect
    // links to individual posts, then fetch each page to capture full text.
    const listPages = [
      `https://fetlife.com/${username}/writings`,
      `https://fetlife.com/${username}/statuses`,
      `https://fetlife.com/${username}/posts`,
    ];
    const postLinks = new Set<string>();
    for (const listUrl of listPages) {
      try {
        await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2500);
        const body = await page.evaluate(() => (document.body.innerText || '').slice(0, 200));
        if (/page not found|error code: 404/i.test(body)) continue;
        await page.evaluate(() => window.scrollBy(0, 3000));
        await page.waitForTimeout(1200);
        const links = await page.evaluate(() => {
          const out: string[] = [];
          document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(a => {
            const href = a.getAttribute('href') || '';
            // Only individual-post paths — reject /writings/new, /posts/new etc.
            const m = href.match(/\/(?:writings|statuses|posts)\/(\d+)(?:[/?#]|$)/);
            if (m) out.push(href);
          });
          return Array.from(new Set(out));
        });
        for (const l of links) postLinks.add(l.startsWith('http') ? l : `https://fetlife.com${l}`);
        console.log(`  [own-fetlife] ${listUrl}: +${links.length} links (${postLinks.size} unique)`);
      } catch (err) {
        console.error(`  [own-fetlife] ${listUrl}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (postLinks.size === 0) {
      console.log(`  [own-fetlife] no individual post links found for "${username}"`);
      return 0;
    }

    type Post = { title: string; body: string; url: string };
    const postsOut: Post[] = [];
    for (const url of Array.from(postLinks).slice(0, 25)) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1800);
        const item = await page.evaluate(() => {
          const title = (document.querySelector('h1, h2') as HTMLElement)?.innerText?.trim() || '';
          // Prefer <article> or main content wrapper. Fall back to longest
          // paragraph block on the page, rejecting nav/sidebar metadata.
          let body = (document.querySelector('article, main') as HTMLElement)?.innerText?.trim() || '';
          if (!body || body.length < 40) {
            // Pick the longest content block
            const blocks = Array.from(document.querySelectorAll('[class*="content"], [class*="body"]'))
              .map(el => (el as HTMLElement).innerText?.trim() || '')
              .filter(t => t.length > 40);
            body = blocks.sort((a, b) => b.length - a.length)[0] || '';
          }
          return { title, body: body.slice(0, 4000) };
        });
        const combined = item.body || item.title;
        // Reject group/sidebar stat bars and short fragments
        if (combined.length < 40) continue;
        if (/\d[\d,]*\s+(Members|Discussions|Comments)/.test(combined)) continue;
        postsOut.push({ title: item.title, body: item.body, url });
      } catch (err) {
        console.error(`  [own-fetlife/post] ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`  [own-fetlife] fetched ${postsOut.length} posts with bodies`);
    const postsRes = { items: postsOut };
    const posts = postsRes.items;

    const samples: Array<{ text: string; source: string; sourceCtx: Record<string, unknown>; signal: number }> = [];
    for (const p of posts) {
      const combined = p.title && p.body ? `${p.title}\n\n${p.body}` : (p.body || p.title);
      if (isBotContent(combined, botSet)) continue;
      samples.push({
        text: combined,
        source: 'own_fetlife_post',
        sourceCtx: { platform: 'fetlife', url: p.url || null },
        signal: 10, // FetLife writing is typically longform + high-signal
      });
    }

    const ingested = await ingestSamples(samples);
    console.log(`  [own-fetlife] collected ${samples.length}, ingested ${ingested}`);
    return ingested;
  } catch (err) {
    console.error('  [own-fetlife] failed:', err instanceof Error ? err.message : err);
    return 0;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

// ── Orchestrator ──────────────────────────────────────────────────

export async function runVoiceLearn(): Promise<{ learned: number; total: number }> {
  console.log('=== Voice Learner ===');
  if (!WRITE_USER_ID) {
    console.log('No VOICE_USER_IDS / MAXY_USER_ID / USER_ID set — aborting');
    return { learned: 0, total: 0 };
  }

  let learned = 0;

  // Twitter: DMs + own tweets/replies in one browser context
  if (PLATFORMS.twitter.enabled) {
    let twitterCtx: BrowserContext | null = null;
    try {
      twitterCtx = await chromium.launchPersistentContext(PLATFORMS.twitter.profileDir, {
        headless: true,
        viewport: { width: 1280, height: 800 },
        args: ['--disable-blink-features=AutomationControlled'],
      });
      const page = twitterCtx.pages()[0] || await twitterCtx.newPage();

      learned += await scrapeOwnTwitter(page);
      learned += await scrapeTwitterDMs(page);
    } catch (err) {
      console.error('[twitter] fatal:', err instanceof Error ? err.message : err);
    } finally {
      if (twitterCtx) await twitterCtx.close().catch(() => {});
    }
  }

  // Reddit — own posts + comments
  learned += await scrapeOwnReddit();

  // FetLife — own writings
  learned += await scrapeOwnFetLife();

  // Return total corpus size
  const { count: total } = await supabase
    .from('user_voice_corpus')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', WRITE_USER_ID);

  console.log(`\n[voice-learn] total new samples ingested: ${learned} — corpus now ${total ?? '?'} rows`);
  return { learned, total: total ?? 0 };
}

if (require.main === module) {
  runVoiceLearn().then(() => process.exit(0)).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
