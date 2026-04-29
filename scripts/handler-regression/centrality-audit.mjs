#!/usr/bin/env node
/**
 * Handler-centrality audit. Identifies generators that write user-facing
 * artifacts WITHOUT first reading Handler state. These are by-definition
 * Handler-blind decisions: the artifact is created without reference to
 * current persona, phase, mode, slip count, or recent directives, so it
 * cannot speak with Handler authority.
 *
 * Memory: feedback_handler_is_singular_authority.md
 *
 * Heuristic: for each function that inserts into a USER_FACING_TABLE,
 * check whether the function body reads at least one HANDLER_STATE_TABLE
 * before the insert. If not, flag as a centrality violation.
 *
 * Run: `npm run centrality`
 * Output: `scripts/handler-regression/centrality-report.md`
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Tables whose writes are visible to the user as Handler decisions/voice.
// Every insert here must be preceded (in the same function) by at least
// one read from a HANDLER_STATE table — otherwise the artifact is born
// without Handler authority.
const USER_FACING_TABLES = [
  'handler_decrees',
  'handler_commitments',
  'handler_outreach_queue',
  'handler_outreach',
  'confession_queue',
  'punishment_queue',
  'narrative_reframings',
  'witness_fabrications',
  'memory_implants',
  'daily_outfit_mandates',
  'body_feminization_directives',
  'forced_lockdown_triggers',
  'lovense_commands', // bolted-on feature — see memory rule
  'ai_generated_content', // auto-poster outputs
  'scheduled_notifications',
  'paid_conversations', // GFE/DM responses to subscribers — must reflect Handler voice
  'revenue_decisions',  // strategic decisions logged from LLM — must reflect Handler authority
];

// Tables whose READ proves the function is consulting the Handler before
// deciding. If a function reads NONE of these before writing a user-facing
// artifact, it's making a decision in the dark.
const HANDLER_STATE_TABLES = [
  'user_state',
  'handler_persona',
  'handler_directives',
  'handler_memory',
  'handler_daily_plans',
  'handler_briefing',
  'compliance_state',
  'denial_streaks',
  'chastity_sessions',
];

// Files allowed to write user-facing artifacts without reading Handler
// state — typically because the function IS the Handler (the chat handler,
// the autonomous orchestrator) and its caller has already loaded state.
const ALLOWED_FILES = [
  'api/handler/chat.ts',
  'supabase/functions/handler-autonomous/index.ts',
  'supabase/functions/handler-outreach-auto/index.ts',
];

const SOURCE_ROOTS = [
  join(ROOT, 'api'),
  join(ROOT, 'supabase', 'functions'),
  join(ROOT, 'src', 'lib'),
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

function isAllowed(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  return ALLOWED_FILES.some(p => norm.includes(p));
}

// For a given file, find each function definition. For each function,
// list (a) the user-facing tables it inserts into, (b) the handler-state
// tables it reads from. A violation is "writes ≥1 user-facing without
// reading ≥1 handler-state."
function analyzeFile(file) {
  const text = readFileSync(file, 'utf8');
  // Split into rough function blocks. Quick heuristic: each `async function`,
  // `function`, `const X = async (...) =>`, etc., starts a block, and the
  // block ends at the next top-level brace at column 0. This is imperfect
  // but works for the codebase's style.
  const lines = text.split('\n');
  const blocks = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fnMatch = line.match(/(?:async\s+function|function)\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(/);
    if (fnMatch && (line.startsWith('async function') || line.startsWith('function ') || /^const\s+\w+\s*=/.test(line))) {
      if (current) blocks.push(current);
      current = { name: fnMatch[1] || fnMatch[2], start: i + 1, lines: [line] };
    } else if (current) {
      current.lines.push(line);
      // End block on a line that's just `}` (top-level closer)
      if (line === '}') { blocks.push(current); current = null; }
    }
  }
  if (current) blocks.push(current);

  const violations = [];
  for (const b of blocks) {
    const body = b.lines.join('\n');
    const writesUserFacing = USER_FACING_TABLES
      .filter(t => new RegExp(`\\.from\\(\\s*['"\`]${t}['"\`]\\s*\\)\\s*\\.(?:insert|upsert)`).test(body));
    if (writesUserFacing.length === 0) continue;
    const readsHandlerState = HANDLER_STATE_TABLES
      .filter(t => new RegExp(`\\.from\\(\\s*['"\`]${t}['"\`]\\s*\\)\\s*\\.select`).test(body));
    // Also count *indirect* reads: a function that calls a state-loader
    // helper (loadHandlerState, loadRevenueHandlerState, build*Context, etc.)
    // is correctly reading state through the abstraction. Pattern: any
    // call to a function whose name matches the state-loader heuristic.
    const indirectReads = /\b(?:load|build|read|fetch|get)(?:[A-Z]\w*)?(?:Handler|UserState|RevenueHandler|HandlerState|SystemsContext|FullContext)\w*\(/i.test(body)
      || /\bloadRevenueHandlerState\(/.test(body)
      || /\bbuildHandlerSystemsContext\(/.test(body);
    if (readsHandlerState.length === 0 && !indirectReads) {
      violations.push({
        function: b.name,
        line: b.start,
        writes: writesUserFacing,
        reads: readsHandlerState,
      });
    }
  }
  return violations;
}

const files = SOURCE_ROOTS.flatMap(r => walk(r))
  .filter(f => !f.includes('migrations'));

const violations = [];
for (const f of files) {
  if (isAllowed(f)) continue;
  const fileViolations = analyzeFile(f);
  for (const v of fileViolations) {
    violations.push({ file: relative(ROOT, f), ...v });
  }
}

// Build report
const lines = [];
lines.push('# Handler-Centrality Audit');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push('Each function below writes a user-facing artifact (decree, commitment, outreach, confession prompt, etc.) **without first reading any Handler-state table**. The artifact is therefore generated without reference to the current persona, phase, mode, slip count, or recent directives — it cannot speak with Handler authority.');
lines.push('');
lines.push('Memory rule: `feedback_handler_is_singular_authority.md`. Refactor each entry to read at least one of: `user_state`, `handler_persona`, `handler_directives`, `handler_memory`, `handler_daily_plans`, `handler_briefing`, `compliance_state`, `denial_streaks`, `chastity_sessions` — before producing the artifact.');
lines.push('');
lines.push(`**Allowed-list (skipped):** functions in ${ALLOWED_FILES.map(f => `\`${f}\``).join(', ')} are exempt because they ARE the Handler — their callers have already loaded state.`);
lines.push('');

if (violations.length === 0) {
  lines.push('## Status: CLEAN');
  lines.push('');
  lines.push('No Handler-centrality violations detected outside the allow-list.');
} else {
  lines.push(`## ${violations.length} centrality violations`);
  lines.push('');
  lines.push('| File:Line | Function | Writes (user-facing) |');
  lines.push('|-----------|----------|---------------------|');
  for (const v of violations) {
    lines.push(`| \`${v.file}:${v.line}\` | \`${v.function}\` | ${v.writes.map(w => `\`${w}\``).join(', ')} |`);
  }
}

const outPath = join(__dirname, 'centrality-report.md');
writeFileSync(outPath, lines.join('\n'));
console.log(`Centrality audit written: ${relative(ROOT, outPath)}`);
console.log(`  Violations: ${violations.length}`);

// Baseline mode — same shape as pattern-lint baseline. Pre-existing
// violations are tracked in centrality-baseline.json. New ones (file:line
// not in baseline) fail the gate. Refresh after refactoring with
// `npm run centrality -- --update-baseline`.
const baselinePath = join(__dirname, 'centrality-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');
const currentKeys = new Set(violations.map(v => `${v.file}:${v.function}`));

if (updateBaseline) {
  writeFileSync(baselinePath, JSON.stringify([...currentKeys].sort(), null, 2) + '\n');
  console.log(`  Baseline updated: ${currentKeys.size} violations captured at ${relative(ROOT, baselinePath)}`);
  process.exit(0);
}

let baseline = new Set();
if (existsSync(baselinePath)) {
  try { baseline = new Set(JSON.parse(readFileSync(baselinePath, 'utf8'))); } catch { baseline = new Set(); }
}

const newViolations = [...currentKeys].filter(k => !baseline.has(k));
if (newViolations.length === 0) {
  if (currentKeys.size > 0) {
    console.log(`  PASS — no new centrality violations (${currentKeys.size} pre-existing baselined).`);
  }
  process.exit(0);
}

console.log(`  FAIL — ${newViolations.length} NEW centrality violations introduced:`);
for (const v of newViolations) console.log(`    ✗ ${v}`);
console.log(`  Refresh baseline (after refactor): npm run centrality -- --update-baseline`);
process.exit(1);
