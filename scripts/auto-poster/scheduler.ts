/**
 * Scheduler — runs the poster on an interval.
 * Start with: npm start
 * Keeps running in the background, checking for due posts.
 */

import { processAllDuePosts } from './poster';
import { POLL_INTERVAL_MS } from './config';

async function tick() {
  const timestamp = new Date().toLocaleTimeString();
  try {
    const { vault, ai } = await processAllDuePosts();
    const total = vault + ai;
    if (total > 0) {
      console.log(`[${timestamp}] Posted ${vault} vault + ${ai} AI = ${total} item(s)`);
    }
  } catch (err) {
    console.error(`[${timestamp}] Tick error:`, err instanceof Error ? err.message : err);
  }
}

async function main() {
  const intervalMinutes = POLL_INTERVAL_MS / 60000;
  console.log('=== BP Auto-Poster Scheduler ===');
  console.log(`Polling every ${intervalMinutes} minutes`);
  console.log('Press Ctrl+C to stop\n');

  // Run immediately, then on interval
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
