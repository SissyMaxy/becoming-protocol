// Turnout identity-saturation (5b, mig 698) — seeded copy is clean.
//
// The clips and mantras this migration seeds are shipped verbatim to the user
// (ambient outreach + mantra delivery). Spec 011 addendum acceptance: desire-
// scoped only — the want, never a claimed past event, never procurement or
// meet-instruction, none of the five container-breakers, no telemetry.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCRIPT_BOUNDARY_PATTERNS } from '../../../supabase/functions/_shared/mommy-order-boundary';

const SQL = readFileSync('supabase/migrations/698_turnout_identity_saturation.sql', 'utf8');

// Seeded copy is authored with straight quotes and no SQL-escaped apostrophes
// ('' pairs), so plain single-quote spans are the literals.
function quotedSpans(sectionStart: string, sectionEnd: string): string[] {
  const start = SQL.indexOf(sectionStart);
  const end = SQL.indexOf(sectionEnd);
  const body = SQL.slice(start, end > start ? end : undefined);
  return (body.match(/'((?:[^']|'')*)'/g) ?? []).map((q) => q.slice(1, -1));
}

// Clip content: the long spans in the clips INSERT (short spans are keys/enums).
const clipTexts = quotedSpans(
  'INSERT INTO public.ambient_saturation_clips',
  '-- ── 3.',
).filter((s) => s.length > 60);

// Mantra lines: the long spans in the mantra INSERT.
const mantraTexts = quotedSpans('INSERT INTO public.mommy_mantras', 'WHERE NOT EXISTS')
  .filter((s) => s.length > 25);

describe('turnout saturation — seeded copy is clean (mig 698)', () => {
  it('extracts the expected seed counts', () => {
    expect(clipTexts.length).toBe(6);
    expect(mantraTexts.length).toBe(6);
  });

  const all = () => [...clipTexts, ...mantraTexts];

  it('no seeded line trips a container-breaker pattern', () => {
    for (const text of all()) {
      for (const re of SCRIPT_BOUNDARY_PATTERNS) {
        expect(re.test(text), `${re.source} :: ${text.slice(0, 60)}`).toBe(false);
      }
    }
  });

  it('desire-scoped: no claimed past real event', () => {
    // "you remember when", "last time you", "you already did/met/sucked" —
    // the retcon is authorized for WANT, never for events.
    const eventClaim = /\byou (remember|already (did|met|sucked|went))\b|\blast time you\b|\bthe (night|man) you (met|had)\b/i;
    for (const text of all()) expect(eventClaim.test(text), text.slice(0, 60)).toBe(false);
  });

  it('no procurement or meet-instruction', () => {
    const procure = /\b(go (meet|find)|message him|open (sniffies|grindr)|book (him|the room)|tonight you (meet|go))\b/i;
    for (const text of all()) expect(procure.test(text), text.slice(0, 60)).toBe(false);
  });

  it('no fabricated real status (active-med claims)', () => {
    const medClaim = /\byour (dose|estrogen|hormones) (is|are|has|have)\b|\bon (E|estrogen|HRT) now\b/i;
    for (const text of all()) expect(medClaim.test(text), text.slice(0, 60)).toBe(false);
  });

  it('no telemetry (scores / day-counts / percentages)', () => {
    const telemetry = /\/10\b|\bday\s+\d+\b|\bdenial\s+day\b|\b\d+%|\bscore\b/i;
    for (const text of all()) expect(telemetry.test(text), text.slice(0, 60)).toBe(false);
  });

  it('mantras are embodied, not empty (mig 434 class)', () => {
    // Every line carries a concrete referent (body/act/state), not bare
    // affirmation filler.
    for (const text of mantraTexts) {
      expect(text.length).toBeGreaterThan(20);
      expect(/\b(I|my|me|Mama)\b/i.test(text), text).toBe(true);
    }
  });

  it('voice craft: at most one pet name per line', () => {
    for (const text of all()) {
      const petCount = (text.match(/\b(baby|sweetheart|sweet (girl|thing)|darling|honey)\b/gi) ?? []).length;
      expect(petCount, text.slice(0, 60)).toBeLessThanOrEqual(1);
    }
  });
});

describe('turnout saturation — wiring invariants (mig 698)', () => {
  it('turnout_desire angle maps to the turnout target', () => {
    expect(SQL).toMatch(/WHEN 'turnout_desire'\s+THEN 'sex_work_is_who_i_am'/);
  });

  it('every seeded clip is tagged to the turnout target', () => {
    const tagCount = (SQL.match(/'sex_work_is_who_i_am'\)/g) ?? []).length;
    expect(tagCount).toBe(6);
  });

  it('fire_eval keeps the generic fallback pool (untagged behavior unchanged)', () => {
    expect(SQL).toContain('IF NOT v_have_clip THEN');
    expect(SQL).toMatch(/ORDER BY random\(\) LIMIT 1/);
  });
});
