/**
 * Twitter Reset — wipes the old browser profile and prepares for a fresh
 * account login. The previous @Soft_Maxy account was banned for "inauthentic
 * activity"; reusing the same browser profile carries the old session, cookies,
 * and likely device fingerprint hints that contributed to the ban.
 *
 * Run BEFORE `npx tsx login.ts twitter` when switching to a new account.
 *
 * What this does:
 *   1. Backs up the old profile to .browser-profiles/twitter.banned-<timestamp>/
 *   2. Removes the active profile directory so the next login starts fresh
 *   3. Reports current Twitter granular flag state from .env
 *   4. Reminds you of the survival rules
 *
 * Run: npm run twitter-reset
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PLATFORMS } from './config';

function backupAndClearProfile() {
  const profileDir = PLATFORMS.twitter.profileDir;
  if (!fs.existsSync(profileDir)) {
    console.log(`[twitter-reset] No existing profile at ${profileDir} — nothing to back up`);
    return;
  }

  // Common locks that block rename on Windows
  const locks = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const f of locks) {
    const p = path.join(profileDir, f);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = profileDir + '.banned-' + stamp;

  console.log(`[twitter-reset] Backing up old profile:\n  ${profileDir}\n  → ${backupDir}`);
  try {
    fs.renameSync(profileDir, backupDir);
    console.log(`[twitter-reset] ✓ Old profile preserved at ${path.basename(backupDir)}`);
    console.log(`[twitter-reset]   (delete it manually later when you're sure you don't need it)`);
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EPERM') throw err;
    console.error(`[twitter-reset] ✗ Rename blocked by EPERM — directory is locked.`);
    console.error(`[twitter-reset]   A Chromium process is probably still holding the profile open.`);
    console.error('');
    console.error('Fix:');
    console.error('  1. Make sure scheduler is stopped (Ctrl+C any running npm start).');
    console.error('  2. Run this PowerShell one-liner to kill stray Playwright Chromium:');
    console.error("     Get-Process chrome | Where-Object { $_.Path -like '*playwright*' } | Stop-Process -Force");
    console.error('  3. Re-run: npm run twitter-reset');
    console.error('');
    console.error('  If Step 2 shows nothing but rename still fails, the profile may be');
    console.error('  open in your personal Chrome — close any Chrome windows + retry.');
    process.exit(1);
  }
}

function reportFlagState() {
  console.log('\n[twitter-reset] Current Twitter granular flag state:');
  const e = PLATFORMS.twitter.engines;
  const flag = (label: string, on: boolean) => `  ${on ? '✓' : '·'} ${label.padEnd(28)} ${on ? 'ENABLED' : 'disabled'}`;
  console.log(`  Platform-level (ENABLE_TWITTER):  ${PLATFORMS.twitter.enabled ? 'ENABLED' : 'disabled'}`);
  console.log(flag('  posts (calendar)', e.posts));
  console.log(flag('  voice_learn (read-only)', e.voiceLearn));
  console.log(flag('  replies', e.replies));
  console.log(flag('  quote_tweets', e.quoteTweets));
  console.log(flag('  follows', e.follows));
  console.log(flag('  dm_reader', e.dmReader));
  console.log(flag('  dm_outreach (DANGEROUS)', e.dmOutreach));
}

function survivalRules() {
  console.log(`
[twitter-reset] Survival rules — read these. Last account was banned in 2 weeks.

  1. NO REPLY ENGINE for the first 60 days
     - reply-engine + quote-tweet at scale = bot signal #1.
     - Set ENABLE_TWITTER_REPLIES=false (default).

  2. NO COLD DM OUTREACH ever again
     - That's literally what got @Soft_Maxy flagged.
     - Set ENABLE_TWITTER_DM_OUTREACH=false (default).

  3. CALENDAR POSTS ONLY at 1–3/day max for first 30 days
     - Twitter detects 24/7 posting cadence. Gap things out.
     - Use generate-calendar's existing slot system; don't let it schedule >3/day.

  4. NO FOLLOW ENGINE for the first 30 days
     - Followback + engage-follow + strategic follow at scale = bot signal #2.
     - Set ENABLE_TWITTER_FOLLOWS=false (default).

  5. New email + new device + new IP for signup
     - Same machine + same wifi as @Soft_Maxy = re-ban in days. Phone on cellular if you must.

  6. Don't reuse the old phone number
     - X keeps phone-number → account links forever.

  7. 30-day warm-up before any automation:
     - Just login, scroll, like, follow a few accounts manually.
     - No posting, no replies, no engines. Look human.
     - After 30 days: enable ENABLE_TWITTER_POSTS only.

  Recommended ramp after warm-up:
    Day 30:   ENABLE_TWITTER=true, ENABLE_TWITTER_POSTS=true (default)
              ENABLE_TWITTER_VOICE_LEARN=true (read-only, low risk)
    Day 60+:  ENABLE_TWITTER_REPLIES=true (small batches)
    Day 90+:  ENABLE_TWITTER_FOLLOWS, ENABLE_TWITTER_QT (optional)
    Never:    ENABLE_TWITTER_DM_OUTREACH

[twitter-reset] Next steps after this script:
  1. Update .env: see suggested config in twitter-reset --suggest output
  2. Login fresh: npx tsx login.ts twitter
  3. Verify: npm run check
  4. Don't run \`npm start\` until you've done the 30-day human warm-up.
`);
}

function suggestEnv() {
  console.log(`
[twitter-reset] Suggested .env entries for fresh account warm-up phase:

# === Twitter (fresh account, day 0–30 warm-up) ===
ENABLE_TWITTER=false               # leave OFF until day 30; manually use the account first
ENABLE_TWITTER_POSTS=true          # default; activates only when ENABLE_TWITTER=true
ENABLE_TWITTER_VOICE_LEARN=true    # default; safe read-only scraping
ENABLE_TWITTER_REPLIES=false       # OFF until day 60+
ENABLE_TWITTER_QT=false            # OFF until day 90+
ENABLE_TWITTER_FOLLOWS=false       # OFF until day 60+
ENABLE_TWITTER_DM_READER=false     # OFF until well-established
ENABLE_TWITTER_DM_OUTREACH=false   # never re-enable; this is what burned the last account

# When you're ready to start posting (day 30):
# Change ENABLE_TWITTER=true.
# Everything else stays as above. Posts will start landing on next scheduler tick.
`);
}

async function main() {
  const args = process.argv.slice(2);
  const onlySuggest = args.includes('--suggest');
  const skipBackup = args.includes('--skip-backup');

  if (onlySuggest) {
    suggestEnv();
    return;
  }

  if (!skipBackup) backupAndClearProfile();
  reportFlagState();
  survivalRules();
  suggestEnv();
}

main().catch(err => {
  console.error('[twitter-reset] failed:', err);
  process.exit(1);
});
