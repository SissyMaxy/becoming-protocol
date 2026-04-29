#!/usr/bin/env node
/**
 * Pattern lint. Greps the codebase for the *known shapes* of bugs we've hit
 * before. New code that introduces these patterns gets flagged before deploy.
 *
 * Baseline mode: hits that appear in `pattern-lint-baseline.json` are
 * known technical debt, surfaced informationally, but don't fail the build.
 * NEW hits not in the baseline DO fail.
 *
 * Refresh the baseline (after triaging known hits): `npm run lint:patterns -- --update-baseline`
 *
 * To suppress a specific line, append `// pattern-lint: ok`.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const SOURCE_ROOTS = [
  join(ROOT, 'api'),
  join(ROOT, 'supabase', 'functions'),
  join(ROOT, 'src', 'lib'),
];

// Patterns: each is { name, doc, regex, why }
// `regex` is run line-by-line against source.
const PATTERNS = [
  {
    name: 'additive-on-derived-counter',
    doc: 'feedback_derived_counters_never_additive.md',
    why: 'denial_day / chastity_streak_days are derived counters; mutating them additively desynchronises display from reality (incident 2026-04-28).',
    regex: /(denial_day|chastity_streak_days|chastity_total_break_glass_count)\s*[:=]\s*[^=]*\+\s*(\d|\w)/,
  },
  {
    name: 'phantom-grace-period',
    doc: 'feedback_derived_counters_never_additive.md',
    why: 'Checking "no event in last Nh while state X is true" must also verify state X has been true for ≥Nh, else the trigger fires at the moment X flips on.',
    // Heuristic: a `chastity_locked` / `hrt_active` / similar gate followed
    // by a "no recent activity in last Nh" check. We can\'t parse semantics,
    // so we just flag where these two terms are within 6 lines and there is
    // no chastity_sessions / locked_at / started_at lookup nearby.
    multiline: true,
    pred: (text, file) => {
      const hits = [];
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!/chastity_locked\s*[:=]?\s*true/.test(lines[i])) continue;
        const slice = lines.slice(i, Math.min(lines.length, i + 25)).join('\n');
        const hasGraceCheck = /locked_at|started_at|session_age|session\.locked_at/.test(slice);
        const hasRecencyCheck = /now\(\)\s*-\s*interval\s*['"]\d+\s*hours?['"]|Date\.now\(\)\s*-\s*\d+\s*\*\s*3600000/.test(slice);
        if (hasRecencyCheck && !hasGraceCheck) {
          hits.push({ line: i + 1, snippet: lines[i].trim().slice(0, 140) });
        }
      }
      return hits;
    },
  },
  {
    name: 'unlinked-receipt-quote',
    doc: 'feedback_handler_must_cite_evidence.md',
    why: 'Pulling latest confession_queue.response_text without a triggered_by/source link produces fake "you said X" attributions on unrelated decrees (incident 2026-04-28: "sucking cock" attached to a cage decree).',
    // Match: .from('confession_queue').select(... response_text ...).order('confessed_at', desc).limit(1)
    // BUT: only flag when the query body lacks a triggered_by_table or
    // triggered_by_id filter — those make the query specific to a parent
    // artifact and are the *correct* way to fetch a receipt.
    multiline: true,
    pred: (text) => {
      const hits = [];
      const re = /\.from\(\s*['"`]confession_queue['"`]\s*\)([\s\S]{0,500}?)\.order\(\s*['"`]confessed_at['"`]\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)\s*\.limit\(\s*1\s*\)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const queryBody = m[1] || '';
        // Safe shape: the query filters by triggered_by_table OR triggered_by_id.
        const hasLinkFilter = /triggered_by_table|triggered_by_id|source_id/.test(queryBody);
        if (hasLinkFilter) continue;
        const before = text.slice(0, m.index);
        const line = before.split('\n').length;
        const snippet = text.slice(m.index, m.index + 120).replace(/\s+/g, ' ');
        hits.push({ line, snippet });
      }
      return hits;
    },
  },
  {
    name: 'slip-without-source-text-key',
    doc: 'feedback_handler_must_cite_evidence.md',
    why: 'Inserting into slip_log without a source_text field produces context-free punishments ("you slipped (other, 5pt)" with no quote). The field must be present in the insert object — bonus if it\'s a non-empty literal/template, but absence is the defining failure.',
    multiline: true,
    pred: (text) => {
      const hits = [];
      // Match the insert call AND its argument object together. Greedy to
      // the closing brace of the literal object passed to .insert().
      const re = /\.from\(\s*['"`]slip_log['"`]\s*\)\s*\.insert\(\s*(\{[\s\S]*?\})\s*\)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const objLiteral = m[1];
        // True positive only when the inserted object literally has no
        // `source_text:` key. False-positive cases (variable spread, etc.)
        // can be annotated with `// pattern-lint: ok` on the same line.
        const hasSourceText = /\bsource_text\s*:/.test(objLiteral);
        if (!hasSourceText) {
          const before = text.slice(0, m.index);
          const line = before.split('\n').length;
          // Also skip if the line itself bears the exemption marker.
          const lineText = text.split('\n')[line - 1] || '';
          if (lineText.includes('pattern-lint: ok')) continue;
          hits.push({ line, snippet: m[0].replace(/\s+/g, ' ').slice(0, 140) });
        }
      }
      return hits;
    },
  },
  {
    name: 'hardcoded-pitch-target',
    doc: 'feedback_voice_tracking.md',
    why: 'Voice commitments must track pitch over time, not enforce ≥XHz targets — forcing causes dysphoria.',
    regex: /≥\s*\d+\s*Hz|>=\s*1[5-9]\d\s*Hz|>=\s*[2-9]\d\d\s*Hz|"avg pitch must clear/i,
  },
  {
    name: 'david-identity-leak',
    doc: 'feedback_handler_is_singular_authority.md',
    why: 'David is never an output anywhere. Every user-facing surface speaks in Maxy-frame. References to past-self use "the costume," "the older version," "before Maxy" — never the literal name.',
    // Match the literal name in any quoted/template-literal/string position.
    // Code-internal slip-type values (e.g. slip_type: 'david_name_use') are
    // metadata, not output, and need to keep working — annotate those with
    // pattern-lint: ok where they appear.
    regex: /['"`][^'"`]*\bDavid\b[^'"`]*['"`]/,
  },
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

const files = SOURCE_ROOTS.flatMap(r => walk(r));
let totalHits = 0;
const byPattern = new Map();

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (const p of PATTERNS) {
    let hits = [];
    if (p.multiline && p.pred) {
      hits = p.pred(text, file);
    } else if (p.regex) {
      for (let i = 0; i < lines.length; i++) {
        if (p.regex.test(lines[i]) && !lines[i].includes('pattern-lint: ok')) {
          hits.push({ line: i + 1, snippet: lines[i].trim().slice(0, 140) });
        }
      }
    }
    if (hits.length) {
      const arr = byPattern.get(p.name) || [];
      for (const h of hits) {
        arr.push({ ...h, file: relative(ROOT, file) });
        totalHits++;
      }
      byPattern.set(p.name, arr);
    }
  }
}

// Baseline handling
const baselinePath = join(__dirname, 'pattern-lint-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');

// Build the current-run hit set as { pattern: Set<"file:line:trimmed-snippet"> }
// Normalize file paths to forward slashes so the baseline is portable across
// Windows (\\) and Linux CI (/). Without this, every CI run on Linux fails
// because the baseline written from Windows uses backslashes that never
// match the Linux scan.
const norm = (p) => p.replace(/\\/g, '/');
const currentHitKeys = new Map();
for (const [name, hits] of byPattern) {
  const set = new Set();
  for (const h of hits) {
    set.add(`${norm(h.file)}:${h.line}::${h.snippet.replace(/\s+/g, ' ').trim()}`);
  }
  currentHitKeys.set(name, set);
}

if (updateBaseline) {
  const out = {};
  for (const [name, set] of currentHitKeys) out[name] = [...set].sort();
  writeFileSync(baselinePath, JSON.stringify(out, null, 2) + '\n');
  console.log(`[pattern-lint] Baseline updated: ${totalHits} hits captured at ${relative(ROOT, baselinePath)}`);
  process.exit(0);
}

let baseline = {};
if (existsSync(baselinePath)) {
  try { baseline = JSON.parse(readFileSync(baselinePath, 'utf8')); } catch { baseline = {}; }
}

// Diff: anything in current that's not in baseline = NEW (build-failing).
const newHits = new Map();
const baselinedHits = new Map();
let totalNewHits = 0;
let totalBaselined = 0;
for (const [name, currentSet] of currentHitKeys) {
  const base = new Set(baseline[name] || []);
  const newSet = [...currentSet].filter(k => !base.has(k));
  const oldSet = [...currentSet].filter(k => base.has(k));
  if (newSet.length) {
    newHits.set(name, newSet);
    totalNewHits += newSet.length;
  }
  if (oldSet.length) {
    baselinedHits.set(name, oldSet);
    totalBaselined += oldSet.length;
  }
}

if (totalHits === 0 && Object.keys(baseline).length === 0) {
  console.log('[pattern-lint] CLEAN — no known anti-patterns detected.');
  process.exit(0);
}

if (totalNewHits === 0) {
  console.log(`[pattern-lint] PASS — no new hits beyond baseline (${totalBaselined} pre-existing).`);
  if (totalBaselined > 0) {
    console.log(`  (Run \`npm run lint:patterns -- --update-baseline\` after triaging the technical-debt list.)`);
  }
  process.exit(0);
}

// New hits — fail
console.log(`[pattern-lint] FAIL — ${totalNewHits} NEW hits introduced (${totalBaselined} pre-existing baselined).\n`);
for (const [name, hits] of newHits) {
  const p = PATTERNS.find(p => p.name === name);
  console.log(`✗ ${name}  (${hits.length} new hit${hits.length > 1 ? 's' : ''})`);
  console.log(`    why: ${p.why}`);
  console.log(`    see: memory/${p.doc}`);
  for (const h of hits.slice(0, 20)) {
    const [file, line, snippet] = h.split('::');
    console.log(`    ${file}:${line}  ${snippet ? snippet.slice(0, 120) : ''}`);
  }
  if (hits.length > 20) console.log(`    … and ${hits.length - 20} more`);
  console.log('');
}
console.log('Each NEW hit is either a real bug or a false positive. Real: fix. False: add `// pattern-lint: ok`.');
console.log('To accept current state as new baseline: npm run lint:patterns -- --update-baseline');
process.exit(1);
