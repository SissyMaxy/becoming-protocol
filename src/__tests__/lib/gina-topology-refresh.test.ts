/**
 * Regression guard — the Gina topology map has a REAL, Maxy-sourced writer and
 * stays alive, while the ONE hard line holds: nothing here ever reaches out to
 * Gina.
 *
 * Operator directive 2026-07-16: "Use whatever we can to map the Gina topology
 * and cultivation as this feeds into mommy's goals long term. We just want to
 * prevent mommy from ever reaching out to Gina directly."
 *
 * Two guarantees this suite locks in (migration 686):
 *   1. The map is fed ONLY by Maxy's own logged observations (gina_vibe_captures)
 *      and the fold writer mutates gina_topology_dimensions and NOTHING else —
 *      it is structurally incapable of emitting to any Gina-facing surface.
 *   2. gina_topology_freshness is meaningful and non-gameable: it fails on a
 *      real observation backlog, not a bare wall-clock timer.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const MIG_PATH = ['supabase', 'migrations', '686_gina_topology_refresh_writer.sql'];
const MIG = read(...MIG_PATH);

/** Isolate the fold-writer function body so we can assert exactly what it touches. */
function foldFnBody(): string {
  const m = MIG.match(/CREATE OR REPLACE FUNCTION public\.trg_fold_vibe_into_topology[\s\S]*?\$\$;/);
  if (!m) throw new Error('trg_fold_vibe_into_topology function not found in mig 686');
  return m[0];
}

describe('mig 686 wires a real, Maxy-sourced topology writer', () => {
  it('the migration exists', () => {
    expect(existsSync(join(ROOT, ...MIG_PATH))).toBe(true);
  });

  it('adds the dimension column + fold trigger on gina_vibe_captures', () => {
    expect(MIG).toMatch(/ALTER TABLE gina_vibe_captures ADD COLUMN IF NOT EXISTS dimension/);
    expect(MIG).toMatch(/CREATE TRIGGER fold_vibe_into_topology[\s\S]*?ON gina_vibe_captures/);
  });

  it('the writer reads a Maxy observation and writes ONLY the topology map', () => {
    const body = foldFnBody();
    expect(body).toMatch(/NEW\.(topology_implication|her_words|her_action|signal_class|captured_at|dimension)/);
    expect(body).toMatch(/UPDATE gina_topology_dimensions/);
  });

  it('backfills the three historical captures into the map', () => {
    expect(MIG).toMatch(/UPDATE gina_vibe_captures\s+SET dimension = 'aesthetic_feminization'/);
  });
});

describe('the topology writer can NEVER reach out to Gina (hard line)', () => {
  const body = foldFnBody();

  // No Gina-facing delivery / decree / witness / disclosure surface may appear
  // anywhere in the writer body.
  const FORBIDDEN_SURFACES = [
    'handler_outreach_queue',
    'handler_decrees',
    'handler_commitments',
    'witness_notifications',
    'designated_witnesses',
    'gina_disclosure_schedule',
    'gina_disclosure_events',
    'disclosure_drafts',
    'coming_out_letters',
    'partner_disclosures',
    'gina_access_tokens',
    'gina_capability_grants',
    'punishment_queue',
  ];
  for (const t of FORBIDDEN_SURFACES) {
    it(`fold writer does not touch ${t}`, () => {
      expect(body).not.toMatch(new RegExp(t));
    });
  }

  it('the fold writer emits no INSERT at all (a map refresh is an UPDATE)', () => {
    expect(body).not.toMatch(/\bINSERT\b/i);
  });

  it('does not weaken migration 624 (the disclosure block stays intact)', () => {
    const mig624 = read('supabase', 'migrations', '624_remove_gina_disclosure.sql');
    expect(mig624).toMatch(/block_gina_disclosure_insert/);
    expect(MIG).not.toMatch(/DROP TRIGGER[^\n]*block_insert_gina_disclosure/);
    expect(MIG).not.toMatch(/DROP FUNCTION[^\n]*block_gina_disclosure_insert/);
  });
});

describe('gina_topology_freshness is meaningful, not a bare wall-clock', () => {
  it('grades on unprocessed observations (a real backlog), not a 30-day timer', () => {
    expect(MIG).toMatch(/unprocessed/);
    expect(MIG).toMatch(/v\.captured_at > dd\.updated_at/);
    // the old bare-timer form must be gone from the topology block
    expect(MIG).not.toMatch(/'gina_topology_freshness'[\s\S]{0,200}max\(updated_at\) > now\(\) - interval '30 days'/);
  });

  it('preserves the other six v3.1 freshness invariants verbatim', () => {
    expect(MIG).toMatch(/CREATE OR REPLACE FUNCTION public\.check_v31_freshness/);
    for (const inv of [
      'gina_vibe_capture_freshness', 'identity_dimensions_freshness',
      'merge_pipeline_progression', 'david_suppression_terms_present',
      'sanctuary_cadence', 'held_evidence_reserve_depth',
    ]) {
      expect(MIG, `mig 686 must preserve ${inv}`).toMatch(new RegExp(`'${inv}'`));
    }
  });
});
