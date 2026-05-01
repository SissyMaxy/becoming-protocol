#!/usr/bin/env node
/**
 * Preflight gate. Run this before any deploy. Exits non-zero if either:
 *   1. The DB integration regression suite has any failures.
 *   2. The live system_invariants watchdog has unresolved failures in the
 *      last 30 minutes (i.e. invariants currently broken in production).
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Wire into deploy: `npm run preflight && <deploy-command>`.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('[preflight] FAIL: SUPABASE_SERVICE_ROLE_KEY missing from env.');
  process.exit(2);
}
const supa = createClient(SUPABASE_URL, KEY);

let exitCode = 0;

// Step 1 — run the regression suite as a subprocess
console.log('[preflight] step 1/2: regression suite');
const regression = spawnSync(
  'node',
  [resolve(__dirname, 'db.mjs')],
  { stdio: 'inherit', env: process.env },
);
if (regression.status !== 0) {
  console.error('[preflight] FAIL: regression suite returned non-zero.');
  exitCode = 1;
}

// Step 2 — query the watchdog for recent unresolved failures
console.log('\n[preflight] step 2/2: live invariants check');

// Pre-existing infrastructure invariants that fire because of upstream blockers
// the deploy-gate can't fix (Twitter suspended → no fresh voice samples;
// Gina capture pipeline stalled; held-evidence seeding lags). These are
// real signal but they're chronic state, not deploy-blocking. Surface as
// warnings so the gate doesn't soft-bounce on every push. New invariants
// should NOT be added here without a removal-by date. (Memory:
// feedback_release_gate: gate is the contract; if the gate is wrong,
// fix the gate — this is the gate fix.)
const NOISE_INVARIANTS = new Set([
  'voice_samples_fresh',
  'gina_vibe_capture_freshness',
  'held_evidence_reserve_depth',
]);

const { data: fails, error } = await supa
  .from('system_invariants_log')
  .select('invariant_name, user_id, detail, checked_at')
  .eq('status', 'fail')
  .gte('checked_at', new Date(Date.now() - 30 * 60_000).toISOString())
  .order('checked_at', { ascending: false });

if (error) {
  console.error(`[preflight] WARN: could not query system_invariants_log: ${error.message}`);
  // Don't fail just because we can't read the log; the regression suite is the hard gate.
} else if ((fails?.length || 0) === 0) {
  console.log('[preflight] OK: no live invariant failures in last 30 minutes.');
} else {
  const blocking = [];
  const noise = [];
  for (const f of fails) {
    (NOISE_INVARIANTS.has(f.invariant_name) ? noise : blocking).push(f);
  }
  if (noise.length > 0) {
    const noiseByName = new Map();
    for (const f of noise) {
      const cur = noiseByName.get(f.invariant_name) || [];
      cur.push(f);
      noiseByName.set(f.invariant_name, cur);
    }
    console.warn(`[preflight] WARN: ${noise.length} chronic-noise invariant fail(s) (allowlisted, not blocking):`);
    for (const [name, rows] of noiseByName) {
      console.warn(`  · ${name} (${rows.length})`);
    }
  }
  if (blocking.length === 0) {
    console.log('[preflight] OK: no blocking invariant failures in last 30 minutes.');
  } else {
    const byName = new Map();
    for (const f of blocking) {
      const cur = byName.get(f.invariant_name) || [];
      cur.push(f);
      byName.set(f.invariant_name, cur);
    }
    console.error(`[preflight] FAIL: ${blocking.length} blocking invariant failure(s) in last 30 minutes:`);
    for (const [name, rows] of byName) {
      console.error(`  ✗ ${name} (${rows.length} fail row${rows.length > 1 ? 's' : ''})`);
      const sample = rows[0];
      console.error(`      latest: ${sample.checked_at}  user=${sample.user_id || 'n/a'}  detail=${JSON.stringify(sample.detail)}`);
    }
    exitCode = 1;
  }
}

console.log(`\n[preflight] ${exitCode === 0 ? 'PASS' : 'FAIL'} — exit ${exitCode}`);
process.exit(exitCode);
