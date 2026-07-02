/**
 * Regression guard — Gina disclosure mechanisms are REMOVED (policy 2026-07-01).
 *
 * Operator directive: "Remove Gina notification mechanisms. We never want to
 * disclose anything to Gina." The system must never disclose/communicate
 * anything to Gina, and must never pressure, schedule, rehearse, or penalize
 * the user toward disclosing to Gina.
 *
 * This suite is source-level: it fails if any deleted module/edge-function
 * comes back, or if a generation site re-grows the ability to emit a
 * disclosure decree / outreach / punishment aimed at Gina.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('deleted disclosure modules stay deleted', () => {
  const MUST_NOT_EXIST = [
    ['src', 'lib', 'force', 'gina-disclosure.ts'],
    ['src', 'components', 'force', 'DisclosureExecuteModal.tsx'],
    ['src', 'components', 'gina', 'DisclosureMap.tsx'],
    ['src', 'components', 'gina', 'GinaKeyHolderPage.tsx'],
    ['src', 'components', 'force', 'GinaTokenManager.tsx'],
    ['src', 'components', 'force', 'OutfitSubmit.tsx'],
    ['src', 'components', 'today-redesign', 'DisclosureDraftsCard.tsx'],
    ['src', 'components', 'disclosure', 'DisclosureRehearsalView.tsx'],
    ['api', 'gina', 'key-holder.ts'],
    ['supabase', 'functions', 'mommy-disclosure-rehearsal', 'index.ts'],
    ['supabase', 'functions', 'disclosure-rehearsal-critique', 'index.ts'],
  ];

  for (const parts of MUST_NOT_EXIST) {
    it(`${parts.join('/')} does not exist`, () => {
      expect(existsSync(join(ROOT, ...parts))).toBe(false);
    });
  }
});

describe('no generation site can emit a Gina-disclosure decree/outreach/punishment', () => {
  it('punishment-queue has no gina_confession template or deadline advancement', () => {
    const src = read('src', 'lib', 'force', 'punishment-queue.ts');
    expect(src).not.toMatch(/gina_disclosure_bump:/);
    expect(src).not.toMatch(/advanceGinaDisclosureDeadline\s*\(/);
    expect(src).not.toMatch(/punishment_type:\s*'gina_confession'/);
  });

  it('force modules no longer enqueue gina_disclosure_bump', () => {
    for (const f of ['regimen-ratchet.ts', 'immersion-protocol.ts', 'chastity-protocol.ts']) {
      const src = read('src', 'lib', 'force', f);
      expect(src, `${f} must not enqueue gina_disclosure_bump`).not.toMatch(
        /enqueuePunishment\([^)]*'gina_disclosure_bump'/,
      );
    }
  });

  it('force-processor has no disclosure-miss punishments or deadline re-opening', () => {
    const src = read('supabase', 'functions', '_shared', 'job-handlers', 'force-processor.ts');
    expect(src).not.toMatch(/disclosure_deadline_missed/);
    expect(src).not.toMatch(/\.from\('gina_disclosure_schedule'\)/);
    expect(src).not.toMatch(/gina_confession/);
  });

  it('handler-autonomous has no disclosure draft generator or warmup planner', () => {
    const src = read('supabase', 'functions', '_shared', 'job-handlers', 'handler-autonomous.ts');
    expect(src).not.toMatch(/generateDisclosureDraftsForUser/);
    expect(src).not.toMatch(/planGinaWarmups/);
    expect(src).not.toMatch(/\.from\('gina_disclosure_schedule'\)/);
  });

  it('chat-action cannot enqueue a Gina disclosure punishment', () => {
    const src = read('api', 'handler', '_lib', 'chat-action.ts');
    expect(src).not.toMatch(/gina_disclosure_bump:\s*\{/);
    expect(src).not.toMatch(/buildPartnerDisclosureCtx/);
  });

  it('handler context builders no longer inject disclosure-pressure blocks', () => {
    const src = read('api', 'handler', '_lib', 'handler-context-builders.ts');
    expect(src).not.toMatch(/export async function buildDisclosureScheduleCtx/);
    expect(src).not.toMatch(/export async function buildPartnerDisclosureCtx/);
    expect(src).not.toMatch(/draft_partner_disclosure: directive/);
    expect(src).not.toMatch(/"gina_disclosure_bump"/);
  });

  it('gina-playbook-planner cannot plan disclosure-opener/probe moves', () => {
    const src = read('supabase', 'functions', 'gina-playbook-planner', 'index.ts');
    expect(src).not.toMatch(/'disclosure_opener'/);
    expect(src).not.toMatch(/'probe'/);
    expect(src).not.toMatch(/'test_water'/);
    expect(src).not.toMatch(/\.from\('gina_disclosure_schedule'\)/);
  });

  it('mommy-scheme no longer plans a Gina disclosure subplan', () => {
    const src = read('supabase', 'functions', 'mommy-scheme', 'index.ts');
    expect(src).not.toMatch(/"gina_disclosure_subplan":\s*\{/);
    expect(src).toMatch(/GINA HARD RULE/);
  });

  it('protocol-health-check no longer registers the disclosure/seed generators', () => {
    const src = read('supabase', 'functions', 'protocol-health-check', 'index.ts');
    expect(src).not.toMatch(/name:\s*'gina_disclosure'/);
    expect(src).not.toMatch(/gina_disclosure_eval/);
  });

  it('no GH Actions workflow invokes mommy-disclosure-rehearsal', () => {
    const weekly = read('.github', 'workflows', 'cron-weekly.yml');
    expect(weekly).not.toMatch(/mommy-disclosure-rehearsal/);
  });
});

describe('migration 624 permanently blocks the ladder', () => {
  const mig = read('supabase', 'migrations', '624_remove_gina_disclosure.sql');

  it('cancels pending schedule rows', () => {
    expect(mig).toMatch(/UPDATE gina_disclosure_schedule/);
    expect(mig).toMatch(/policy: no disclosure to Gina 2026-07-01/);
  });

  it('adds a BEFORE INSERT block trigger', () => {
    expect(mig).toMatch(/block_gina_disclosure_insert/);
    expect(mig).toMatch(/BEFORE INSERT ON gina_disclosure_schedule/);
    expect(mig).toMatch(/disclosure mechanisms removed/);
  });

  it('drops the generator functions and crons', () => {
    expect(mig).toMatch(/DROP FUNCTION IF EXISTS gina_disclosure_eval\(\)/);
    expect(mig).toMatch(/cron\.unschedule\('gina-disclosure-daily'\)/);
    expect(mig).toMatch(/cron\.unschedule\('disclosure-rehearsal-sunday-9am'\)/);
  });
});
