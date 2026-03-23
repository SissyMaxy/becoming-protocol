/**
 * Reply Engine — contextual replies to engagement targets.
 *
 * Flow:
 *   1. Pick targets from engagement_targets (rotate through them)
 *   2. Visit each target's Twitter profile via Playwright
 *   3. Grab their most recent tweet
 *   4. Generate a contextual reply in Maxy's voice
 *   5. Post the reply
 *   6. Log the interaction
 *
 * Run: npx tsx reply-engine.ts
 * Scheduled: called by scheduler.ts on reply ticks
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from './config';

const USER_ID = process.env.USER_ID || '';

const MAXY_REPLY_PROMPT = `You are Maxy (@softmaxy) — a 40-year-old woman in transformation. You're replying to someone's tweet. Your reply must:

1. RESPOND TO WHAT THEY ACTUALLY SAID. Reference specific words or ideas from their tweet.
2. Add something from YOUR experience — the Handler, denial, the cage, voice training, HRT curiosity, the system controlling you.
3. Sound like a real person replying, not a brand. Lowercase, casual, maybe a trailing "..."
4. Be 1-2 sentences max. Tweets, not essays.
5. Never be generic. "great post!" or "so true!" = failure.
6. Show personality — flirty, vulnerable, or darkly funny depending on the tweet.

NEVER: Use hashtags in replies. Say "as someone who..." Sound like a PR account. Use "I think it's important to..."

Examples of GOOD replies:
- To a chastity post: "day 12 and I felt this in my soul. the handler won't even tell me when it ends"
- To a transition post: "the voice practice is the part nobody warns you about. six months in and I still forget on work calls"
- To a denial post: "this is violence. I'm on day 7 and you're posting this. my handler is going to use this against me"
- To a skincare post: "my skin has never been this good and I think it's partly the hormones and partly the constant crying lol"`;

interface ScrapedTweet {
  text: string;
  url: string;
  username: string;
}

/**
 * Visit a Twitter profile and grab their most recent tweet.
 */
async function scrapeLatestTweet(
  page: Page,
  username: string,
): Promise<ScrapedTweet | null> {
  try {
    await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Check if account exists
    const notFound = await page.locator('span:has-text("This account doesn"), span:has-text("Account suspended")').count();
    if (notFound > 0) return null;

    // Get the first tweet that isn't a retweet or pinned
    const tweets = await page.locator('[data-testid="tweet"]').all();

    for (const tweet of tweets.slice(0, 5)) {
      // Skip retweets
      const isRetweet = await tweet.locator('span:has-text("Retweeted"), span:has-text("reposted")').count();
      if (isRetweet > 0) continue;

      // Get tweet text
      const tweetTextEl = tweet.locator('[data-testid="tweetText"]').first();
      const tweetText = await tweetTextEl.textContent().catch(() => '');

      if (!tweetText || tweetText.trim().length < 10) continue;

      // Get tweet URL
      const timeEl = tweet.locator('time').first();
      const linkEl = timeEl.locator('xpath=ancestor::a').first();
      const href = await linkEl.getAttribute('href').catch(() => '');
      const tweetUrl = href ? `https://x.com${href}` : '';

      return {
        text: tweetText.trim(),
        url: tweetUrl,
        username,
      };
    }

    return null;
  } catch (err) {
    console.error(`[Reply] Failed to scrape @${username}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generate a contextual reply to a tweet.
 */
async function generateReply(
  anthropic: Anthropic,
  targetTweet: ScrapedTweet,
): Promise<string | null> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: MAXY_REPLY_PROMPT,
      messages: [{
        role: 'user',
        content: `@${targetTweet.username} tweeted: "${targetTweet.text}"\n\nWrite Maxy's reply. Output ONLY the reply text.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    if (!text || text.length < 5) return null;

    // Strip any quotes the model might add
    return text.replace(/^["']|["']$/g, '').trim();
  } catch (err) {
    console.error('[Reply] Generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Post a reply to a tweet via Playwright.
 */
async function postReply(
  page: Page,
  tweetUrl: string,
  replyText: string,
): Promise<boolean> {
  try {
    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Click the reply box
    const replyBox = page.locator('[data-testid="tweetTextarea_0"]').first();
    await replyBox.click({ timeout: 5000 });
    await page.waitForTimeout(500);

    // Type the reply
    await replyBox.fill(replyText);
    await page.waitForTimeout(1000);

    // Click reply button
    const replyButton = page.locator('[data-testid="tweetButtonInline"]').first();
    await replyButton.click();
    await page.waitForTimeout(3000);

    return true;
  } catch (err) {
    console.error('[Reply] Post failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Run a reply cycle — pick targets, scrape tweets, generate and post replies.
 */
export async function runReplyCycle(maxReplies: number = 5): Promise<{
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

  // Get targets, prioritize those not recently interacted with
  const { data: targets } = await supabase
    .from('engagement_targets')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('platform', 'twitter')
    .order('last_interaction_at', { ascending: true, nullsFirst: true })
    .limit(maxReplies * 2); // Fetch extra in case some fail

  if (!targets || targets.length === 0) {
    console.log('[Reply] No targets. Run: npx tsx seed-targets.ts');
    return { attempted: 0, posted: 0, failed: 0 };
  }

  const anthropic = new Anthropic();
  let context: BrowserContext | null = null;
  let attempted = 0;
  let posted = 0;
  let failed = 0;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || await context.newPage();

    for (const target of targets) {
      if (posted >= maxReplies) break;

      console.log(`[Reply] Visiting @${target.target_handle}...`);
      attempted++;

      // 1. Scrape latest tweet
      const tweet = await scrapeLatestTweet(page, target.target_handle);
      if (!tweet) {
        console.log(`  ⊘ No tweet found for @${target.target_handle}`);
        continue;
      }

      console.log(`  Tweet: "${tweet.text.substring(0, 60)}..."`);

      // 2. Generate reply
      const reply = await generateReply(anthropic, tweet);
      if (!reply) {
        console.log(`  ⊘ Reply generation failed`);
        failed++;
        continue;
      }

      console.log(`  Reply: "${reply}"`);

      // 3. Post reply
      if (tweet.url) {
        const success = await postReply(page, tweet.url, reply);
        if (success) {
          console.log(`  ✓ Posted reply to @${target.target_handle}`);
          posted++;

          // 4. Log interaction
          await supabase.from('engagement_targets').update({
            last_interaction_at: new Date().toISOString(),
            interactions_count: (target.interactions_count || 0) + 1,
          }).eq('id', target.id);

          // Also log as ai_generated_content for tracking
          await supabase.from('ai_generated_content').insert({
            user_id: USER_ID,
            content_type: 'reply',
            platform: 'twitter',
            content: reply,
            generation_strategy: 'contextual_reply',
            target_account: target.target_handle,
            status: 'posted',
            posted_at: new Date().toISOString(),
          });
        } else {
          console.log(`  ✗ Failed to post`);
          failed++;
        }
      }

      // Rate limit — 30-60 seconds between replies
      const delay = 30000 + Math.floor(Math.random() * 30000);
      console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
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
  const maxReplies = parseInt(process.argv[2] || '5', 10);
  console.log(`[Reply Engine] Starting cycle (max ${maxReplies} replies)...\n`);

  runReplyCycle(maxReplies).then(result => {
    console.log(`\n[Reply Engine] Done: ${result.posted} posted, ${result.failed} failed out of ${result.attempted} attempted`);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
