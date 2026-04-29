/**
 * Twitter Readiness Gate
 *
 * The bare ENABLE_TWITTER flag isn't trustworthy on a fresh account — flipping
 * it true on day 1 burns the account the same way @Soft_Maxy got burned. This
 * module checks real readiness criteria before engines fire, regardless of
 * what the env says.
 *
 * The scheduler asks `isTwitterReady()` before running ANY Twitter engine.
 * If readiness is blocked, engines stay dormant even if ENABLE_TWITTER=true.
 *
 * Run interactively: npm run twitter-status
 */

import 'dotenv/config';
import { supabase } from './config';
import { PLATFORMS } from './config';

const USER_ID = process.env.USER_ID || '';
const MIN_WARMUP_DAYS = 30;

export interface ReadinessReport {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  passes: string[];
  daysSinceConfigCreated: number | null;
}

export async function checkTwitterReadiness(): Promise<ReadinessReport> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const passes: string[] = [];

  // 1. Profile config exists + populated
  const { data: cfg } = await supabase
    .from('twitter_profile_config')
    .select('handle, display_name, bio, pinned_tweet_text, applied_at, created_at')
    .eq('user_id', USER_ID)
    .maybeSingle();

  if (!cfg) {
    blockers.push('twitter_profile_config row missing — run: npm run twitter-profile init');
    return {
      ready: false,
      blockers,
      warnings,
      passes,
      daysSinceConfigCreated: null,
    };
  }

  if (!cfg.handle) blockers.push('handle not set — run: npm run twitter-profile set-handle <handle>');
  else passes.push(`handle: @${cfg.handle}`);

  if (!cfg.bio) blockers.push('bio not set — run: npm run twitter-profile gen-bio + set-bio');
  else passes.push('bio set');

  if (!cfg.display_name) warnings.push('display_name not set');
  else passes.push(`display_name: ${cfg.display_name}`);

  if (!cfg.pinned_tweet_text) warnings.push('no pinned tweet drafted');
  else passes.push('pinned tweet drafted');

  // 2. Profile actually applied to the live X account
  if (!cfg.applied_at) {
    blockers.push('profile not applied to live X account — config exists in DB but Maxy hasn\'t executed the checklist yet (run: npm run twitter-profile checklist)');
  } else {
    passes.push(`profile applied at ${new Date(cfg.applied_at).toLocaleDateString()}`);
  }

  // 3. Warm-up window elapsed
  const created = cfg.created_at ? new Date(cfg.created_at) : null;
  const ageDays = created ? Math.floor((Date.now() - created.getTime()) / (24 * 3600_000)) : null;
  if (ageDays === null) {
    warnings.push('config created_at missing — cannot verify warm-up window');
  } else if (ageDays < MIN_WARMUP_DAYS) {
    blockers.push(`warm-up window not elapsed: ${ageDays}d / ${MIN_WARMUP_DAYS}d required`);
  } else {
    passes.push(`warm-up complete: ${ageDays}d since config created`);
  }

  // 4. Manual activity signal — has Maxy been using the account by hand?
  // Heuristic: voice-learn should have captured at least 5 own_twitter samples
  // from her manual posting/replying. If zero, she's been silent on the account.
  const { count: ownSamples } = await supabase
    .from('user_voice_corpus')
    .select('id', { count: 'exact', head: true })
    .in('user_id', (process.env.VOICE_USER_IDS || USER_ID).split(',').map(s => s.trim()))
    .in('source', ['own_twitter_tweet', 'own_twitter_reply']);
  if (typeof ownSamples === 'number') {
    if (ownSamples >= 10) passes.push(`manual posts/replies captured: ${ownSamples}`);
    else if (ownSamples >= 3) warnings.push(`only ${ownSamples} manual posts/replies captured — light warm-up activity`);
    else blockers.push(`no manual posting captured (${ownSamples}) — Maxy hasn't been using the account by hand`);
  }

  // 5. Survival rules acknowledgment — Handler refuses to start without confirmation
  // that the account was set up safely (new device/SIM/email, NOT same machine + wifi).
  // Stored in twitter_profile_config.notes — Handler updates it when Maxy confirms.
  const { data: notesRow } = await supabase
    .from('twitter_profile_config')
    .select('notes')
    .eq('user_id', USER_ID)
    .maybeSingle();
  const notes = notesRow?.notes || '';
  if (!notes.includes('survival_confirmed')) {
    blockers.push('survival-rules not confirmed — record setup details: npm run twitter-status confirm-setup "<details>"');
  } else {
    passes.push('survival-rules confirmed');
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    passes,
    daysSinceConfigCreated: ageDays,
  };
}

