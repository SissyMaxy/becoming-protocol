#!/usr/bin/env node
/**
 * Baseline drift detection.
 *
 * Each linter (pattern-lint, migration-lint, centrality, typecheck-api) keeps
 * a JSON baseline of pre-existing violations. The linter only fails on NEW
 * entries; STALE baseline entries (the violation has been fixed but the
 * baseline still lists it) are silently ignored, so the baseline ratchets
 * looser over time and stops constraining anything.
 *
 * This script runs each linter in --update-baseline mode against a snapshot
 * of the current baseline. If the regenerated baseline differs from the
 * committed one (in either direction — added or removed entries), drift is
 * reported and the gate fails. The original baseline is restored either way.
 *
 * To resolve drift: `npm run ci:refresh-baselines` and commit the diff.
 *
 * Usage:
 *   node scripts/ci/check-baselines.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const baselines = [
  {
    name: 'pattern-lint',
    file: join(ROOT, 'scripts/handler-regression/pattern-lint-baseline.json'),
    refresh: 'node scripts/handler-regression/pattern-lint.mjs --update-baseline',
  },
  {
    name: 'voice-gate',
    file: join(ROOT, 'scripts/ci/voice-gate-baseline.json'),
    refresh: 'node scripts/ci/voice-gate.mjs --update-baseline',
  },
  {
    name: 'migration-lint',
    file: join(ROOT, 'scripts/handler-regression/migration-lint-baseline.json'),
    refresh: 'node scripts/handler-regression/migration-lint.mjs --update-baseline',
  },
  {
    name: 'centrality',
    file: join(ROOT, 'scripts/handler-regression/centrality-baseline.json'),
    refresh: 'node scripts/handler-regression/centrality-audit.mjs --update-baseline',
  },
  {
    name: 'typecheck-api',
    file: join(ROOT, 'scripts/handler-regression/typecheck-api-baseline.json'),
    refresh: 'node scripts/ci/typecheck-api.mjs --update-baseline',
  },
];

let drift = false;

for (const b of baselines) {
  if (!existsSync(b.file)) {
    console.log(`ci:check-baselines  [${b.name}]  no baseline file (skipping)`);
    continue;
  }

  const original = readFileSync(b.file);

  try {
    execSync(b.refresh, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    // The lint may exit non-zero even with --update-baseline if the run itself
    // errors. Surface and continue — drift is computed from the file diff, not
    // from exit code.
    console.error(`ci:check-baselines  [${b.name}]  refresh command errored: ${String(err.stderr || err).slice(0, 200)}`);
  }

  const refreshed = existsSync(b.file) ? readFileSync(b.file) : Buffer.alloc(0);
  const same = original.length === refreshed.length && original.equals(refreshed);

  // Always restore the original baseline so this script never mutates the tree.
  writeFileSync(b.file, original);

  if (!same) {
    drift = true;
    // Show a concise diff summary.
    let originalCount = 0;
    let refreshedCount = 0;
    try { originalCount = (JSON.parse(original.toString()) || []).length; } catch { /* */ }
    try { refreshedCount = (JSON.parse(refreshed.toString()) || []).length; } catch { /* */ }
    console.log(
      `ci:check-baselines  [${b.name}]  DRIFT — committed: ${originalCount} entries, fresh: ${refreshedCount} entries`,
    );
  } else {
    console.log(`ci:check-baselines  [${b.name}]  OK`);
  }
}

if (drift) {
  console.error('\nci:check-baselines  FAIL — one or more baselines are stale.');
  console.error('  Run: npm run ci:refresh-baselines  (then review and commit the diff)');
  process.exit(1);
}

console.log('\nci:check-baselines  PASS — no drift');
process.exit(0);
