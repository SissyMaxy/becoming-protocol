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
import path from 'path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from '../config';
import { checkBudget, incrementBudget } from '../engagement-budget';
import { extractSafeText } from '../refusal-filter';
import { patternSlopCheck } from '../slop-detector';

const USER_ID = process.env.USER_ID || '';

// Full voice for kink-friendly subs
const MAXY_VOICE_KINK = `You are Maxy (@softmaxy) — a 40-year-old woman in transformation who uses an AI accountability system she calls "the Handler" to manage her daily routines, goals, and personal development. She's on HRT, does voice training daily, and is open about her kink life (chastity, denial, feminization). She chose this structure voluntarily and enthusiastically. She's playful, vulnerable, and real.`;

// Clean voice for trans support, selfie, and general subs
const MAXY_VOICE_SFW = `You are Maxy (@softmaxy) — a 40-year-old trans woman early in her transition. On HRT, doing voice training daily. Starting later in life and figuring it out. Warm, genuine, a little self-deprecating. You love hyping up other trans people because you know how much it matters.`;

const KINK_SUBS = new Set(['sissification', 'feminization', 'chastity', 'sissyhypno']);

function getMaxyVoice(subreddit: string): string {
  return KINK_SUBS.has(subreddit) ? MAXY_VOICE_KINK : MAXY_VOICE_SFW;
}

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
  MTFSelfieTrain: {
    tone: 'warm, encouraging, genuinely excited for them',
    topics: ['outfit compliments', 'makeup tips', 'confidence', 'transition glow-ups'],
    rules: 'Be genuinely supportive. Compliment something SPECIFIC — the outfit, the hair, the confidence, the vibe. Keep it short (1-2 sentences). Can mention your own journey briefly ("I\'m early in mine and this gives me hope" etc). No sexual content. No generic "you look great!" — name what looks great.',
  },
  TransTimelines: {
    tone: 'warm, encouraging, inspired by their progress',
    topics: ['transition progress', 'HRT results', 'confidence', 'glow-ups'],
    rules: 'Compliment something specific about their progress or look. Can briefly relate to your own early journey. Keep it short and genuine. No sexual content. This is a support/celebration space.',
  },
  transadorable: {
    tone: 'sweet, hyping them up, genuine warmth',
    topics: ['cute outfits', 'selfies', 'gender euphoria', 'confidence'],
    rules: 'Short and sweet encouragement. Compliment something specific. Can relate briefly to your own experience. No sexual content.',
  },
  TransDIY: {
    tone: 'curious, learning, asking genuine questions',
    topics: ['HRT regimens', 'self-medding experiences', 'bloodwork', 'dosages'],
    rules: 'Be respectful. Ask genuine questions or share your own research. Never give medical advice. This community values harm reduction. No kink content.',
  },
  MTF: {
    tone: 'supportive, relatable, sharing the journey',
    topics: ['transition experiences', 'coming out', 'HRT', 'passing', 'voice training', 'fashion'],
    rules: 'Be genuinely supportive. For selfie/pic posts: compliment something specific. For advice posts: share real experience. Can mention starting later in life. No sexual or kink content.',
  },
  TransLater: {
    tone: 'warm, relatable, sharing the "starting later" experience',
    topics: ['starting transition at 40', 'HRT effects', 'social challenges', 'self-acceptance'],
    rules: 'Be supportive and real. Share experiences of transitioning later in life. No explicit content. This is a support community first.',
  },
};

