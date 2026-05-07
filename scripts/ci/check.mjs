#!/usr/bin/env node
/**
 * CI status checker. Run after a push to see what's happening — no need
 * to paste logs from GitHub.
 *
 * Usage:
 *   node scripts/ci/check.mjs            # latest run status + failures only
 *   node scripts/ci/check.mjs --watch    # block until current run completes
 *   node scripts/ci/check.mjs --full     # full failure log (verbose)
 *   node scripts/ci/check.mjs --commit X # status of a specific commit
 *
 * Requires: gh CLI authenticated (already is in this repo).
 */
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const full = args.includes('--full');
const commitFlag = args.indexOf('--commit');
const commit = commitFlag >= 0 ? args[commitFlag + 1] : null;

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function runs(limit = 10) {
  const out = sh(`gh run list --limit ${limit} --json databaseId,name,status,conclusion,headSha,createdAt,event`);
  return JSON.parse(out);
}

function findLatestPreflight(targetSha = null) {
  const all = runs(20);
  for (const r of all) {
    if (r.event !== 'push') continue;
    if (targetSha && !r.headSha.startsWith(targetSha)) continue;
    if (r.name !== 'preflight') continue;
    return r;
  }
  return null;
}

function summarize(run) {
  if (!run) {
    console.log('No preflight run found.');
    return;
  }
  const sha = run.headSha.slice(0, 7);
  const status = run.status === 'completed' ? run.conclusion : run.status;
  console.log(`${run.name}  ${sha}  ${status}  (${run.createdAt})`);
  if (status === 'success') {
    console.log('✅ all gates passed');
    return;
  }
  if (run.status !== 'completed') {
    console.log(`⏳ run ${run.databaseId} still ${run.status}`);
    return;
  }
  // Failed — pull failure log
  console.log('\n=== failure summary ===');
  try {
    const log = sh(`gh run view ${run.databaseId} --log-failed`);
    const lines = log.split('\n');
    if (full) {
      console.log(log);
      return;
    }
    // Pull just the meaningful failure lines
    const interesting = lines.filter(l =>
      /✗|FAIL|error|exit code 1/i.test(l) &&
      !/##\[debug\]|##\[group\]|##\[endgroup\]|setup-node|checkout|cache hit/i.test(l)
    );
    const dedup = [...new Set(interesting.map(l => l.replace(/^[^\t]*\t[^\t]*\t/, '').trim()))];
    for (const l of dedup.slice(0, 30)) console.log(l);
    if (dedup.length > 30) console.log(`... and ${dedup.length - 30} more`);
    console.log(`\nFor full log: gh run view ${run.databaseId} --log-failed`);
  } catch (e) {
    console.log('Could not pull failure log:', e.message);
  }
}

async function watchUntilDone(targetSha = null) {
  let last = null;
  for (let i = 0; i < 60; i++) { // up to ~10 min
    const run = findLatestPreflight(targetSha);
    if (run && run.status === 'completed') {
      summarize(run);
      return;
    }
    if (run && run.databaseId !== last) {
      console.log(`waiting on ${run.databaseId} (${run.status})...`);
      last = run.databaseId;
    }
    await new Promise(r => setTimeout(r, 10_000));
  }
  console.log('timed out waiting');
}

if (watch) {
  await watchUntilDone(commit);
} else {
  summarize(findLatestPreflight(commit));
}
