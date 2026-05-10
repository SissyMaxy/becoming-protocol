#!/usr/bin/env node
/**
 * Capture a CI gate failure to ci_local_failures (Supabase) for clustering.
 *
 * The mommy-builder pipeline and the pre-push hook both invoke `npm run ci`.
 * When that command fails, this helper records WHICH checker fired and a
 * stable signature for the error so that recurring patterns become visible
 * to the deploy-fixer / auto-healer roadmap (failure patterns recurring 3+
 * times become candidates for new auto-fix patterns).
 *
 * Idempotent: silently skips if SUPABASE_URL / SERVICE_ROLE_KEY are not set,
 * so the pre-push hook never blocks a developer with no credentials.
 *
 * Usage:
 *   echo "<stderr text>" | node scripts/ci/record-failure.mjs \
 *     --actor pre_push_hook --checker typecheck
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
function arg(flag, dflt = '') {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}

// Read excerpt from stdin (preferred) or --excerpt arg (fallback).
function readStdin() {
  try {
    if (process.stdin.isTTY) return '';
    return readFileSync(0, 'utf8');
  } catch { return ''; }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) {
  process.exit(0);
}

const actor = arg('--actor', 'operator');
const checker = arg('--checker', 'unknown');
const excerpt = (readStdin() || arg('--excerpt', '')).slice(0, 4000);

let branch = arg('--branch', '');
if (!branch) {
  try { branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim(); } catch { branch = '(unknown)'; }
}

// Signature: hash of the most-stable lines of the excerpt (file paths +
// error codes), so the same failure on different timestamps clusters.
function signatureOf(text) {
  const stable = text
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, '')
        .replace(/\b\d{10,}\b/g, '')
        .replace(/\(\d+,\d+\)/g, '')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 12)
    .join('\n');
  return createHash('sha256').update(`${checker}::${stable}`).digest('hex').slice(0, 32);
}
const signature = signatureOf(excerpt);

const body = JSON.stringify({
  actor,
  checker,
  signature,
  excerpt,
  branch,
});

try {
  // POST to PostgREST without pulling in @supabase/supabase-js — keeps the hook
  // dependency-free.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ci_local_failures`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    process.stderr.write(`record-failure: ${res.status} ${text.slice(0, 200)}\n`);
    process.exit(0);
  }
} catch (err) {
  process.stderr.write(`record-failure: ${String(err).slice(0, 200)}\n`);
  process.exit(0);
}
