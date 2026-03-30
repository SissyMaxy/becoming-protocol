/**
 * Scheduler — unified engagement engine.
 *
 * Every tick (15 min):
 *   - Post due content
 *   - Twitter replies (4-5)
 *   - Reddit comments (2-3)
 *
 * Every 2nd tick (30 min):
 *   - FetLife group engagement (1)
 *   - Subscriber replies (Fansly + OnlyFans)
 *   - Read DMs + send DM replies
 *
 * All gated by engagement budget.
 *
 * Start with: npm start
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { processAllDuePosts } from './poster';
import { readAllDMs } from './dm-reader';
import { sendPendingDMReplies } from './dm-sender';
import { runReplyCycle } from './reply-engine';
import { runRedditComments } from './platforms/reddit-engage';
import { runFetLifeEngagement } from './platforms/fetlife-engage';
import { runSubscriberReplies } from './platforms/subscriber-engage';
import { runSniffiesEngagement } from './platforms/sniffies-engage';
import { checkBudget } from './engagement-budget';
import { runDMOutreach } from './dm-outreach';
import { supabase, PLATFORMS, POLL_INTERVAL_MS } from './config';

const USER_ID = process.env.USER_ID || '';

// Tick counter for staggering different operations
let tickCount = 0;

/**
 * Load current Handler state for voice calibration.
 */
async function loadState(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  try {
    const { data } = await supabase
      .from('handler_state')
      .select('denial_day, hrt_day')
      .eq('user_id', USER_ID)
      .single();
    if (data) {
      state.denialDay = data.denial_day;
      state.hrtDay = data.hrt_day;
    }
  } catch {
    // State unavailable, proceed without it
  }
  return state;
}

/**
 * Launch a persistent browser context for a platform.
 * Returns null if platform is disabled.
 */
// Platforms that need real Chrome instead of Playwright's Chromium (bot detection)
const STEALTH_PLATFORMS = new Set(['onlyfans', 'sniffies']);

