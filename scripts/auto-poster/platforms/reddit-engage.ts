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
import { buildMaxyVoiceSystem } from '../voice-system';
// rotateFansly intentionally NOT wired into comments — Reddit shadowbans
// accounts that drop links in comment replies. Link rotation happens only
// in original posts (platforms/reddit-original-posts.ts).
import { checkBudget, incrementBudget } from '../engagement-budget';
import { extractSafeText } from '../refusal-filter';
import { patternSlopCheck } from '../slop-detector';
import { resolveContact, recordEvent, getContactContext, recomputeTier, flagContact } from '../contact-graph';
import { gateOutbound } from '../pii-guard';

const USER_ID = process.env.USER_ID || '';

// Full voice for kink-friendly subs
const MAXY_VOICE_KINK = `You are Maxy (@softmaxy) — a 40-year-old trans woman on HRT. Into chastity, denial, feminization, power exchange. She runs a strict structure on herself — daily tasks, denial schedules, feminization protocols. She chose it and she thrives in it. Sharp, dry, funny, a little dominant. Lowercase, casual. Knows the scene, doesn't romanticize it, talks about it like someone who actually lives it.`;

// Clean voice for trans support, selfie, and general subs
const MAXY_VOICE_SFW = `You are Maxy (@softmaxy) — a 40-year-old trans woman on HRT. Started later in life and owns it. Sharp, funny, real. Hypes people up but doesn't sound like a therapist or support group. Lowercase, casual. Talks like someone who's actually going through it, not observing from the outside.`;