/**
 * Cached readiness — scheduler calls this on every Twitter-engine tick.
 * 5min TTL: don't hammer the DB on every tick check.
 */
let cachedReadiness: { result: boolean; at: number } = { result: false, at: 0 };
const READY_CACHE_MS = 5 * 60 * 1000;

export async function isTwitterReady(): Promise<boolean> {
  if (Date.now() - cachedReadiness.at < READY_CACHE_MS) return cachedReadiness.result;
  // If env-level twitter is off, no need to check further.
  if (!PLATFORMS.twitter.enabled) {
    cachedReadiness = { result: false, at: Date.now() };
    return false;
  }
  const r = await checkTwitterReadiness();
  cachedReadiness = { result: r.ready, at: Date.now() };
  return r.ready;
}

// ── CLI ────────────────────────────────────────────────────────────

async function cmdStatus() {
  const r = await checkTwitterReadiness();
  console.log('═══ Twitter Readiness Report ═══\n');
  console.log(`Overall: ${r.ready ? '✓ READY — engines will run when ENABLE_TWITTER=true' : '✗ BLOCKED — engines will refuse to fire'}\n`);

  if (r.passes.length > 0) {
    console.log('Pass:');
    for (const p of r.passes) console.log(`  ✓ ${p}`);
    console.log();
  }
  if (r.warnings.length > 0) {
    console.log('Warnings (non-blocking):');
    for (const w of r.warnings) console.log(`  ⚠ ${w}`);
    console.log();
  }
  if (r.blockers.length > 0) {
    console.log('Blockers (engines will NOT fire until these clear):');
    for (const b of r.blockers) console.log(`  ✗ ${b}`);
    console.log();
  }

  console.log(`Env state: ENABLE_TWITTER=${process.env.ENABLE_TWITTER}`);
  console.log(`Computed: PLATFORMS.twitter.enabled=${PLATFORMS.twitter.enabled}`);
  console.log(`Effective: ${r.ready && PLATFORMS.twitter.enabled ? 'engines WILL fire' : 'engines will NOT fire'}`);
}

async function cmdConfirmSetup(details: string) {
  if (!details || details.length < 10) {
    console.error('Provide setup details (≥10 chars). Example:');
    console.error('  npm run twitter-status confirm-setup "phone+cellular, fresh email, prepaid SIM, never on home wifi"');
    process.exit(1);
  }
  const stamp = new Date().toISOString();
  const note = `survival_confirmed at ${stamp}: ${details}`;
  const { error } = await supabase
    .from('twitter_profile_config')
    .update({ notes: note, updated_at: stamp })
    .eq('user_id', USER_ID);
  if (error) {
    console.error('Save failed:', error.message);
    process.exit(1);
  }
  console.log(`[twitter-status] Recorded: ${note}`);
  console.log('[twitter-status] Re-run `npm run twitter-status` to see the readiness change.');
}

async function cmdMarkApplied() {
  const stamp = new Date().toISOString();
  const { error } = await supabase
    .from('twitter_profile_config')
    .update({ applied_at: stamp, applied_by: 'maxy_manual', updated_at: stamp })
    .eq('user_id', USER_ID);
  if (error) { console.error('Failed:', error.message); process.exit(1); }
  console.log(`[twitter-status] Marked profile applied at ${stamp}`);
  console.log('[twitter-status] Did you actually apply the bio/pin/settings to your X account? If not, undo this.');
}

async function main() {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'confirm-setup': await cmdConfirmSetup(rest.join(' ')); break;
    case 'mark-applied': await cmdMarkApplied(); break;
    case undefined:
    case 'status':
      await cmdStatus(); break;
    default:
      console.log('Commands: status (default) | confirm-setup "<details>" | mark-applied');
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
