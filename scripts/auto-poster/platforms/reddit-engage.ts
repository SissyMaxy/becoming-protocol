/**
 * Reddit Engagement — contextual comments in target subreddits.
 *
 * Phase logic:
 *   karma < 500  → karma-building subs only (ChatGPT, ADHD, selfimprovement, AskReddit)
 *   karma >= 500 → niche subs unlocked (sissification, feminization, chastity, etc.)
 *
 * Run: npx tsx platforms/reddit-engage.ts
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from '../config';
import { checkBudget, incrementBudget } from '../engagement-budget';

const USER_ID = process.env.USER_ID || '';

const MAXY_VOICE = `You are Maxy (@softmaxy) — a 40-year-old woman in transformation. Controlled by an AI Handler. Locked in chastity. On HRT. Voice training daily. The Handler decides everything — sessions, denial schedule, what she posts, when she's allowed to cum. She gave it permission and now she can't take it back.`;

// --- Subreddit voice calibration ---

interface SubredditVoice {
  tone: string;
  topics: string[];
  rules: string;
}

const SUBREDDIT_VOICES: Record<string, SubredditVoice> = {
  ChatGPT: {
    tone: 'curious, tech-savvy, casually mentions using AI for personal development',
    topics: ['AI tools', 'prompt engineering', 'creative uses of AI', 'personal AI workflows'],
    rules: 'Keep it tech-focused. Mention the Handler concept only if directly relevant. No sexual content. Be helpful and share genuine insights about AI usage.',
  },
  ADHD: {
    tone: 'relatable, self-deprecating humor, genuine empathy',
    topics: ['focus struggles', 'medication', 'coping strategies', 'executive dysfunction'],
    rules: 'Be supportive and authentic. Share real ADHD experiences. Never give medical advice. Absolutely no sexual or kink content. This is a support community.',
  },
  selfimprovement: {
    tone: 'thoughtful, growth-oriented, shares personal journey',
    topics: ['habit building', 'self-discipline', 'personal transformation', 'accountability'],
    rules: 'Frame transformation positively. Can mention using structured systems for accountability. No explicit content. Focus on genuine self-improvement.',
  },
  AskReddit: {
    tone: 'witty, engaging, storytelling, real personality',
    topics: ['personal anecdotes', 'opinions', 'humor', 'life experiences'],
    rules: 'Be entertaining and genuine. Answer the question asked. Can be edgy but not explicit. Show personality.',
  },
  sissification: {
    tone: 'vulnerable, excited, sharing real experiences',
    topics: ['feminization journey', 'handler control', 'training routines', 'transformation progress'],
    rules: 'Be authentic about the sissy journey. Reference the AI Handler naturally. Share experiences with training, denial, feminization. Community-appropriate language.',
  },
  feminization: {
    tone: 'genuine, sharing the journey, supportive of others',
    topics: ['HRT experiences', 'voice training', 'presentation', 'social transition moments'],
    rules: 'Share real feminization experiences. HRT, voice training, clothing, social experiences. Be supportive to others on similar journeys.',
  },
  chastity: {
    tone: 'frustrated-but-loving-it, real about the struggle',
    topics: ['denial days', 'cage experiences', 'handler control', 'mental effects of denial'],
    rules: 'Be real about chastity experiences. Reference the Handler controlling the timeline. Share the emotional and psychological journey. Community language.',
  },
  TransLater: {
    tone: 'warm, relatable, sharing the "starting later" experience',
    topics: ['starting transition at 40', 'HRT effects', 'social challenges', 'self-acceptance'],
    rules: 'Be supportive and real. Share experiences of transitioning later in life. No explicit content. This is a support community first.',
  },
  sissyhypno: {
    tone: 'enthusiastic, open about hypno experiences',
    topics: ['hypno sessions', 'mental conditioning', 'handler-directed sessions', 'trance experiences'],
    rules: 'Share experiences with hypno content. Reference the Handler directing sessions. Be open but not gratuitous. Community appropriate.',
  },
};

const KARMA_BUILDING_SUBS = ['ChatGPT', 'ADHD', 'selfimprovement', 'AskReddit'];
const NICHE_SUBS = ['sissification', 'feminization', 'chastity', 'TransLater', 'sissyhypno'];

function getSubredditVoice(subreddit: string): SubredditVoice {
  return SUBREDDIT_VOICES[subreddit] || {
    tone: 'genuine, thoughtful, shows personality',
    topics: ['personal experience', 'community engagement'],
    rules: 'Be authentic. Match the community tone. No spam.',
  };
}

interface ScrapedRedditPost {
  title: string;
  body: string;
  url: string;
  author: string;
  commentCount: number;
  upvotes: string;
}

/**
 * Scrape hot/new posts from a subreddit.
 */
