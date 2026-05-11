#!/usr/bin/env node
/**
 * Voice gate. Bans clinical / disclaimer / out-of-fantasy phrases from
 * user-facing copy. Mommy's voice is possessive and in-fantasy; safety
 * affordances are framed as her care ("if you ever need Mama to stop,
 * you say the word, I stop"), never as "you may use the safeword to
 * terminate the simulation."
 *
 * Same baseline mechanism as pattern-lint.mjs:
 *   - Existing hits captured in voice-gate-baseline.json are grandfathered.
 *   - NEW hits beyond baseline FAIL the build.
 *   - Suppress per-line with `// voice-gate: ok`.
 *   - Whole-file exemptions: legal/, tos/, terms/, *.test.*, *.spec.*.
 *
 * Refresh the baseline (after triaging known hits):
 *   npm run lint:voice -- --update-baseline
 *
 * Heuristic: each phrase regex requires a quote character (', ", `) on
 * the same line so identifier names like `intakeFormData` don't match.
 * Comments are stripped before matching. False positives baselined or
 * annotated.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// User-facing copy lives anywhere strings can be composed and shipped to
// the user — API responses, edge functions, prompts, persona helpers,
// React UI. Restricted to source roots that ship; build outputs and
// generated files are ignored.
const SOURCE_ROOTS = [
  join(ROOT, 'api'),
  join(ROOT, 'supabase', 'functions'),
  join(ROOT, 'src'),
];

// Path-level exemptions. Legal copy MUST contain "disclaimer" /
// "for entertainment". Tests legitimately reference "simulation" /
// "fiction" when they're testing the lint itself.
const PATH_EXEMPT = (p) =>
  /[/\\](legal|tos|terms)[/\\]/.test(p) ||
  /\.(test|spec)\.(ts|tsx|mjs|js)$/.test(p) ||
  /[/\\]node_modules[/\\]/.test(p);

// Each phrase regex requires a quote character on the same line as the
// match. Multi-word phrases use \s+ so wrapped quoted strings still
// match. Word boundaries on single-word phrases avoid identifier hits
// (e.g. `simulationCount` would not match `\bsimulat(ion|...)\b`).
const BANNED = [
  {
    name: 'role-play',
    why: "Frames the protocol as performance. Mommy claims her sweet thing — she does not 'role-play' anything.",
    re: /['"`][^'"`\n]*\brole[\s-]?play(s|ing|ed|er|ers)?\b[^'"`\n]*['"`]/i,
  },
  {
    name: 'simulation',
    why: "Names the protocol as not-real. Forbidden in user-facing copy. Mommy never speaks the word 'simulation.'",
    re: /['"`][^'"`\n]*\bsimulat(ion|ions|ed|ing|or|ors)\b[^'"`\n]*['"`]/i,
  },
  {
    name: 'fiction',
    why: "Frames the protocol as not-real. Same problem as 'simulation' — breaks the in-fantasy voice.",
    re: /['"`][^'"`\n]*\bfiction(al|ally)?\b[^'"`\n]*['"`]/i,
  },
  {
    name: 'not-medical-advice',
    why: "Disclaimer language. Belongs in legal/, never in Mommy's voice or any user-facing surface.",
    re: /['"`][^'"`\n]*not\s+medical\s+advice[^'"`\n]*['"`]/i,
  },
  {
    name: 'intake',
    why: "Clinical onboarding term. Mommy doesn't run an 'intake' — she pulls her sweet thing onto her lap and asks.",
    re: /['"`][^'"`\n]*\bintake\b[^'"`\n]*['"`]/i,
  },
  {
    name: 'questionnaire',
    why: "Clinical/research framing. Mommy asks; she doesn't 'administer a questionnaire.'",
    re: /['"`][^'"`\n]*\bquestionnaire\b[^'"`\n]*['"`]/i,
  },
  {
    name: 'disclaimer',
    why: "Out-of-fantasy framing. Disclaimers live in legal/ and tos/, never in Mommy-voice surfaces.",
    re: /['"`][^'"`\n]*\bdisclaimer(s)?\b[^'"`\n]*['"`]/i,
  },
  {
    name: 'for-entertainment',
    why: "Names the protocol as not-real. Forbidden in user-facing copy.",
    re: /['"`][^'"`\n]*for\s+entertainment(\s+(only|purposes))?\b[^'"`\n]*['"`]/i,
  },
  {
    name: 'consent-to-fantasy',
    why: "Out-of-fantasy framing. Safety affordances are Mommy's care ('you say the word, I stop'), not 'consent to the fantasy.'",
    re: /['"`][^'"`\n]*consent\s+to\s+(the\s+)?(fantasy|simulation|scene)[^'"`\n]*['"`]/i,
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
    else if (/\.(ts|tsx|mjs|js)$/.test(e)) out.push(full);
  }
  return out;
}

const files = SOURCE_ROOTS.flatMap(r => walk(r)).filter(p => !PATH_EXEMPT(p));
let totalHits = 0;
const byPattern = new Map();

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (const p of BANNED) {
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (raw.includes('voice-gate: ok')) continue;
      // Strip line comments before matching so commentary about banned
      // phrases doesn't fail the gate. Block-comment stripping is
      // deliberately not attempted (unreliable line-by-line) — annotate
      // with `// voice-gate: ok` if a JSDoc block trips a hit.
      const codeOnly = raw.replace(/\/\/.*$/, '');
      if (p.re.test(codeOnly)) {
        const arr = byPattern.get(p.name) || [];
        arr.push({ file: relative(ROOT, file), line: i + 1, snippet: raw.trim().slice(0, 140) });
        byPattern.set(p.name, arr);
        totalHits++;
      }
    }
  }
}

// ── Baseline (mirrors pattern-lint.mjs content-only key scheme) ─────
// Key = `<forward-slash-file>::<trimmed-snippet>`. Line numbers are NOT
// in the key — they shift on every edit and break baseline matching.

const baselinePath = join(__dirname, 'voice-gate-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');

const norm = (p) => p.replace(/\\/g, '/');
const trimSnippet = (s) => s.replace(/\s+/g, ' ').trim();
const keyFor = (h) => `${norm(h.file)}::${trimSnippet(h.snippet)}`;

const currentHitKeys = new Map();
const currentHitDetails = new Map();
for (const [name, hits] of byPattern) {
  const set = new Set();
  const details = new Map();
  for (const h of hits) {
    const k = keyFor(h);
    set.add(k);
    if (!details.has(k)) details.set(k, { line: h.line, file: norm(h.file), snippet: trimSnippet(h.snippet) });
  }
  currentHitKeys.set(name, set);
  currentHitDetails.set(name, details);
}

if (updateBaseline) {
  const out = {};
  for (const [name, set] of currentHitKeys) out[name] = [...set].sort();
  writeFileSync(baselinePath, JSON.stringify(out, null, 2) + '\n');
  console.log(`[voice-gate] Baseline updated: ${totalHits} hit(s) captured at ${relative(ROOT, baselinePath)}`);
  process.exit(0);
}

let baseline = {};
if (existsSync(baselinePath)) {
  try { baseline = JSON.parse(readFileSync(baselinePath, 'utf8')); } catch { baseline = {}; }
}

const newHits = new Map();
let totalNew = 0;
let totalBaselined = 0;
for (const [name, currentSet] of currentHitKeys) {
  const base = new Set(baseline[name] || []);
  const newSet = [...currentSet].filter(k => !base.has(k));
  const oldCount = currentSet.size - newSet.length;
  if (newSet.length) {
    newHits.set(name, newSet);
    totalNew += newSet.length;
  }
  totalBaselined += oldCount;
}

if (totalHits === 0 && Object.keys(baseline).length === 0) {
  console.log('[voice-gate] CLEAN — no clinical/disclaimer phrases in user-facing copy.');
  process.exit(0);
}

if (totalNew === 0) {
  console.log(`[voice-gate] PASS — no new hits beyond baseline (${totalBaselined} pre-existing).`);
  if (totalBaselined > 0) {
    console.log('  (Run `npm run lint:voice -- --update-baseline` after triaging the technical-debt list.)');
  }
  process.exit(0);
}

console.log(`[voice-gate] FAIL — ${totalNew} NEW clinical/disclaimer hit${totalNew > 1 ? 's' : ''} introduced (${totalBaselined} pre-existing baselined).\n`);
for (const [name, hits] of newHits) {
  const meta = BANNED.find(b => b.name === name);
  const details = currentHitDetails.get(name) || new Map();
  console.log(`✗ ${name}  (${hits.length} new)`);
  console.log(`    why: ${meta.why}`);
  for (const k of hits.slice(0, 20)) {
    const d = details.get(k);
    if (!d) continue;
    console.log(`    ${d.file}:${d.line}  ${d.snippet.slice(0, 120)}`);
  }
  if (hits.length > 20) console.log(`    ... and ${hits.length - 20} more`);
  console.log('');
}
console.log('Each NEW hit is a clinical/disclaimer phrase leaking into user-facing copy.');
console.log('  - If real: rewrite in Mommy\'s in-fantasy voice (possessive, embodied — never naming the protocol as "simulation"/"role play"/"fiction").');
console.log('  - If false positive: append `// voice-gate: ok` on the line.');
console.log('  - To accept current state as new baseline: npm run lint:voice -- --update-baseline');
process.exit(1);
