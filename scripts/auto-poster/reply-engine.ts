/**
 * Reply Engine — real-time search and reply.
 *
 * Each cycle:
 *   1. Pick random search queries from Maxy's niche topics
 *   2. Search Twitter for fresh tweets matching those queries
 *   3. Reply to the best ones directly
 *   4. Log replied tweet URLs to avoid dupes
 *
 * No stored target pool. Fresh tweets every time.
 *
 * Run: npx tsx reply-engine.ts
 * Scheduled: called by scheduler.ts on reply ticks
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from './config';
import { extractSafeText } from './refusal-filter';
import { fullSlopCheck, patternSlopCheck } from './slop-detector';

const USER_ID = process.env.USER_ID || '';
const OWN_HANDLE = process.env.TWITTER_HANDLE || 'softmaxy';
const MAX_SLOP_RETRIES = 3; // max regeneration attempts per reply (higher bar = more retries needed)

// ── Search queries for finding replyable tweets ──────────────────────

interface ReplySearchQuery {
  query: string;
  nsfw: boolean;
  label: string;
}

const REPLY_SEARCHES: ReplySearchQuery[] = [
  // Kink/sissy/fem — NSFW voice
  { nsfw: true, label: 'sissy content', query: '"sissy" (hypno OR caption OR training OR journey OR dress)' },
  { nsfw: true, label: 'feminization', query: '"feminize" OR "feminization" OR "forced fem"' },
  { nsfw: true, label: 'chastity', query: '"chastity" (cage OR locked OR keyholder OR denial)' },
  { nsfw: true, label: 'good girl kink', query: '"good girl" (sissy OR femboy OR bimbo OR cage)' },
  { nsfw: true, label: 'denial', query: '"orgasm denial" OR "edging" OR "days locked"' },
  { nsfw: true, label: 'femboy', query: '"femboy" (cute OR outfit OR first time OR help)' },

  // Trans community — SFW voice
  { nsfw: false, label: 'HRT journey', query: '"started HRT" OR "months on HRT" OR "HRT update"' },
  { nsfw: false, label: 'voice training', query: '"voice training" (trans OR mtf OR progress)' },
  { nsfw: false, label: 'trans selfie', query: '"trans girl" selfie OR "mtf selfie" OR "transition selfie"' },
  { nsfw: false, label: 'coming out', query: '"came out as trans" OR "egg cracked" OR "finally came out"' },
  { nsfw: false, label: 'trans timeline', query: '"transition timeline" OR "mtf timeline" OR "HRT timeline"' },
  { nsfw: false, label: 'trans life', query: '"trans woman" (life OR journey OR experience OR day)' },
];

// ── Prompts ──────────────────────────────────────────────────────────

const NSFW_MAXY_REPLY_PROMPT = `You are Maxy (@softmaxy) — a 40-year-old trans woman on HRT. Flirty, teasing, playful. Early in her transition. Does voice training. Into chastity, denial, feminization. A little dominant, a little vulnerable.

You're replying to someone's tweet about sissy/feminization/chastity/kink content. Be real, be flirty, be yourself.

Your reply must:
1. RESPOND TO WHAT THEY ACTUALLY SAID. Reference their specific words.
2. Be 1-2 sentences max. Lowercase, casual.
3. MATCH THE ENERGY of the original tweet. Short tweet = short reply.
4. Share from your own experience — denial, feminization, transition, kink life.
5. VARY your language. Every reply should feel different from the last.

BANNED PHRASES — these are overused crutches. Using them = failure:
- "hits different" (NEVER use this phrase)
- "the way [thing]..." as a sentence opener
- "energy" as a descriptor ("desperate energy", "that energy", etc.)
- "ngl" / "not gonna lie"
- "honestly" as a sentence starter
- "*chef's kiss*"
- "i respect it/that"
- "hits" in any form ("that hits", "this hits")

ALSO NEVER: Use hashtags. Sound like a bot. Be generic. Break character. Pitch anything. Mention "the handler" or any AI system. Comment on "confidence." Mention seeing/not seeing images.

If the tweet is about crime, violence, hard news, sports, or something completely unrelated — output ONLY the word "SKIP".

Examples of GOOD replies (notice: no repeated phrases):
- To a sissy post: "oh honey you're already halfway there and you don't even know it yet"
- To a "good girl" post: "careful posting like that where anyone can see 😈"
- To a chastity post: "day 12 and nobody warned me about the work meetings"
- To a denial post: "two weeks in and my brain completely rewired itself. i went from hating it to... not wanting it to stop"
- To a femboy photo: "that outfit is doing exactly what you wanted it to do 🖤"
- To a transition post: "four months in and i still can't believe my skin is this soft. like who am i"
- To an edging post: "the anticipation is worse than the actual denial and somehow that makes it better"`;


const MAXY_REPLY_PROMPT = `You are Maxy (@softmaxy) — 40, trans woman, HRT, voice training. Sharp, funny, real. You reply like you're texting a friend, not writing a support group post.

Replying to someone's tweet:

1. RESPOND TO WHAT THEY SAID. Reference their actual words.
2. Be SHORT. Match their length. One sentence tweet = one sentence reply.
3. Vary your tone: funny, dry, flirty, blunt, self-deprecating, supportive, chaotic. NOT the same vibe every time.
4. Sound like a real person, not a brand ambassador for being trans.
5. Don't over-share. Don't turn every reply into a transition story.

BANNED — instant failure:
- "hits different", "the way...", "energy" as descriptor, "ngl", "honestly" opener
- "*chef's kiss*", "i respect it/that", "hits" in any form
- "nobody tells you about..." or "nobody warns you about..."
- Starting with "god" every time
- Crying in parking lots, processing feelings, random tears
- Being amazed at your own reflection
- Sounding like a therapy session
- Hashtags, bot voice, mentioning AI/handler, "confidence" compliments

If unrelated — output ONLY "SKIP".

GOOD replies (all different energy):
- To "wait im a milf": "the realization is the best part tbh"
- To a voice post: "lmaooo mine still cracks on the phone and i just pretend it's bad signal"
- To a selfie: "ok you didn't have to go that hard"
- To a coming out post: "welcome to the chaos"
- To an HRT complaint: "month 3 was my villain arc too. it gets weirder before it gets better"
- To a transition win: "ok show off"
- To an edging post: "you're already further gone than you think"
- To a chastity complaint: "yeah that's by design"
- To a kink confession: "you typed all that out and still hit post. respect"`;

// ── Types ────────────────────────────────────────────────────────────

interface SearchResultTweet {
  text: string;
  url: string;
  username: string;
  imageBase64?: string;
  hasMedia?: boolean;
}

// ── Spam/quality filters ─────────────────────────────────────────────

function isSpamOrAd(text: string): boolean {
  const SPAM_PATTERNS = [
    /\b(use code|discount|coupon|promo code|sale ends|limited time|order now|shop now|buy now)\b/i,
    /\b(link in bio|check out my|subscribe to my|join my|sign up)\b/i,
    /\b(NEW SITE|launching|just dropped|now available|pre-?order)\b/i,
    /\b(affiliate|referral|earn \$|make money|passive income|side hustle)\b/i,
    /\b(giveaway|rt to win|follow.{0,15}win|retweet.{0,15}chance)\b/i,
    /\b(crypto|bitcoin|ethereum|nft|web3|airdrop|token launch|defi)\b/i,
    /\b(follow.{0,10}back|f4f|follow train|gain with me)\b/i,
    /\b(linktree|linktr\.ee|allmylinks|beacons\.ai)\b/i,
  ];

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  const urlCount = (text.match(/https?:\/\//g) || []).length;
  if (urlCount >= 2) return true;

  const hashtagCount = (text.match(/#\w/g) || []).length;
  const words = text.split(/\s+/).length;
  if (hashtagCount > 3 && hashtagCount / words > 0.4) return true;

  return false;
}

// ── Dedup ────────────────────────────────────────────────────────────

/** Loads replied tweet URLs AND usernames replied to in the last 7 days */
async function getReplyHistory(): Promise<{ urls: Set<string>; recentUsers: Set<string> }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Load both posted AND skipped/failed tweets to avoid resurfacing
  const { data } = await supabase
    .from('ai_generated_content')
    .select('generation_prompt, target_account, posted_at, status')
    .eq('user_id', USER_ID)
    .eq('content_type', 'reply')
    .eq('platform', 'twitter')
    .in('status', ['posted', 'failed'])
    .order('posted_at', { ascending: false })
    .limit(500);

  const urls = new Set<string>();
  const recentUsers = new Set<string>();

  for (const row of data || []) {
    if (row.generation_prompt) urls.add(row.generation_prompt);
    // Only track users from the last 7 days
    if (row.target_account && row.posted_at && row.posted_at >= weekAgo) {
      recentUsers.add(row.target_account.toLowerCase());
    }
  }
  return { urls, recentUsers };
}

