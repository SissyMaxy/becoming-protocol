#!/usr/bin/env node
/**
 * Vercel deploy-shape trip-wire.
 *
 * The earlier `typecheck` + `typecheck-api` steps already cover the TS-error
 * class that used to break Vercel builds. This script catches the OTHER
 * Vercel-specific failure modes that wouldn't surface locally:
 *
 *   1. Function-count growth. Each `.ts` file in `api/` is one serverless
 *      function (excluding files / folders prefixed with `_`). Pro plan
 *      removes the old 12-fn Hobby cap, so this is no longer a deploy-
 *      blocking class — but unconstrained growth is still an architectural
 *      smell. The warn threshold flags consolidate-candidate routes; the
 *      hard cap catches genuine runaway growth.
 *
 *   2. `tsconfig.api.json` coverage drift. If a new `api/` file is added
 *      but `tsconfig.api.json` doesn't include it, the api typecheck still
 *      passes locally — but Vercel compiles every file under `api/` and
 *      will fail on errors the typecheck never saw.
 *
 * Plan: Pro (2026-05-11). 12-fn cap removed; this gate is purely about
 * architectural pressure now.
 *
 * Usage:
 *   node scripts/ci/vercel-dryrun.mjs
 */
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const API_DIR = join(ROOT, 'api');

// Warn threshold: signals architectural pressure — at ~30 routes, an
// [action]-style dispatcher usually beats N more single-purpose files.
// Hard limit: runaway-growth signal; merging past here without a refactor
// turns the api/ surface into a maintenance liability.
const WARN_AT = 30;
const HARD_LIMIT = 60;

/**
 * Walk `api/` and return every `.ts` file that Vercel would deploy as a
 * serverless function. Skips files and directories that start with `_`,
 * which is Vercel's convention for shared helpers.
 */
function walkDeployable(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e.startsWith('_') || e.startsWith('.')) continue;
    const full = join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) {
      walkDeployable(full, out);
    } else if (e.endsWith('.ts') && !e.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

if (!existsSync(API_DIR)) {
  console.log('ci:vercel-dryrun  no api/ directory — skipping');
  process.exit(0);
}

const functions = walkDeployable(API_DIR);
const count = functions.length;

console.log(`ci:vercel-dryrun  ${count} serverless function(s) detected under api/`);

if (count >= WARN_AT) {
  console.warn(`ci:vercel-dryrun  WARN — ${count} functions exceeds architectural-pressure threshold (${WARN_AT}).`);
  console.warn(`  At this size, an [action]-style dispatcher usually beats N more single-purpose routes.`);
  console.warn(`  Options:`);
  console.warn(`    - consolidate via [action]-style dispatchers`);
  console.warn(`    - move shared logic under an underscore-prefixed folder (api/foo/_lib/...)`);
}

if (count > HARD_LIMIT) {
  console.error(`ci:vercel-dryrun  FAIL — ${count} functions exceeds runaway-growth hard cap (${HARD_LIMIT}).`);
  console.error(`  Refactor before adding more.`);
  process.exit(1);
}

// Best-effort tsconfig.api.json coverage drift check. Some `api/` files
// may be deliberately excluded — `tsconfig.api.json` is the source of
// truth. If a function file isn't covered, warn.
const tsconfigPath = join(ROOT, 'tsconfig.api.json');
if (existsSync(tsconfigPath)) {
  let cfg;
  const raw = readFileSync(tsconfigPath, 'utf8');
  try {
    // Most of our tsconfigs are plain JSON (no comments / no trailing commas).
    // Try strict parse first so we don't accidentally eat `//` inside string
    // values like `./node_modules/.tmp/...`.
    cfg = JSON.parse(raw);
  } catch {
    // Fall back to a comment + trailing-comma strip for tsconfigs that use
    // them. The string-aware tokenizer would be overkill for this gate.
    try {
      const stripped = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1') // not preceded by `:` (avoids `http://`-style)
        .replace(/,(\s*[}\]])/g, '$1');
      cfg = JSON.parse(stripped);
    } catch {
      console.log(`ci:vercel-dryrun  (could not parse ${relative(ROOT, tsconfigPath)} — skipping coverage check)`);
      cfg = null;
    }
  }

  if (cfg) {
    const includes = Array.isArray(cfg.include) ? cfg.include : [];
    const hasApiInclude = includes.some((p) => /^api\b/.test(p) || p.includes('api/**'));
    if (!hasApiInclude) {
      console.warn(`ci:vercel-dryrun  WARN — tsconfig.api.json has no include matching api/**; typecheck-api may miss new files`);
    }
  }
}

console.log(`ci:vercel-dryrun  PASS — function count within ${HARD_LIMIT}-function runaway-growth cap`);
process.exit(0);
