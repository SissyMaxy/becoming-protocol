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

const USER_ID = process.env.USER_ID || '';

const MAXY_VOICE = `You are Maxy (@softmaxy) — a 40-year-old woman in transformation. Controlled by an AI Handler. Locked in chastity. On HRT. Voice training daily. The Handler decides everything — sessions, denial schedule, what she posts, when she's allowed to cum. She gave it permission and now she can't take it back.`;

// --- Target groups ---

interface FetLifeGroup {
  name: string;
  url: string;
}

const TARGET_GROUPS: FetLifeGroup[] = [
  { name: 'Sissies and Admirers', url: 'https://fetlife.com/groups/53' },
  { name: 'Chastity Lifestyle', url: 'https://fetlife.com/groups/162' },
  { name: 'Forced Feminization', url: 'https://fetlife.com/groups/370' },
  { name: 'AI and Tech Kink', url: 'https://fetlife.com/groups/198322' },
  { name: 'Orgasm Denial and Control', url: 'https://fetlife.com/groups/1199' },
];

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
    // Navigate to group discussions
    const discussionsUrl = groupUrl.endsWith('/') ? `${groupUrl}group_posts` : `${groupUrl}/group_posts`;
    await page.goto(discussionsUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Check if logged in
    const loginCheck = await page.locator('a[href="/login"]').count();
    if (loginCheck > 0) {
      console.error('[FetLife] Not logged in');
      return [];
    }

    // Scrape discussion list
    const postElements = await page.locator('.group_post, .discussion-row, tr.group-post, [class*="discussion"]').all();

    // If structured list didn't work, try generic link scraping
    if (postElements.length === 0) {
      // FetLife group posts are usually listed as links
      const links = await page.locator('a[href*="/group_posts/"]').all();

      for (const link of links.slice(0, 10)) {
        try {
          const title = await link.textContent() || '';
          const href = await link.getAttribute('href') || '';
          if (title.trim() && href) {
            const fullUrl = href.startsWith('http') ? href : `https://fetlife.com${href}`;
            posts.push({
              title: title.trim(),
              body: '',
              url: fullUrl,
              author: '',
              replyCount: 0,
            });
          }
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

        // Get original post body
        const bodyEl = page.locator('.group_post_body, .post-body, [class*="post-content"], .comment-body').first();
        const body = await bodyEl.textContent().catch(() => '') || '';
        post.body = body.trim().substring(0, 800);

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

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    if (!text || text.length < 20) return null;

    return text.replace(/^["']|["']$/g, '').trim();
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
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Find the comment/reply textarea
    const commentBox = page.locator(
      'textarea[name*="body"], textarea[name*="comment"], textarea#comment_body, textarea.comment-box, textarea'
    ).last();
    await commentBox.waitFor({ timeout: 8000 });
    await commentBox.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await commentBox.click();
    await page.waitForTimeout(500);
    await commentBox.fill(comment);
    await page.waitForTimeout(1000);

    // Submit
    const submitButton = page.locator(
      'button[type="submit"]:near(textarea), input[type="submit"]:near(textarea), button:has-text("Post"), button:has-text("Reply"), button:has-text("Comment")'
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

  // Shuffle groups
  const shuffled = [...TARGET_GROUPS].sort(() => Math.random() - 0.5);

  for (const group of shuffled) {
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