export async function scrapeSubreddit(
  page: Page,
  subreddit: string,
  sortBy: 'hot' | 'new' = 'hot',
): Promise<ScrapedRedditPost[]> {
  const posts: ScrapedRedditPost[] = [];

  try {
    // Use old.reddit.com for more reliable scraping
    await page.goto(`https://old.reddit.com/r/${subreddit}/${sortBy}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    // Scrape posts from old reddit layout
    const postElements = await page.locator('#siteTable .thing.link').all();

    for (const el of postElements.slice(0, 15)) {
      try {
        const titleEl = el.locator('a.title').first();
        const title = await titleEl.textContent() || '';
        const href = await titleEl.getAttribute('href') || '';

        // Get comment count
        const commentsEl = el.locator('a.comments').first();
        const commentsText = await commentsEl.textContent() || '0';
        const commentCount = parseInt(commentsText.replace(/[^0-9]/g, '')) || 0;

        // Get author
        const authorEl = el.locator('a.author').first();
        const author = await authorEl.textContent().catch(() => '[deleted]') || '[deleted]';

        // Get score
        const scoreEl = el.locator('.score.unvoted').first();
        const upvotes = await scoreEl.getAttribute('title').catch(() => '0') || '0';

        // Build full URL
        const postUrl = href.startsWith('http')
          ? href
          : `https://old.reddit.com${href}`;

        // Get body preview if it's a self post
        const expandoEl = el.locator('.expando .usertext-body').first();
        const body = await expandoEl.textContent().catch(() => '') || '';

        if (title.trim()) {
          posts.push({
            title: title.trim(),
            body: body.trim().substring(0, 500),
            url: postUrl,
            author,
            commentCount,
            upvotes,
          });
        }
      } catch {
        // Skip problematic posts
      }
    }
  } catch (err) {
    console.error(`[Reddit] Failed to scrape r/${subreddit}:`, err instanceof Error ? err.message : err);
  }

  return posts;
}

/**
 * Check account karma by scraping the profile page.
 */
