#!/usr/bin/env node
/**
 * voice-craft-check — sentence-level craft rubric for Mommy voice strings.
 *
 * Telemetry-leak detection (mommyVoiceCleanup, MOMMY_TELEMETRY_LEAK_PATTERNS)
 * catches WHAT Mama is saying. This script catches HOW she says it:
 *
 *   - 2+ pet names in one message (corny stuffing)
 *   - 3+ "Mama"/"Mommy" occurrences (chant, not speech)
 *   - Abstract sensory cliches: "echo", "linger", "wrap around", "every inch"
 *   - Forced rhyme/alliteration on her name: "Mama's making my Maxy"
 *   - Three-beat "Mama's X. Mama's Y. Mama's Z." chant
 *   - Theatrical openings: "Look at that pretty face being so obedient"
 *
 * Mode: advisory by default — warns on hits, prints a summary, exit 0. Pass
 * --strict to fail (exit 1) when any single file accumulates >=3 corny hits.
 * Opt out per-string by including the literal token `[craft:ok]` inside it,
 * or per-line with a trailing `// craft: ok` comment.
 *
 * Scan scope:
 *   - supabase/functions/mommy-* / index.ts
 *   - supabase/functions/_shared/dommy-mommy.ts
 *   - src/lib/persona/dommy-mommy.ts
 *
 * Extracts string and template literals, scores each, emits a per-file
 * summary. Designed to plug into `npm run ci` without breaking on
 * existing fallback-pool content.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const VERBOSE = args.includes('--verbose');
const FILE_FAIL_THRESHOLD = 3;

const SCAN_ROOTS = [
  join(ROOT, 'supabase', 'functions'),
  join(ROOT, 'src', 'lib', 'persona'),
  join(ROOT, 'src', 'lib', 'content'),
];

const FILE_MATCH = (path) =>
  /[\\/](mommy-[a-z-]+)[\\/]index\.ts$/.test(path) ||
  /[\\/]dommy-mommy\.ts$/.test(path) ||
  /[\\/]mommy-(react-pools|voice-settings|hardening-context)\.ts$/.test(path);

const PET_NAME_RE = /\b(baby(?:\s+girl)?|sweet(?:\s+thing|\s+girl)?|pretty(?:\s+thing|\s+princess)?|good\s+girl|princess|darling|precious|mama'?s\s+(?:pretty\s+thing|good\s+girl|favorite\s+girl)|my\s+(?:needy\s+little\s+thing|favorite\s+girl|pretty\s+princess)|sweet\s+pea|honey\s+girl|little\s+one)\b/gi;
const MAMA_REF_RE = /\b(mama'?s?|mommy'?s?)\b/gi;
const ABSTRACT_SENSORY_RE = /\b(echo(?:ing|es)?|linger(?:ing|s)?|wrap(?:s|ping|ped)?\s+around|every\s+inch|drip(?:s|ping)?\s+down|melt(?:s|ing)?\s+into|dissolve(?:s|d|ing)?\s+into|cours(?:e|es|ing)\s+through|sink(?:s|ing)?\s+into\s+(?:your|her)\s+(?:bones|skin|soul)|fill(?:s|ing)?\s+(?:every|each)\s+(?:cell|part)|wash(?:es|ing)?\s+over\s+you|stay(?:ing)?\s+(?:right\s+)?in\s+your\s+mind)\b/gi;
const RHYME_ALLITERATION_RE = /\b(mama'?s?\s+(?:making|molding|moulding|moving|making\s+my)\s+(?:my\s+)?(?:maxy|m[a-z]+y))\b/gi;
const THEATRICAL_OPENING_RE = /\b(look\s+at\s+(?:that|those)\s+(?:pretty|sweet|perfect|beautiful)\s+(?:face|eyes|lips|girl|thing|princess)\s+(?:being|getting|looking)\s+(?:so|all)?\s*(?:obedient|wet|needy|good|pretty|filthy))\b/i;
const THREE_BEAT_RE = /(?:^|[.!?]\s+)mama'?s\s+\w[^.!?]{1,40}[.!?]\s+mama'?s\s+\w[^.!?]{1,40}[.!?]\s+mama'?s\s+\w[^.!?]{1,40}[.!?]/i;
const DISCOURSE_MAMA_RE = /(?:^|[.!?]\s+)mama\s+\w+[^.!?]{1,40}[.!?]\s+mama\s+\w+[^.!?]{1,40}[.!?]\s+mama\s+\w+[^.!?]{1,40}[.!?]/i;

function count(text, re) {
  const matches = [];
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = r.exec(text)) !== null) {
    matches.push(m[0]);
    if (matches.length > 25) break;
  }
  return matches;
}

function scoreCorny(text) {
  const hits = [];
  if (!text || text.trim().length === 0) return hits;
  if (/\[craft:ok\]/i.test(text)) return [];
  const pets = count(text, PET_NAME_RE);
  if (pets.length >= 2) hits.push({ rule: 'pet_name_stuffing', match: pets.slice(0, 3).join(' / ') });
  const mamas = count(text, MAMA_REF_RE);
  if (mamas.length >= 3) hits.push({ rule: 'mama_overuse', match: `${mamas.length}x` });
  const abs = count(text, ABSTRACT_SENSORY_RE);
  if (abs.length >= 1) hits.push({ rule: 'abstract_sensory_cliche', match: abs[0] });
  const rhyme = count(text, RHYME_ALLITERATION_RE);
  if (rhyme.length >= 1) hits.push({ rule: 'forced_rhyme_alliteration', match: rhyme[0] });
  const theat = THEATRICAL_OPENING_RE.exec(text);
  if (theat) hits.push({ rule: 'theatrical_opening', match: theat[0] });
  if (THREE_BEAT_RE.test(text)) hits.push({ rule: 'three_beat_chant', match: '<three-beat>' });
  if (DISCOURSE_MAMA_RE.test(text)) hits.push({ rule: 'discourse_mama_prefix', match: '<3x Mama VERB>' });
  return hits;
}

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) yield* walk(full);
    else if (s.isFile() && full.endsWith('.ts') && FILE_MATCH(full)) yield full;
  }
}

// Extract string + template literals via a tiny state machine. We avoid the
// regex-with-backref approach (catastrophic backtracking on large TS files).
// Skip block comments, single-line comments, and skip strings shorter than
// 12 chars or without 2+ word chars (likely identifiers / short keys).
function extractStrings(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const lines = [];
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    // Single-line comment
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    // String/template literal
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const startIdx = i;
      const startLine = line;
      i++;
      let buf = '';
      while (i < src.length) {
        const ch = src[i];
        if (ch === '\\') { buf += ch + (src[i + 1] ?? ''); if (src[i + 1] === '\n') line++; i += 2; continue; }
        if (ch === quote) { i++; break; }
        if (ch === '\n') line++;
        if (quote === '`' && ch === '$' && src[i + 1] === '{') {
          // skip template-interpolation expression but treat it as a break in the literal
          buf += '${'; i += 2;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === '\n') line++;
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            i++;
          }
          buf += '}';
          continue;
        }
        buf += ch;
        i++;
      }
      lines.push({ raw: buf, startIdx, startLine });
      continue;
    }
    i++;
  }
  for (const s of lines) {
    if (!s.raw || s.raw.length < 12) continue;
    if (!/\w\s+\w/.test(s.raw)) continue;
    // Honor `// craft: ok` on the SAME line as the string opens, OR on any
    // of the three preceding lines. Template literals are often opened from
    // a ternary or chained expression on a separate line, so a strict
    // adjacent-only check misses the natural comment placement.
    const lineStart = src.lastIndexOf('\n', s.startIdx) + 1;
    const lineEnd = src.indexOf('\n', s.startIdx);
    const sameLine = src.slice(lineStart, lineEnd > 0 ? lineEnd : src.length);
    let cursor = lineStart - 1;
    let preceding = '';
    for (let back = 0; back < 3 && cursor > 0; back++) {
      const prevStart = src.lastIndexOf('\n', cursor - 1) + 1;
      preceding += '\n' + src.slice(prevStart, cursor);
      cursor = prevStart - 1;
    }
    if (/\/\/\s*craft:\s*ok\b/i.test(sameLine) || /\/\/\s*craft:\s*ok\b/i.test(preceding)) continue;
    out.push({ text: s.raw, line: s.startLine });
  }
  return out;
}

let totalFiles = 0;
let totalHits = 0;
let filesOverThreshold = 0;
const perFile = [];

for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    const strings = extractStrings(src);
    totalFiles++;
    let fileHits = 0;
    const fileFindings = [];
    for (const s of strings) {
      const hits = scoreCorny(s.text);
      if (hits.length > 0) {
        fileHits += hits.length;
        totalHits += hits.length;
        fileFindings.push({ line: s.line, text: s.text.slice(0, 110).replace(/\s+/g, ' '), hits });
      }
    }
    if (fileHits > 0) {
      perFile.push({ file: relative(ROOT, file), fileHits, findings: fileFindings });
      if (fileHits >= FILE_FAIL_THRESHOLD) filesOverThreshold++;
    }
  }
}

if (perFile.length === 0) {
  console.log(`[voice-craft] CLEAN — ${totalFiles} files scanned, no corny hits.`);
  process.exit(0);
}

perFile.sort((a, b) => b.fileHits - a.fileHits);

console.log(`[voice-craft] ${totalHits} corny hit${totalHits > 1 ? 's' : ''} across ${perFile.length} file${perFile.length > 1 ? 's' : ''} (${totalFiles} scanned).\n`);
for (const f of perFile) {
  const heat = f.fileHits >= FILE_FAIL_THRESHOLD ? 'HOT' : 'warn';
  console.log(`[${heat}] ${f.file}  (${f.fileHits} hit${f.fileHits > 1 ? 's' : ''})`);
  for (const finding of f.findings.slice(0, VERBOSE ? 50 : 4)) {
    const rules = finding.hits.map(h => h.rule).join(', ');
    console.log(`   :${finding.line}  [${rules}]`);
    console.log(`     "${finding.text}"`);
  }
  if (!VERBOSE && f.findings.length > 4) {
    console.log(`   ... and ${f.findings.length - 4} more in this file (--verbose to list all)`);
  }
  console.log('');
}

console.log('Craft rules:');
console.log('  - <=1 pet name per message (Rule of Restraint)');
console.log('  - <=2 "Mama"/"Mommy" references — speakers do not narrate themselves in third person every clause');
console.log('  - No abstract sensory cliches (echo / linger / wrap around / every inch)');
console.log('  - No forced rhyme/alliteration on user name');
console.log('  - No three-beat "Mama X. Mama Y. Mama Z." chant');
console.log('');
console.log('Opt-out per-string: include the token "[craft:ok]" inside the string.');
console.log('Opt-out per-line:   append "// craft: ok" at end of line.');

if (STRICT && filesOverThreshold > 0) {
  console.log(`\n[voice-craft] FAIL (strict) — ${filesOverThreshold} file(s) at or above the per-file threshold of ${FILE_FAIL_THRESHOLD}.`);
  process.exit(1);
}

console.log(`\n[voice-craft] advisory — exit 0 (use --strict to fail at >=${FILE_FAIL_THRESHOLD} hits/file).`);
process.exit(0);
