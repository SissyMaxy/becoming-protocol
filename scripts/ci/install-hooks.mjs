#!/usr/bin/env node
/**
 * Install the CI gate parity pre-push hook.
 *
 * Approach: configure git's `core.hooksPath` to point at `.githooks/`. That
 * way the template lives in the repo (versioned, reviewable), and updates to
 * the hook automatically propagate to anyone who has run this once. No husky
 * dependency, no symlinks, no install-time cp.
 *
 * Run once after cloning: npm run ci:install-hooks
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

if (!existsSync(PRE_PUSH)) {
  console.error(`install-hooks: missing ${PRE_PUSH} — repo state is broken`);
  process.exit(1);
}

// chmod is a no-op on Windows but matters on macOS / Linux.
try { chmodSync(PRE_PUSH, 0o755); } catch { /* */ }

try {
  execSync('git config core.hooksPath .githooks', { cwd: ROOT, stdio: 'inherit' });
} catch (err) {
  console.error(`install-hooks: git config failed — ${String(err).slice(0, 200)}`);
  process.exit(1);
}

console.log('install-hooks: pre-push gate enabled.');
console.log('  Every `git push` from this repo now runs `npm run ci` first.');
console.log('  Bypass for one push: CI_GATE_SKIP=1 git push   (not recommended)');
console.log('  Uninstall: git config --unset core.hooksPath');
