#!/usr/bin/env node
/**
 * Typecheck the api/ surface against tsconfig.api.json.
 *
 * Why this exists: the project's `tsc -b` (tsconfig.json) only includes src/.
 * Vercel separately compiles api/**.ts as serverless functions, so TS errors
 * in api/ slip past local builds and only surface at deploy time. This is a
 * recurring "local clean / CI red" failure class.
 *
 * Mode: baseline-on-error. Pre-existing errors are tracked in
 * `typecheck-api-baseline.json`. New errors (file:line:code not in baseline)
 * fail the gate. Refresh after a refactor with --update-baseline.
 *
 * Usage:
 *   node scripts/ci/typecheck-api.mjs                 — verify, fail on new errors
 *   node scripts/ci/typecheck-api.mjs --update-baseline — accept current state
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'handler-regression', 'typecheck-api-baseline.json');

const updateBaseline = process.argv.includes('--update-baseline');

let raw = '';
try {
  raw = execSync('npx tsc --noEmit -p tsconfig.api.json', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  raw = (err.stdout || '') + (err.stderr || '');
}

const norm = (p) => p.replace(/\\/g, '/');

// tsc output line: `path/file.ts(LINE,COL): error TSXXXX: msg`
const errors = [];
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/);
  if (!m) continue;
  errors.push({
    file: norm(m[1]),
    line: Number(m[2]),
    col: Number(m[3]),
    code: m[4],
    message: m[5],
  });
}

// Key for diffing: file + code + message snippet (NOT line — line shifts on edits).
const trimMsg = (s) => s.replace(/\s+/g, ' ').trim().slice(0, 160);
const keyFor = (e) => `${e.file}::${e.code}::${trimMsg(e.message)}`;

const currentKeys = new Set(errors.map(keyFor));

if (updateBaseline) {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify([...currentKeys].sort(), null, 2) + '\n'
  );
  console.log(`ci:typecheck-api  baseline updated (${currentKeys.size} errors captured)`);
  process.exit(0);
}

let baseline = new Set();
if (existsSync(BASELINE_PATH)) {
  try {
    baseline = new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')));
  } catch {
    baseline = new Set();
  }
}

const newErrors = errors.filter((e) => !baseline.has(keyFor(e)));

if (newErrors.length === 0) {
  if (currentKeys.size > 0) {
    console.log(`ci:typecheck-api  PASS — no new TS errors (${currentKeys.size} pre-existing baselined)`);
  } else {
    console.log(`ci:typecheck-api  PASS — clean`);
  }
  process.exit(0);
}

console.log(`ci:typecheck-api  FAIL — ${newErrors.length} NEW TS error(s) in api/:`);
for (const e of newErrors) {
  console.log(`    ✗ ${e.file}:${e.line}:${e.col}  ${e.code}  ${trimMsg(e.message)}`);
}
console.log(`\n  After triaging, refresh baseline: npm run ci:typecheck-api -- --update-baseline`);
process.exit(1);
