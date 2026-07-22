// Conditioning experiment registry (mig 703) — the pre-registration floor.
//
// The registry's whole value is falsifiability discipline: every card states
// a concrete kill criterion BEFORE it runs, verdicts keep adherence and
// efficacy separate, and nothing here can ever reach a user surface.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SQL = readFileSync('supabase/migrations/703_conditioning_experiment_registry.sql', 'utf8');

describe('experiment registry — verdict machine (mig 703)', () => {
  it('every verdict the review fn assigns is in the CHECK enum', () => {
    const checkMatch = SQL.match(/verdict\s+text NOT NULL\s+CHECK \(verdict IN \(([^)]+)\)\)/);
    expect(checkMatch).not.toBeNull();
    const allowed = new Set([...checkMatch![1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
    const assigned = [...SQL.matchAll(/v_verdict := '([a-z_]+)'/g)].map(m => m[1]);
    expect(assigned.length).toBeGreaterThanOrEqual(5);
    for (const v of assigned) expect(allowed.has(v), v).toBe(true);
  });

  it('adherence and efficacy are separate claims — adherence_limited exists and never judges the mechanic', () => {
    expect(SQL).toContain("'adherence_limited'");
    expect(SQL).toMatch(/adherence problem, not an efficacy one/);
  });

  it('dry-spell rule: zero measurements is dead_loop, never presumed healthy', () => {
    expect(SQL).toMatch(/v_measured = 0[\s\S]{0,120}dead_loop/);
  });

  it('telemetry wall: verdicts WRITE only to the supervisor log, never a user surface', () => {
    const fnStart = SQL.indexOf('conditioning_experiment_review()');
    const fnBody = SQL.slice(fnStart, SQL.indexOf('GRANT EXECUTE ON FUNCTION public.conditioning_experiment_review'));
    expect(fnBody).toContain('INSERT INTO mommy_supervisor_log');
    // Reading handler_outreach_queue (adherence counting) is fine; WRITING
    // to any user-facing surface is the wall violation.
    expect(fnBody).not.toMatch(/INSERT INTO handler_outreach_queue/);
    expect(fnBody).not.toMatch(/INSERT INTO handler_decrees/);
  });

  it('no consequence machinery — a bad verdict re-presents, never penalizes', () => {
    for (const banned of ['slip_log', 'penalty', 'consequence', 'chastity_scheduled_unlock_at']) {
      const fnStart = SQL.indexOf('conditioning_experiment_review()');
      const fnBody = SQL.slice(fnStart, SQL.indexOf('GRANT EXECUTE'));
      expect(fnBody.toLowerCase().includes(banned), banned).toBe(false);
    }
  });
});

describe('experiment registry — seeded cards are honestly pre-registered', () => {
  const seedStart = SQL.indexOf('INSERT INTO public.conditioning_experiments');
  const seeds = SQL.slice(seedStart);

  it('seeds exactly three cards for the mechanics running today', () => {
    const slugs = [...seeds.matchAll(/'(plug-orgasm-ladder|turnout-ambient-saturation|costume-recon-program)'/g)];
    expect(slugs.length).toBe(3);
  });

  it('every kill criterion is concrete — names a number and an action', () => {
    const kills = [...seeds.matchAll(/'(Flat[^']+)'/g)].map(m => m[1]);
    expect(kills.length).toBe(3);
    for (const k of kills) {
      expect(/\d/.test(k), k.slice(0, 60)).toBe(true);
      expect(/rotate|retire|inconclusive/i.test(k), k.slice(0, 60)).toBe(true);
    }
  });

  it('cards register real delivery sources', () => {
    expect(seeds).toContain("'physical_practice:plug_orgasm:%'");
    expect(seeds).toContain("'ambient_saturation:to_%'");
  });
});
