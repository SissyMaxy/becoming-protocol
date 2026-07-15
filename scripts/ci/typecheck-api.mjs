#!/usr/bin/env node
/**
 * Zero-error typecheck for the Vercel api/ surface.
 *
 * The browser build's tsconfig does not include api/**.ts, so this separate
 * gate is required. There is intentionally no baseline/update mode: any API
 * diagnostic fails CI immediately.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.api.json', '--pretty', 'false'], {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error.message);

if (result.status !== 0) {
  console.error('ci:typecheck-api  FAIL - API TypeScript must be error-free');
  process.exit(result.status || 1);
}

console.log('ci:typecheck-api  PASS - clean');
