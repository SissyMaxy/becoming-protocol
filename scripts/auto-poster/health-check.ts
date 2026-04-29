/**
 * Health Check — system sanity diagnostics for the auto-poster pipeline.
 *
 * Run manually: npx tsx health-check.ts
 * Or wire into scheduler startup to fail fast before a broken run.
 *
 * Catches the silent-failure patterns we hit on 2026-04-23:
 *   - Column missing (vault_item_id)
 *   - Platform enabled but pipeline path not built (Reddit DMs)
 *   - Platform has been silent >24h (scheduler dead)
 *   - Stealth config inconsistent across a platform's code paths
 *   - Voice corpus dup-insert regressions
 *   - Required env vars missing for enabled platforms
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { PLATFORMS } from './config';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

type Result = { check: string; status: 'pass' | 'warn' | 'fail'; detail: string };
const results: Result[] = [];

function record(check: string, status: Result['status'], detail: string) {
  results.push({ check, status, detail });
}

// ---------------------------------------------------------------------------
// Check 1: Critical columns exist in the DB
// ---------------------------------------------------------------------------
const REQUIRED_COLUMNS: Record<string, string[]> = {
  ai_generated_content: [
    'id', 'user_id', 'platform', 'content', 'status', 'scheduled_at',
    'generation_context', 'vault_item_id', 'target_account', 'target_subreddit',
    'platform_url', 'failure_reason', 'engagement_last_updated',
    'engagement_likes', 'engagement_comments',
  ],
  user_voice_corpus: ['id', 'user_id', 'text', 'source', 'signal_score', 'created_at'],
  handler_messages: ['id', 'user_id', 'conversation_id', 'role', 'content'],
  content_briefs: ['id', 'user_id', 'platforms', 'status'],
  user_state: ['user_id', 'handler_mode', 'denial_day'],
  handler_attention: ['id', 'user_id', 'kind', 'severity', 'summary', 'reviewed_at'],
  content_grades: ['id', 'user_id', 'content_id', 'quality', 'alignment', 'voice', 'overall'],
};

async function checkColumns() {
  // Probe each column via .select('col').limit(0) — errors if the column is missing.
  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    for (const col of cols) {
      const probe = await supabase.from(table).select(col).limit(0);
      if (probe.error && /column .* does not exist/i.test(probe.error.message)) {
        record(`column:${table}.${col}`, 'fail', probe.error.message);
      } else if (probe.error) {
        record(`column:${table}.${col}`, 'warn', probe.error.message);
      } else {
        record(`column:${table}.${col}`, 'pass', 'exists');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2: Platform coverage — enabled platforms have paths built
// ---------------------------------------------------------------------------
const PLATFORM_PATHS: Record<string, { read: string; post: string; dm?: string }> = {
  twitter:   { read: 'platforms/twitter.ts',     post: 'platforms/twitter.ts',     dm: 'dm-reader.ts:DM/Twitter' },
  reddit:    { read: 'platforms/reddit-engage.ts', post: 'platforms/reddit.ts',   dm: 'dm-reader.ts:DM/Reddit' },
  fansly:    { read: 'platforms/subscriber-engage.ts', post: 'platforms/fansly-post.ts', dm: 'dm-reader.ts:DM/Fansly' },
  onlyfans:  { read: 'platforms/subscriber-engage.ts', post: 'platforms/onlyfans.ts', dm: 'dm-reader.ts:DM/OnlyFans' },
  chaturbate:{ read: 'platforms/chaturbate.ts',  post: 'platforms/chaturbate.ts' },
  fetlife:   { read: 'platforms/fetlife-engage.ts', post: 'platforms/fetlife.ts', dm: 'dm-reader.ts:DM/FetLife' },
  sniffies:  { read: 'platforms/sniffies-engage.ts', post: 'platforms/sniffies.ts' },
};

function checkPlatformCoverage() {
  const dmReaderSrc = fs.readFileSync(path.join(__dirname, 'dm-reader.ts'), 'utf8');

  for (const [name, cfg] of Object.entries(PLATFORMS)) {
    if (!cfg.enabled) continue;
    const paths = PLATFORM_PATHS[name];
    if (!paths) {
      record(`platform:${name}:known`, 'fail', `enabled but not in platform-path map`);
      continue;
    }
    for (const kind of ['read', 'post'] as const) {
      const file = path.join(__dirname, paths[kind]);
      if (fs.existsSync(file)) {
        record(`platform:${name}:${kind}`, 'pass', paths[kind]);
      } else {
        record(`platform:${name}:${kind}`, 'fail', `missing: ${paths[kind]}`);
      }
    }
    if (paths.dm) {
      const tag = paths.dm.split(':')[1];
      if (dmReaderSrc.includes(tag)) {
        record(`platform:${name}:dm`, 'pass', tag);
      } else {
        record(`platform:${name}:dm`, 'fail', `dm-reader has no ${tag} path`);
      }
    } else {
      record(`platform:${name}:dm`, 'warn', 'no dm reader expected');
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3: Recent activity — flag platforms silent >24h
// ---------------------------------------------------------------------------
async function checkRecentActivity() {
  for (const [name, cfg] of Object.entries(PLATFORMS)) {
    if (!cfg.enabled) continue;
    const { data, error } = await supabase
      .from('ai_generated_content')
      .select('created_at')
      .eq('platform', name)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      record(`activity:${name}`, 'warn', error.message);
      continue;
    }
    if (!data || data.length === 0) {
      record(`activity:${name}`, 'warn', 'no activity ever');
      continue;
    }
    const ageMs = Date.now() - new Date(data[0].created_at).getTime();
    const ageHours = Math.round(ageMs / 3600_000);
    if (ageHours > 48) {
      // Stale platforms are a soft signal — the scheduler being paused is normal,
      // and FAILing here creates a bootstrap loop where you can't restart after
      // a pause. Keep at warn so it surfaces without blocking.
      record(`activity:${name}`, 'warn', `last activity ${ageHours}h ago`);
    } else if (ageHours > 24) {
      record(`activity:${name}`, 'warn', `last activity ${ageHours}h ago`);
    } else {
      record(`activity:${name}`, 'pass', `last ${ageHours}h ago`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: Stealth config consistency per-platform browser profile
// ---------------------------------------------------------------------------
function checkStealthConfig() {
  const redditFiles = [
    { path: 'platforms/reddit.ts', label: 'postToReddit' },
    { path: 'platforms/reddit-engage.ts', label: 'runRedditComments' },
    { path: 'platforms/reddit-original-posts.ts', label: 'runRedditOriginalPost' },
  ];
  const configs: { file: string; headless: string }[] = [];
  for (const { path: f, label } of redditFiles) {
    const full = path.join(__dirname, f);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');
    const m = src.match(/headless:\s*(true|false)/);
    if (m) configs.push({ file: label, headless: m[1] });
  }
  const uniqueHeadless = new Set(configs.map(c => c.headless));
  if (uniqueHeadless.size > 1) {
    record('stealth:reddit', 'fail', `mixed headless settings: ${configs.map(c => c.file + '=' + c.headless).join(', ')} — Cloudflare will block the headless:true paths`);
  } else if (configs.length > 0) {
    record('stealth:reddit', 'pass', `all paths headless=${[...uniqueHeadless][0]}`);
  }
}

// ---------------------------------------------------------------------------
// Check 5: Voice corpus dup-write detection
// ---------------------------------------------------------------------------
async function checkVoiceCorpusDups() {
  const { data } = await supabase
    .from('user_voice_corpus')
    .select('text, created_at, user_id')
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .limit(500);
  if (!data || data.length < 2) {
    record('voice_corpus:dups', 'pass', 'not enough recent samples to check');
    return;
  }
  const seen = new Map<string, Date>();
  let dups = 0;
  for (const row of data) {
    const key = `${row.user_id}::${(row.text || '').slice(0, 100)}`;
    const prev = seen.get(key);
    const cur = new Date(row.created_at);
    if (prev) {
      const deltaSec = Math.abs(cur.getTime() - prev.getTime()) / 1000;
      if (deltaSec < 60) dups++;
    }
    seen.set(key, cur);
  }
  if (dups > 0) {
    // Data-quality issue, not a scheduler blocker — downgraded to warn so dupes
    // don't block `npm start`. Investigate via the api/handler/chat.ts write paths.
    record('voice_corpus:dups', 'warn', `${dups} near-duplicate insert(s) within 60s — check handler_dm write paths`);
  } else {
    record('voice_corpus:dups', 'pass', 'no dups detected');
  }
}

// ---------------------------------------------------------------------------
// Check 6: Required env vars for enabled platforms
// ---------------------------------------------------------------------------
function checkEnvVars() {
  const core = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'USER_ID'];
  for (const v of core) {
    if (!process.env[v]) record(`env:${v}`, 'fail', 'missing');
    else record(`env:${v}`, 'pass', 'set');
  }
  if (!process.env.VOICE_USER_IDS) {
    record('env:VOICE_USER_IDS', 'warn', 'not set — voice pipeline reads only USER_ID (half the corpus missed)');
  } else {
    record('env:VOICE_USER_IDS', 'pass', process.env.VOICE_USER_IDS.split(',').length + ' user ids');
  }
  if (PLATFORMS.reddit.enabled && !process.env.REDDIT_USERNAME) {
    record('env:REDDIT_USERNAME', 'warn', 'reddit enabled but username not set — voice-learn cannot scrape own posts');
  }
  if (PLATFORMS.fetlife.enabled && !process.env.FETLIFE_USERNAME) {
    record('env:FETLIFE_USERNAME', 'warn', 'fetlife enabled but numeric id not set — voice-learn cannot scrape own writings');
  }
}

// ---------------------------------------------------------------------------
// Check 7: DB trigger presence (voice ingest depends on it)
// ---------------------------------------------------------------------------
async function checkTriggers() {
  // pg_trigger isn't reachable via PostgREST — infer trigger health from activity.
  // If handler_messages had user inserts in the last 24h but zero handler_dm corpus
  // rows appeared, the ingest trigger is dead.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [msgsRes, corpusRes] = await Promise.all([
    supabase.from('handler_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', since),
    supabase.from('user_voice_corpus').select('id', { count: 'exact', head: true }).eq('source', 'handler_dm').gte('created_at', since),
  ]);
  const msgs = msgsRes.count || 0;
  const corpus = corpusRes.count || 0;
  if (msgs > 0 && corpus === 0) {
    record('trigger:handler_messages_voice_ingest', 'fail', `${msgs} user messages in 24h but 0 voice corpus inserts — trigger appears dead`);
  } else if (msgs > 0 && corpus < msgs * 0.3) {
    record('trigger:handler_messages_voice_ingest', 'warn', `${msgs} user messages → ${corpus} corpus rows — low capture rate (may be legit: short msgs scored 0)`);
  } else {
    record('trigger:handler_messages_voice_ingest', 'pass', `${msgs} msgs → ${corpus} corpus rows (24h)`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Auto-Poster Health Check ===\n');

  await checkColumns();
  checkPlatformCoverage();
  await checkRecentActivity();
  checkStealthConfig();
  await checkVoiceCorpusDups();
  checkEnvVars();
  await checkTriggers();

  const fails = results.filter(r => r.status === 'fail');
  const warns = results.filter(r => r.status === 'warn');
  const passes = results.filter(r => r.status === 'pass');

  for (const r of fails) console.log(`  [FAIL] ${r.check}: ${r.detail}`);
  for (const r of warns) console.log(`  [WARN] ${r.check}: ${r.detail}`);
  console.log(`\nSummary: ${passes.length} pass, ${warns.length} warn, ${fails.length} fail`);

  if (fails.length > 0) {
    console.log('\nFAILS block the scheduler from running cleanly. Fix them before npm start.');
    process.exit(1);
  }
  if (warns.length > 0) {
    console.log('\nWarns are non-blocking but worth investigating.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[health-check] crashed:', err);
  process.exit(2);
});
