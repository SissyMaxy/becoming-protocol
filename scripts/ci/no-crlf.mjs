#!/usr/bin/env node
/**
 * Fail the build if any tracked text file contains a CR byte (\r).
 *
 * `.gitattributes` declares the LF policy, but a contributor whose editor
 * silently rewrites a file with CRLF can still commit if `core.autocrlf`
 * isn't configured on their machine. This script is the structural check
 * that catches it before merge — same gate, every contributor, every push.
 *
 * Approach: ask git for the list of tracked files (so we honour
 * .gitignore and don't scan node_modules / dist / .browser-profiles),
 * skip anything `.gitattributes` declared `binary`, and grep each text
 * file for `\r`. Any hit fails the gate with a path list.
 *
 * Usage:
 *   node scripts/ci/no-crlf.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const BINARY_HINT = /\.(png|jpg|jpeg|gif|ico|webp|avif|pdf|zip|gz|tar|mp3|mp4|wav|ogg|woff2?|ttf|otf)$/i;

function listTrackedFiles() {
  // -z null-separated so paths with spaces or non-ASCII don't break parsing.
  const buf = execSync('git ls-files -z', { cwd: ROOT });
  return buf
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

const offenders = [];
const files = listTrackedFiles();

for (const rel of files) {
  if (BINARY_HINT.test(rel)) continue;
  const abs = join(ROOT, rel);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    // File listed by git ls-files but missing on disk — submodule placeholder
    // or recent rename mid-checkout. Skip silently.
    continue;
  }
  // Cap at 5MB. Any text file larger than that is almost certainly mis-tagged.
  if (!stat.isFile() || stat.size > 5 * 1024 * 1024) continue;

  const buf = readFileSync(abs);
  // Fast path: no \r at all.
  if (!buf.includes(0x0d)) continue;

  // Confirm it's actually text (not a binary blob with stray 0x0d). A null
  // byte is a strong signal of binary — skip if present.
  if (buf.includes(0x00)) continue;

  offenders.push(rel);
}

if (offenders.length > 0) {
  console.error(`ci:no-crlf  FAIL — ${offenders.length} tracked text file(s) contain CR (\\r):`);
  for (const f of offenders.slice(0, 30)) {
    console.error(`  ${f}`);
  }
  if (offenders.length > 30) {
    console.error(`  ... and ${offenders.length - 30} more`);
  }
  console.error('');
  console.error('Fix:');
  console.error('  git add --renormalize .');
  console.error('  git diff --cached --shortstat');
  console.error('  git commit -m "normalise EOL to LF"');
  console.error('');
  console.error('Root cause is usually a contributor on Windows whose');
  console.error('`core.autocrlf` is unset. `.gitattributes` declares the');
  console.error('policy; this gate enforces it.');
  process.exit(1);
}

console.log(`ci:no-crlf  PASS — scanned ${files.length} tracked file(s), no CR bytes`);
process.exit(0);