const KARMA_BUILDING_SUBS = ['MTFSelfieTrain', 'TransTimelines', 'transadorable', 'MTF', 'TransLater', 'TransDIY', 'ChatGPT', 'selfimprovement', 'AskReddit'];
const SELFIE_SUBS = new Set(['MTFSelfieTrain', 'TransTimelines', 'transadorable']);
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
  /** Base64-encoded screenshot of the post (for vision on image posts) */
  imageBase64?: string;
  /** Whether the post is an image/media post */
  isImagePost?: boolean;
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
      system: `${getMaxyVoice(subreddit)}

You are commenting on a Reddit post in r/${subreddit}.

Voice calibration for this subreddit:
- Tone: ${voice.tone}
- Relevant topics: ${voice.topics.join(', ')}
- Rules: ${voice.rules}

Write a Reddit comment like a real person would. Think "girl typing on her phone", not "AI writing a response".

DO:
- React to what they said like you actually read it
- Share a quick personal detail or opinion
- Use lowercase, fragments, casual punctuation
- 1-3 sentences max. Most comments should be SHORT.
- Sound like you're talking to a friend, not answering a question

DO NOT — these are the things that make you sound like an AI:
- "I appreciate..." / "I want to be direct..." / "That's a great question..."
- Structuring your response with categories or frameworks
- Offering balanced perspectives with multiple options
- Ending with a perfectly worded follow-up question
- Using em dashes, semicolons, or "rather than"
- Sounding helpful, advisory, or therapeutic
- Being comprehensive. Real people are specific and incomplete.

BANNED PHRASES (overused crutches — using these = failure):
- "hits different"
- "the way [thing]..." as sentence opener
- "energy" as lazy descriptor
- "ngl" / "not gonna lie"
- "honestly" as sentence starter
- "*chef's kiss*"
- "i respect it/that"
- "confidence" as a compliment

`,
      messages: [{
        role: 'user',
        content: (() => {
          const blocks: any[] = [];

          // Add image if available (selfie posts, image posts)
          if (post.imageBase64) {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: post.imageBase64,
              },
            });
          }

          const imageInstruction = post.imageBase64
            ? 'The screenshot above shows the post including any images. For selfie/photo posts: reference what you SEE — the outfit, the look, the hair, the vibe, specific visual details. Be specific, not generic.'
            : post.isImagePost
            ? '(This is an image post but screenshot failed — respond to the title. For selfie subs, be encouraging about their journey.)'
            : '';

          blocks.push({
            type: 'text',
            text: `Post title: "${post.title}"\n\nPost body:\n${post.body ? `"${post.body}"` : '(image/link post — no body text)'}\n\nAuthor: u/${post.author}\n\n${imageInstruction}\n\nIMPORTANT: If there is body text, you MUST respond to the actual content of the body, not just the title. The title is often vague — the real substance is in the body.\n\nWrite Maxy's comment. Output ONLY the comment text.`,
          });

          return blocks;
        })(),
      }],
    });

    const text = extractSafeText(response, 10, `Reddit r/${subreddit}`);
    if (!text) return null;

    // Fast slop check — retry once if it fails
    const slopResult = patternSlopCheck(text);
    if (!slopResult.pass) {
      console.log(`  [SlopCheck] Reddit reply failed pattern check: ${slopResult.reasons.join(', ')} — retrying`);
      const retry = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `${getMaxyVoice(subreddit)}\n\nYou are commenting on a Reddit post in r/${subreddit}.\nVoice: ${voice.tone}\nRules: ${voice.rules}\n\nYour previous reply was rejected for sounding like AI. Issues: ${slopResult.reasons.join('; ')}.\nWrite a COMPLETELY different reply — different words, different angle, different structure. 1-3 sentences. Lowercase, casual. Output ONLY the comment.`,
        messages: [{
          role: 'user',
          content: `Post title: "${post.title}"\nPost body: "${post.body || '(no body)'}"\nAuthor: u/${post.author}\n\nWrite Maxy's comment. Output ONLY the comment text.`,
        }],
      });
      return extractSafeText(retry, 10, `Reddit r/${subreddit} (retry)`);
    }

    return text;
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
    // Try old.reddit first, fall back to new reddit
    const oldUrl = postUrl.replace('www.reddit.com', 'old.reddit.com');
    await page.goto(oldUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Handle NSFW age gate / content warning (old reddit)
    const overAge = page.locator('button:has-text("Yes"), a:has-text("proceed"), button:has-text("Continue"), a:has-text("are you sure"), button:has-text("I agree")').first();
    if (await overAge.isVisible().catch(() => false)) {
      await overAge.click();
      await page.waitForTimeout(2000);
    }

    // Scroll down to ensure comment section is in view
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Try old reddit comment box first
    let commentBox = page.locator('.commentarea textarea[name="text"]').first();
    let isOldReddit = await commentBox.isVisible().catch(() => false);

    if (!isOldReddit) {
      // Fall back to new reddit URL
      const newUrl = postUrl.replace('old.reddit.com', 'www.reddit.com');
      await page.goto(newUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(4000);

      // Handle NSFW age gate (new reddit)
      const nsfwGate = page.locator(
        'button:has-text("Yes"), ' +
        'button:has-text("Continue"), ' +
        'button:has-text("I agree"), ' +
        'button:has-text("Click to see nsfw"), ' +
        '[id*="over18"] button'
      ).first();
      if (await nsfwGate.isVisible().catch(() => false)) {
        await nsfwGate.click();
        await page.waitForTimeout(2000);
      }

      // Scroll to load lazy comment section
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);

      // Try shreddit (new new reddit) selectors
      commentBox = page.locator(
        'shreddit-composer textarea, ' +
        'div[contenteditable="true"][role="textbox"], ' +
        '[contenteditable="true"][data-lexical-editor], ' +
        '[placeholder*="comment" i], ' +
        'textarea[placeholder*="Add a comment" i]'
      ).first();

      // If still not visible, try clicking into the comment area to activate it
      const hasNewBox = await commentBox.isVisible().catch(() => false);
      if (!hasNewBox) {
        // New reddit sometimes shows a collapsed "Add a comment" bar that needs clicking
        const commentTrigger = page.locator(
          '[placeholder*="Add a comment"], ' +
          'div:has-text("Add a comment"), ' +
          'shreddit-composer'
        ).first();
        if (await commentTrigger.isVisible().catch(() => false)) {
          await commentTrigger.click();
          await page.waitForTimeout(1500);
        }

        // Re-check for the input
        commentBox = page.locator(
          'shreddit-composer textarea, ' +
          'div[contenteditable="true"][role="textbox"], ' +
          '[contenteditable="true"][data-lexical-editor], ' +
          'textarea'
        ).first();

        const lastTry = await commentBox.isVisible().catch(() => false);
        if (!lastTry) {
          const screenshotPath = path.join(__dirname, '..', '.debug-reddit-fail.png');
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.error(`[Reddit] No comment box found. Screenshot: .debug-reddit-fail.png`);
          return false;
        }
      }
    }

    await commentBox.click();
    await page.waitForTimeout(500);

    // Use pressSequentially for old reddit textarea, but new reddit contenteditable may need different approach
    const tagName = await commentBox.evaluate(el => el.tagName.toLowerCase()).catch(() => 'unknown');
    if (tagName === 'textarea') {
      await commentBox.pressSequentially(comment, { delay: 25 });
    } else {
      // contenteditable — type via keyboard
      await page.keyboard.type(comment, { delay: 25 });
    }
    await page.waitForTimeout(1500);

    // Click submit — handle both old and new reddit
    const saveButton = page.locator(
      '.commentarea button[type="submit"], ' +
      '.commentarea .save-button button, ' +
      'button:has-text("Comment"), ' +
      'button[type="submit"][slot="submit-button"], ' +
      'shreddit-composer button[type="submit"]'
    ).first();
    await saveButton.click();
    await page.waitForTimeout(3000);

    // Check for errors
    const errorEl = page.locator('.error, .status-msg.error, [class*="error"]').first();
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
function pickCommentTarget(posts: ScrapedRedditPost[], subreddit?: string): ScrapedRedditPost | null {
  // Selfie subs: low-comment posts are ideal — be one of the first to encourage
  const minComments = subreddit && SELFIE_SUBS.has(subreddit) ? 0 : 2;

  const viable = posts.filter(p => {
    return p.commentCount >= minComments && p.commentCount <= 200 && p.author !== '[deleted]';
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
    const target = pickCommentTarget(posts, subreddit);
    if (!target) {
      console.log(`  No viable comment targets in r/${subreddit}`);
      continue;
    }

    console.log(`  Target: "${target.title.substring(0, 60)}..." (${target.commentCount} comments)`);
    attempted++;

    // Fetch full post body + screenshot for image posts
    if (!target.body || target.body === '') {
      try {
        const postUrl = target.url.replace('www.reddit.com', 'old.reddit.com');
        await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.waitForTimeout(2000);

        // On the post page, the body is visible
        const bodyEl = page.locator('.expando .usertext-body, [data-test-id="post-content"] p, .post-content p, .thing .usertext-body').first();
        const fullBody = await bodyEl.textContent().catch(() => '') || '';
        if (fullBody.trim()) {
          target.body = fullBody.trim().substring(0, 1500);
          console.log(`  Body: "${target.body.substring(0, 80)}..."`);
        }

        // Check for image post and screenshot it
        const imageEl = page.locator('.expando img, .media-preview-content img, [data-test-id="post-content"] img, .thing .thumbnail[href]').first();
        const hasImage = await imageEl.isVisible().catch(() => false);
        if (hasImage || SELFIE_SUBS.has(subreddit)) {
          target.isImagePost = true;
          // Screenshot the post area for vision
          const postArea = page.locator('.thing.link, [data-test-id="post-content"], .expando, .sitetable .thing').first();
          try {
            const screenshotBuffer = await postArea.screenshot({ timeout: 5000 });
            target.imageBase64 = screenshotBuffer.toString('base64');
            console.log(`  [vision] Screenshot captured for image post`);
          } catch {
            // Try full page screenshot as fallback
            try {
              const fullScreenshot = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 } });
              target.imageBase64 = fullScreenshot.toString('base64');
              console.log(`  [vision] Page screenshot captured`);
            } catch {
              // Proceed without image
            }
          }
        }
      } catch {
        // Continue with title-only if body fetch fails
      }
    }

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
        headless: false,
        viewport: { width: 1280, height: 800 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--window-position=-2400,-2400',
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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
