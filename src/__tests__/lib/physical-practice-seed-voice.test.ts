// Physical practice ladder — seed content is clean (the copy the prescriber
// ships comes from these seeded rows). Every seeded edict must pass the container
// gates and carry no telemetry. Source of truth: mig 680.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasRealPersonElement, hasVetoOverride } from '../../lib/conditioning/physical-practice';

const SQL = readFileSync('supabase/migrations/680_physical_practice_ladder.sql', 'utf8');

// Pull the edict_template (7th quoted value) out of each seeded VALUES tuple.
// The edicts are authored apostrophe-free, so single-quote splitting is safe.
function seededEdicts(sql: string): string[] {
  const start = sql.indexOf('INSERT INTO public.physical_practice_rungs');
  const body = start >= 0 ? sql.slice(start) : sql;
  // Each row: ('track', n, 'slug', 'title', 'prop'|NULL, 'focus', 'EDICT', ...)
  // Row tuple closes on `)` followed by a comma, a semicolon, or ON CONFLICT.
  const rowRe = /\(\s*'(?:oral|bottoming)'[\s\S]*?\)(?=\s*(?:,|;|ON CONFLICT))/gi;
  const edicts: string[] = [];
  for (const m of body.match(rowRe) ?? []) {
    const quoted = m.match(/'((?:[^']|'')*)'/g) ?? [];
    // index 0=track,1=slug,2=title,3=prop(or NULL not quoted),4=focus,5=edict...
    // prop can be NULL (unquoted), so locate the edict as the longest quoted span.
    const longest = quoted
      .map((q) => q.slice(1, -1))
      .sort((a, b) => b.length - a.length)[0];
    if (longest) edicts.push(longest);
  }
  return edicts;
}

describe('physical practice — seeded edicts are clean', () => {
  const edicts = seededEdicts(SQL);

  it('seeds all 11 rungs', () => {
    expect(edicts.length).toBe(11);
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
});
