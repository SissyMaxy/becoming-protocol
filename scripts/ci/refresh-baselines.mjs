#!/usr/bin/env node
/**
 * Refresh every linter baseline. Run this after a refactor that intentionally
 * shifts violation counts, then commit the diff.
 *
 * Usage:
 *   npm run ci:refresh-baselines
 */
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const targets = [
  ['pattern-lint',   'node scripts/handler-regression/pattern-lint.mjs --update-baseline'],
  ['migration-lint', 'node scripts/handler-regression/migration-lint.mjs --update-baseline'],
  ['centrality',     'node scripts/handler-regression/centrality-audit.mjs --update-baseline'],
  ['typecheck-api',  'node scripts/ci/typecheck-api.mjs --update-baseline'],
];

for (const [name, cmd] of targets) {
  console.log(`ci:refresh-baselines  [${name}]  refreshing…`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    // Linters may exit non-zero even after writing baseline; we trust the
    // baseline file itself. Surface and continue.
    console.error(`  (warning: ${name} exited non-zero, but baseline file likely updated)`);
  }
}

console.log('\nci:refresh-baselines  DONE — review `git diff` and commit if intentional.');
