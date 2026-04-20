/**
 * Quote Tweet Engine — search for popular tweets and quote-tweet them.
 *
 * Each cycle:
 *   1. Pick random SFW search queries from Maxy's niche topics
 *   2. Search Twitter for top/popular tweets matching those queries
 *   3. Generate a quote tweet with Maxy's take
 *   4. Post the QT via Playwright (retweet menu -> Quote)
 *   5. Log to ai_generated_content for dedup
 *
 * Structurally mirrors reply-engine.ts but uses &f=top instead of &f=live
 * and posts via the retweet/quote flow instead of the reply box.
 *
 * Run: npx tsx quote-tweet-engine.ts
 * Scheduled: called by scheduler.ts on QT ticks
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from './config';
import { extractSafeText } from './refusal-filter';
import { fullSlopCheck } from './slop-detector';
import { resolveContact, recordEvent, getContactContext, recomputeTier, flagContact } from './contact-graph';
import { gateOutbound } from './pii-guard';
import { loadCycleContext, summarizeSlop, buildContext, type CycleContext, type SlopSummary } from './generation-context';

const USER_ID = process.env.USER_ID || '';
const OWN_HANDLE = process.env.TWITTER_HANDLE || 'softmaxy';
const MAX_SLOP_RETRIES = 3;

// ── Search queries — SFW subset for quote tweets ───────────────────

interface QTSearchQuery {
  query: string;
  label: string;
}

const QT_SEARCHES: QTSearchQuery[] = [
  { label: 'HRT journey', query: '"started HRT" OR "months on HRT" OR "HRT update"' },
  { label: 'voice training', query: '"voice training" (trans OR mtf OR progress)' },
  { label: 'trans selfie', query: '"trans girl" selfie OR "mtf selfie" OR "transition selfie"' },
  { label: 'coming out', query: '"came out as trans" OR "egg cracked" OR "finally came out"' },
  { label: 'trans timeline', query: '"transition timeline" OR "mtf timeline" OR "HRT timeline"' },
  { label: 'trans life', query: '"trans woman" (life OR journey OR experience OR day)' },
  { label: 'trans joy', query: '"trans joy" OR "gender euphoria" OR "euphoria hit"' },
  { label: 'passing', query: '"got ma\'amed" OR "got gendered correctly" OR "first time passing"' },
];

// ── Prompt ──────────────────────────────────────────────────────────

const MAXY_QT_PROMPT = `You are Maxy (@softmaxy) — 40, trans woman, HRT, voice training, into kink. Sharp, funny, a little messy. NOT inspirational. NOT soft. You say things people think but don't post.

You're writing a quote tweet. Your TAKE on their tweet. Not agreement. Not validation. A reaction that makes people stop scrolling.

Rules:
1. Have an actual take. Disagree, roast gently, confess something, make it funny, or make it weird.
2. Sound like a person texting a friend, not writing a blog post.
3. 1 sentence preferred. 2 max. Under 200 chars.
4. NEVER be wholesome or inspirational. No "this is so valid" energy. No cheerleading.
5. The best QTs make people laugh, cringe, or feel called out.
6. Vary tone WILDLY between posts. Some horny, some dry, some self-deprecating, some just weird.

BANNED — instant failure:
- "hits different", "the way...", "energy" as descriptor, "ngl", "honestly" opener
- "*chef's kiss*", "i respect it/that", "hits" in any form
- "the randomness of it all", "biology doing its thing", "mysterious ways"
- Sounding amazed at your own transition (we get it, things changed)
- Wistful observations about time passing
- "nobody tells you about..." (overused format)
- Starting with "god" or "okay but"
- Hashtags, bot voice, pitching, mentioning AI/handler

If unrelated to your life — output ONLY "SKIP".

GOOD QTs (all different energy):
- "girl you are SO cooked and i mean that as a compliment"
- "my voice coach would kill me if she heard what i sound like at 2am"
- "started hrt at 40 and now my teenage emotions are speedrunning twenty years in six months"
- "the fact that i just understood this tweet means the brainwashing is working"
- "wrong. and i'm too tired to explain why but you're wrong"
- "this is the tweet that's gonna live in my head rent free during my next session"
- "why did you have to post this while i'm at work trying to act normal"
- "saving this for when someone asks me why i transitioned late"`;


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

/** Loads quoted tweet URLs and usernames from recent QTs */
async function getQuoteHistory(): Promise<{ urls: Set<string>; recentUsers: Set<string> }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('ai_generated_content')
    .select('generation_prompt, target_account, posted_at, status')
    .eq('user_id', USER_ID)
    .eq('content_type', 'quote_tweet')
    .eq('platform', 'twitter')
    .in('status', ['posted', 'failed'])
    .order('posted_at', { ascending: false })
    .limit(500);

  const urls = new Set<string>();
  const recentUsers = new Set<string>();

  for (const row of data || []) {
    if (row.generation_prompt) urls.add(row.generation_prompt);
    if (row.target_account && row.posted_at && row.posted_at >= weekAgo) {
      recentUsers.add(row.target_account.toLowerCase());
    }
  }
  return { urls, recentUsers };
}