async function launchPlatform(platform: keyof typeof PLATFORMS, retries = 2): Promise<BrowserContext | null> {
  const config = PLATFORMS[platform];
  if (!config.enabled) return null;

  const useStealth = STEALTH_PLATFORMS.has(platform);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const context = await chromium.launchPersistentContext(config.profileDir, {
        ...(useStealth ? { channel: 'chrome' } : {}), // Real Chrome for stealth platforms
        headless: false,
        viewport: { width: 1280, height: 800 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--window-position=-2400,-2400',
        ],
        ...(useStealth ? {
          ignoreDefaultArgs: ['--enable-automation'],
        } : {}),
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });

      // Hide webdriver for stealth platforms
      if (useStealth) {
        const page = context.pages()[0] || await context.newPage();
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
      }

      return context;
    } catch (err) {
      if (attempt < retries) {
        console.log(`[Scheduler] ${platform} launch failed, retrying in 3s (attempt ${attempt + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        console.error(`[Scheduler] Failed to launch ${platform} after ${retries + 1} attempts:`, err instanceof Error ? err.message : err);
        return null;
      }
    }
  }
  return null;
}

async function tick() {
  const timestamp = new Date().toLocaleTimeString();
  tickCount++;
  console.log(`\n[${timestamp}] === Tick ${tickCount} ===`);

  const state = await loadState();
  const anthropic = new Anthropic();

  // Track browser contexts to close at end
  const contexts: BrowserContext[] = [];

  try {
    // --- Every tick: post due content ---
    const { vault, ai } = await processAllDuePosts();
    const total = vault + ai;
    if (total > 0) {
      console.log(`[${timestamp}] Posted ${vault} vault + ${ai} AI = ${total} item(s)`);
    }

    // --- Every tick: Twitter replies (4-5) ---
    if (PLATFORMS.twitter.enabled) {
      const hasBudget = await checkBudget(supabase, USER_ID, 'twitter', 'reply');
      if (hasBudget) {
        const replyResult = await runReplyCycle(4);
        if (replyResult.posted > 0) {
          console.log(`[${timestamp}] Twitter replies: ${replyResult.posted} posted`);
        }
      } else {
        console.log(`[${timestamp}] Twitter reply budget exhausted`);
      }
    }

    // --- Every tick: Reddit comments (2-3) ---
    if (PLATFORMS.reddit.enabled) {
      const hasBudget = await checkBudget(supabase, USER_ID, 'reddit', 'comment');
      if (hasBudget) {
        const redditCtx = await launchPlatform('reddit');
        if (redditCtx) {
          contexts.push(redditCtx);
          const redditPage = redditCtx.pages()[0] || await redditCtx.newPage();
          const redditResult = await runRedditComments(redditPage, supabase, anthropic, USER_ID, state, 3);
          if (redditResult.posted > 0) {
            console.log(`[${timestamp}] Reddit comments: ${redditResult.posted} posted`);
          }
        }
      } else {
        console.log(`[${timestamp}] Reddit comment budget exhausted`);
      }
    }

    // --- Every 2nd tick: FetLife engagement (1) ---
    if (tickCount % 2 === 0 && PLATFORMS.fetlife.enabled) {
      const hasBudget = await checkBudget(supabase, USER_ID, 'fetlife', 'group_discussion');
      if (hasBudget) {
        const fetlifeCtx = await launchPlatform('fetlife');
        if (fetlifeCtx) {
          contexts.push(fetlifeCtx);
          const fetlifePage = fetlifeCtx.pages()[0] || await fetlifeCtx.newPage();
          const fetResult = await runFetLifeEngagement(fetlifePage, supabase, anthropic, USER_ID, state);
          if (fetResult.posted > 0) {
            console.log(`[${timestamp}] FetLife discussions: ${fetResult.posted} posted`);
          }
        }
      } else {
        console.log(`[${timestamp}] FetLife budget exhausted`);
      }
    }

    // --- Every 2nd tick: Subscriber replies ---
    if (tickCount % 2 === 0) {
      let fanslyPage: Page | null = null;
      let ofPage: Page | null = null;

      if (PLATFORMS.fansly.enabled) {
        const fanslyCtx = await launchPlatform('fansly');
        if (fanslyCtx) {
          contexts.push(fanslyCtx);
          fanslyPage = fanslyCtx.pages()[0] || await fanslyCtx.newPage();
        }
      }

      if (PLATFORMS.onlyfans.enabled) {
        const ofCtx = await launchPlatform('onlyfans');
        if (ofCtx) {
          contexts.push(ofCtx);
          ofPage = ofCtx.pages()[0] || await ofCtx.newPage();
        }
      }

      if (fanslyPage || ofPage) {
        const subResult = await runSubscriberReplies(fanslyPage, ofPage, supabase, anthropic, USER_ID, state);
        if (subResult.posted > 0) {
          console.log(`[${timestamp}] Subscriber replies: ${subResult.posted} posted`);
        }
      }
    }

    // --- Every 2nd tick: Sniffies chats (5) ---
    if (tickCount % 2 === 0 && PLATFORMS.sniffies.enabled) {
      const hasBudget = await checkBudget(supabase, USER_ID, 'sniffies', 'chat');
      if (hasBudget) {
        const sniffiesCtx = await launchPlatform('sniffies');
        if (sniffiesCtx) {
          contexts.push(sniffiesCtx);
          const sniffiesPage = sniffiesCtx.pages()[0] || await sniffiesCtx.newPage();
          const sniffResult = await runSniffiesEngagement(sniffiesPage, supabase, anthropic, USER_ID, state, 5);
          if (sniffResult.posted > 0) {
            console.log(`[${timestamp}] Sniffies chats: ${sniffResult.posted} sent`);
          }
        }
      } else {
        console.log(`[${timestamp}] Sniffies chat budget exhausted`);
      }
    }

    // --- Every 2nd tick: DM Outreach (cold DMs to hot targets) ---
    if (tickCount % 2 === 0 && PLATFORMS.twitter.enabled) {
      const hasBudget = await checkBudget(supabase, USER_ID, 'twitter', 'dm');
      if (hasBudget) {
        const outreachResult = await runDMOutreach(3);
        if (outreachResult.sent > 0) {
          console.log(`[${timestamp}] DM outreach: ${outreachResult.sent} sent`);
        }
      } else {
        console.log(`[${timestamp}] DM outreach budget exhausted`);
      }
    }

    // --- Every 2nd tick: DMs (read + reply) ---
    if (tickCount % 2 === 0) {
      const dmResult = await readAllDMs();
      if (dmResult.stored > 0) {
        console.log(`[${timestamp}] DMs: ${dmResult.stored} new message(s) stored`);
      }

      const sent = await sendPendingDMReplies();
      if (sent > 0) {
        console.log(`[${timestamp}] DM replies: ${sent} sent`);
      }
    }
  } catch (err) {
    console.error(`[${timestamp}] Tick error:`, err instanceof Error ? err.message : err);
  } finally {
    // Close all browser contexts
    for (const ctx of contexts) {
      try {
        await ctx.close();
      } catch {
        // Already closed
      }
    }
  }
}

async function main() {
  if (!USER_ID) {
    console.error('Missing USER_ID environment variable');
    process.exit(1);
  }

  const intervalMinutes = POLL_INTERVAL_MS / 60000;

  console.log('=== BP Multi-Platform Engagement Engine ===');
  console.log(`User: ${USER_ID.substring(0, 8)}...`);
  console.log('');
  console.log('Schedule:');
  console.log(`  Every ${intervalMinutes} min: Post content + Twitter replies (4) + Reddit comments (3)`);
  console.log(`  Every ${intervalMinutes * 2} min: FetLife (1) + Subscriber replies + DMs`);
  console.log('');
  console.log('Platforms:');
  for (const [name, cfg] of Object.entries(PLATFORMS)) {
    console.log(`  ${name}: ${cfg.enabled ? 'ENABLED' : 'disabled'}`);
  }
  console.log('');
  console.log('Press Ctrl+C to stop\n');

  // Run immediately, then on interval
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
