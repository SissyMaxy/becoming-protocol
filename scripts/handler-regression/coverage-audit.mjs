#!/usr/bin/env node
/**
 * Coverage audit. Walks api/ + supabase/functions/ for INSERT calls into
 * user-facing artifact tables, then cross-references against the regression
 * suite to find generators that lack a test. Output is a Markdown gap matrix
 * intended to be checked into the repo as a TODO list.
 *
 * Run: `npm run audit` (writes report to scripts/handler-regression/coverage-report.md)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Tables whose inserts are user-facing and so must have at least one
// regression test asserting "this generator behaves correctly."
const ARTIFACT_TABLES = [
  'handler_decrees',
  'confession_queue',
  'punishment_queue',
  'slip_log',
  'narrative_reframings',
  'witness_fabrications',
  'memory_implants',
  'handler_outreach_queue',
  'handler_commitments',
  'forced_lockdown_triggers',
  'daily_outfit_mandates',
  'body_feminization_directives',
  'engagement_obligations',
  'verification_photos',
  'arousal_log',
  'orgasm_log',
];

// Roots to walk
const SOURCE_ROOTS = [
  join(ROOT, 'api'),
  join(ROOT, 'supabase', 'functions'),
  join(ROOT, 'src', 'lib'),
];

// Walk a directory recursively, collecting .ts/.mjs/.js files
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e.startsWith('.') || e === 'node_modules') continue;
    const full = join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (/\.(ts|mjs|js|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

// For each file, find lines that insert into one of the artifact tables.
// We use the `.from('tableName').insert(` shape that supabase-js produces.
function findInserts(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const tbl of ARTIFACT_TABLES) {
      // .from('tableName').insert(  or  .from("tableName").insert(
      const re = new RegExp(`\\.from\\(\\s*['"\`]${tbl}['"\`]\\s*\\)\\.insert\\(`);
      if (re.test(line)) {
        // Capture surrounding function name if visible — walk up looking for
        // `async function X` / `function X` / `const X = ` within ~30 lines
        let fnName = '?';
        for (let k = i - 1; k > Math.max(0, i - 60); k--) {
          const m = lines[k].match(/(?:async\s+function|function)\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(/);
          if (m) { fnName = m[1] || m[2]; break; }
        }
        hits.push({ table: tbl, file, line: i + 1, fnName, snippet: line.trim().slice(0, 110) });
      }
    }
  }
  return hits;
}

// Parse the regression script for `await test('NAME', ...)` to enumerate
// what's currently covered. We don't need to know the body — just the names.
function loadTestNames() {
  const path = join(__dirname, 'db.mjs');
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { return []; }
  const names = [];
  const re = /await\s+test\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(text)) !== null) names.push(m[1]);
  return names;
}

// Main
const files = SOURCE_ROOTS.flatMap(r => walk(r));
const allHits = files.flatMap(findInserts);
const testNames = loadTestNames();

// Group by table
const byTable = new Map();
for (const h of allHits) {
  const arr = byTable.get(h.table) || [];
  arr.push(h);
  byTable.set(h.table, arr);
}

// Heuristic: a table is "covered" if any test name mentions the table or
// any of its insert functions. Loose match — if a test mentions the table
// or function name, count it as covered.
function isCovered(table, fnName) {
  const lc = (s) => s.toLowerCase();
  return testNames.some(t => lc(t).includes(lc(table)) || (fnName !== '?' && lc(t).includes(lc(fnName))));
}

// Build the report
const lines = [];
lines.push('# Generator Coverage Audit');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Source roots scanned: ${SOURCE_ROOTS.map(r => relative(ROOT, r)).join(', ')}`);
lines.push(`Tables tracked: ${ARTIFACT_TABLES.join(', ')}`);
lines.push(`Regression tests found: ${testNames.length}`);
lines.push('');
lines.push('## Coverage by table');
lines.push('');
lines.push('| Table | Insert sites | Covered sites | Gap |');
lines.push('|-------|-------------:|-------------:|----:|');

const byTableSorted = [...byTable.entries()].sort(([a], [b]) => a.localeCompare(b));
let totalSites = 0;
let totalCovered = 0;
for (const [tbl, hits] of byTableSorted) {
  const covered = hits.filter(h => isCovered(tbl, h.fnName)).length;
  totalSites += hits.length;
  totalCovered += covered;
  lines.push(`| \`${tbl}\` | ${hits.length} | ${covered} | ${hits.length - covered} |`);
}
lines.push(`| **TOTAL** | **${totalSites}** | **${totalCovered}** | **${totalSites - totalCovered}** |`);
lines.push('');

lines.push('## Uncovered insert sites (the backlog)');
lines.push('');
lines.push('Each row below is a generator that writes to a user-facing artifact table without a corresponding regression test. Add a test before the next bug-fix on these.');
lines.push('');
lines.push('| Table | Function | File:Line | Snippet |');
lines.push('|-------|----------|-----------|---------|');
for (const [tbl, hits] of byTableSorted) {
  for (const h of hits) {
    if (isCovered(tbl, h.fnName)) continue;
    lines.push(`| \`${tbl}\` | \`${h.fnName}\` | \`${relative(ROOT, h.file)}:${h.line}\` | ${h.snippet.replace(/\|/g, '\\|')} |`);
  }
}
lines.push('');

const outPath = join(__dirname, 'coverage-report.md');
writeFileSync(outPath, lines.join('\n'));
console.log(`Coverage audit written: ${relative(ROOT, outPath)}`);
console.log(`  Total insert sites: ${totalSites}`);
console.log(`  Covered (loose match): ${totalCovered}`);
console.log(`  Gap: ${totalSites - totalCovered}`);