// ── Search Twitter for popular/top tweets ───────────────────────────

async function searchForTweets(
  page: Page,
  searchQuery: QTSearchQuery,
  quotedUrls: Set<string>,
  recentUsers: Set<string>,
  maxResults: number = 8,
): Promise<SearchResultTweet[]> {
  const results: SearchResultTweet[] = [];

  try {
    const encoded = encodeURIComponent(searchQuery.query);
    // Use &f=top for popular/trending tweets (not &f=live like reply engine)
    await page.goto(`https://x.com/search?q=${encoded}&src=typed_query&f=top`, {
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

        // Skip own account
        const uLower = username.toLowerCase().replace(/_/g, '');
        const ownLower = OWN_HANDLE.toLowerCase().replace(/_/g, '');
        if (uLower === ownLower || username.toLowerCase() === OWN_HANDLE.toLowerCase()) continue;

        // Skip users we've already quoted this week
        if (recentUsers.has(username.toLowerCase())) continue;

        // Get tweet text
        const tweetTextEl = tweet.locator('[data-testid="tweetText"]').first();
        const tweetText = await tweetTextEl.textContent().catch(() => '') || '';
        if (!tweetText || tweetText.trim().length < 10) continue;

        // Skip spam
        if (isSpamOrAd(tweetText)) continue;

        // Get tweet URL
        const timeEl = tweet.locator('time').first();
        const linkEl = timeEl.locator('xpath=ancestor::a').first();
        const href = await linkEl.getAttribute('href').catch(() => '');
        const tweetUrl = href ? `https://x.com${href}` : '';

        // Skip already quoted
        if (tweetUrl && quotedUrls.has(tweetUrl)) continue;

        // Check for media
        const hasMedia = await tweet.locator('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], img[src*="pbs.twimg.com/media"]').count() > 0;

        // Screenshot tweet for vision context
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
    console.error(`[QT] Search failed for "${searchQuery.label}":`, err instanceof Error ? err.message : err);
  }

  return results;
}

// ── Recent QT history for repetition detection ──────────────────────

async function getRecentQTTexts(limit: number = 30): Promise<string[]> {
  const { data } = await supabase
    .from('ai_generated_content')
    .select('content')
    .eq('user_id', USER_ID)
    .eq('content_type', 'quote_tweet')
    .eq('platform', 'twitter')
    .eq('status', 'posted')
    .order('posted_at', { ascending: false })
    .limit(limit);

  return (data || []).map(r => r.content).filter(Boolean);
}

// ── Generate quote tweet text ───────────────────────────────────────

interface QTGenResult {
  text: string | null;
  slop?: SlopSummary;
  attempts: number;
  skipped?: boolean;
}

async function generateQuoteTweet(
  anthropic: Anthropic,
  tweet: SearchResultTweet,
  recentQTs: string[],
  contactCtx: string = '',
): Promise<QTGenResult> {
  let retryFeedback = '';
  let lastSlop: SlopSummary | undefined;

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
        ? `@${tweet.username} tweeted: "${tweet.text}"\n\nThe screenshot above shows the full tweet including any images. Reference what you SEE if relevant. NEVER mention that you can or cannot see an image.\n\nWrite Maxy's quote tweet. Output ONLY the QT text, nothing else.`
        : `@${tweet.username} tweeted: "${tweet.text}"\n\nWrite Maxy's quote tweet. Output ONLY the QT text, nothing else.`;

      if (retryFeedback) {
        textPrompt += `\n\n⚠️ SELF-EVAL FEEDBACK (attempt ${attempt + 1}): ${retryFeedback}`;
      }

      contentBlocks.push({ type: 'text', text: textPrompt });

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: MAXY_QT_PROMPT + (contactCtx ? `\n\n${contactCtx}` : ''),
        messages: [{ role: 'user', content: contentBlocks }],
      });

      const text = extractSafeText(response, 3, `Twitter QT @${tweet.username}`);
      if (!text) return { text: null, attempts: attempt + 1, slop: lastSlop };

      if (text.trim().toUpperCase() === 'SKIP') {
        console.log(`  ⊘ Model skipped (off-topic tweet)`);
        return { text: null, attempts: attempt + 1, skipped: true, slop: lastSlop };
      }

      if (text.length > 240) {
        console.error(`[QT] Too long (${text.length} chars), skipping`);
        return { text: null, attempts: attempt + 1, slop: lastSlop };
      }

      // Self-evaluation via slop detector
      const slopResult = await fullSlopCheck(anthropic, tweet.text, text, recentQTs);
      lastSlop = summarizeSlop(slopResult, attempt + 1);

      if (slopResult.pass) {
        if (attempt > 0) {
          console.log(`  ✓ Passed slop check on attempt ${attempt + 1} (score: ${slopResult.llmScore}/10)`);
        } else {
          console.log(`  ✓ Slop check passed (score: ${slopResult.llmScore}/10)`);
        }
        return { text, slop: lastSlop, attempts: attempt + 1 };
      }

      const allReasons = [...slopResult.patternReasons, ...slopResult.repetitionReasons];
      console.log(`  ✗ Slop check FAILED (attempt ${attempt + 1}/${MAX_SLOP_RETRIES + 1}): ${allReasons.join(', ')} | LLM: ${slopResult.llmScore}/10 — ${slopResult.llmReason}`);

      if (attempt < MAX_SLOP_RETRIES) {
        retryFeedback = slopResult.retryFeedback;
        recentQTs = [text, ...recentQTs];
      }
    } catch (err) {
      console.error('[QT] Generation failed:', err instanceof Error ? err.message : err);
      return { text: null, attempts: attempt + 1, slop: lastSlop };
    }
  }

  console.log(`  ⊘ All ${MAX_SLOP_RETRIES + 1} attempts failed slop check, skipping tweet`);
  return { text: null, attempts: MAX_SLOP_RETRIES + 1, slop: lastSlop };
}

