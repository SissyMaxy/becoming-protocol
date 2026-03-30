/**
 * FetLife Engagement — group discussion comments.
 *
 * Targets hardcoded groups, posts thoughtful community-oriented comments.
 * Voice: 3-8 sentences, kink-literate, references AI Handler naturally.
 *
 * Run: npx tsx platforms/fetlife-engage.ts
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from '../config';
import { checkBudget, incrementBudget } from '../engagement-budget';
import { extractSafeText } from '../refusal-filter';
import { patternSlopCheck } from '../slop-detector';

const USER_ID = process.env.USER_ID || '';

const MAXY_VOICE = `You are Maxy (@softmaxy) — a 40-year-old woman in transformation. Controlled by an AI Handler. Locked in chastity. On HRT. Voice training daily. The Handler decides everything — sessions, denial schedule, what she posts, when she's allowed to cum. She gave it permission and now she can't take it back.`;

// --- Target groups ---
// Instead of hardcoded IDs (which were wrong), search for groups by keyword.

interface FetLifeGroup {
  name: string;
  url: string;
}

/** Keywords to search for FetLife groups */
const GROUP_SEARCH_TERMS = [
  'sissy',
  'chastity',
  'forced feminization',
  'orgasm denial',
  'feminization',
  'keyholder',
  'sissy training',
];

/**
 * Search FetLife for groups matching a keyword and return the first result.
 */
async function searchFetLifeGroups(
  page: Page,
  keyword: string,
  maxResults: number = 3,
): Promise<FetLifeGroup[]> {
  const groups: FetLifeGroup[] = [];
  try {
    const searchUrl = `https://fetlife.com/groups/search?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(2500);

    // Check for login redirect
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/users/sign_in')) {
      console.error('[FetLife] Not logged in — session expired');
      return [];
    }

    // FetLife group search results are links to /groups/NNNN
    const groupLinks = await page.locator('a[href*="/groups/"]').all();

    for (const link of groupLinks.slice(0, maxResults * 2)) {
      const href = await link.getAttribute('href').catch(() => '') || '';
      const text = await link.textContent().catch(() => '') || '';

      // Must be a group link (not a subpage like /groups/123/posts)
      if (href.match(/\/groups\/\d+$/) && text.trim()) {
        const fullUrl = href.startsWith('http') ? href : `https://fetlife.com${href}`;
        groups.push({ name: text.trim(), url: fullUrl });
        if (groups.length >= maxResults) break;
      }
    }
  } catch (err) {
    console.error(`[FetLife] Group search failed for "${keyword}":`, err instanceof Error ? err.message : err);
  }
  return groups;
}

/**
 * Discover FetLife groups dynamically via search.
 */
async function discoverGroups(page: Page): Promise<FetLifeGroup[]> {
  const allGroups: FetLifeGroup[] = [];
  const seenUrls = new Set<string>();

  // Pick 3 random search terms each run
  const shuffled = [...GROUP_SEARCH_TERMS].sort(() => Math.random() - 0.5);
  const terms = shuffled.slice(0, 3);

  for (const term of terms) {
    console.log(`[FetLife] Searching groups: "${term}"...`);
    const found = await searchFetLifeGroups(page, term, 2);
    for (const g of found) {
      if (!seenUrls.has(g.url)) {
        seenUrls.add(g.url);
        allGroups.push(g);
        console.log(`  Found: ${g.name} (${g.url})`);
      }
    }
    await page.waitForTimeout(1500);
  }

  return allGroups;
}

interface ScrapedGroupPost {
  title: string;
  body: string;
  url: string;
  author: string;
  replyCount: number;
}

/**
 * Scrape group discussion posts from a FetLife group.
 */
