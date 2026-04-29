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
import { getSniffiesPage, closeSniffiesSession } from './sniffies-session';
import { getOnlyFansPage, closeOnlyFansSession } from './onlyfans-session';
import { runSniffiesEngagement } from './platforms/sniffies-engage';
import { checkBudget } from './engagement-budget';
import { runDMOutreach } from './dm-outreach';
import { generateCalendar } from './generate-calendar';
import { runFollowbackCycle } from './followback-engine';
import { runEngageFollowCycle } from './engage-follow-engine';
import { runStrategicFollowCycle } from './strategic-follow-engine';
import { runUnfollowStalesCycle } from './unfollow-stales';
import { runQuoteTweetCycle } from './quote-tweet-engine';
import { runVoiceLearn } from './voice-learn';
import { runStaleRevival } from './stale-conversation-revival';
import { runRedditBackfill } from './backfill-reddit-engagement';
import { runScheduledAudit } from './audit-alignment';
import { runWeeklyDigest } from './insights';
import { queueAttentionDedup } from './handler-attention';
import { isTwitterReady, checkTwitterReadiness } from './twitter-readiness';
import { invalidateVoiceCache } from './voice-system';
import { runAllMoneyIngest } from './money-ingest';
import { runAnnounceLive } from './announce-live';
import { persistIrreversibilityScore } from './irreversibility-persist';
import { runIrreversibilityPressure } from './irreversibility-pressure';
import { runRedditOriginalPost } from './platforms/reddit-original-posts';
import { runFanslyPost } from './platforms/fansly-post';
import { runFetLifeBlogPost } from './platforms/fetlife-blog';
import { ensureWeeklyContentPlan } from './content-plan-generator';
import { maybeGenerateBriefs, autoFulfillTextBriefs } from './brief-auto-generator';
import { processInbox } from './inbox-watcher';
import { checkStreamSchedule, postStreamPreAnnounce, recordStreamConsistency } from './stream-scheduler';
import { processReadyBriefs } from './cross-post-orchestrator';
import { armStealthWindowHider } from './window-hider';
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

  // ── Feminization escalation tier (from hidden_operations) ──
  // content_explicitness_tier auto-increments weekly via conditioning engine cron.
  // Tier determines post femininity level in generate-calendar content strategy.
  try {
    const { data: tierRow } = await supabase
      .from('hidden_operations')
      .select('current_value')
      .eq('user_id', USER_ID)
      .eq('parameter', 'content_explicitness_tier')
      .maybeSingle();
    if (tierRow) {
      state.feminizationTier = Math.floor(tierRow.current_value);
      // Tier 1: general feminine lifestyle content
      // Tier 2: explicit feminization references
      // Tier 3: sissy/crossdressing content
      // Tier 4: explicit transformation content
    }
  } catch {
    // Non-critical — defaults to whatever generate-calendar uses
  }

  return state;
}

// ── Denial streak milestone posts ──────────────────────────────────
// When denial streak hits milestones (7, 14, 21, 30 days), auto-generate
// and queue a celebratory/accountability post into ai_generated_content.

const DENIAL_MILESTONES = [7, 14, 21, 30];

