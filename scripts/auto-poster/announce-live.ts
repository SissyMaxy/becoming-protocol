/**
 * Going-live announcement engine.
 *
 * When Maxy's Chaturbate room is live:
 *   1. Tweet a "live now" post with the room URL
 *   2. DM the top N highest-LTV fans ("come watch, your girl is on")
 *   3. Post a short note in FetLife feed (optional, toggled by env)
 *
 * Detection: polls https://chaturbate.com/<username>/ and looks for the "OFFLINE"
 * banner; absence = live. Tracks last-announced timestamp to avoid re-announcing
 * during the same session (6h cooldown).
 *
 * Run manually:  npm run announce-live [force]
 * Scheduled:     called by scheduler.ts every tick; no-op if offline or cooldown
 *
 * Env required:  CHATURBATE_USERNAME  (room slug, e.g. "softmaxy")
 */

import 'dotenv/config';
import { chromium, type BrowserContext } from 'playwright';
import { supabase, PLATFORMS } from './config';
import { queueAttention } from './handler-attention';

const USER_ID = process.env.USER_ID || '';
const CB_USERNAME = process.env.CHATURBATE_USERNAME || '';
const ANNOUNCE_COOLDOWN_HOURS = 6;

interface AnnounceResult {
  live: boolean;
  announced: boolean;
  reason?: string;
  tweeted?: boolean;
  dmCount?: number;
}

/**
 * Check if the Chaturbate room is currently live.
 * Returns true if live, false if offline or unknown.
 */
export async function isChaturbateLive(): Promise<boolean> {
  if (!CB_USERNAME) return false;

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(PLATFORMS.chaturbate.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(`https://chaturbate.com/${CB_USERNAME}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Offline rooms show an OFFLINE banner or a "not currently online" message.
    const offlineMarkers = await page.locator(
      'text=/offline/i, text=/not currently online/i, text=/broadcaster is offline/i, [class*="offline"]'
    ).count();

    // Live rooms show the video player + viewer count.
    const liveMarkers = await page.locator(
      '[class*="viewer-count"], #main_video_frame, video, [class*="live-indicator"]'
    ).count();

    return liveMarkers > 0 && offlineMarkers === 0;
  } catch (err) {
    console.error('[announce-live] detection failed:', err instanceof Error ? err.message : err);
    return false;
  } finally {
    if (context) await context.close();
  }
}

async function lastAnnounceWithinCooldown(): Promise<boolean> {
  const cutoff = new Date(Date.now() - ANNOUNCE_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('ai_generated_content')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .eq('content_type', 'live_announce')
    .gte('posted_at', cutoff);
  return (count || 0) > 0;
}

async function logAnnounce(content: string, platform: string, target?: string): Promise<void> {
  await supabase.from('ai_generated_content').insert({
    user_id: USER_ID,
    content_type: 'live_announce',
    platform,
    content,
    generation_strategy: 'going_live',
    target_account: target,
    status: 'posted',
    posted_at: new Date().toISOString(),
  });
}

/**
 * Post the live tweet via the existing Twitter posting infrastructure.
 * Uses the twitter platform's standalone poster.
 */
async function tweetLive(text: string): Promise<boolean> {
  try {
    const { postToTwitter } = await import('./platforms/twitter');
    const result = await postToTwitter(text);
    return result.success;
  } catch (err) {
    console.error('[announce-live] tweet failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Queue DMs to top-LTV contacts on Twitter. Uses existing paid_conversations pipeline
 * so dm-sender delivers them at its own cadence.
 */
async function dmTopFans(message: string, max: number): Promise<number> {
  // Top fans across all platforms, but we only DM via Twitter for now
  // (that's what dm-sender supports most reliably).
  const { data: topContacts } = await supabase
    .from('contacts')
    .select('id, display_name')
    .eq('user_id', USER_ID)
    .gt('lifetime_value_cents', 0)
    .order('lifetime_value_cents', { ascending: false })
    .limit(max * 3); // overscan — some won't have a twitter handle
  if (!topContacts) return 0;

  let queued = 0;
  for (const c of topContacts) {
    if (queued >= max) break;
    const { data: handle } = await supabase
      .from('contact_handles')
      .select('handle')
      .eq('contact_id', c.id)
      .eq('platform', 'twitter')
      .maybeSingle();
    if (!handle?.handle) continue;

    // Dedup: don't queue a duplicate live-announce DM within the cooldown window.
    const cutoff = new Date(Date.now() - ANNOUNCE_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
    const { count } = await supabase.from('paid_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', USER_ID)
      .eq('subscriber_id', handle.handle)
      .eq('platform', 'twitter')
      .eq('conversation_type', 'live_announce_dm')
      .gte('sent_at', cutoff);
    if ((count || 0) > 0) continue;

    await supabase.from('paid_conversations').insert({
      user_id: USER_ID,
      platform: 'twitter',
      subscriber_id: handle.handle,
      subscriber_name: c.display_name,
      conversation_type: 'live_announce_dm',
      handler_response: message,
      message_direction: 'outbound',
      sent_at: null,
    });
    queued++;
  }
  return queued;
}

export async function runAnnounceLive(force = false): Promise<AnnounceResult> {
  if (!CB_USERNAME) return { live: false, announced: false, reason: 'CHATURBATE_USERNAME unset' };

  if (!force && await lastAnnounceWithinCooldown()) {
    return { live: true, announced: false, reason: 'cooldown active' };
  }

  const live = await isChaturbateLive();
  if (!live && !force) return { live: false, announced: false, reason: 'not live' };

  const roomUrl = `https://chaturbate.com/${CB_USERNAME}/`;
  const tweetText = `live on cam. ${roomUrl}`;
  const dmText = `your girl is live on cam right now. ${roomUrl} come say hi`;

  const tweeted = await tweetLive(tweetText);
  if (tweeted) await logAnnounce(tweetText, 'twitter', '@softmaxy');

  const dmCount = await dmTopFans(dmText, 30);
  if (dmCount > 0) await logAnnounce(dmText, 'twitter_dm', `top_${dmCount}_fans`);

  await queueAttention(supabase, USER_ID, {
    kind: 'live_announce_triggered',
    severity: 'low',
    summary: `Live announce fired: tweet=${tweeted} dm=${dmCount}`,
    payload: { room_url: roomUrl, tweet_text: tweetText, dm_count: dmCount },
  });

  return { live: true, announced: true, tweeted, dmCount };
}

// Direct invocation
if (require.main === module) {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }
  const force = process.argv[2] === 'force';
  (async () => {
    const result = await runAnnounceLive(force);
    console.log(`[announce-live]`, result);
    process.exit(0);
  })();
}
