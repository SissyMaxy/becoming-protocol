#!/usr/bin/env node

/**
 * Phase 7 Final Verification Script (Section 7.9)
 * Runs all verification steps and outputs a summary report.
 */

import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CLIENT = join(ROOT, 'client');
const SERVER = join(ROOT, 'server');

const results = [];

function run(label, cmd, cwd) {
  const step = { label, status: 'PASS', detail: '' };
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    step.detail = output.trim().split('\n').slice(-3).join(' | ');
  } catch (err) {
    step.status = 'FAIL';
    step.detail = (err.stderr || err.stdout || err.message || '').trim().split('\n').slice(-5).join(' | ');
  }
  results.push(step);
  const icon = step.status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${icon}] ${label}`);
  return step.status === 'PASS';
}

console.log('\n=== Vox Femina Phase 7 Verification ===\n');

// 7.1 Build & Lint
run('7.1a Build (client)', 'npx vite build', CLIENT);
run('7.1b Lint (client, zero warnings)', 'npx eslint . --max-warnings 0', CLIENT);

// 7.2 Unit Test Suite with Coverage
run('7.2a Client tests + coverage', 'npx vitest run --coverage', CLIENT);
run('7.2b Server tests', 'npx vitest run', SERVER);

// 7.3 Audio Pipeline Integration
run('7.3  Audio pipeline integration', 'npx vitest run src/audio/__tests__/AudioPipeline.integration.test.js', CLIENT);

// 7.4 Coaching API Integration
run('7.4  Coaching API integration', 'npx vitest run __tests__/coach.test.js', SERVER);

// 7.5 Component Smoke Tests
run('7.5  Component smoke tests', 'npx vitest run src/components/__tests__/Components.smoke.test.jsx', CLIENT);

// 7.6 API Contract
run('7.6  API contract (sessions)', 'npx vitest run __tests__/sessions.test.js', SERVER);

// 7.7 Privacy Verification
run('7.7  Privacy verification', 'npx vitest run src/__tests__/Privacy.test.js', CLIENT);

// 7.8 Startup Smoke Test
run('7.8  Startup smoke test', 'npx vitest run __tests__/startup.test.js', SERVER);

// Summary table
console.log('\n');
console.log('╔══════════════════════════════════════╦════════╗');
console.log('║ Verification Step                     ║ Status ║');
console.log('╠══════════════════════════════════════╬════════╣');
for (const r of results) {
  const label = r.label.padEnd(38);
  const status = r.status === 'PASS' ? '\x1b[32mPASS\x1b[0m  ' : '\x1b[31mFAIL\x1b[0m  ';
  console.log(`║ ${label}║ ${status}║`);
}
console.log('╚══════════════════════════════════════╩════════╝');

const passed = results.filter(r => r.status === 'PASS').length;
const total = results.length;
console.log(`\n${passed}/${total} checks passed.\n`);

if (passed < total) {
  console.log('FAILED checks:');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  - ${r.label}`);
    if (r.detail) console.log(`    ${r.detail}`);
  }
  process.exit(1);
}

console.log('\x1b[32mAll Phase 7 verification checks passed.\x1b[0m\n');