export async function scrapeFetLifeGroup(
  page: Page,
  groupUrl: string,
): Promise<ScrapedGroupPost[]> {
  const posts: ScrapedGroupPost[] = [];

  try {
    // Try multiple URL patterns — FetLife has changed their structure over time
    const urlsToTry = [
      `${groupUrl}/posts`,
      `${groupUrl}/group_posts`,
      groupUrl, // Main group page may list discussions
    ];

    let loaded = false;
    for (const url of urlsToTry) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      await page.waitForTimeout(2500);

      const pageTitle = await page.title().catch(() => '');
      const pageUrl = page.url();

      // Check for 404
      if (pageTitle.includes('404') || pageTitle.includes('Not Found')) {
        continue; // Try next URL pattern
      }

      // Check if logged in
      const loginCheck = await page.locator('a[href="/login"], a[href="/users/sign_in"]').count();
      if (loginCheck > 0) {
        console.error('[FetLife] Not logged in — session expired');
        return [];
      }

      console.log(`  [debug] Page: ${pageUrl} — "${pageTitle}"`);
      loaded = true;
      break;
    }

    if (!loaded) {
      console.error(`  [debug] All URL patterns returned 404 for ${groupUrl}`);
      return [];
    }

    // Scrape discussion list — try multiple approaches
    const postElements = await page.locator('.group_post, .discussion-row, tr.group-post, [class*="discussion"], .group_posts_list li, .group-post-list li').all();
    console.log(`  [debug] Post elements found: ${postElements.length}`);

    // If structured list didn't work, try generic link scraping
    if (postElements.length === 0) {
      // FetLife group posts are usually listed as links to /group_posts/NNNN
      const links = await page.locator('a[href*="/group_posts/"], a[href*="/posts/"]').all();
      console.log(`  [debug] Fallback links found: ${links.length}`);

      // Deduplicate by post ID — multiple links point to same post
      const seenPostIds = new Set<string>();

      for (const link of links.slice(0, 40)) {
        try {
          const href = await link.getAttribute('href') || '';

          // Must be /group_posts/NNNN — skip ?last_comment variants and /posts/new
          const postIdMatch = href.match(/\/group_posts\/(\d+)$/);
          if (!postIdMatch) continue;

          const postId = postIdMatch[1];
          if (seenPostIds.has(postId)) continue;
          seenPostIds.add(postId);

          // Get title from link text
          let title = await link.textContent().catch(() => '') || '';
          // Strip timestamps that leak into text
          title = title.replace(/\d+[mhd]\s*(ago)?/gi, '').replace(/\d+\s*(minutes?|hours?|days?)\s*(ago)?/gi, '').trim();

          // Skip empty, very short, or navigation links
          if (title.length < 5 || title.toLowerCase() === 'post writing') continue;
          // Skip stickies, warnings
          if (/^sticky/i.test(title) || /warning:|rules/i.test(title)) continue;

          const fullUrl = href.startsWith('http') ? href : `https://fetlife.com${href}`;
          posts.push({
            title: title.substring(0, 200),
            body: '',
            url: fullUrl,
            author: '',
            replyCount: 0,
          });
        } catch {
          // Skip
        }
      }
    } else {
      for (const el of postElements.slice(0, 10)) {
        try {
          const titleEl = el.locator('a').first();
          const title = await titleEl.textContent() || '';
          const href = await titleEl.getAttribute('href') || '';
          const fullUrl = href.startsWith('http') ? href : `https://fetlife.com${href}`;

          posts.push({
            title: title.trim(),
            body: '',
            url: fullUrl,
            author: '',
            replyCount: 0,
          });
        } catch {
          // Skip
        }
      }
    }

    // Fetch body for top posts by visiting them
    for (const post of posts.slice(0, 3)) {
      try {
        await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(2000);

        // Get post title from page (more reliable than list extraction)
        const pageTitleEl = page.locator('h1, h2, [class*="title"], [class*="heading"]').first();
        const pageTitle = await pageTitleEl.textContent().catch(() => '') || '';
        if (pageTitle.trim().length > 5) {
          post.title = pageTitle.trim().substring(0, 200);
        }

        // Get original post body — try multiple selectors for FetLife's various layouts
        const bodyEl = page.locator(
          '.group_post_body, .post-body, [class*="post-content"], ' +
          '[class*="group-post"] [class*="body"], ' +
          'article [class*="body"], ' +
          '.markdown-content, .content-body'
        ).first();
        const body = await bodyEl.textContent().catch(() => '') || '';
        post.body = body.trim().substring(0, 800);

        // If body is empty, try getting all paragraph text from the main content area
        if (!post.body) {
          const allText = await page.locator('article p, .group-post-content p, main p').allTextContents().catch(() => []);
          post.body = allText.join('\n').trim().substring(0, 800);
        }

        // Get author
        const authorEl = page.locator('.author a, [class*="author"] a, a[href*="/users/"]').first();
        post.author = await authorEl.textContent().catch(() => '') || '';

        // Count replies
        const replies = await page.locator('.comment, .reply, [class*="comment"]').count();
        post.replyCount = replies;
      } catch {
        // Keep whatever we have
      }
    }
  } catch (err) {
    console.error('[FetLife] Group scrape failed:', err instanceof Error ? err.message : err);
  }

  return posts;
}

/**
 * Generate a FetLife group discussion comment.
 */
