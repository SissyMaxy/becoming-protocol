#!/usr/bin/env node
/**
 * UI lint — Velvet design-system drift gate (B1.5 of the UI clarity
 * re-architecture, 2026-07-14).
 *
 * The app converged on ONE skin (protocol-* tokens in src/styles/tokens.css,
 * primitives in src/components/ui/themed). This gate keeps it converged:
 * the audit found 2,700+ raw hex literals across five parallel styling
 * systems. Existing debt is baselined; NEW drift fails CI. Each migration
 * phase refreshes the baseline downward.
 *
 * Deliberately a SIBLING of pattern-lint.mjs, not new patterns inside it —
 * pattern-lint scans api/ + supabase/functions/ + src/lib and its backend
 * rules (david-identity-leak etc.) must not run over 300 UI files.
 *
 * Baseline refresh: `npm run lint:ui -- --update-baseline`
 * Per-line suppression: append `// ui-lint: ok` (or `/* ui-lint: ok *​/` in CSS).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const SOURCE_ROOTS = [
  join(ROOT, 'src', 'components'),
  join(ROOT, 'src', 'styles'),
  join(ROOT, 'src', 'navigation'),
];

// Files allowed to define raw values — the token sources themselves.
const HEX_ALLOWLIST = [
  'src/styles/tokens.css',
];

const norm = (p) => p.replace(/\\/g, '/');
const isAllowed = (relFile, allowlist) => allowlist.some(a => norm(relFile) === a);

// Each pattern: { name, doc, why, appliesTo(relFile), regex } — regex runs
// line-by-line; lines bearing `ui-lint: ok` are skipped.
const PATTERNS = [
  {
    name: 'raw-hex-in-ui',
    doc: 'project_velvet_ui_overhaul_2026-07-03.md',
    why: 'Raw hex colors in components/styles fork the palette (audit: 2,717 literals, five parallel systems, near-miss plums like #150e13 vs token #1a1118). Use protocol-* Tailwind classes, var(--protocol-*), or PROTOCOL.* from src/lib/theme-tokens.ts.',
    appliesTo: (f) => /\.(tsx|css)$/.test(f) && !isAllowed(f, HEX_ALLOWLIST),
    regex: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/,
  },
  {
    name: 'inline-font-family',
    doc: 'project_velvet_ui_overhaul_2026-07-03.md',
    why: 'Fonts are settled: Quicksand base, .handler-voice (Inter), .mommy-voice / font-display (Playfair). Inline fontFamily declarations fork typography — use the classes.',
    appliesTo: (f) => f.endsWith('.tsx'),
    regex: /\bfontFamily\s*:/,
  },
  {
    name: 'css-font-family',
    doc: 'project_velvet_ui_overhaul_2026-07-03.md',
    why: 'CSS files must inherit the app faces (font-family: inherit or var(...)) — today-redesign.css setting Inter as its own base font put the biggest surface of the app in a different typeface than the rest.',
    appliesTo: (f) => f.endsWith('.css') && !isAllowed(f, HEX_ALLOWLIST),
    regex: /font-family\s*:\s*(?!inherit|var\()/,
  },
  {
    name: 'generic-tailwind-palette',
    doc: 'project_velvet_ui_overhaul_2026-07-03.md',
    why: 'Generic Tailwind colors (purple-900, gray-400, red-600…) are the pre-Velvet skin. Use protocol-* tokens (danger/success/warning cover the semantic cases). pink-*/amber-*/lavender-* are exempt — sanctioned bambi ramp.',
    appliesTo: (f) => f.endsWith('.tsx'),
    regex: /\b(?:bg|text|border|from|to|via|ring|stroke|fill|divide|outline|shadow)-(?:purple|indigo|fuchsia|violet|emerald|teal|slate|zinc|gray|neutral|stone|red|rose|blue|sky|cyan|lime|green|yellow|orange)-\d{2,3}\b/,
  },
  {
    name: 'raw-modal-scrim',
    doc: 'project_velvet_ui_overhaul_2026-07-03.md',
    why: 'Hand-rolled overlay scrims drifted across bg-black/40–/70 and rgba(0,0,0,…). New modals use the ui/themed Modal primitive (standard scrim, Esc/scrim close, 100dvh + safe-area).',
    appliesTo: (f) => f.endsWith('.tsx') && !norm(f).endsWith('ui/themed/Modal.tsx'),
    regex: /\bbg-black\/\d{2}\b|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/,
  },
  {
    name: 'raw-playfair-ref',
    doc: 'feedback_mommy_voice_craft_rubric.md',
    why: "Mommy's serif applies through .mommy-voice or font-display only — raw 'Playfair Display' strings fork letter-spacing/fallback handling from the canonical classes.",
    appliesTo: (f) => f.endsWith('.tsx'),
    regex: /Playfair/,
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
    else if (/\.(tsx|css)$/.test(e)) out.push(full);
  }
  return out;
}

