#!/usr/bin/env node
/**
 * `npm run ci` — gate parity orchestrator.
 *
 * Runs every check that CI runs (preflight.yml), in the same order, with the
 * same scopes and baselines. If any step fails, the failure class is recorded
 * to ci_local_failures (clustered by signature) so deploy-fixer can mine
 * recurring patterns into auto-fix recipes.
 *
 * Use --skip <name> to skip a step (e.g. for offline runs without DB), and
 * --only <name> to run a single step.
 *
 * Exit code:
 *   0 — all gates pass; safe to push
 *   1 — at least one gate failed; do NOT push
 */
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
function multi(flag) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) out.push(args[i + 1]);
  }
  return out;
}
const skip = new Set(multi('--skip'));
const only = new Set(multi('--only'));
const actor = (() => {
  const i = args.indexOf('--actor');
  return i >= 0 && args[i + 1] ? args[i + 1] : (process.env.CI_ACTOR || 'operator');
})();

// Order matches CI (.github/workflows/preflight.yml). Each step is a checker
// in ci_local_failures terms.
//
// `soft: true` matches CI's `continue-on-error: true` semantics — the step
// runs and reports, but its exit code does not gate the push. ESLint is soft
// because the repo carries 264 pre-existing lint issues that CI explicitly
// declared informational; making local strict would diverge from CI parity.
const steps = [
  { name: 'typecheck',       cmd: 'npx tsc --noEmit -p tsconfig.json' },
  { name: 'typecheck-api',   cmd: 'node scripts/ci/typecheck-api.mjs' },
  { name: 'lint',            cmd: 'npx eslint .', soft: true },
  { name: 'tests',           cmd: 'npx vitest run' },
  { name: 'patterns',        cmd: 'node scripts/handler-regression/pattern-lint.mjs' },
  { name: 'voice-gate',      cmd: 'node scripts/ci/voice-gate.mjs' },
  { name: 'migrations',      cmd: 'node scripts/handler-regression/migration-lint.mjs' },
  { name: 'storage',         cmd: 'node scripts/handler-regression/storage-privacy-lint.mjs' },
  { name: 'centrality',      cmd: 'node scripts/handler-regression/centrality-audit.mjs' },
  { name: 'check-baselines', cmd: 'node scripts/ci/check-baselines.mjs' },
];

let branch = '(unknown)';
try { branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim(); } catch { /* */ }

function run(cmd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      const s = d.toString();
      out += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      err += s;
      process.stderr.write(s);
    });
    child.on('close', (code) => resolve({ code: code ?? 1, out, err }));
  });
}

async function main() {
  const start = Date.now();
  const results = [];
  let firstFail = null;

  for (const step of steps) {
    if (only.size > 0 && !only.has(step.name)) continue;
    if (skip.has(step.name)) {
      console.log(`\n[ci] SKIP  ${step.name}`);
      continue;
    }

    console.log(`\n[ci] >>>>> ${step.name}`);
    const t0 = Date.now();
    const r = await run(step.cmd);
    const ms = Date.now() - t0;
    results.push({ step: step.name, code: r.code, ms });

    if (r.code !== 0) {
      if (step.soft) {
        // Matches CI's continue-on-error: report but do not gate.
        console.warn(`[ci] WARN  ${step.name}  (${ms}ms, exit ${r.code}, informational — same as CI)`);
        continue;
      }
      console.error(`[ci] FAIL  ${step.name}  (${ms}ms, exit ${r.code})`);
      // Capture and short-circuit. The first failure is the actionable one;
      // running the rest just adds noise.
      if (!firstFail) {
        firstFail = { step, out: r.out, err: r.err };
      }
      break;
    } else {
      console.log(`[ci] OK    ${step.name}  (${ms}ms)`);
    }
  }

  const totalMs = Date.now() - start;
  console.log(`\n[ci] summary  ${results.length} step(s) in ${totalMs}ms`);
  for (const r of results) {
    console.log(`     ${r.code === 0 ? 'OK' : 'FAIL'}  ${r.step.padEnd(18)} ${r.ms}ms`);
  }

  if (firstFail) {
    // Best-effort failure class capture. Errors here MUST NOT mask the real
    // failure — record-failure exits 0 even when DB write fails.
    const excerpt = (firstFail.out + '\n' + firstFail.err).slice(-3500);
    try {
      execSync(
        `node scripts/ci/record-failure.mjs --actor "${actor}" --checker "${firstFail.step.name}" --branch "${branch}"`,
        { cwd: ROOT, stdio: ['pipe', 'ignore', 'ignore'], input: excerpt },
      );
    } catch { /* swallow */ }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[ci] fatal:', err);
  process.exit(1);
});