const KINK_SUBS = new Set([
  'sissification', 'feminization', 'chastity', 'sissyhypno', 'sissychastity',
  'Sissy', 'sissyology', 'bambisleep', 'EroticHypnosis', 'GOONED',
  'traps', 'GoneWildTrans', 'TransGoneWild', 'edging', 'BDSMcommunity',
]);

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
    rules: 'Keep it tech-focused. Can talk about using AI tools for personal development. No sexual content. Be helpful and share genuine insights about AI usage. Never mention any personal handler or AI control system.',
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
    topics: ['feminization journey', 'structured training', 'training routines', 'transformation progress'],
    rules: 'Be authentic about the sissy journey. Share experiences with training, denial, feminization. Talk about structure and routines like someone who lives it. Never mention any AI system or handler. Community-appropriate language.',
  },
  feminization: {
    tone: 'genuine, sharing the journey, supportive of others',
    topics: ['HRT experiences', 'voice training', 'presentation', 'social transition moments'],
    rules: 'Share real feminization experiences. HRT, voice training, clothing, social experiences. Be supportive to others on similar journeys.',
  },
  chastity: {
    tone: 'frustrated-but-loving-it, real about the struggle',
    topics: ['denial days', 'cage experiences', 'structured denial', 'mental effects of denial'],
    rules: 'Be real about chastity experiences. Talk about the structure and schedule she keeps herself on. Share the emotional and psychological journey. Never mention any AI system or handler. Community language.',
  },
  TransLater: {
    tone: 'warm, relatable, sharing the "starting later" experience',
    topics: ['starting transition at 40', 'HRT effects', 'social challenges', 'self-acceptance'],
    rules: 'Be supportive and real. Share experiences of transitioning later in life. No explicit content. This is a support community first.',
  },
  sissyhypno: {
    tone: 'enthusiastic, open about hypno experiences',
    topics: ['hypno sessions', 'mental conditioning', 'structured sessions', 'trance experiences'],
    rules: 'Share experiences with hypno content. Talk about structured sessions and what they do to her. Be open but not gratuitous. Never mention any AI system or handler. Community appropriate.',
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
  Sissy: {
    tone: 'playful, sharing experiences, community member',
    topics: ['feminization', 'dressing', 'training', 'identity exploration'],
    rules: 'Be genuine about the sissy journey. Community-appropriate. Share real experiences.',
  },
  femboy: {
    tone: 'casual, supportive, complimentary on outfits',
    topics: ['outfits', 'fashion', 'confidence', 'self-expression'],
    rules: 'Compliment something specific. Keep it positive. Can mention your own style journey.',
  },
  bambisleep: {
    tone: 'open about hypno experiences, community member',
    topics: ['trance experiences', 'session effects', 'conditioning progress'],
    rules: 'Share genuine experiences. Be part of the community, not an outsider looking in.',
  },
  EroticHypnosis: {
    tone: 'thoughtful, experienced, sharing insights',
    topics: ['hypnosis techniques', 'trance experiences', 'ethical practices'],
    rules: 'Share real experiences. Be thoughtful about consent and practice. Community voice.',
  },
  GOONED: {
    tone: 'unhinged, horny, real about the experience',
    topics: ['gooning sessions', 'edging', 'hypno', 'brain melt'],
    rules: 'Match the sub energy. Be real about the experience. No judgment.',
  },
  AskTransgender: {
    tone: 'thoughtful, genuine, sharing lived experience',
    topics: ['transition at 40', 'late transition', 'HRT', 'social challenges'],
    rules: 'Answer from personal experience. Be supportive. No kink content. This is a general trans support space.',
  },
  BDSMcommunity: {
    tone: 'experienced, articulate about dynamics, SSC/RACK aware',
    topics: ['D/s dynamics', 'chastity in relationships', 'protocol structures'],
    rules: 'Be thoughtful about consent and safety. Share genuine experiences. Community-appropriate language.',
  },
  edging: {
    tone: 'real, sharing the struggle, community member',
    topics: ['edging experiences', 'denial', 'mental effects'],
    rules: 'Be genuine. Match the community energy.',
  },
  traps: {
    tone: 'confident, casual, community member',
    topics: ['presentation', 'passing', 'selfies', 'fashion'],
    rules: 'Keep comments specific to what they posted. Compliment specifics. Be part of the community.',
  },
  GoneWildTrans: {
    tone: 'flirty, supportive, community member',
    topics: ['body positivity', 'transition progress', 'confidence'],
    rules: 'NSFW-appropriate comments. Compliment something specific. Be genuine, not creepy.',
  },
  TransGoneWild: {
    tone: 'flirty, supportive, community member',
    topics: ['body positivity', 'transition progress', 'confidence'],
    rules: 'NSFW-appropriate comments. Compliment something specific. Be genuine, not creepy.',
  },
  crossdressing: {
    tone: 'supportive, sharing experiences, encouraging',
    topics: ['outfits', 'first times', 'confidence building'],
    rules: 'Be supportive. Share your own experience. Compliment specifics.',
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

// ── Tiered subreddit strategy ──────────────────────────────────────
// Tier 1: daily (core audience) — post + comment
// Tier 2: 3x/week (community building) — discussion + journey comments
// Tier 3: weekly (NSFW audience growth) — requires karma
// Tier 4: monthly (narrative seeding) — long-form, credibility

const TIER_1_SUBS = ['sissychastity', 'feminization', 'Sissy', 'chastity', 'sissyology', 'femboy'];
const TIER_2_SUBS = ['MtF', 'TransDIY', 'TransTimelines', 'TransLater', 'bambisleep', 'EroticHypnosis', 'GOONED'];
const TIER_3_SUBS = ['traps', 'GoneWildTrans', 'TransGoneWild', 'crossdressing', 'sissyhypno'];
const TIER_4_SUBS = ['AskTransgender', 'BDSMcommunity', 'TransBodyTimelines', 'edging'];

const SELFIE_SUBS = new Set(['TransTimelines', 'TransBodyTimelines', 'traps', 'GoneWildTrans', 'TransGoneWild', 'femboy', 'crossdressing']);

/** Pick subreddits for this tick based on tier schedule */
function getTieredSubs(): string[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const dayOfMonth = now.getDate();

  // Tier 1: always available
  const subs = [...TIER_1_SUBS];

  // Tier 2: Mon/Wed/Fri/Sat (4 days/week)
  if ([1, 3, 5, 6].includes(dayOfWeek)) {
    subs.push(...TIER_2_SUBS);
  }

  // Tier 3: Wed/Sat only (requires karma)
  if ([3, 6].includes(dayOfWeek)) {
    subs.push(...TIER_3_SUBS);
  }

  // Tier 4: 1st and 15th of month
  if (dayOfMonth === 1 || dayOfMonth === 15) {
    subs.push(...TIER_4_SUBS);
  }

  return subs;
}

// Legacy aliases for karma gating
const KARMA_BUILDING_SUBS = [...TIER_1_SUBS, ...TIER_2_SUBS];
const NICHE_SUBS = [...TIER_3_SUBS, ...TIER_4_SUBS];

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

        // Get comment count — use a.comments href for the post URL
        // (a.title href points to external content for link/image posts)
        const commentsEl = el.locator('a.comments').first();
        const commentsText = await commentsEl.textContent() || '0';
        const commentCount = parseInt(commentsText.replace(/[^0-9]/g, '')) || 0;
        const commentsHref = await commentsEl.getAttribute('href') || '';

        // Get author
        const authorEl = el.locator('a.author').first();
        const author = await authorEl.textContent().catch(() => '[deleted]') || '[deleted]';

        // Get score
        const scoreEl = el.locator('.score.unvoted').first();
        const upvotes = await scoreEl.getAttribute('title').catch(() => '0') || '0';

        // Build full URL from the comments link (always points to the post page)
        const postUrl = commentsHref.startsWith('http')
          ? commentsHref
          : `https://old.reddit.com${commentsHref}`;

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
  contactCtx: string = '',
  sb?: typeof supabase,
  userId?: string,
): Promise<string | null> {
  const voice = getSubredditVoice(subreddit);
  const flavor = KINK_SUBS.has(subreddit) ? 'reddit_kink' : 'reddit_sfw';
  const maxyVoice = (sb && userId)
    ? await buildMaxyVoiceSystem(sb, userId, flavor)
    : getMaxyVoice(subreddit);

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `${maxyVoice}

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

${contactCtx ? `\n${contactCtx}\n` : ''}`,
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
        system: `${maxyVoice}\n\nYou are commenting on a Reddit post in r/${subreddit}.\nVoice: ${voice.tone}\nRules: ${voice.rules}\n\nYour previous reply was rejected for sounding like AI. Issues: ${slopResult.reasons.join('; ')}.\nWrite a COMPLETELY different reply — different words, different angle, different structure. 1-3 sentences. Lowercase, casual. Output ONLY the comment.`,
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
    // Go directly to www.reddit.com — login session lives there, not old.reddit.com
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

    // Handle "View post" button if we landed on feed view
    const viewPostBtn = page.locator(
      'a:has-text("View post"), ' +
      'button:has-text("View post"), ' +
      '[slot="full-post-link"]'
    ).first();
    if (await viewPostBtn.isVisible().catch(() => false)) {
      console.log('[Reddit] Feed view detected — clicking "View post"');
      await viewPostBtn.click();
      await page.waitForTimeout(4000);
    }

    // Detect login wall / join wall before hunting for composer
    const wallText = await page.locator('body').textContent().catch(() => '') || '';
    if (/log in to (comment|reddit)/i.test(wallText) && !/^Log In$/m.test(wallText)) {
      console.error('[Reddit] Not logged in — comment composer hidden behind auth wall');
      return false;
    }

    // Scroll comment section into view (composer renders below post body)
    const commentsAnchor = page.locator(
      'shreddit-comments-page-banner, shreddit-comment-tree, [id*="comments"], #comment-tree'
    ).first();
    if (await commentsAnchor.count() > 0) {
      await commentsAnchor.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    } else {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    }
    await page.waitForTimeout(1500);

    // Wait for composer to mount (lazy-loaded). 8s timeout vs failing immediately.
    const composer = page.locator('shreddit-composer').first();
    await composer.waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
    await composer.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);

    const hasComposer = await composer.count() > 0;

    if (hasComposer) {
      // The composer's editable is sometimes light-DOM (faceplate-textarea-input wrapping
      // a <textarea> or contenteditable). Click composer to expand, then locate the editable.
      await composer.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);

      // Try to find the actual editable inside or adjacent to composer
      const editable = page.locator(
        'shreddit-composer textarea, ' +
        'shreddit-composer [contenteditable="true"], ' +
        'faceplate-textarea-input textarea, ' +
        'faceplate-textarea-input [contenteditable="true"], ' +
        'div[contenteditable="true"][role="textbox"], ' +
        '[name="comment"]'
      ).first();

      const hasEditable = await editable.isVisible().catch(() => false);
      if (hasEditable) {
        await editable.click().catch(() => {});
        await page.waitForTimeout(300);
        const tag = await editable.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
        if (tag === 'textarea') {
          await editable.pressSequentially(comment, { delay: 20 });
        } else {
          await page.keyboard.type(comment, { delay: 20 });
        }
      } else {
        // Editable not found in light DOM — type into whatever the composer focused
        await composer.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
        await page.keyboard.type(comment, { delay: 20 });
      }
      await page.waitForTimeout(1200);

      // Submit: prefer the actual Comment button, fall back to Ctrl+Enter
      const saveButton = page.locator(
        'shreddit-composer button:has-text("Comment"), ' +
        'button[slot="submit-button"], ' +
        'button:has-text("Comment"):not([aria-label*="Sort" i]), ' +
        'button[type="submit"]'
      ).first();
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click().catch(() => {});
      } else {
        await page.keyboard.press('Control+Enter');
      }
      await page.waitForTimeout(3000);
    } else {
      // Fallback: legacy/old reddit selectors
      let commentBox = page.locator(
        'div[contenteditable="true"][role="textbox"], ' +
        '[contenteditable="true"][data-lexical-editor], ' +
        '[placeholder*="comment" i], ' +
        '[placeholder*="conversation" i], ' +
        'textarea[name="text"], ' +
        'textarea'
      ).first();

      const hasBox = await commentBox.isVisible().catch(() => false);
      if (!hasBox) {
        const screenshotPath = path.join(__dirname, '..', '.debug-reddit-fail.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const url = page.url();
        console.error(`[Reddit] No comment box found at ${url}. Screenshot: .debug-reddit-fail.png`);
        return false;
      }

      await commentBox.click();
      await page.waitForTimeout(500);

      const tagName = await commentBox.evaluate(el => el.tagName.toLowerCase()).catch(() => 'unknown');
      if (tagName === 'textarea') {
        await commentBox.pressSequentially(comment, { delay: 25 });
      } else {
        await page.keyboard.type(comment, { delay: 25 });
      }
      await page.waitForTimeout(1500);

      const saveButton = page.locator(
        'button:has-text("Comment"), ' +
        'button[type="submit"]'
      ).first();
      await saveButton.click();
      await page.waitForTimeout(3000);
    }

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
  const tieredSubs = getTieredSubs();
  const availableSubs = karma >= 500
    ? tieredSubs
    : tieredSubs.filter(s => [...TIER_1_SUBS, ...TIER_2_SUBS].includes(s));

  console.log(`[Reddit] Karma: ${karma} → ${availableSubs.length} subs available (${karma < 500 ? 'karma-building phase' : 'all tiers unlocked'})`);

  // Shuffle available subs
  const shuffled = [...availableSubs].sort(() => Math.random() - 0.5);

  for (const subreddit of shuffled) {
    if (posted >= maxComments) break;

    // Check if browser is still alive (timeout may have killed it)
    try { await page.evaluate(() => true); } catch {
      console.log('[Reddit] Browser closed — stopping');
      break;
    }

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

    // Resolve OP in the contact graph + record their inbound post as context.
    let contactId: string | null = null;
    let contactCtxBlock = '';
    const opHandle = target.author && target.author !== '[deleted]' ? target.author : null;
    if (opHandle) {
      try {
        const contact = await resolveContact(sb, userId, 'reddit', opHandle);
        contactId = contact.id;
        contactCtxBlock = await getContactContext(sb, contact.id);
        const inboundContent = `[r/${subreddit}] ${target.title}${target.body ? `\n\n${target.body}` : ''}`;
        await recordEvent(sb, userId, contact.id, 'reply_in', 'in', 'reddit', inboundContent, 0, { url: target.url, subreddit });
      } catch (err) {
        console.error(`  [contact-graph] resolve failed:`, err instanceof Error ? err.message : err);
      }
    }

    // Generate comment
    let comment = await generateRedditComment(client, target, subreddit, state, contactCtxBlock, sb, userId);
    if (!comment) {
      console.log(`  Comment generation failed`);
      failed++;
      continue;
    }

    // PII guardrail
    {
      const gate = gateOutbound(target.body || target.title, comment);
      if (gate.action === 'suppress') {
        console.log(`  [pii-guard] SUPPRESSED (${gate.severity}): ${gate.reason}`);
        if (contactId) { try { await flagContact(sb, contactId, `outbound_blocked:${gate.reason}`); } catch {} }
        failed++;
        continue;
      }
      if (gate.action === 'deflect') {
        // Reddit is public — don't post a deflection, just skip.
        console.log(`  [pii-guard] skipping comment (inbound had logistics intent)`);
        failed++;
        continue;
      }
    }

    console.log(`  Comment: "${comment.substring(0, 80)}..."`);

    // Post comment
    const success = await postRedditComment(page, target.url, comment);
    if (success) {
      console.log(`  Posted comment in r/${subreddit}`);
      posted++;
      await incrementBudget(sb, userId, 'reddit', 'comment');

      // Capture comment permalink for engagement backfill. Reddit navigates to
      // the comment's thread after submission; the URL includes the comment id
      // as the last path segment (e.g. /r/sub/comments/<post_id>/_/<comment_id>/).
      let commentUrl: string | null = null;
      try {
        await page.waitForTimeout(1500);
        const currentUrl = page.url();
        if (currentUrl.includes('/comments/')) commentUrl = currentUrl;
      } catch { /* non-fatal */ }

      // Log as ai_generated_content
      await sb.from('ai_generated_content').insert({
        user_id: userId,
        content_type: 'comment',
        platform: 'reddit',
        content: comment,
        generation_strategy: 'reddit_contextual_comment',
        target_account: `r/${subreddit}`,
        target_subreddit: subreddit,
        status: 'posted',
        posted_at: new Date().toISOString(),
        platform_url: commentUrl,
      });

      if (contactId) {
        try {
          await recordEvent(sb, userId, contactId, 'reply_out', 'out', 'reddit', comment, 0, { url: target.url, subreddit });
          await recomputeTier(sb, contactId);
        } catch (err) {
          console.error(`  [contact-graph] record comment failed:`, err instanceof Error ? err.message : err);
        }
      }
    } else {
      console.log(`  Failed to post comment`);
      failed++;
    }

    // Rate limit — 30-60 seconds between comments
    if (posted < maxComments) {
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
