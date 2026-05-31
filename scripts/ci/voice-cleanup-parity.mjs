#!/usr/bin/env node
/**
 * voice-cleanup-parity — enforces that the mommyVoiceCleanup() telemetry-scrub
 * filter stays in sync across its duplicated copies (audit #6).
 *
 * The filter is the single chokepoint that keeps Dommy-Mommy text free of
 * telemetry leaks ("8/10", "Day 4 of denial", "47/100", "120 Hz", ...). It is
 * physically duplicated because the three runtimes can't share a module:
 *   - src/lib/persona/dommy-mommy.ts        (Vite client — CANONICAL)
 *   - supabase/functions/_shared/dommy-mommy.ts  (Deno edge)
 *   - api/handler/_lib/mommy-voice-chat.ts  (Vercel serverless, if present)
 * When the edge copy drifted (was missing ~15 patterns), edge functions that
 * return Mommy text directly re-leaked telemetry the rule forbids.
 *
 * This check extracts the ordered list of regex literals inside each copy's
 * mommyVoiceCleanup() and fails if any copy diverges from the canonical.
 *
 * Run: `node scripts/ci/voice-cleanup-parity.mjs`
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const CANONICAL = { path: 'src/lib/persona/dommy-mommy.ts', fn: 'mommyVoiceCleanup', strictOrder: true };
const COPIES = [
  // Edge copy is a direct mirror of canonical — require identical order.
  { path: 'supabase/functions/_shared/dommy-mommy.ts', fn: 'mommyVoiceCleanup', strictOrder: true },
  // Serverless chat copy uses its own helper names + slightly different order;
  // require the same SET of scrub patterns (no leak can slip through) plus the
  // one ordering invariant that matters for correctness (asserted below).
  { path: 'api/handler/_lib/mommy-voice-chat.ts', fn: 'mommyVoiceCleanupForChat', strictOrder: false },
];

/** Extract the named cleanup function body, then the ordered regex literals in it. */
function extractPatterns(relPath, fnName) {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) return null;
  const src = readFileSync(abs, 'utf8');
  const start = src.search(new RegExp(`function\\s+${fnName}\\s*\\(`));
  if (start === -1) return { error: `${fnName} not found` };
  // Body = from the function to the first line that is just `}` at column 0 after it.
  const after = src.slice(start);
  const endRel = after.search(/\n}\s*(\n|$)/);
  const body = endRel === -1 ? after : after.slice(0, endRel);
  // Match .replace( <regex literal> , ...   — regex literal handles escaped chars.
  const re = /\.replace\(\s*(\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\])+\/[a-z]*)/g;
  const pats = [];
  let m;
  while ((m = re.exec(body)) !== null) pats.push(m[1]);
  return { patterns: pats };
}

const canon = extractPatterns(CANONICAL.path, CANONICAL.fn);
if (!canon || canon.error || !canon.patterns.length) {
  console.error(`[voice-parity] FAIL — cannot read canonical patterns from ${CANONICAL.path}: ${canon?.error || 'none found'}`);
  process.exit(1);
}

let failed = false;
for (const copy of COPIES) {
  const res = extractPatterns(copy.path, copy.fn);
  if (res === null) { console.log(`[voice-parity] skip ${copy.path} (absent)`); continue; }
  if (res.error) { console.error(`[voice-parity] FAIL ${copy.path}: ${res.error}`); failed = true; continue; }

  const a = canon.patterns;
  const b = res.patterns;
  // Every canonical scrub MUST be present in every copy (a missing one = a leak).
  const missing = a.filter((p) => !b.includes(p));
  // Extra patterns: a divergence only for strict mirrors (edge). The serverless
  // chat copy is allowed to be a SUPERSET (it scrubs extra chat-only tells).
  const extra = copy.strictOrder ? b.filter((p) => !a.includes(p)) : [];
  const orderMismatch = copy.strictOrder && !missing.length && !extra.length && a.some((p, i) => b[i] !== p);

  if (missing.length || extra.length || orderMismatch) {
    failed = true;
    console.error(`[voice-parity] FAIL ${copy.path}: diverged from canonical (${a.length} canonical vs ${b.length} here).`);
    for (const p of missing) console.error(`   - MISSING canonical scrub (telemetry could leak here): ${p}`);
    for (const p of extra) console.error(`   + EXTRA (strict mirror must not add patterns):           ${p}`);
    if (orderMismatch) console.error('   ! same set but DIFFERENT ORDER (this copy must mirror canonical order exactly)');
  } else {
    const note = copy.strictOrder ? 'set matches canonical, order identical' : `superset OK — contains all ${a.length} canonical scrubs + ${b.length - a.length} chat-specific`;
    console.log(`[voice-parity] OK   ${copy.path} (${b.length} patterns; ${note})`);
  }
}

process.exit(failed ? 1 : 0);
