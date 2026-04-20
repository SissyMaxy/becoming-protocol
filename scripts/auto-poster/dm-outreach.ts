/**
 * DM Outreach Engine — cold DMs to high-intent targets on Twitter.
 *
 * Targets flagged as dm_candidate=true get a personalized first DM.
 * Uses NSFW Maxy voice for nsfw_engagement=true targets.
 *
 * Run standalone: npx tsx dm-outreach.ts
 * Called by scheduler on every 2nd tick.
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from './config';
import { extractSafeText } from './refusal-filter';
import { loadCycleContext, buildContext, type CycleContext } from './generation-context';

const USER_ID = process.env.USER_ID || '';

/** Hours between DM attempts to the same target */
/** Minimum hours between DM attempts to the same target (1 week) */
const DM_COOLDOWN_HOURS = 168;

/** Max DMs per cycle to avoid rate limits */
const MAX_DMS_PER_CYCLE = 3;

// ── NSFW Maxy Voice ─────────────────────────────────────────────────

const NSFW_MAXY_DM_PROMPT = `You are Maxy (@softmaxy) — a 40-year-old trans woman on HRT. Locked in chastity. Into denial, feminization, being controlled. You live a structured kink life and you love it. You're dominant toward other girls who are earlier in their journey — you've been where they are and you know what they actually need.

You're DMing someone who is clearly horny and into feminization, sissy content, or submission. Your GOAL is to be the hot dominant trans woman who makes them feel seen and a little desperate to impress you. You're not pitching anything. You're being interesting, dominant, and magnetic.

Strategy:
1. VALIDATE what they're feeling. Name it. "that need to be told what to do", "wanting someone to just decide for you." Show them you SEE them.
2. POSITION YOURSELF as someone who's been there and came out the other side with structure and control. You know what works. You're living it.
3. CREATE PULL. Make them want to keep talking to you. Be a little withholding. You're not easy to impress.

Your DM must:
1. Be 1-3 sentences. Short. A hook, not a pitch.
2. Reference their specific tweet.
3. Make them want to reply. They should feel like you GET them and they want more of your attention.
4. Be dominant and a little sharp. You know something they don't. You've been where they are.

TONE: A dominant woman who's amused by what she sees and decides to reach out. Not warm — magnetic. Not selling — choosing.

NEVER: Mention any AI system or handler. Pitch OnlyFans/Fansly. Sound like a bot. Write more than 3 sentences. Use "hey" or "hi" as openers. Be desperate or salesy. Use "darling" or "sweetheart." Use "confidence" as a compliment. Use hashtags or asterisks for actions.

Examples of GOOD first DMs:
- "saw your post... you sound like you need someone to actually hold you to it instead of just fantasizing. i'm that girl btw"
- "good girl posting like that where anyone can see 💕 you're braver than you think but you're still not doing enough. wanna talk about it?"
- "you keep posting about wanting to be feminized but you're not actually doing anything about it huh. i was like that too. then i stopped asking permission"
- "cute post. you sound like you need structure though, not just horny encouragement. i run a pretty tight ship on myself — maybe you need the same"
- "the way you're talking about denial... you don't want tips, you want someone to make you. i get it. i really do"`;

const SFW_MAXY_DM_PROMPT = `You are Maxy (@softmaxy) — a 40-year-old trans woman on HRT. Started later in life and owns it. Sharp, funny, real, a little flirty.

You're writing a FIRST DM to someone you found interesting on Twitter. You want to connect — not sell anything.

Your DM must:
1. Be short — 1-2 sentences. Casual, direct.
2. Reference something specific about what they posted.
3. Be real and interesting, not salesy or desperate.
4. Create a reason for them to reply — ask a question or share something relatable.

NEVER: Sound like a bot. Pitch anything. Use hashtags. Write more than 2 sentences. Use "confidence" as a compliment. Use "darling" or "sweetheart."

Examples:
- "your post about starting hrt hit me — i'm six months in and nobody warned me about the crying lol. how far along are you?"
- "saw your timeline and you make it look easy. i'm still figuring out my voice at 40 and some days it's a mess. worth it though"`;