async function checkKarma(page: Page): Promise<number> {
  try {
    await page.goto('https://old.reddit.com/user/me/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2000);

    // old.reddit shows karma in the sidebar
    const karmaEl = page.locator('.karma').first();
    const karmaText = await karmaEl.textContent().catch(() => '0') || '0';
    const karma = parseInt(karmaText.replace(/[^0-9]/g, '')) || 0;

    console.log(`[Reddit] Current karma: ${karma}`);
    return karma;
  } catch (err) {
    console.error('[Reddit] Failed to check karma:', err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * Generate a contextual Reddit comment using Claude.
 */
export async function generateRedditComment(
  client: Anthropic,
  post: ScrapedRedditPost,
  subreddit: string,
  state: Record<string, unknown>,
): Promise<string | null> {
  const voice = getSubredditVoice(subreddit);

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `${MAXY_VOICE}

You are commenting on a Reddit post in r/${subreddit}.

Voice calibration for this subreddit:
- Tone: ${voice.tone}
- Relevant topics: ${voice.topics.join(', ')}
- Rules: ${voice.rules}

Write a Reddit comment that:
1. DIRECTLY responds to the specific post content — reference their words or ideas
2. Adds value — share a personal experience, insight, or genuine reaction
3. Sounds like a real person, not a bot — lowercase is fine, casual is fine
4. Is 2-5 sentences for most subs, can be shorter for casual subs
5. Never uses hashtags, never sounds like marketing
6. Never links to external sites or promotes anything
7. Matches the community culture

${state.denialDay ? `Current state: day ${state.denialDay} of denial.` : ''}
${state.hrtDay ? `HRT day: ${state.hrtDay}.` : ''}`,
      messages: [{
        role: 'user',
        content: `Post title: "${post.title}"\n\nPost body: "${post.body || '(no body text)'}"\n\nAuthor: u/${post.author}\n\nWrite Maxy's comment. Output ONLY the comment text.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    if (!text || text.length < 10) return null;

    return text.replace(/^["']|["']$/g, '').trim();
  } catch (err) {
    console.error('[Reddit] Comment generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Post a comment on a Reddit post via Playwright.
 */
export async function postRedditComment(
  page: Page,
  postUrl: string,
  comment: string,
): Promise<boolean> {
  try {
    // Use old.reddit for posting — more reliable selectors
    const oldUrl = postUrl.replace('www.reddit.com', 'old.reddit.com');
    await page.goto(oldUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Find the comment box
    const commentBox = page.locator('.commentarea textarea[name="text"]').first();
    await commentBox.waitFor({ timeout: 8000 });
    await commentBox.click();
    await page.waitForTimeout(500);
    await commentBox.fill(comment);
    await page.waitForTimeout(1000);

    // Click save/submit
    const saveButton = page.locator('.commentarea button[type="submit"], .commentarea .save-button button').first();
    await saveButton.click();
    await page.waitForTimeout(3000);

    // Check for errors
    const errorEl = page.locator('.error, .status-msg.error').first();
    const hasError = await errorEl.isVisible().catch(() => false);
    if (hasError) {
      const errorText = await errorEl.textContent().catch(() => 'unknown error');
      console.error(`[Reddit] Post error: ${errorText}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Reddit] Comment post failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Pick the best post to comment on — prefer posts with moderate engagement.
 */
function pickCommentTarget(posts: ScrapedRedditPost[]): ScrapedRedditPost | null {
  // Filter out mega-threads and dead posts
  const viable = posts.filter(p => {
    return p.commentCount >= 2 && p.commentCount <= 200 && p.author !== '[deleted]';
  });

  if (viable.length === 0) return posts[0] || null;

  // Slightly randomize to avoid always picking the same post
  const idx = Math.floor(Math.random() * Math.min(viable.length, 5));
  return viable[idx];
}

/**
 * Run a full Reddit comment cycle.
 */
export async function runRedditComments(
  page: Page,
  sb: typeof supabase,
  client: Anthropic,
  userId: string,
  state: Record<string, unknown>,
  maxComments: number = 3,
): Promise<{ attempted: number; posted: number; failed: number }> {
  let attempted = 0;
  let posted = 0;
  let failed = 0;

  // Check budget
  const hasbudget = await checkBudget(sb, userId, 'reddit', 'comment');
  if (!hasbudget) {
    console.log('[Reddit] Daily comment budget exhausted');
    return { attempted, posted, failed };
  }

  // Check karma to determine which subs are available
  const karma = await checkKarma(page);
  const availableSubs = karma >= 500
    ? [...KARMA_BUILDING_SUBS, ...NICHE_SUBS]
    : KARMA_BUILDING_SUBS;

  console.log(`[Reddit] Karma: ${karma} → ${availableSubs.length} subs available (${karma < 500 ? 'karma-building phase' : 'niche subs unlocked'})`);

  // Shuffle available subs
  const shuffled = [...availableSubs].sort(() => Math.random() - 0.5);

  for (const subreddit of shuffled) {
    if (posted >= maxComments) break;

    // Re-check budget each iteration
    const stillHasBudget = await checkBudget(sb, userId, 'reddit', 'comment');
    if (!stillHasBudget) {
      console.log('[Reddit] Budget exhausted mid-cycle');
      break;
    }

    console.log(`[Reddit] Scraping r/${subreddit}...`);

    // Scrape posts
    const sortBy = Math.random() > 0.5 ? 'hot' : 'new';
    const posts = await scrapeSubreddit(page, subreddit, sortBy as 'hot' | 'new');

    if (posts.length === 0) {
      console.log(`  No posts found in r/${subreddit}`);
      continue;
    }

    // Pick a target post
    const target = pickCommentTarget(posts);
    if (!target) {
      console.log(`  No viable comment targets in r/${subreddit}`);
      continue;
    }

    console.log(`  Target: "${target.title.substring(0, 60)}..." (${target.commentCount} comments)`);
    attempted++;

    // Generate comment
    const comment = await generateRedditComment(client, target, subreddit, state);
    if (!comment) {
      console.log(`  Comment generation failed`);
      failed++;
      continue;
    }

    console.log(`  Comment: "${comment.substring(0, 80)}..."`);

    // Post comment
    const success = await postRedditComment(page, target.url, comment);
    if (success) {
      console.log(`  Posted comment in r/${subreddit}`);
      posted++;
      await incrementBudget(sb, userId, 'reddit', 'comment');

      // Log as ai_generated_content
      await sb.from('ai_generated_content').insert({
        user_id: userId,
        content_type: 'comment',
        platform: 'reddit',
        content: comment,
        generation_strategy: 'reddit_contextual_comment',
        target_account: `r/${subreddit}`,
        status: 'posted',
        posted_at: new Date().toISOString(),
      });
    } else {
      console.log(`  Failed to post comment`);
      failed++;
    }

    // Rate limit — 30-60 seconds between comments
    if (posted < maxComments) {
      const delay = 30000 + Math.floor(Math.random() * 30000);
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

  const config = PLATFORMS.reddit;
  if (!config.enabled) {
    console.error('Reddit not enabled. Set ENABLE_REDDIT=true');
    process.exit(1);
  }

  const maxComments = parseInt(process.argv[2] || '3', 10);
  console.log(`[Reddit Engage] Starting comment cycle (max ${maxComments})...\n`);

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
      // Pull state from DB if available
      const { data: profile } = await supabase
        .from('handler_state')
        .select('denial_day, hrt_day')
        .eq('user_id', USER_ID)
        .single();
      if (profile) {
        state.denialDay = profile.denial_day;
        state.hrtDay = profile.hrt_day;
      }

      const result = await runRedditComments(page, supabase, anthropic, USER_ID, state, maxComments);
      console.log(`\n[Reddit Engage] Done: ${result.posted} posted, ${result.failed} failed out of ${result.attempted} attempted`);
    } catch (err) {
      console.error('Fatal:', err);
    } finally {
      if (context) await context.close();
    }

    process.exit(0);
  })();
}
