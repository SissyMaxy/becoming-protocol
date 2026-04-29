#!/usr/bin/env node
/**
 * Migration linter. Scans supabase/migrations/*.sql for non-idempotent
 * patterns. Migrations should be safe to re-run on a partially-applied
 * schema — Supabase does occasionally re-attempt, and CI can re-run.
 *
 * Catches:
 *   - CREATE TABLE without IF NOT EXISTS
 *   - CREATE INDEX without IF NOT EXISTS
 *   - CREATE TRIGGER without prior DROP TRIGGER IF EXISTS
 *   - ALTER TABLE ADD COLUMN without IF NOT EXISTS
 *   - INSERT INTO ... without ON CONFLICT clause when it has explicit values
 *     (skipped for INSERT INTO ... SELECT FROM patterns)
 *   - DROP TABLE without IF EXISTS
 *
 * Skipped legitimately: CREATE OR REPLACE FUNCTION (always idempotent),
 * SELECT-only statements, schema migrations Supabase manages itself.
 *
 * Run: `npm run lint:migrations`
 *
 * Baseline mode same as pattern-lint: pre-existing violations don't fail;
 * new ones do. Refresh with `npm run lint:migrations -- --update-baseline`.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

const RULES = [
  {
    name: 'create-table-needs-if-not-exists',
    regex: /\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i,
    why: 'CREATE TABLE without IF NOT EXISTS fails on re-run.',
  },
  {
    name: 'create-index-needs-if-not-exists',
    regex: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY\s+IF\s+NOT\s+EXISTS)/i,
    why: 'CREATE INDEX without IF NOT EXISTS fails on re-run.',
  },
  {
    name: 'alter-table-add-column-needs-if-not-exists',
    regex: /\bALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)/i,
    why: 'ALTER TABLE ADD COLUMN without IF NOT EXISTS fails on re-run.',
  },
  {
    name: 'drop-table-needs-if-exists',
    regex: /\bDROP\s+TABLE\s+(?!IF\s+EXISTS)/i,
    why: 'DROP TABLE without IF EXISTS fails when the table is already absent.',
  },
  {
    name: 'create-trigger-needs-prior-drop',
    // Match CREATE TRIGGER not preceded (within 200 chars) by DROP TRIGGER IF EXISTS
    multiline: true,
    pred: (text) => {
      const hits = [];
      const re = /\bCREATE\s+TRIGGER\s+(\w+)/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        const triggerName = m[1];
        const before = text.slice(Math.max(0, m.index - 500), m.index);
        if (!new RegExp(`DROP\\s+TRIGGER\\s+IF\\s+EXISTS\\s+${triggerName}\\b`, 'i').test(before)) {
          const lineNum = text.slice(0, m.index).split('\n').length;
          hits.push({ line: lineNum, snippet: m[0] });
        }
      }
      return hits;
    },
    why: 'CREATE TRIGGER without prior DROP TRIGGER IF EXISTS fails on re-run.',
  },
  {
    name: 'insert-without-on-conflict',
    multiline: true,
    pred: (text) => {
      const hits = [];
      // INSERT INTO ... VALUES (...) without ON CONFLICT or RETURNING-only patterns
      const re = /\bINSERT\s+INTO\s+(\w+)[\s\S]*?(?:VALUES\s*\([^;]+\)|SELECT[\s\S]*?(?:FROM|;))[\s\S]*?(;|\bON\s+CONFLICT\b)/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        const trailing = m[2];
        if (trailing.trim() === ';') {
          // No ON CONFLICT — flag (unless table is one we expect every run, like a log)
          const tableName = m[1];
          // Skip system_invariants_log (always-append) and one-shot diagnostic inserts
          if (['system_invariants_log', 'handler_directives', 'slip_log'].includes(tableName)) continue;
          const before = text.slice(0, m.index);
          const lineNum = before.split('\n').length;
          hits.push({ line: lineNum, snippet: `INSERT INTO ${tableName} ... ; (no ON CONFLICT)` });
        }
      }
      return hits;
    },
    why: 'INSERT without ON CONFLICT clause fails on re-run if rows already exist.',
  },
];

function lintFile(file) {
  const text = readFileSync(file, 'utf8');
  // Strip line and block comments to reduce false positives
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
  const lines = stripped.split('\n');
  const fileHits = [];
  for (const rule of RULES) {
    if (rule.multiline && rule.pred) {
      const hits = rule.pred(stripped);
      for (const h of hits) fileHits.push({ rule: rule.name, ...h });
    } else if (rule.regex) {
      for (let i = 0; i < lines.length; i++) {
        if (rule.regex.test(lines[i])) {
          fileHits.push({ rule: rule.name, line: i + 1, snippet: lines[i].trim().slice(0, 120) });
        }
      }
    }
  }
  return fileHits;
}

let entries = [];
try {
  entries = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
} catch {
  console.log('[migration-lint] No migrations directory found.');
  process.exit(0);
}

const allHits = [];
for (const entry of entries) {
  const file = join(MIGRATIONS_DIR, entry);
  const fileHits = lintFile(file);
  for (const h of fileHits) {
    allHits.push({ file: relative(ROOT, file), ...h });
  }
}

// Baseline mode
const baselinePath = join(__dirname, 'migration-lint-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');

const currentKeys = new Set(allHits.map(h => `${h.file}:${h.line}:${h.rule}`));

if (updateBaseline) {
  writeFileSync(baselinePath, JSON.stringify([...currentKeys].sort(), null, 2) + '\n');
  console.log(`[migration-lint] Baseline updated: ${currentKeys.size} hits captured.`);
  process.exit(0);
}

let baseline = new Set();
if (existsSync(baselinePath)) {
  try { baseline = new Set(JSON.parse(readFileSync(baselinePath, 'utf8'))); } catch { baseline = new Set(); }
}

const newHits = allHits.filter(h => !baseline.has(`${h.file}:${h.line}:${h.rule}`));

if (allHits.length === 0) {
  console.log('[migration-lint] CLEAN — all migrations are idempotent.');
  process.exit(0);
}

if (newHits.length === 0) {
  console.log(`[migration-lint] PASS — no new non-idempotent patterns (${allHits.length} pre-existing baselined).`);
  process.exit(0);
}

console.log(`[migration-lint] FAIL — ${newHits.length} NEW non-idempotent patterns introduced (${allHits.length - newHits.length} pre-existing baselined).\n`);
const byRule = new Map();
for (const h of newHits) {
  const arr = byRule.get(h.rule) || [];
  arr.push(h);
  byRule.set(h.rule, arr);
}
for (const [rule, hits] of byRule) {
  const r = RULES.find(rr => rr.name === rule);
  console.log(`✗ ${rule}  (${hits.length} new)`);
  console.log(`    why: ${r?.why}`);
  for (const h of hits.slice(0, 10)) console.log(`    ${h.file}:${h.line}  ${h.snippet}`);
}
console.log('\nRefresh baseline (after fixing): npm run lint:migrations -- --update-baseline');
process.exit(1);