async function checkDenialMilestonePosts(): Promise<number> {
  if (!USER_ID) return 0;

  // Get current denial day
  const { data: streak } = await supabase
    .from('denial_streaks')
    .select('started_at')
    .eq('user_id', USER_ID)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!streak?.started_at) return 0;

  const startDate = new Date(streak.started_at);
  const denialDays = Math.floor((Date.now() - startDate.getTime()) / (24 * 60 * 60 * 1000));

  if (!DENIAL_MILESTONES.includes(denialDays)) return 0;

  // Check if we already generated a milestone post for this exact day count
  const { data: existing } = await supabase
    .from('ai_generated_content')
    .select('id')
    .eq('user_id', USER_ID)
    .eq('platform', 'twitter')
    .like('generation_prompt', `%denial-milestone-${denialDays}%`)
    .limit(1);

  if (existing && existing.length > 0) return 0;

  // Build generation prompt based on milestone
  const milestonePrompts: Record<number, string> = {
    7: `Write a tweet celebrating 7 days of chastity/denial as Maxy. Playful, a little unhinged, acknowledging the ache but owning it. Under 240 chars. Casual, lowercase.`,
    14: `Write a tweet marking 2 weeks of chastity/denial as Maxy. She's deep in it now — the denial is changing how she thinks, how she moves. Under 240 chars. Casual, lowercase, horny undertone.`,
    21: `Write a tweet for 3 weeks locked/denied as Maxy. She's a different person now. The denial has rewired something. Under 240 chars. Lowercase, real, a little feral.`,
    30: `Write a tweet for 30 DAYS of chastity/denial as Maxy. A full month. She barely remembers what it felt like before. This is who she is now. Under 240 chars. Lowercase, raw.`,
  };

  const prompt = milestonePrompts[denialDays];
  if (!prompt) return 0;

  // Schedule for 30 minutes from now
  const scheduledAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { error } = await supabase.from('ai_generated_content').insert({
    user_id: USER_ID,
    content_type: 'tweet',
    platform: 'twitter',
    status: 'generated',
    generation_prompt: `[denial-milestone-${denialDays}] ${prompt}`,
    scheduled_at: scheduledAt,
  });

  if (error) {
    console.error(`[Scheduler] Failed to queue denial milestone post:`, error.message);
    return 0;
  }

  console.log(`[Scheduler] Queued denial milestone post: day ${denialDays}`);
  return 1;
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
      // Sniffies needs geolocation
      const needsGeo = platform === 'sniffies' && 'geolocation' in config;
      const geoConfig = needsGeo ? (config as any).geolocation : undefined;

      // Non-stealth platforms run headless (no visible window at all).
      // Stealth platforms (Sniffies, OnlyFans) need real Chrome because their bot detection
      // flags headless — keep them visible-but-minimized off-screen.
      if (useStealth) armStealthWindowHider();
      const context = await chromium.launchPersistentContext(config.profileDir, {
        ...(useStealth ? { channel: 'chrome' } : {}),
        headless: !useStealth,
        viewport: { width: 1280, height: 800 },
        args: [
          '--disable-blink-features=AutomationControlled',
          ...(useStealth ? [
            '--window-position=-32000,-32000',
            '--window-size=1,1',
            '--start-minimized',
            '--silent-launch',
          ] : []),
        ],
        ...(useStealth ? {
          ignoreDefaultArgs: ['--enable-automation'],
        } : {}),
        ...(geoConfig ? {
          geolocation: geoConfig,
          permissions: ['geolocation'],
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

/**
 * Run a function with a timeout — prevents one module from blocking the whole tick.
 *
 * `onSettled` (optional): cleanup callback that runs ONLY after the inner work actually
 * finishes (resolves or rejects), regardless of whether the outer timeout already fired.
 * Use this for browser-context teardown so the cleanup doesn't kill an in-flight task.
 *
 * To prevent leaks if the inner hangs forever, cleanup is force-fired after
 * `timeoutMs + GRACE_MS` even if the inner hasn't settled.
 */
const CLEANUP_GRACE_MS = 60000;

async function withTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs: number = 120000,
  onSettled?: () => Promise<void>,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  const inner = fn();

  if (onSettled) {
    let cleanupRan = false;
    const runCleanup = () => {
      if (cleanupRan) return;
      cleanupRan = true;
      onSettled().catch(err => {
        console.error(`[Scheduler] ${label} cleanup failed:`, err instanceof Error ? err.message : err);
      });
    };
    // Run cleanup when inner actually settles
    inner.then(runCleanup, runCleanup);
    // Hard force after timeout + grace, in case inner hangs forever (prevents browser leak)
    setTimeout(runCleanup, timeoutMs + CLEANUP_GRACE_MS).unref?.();
  }

  try {
    return await Promise.race([
      inner.finally(() => { if (timer) clearTimeout(timer); }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { timedOut = true; reject(new Error('TIMEOUT')); }, timeoutMs);
      }),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (timedOut) {
      console.error(`[Scheduler] ⏱ ${label} timed out after ${timeoutMs / 1000}s — moving on (cleanup deferred until in-flight task settles)`);
    } else {
      console.error(`[Scheduler] ${label} error: ${msg}`);
    }
    return null;
  }
}

async function tick() {
  const timestamp = new Date().toLocaleTimeString();
  tickCount++;
  console.log(`\n[${timestamp}] === Tick ${tickCount} ===`);

  const state = await loadState();
  const anthropic = new Anthropic();

  // Each platform now manages its own browser context lifecycle

  try {
    // --- Every tick: ensure content calendar is populated ---
    await withTimeout('Calendar check', async () => {
      const generated = await generateCalendar(state.feminizationTier as number | undefined);
      if (generated > 0) {
        console.log(`[${timestamp}] Calendar: generated ${generated} post(s) for next 24h`);
      }
    }, 180000); // 3 min — generation + quality gates take time

    // --- Every tick: check denial streak milestone posts ---
    await withTimeout('Denial milestones', async () => {
      await checkDenialMilestonePosts();
    }, 15000);

    // --- Every tick: post due content ---
    const { vault, ai } = await processAllDuePosts();
    const total = vault + ai;
    if (total > 0) {
      console.log(`[${timestamp}] Posted ${vault} vault + ${ai} AI = ${total} item(s)`);
    }

    // --- Once per scheduler session then every 672 ticks (~7d): weekly digest ---
    // Synthesizes performance insights and queues them to handler_attention so
    // Maxy sees "dead subs / best platform / grader agreement" without manually
    // running insights.ts. Dedup window is 6 days so one digest per week.
    if (tickCount === 30 || (tickCount > 30 && tickCount % 672 === 30)) {
      await withTimeout('Weekly digest', async () => {
        try {
          const summary = await runWeeklyDigest();
          if (summary) {
            await queueAttentionDedup(supabase, USER_ID, {
              kind: 'custom',
              severity: 'low',
              summary: `[weekly_digest] ${summary.slice(0, 450)}`,
              payload: { digest: summary, generated_at: new Date().toISOString() },
            }, 6 * 24 * 60);
            console.log(`[${timestamp}] Weekly digest queued to attention`);
          }
        } catch (err) {
          console.error(`[${timestamp}] Weekly digest failed:`, err instanceof Error ? err.message : err);
        }
      }, 60000);
    }

    // --- Every 24 ticks (~6h): grade recent content + persist to content_grades ---
    // Closes the measurement loop started by engagement backfill. Runs alongside
    // backfill so correlation-ready data lands in both tables in the same window.
    if (tickCount % 24 === 7) {
      await withTimeout('Content grading audit', async () => {
        try {
          const r = await runScheduledAudit();
          if (r.graded > 0) {
            console.log(`[${timestamp}] Audit: graded ${r.graded}, persisted ${r.persisted}, avg ${r.avgOverall}/10`);
          }
        } catch (err) {
          console.error(`[${timestamp}] Audit failed:`, err instanceof Error ? err.message : err);
        }
      }, 60000);
    }

    // --- Every 4 ticks (~1h): refresh Reddit engagement stats on posted content ---
    // Walks posts/comments from the last 14d and pulls current score + reply count
    // from Reddit's public JSON API. Stops 0% engagement-backfill being the norm.
    if (tickCount % 4 === 3 && PLATFORMS.reddit.enabled) {
      await withTimeout('Reddit engagement backfill', async () => {
        try {
          const r = await runRedditBackfill();
          if (r.updated > 0) {
            console.log(`[${timestamp}] Reddit backfill: ${r.updated} updated, ${r.skipped} skipped`);
          }
        } catch (err) {
          console.error(`[${timestamp}] Reddit backfill failed:`, err instanceof Error ? err.message : err);
        }
      }, 120000);
    }

    // --- Tick 8 then every 96 ticks (~24h): scan for stale conversations ---
    // Surfaces DMs Maxy let die (unanswered inbounds >48h, our-last-msg ghosts >7d)
    // to the handler_attention queue. Runs early on first boot so she sees the
    // backlog, then daily.
    if (tickCount === 8 || (tickCount > 8 && tickCount % 96 === 8)) {
      await withTimeout('Stale conversation revival', async () => {
        try {
          const r = await runStaleRevival();
          if (r.queued > 0) {
            console.log(`[${timestamp}] Stale revival: ${r.queued} queued to handler attention`);
          }
        } catch (err) {
          console.error(`[${timestamp}] Stale revival failed:`, err instanceof Error ? err.message : err);
        }
      }, 60000);
    }

    // --- Every 16th tick (~4h): scrape Twitter DMs for new voice samples ---
    // Auto-poster must keep learning from manually-typed DMs. Invalidates the
    // voice cache so subsequent ticks pick up the new exemplars immediately.
    // Readiness gate — blocks all Twitter engines until twitter-status passes.
    // Cached 5min so checking on every twitter-engine line below is cheap.
    const twitterReady = await isTwitterReady();
    if (PLATFORMS.twitter.enabled && !twitterReady && tickCount === 1) {
      const r = await checkTwitterReadiness();
      console.log(`[${timestamp}] ⚠ Twitter engines BLOCKED by readiness gate:`);
      for (const b of r.blockers) console.log(`    ✗ ${b}`);
      console.log(`    (run: npm run twitter-status for full report)`);
    }

    if (twitterReady && tickCount % 16 === 1 && PLATFORMS.twitter.engines.voiceLearn) {
      await withTimeout('Voice learn', async () => {
        try {
          const r = await runVoiceLearn();
          console.log(`[${timestamp}] Voice learn: +${r.learned} new, total ${r.total}`);
          if (r.learned > 0) invalidateVoiceCache();
        } catch (err) {
          console.error(`[${timestamp}] Voice learn failed:`, err instanceof Error ? err.message : err);
        }
      }, 180000);
    }

    // --- Every tick: Twitter replies (4-5) --- (5 min timeout)
    if (twitterReady && PLATFORMS.twitter.engines.replies) {
      await withTimeout('Twitter replies', async () => {
        const hasBudget = await checkBudget(supabase, USER_ID, 'twitter', 'reply');
        if (hasBudget) {
          const replyResult = await runReplyCycle(4);
          if (replyResult.posted > 0) {
            console.log(`[${timestamp}] Twitter replies: ${replyResult.posted} posted`);
          }
        } else {
          console.log(`[${timestamp}] Twitter reply budget exhausted`);
        }
      }, 300000);
    }

    // ═══ GROWTH ENGINE (runs early to avoid starvation) ═══════════════

    // --- Every 4th tick (~1h): Twitter follow operations ---
    // Fires on ticks 1, 5, 9, ... (immediate on first tick for verification)
    if (twitterReady && tickCount % 4 === 1 && PLATFORMS.twitter.engines.follows) {
      let twitterFollowCtx: BrowserContext | null = null;
      await withTimeout('Twitter follows', async () => {
        const hasFollowBudget = await checkBudget(supabase, USER_ID, 'twitter', 'follow');
        if (!hasFollowBudget) {
          console.log(`[${timestamp}] Twitter follow budget exhausted`);
          return;
        }

        // Clear lock file
        const fs3 = require('fs');
        try { fs3.unlinkSync(require('path').join(PLATFORMS.twitter.profileDir, 'SingletonLock')); } catch {}

        twitterFollowCtx = await launchPlatform('twitter');
        if (!twitterFollowCtx) return;

        const followPage = twitterFollowCtx.pages()[0] || await twitterFollowCtx.newPage();

        // Followback: scan followers, follow back real accounts (max 8)
        const fbResult = await runFollowbackCycle(followPage, 8);
        if (fbResult.followed > 0) {
          console.log(`[${timestamp}] Followback: ${fbResult.followed} followed (${fbResult.skippedBot} bots skipped)`);
        }

        // Engage-follow: follow people who interact with our tweets (max 5)
        const efResult = await runEngageFollowCycle(followPage, 5);
        if (efResult.followed > 0) {
          console.log(`[${timestamp}] Engage-follow: ${efResult.followed} followed from ${efResult.interactorsFound} interactors`);
        }
      }, 600000, async () => {
        if (twitterFollowCtx) { try { await twitterFollowCtx.close(); } catch {} twitterFollowCtx = null; }
      }); // 10 min — follow ops involve many profile visits with delays
    }

    // --- Every 8th tick (~2h): Strategic follows + unfollow stales ---
    if (twitterReady && tickCount % 8 === 0 && PLATFORMS.twitter.engines.follows) {
      let twitterGrowthCtx: BrowserContext | null = null;
      await withTimeout('Twitter growth', async () => {
        // Clear lock file
        const fs4 = require('fs');
        try { fs4.unlinkSync(require('path').join(PLATFORMS.twitter.profileDir, 'SingletonLock')); } catch {}

        twitterGrowthCtx = await launchPlatform('twitter');
        if (!twitterGrowthCtx) return;

        const growthPage = twitterGrowthCtx.pages()[0] || await twitterGrowthCtx.newPage();

        // Strategic follows (max 10)
        const hasFollowBudget = await checkBudget(supabase, USER_ID, 'twitter', 'follow');
        if (hasFollowBudget) {
          const sfResult = await runStrategicFollowCycle(growthPage, 10);
          if (sfResult.followed > 0) {
            console.log(`[${timestamp}] Strategic follow: ${sfResult.followed} followed (${sfResult.skippedBot} bots)`);
          }
        }

        // Unfollow stales (max 10)
        const hasUnfollowBudget = await checkBudget(supabase, USER_ID, 'twitter', 'unfollow');
        if (hasUnfollowBudget) {
          const usResult = await runUnfollowStalesCycle(growthPage, 10);
          if (usResult.unfollowed > 0) {
            console.log(`[${timestamp}] Unfollow stales: ${usResult.unfollowed} unfollowed, ${usResult.reciprocated} kept`);
          }
        }
      }, 600000, async () => {
        if (twitterGrowthCtx) { try { await twitterGrowthCtx.close(); } catch {} twitterGrowthCtx = null; }
      }); // 10 min
    }

    // --- Every 4th tick (~1h): Quote tweets (2-3) ---
    if (twitterReady && tickCount % 4 === 2 && PLATFORMS.twitter.engines.quoteTweets) {
      await withTimeout('Quote tweets', async () => {
        const hasQTBudget = await checkBudget(supabase, USER_ID, 'twitter', 'quote_tweet');
        if (hasQTBudget) {
          const qtResult = await runQuoteTweetCycle(2);
          if (qtResult.posted > 0) {
            console.log(`[${timestamp}] Quote tweets: ${qtResult.posted} posted`);
          }
        } else {
          console.log(`[${timestamp}] Quote tweet budget exhausted`);
        }
      }, 300000); // 5 min
    }

    // ═══ PLATFORM ENGAGEMENT (slow, browser-heavy) ════════════════════

    // --- Every tick: Reddit comments (2-3) --- (10 min timeout, self-contained)
    if (PLATFORMS.reddit.enabled) {
      let redditCtx: BrowserContext | null = null;
      await withTimeout('Reddit comments', async () => {
        const hasBudget = await checkBudget(supabase, USER_ID, 'reddit', 'comment');
        if (hasBudget) {
          // Clear Chromium lock file that causes launch failures
          const fs = require('fs');
          const lockFile = require('path').join(PLATFORMS.reddit.profileDir, 'SingletonLock');
          try { fs.unlinkSync(lockFile); } catch {}

          redditCtx = await launchPlatform('reddit');
          if (redditCtx) {
            const redditPage = redditCtx.pages()[0] || await redditCtx.newPage();
            const redditResult = await runRedditComments(redditPage, supabase, anthropic, USER_ID, state, 1);
            if (redditResult.posted > 0) {
              console.log(`[${timestamp}] Reddit comments: ${redditResult.posted} posted`);
            }
            // --- Reddit original post (every 4th tick, when a brief is ready) ---
            if (tickCount % 4 === 2) {
              const origResult = await runRedditOriginalPost(redditCtx, redditPage, supabase, anthropic, USER_ID);
              if (origResult.posted) {
                console.log(`[${timestamp}] Reddit original post → r/${origResult.subreddit} (brief ${origResult.briefId?.slice(0, 8)})`);
              } else if (origResult.error && origResult.error !== 'no ready reddit brief') {
                console.log(`[${timestamp}] Reddit original skipped: ${origResult.error}`);
              }
            }
          }
        } else {
          console.log(`[${timestamp}] Reddit comment budget exhausted`);
        }
      }, 600000, async () => {
        if (redditCtx) { try { await redditCtx.close(); } catch {} redditCtx = null; }
      });
    }

    // --- Every 2nd tick: FetLife engagement (1) --- (5 min timeout)
    if (tickCount % 2 === 0 && PLATFORMS.fetlife.enabled) {
      let fetCtx: BrowserContext | null = null;
      await withTimeout('FetLife', async () => {
        const hasBudget = await checkBudget(supabase, USER_ID, 'fetlife', 'group_discussion');
        if (hasBudget) {
          // Clear lock file
          const fs2 = require('fs');
          try { fs2.unlinkSync(require('path').join(PLATFORMS.fetlife.profileDir, 'SingletonLock')); } catch {}
          fetCtx = await launchPlatform('fetlife');
          if (fetCtx) {
            const fetlifePage = fetCtx.pages()[0] || await fetCtx.newPage();
            const fetResult = await runFetLifeEngagement(fetlifePage, supabase, anthropic, USER_ID, state);
            if (fetResult.posted > 0) {
              console.log(`[${timestamp}] FetLife discussions: ${fetResult.posted} posted`);
            }
            // --- Every 4th tick: FetLife blog post (ready brief) ---
            if (tickCount % 4 === 3) {
              const blogResult = await runFetLifeBlogPost(fetCtx, fetPage, supabase, anthropic, USER_ID);
              if (blogResult.posted) {
                console.log(`[${timestamp}] FetLife blog posted (brief ${blogResult.briefId?.slice(0, 8)})`);
              }
            }
          }
        } else {
          console.log(`[${timestamp}] FetLife budget exhausted`);
        }
      }, 300000, async () => {
        if (fetCtx) { try { await fetCtx.close(); } catch {} fetCtx = null; }
      });
    }

    // --- Every 2nd tick: Subscriber replies --- (90s timeout)
    // OnlyFans uses persistent Firefox session; Fansly uses normal Chromium
    if (tickCount % 2 === 0) {
      let fanslyCtx: BrowserContext | null = null;
      await withTimeout('Subscribers', async () => {
        let fanslyPage: Page | null = null;
        let ofPage: Page | null = null;

        if (PLATFORMS.fansly.enabled) {
          fanslyCtx = await launchPlatform('fansly');
          if (fanslyCtx) {
            fanslyPage = fanslyCtx.pages()[0] || await fanslyCtx.newPage();
          }
        }

        if (PLATFORMS.onlyfans.enabled) {
          ofPage = await getOnlyFansPage();
        }

        if (fanslyPage || ofPage) {
          const subResult = await runSubscriberReplies(fanslyPage, ofPage, supabase, anthropic, USER_ID, state);
          if (subResult.posted > 0) {
            console.log(`[${timestamp}] Subscriber replies: ${subResult.posted} posted`);
          }
        }

        // --- Every 4th tick: Fansly original post (ready brief) ---
        if (tickCount % 4 === 1 && fanslyPage && fanslyCtx) {
          const fanslyResult = await runFanslyPost(fanslyCtx, fanslyPage, supabase, anthropic, USER_ID);
          if (fanslyResult.posted) {
            console.log(`[${timestamp}] Fansly post published (brief ${fanslyResult.briefId?.slice(0, 8)})`);
          }
        }
        // OnlyFans is persistent — don't close it here
      }, 90000, async () => {
        if (fanslyCtx) { try { await fanslyCtx.close(); } catch {} fanslyCtx = null; }
      });
    }

    // --- Every tick: Sniffies chats (5) --- (5 min timeout)
    // Uses persistent Firefox session — browser stays open between ticks
    // Sniffies is a hookup app — DMs go stale fast, check every tick
    if (PLATFORMS.sniffies.enabled) {
      await withTimeout('Sniffies', async () => {
        const hasBudget = await checkBudget(supabase, USER_ID, 'sniffies', 'chat');
        if (hasBudget) {
          const sPage = await getSniffiesPage();
          if (sPage) {
            const sniffResult = await runSniffiesEngagement(sPage, supabase, anthropic, USER_ID, state, 5);
            if (sniffResult.posted > 0) {
              console.log(`[${timestamp}] Sniffies chats: ${sniffResult.posted} sent`);
            }
          }
        } else {
          console.log(`[${timestamp}] Sniffies chat budget exhausted`);
        }
      }, 300000); // 5 min
    }

    // --- Every 2nd tick: DM Outreach --- (2 min timeout)
    // CRITICAL: cold DM outreach is what got @Soft_Maxy banned. Default OFF.
    // Re-enabling requires extreme caution + cooldowns + much smaller cohort.
    if (twitterReady && tickCount % 2 === 0 && PLATFORMS.twitter.engines.dmOutreach) {
      await withTimeout('DM Outreach', async () => {
        const hasBudget = await checkBudget(supabase, USER_ID, 'twitter', 'dm');
        if (hasBudget) {
          const outreachResult = await runDMOutreach(3);
          if (outreachResult.sent > 0) {
            console.log(`[${timestamp}] DM outreach: ${outreachResult.sent} sent`);
          }
        } else {
          console.log(`[${timestamp}] DM outreach budget exhausted`);
        }
      });
    }

    // --- Every tick: detect going-live on Chaturbate + fire cross-platform announce ---
    // Cheap (one page fetch). Cooldown is enforced inside runAnnounceLive so re-firing
    // during the same stream is a no-op.
    if (PLATFORMS.chaturbate.enabled && process.env.CHATURBATE_USERNAME) {
      await withTimeout('Live announce', async () => {
        const result = await runAnnounceLive(false);
        if (result.announced) {
          console.log(`[${timestamp}] Live announce fired: tweet=${result.tweeted} dm=${result.dmCount}`);
        }
      }, 90000);

      // --- Stream schedule: pre-announce, nag, track consistency ---
      await withTimeout('Stream scheduler', async () => {
        try {
          const stream = await checkStreamSchedule(supabase, USER_ID);
          if (stream.action === 'pre_announce' && stream.message) {
            await postStreamPreAnnounce(supabase, USER_ID, stream.message);
            console.log(`[${timestamp}] Stream pre-announce queued: "${stream.message}"`);
          } else if (stream.action === 'go_live_now' && stream.message) {
            console.log(`[${timestamp}] ⚠ STREAM: ${stream.message}`);
            // Queue Handler attention so the Handler confronts Maxy
            await supabase.from('handler_attention').insert({
              user_id: USER_ID,
              kind: 'custom',
              severity: 'high',
              platform: 'chaturbate',
              summary: stream.message,
              payload: { next_stream: stream.nextStream },
            });
          }
        } catch {}
      }, 10000);
    }

    // --- Every 4th tick (~1h): Money ingestion (tips, subs, PPV, cam tokens) ---
    // Feeds the contact graph with lifetime_value updates so tier computation
    // moves paying contacts into paid/regular/inner.
    if (tickCount % 4 === 3) {
      await withTimeout('Money ingest', async () => {
        const result = await runAllMoneyIngest();
        if (result.ingested > 0) {
          console.log(`[${timestamp}] Money ingest: ${result.ingested} new payment(s) from ${result.seen} row(s) scanned`);
        }
      }, 180000); // 3 min — three scrapers + dedup reads

      // --- Same cadence: irreversibility score snapshot ---
      // After money ingest (which updates the inputs the score depends on),
      // compute + persist. Score is monotonic in peak; history grows so
      // the Handler can read slope and escalation band.
      await withTimeout('Irreversibility', async () => {
        try {
          const r = await persistIrreversibilityScore(supabase, USER_ID);
          console.log(`[${timestamp}] Irreversibility: ${r.score}/100 [${r.band}] peak=${r.peak}`);
          const p = await runIrreversibilityPressure(supabase, USER_ID);
          if (p.issued > 0 || p.skipped > 0) {
            console.log(`[${timestamp}] Pressure: issued=${p.issued} skipped=${p.skipped} axes=[${p.axes.join(',')}]`);
          }
        } catch (e) {
          console.log(`[${timestamp}] Irreversibility failed: ${e instanceof Error ? e.message : e}`);
        }
      }, 30000);

      // --- Content coercion: weekly plan + auto brief top-up ---
      await withTimeout('Content planning', async () => {
        try {
          const plan = await ensureWeeklyContentPlan(supabase, USER_ID);
          if (plan.created) {
            console.log(`[${timestamp}] Content plan for week ${plan.week_start} — theme: ${plan.theme}`);
          }
          const created = await maybeGenerateBriefs(supabase, USER_ID, { minPending: 3, toCreate: 3 });
          if (created > 0) {
            console.log(`[${timestamp}] Generated ${created} new content brief(s)`);
          }
          // Auto-fulfill text_only briefs (FetLife writings, etc.) — no photo needed
          const textFulfilled = await autoFulfillTextBriefs(supabase, USER_ID, anthropic);
          if (textFulfilled > 0) {
            console.log(`[${timestamp}] Auto-fulfilled ${textFulfilled} text brief(s)`);
          }
          // Inbox folder watcher — drag-and-drop photo fulfillment
          const inboxed = await processInbox(supabase, USER_ID);
          if (inboxed > 0) {
            console.log(`[${timestamp}] Inbox: matched ${inboxed} file(s) to pending brief(s)`);
          }
          // Cross-post orchestrator — process ready_to_post production briefs
          const crossPosted = await processReadyBriefs(supabase, anthropic, USER_ID);
          if (crossPosted > 0) {
            console.log(`[${timestamp}] Cross-posted: ${crossPosted} platform caption(s) queued`);
          }
        } catch (e) {
          console.log(`[${timestamp}] Content planning failed: ${e instanceof Error ? e.message : e}`);
        }
      }, 30000);
    }

    // --- Every 2nd tick: DMs (read + reply) --- (90s timeout)
    if (tickCount % 2 === 0) {
      await withTimeout('DM read/send', async () => {
        const dmResult = await readAllDMs(anthropic);
        if (dmResult.stored > 0) {
          console.log(`[${timestamp}] DMs: ${dmResult.stored} new message(s) stored`);
        }

        const sent = await sendPendingDMReplies();
        if (sent > 0) {
          console.log(`[${timestamp}] DM replies: ${sent} sent`);
        }
      }, 90000);
    }

  } catch (err) {
    console.error(`[${timestamp}] Tick error:`, err instanceof Error ? err.message : err);
  }
}

async function main() {
  if (!USER_ID) {
    console.error('Missing USER_ID environment variable');
    process.exit(1);
  }

  // Arm the stealth window hider FIRST, before any import-time or launch-time
  // browser window can appear. Polls at 100ms on Windows only.
  armStealthWindowHider();

  const intervalMinutes = POLL_INTERVAL_MS / 60000;

  console.log('=== BP Multi-Platform Engagement Engine ===');
  console.log(`User: ${USER_ID.substring(0, 8)}...`);
  console.log('');
  console.log('Schedule:');
  console.log(`  Every ${intervalMinutes} min: Post content + Twitter replies (4)`);
  console.log(`  Every ${intervalMinutes * 4} min: Growth — Followback + Engage-follow`);
  console.log(`  Every ${intervalMinutes * 4} min: Growth — Quote tweets (offset tick)`);
  console.log(`  Every ${intervalMinutes * 8} min: Growth — Strategic follows + Unfollow stales`);
  console.log(`  Every ${intervalMinutes} min: Reddit comments (1) [slow]`);
  console.log(`  Every ${intervalMinutes} min: Sniffies chats (5)`);
  console.log(`  Every ${intervalMinutes * 2} min: FetLife (1) + Subscribers + DMs [slow]`);
  console.log('');
  console.log('Platforms:');
  for (const [name, cfg] of Object.entries(PLATFORMS)) {
    console.log(`  ${name}: ${cfg.enabled ? 'ENABLED' : 'disabled'}`);
  }
  console.log('');
  console.log('Press Ctrl+C to stop\n');

  // Clean up persistent sessions on shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await closeSniffiesSession();
    await closeOnlyFansSession();
    process.exit(0);
  });

  // Run immediately, then on interval
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