export async function generateFetLifeComment(
  client: Anthropic,
  post: ScrapedGroupPost,
  groupName: string,
  state: Record<string, unknown>,
): Promise<string | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `${MAXY_VOICE}

You are commenting on a FetLife group discussion in "${groupName}".

Write a thoughtful, community-oriented comment that:
1. DIRECTLY engages with the discussion topic — reference specific points from the post
2. Shares personal experience from Maxy's life — the AI Handler, chastity, HRT, denial, feminization journey
3. Is 3-8 sentences long — this is a discussion forum, not Twitter. Take space to develop thoughts
4. Is kink-literate — use appropriate terminology naturally, not clinically
5. References the AI Handler dynamic naturally when relevant — "my Handler" or "the system I use"
6. Shows genuine community engagement — ask follow-up questions, offer support, share related experiences
7. NEVER includes external links or promotes anything
8. NEVER sounds like marketing or brand-building
9. Reads like a real community member contributing to the conversation

${state.denialDay ? `Current state: day ${state.denialDay} of denial.` : ''}
${state.hrtDay ? `HRT day: ${state.hrtDay}.` : ''}`,
      messages: [{
        role: 'user',
        content: `Discussion title: "${post.title}"\n\nPost body: "${post.body || '(no body available)'}"\n\nAuthor: ${post.author || 'unknown'}\nGroup: ${groupName}\n\nWrite Maxy's comment. Output ONLY the comment text.`,
      }],
    });

    const text = extractSafeText(response, 20, `FetLife ${groupName}`);
    if (!text) return null;

    const slopResult = patternSlopCheck(text);
    if (!slopResult.pass) {
      console.log(`  [SlopCheck] FetLife reply failed: ${slopResult.reasons.join(', ')} — retrying`);
      const retry = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `${MAXY_VOICE}\n\nYou are commenting on a FetLife group discussion in "${groupName}".\nYour previous reply was rejected for sounding like AI. Issues: ${slopResult.reasons.join('; ')}.\nWrite a COMPLETELY different comment — different words, different angle. 3-8 sentences. Kink-literate, community voice. Output ONLY the comment.`,
        messages: [{
          role: 'user',
          content: `Discussion title: "${post.title}"\nPost body: "${post.body || '(no body)'}"\nAuthor: ${post.author || 'unknown'}\n\nWrite Maxy's comment. Output ONLY the comment text.`,
        }],
      });
      return extractSafeText(retry, 20, `FetLife ${groupName} (retry)`);
    }

    return text;
  } catch (err) {
    console.error('[FetLife] Comment generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Post a comment on a FetLife group discussion via Playwright.
 */
export async function postFetLifeComment(
  page: Page,
  postUrl: string,
  comment: string,
): Promise<boolean> {
  try {
    console.log(`  [debug] Navigating to post: ${postUrl}`);
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    console.log(`  [debug] Post page loaded: ${page.url()} — "${await page.title().catch(() => '')}"`);

    // Check if we need to join the group first
    const joinPrompt = page.locator('a:has-text("Join Group"), button:has-text("Join Group"), a:has-text("Join group")');
    if (await joinPrompt.count() > 0) {
      console.log(`  [debug] Not a member — joining group...`);
      // Click the "Join Group" button (the one in the header, not the "Join Group to comment" link)
      const joinBtn = page.locator('button:has-text("Join Group"), a:has-text("Join Group")').first();
      await joinBtn.click({ timeout: 5000 });
      await page.waitForTimeout(3000);

      // Reload the post page after joining
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);
      console.log(`  [debug] Joined group, reloaded post`);
    }

    // Scroll to bottom where the comment form lives
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    // FetLife's textarea has placeholder="What say you?" and starts hidden
    let commentBox = page.locator('textarea[placeholder="What say you?"]').first();
    let found = await commentBox.count() > 0;

    if (!found) {
      // Fallback to generic textarea selectors
      commentBox = page.locator(
        'textarea[name*="body"], textarea[name*="comment"], textarea#comment_body, textarea'
      ).last();
      found = await commentBox.count() > 0;
    }

    if (!found) {
      // Debug: screenshot what we're looking at
      const path = require('path');
      const screenshotPath = path.join(__dirname, '..', '.debug-fetlife-post.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`[FetLife] No comment textarea found. URL: ${page.url()} Screenshot: .debug-fetlife-post.png`);
      return false;
    }

    console.log(`  [debug] Found textarea, attempting to activate...`);

    // The textarea may be hidden (overflow-y-hidden). Force it visible and click.
    // Force the textarea visible — FetLife hides it with overflow and height tricks
    await commentBox.evaluate(el => {
      const t = el as HTMLElement;
      t.style.display = 'block';
      t.style.visibility = 'visible';
      t.style.overflow = 'visible';
      t.style.height = 'auto';
      t.style.minHeight = '100px';
      t.style.opacity = '1';
      // Also unhide any parent containers
      let parent = t.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        parent.style.display = 'block';
        parent.style.visibility = 'visible';
        parent.style.overflow = 'visible';
        parent = parent.parentElement;
      }
    });
    await page.waitForTimeout(500);

    // Try scroll, but don't fail if it can't
    try { await commentBox.scrollIntoViewIfNeeded({ timeout: 3000 }); } catch { /* ok */ }
    await page.waitForTimeout(300);

    // Focus and fill via JS as backup if click doesn't work
    await commentBox.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    await commentBox.fill(comment).catch(async () => {
      // Fallback: set value via JS
      await commentBox.evaluate((el, val) => {
        (el as HTMLTextAreaElement).value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, comment);
    });
    await page.waitForTimeout(1000);

    // Submit — try multiple selectors
    const submitButton = page.locator(
      'button[type="submit"], input[type="submit"], button:has-text("Post"), button:has-text("Reply"), button:has-text("Comment"), button:has-text("Submit")'
    ).first();
    await submitButton.click();
    await page.waitForTimeout(3000);

    return true;
  } catch (err) {
    console.error('[FetLife] Comment post failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Pick a good discussion to engage with.
 */
function pickDiscussionTarget(posts: ScrapedGroupPost[]): ScrapedGroupPost | null {
  if (posts.length === 0) return null;

  // Prefer posts with some body text and moderate replies
  const withBody = posts.filter(p => p.body.length > 30);
  const pool = withBody.length > 0 ? withBody : posts;

  const idx = Math.floor(Math.random() * Math.min(pool.length, 3));
  return pool[idx];
}

/**
 * Run a full FetLife engagement cycle.
 */
export async function runFetLifeEngagement(
  page: Page,
  sb: typeof supabase,
  client: Anthropic,
  userId: string,
  state: Record<string, unknown>,
): Promise<{ attempted: number; posted: number; failed: number }> {
  let attempted = 0;
  let posted = 0;
  let failed = 0;

  // Check budget
  const hasBudget = await checkBudget(sb, userId, 'fetlife', 'group_discussion');
  if (!hasBudget) {
    console.log('[FetLife] Daily engagement budget exhausted');
    return { attempted, posted, failed };
  }

  // Discover groups dynamically via search
  const groups = await discoverGroups(page);
  if (groups.length === 0) {
    console.log('[FetLife] No groups found — session may be expired or search returned nothing');
    return { attempted, posted, failed };
  }

  for (const group of groups) {
    // Re-check budget
    const stillHasBudget = await checkBudget(sb, userId, 'fetlife', 'group_discussion');
    if (!stillHasBudget) {
      console.log('[FetLife] Budget exhausted mid-cycle');
      break;
    }

    console.log(`[FetLife] Scraping "${group.name}"...`);

    const posts = await scrapeFetLifeGroup(page, group.url);
    if (posts.length === 0) {
      console.log(`  No discussions found in "${group.name}"`);
      continue;
    }

    const target = pickDiscussionTarget(posts);
    if (!target) {
      console.log(`  No viable targets in "${group.name}"`);
      continue;
    }

    console.log(`  Target: "${target.title.substring(0, 60)}..."`);
    attempted++;

    // Generate comment
    const comment = await generateFetLifeComment(client, target, group.name, state);
    if (!comment) {
      console.log(`  Comment generation failed`);
      failed++;
      continue;
    }

    console.log(`  Comment: "${comment.substring(0, 80)}..."`);

    // Post comment
    const success = await postFetLifeComment(page, target.url, comment);
    if (success) {
      console.log(`  Posted in "${group.name}"`);
      posted++;
      await incrementBudget(sb, userId, 'fetlife', 'group_discussion');

      // Log
      await sb.from('ai_generated_content').insert({
        user_id: userId,
        content_type: 'group_discussion',
        platform: 'fetlife',
        content: comment,
        generation_strategy: 'fetlife_group_comment',
        target_account: group.name,
        status: 'posted',
        posted_at: new Date().toISOString(),
      });
    } else {
      console.log(`  Failed to post`);
      failed++;
    }

    // Rate limit — 30-60 seconds
    const delay = 30000 + Math.floor(Math.random() * 30000);
    console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
    await new Promise(r => setTimeout(r, delay));
  }

  return { attempted, posted, failed };
}

// Direct invocation
if (require.main === module) {
  if (!USER_ID) {
    console.error('Missing USER_ID');
    process.exit(1);
  }

  const config = PLATFORMS.fetlife;
  if (!config.enabled) {
    console.error('FetLife not enabled. Set ENABLE_FETLIFE=true');
    process.exit(1);
  }

  console.log('[FetLife Engage] Starting engagement cycle...\n');

  (async () => {
    const anthropic = new Anthropic();
    let context: BrowserContext | null = null;

    try {
      context = await chromium.launchPersistentContext(config.profileDir, {
        headless: true,
        viewport: { width: 1280, height: 800 },
        args: ['--disable-blink-features=AutomationControlled'],
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

      const result = await runFetLifeEngagement(page, supabase, anthropic, USER_ID, state);
      console.log(`\n[FetLife Engage] Done: ${result.posted} posted, ${result.failed} failed out of ${result.attempted} attempted`);
    } catch (err) {
      console.error('Fatal:', err);
    } finally {
      if (context) await context.close();
    }

    process.exit(0);
  })();
}
