// Regression guard: gated generators in protocol-health-check must be marked
// `conditional: true`.
//
// Bug (2026-06-24): wardrobe_prescription, gina_disclosure, and gina_seed each
// CONTINUE to zero rows on most daily _eval runs by design — they're gated by
// pending-cooldowns (18h–14d), gap_min_days, readiness/arc-stage, and
// off-cooldown seed availability. With a 1440-min cadence the freshness window
// is only 48h, which they're quiet in by design. Without `conditional: true`
// the health check (every 6h) emitted a `warning` per zero-row check =
// 4/day × 7d ≈ 28 false supervisor nudges/week. The nudge-pattern-analyzer
// then mislabeled those `scheduling_conflict` and filed re-stagger fix-wishes
// (wishes 083dbe62 / 2af5b94e / c0cdedc2) for crons that were firing fine.
// Re-staggering would change nothing; the staleness detector was wrong.
//
// This guard parses the GENERATORS list source and fails if any of these
// known-conditional generators loses its flag — so the false-nudge flood can't
// silently come back, and so a future escalator built on the nudge stream
// can't wrongly promote a healthy-but-gated worker to a replacement candidate.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const HEALTH_CHECK = join(ROOT, 'supabase', 'functions', 'protocol-health-check', 'index.ts');

// Generators whose _eval legitimately produces zero rows on most runs.
const MUST_BE_CONDITIONAL = ['wardrobe_prescription', 'gina_disclosure', 'gina_seed', 'cock_conditioning'];

describe('protocol-health-check conditional generators', () => {
  const src = readFileSync(HEALTH_CHECK, 'utf8');

  for (const name of MUST_BE_CONDITIONAL) {
    it(`'${name}' is flagged conditional so zero-row runs don't fire false nudges`, () => {
      // Grab the single GENERATORS line for this generator.
      const line = src.split('\n').find(l => l.includes(`name: '${name}'`) && l.includes('function_name'));
      expect(line, `GENERATORS entry for '${name}' not found`).toBeTruthy();
      expect(line, `'${name}' must set conditional: true`).toMatch(/conditional:\s*true/);
    });
  }
});
