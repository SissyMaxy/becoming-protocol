#!/usr/bin/env node
/**
 * storage-privacy-lint — fails the build if any source file calls
 * `supabase.storage.from('<flipped-bucket>').getPublicUrl(...)` after
 * migration 260 made these buckets private. Public URLs against private
 * buckets 401 on fetch; the correct path is the getSignedAssetUrl helper
 * (src/lib/storage/signed-url.ts).
 *
 * Scans api/, supabase/functions/, src/ recursively. Annotate genuine
 * exemptions with `// storage-privacy-lint: ok`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const SCAN_ROOTS = [
  join(ROOT, 'api'),
  join(ROOT, 'supabase', 'functions'),
  join(ROOT, 'src'),
];

// Buckets flipped to private in migration 260. Any getPublicUrl against
// these now returns a URL that 401s — the call is a latent bug.
const PRIVATE_BUCKETS = ['verification-photos', 'evidence', 'audio'];

const RE = new RegExp(
  String.raw`\.from\(\s*['"\`](?:${PRIVATE_BUCKETS.join('|')})['"\`]\s*\)\s*\.getPublicUrl\b`
);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e.startsWith('.') || e === 'node_modules' || e === 'dist') continue;
    const full = join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (/\.(ts|mjs|js|tsx|jsx)$/.test(e)) out.push(full);
  }
  return out;
}

const files = SCAN_ROOTS.flatMap(r => walk(r));
const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  // Cheap pre-filter — skip files that don't contain the call shape at all.
  if (!text.includes('.getPublicUrl(')) continue;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!RE.test(lines[i])) continue;
    if (lines[i].includes('storage-privacy-lint: ok')) continue;
    hits.push({ file: relative(ROOT, file).replace(/\\/g, '/'), line: i + 1, snippet: lines[i].trim().slice(0, 160) });
  }
}

if (hits.length === 0) {
  console.log(`[storage-privacy-lint] PASS — no getPublicUrl on private buckets (${PRIVATE_BUCKETS.join(', ')}).`);
  process.exit(0);
}

console.log(`[storage-privacy-lint] FAIL — ${hits.length} call site${hits.length > 1 ? 's' : ''} use getPublicUrl on a now-private bucket.`);
console.log(`  Buckets: ${PRIVATE_BUCKETS.join(', ')} were flipped to private in migration 260.`);
console.log(`  Replace with getSignedAssetUrl(bucket, path) — see src/lib/storage/signed-url.ts.`);
console.log(`  Genuine exemptions (legacy URL builder, mock harness, etc.): annotate with \`// storage-privacy-lint: ok\`.\n`);
for (const h of hits) console.log(`  ${h.file}:${h.line}  ${h.snippet}`);
process.exit(1);
