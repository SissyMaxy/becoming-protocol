/**
 * Scheduler — runs the poster on an interval.
 * Start with: npm start
 * Keeps running in the background, checking for due posts.
 */

import { processAllDuePosts } from './poster';
import { readAllDMs } from './dm-reader';
import { sendPendingDMReplies } from './dm-sender';
import { runReplyCycle } from './reply-engine';
import { POLL_INTERVAL_MS } from './config';

// Tick counter for staggering different operations
let tickCount = 0;

async function tick() {
  const timestamp = new Date().toLocaleTimeString();
  tickCount++;

  try {
    // Post due original content every tick
    const { vault, ai } = await processAllDuePosts();
    const total = vault + ai;
    if (total > 0) {
      console.log(`[${timestamp}] Posted ${vault} vault + ${ai} AI = ${total} item(s)`);
    }

    // Reply engine — runs every tick (15 min), 3-5 replies per cycle
    // First 2 weeks: 80% replies, 20% original posts = replies are primary
    const replyResult = await runReplyCycle(4);
    if (replyResult.posted > 0) {
      console.log(`[${timestamp}] Replies: ${replyResult.posted} posted to target accounts`);
    }

    // Read DMs every other tick (30 min at 15-min interval)
    if (tickCount % 2 === 0) {
      const dmResult = await readAllDMs();
      if (dmResult.stored > 0) {
        console.log(`[${timestamp}] DMs: ${dmResult.stored} new message(s) stored`);
      }

      // Send any pending DM replies
      const sent = await sendPendingDMReplies();
      if (sent > 0) {
        console.log(`[${timestamp}] DM replies: ${sent} sent`);
      }
    }
  } catch (err) {
    console.error(`[${timestamp}] Tick error:`, err instanceof Error ? err.message : err);
  }
}

async function main() {
  const intervalMinutes = POLL_INTERVAL_MS / 60000;
  console.log('=== BP Auto-Poster + Reply Engine + DM Reader ===');
  console.log(`Posting every ${intervalMinutes} min | Replies every ${intervalMinutes} min (4/cycle) | DMs every ${intervalMinutes * 2} min`);
  console.log('Press Ctrl+C to stop\n');

  // Run immediately, then on interval
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
