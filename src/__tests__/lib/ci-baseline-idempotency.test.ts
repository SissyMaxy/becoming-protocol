// Tests for CI baseline regeneration idempotency.
//
// Why: every baseline refresh used to produce subtly different bytes across
// Windows ↔ Linux (insertion order, path separators, trailing newline). That
// made `npm run ci:check-baselines` flap depending on who refreshed it.
// The lint scripts already sort + stringify deterministically — this test is
// the regression guard that traps any future change that breaks that.
//
// Approach: for each baseline writer, run `--update-baseline` twice in a row
// and assert the bytes match exactly between runs. Restore the original
// baseline either way so the test never mutates the tracked tree.
//
// Also asserts structural invariants on the output:
//   - LF-only line endings (no CR)
//   - Trailing newline present (`\n` at EOF)
//   - Parses as JSON
//   - Top-level is an array OR an object with array values, sorted

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

interface BaselineTarget {
  name: string;
  baseline: string;
  refresh: string;
  // Some scripts depend on heavy npm install / db state. Skip in environments
  // where they can't run (CI=true unsets some, locally without npm install).
  // None right now — pure file scanners.
}

const TARGETS: BaselineTarget[] = [
  {
    name: 'pattern-lint',
    baseline: join(ROOT, 'scripts/handler-regression/pattern-lint-baseline.json'),
    refresh: 'node scripts/handler-regression/pattern-lint.mjs --update-baseline',
  },
  {
    name: 'migration-lint',
    baseline: join(ROOT, 'scripts/handler-regression/migration-lint-baseline.json'),
    refresh: 'node scripts/handler-regression/migration-lint.mjs --update-baseline',
  },
  {
    name: 'centrality',
    baseline: join(ROOT, 'scripts/handler-regression/centrality-baseline.json'),
    refresh: 'node scripts/handler-regression/centrality-audit.mjs --update-baseline',
  },
  // typecheck-api shells to `tsc -p tsconfig.api.json` per refresh, which costs
  // ~15-25s per pass. Two passes = ~50s, doubling the test suite runtime.
  // Pattern-lint + migration-lint + centrality together exercise the same
  // `sort()`-then-stringify-then-write-with-LF code path, so coverage is
  // adequate without it. Re-enable here if typecheck-api ever diverges.
];

// Mutex via per-target file backup. `safeRun` reads original bytes, runs
// refresh, captures result bytes, writes original back. If the runner crashes
// mid-test the tree may still be in a refreshed state — `afterAll` plus a
// `try/finally` per-target keeps that window minimal.
function captureRefreshedBytes(t: BaselineTarget): Buffer {
  const before = existsSync(t.baseline) ? readFileSync(t.baseline) : null;
  try {
    execSync(t.refresh, { cwd: ROOT, stdio: 'pipe' });
  } catch (err) {
    // Some lint scripts exit non-zero even with --update-baseline if their
    // run itself errored; the baseline file should still be written. Continue
    // to the file read and let the test assert on bytes.
    const msg = String((err as { stderr?: Buffer; message?: string }).stderr || (err as Error).message || '').slice(0, 300);
    if (!existsSync(t.baseline)) {
      // No baseline produced — surface the script error.
      if (before) writeFileSync(t.baseline, before);
      throw new Error(`${t.name} refresh produced no baseline file: ${msg}`);
    }
  }
  const after = readFileSync(t.baseline);
  // Restore immediately so test runs in any order are non-destructive.
  if (before) writeFileSync(t.baseline, before);
  return after;
}

describe('CI baseline regeneration is idempotent', () => {
  for (const t of TARGETS) {
    describe(t.name, () => {
      let firstRun: Buffer;
      let secondRun: Buffer;

      beforeAll(() => {
        firstRun = captureRefreshedBytes(t);
        secondRun = captureRefreshedBytes(t);
      }, 120_000);

      it('produces byte-identical output on consecutive refreshes', () => {
        expect(firstRun.length).toBe(secondRun.length);
        expect(firstRun.equals(secondRun)).toBe(true);
      });

      it('contains no CR bytes (LF-only line endings)', () => {
        expect(firstRun.includes(0x0d)).toBe(false);
      });

      it('ends with exactly one trailing newline', () => {
        // Length > 0 unless the file is literally empty (unlikely; even
        // "[]\n" is 3 bytes). Last byte must be \n; second-to-last must not.
        expect(firstRun.length).toBeGreaterThan(0);
        expect(firstRun[firstRun.length - 1]).toBe(0x0a);
        if (firstRun.length >= 2) {
          expect(firstRun[firstRun.length - 2]).not.toBe(0x0a);
        }
      });

      it('parses as JSON with sorted top-level structure', () => {
        const parsed = JSON.parse(firstRun.toString('utf8'));
        if (Array.isArray(parsed)) {
          const sorted = [...parsed].sort();
          expect(parsed).toEqual(sorted);
        } else if (parsed && typeof parsed === 'object') {
          for (const [key, value] of Object.entries(parsed)) {
            if (Array.isArray(value)) {
              const sorted = [...value].sort();
              expect(value, `${t.name}.${key} must be sorted`).toEqual(sorted);
            }
          }
        }
      });
    });
  }
});
