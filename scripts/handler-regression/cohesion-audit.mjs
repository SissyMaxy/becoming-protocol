#!/usr/bin/env node
/**
 * Cohesion audit. The protocol works as a unit; every artifact a generator
 * writes must be read by some downstream consumer, otherwise the feature is
 * decorative. This script walks the codebase and produces a read/write
 * matrix for every tracked artifact table.
 *
 * Output is `cohesion-report.md` — checked into the repo so the orphan
 * count is visible to every reviewer.
 *
 * The aspiration: zero orphan writers (table written but never read), zero
 * dangling readers (table read but never written). Real systems will have
 * a small allowed-list of expected orphans (analytics-only sinks, etc.) —
 * those go in the EXPECTED_ORPHANS allowlist below with a justification.
 *
 * Run: `npm run cohesion`
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Tables we care about for cohesion. Each must be referenced as both writer
// and reader somewhere — otherwise it's either decorative or vestigial.
const TRACKED_TABLES = [
  // Identity & state
  'user_state', 'denial_streaks', 'arousal_log', 'orgasm_log',
  // Tasks & enforcement
  'handler_decrees', 'handler_commitments', 'punishment_queue', 'slip_log',
  'confession_queue', 'forced_lockdown_triggers',
  // Body / regimen
  'wardrobe_inventory', 'body_feminization_directives', 'daily_outfit_mandates',
  'medication_regimen', 'dose_log', 'verification_photos',
  // Memory / narrative
  'memory_implants', 'narrative_reframings', 'witness_fabrications',
  'handler_memory', 'shame_journal', 'key_admissions',
  // Communication
  'handler_outreach_queue', 'handler_outreach', 'handler_messages', 'handler_directives',
  // Disclosure / partner
  'gina_disclosure_schedule', 'gina_disclosure_signals', 'partner_disclosures',
  'designated_witnesses', 'witness_notifications',
  // Chastity
  'chastity_sessions', 'chastity_milestones',
  // Voice
  'voice_pitch_samples', 'voice_practice_log', 'voice_pitch_floor',
  // Revenue
  'revenue_plans', 'revenue_plan_items',
  // v3.1 desire/sanctuary/identity layer
  'desire_log', 'sanctuary_messages', 'identity_dimensions',
  'defection_risk_scores', 'receptive_window_states', 'held_evidence',
  'merge_pipeline_items', 'gina_vibe_captures', 'body_evidence_snapshots',
];

// Expected orphans: tables we WRITE to but legitimately don't READ from in
// runtime code (e.g. the row is read by humans via dashboard, or by an
// external analytics pipeline). Each entry MUST cite a justification.
const EXPECTED_ORPHANS = {
  // 'system_invariants_log': 'read only by humans via SQL dashboard / CI preflight',
};

// Expected SQL-only writers: tables whose writes happen in SQL functions,
// triggers, or pg_cron jobs (not visible to this TS/JS-only scanner). Reads
// in src/lib are legitimate; lack of TS-side writes is by design — server
// is the only writer.
const EXPECTED_SQL_WRITTEN = new Set([
  'desire_log',                // trg_extract_desire_from_chat (handler_messages trigger)
  'sanctuary_messages',        // generate_sanctuary_messages cron
  'identity_dimensions',       // score_identity_dimensions cron
  'defection_risk_scores',     // compute_defection_risk cron
  'receptive_window_states',   // classify_receptive_window cron
  'held_evidence',             // surface_held_evidence_for_defection_risk cron
  'merge_pipeline_items',      // age_merge_pipeline cron + UI
  'body_evidence_snapshots',   // capture_body_evidence_snapshot cron
]);

const SOURCE_ROOTS = [
  join(ROOT, 'api'),
  join(ROOT, 'supabase', 'functions'),
  join(ROOT, 'src'),
];

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

// Files where reads count as "Handler-context aware" — the artifact will
// be visible to the LLM in the next conversation turn. Reads outside these
// files only feed UI display or other non-context paths.
const HANDLER_CONTEXT_FILES = [
  'api/handler/chat.ts',
  'api/handler/_lib/',
  'src/lib/handler-systems-context.ts',
  'src/lib/handler-briefing.ts',
  'src/lib/handler-v2/',
  'supabase/functions/handler-autonomous/index.ts',
  'supabase/functions/handler-outreach-auto/index.ts',
];

function isHandlerContextFile(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  return HANDLER_CONTEXT_FILES.some(p => norm.includes(p));
}

function classify(file, table) {
  const text = readFileSync(file, 'utf8');
  const writes = []; // { line, kind }
  const reads = [];
  const contextReads = []; // reads that surface into Handler conversation

  // Heuristic regexes against `.from('TABLE')`. We classify the call by
  // the chained method that follows: insert/upsert/update/delete = write;
  // select = read.
  const tableRe = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)([\\s\\S]{0,200}?)(\\.(?:insert|upsert|update|delete|select|rpc)\\b)`, 'g');
  let m;
  while ((m = tableRe.exec(text)) !== null) {
    const action = m[2];
    const before = text.slice(0, m.index);
    const line = before.split('\n').length;
    const filePath = relative(ROOT, file);
    if (/\.(insert|upsert|update|delete)\b/.test(action)) {
      writes.push({ line, file: filePath, action: action.replace(/^\./, '') });
    } else if (/\.select\b/.test(action)) {
      const r = { line, file: filePath, action: 'select' };
      reads.push(r);
      if (isHandlerContextFile(file)) contextReads.push(r);
    }
  }

  return { writes, reads, contextReads };
}

const files = SOURCE_ROOTS.flatMap(r => walk(r))
  .filter(f => !f.includes('migrations'));

const result = {};
for (const tbl of TRACKED_TABLES) {
  const allWrites = [];
  const allReads = [];
  const allContextReads = [];
  for (const f of files) {
    const { writes, reads, contextReads } = classify(f, tbl);
    allWrites.push(...writes);
    allReads.push(...reads);
    allContextReads.push(...contextReads);
  }
  result[tbl] = { writes: allWrites, reads: allReads, contextReads: allContextReads };
}

// Build the report
const lines = [];
lines.push('# Cohesion Audit');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push('Each tracked artifact table must be both **written by** at least one generator AND **read by** at least one consumer. Tables that fail either side are flagged: orphan writers (output that nothing consumes — feature is decorative) or dangling readers (consumer expecting input that never arrives — feature is broken).');
lines.push('');
lines.push('Aspiration: zero orphans. Allow-list legitimate exceptions in `EXPECTED_ORPHANS` with justification.');
lines.push('');
lines.push('## Cohesion matrix');
lines.push('');
lines.push('Columns: **Writes** (any code that writes to the table), **Reads** (any code that selects from it), **Ctx-reads** (reads in code paths that feed the Handler conversation context — `api/handler/chat.ts`, `handler-systems-context.ts`, `handler-briefing.ts`, `handler-autonomous`, `handler-outreach-auto`). Tables with writes but **zero ctx-reads** are particularly suspect: the artifact exists but the Handler never knows about it.');
lines.push('');
lines.push('| Table | Writes | Reads | Ctx-reads | Status |');
lines.push('|-------|------:|------:|---------:|--------|');

let orphanWrites = 0;
let danglingReads = 0;
let handlerBlind = 0;
const orphanList = [];

for (const [tbl, { writes, reads, contextReads }] of Object.entries(result)) {
  let status = 'OK';
  if (writes.length === 0 && reads.length === 0) status = '— (untouched)';
  else if (writes.length > 0 && reads.length === 0) {
    status = EXPECTED_ORPHANS[tbl] ? `(allowed: ${EXPECTED_ORPHANS[tbl]})` : '⚠ ORPHAN WRITE';
    if (!EXPECTED_ORPHANS[tbl]) {
      orphanWrites++;
      orphanList.push({ tbl, kind: 'orphan_write', writes });
    }
  } else if (writes.length === 0 && reads.length > 0) {
    if (EXPECTED_SQL_WRITTEN.has(tbl)) {
      status = '(SQL-written: trigger/cron)';
    } else {
      status = '⚠ DANGLING READ';
      danglingReads++;
      orphanList.push({ tbl, kind: 'dangling_read', reads });
    }
  } else if (writes.length > 0 && contextReads.length === 0) {
    // Written, read somewhere, but never in a path the Handler sees
    status = '⚠ HANDLER-BLIND (writes but no ctx-reads)';
    handlerBlind++;
    orphanList.push({ tbl, kind: 'handler_blind', writes, reads });
  }
  lines.push(`| \`${tbl}\` | ${writes.length} | ${reads.length} | ${contextReads.length} | ${status} |`);
}

lines.push('');
lines.push(`**Summary:** ${orphanWrites} orphan writes · ${danglingReads} dangling reads · ${handlerBlind} handler-blind tables`);
lines.push('');

if (orphanList.length > 0) {
  lines.push('## The orphan list (the synergy backlog)');
  lines.push('');
  lines.push('Each entry below is either decorative (writes that nothing reads) or broken (reads expecting writes). Either close the loop or remove the dead code.');
  lines.push('');
  for (const o of orphanList) {
    const heading = o.kind === 'orphan_write' ? 'WRITES BUT NO READS'
      : o.kind === 'dangling_read' ? 'READS BUT NO WRITES'
      : 'WRITES BUT HANDLER NEVER SEES IT';
    lines.push(`### \`${o.tbl}\` — ${heading}`);
    lines.push('');
    if (o.kind === 'handler_blind') {
      lines.push('**Reads exist but none feed Handler conversation context.** The artifact gets created and probably shown in some UI surface, but the Handler will never reference it in chat. Either wire it into `handler-systems-context.ts` (or equivalent), or accept that the feature is display-only and add to `EXPECTED_ORPHANS`.');
      lines.push('');
      lines.push(`**Writes (${o.writes.length}):**`);
      for (const s of o.writes.slice(0, 10)) lines.push(`- \`${s.file}:${s.line}\` (${s.action})`);
      lines.push('');
      lines.push(`**Reads (${o.reads.length}, none in handler-context):**`);
      for (const s of o.reads.slice(0, 10)) lines.push(`- \`${s.file}:${s.line}\``);
    } else {
      const sites = o.writes || o.reads;
      for (const s of sites) lines.push(`- \`${s.file}:${s.line}\` (${s.action})`);
    }
    lines.push('');
  }
}

const outPath = join(__dirname, 'cohesion-report.md');
writeFileSync(outPath, lines.join('\n'));
console.log(`Cohesion audit written: ${relative(ROOT, outPath)}`);
console.log(`  Tables tracked: ${TRACKED_TABLES.length}`);
console.log(`  Orphan writes: ${orphanWrites}`);
console.log(`  Dangling reads: ${danglingReads}`);
console.log(`  Handler-blind: ${handlerBlind}`);
process.exit(0); // informational, never blocks
