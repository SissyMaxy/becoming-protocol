#!/usr/bin/env node
/**
 * enum-constraint-guard — prevents the recurring "stale CHECK constraint
 * silently rejects a value a generator writes" bug class (audit #3; the
 * proof_type/evidence_kind='voice' stall, the urgency='medium' stall, etc).
 *
 * For each registered enum column it:
 *   1. Parses the LATEST CHECK constraint value set from supabase/migrations
 *      (the highest-numbered migration that (re)defines the constraint).
 *   2. Asserts the explicit `required` vocabulary is a subset of that set
 *      (the durable source of truth a dev updates when adding a rung).
 *   3. Scans code (SQL migrations, edge functions, src, api) for
 *      assignment-style literal writes to the column and fails if any written
 *      value is absent from the constraint.
 *
 * This is the generation-site gate for the bug class: a new ladder rung that
 * writes proof_type='moan' now fails CI until the constraint migration ships.
 *
 * Run: `node scripts/ci/enum-constraint-guard.mjs`
 * Exit 0 = all written/required values are accepted; 1 = a value would be
 * rejected at runtime.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const MIG = join(ROOT, 'supabase', 'migrations');

// Registry of enum columns whose CHECK constraint must contain every value any
// generator writes. Add a column here the moment a generator starts writing to it.
const COLUMNS = [
  {
    table: 'handler_decrees',
    column: 'proof_type',
    constraint: 'handler_decrees_proof_type_check',
    // The intended vocabulary (must be ⊆ the live constraint set).
    required: ['photo', 'video', 'audio', 'voice', 'text', 'journal_entry', 'voice_pitch_sample', 'device_state', 'none'],
  },
  {
    table: 'handler_outreach_queue',
    column: 'evidence_kind',
    constraint: 'handler_outreach_queue_evidence_kind_check',
    required: ['photo', 'video', 'audio', 'voice', 'any', 'none'],
  },
];

const migFiles = readdirSync(MIG)
  .filter((f) => /^\d+.*\.sql$/.test(f))
  .sort((a, b) => parseInt(a) - parseInt(b)); // ascending; later = newer

/** Latest `... CHECK ( ... IN ( 'a','b',... ) )` value set for a constraint name. */
function latestConstraintSet(constraintName) {
  let found = null;
  for (const f of migFiles) {
    const sql = readFileSync(join(MIG, f), 'utf8');
    // Find every ADD CONSTRAINT <name> ... up to the next ');'
    const re = new RegExp(`ADD\\s+CONSTRAINT\\s+${constraintName}\\b[\\s\\S]*?IN\\s*\\(([\\s\\S]*?)\\)`, 'gi');
    let m;
    while ((m = re.exec(sql)) !== null) {
      const vals = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
      if (vals.length) found = { file: f, set: new Set(vals) };
    }
  }
  return found;
}

/** Source files to scan for writes. */
function* sourceFiles() {
  const roots = ['src', 'api', 'supabase/functions', 'supabase/migrations'];
  const exts = /\.(ts|tsx|js|mjs|sql)$/;
  const walk = function* (dir) {
    let entries;
    try { entries = readdirSync(join(ROOT, dir), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.browser-profiles') continue;
        yield* walk(rel);
      } else if (exts.test(e.name)) {
        yield rel;
      }
    }
  };
  for (const r of roots) yield* walk(r);
}

let failed = false;

for (const col of COLUMNS) {
  const live = latestConstraintSet(col.constraint);
  if (!live) {
    console.error(`[enum-guard] FAIL ${col.table}.${col.column}: no CHECK constraint '${col.constraint}' found in any migration.`);
    failed = true;
    continue;
  }
  // 2. required ⊆ constraint
  const missingRequired = col.required.filter((v) => !live.set.has(v));
  if (missingRequired.length) {
    console.error(`[enum-guard] FAIL ${col.table}.${col.column}: required values not in constraint (${live.file}): ${missingRequired.join(', ')}`);
    failed = true;
  }
  // 3. written literals ⊆ constraint
  // Match `col = 'x'`, `col := 'x'` (PL/pgSQL), `col: 'x'`/`col: "x"` (TS object literal).
  const writeRe = new RegExp(`\\b${col.column}\\b\\s*(?::=|=|:)\\s*['"]([a-z_]+)['"]`, 'gi');
  const written = new Set();
  for (const f of sourceFiles()) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    let m;
    while ((m = writeRe.exec(text)) !== null) written.add(m[1]);
  }
  const rejected = [...written].filter((v) => !live.set.has(v));
  if (rejected.length) {
    console.error(`[enum-guard] FAIL ${col.table}.${col.column}: code writes value(s) the constraint rejects: ${rejected.join(', ')} (constraint from ${live.file}: ${[...live.set].join(', ')})`);
    failed = true;
  } else {
    console.log(`[enum-guard] OK   ${col.table}.${col.column} (${live.set.size} values, ${written.size} distinct writes scanned)`);
  }
}

process.exit(failed ? 1 : 0);