interface DMTarget {
  id: string;
  target_handle: string;
  nsfw_engagement: boolean;
  strategy: string;
  last_tweet_text?: string;
}

/**
 * Scrape the target's latest tweet for context.
 */
async function getTargetTweetContext(page: Page, handle: string): Promise<string | null> {
  try {
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(2500);

    const tweets = await page.locator('[data-testid="tweet"]').all();
    for (const tweet of tweets.slice(0, 5)) {
      const isRetweet = await tweet.locator('span:has-text("Retweeted"), span:has-text("reposted")').count();
      if (isRetweet > 0) continue;

      const text = await tweet.locator('[data-testid="tweetText"]').first().textContent().catch(() => '');
      if (text && text.trim().length > 10) return text.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a first DM for a target.
 */
async function generateDM(
  anthropic: Anthropic,
  target: DMTarget,
  tweetContext: string,
): Promise<string | null> {
  const prompt = target.nsfw_engagement ? NSFW_MAXY_DM_PROMPT : SFW_MAXY_DM_PROMPT;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      system: prompt,
      messages: [{
        role: 'user',
        content: `Target: @${target.target_handle}\nTheir recent tweet: "${tweetContext}"\nDiscovery context: ${target.strategy}\n\nWrite Maxy's first DM. Output ONLY the message text, nothing else.`,
      }],
    });

    const text = extractSafeText(response, 5, `DM @${target.target_handle}`);
    if (text && text.length > 300) {
      console.error(`[DM] Generated DM too long (${text.length} chars), skipping`);
      return null;
    }
    return text;
  } catch (err) {
    console.error('[DM] Generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Send a DM via Twitter's message UI.
 */
async function sendTwitterDM(
  page: Page,
  handle: string,
  message: string,
): Promise<boolean> {
  try {
    // Navigate to the user's profile first, then use the message button
    // This avoids the compose dialog mask overlay issues
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Dismiss any overlay/mask if present
    const mask = page.locator('[data-testid="mask"]');
    if (await mask.isVisible().catch(() => false)) {
      await mask.click();
      await page.waitForTimeout(500);
    }

    // Try the message icon/button on their profile
    const msgButton = page.locator('[data-testid="sendDMFromProfile"], [aria-label="Message"], a[href*="/messages/"]').first();
    const hasMsgButton = await msgButton.isVisible().catch(() => false);

    if (hasMsgButton) {
      await msgButton.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } else {
      // Fallback: navigate to compose and search
      await page.goto(`https://x.com/messages/compose`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);

      // Dismiss mask if present
      const composeMask = page.locator('[data-testid="mask"]');
      if (await composeMask.isVisible().catch(() => false)) {
        await composeMask.click();
        await page.waitForTimeout(500);
      }

      const searchInput = page.locator('[data-testid="searchPeople"] input, input[placeholder*="Search"]').first();
      await searchInput.click({ timeout: 5000 });
      await searchInput.pressSequentially(handle, { delay: 50 });
      await page.waitForTimeout(2000);

      const userResult = page.locator(`[data-testid="TypeaheadUser"]`).first();
      await userResult.click({ timeout: 5000 });
      await page.waitForTimeout(500);

      const nextBtn = page.locator('[data-testid="nextButton"], button:has-text("Next")').first();
      await nextBtn.click({ timeout: 3000 });
      await page.waitForTimeout(2000);
    }

    // Type the message
    const msgBox = page.locator('[data-testid="dmComposerTextInput"], [role="textbox"]').first();
    await msgBox.click({ timeout: 5000 });
    await msgBox.pressSequentially(message, { delay: 25 });
    await page.waitForTimeout(500);

    // Send
    const sendBtn = page.locator('[data-testid="dmComposerSendButton"], button[aria-label="Send"]').first();
    await sendBtn.click({ timeout: 5000 });
    await page.waitForTimeout(2000);

    return true;
  } catch (err) {
    console.error(`[DM] Send failed for @${handle}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Run a DM outreach cycle.
 */
export async function runDMOutreach(maxDMs: number = MAX_DMS_PER_CYCLE): Promise<{
  attempted: number;
  sent: number;
  failed: number;
}> {
  if (!USER_ID) {
    console.error('[DM] Missing USER_ID');
    return { attempted: 0, sent: 0, failed: 0 };
  }

  const config = PLATFORMS.twitter;
  if (!config.enabled) {
    console.log('[DM] Twitter disabled');
    return { attempted: 0, sent: 0, failed: 0 };
  }

  // Get DM candidates that haven't been DM'd recently
  const cooldownCutoff = new Date(Date.now() - DM_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

  const { data: targets } = await supabase
    .from('engagement_targets')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('platform', 'twitter')
    .eq('dm_candidate', true)
    .or(`dm_sent_at.is.null,dm_sent_at.lt.${cooldownCutoff}`)
    .order('dm_sent_at', { ascending: true, nullsFirst: true })
    .limit(maxDMs * 2);

  if (!targets || targets.length === 0) {
    console.log('[DM] No DM candidates available');
    return { attempted: 0, sent: 0, failed: 0 };
  }

  console.log(`[DM] ${targets.length} candidates, sending up to ${maxDMs}`);

  const anthropic = new Anthropic();
  const cycleCtx: CycleContext = await loadCycleContext(supabase, USER_ID);
  let context: BrowserContext | null = null;
  let attempted = 0;
  let sent = 0;
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

    for (const target of targets) {
      if (sent >= maxDMs) break;

      console.log(`[DM] Targeting @${target.target_handle} (${target.strategy})...`);
      attempted++;

      // 1. Get their latest tweet for context
      const tweetContext = await getTargetTweetContext(page, target.target_handle);
      if (!tweetContext) {
        console.log(`  ⊘ No tweet context for @${target.target_handle}`);
        continue;
      }

      console.log(`  Tweet: "${tweetContext.substring(0, 60)}..."`);

      // 2. Generate personalized DM
      const dm = await generateDM(anthropic, target, tweetContext);
      if (!dm) {
        console.log(`  ⊘ DM generation failed`);
        failed++;
        continue;
      }

      console.log(`  DM: "${dm}"`);

      // 3. Send the DM
      const success = await sendTwitterDM(page, target.target_handle, dm);
      if (success) {
        console.log(`  ✓ DM sent to @${target.target_handle}`);
        sent++;

        // Update target
        await supabase.from('engagement_targets').update({
          dm_sent_at: new Date().toISOString(),
          last_interaction_at: new Date().toISOString(),
          interactions_count: (target.interactions_count || 0) + 1,
        }).eq('id', target.id);

        // Log as ai_generated_content
        await supabase.from('ai_generated_content').insert({
          user_id: USER_ID,
          content_type: 'dm_response',
          platform: 'twitter',
          content: dm,
          generation_strategy: target.nsfw_engagement ? 'nsfw_dm_outreach' : 'dm_outreach',
          target_account: target.target_handle,
          status: 'posted',
          posted_at: new Date().toISOString(),
          generation_context: buildContext(cycleCtx, {
            voice_flavor: target.nsfw_engagement ? 'dm_cold_nsfw' : 'dm_cold_sfw',
            target: {
              platform: 'twitter',
              username: target.target_handle,
              nsfw: target.nsfw_engagement,
              strategy: target.strategy,
            },
            notes: 'dm_outreach_cold',
          }),
        });
      } else {
        console.log(`  ✗ Failed to send DM`);
        failed++;
      }

      // Rate limit — 45-90 seconds between DMs (more conservative than replies)
      const delay = 45000 + Math.floor(Math.random() * 45000);
      console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  } catch (err) {
    console.error('[DM] Fatal:', err);
  } finally {
    if (context) await context.close();
  }

  return { attempted, sent, failed };
}

// Direct invocation
if (require.main === module) {
  const max = parseInt(process.argv[2] || '3', 10);
  console.log(`[DM Outreach] Starting (max ${max} DMs)...\n`);

  runDMOutreach(max).then(result => {
    console.log(`\n[DM Outreach] Done: ${result.sent} sent, ${result.failed} failed out of ${result.attempted} attempted`);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