// ── Post quote tweet via Playwright ─────────────────────────────────

async function postQuoteTweet(
  page: Page,
  tweetUrl: string,
  qtText: string,
): Promise<boolean> {
  try {
    // Navigate to the tweet
    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Click the retweet button to open the menu
    const retweetBtn = page.locator('[data-testid="retweet"]').first();
    await retweetBtn.click({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Click "Quote" in the dropdown menu
    // The menu item contains text like "Quote" — find it by role or text
    const quoteOption = page.getByRole('menuitem').filter({ hasText: /quote/i }).first();
    await quoteOption.click({ timeout: 5000 });
    await page.waitForTimeout(2000);

    // Type into the quote tweet compose box
    const composeBox = page.locator('[data-testid="tweetTextarea_0"]').first();
    await composeBox.click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await composeBox.pressSequentially(qtText, { delay: 30 });
    await page.waitForTimeout(1000);

    // Click the Post button
    const postButton = page.locator('[data-testid="tweetButton"]').first();
    await postButton.click({ timeout: 10000 });
    await page.waitForTimeout(3000);

    return true;
  } catch (err) {
    console.error('[QT] Post failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ── Main cycle ───────────────────────────────────────────────────────

export async function runQuoteTweetCycle(maxQuotes: number = 3): Promise<{
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
    console.log('[QT] Twitter disabled');
    return { attempted: 0, posted: 0, failed: 0 };
  }

  const { urls: quotedUrls, recentUsers } = await getQuoteHistory();
  const recentQTTexts = await getRecentQTTexts(30);
  const anthropic = new Anthropic();
  const cycleCtx: CycleContext = await loadCycleContext(supabase, USER_ID);
  let context: BrowserContext | null = null;
  let attempted = 0;
  let posted = 0;
  let failed = 0;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
      ],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = context.pages()[0] || await context.newPage();

    // Pick 2 random search queries this cycle (QTs are higher-signal, fewer needed)
    const shuffled = [...QT_SEARCHES].sort(() => Math.random() - 0.5);
    const queries = shuffled.slice(0, 2);

    for (const sq of queries) {
      if (posted >= maxQuotes) break;

      console.log(`[QT] Searching: "${sq.label}"...`);

      const tweets = await searchForTweets(page, sq, quotedUrls, recentUsers, 5);
      console.log(`  Found ${tweets.length} quotable tweets`);

      for (const tweet of tweets) {
        if (posted >= maxQuotes) break;

        console.log(`  @${tweet.username}: "${tweet.text.substring(0, 60)}..."`);
        attempted++;

        let contactId: string | null = null;
        let contactCtxBlock = '';
        try {
          const contact = await resolveContact(supabase, USER_ID, 'twitter', tweet.username);
          contactId = contact.id;
          contactCtxBlock = await getContactContext(supabase, contact.id);
          if (tweet.text) {
            await recordEvent(supabase, USER_ID, contact.id, 'reply_in', 'in', 'twitter', tweet.text, 0, { url: tweet.url, kind: 'qt_source' });
          }
        } catch (err) {
          console.error(`  [contact-graph] resolve failed:`, err instanceof Error ? err.message : err);
        }

        const genResult = await generateQuoteTweet(anthropic, tweet, recentQTTexts, contactCtxBlock);
        let qtText: string | null = genResult.text;
        let piiAction: 'suppress' | 'deflect' | null = null;
        let piiReason: string | null = null;
        if (qtText) {
          const gate = gateOutbound(tweet.text, qtText);
          if (gate.action === 'suppress') {
            console.log(`  [pii-guard] SUPPRESSED (${gate.severity}): ${gate.reason}`);
            if (contactId) { try { await flagContact(supabase, contactId, `outbound_blocked:${gate.reason}`); } catch {} }
            piiAction = 'suppress';
            piiReason = gate.reason;
            qtText = null;
          } else if (gate.action === 'deflect') {
            // QT is public — deflection text is fine to post but rare. Skip instead.
            console.log(`  [pii-guard] skipping QT (inbound had logistics intent)`);
            piiAction = 'deflect';
            piiReason = 'logistics_inbound';
            qtText = null;
          }
        }
        if (!qtText) {
          failed++;
          // Mark as seen so it doesn't resurface
          if (tweet.url) {
            quotedUrls.add(tweet.url);
            try {
              await supabase.from('ai_generated_content').insert({
                user_id: USER_ID,
                content_type: 'quote_tweet',
                platform: 'twitter',
                content: '[skipped]',
                generation_strategy: `skipped:${sq.label}`,
                generation_prompt: tweet.url,
                target_account: tweet.username,
                status: 'failed',
                posted_at: new Date().toISOString(),
                generation_context: buildContext(cycleCtx, {
                  voice_flavor: 'quote_tweet',
                  slop: genResult.slop,
                  contact: { id: contactId },
                  target: { platform: 'twitter', username: tweet.username, url: tweet.url, strategy: sq.label },
                  pii_action: piiAction,
                  pii_reason: piiReason,
                  notes: genResult.skipped ? 'model_skip' : 'slop_or_refusal',
                }),
              });
            } catch {} // Don't fail if insert fails
          }
          continue;
        }

        console.log(`  QT: "${qtText}"`);

        if (tweet.url) {
          const success = await postQuoteTweet(page, tweet.url, qtText);
          if (success) {
            console.log(`  ✓ Posted QT on @${tweet.username}'s tweet`);
            posted++;
            quotedUrls.add(tweet.url);
            recentUsers.add(tweet.username.toLowerCase());
            recentQTTexts.unshift(qtText);

            await supabase.from('ai_generated_content').insert({
              user_id: USER_ID,
              content_type: 'quote_tweet',
              platform: 'twitter',
              content: qtText,
              generation_strategy: `search_qt:${sq.label}`,
              generation_prompt: tweet.url,
              target_account: tweet.username,
              status: 'posted',
              posted_at: new Date().toISOString(),
              generation_context: buildContext(cycleCtx, {
                voice_flavor: 'quote_tweet',
                slop: genResult.slop,
                contact: { id: contactId },
                target: { platform: 'twitter', username: tweet.username, url: tweet.url, strategy: sq.label },
                pii_action: piiAction,
                pii_reason: piiReason,
              }),
            });

            if (contactId) {
              try {
                await recordEvent(supabase, USER_ID, contactId, 'reply_out', 'out', 'twitter', qtText, 0, { url: tweet.url, kind: 'qt' });
                await recomputeTier(supabase, contactId);
              } catch (err) {
                console.error(`  [contact-graph] record QT failed:`, err instanceof Error ? err.message : err);
              }
            }
          } else {
            console.log(`  ✗ Failed to post`);
            failed++;
            quotedUrls.add(tweet.url);
          }
        }

        // Rate limit — 30-60 seconds between QTs
        const delay = 30000 + Math.floor(Math.random() * 30000);
        console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  } catch (err) {
    console.error('[QT] Fatal:', err);
  } finally {
    if (context) await context.close();
  }

  return { attempted, posted, failed };
}

// Direct invocation
if (require.main === module) {
  const maxQuotes = parseInt(process.argv[2] || '3', 10);
  console.log(`[Quote Tweet Engine] Starting cycle (max ${maxQuotes} QTs)...\n`);

  runQuoteTweetCycle(maxQuotes).then(result => {
    console.log(`\n[Quote Tweet Engine] Done: ${result.posted} posted, ${result.failed} failed out of ${result.attempted} attempted`);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
