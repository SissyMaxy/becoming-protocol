#!/usr/bin/env node
/**
 * Install the CI gate parity pre-push hook.
 *
 * Approach: configure git's `core.hooksPath` to point at `.githooks/`. That
 * way the template lives in the repo (versioned, reviewable), and updates to
 * the hook automatically propagate to anyone who has run this once. No husky
 * dependency, no symlinks, no install-time cp.
 *
 * Wired into `npm install` via the `prepare` script in package.json, so a
 * fresh clone + `npm install` enables the gate without a second step. Skips
 * silently in environments where it can't do anything useful:
 *   - not a git checkout (npm clone tarball, vendored copy, CI agent)
 *   - CI=1 (GitHub Actions already runs the same checks via preflight.yml,
 *     and we don't want the hook firing on every CI npm install)
 *
 * To uninstall: git config --unset core.hooksPath
 */
import { execSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const HOOK_DIR = join(ROOT, '.githooks');
const PRE_PUSH = join(HOOK_DIR, 'pre-push');
const GIT_DIR = join(ROOT, '.git');

// Non-fatal exit helper — prepare scripts must never break `npm install`.
function softExit(reason) {
  if (process.env.CI_INSTALL_HOOKS_VERBOSE) console.log(`install-hooks: skip — ${reason}`);
  process.exit(0);
}

if (process.env.CI === 'true' || process.env.CI === '1') {
  softExit('CI=true (CI runs the same gates via preflight.yml)');
}

if (!existsSync(GIT_DIR)) {
  softExit('not a git checkout');
}

if (!existsSync(PRE_PUSH)) {
  softExit(`missing ${PRE_PUSH} (likely a sparse checkout or template install)`);
}

// chmod is a no-op on Windows but matters on macOS / Linux.
try { chmodSync(PRE_PUSH, 0o755); } catch { /* */ }

try {
  execSync('git config core.hooksPath .githooks', { cwd: ROOT, stdio: 'pipe' });
} catch (err) {
  // git not on PATH, worktree without git binary, etc. Don't break npm install.
  softExit(`git config failed (${String(err).slice(0, 120)})`);
}

console.log('install-hooks: pre-push gate enabled (core.hooksPath = .githooks).');
console.log('  Every `git push` from this repo now runs `npm run ci` first.');
console.log('  Bypass for one push: CI_GATE_SKIP=1 git push   (not recommended)');
console.log('  Uninstall: git config --unset core.hooksPath');