const files = SOURCE_ROOTS.flatMap(r => walk(r));
let totalHits = 0;
const byPattern = new Map();

for (const file of files) {
  const rel = norm(relative(ROOT, file));
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (const p of PATTERNS) {
    if (!p.appliesTo(rel)) continue;
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      if (p.regex.test(lines[i]) && !lines[i].includes('ui-lint: ok')) {
        hits.push({ line: i + 1, snippet: lines[i].trim().slice(0, 140) });
      }
    }
    if (hits.length) {
      const arr = byPattern.get(p.name) || [];
      for (const h of hits) {
        arr.push({ ...h, file: rel });
        totalHits++;
      }
      byPattern.set(p.name, arr);
    }
  }
}

// Baseline handling — content-keyed (file + snippet, no line numbers), same
// rationale as pattern-lint.mjs: line numbers shift on unrelated edits.
const baselinePath = join(__dirname, 'ui-lint-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');

const trimSnippet = (s) => s.replace(/\s+/g, ' ').trim();
const keyFor = (h) => `${norm(h.file)}::${trimSnippet(h.snippet)}`;

const currentHitKeys = new Map();
for (const [name, hits] of byPattern) {
  const set = new Set();
  for (const h of hits) set.add(keyFor(h));
  currentHitKeys.set(name, set);
}

if (updateBaseline) {
  // Sort BOTH the pattern keys and each entry list so the baseline is
  // byte-deterministic across OSes — the Map's insertion order follows the
  // file-walk (readdir) order, which differs Windows↔Linux and was making
  // check-baselines report phantom drift in CI (preflight red).
  const out = {};
  for (const name of [...currentHitKeys.keys()].sort()) {
    out[name] = [...currentHitKeys.get(name)].sort();
  }
  writeFileSync(baselinePath, JSON.stringify(out, null, 2) + '\n');
  console.log(`[ui-lint] Baseline updated: ${totalHits} hits captured at ${relative(ROOT, baselinePath)}`);
  process.exit(0);
}

let baseline = {};
if (existsSync(baselinePath)) {
  try { baseline = JSON.parse(readFileSync(baselinePath, 'utf8')); } catch { baseline = {}; }
}

const newHits = new Map();
let totalNewHits = 0;
let totalBaselined = 0;
for (const [name, currentSet] of currentHitKeys) {
  const base = new Set(baseline[name] || []);
  const newSet = [...currentSet].filter(k => !base.has(k));
  totalNewHits += newSet.length;
  totalBaselined += currentSet.size - newSet.length;
  if (newSet.length) newHits.set(name, newSet);
}

if (totalHits === 0) {
  console.log('[ui-lint] CLEAN — the Velvet skin is fully converged.');
  process.exit(0);
}

if (totalNewHits === 0) {
  console.log(`[ui-lint] PASS — no new drift beyond baseline (${totalBaselined} pre-existing debt hits).`);
  console.log('  (Migration phases shrink the baseline: npm run lint:ui -- --update-baseline)');
  process.exit(0);
}

console.log(`[ui-lint] FAIL — ${totalNewHits} NEW design-system drift hit${totalNewHits > 1 ? 's' : ''} (${totalBaselined} pre-existing baselined).\n`);
for (const [name, hits] of newHits) {
  const p = PATTERNS.find(p => p.name === name);
  console.log(`✗ ${name}  (${hits.length} new hit${hits.length > 1 ? 's' : ''})`);
  console.log(`    why: ${p.why}`);
  console.log(`    see: memory/${p.doc}`);
  for (const h of hits.slice(0, 20)) {
    const [file, snippet] = h.split('::');
    console.log(`    ${file}  ${snippet ? snippet.slice(0, 120) : ''}`);
  }
  if (hits.length > 20) console.log(`    … and ${hits.length - 20} more`);
  console.log('');
}
console.log('Real drift: use tokens/primitives. False positive: append `// ui-lint: ok`.');
console.log('To accept current state: npm run lint:ui -- --update-baseline');
process.exit(1);
