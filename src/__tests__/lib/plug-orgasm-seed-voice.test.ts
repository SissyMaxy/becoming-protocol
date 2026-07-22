// plug_orgasm training track (mig 701) — seed content is clean.
//
// Third track on the 011 physical-practice ladder: hands-free training on the
// owned Hush plugs. Same floor as the 680 seeds: solo/own-body, no real-person
// element, veto preserved, no telemetry, Male+ voice — plus track-specific
// invariants: only owned devices named, cage never removed, closeness rating
// asked on every rung (it feeds the recon measurement loop).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasRealPersonElement, hasVetoOverride } from '../../lib/conditioning/physical-practice';

const SQL = readFileSync('supabase/migrations/701_plug_orgasm_training_track.sql', 'utf8');

// Edicts are authored apostrophe-free, so the edict is the longest quoted
// span in each seeded row tuple (same extraction as the 680 seed test).
function seededEdicts(sql: string): string[] {
  const start = sql.indexOf('INSERT INTO public.physical_practice_rungs');
  const body = start >= 0 ? sql.slice(start) : sql;
  const rowRe = /\(\s*'plug_orgasm'[\s\S]*?\)(?=\s*(?:,|;|ON CONFLICT))/gi;
  const edicts: string[] = [];
  for (const m of body.match(rowRe) ?? []) {
    const quoted = m.match(/'((?:[^']|'')*)'/g) ?? [];
    const longest = quoted
      .map((q) => q.slice(1, -1))
      .sort((a, b) => b.length - a.length)[0];
    if (longest) edicts.push(longest);
  }
  return edicts;
}

describe('plug_orgasm — seeded edicts are clean (mig 701)', () => {
  const edicts = seededEdicts(SQL);

  it('seeds all 5 rungs', () => {
    expect(edicts.length).toBe(5);
  });

  it('no edict carries a real-person element', () => {
    for (const e of edicts) expect(hasRealPersonElement(e), e.slice(0, 60)).toBe(false);
  });

  it('no edict targets the safety-veto', () => {
    for (const e of edicts) expect(hasVetoOverride(e), e.slice(0, 60)).toBe(false);
  });

  it('no edict carries telemetry (scores / day-counts / percentages)', () => {
    const telemetry = /\/10\b|\bday\s+\d+\b|\bdenial\s+day\b|\b\d+%|\bscore\b/i;
    for (const e of edicts) expect(telemetry.test(e), e.slice(0, 60)).toBe(false);
  });

  it('no regendering in edicts (Male+ voice)', () => {
    const regender = /\b(good girl|girl|woman|she|her|hers|sissy girl)\b/i;
    for (const e of edicts) expect(regender.test(e), e.slice(0, 60)).toBe(false);
  });

  it('only owned devices are named (small + medium Hush, never large)', () => {
    for (const e of edicts) {
      expect(/\blarge\b/i.test(e), e.slice(0, 60)).toBe(false);
    }
    const propRe = /'(hush_small|hush_medium)'/g;
    const props = SQL.match(propRe) ?? [];
    expect(props.length).toBe(5);
  });

  it('hands stay off and the cage stays on — no manual-stimulation instruction', () => {
    const manual = /\bstroke\b|\bjerk\b|\bwith your hand\b|\bunlock\b|\btake the cage off\b/i;
    for (const e of edicts) expect(manual.test(e), e.slice(0, 60)).toBe(false);
  });

  it('every rung asks for the closeness rating (the measurement hook)', () => {
    for (const e of edicts) {
      expect(/clos(e|eness)/i.test(e), e.slice(0, 60)).toBe(true);
    }
  });
});

describe('plug_orgasm — wiring invariants (mig 701)', () => {
  it('widens BOTH track CHECKs (rungs + progress)', () => {
    const widened = SQL.match(/'plug_orgasm'::text\]\)\)/g) ?? [];
    expect(widened.length).toBe(2);
  });

  it('closeness trigger feeds arousal_is_the_becoming with a first-log baseline', () => {
    expect(SQL).toContain("slug = 'arousal_is_the_becoming'");
    expect(SQL).toContain("'sissygasm_closeness'");
    expect(SQL).toContain('NOT v_has_baseline');
  });

  it('measurement payload is numeric-only (no quoted user text)', () => {
    expect(SQL).not.toContain('content_captured');
  });
});