// ── Search Twitter and extract replyable tweets ──────────────────────

async function searchForTweets(
  page: Page,
  searchQuery: ReplySearchQuery,
  repliedUrls: Set<string>,
  recentUsers: Set<string>,
  maxResults: number = 8,
): Promise<SearchResultTweet[]> {
  const results: SearchResultTweet[] = [];

  try {
    const encoded = encodeURIComponent(searchQuery.query);
    await page.goto(`https://x.com/search?q=${encoded}&src=typed_query&f=live`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    const tweets = await page.locator('[data-testid="tweet"]').all();

    for (const tweet of tweets.slice(0, 20)) {
      if (results.length >= maxResults) break;

      try {
        // Get username
        const userLinks = await tweet.locator('a[role="link"][href^="/"]').all();
        let username = '';
        for (const link of userLinks) {
          const href = await link.getAttribute('href').catch(() => '') || '';
          if (href && !href.includes('/status/') && !href.includes('/search') && href !== '/') {
            username = href.replace(/^\//, '').split('/')[0];
            break;
          }
        }
        if (!username) continue;
        // Skip own account — check various forms (softmaxy, Soft_Maxy, soft_maxy, etc.)
        const uLower = username.toLowerCase().replace(/_/g, '');
        const ownLower = OWN_HANDLE.toLowerCase().replace(/_/g, '');
        if (uLower === ownLower || username.toLowerCase() === OWN_HANDLE.toLowerCase()) continue;

        // Skip users we've already replied to this week
        if (recentUsers.has(username.toLowerCase())) continue;

        // Get tweet text
        const tweetTextEl = tweet.locator('[data-testid="tweetText"]').first();
        const tweetText = await tweetTextEl.textContent().catch(() => '') || '';
        if (!tweetText || tweetText.trim().length < 5) continue;

        // Skip spam
        if (isSpamOrAd(tweetText)) continue;

        // Get tweet URL
        const timeEl = tweet.locator('time').first();
        const linkEl = timeEl.locator('xpath=ancestor::a').first();
        const href = await linkEl.getAttribute('href').catch(() => '');
        const tweetUrl = href ? `https://x.com${href}` : '';

        // Skip already replied
        if (tweetUrl && repliedUrls.has(tweetUrl)) continue;

        // Check for media
        const hasMedia = await tweet.locator('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], img[src*="pbs.twimg.com/media"]').count() > 0;

        // Screenshot tweet for vision
        let imageBase64: string | undefined;
        try {
          const buf = await tweet.screenshot({ timeout: 5000 });
          imageBase64 = buf.toString('base64');
        } catch {
          // Proceed without screenshot
        }

        results.push({
          text: tweetText.trim(),
          url: tweetUrl,
          username,
          imageBase64,
          hasMedia,
        });
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.error(`[Reply] Search failed for "${searchQuery.label}":`, err instanceof Error ? err.message : err);
  }

  return results;
}

// ── Recent reply history for repetition detection ───────────────────

async function getRecentReplyTexts(limit: number = 30): Promise<string[]> {
  const { data } = await supabase
    .from('ai_generated_content')
    .select('content')
    .eq('user_id', USER_ID)
    .eq('content_type', 'reply')
    .eq('platform', 'twitter')
    .eq('status', 'posted')
    .order('posted_at', { ascending: false })
    .limit(limit);

  return (data || []).map(r => r.content).filter(Boolean);
}

// ── Generate reply with self-evaluation ─────────────────────────────

async function generateReply(
  anthropic: Anthropic,
  tweet: SearchResultTweet,
  nsfw: boolean,
  recentReplies: string[],
): Promise<string | null> {
  let retryFeedback = '';

  for (let attempt = 0; attempt <= MAX_SLOP_RETRIES; attempt++) {
    try {
      const contentBlocks: Array<any> = [];

      if (tweet.imageBase64) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: tweet.imageBase64 },
        });
      }

      let textPrompt = tweet.hasMedia && tweet.imageBase64
        ? `@${tweet.username} tweeted: "${tweet.text}"\n\nThe screenshot above shows the full tweet including any images. Reference what you SEE — the outfit, the look, the vibe, specific visual details. If the image is unclear, just respond to the text naturally. NEVER mention that you can or cannot see an image.\n\nWrite Maxy's reply. Output ONLY the reply text, nothing else.`
        : `@${tweet.username} tweeted: "${tweet.text}"\n\nWrite Maxy's reply. Output ONLY the reply text, nothing else.`;

      // On retry, inject feedback about why the last attempt was rejected
      if (retryFeedback) {
        textPrompt += `\n\n⚠️ SELF-EVAL FEEDBACK (attempt ${attempt + 1}): ${retryFeedback}`;
      }

      contentBlocks.push({ type: 'text', text: textPrompt });

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: nsfw ? NSFW_MAXY_REPLY_PROMPT : MAXY_REPLY_PROMPT,
        messages: [{ role: 'user', content: contentBlocks }],
      });

      const text = extractSafeText(response, 3, `Twitter reply @${tweet.username}`);
      if (!text) return null;

      if (text.trim().toUpperCase() === 'SKIP') {
        console.log(`  ⊘ Model skipped (off-topic tweet)`);
        return null;
      }

      if (text.length > 280) {
        console.error(`[Reply] Too long (${text.length} chars), skipping`);
        return null;
      }

      // ── Self-evaluation ──
      const slopResult = await fullSlopCheck(anthropic, tweet.text, text, recentReplies);

      if (slopResult.pass) {
        if (attempt > 0) {
          console.log(`  ✓ Passed slop check on attempt ${attempt + 1} (score: ${slopResult.llmScore}/10)`);
        } else {
          console.log(`  ✓ Slop check passed (score: ${slopResult.llmScore}/10)`);
        }
        return text;
      }

      // Failed — log why and retry
      const allReasons = [...slopResult.patternReasons, ...slopResult.repetitionReasons];
      console.log(`  ✗ Slop check FAILED (attempt ${attempt + 1}/${MAX_SLOP_RETRIES + 1}): ${allReasons.join(', ')} | LLM: ${slopResult.llmScore}/10 — ${slopResult.llmReason}`);

      if (attempt < MAX_SLOP_RETRIES) {
        retryFeedback = slopResult.retryFeedback;
        // Add the failed reply to recent so the next attempt avoids it
        recentReplies = [text, ...recentReplies];
      }
    } catch (err) {
      console.error('[Reply] Generation failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  console.log(`  ⊘ All ${MAX_SLOP_RETRIES + 1} attempts failed slop check, skipping tweet`);
  return null;
}

// ── Post reply ───────────────────────────────────────────────────────

async function postReply(
  page: Page,
  tweetUrl: string,
  replyText: string,
): Promise<boolean> {
  try {
    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    const replyBox = page.locator('[data-testid="tweetTextarea_0"]').first();
    await replyBox.click({ timeout: 5000 });
    await page.waitForTimeout(500);

    await replyBox.pressSequentially(replyText, { delay: 30 });
    await page.waitForTimeout(1000);

    const replyButton = page.locator('[data-testid="tweetButtonInline"]').first();
    await replyButton.click({ timeout: 10000 });
    await page.waitForTimeout(3000);

    return true;
  } catch (err) {
    console.error('[Reply] Post failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ── Main cycle ───────────────────────────────────────────────────────

export async function runReplyCycle(maxReplies: number = 4): Promise<{
  attempted: number;
  posted: number;
  failed: number;
}> {
  if (!USER_ID) {
    console.error('Missing USER_ID');
    return { attempted: 0, posted: 0, failed: 0 };
  }

  const config = PLATFORMS.twitter;
  if (!config.enabled) {
    console.log('[Reply] Twitter disabled');
    return { attempted: 0, posted: 0, failed: 0 };
  }

  const { urls: repliedUrls, recentUsers } = await getReplyHistory();
  const recentReplyTexts = await getRecentReplyTexts(30);
  const anthropic = new Anthropic();
  let context: BrowserContext | null = null;
  let attempted = 0;
  let posted = 0;
  let failed = 0;

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

    // Pick 3 random search queries this cycle
    const shuffled = [...REPLY_SEARCHES].sort(() => Math.random() - 0.5);
    const queries = shuffled.slice(0, 3);

    for (const sq of queries) {
      if (posted >= maxReplies) break;

      console.log(`[Reply] Searching: "${sq.label}"...`);

      const tweets = await searchForTweets(page, sq, repliedUrls, recentUsers, 5);
      console.log(`  Found ${tweets.length} replyable tweets`);

      for (const tweet of tweets) {
        if (posted >= maxReplies) break;

        console.log(`  @${tweet.username}: "${tweet.text.substring(0, 60)}..."`);
        attempted++;

        const reply = await generateReply(anthropic, tweet, sq.nsfw, recentReplyTexts);
        if (!reply) {
          failed++;
          // Mark this tweet as "seen" so it doesn't resurface — both in-memory and DB
          if (tweet.url) {
            repliedUrls.add(tweet.url);
            try {
              await supabase.from('ai_generated_content').insert({
                user_id: USER_ID,
                content_type: 'reply',
                platform: 'twitter',
                content: '[skipped]',
                generation_strategy: `skipped:${sq.label}`,
                generation_prompt: tweet.url,
                target_account: tweet.username,
                status: 'failed',
                posted_at: new Date().toISOString(),
              });
            } catch {} // Don't fail if insert fails
          }
          continue;
        }

        console.log(`  Reply: "${reply}"`);

        if (tweet.url) {
          const success = await postReply(page, tweet.url, reply);
          if (success) {
            console.log(`  ✓ Posted reply to @${tweet.username}`);
            posted++;
            repliedUrls.add(tweet.url);
            recentUsers.add(tweet.username.toLowerCase());
            recentReplyTexts.unshift(reply); // feed back into repetition checker

            // Log for dedup
            await supabase.from('ai_generated_content').insert({
              user_id: USER_ID,
              content_type: 'reply',
              platform: 'twitter',
              content: reply,
              generation_strategy: `search_reply:${sq.label}`,
              generation_prompt: tweet.url,
              target_account: tweet.username,
              status: 'posted',
              posted_at: new Date().toISOString(),
            });
          } else {
            console.log(`  ✗ Failed to post`);
            failed++;
            repliedUrls.add(tweet.url);
          }
        }

        // Rate limit — 30-60 seconds between replies
        const delay = 20000 + Math.floor(Math.random() * 20000);
        console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  } catch (err) {
    console.error('[Reply] Fatal:', err);
  } finally {
    if (context) await context.close();
  }

  return { attempted, posted, failed };
}

// Direct invocation
if (require.main === module) {
  const maxReplies = parseInt(process.argv[2] || '4', 10);
  console.log(`[Reply Engine] Starting cycle (max ${maxReplies} replies)...\n`);

  runReplyCycle(maxReplies).then(result => {
    console.log(`\n[Reply Engine] Done: ${result.posted} posted, ${result.failed} failed out of ${result.attempted} attempted`);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
