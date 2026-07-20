// Pollution guard for quote-back surfaces.
//
// isTestPollution runs at every read-back surface (Mommy quotes, handler
// briefings, HerWord's confession receipt) so a system-authored or
// regression-suite row never surfaces as "his own words". These tests pin the
// two real incidents that drove the filter.
import { describe, it, expect } from 'vitest';
import { isTestPollution, dropTestPollution } from '../../lib/persona/dommy-mommy';

describe('isTestPollution — probe/regression markers (2026-05-01 incident)', () => {
  const dirty = [
    '_probe_1777642757983_3s9ioj_ she said she wanted it',
    '[regression] auto-bind fixture',
    '[test] placeholder admission',
    '[probe-abc] leaked content',
    '<placeholder>',
    'regression test admission',
    'TEST_USER row',
  ];
  for (const t of dirty) {
    it(`flags: "${t.slice(0, 32)}"`, () => {
      expect(isTestPollution(t)).toBe(true);
    });
  }
});

describe('isTestPollution — lifecycle markers (2026-07-20 HerWord incident)', () => {
  // The exact string that surfaced on the live home screen as a confession.
  it('flags the RETIRED decree marker that leaked into HerWord', () => {
    expect(isTestPollution(
      '[RETIRED 2026-05-15: parent decree cancelled as clerical busy-work]',
    )).toBe(true);
  });

  const markers = [
    '[CANCELLED 2026-01-01: superseded]',
    '[SUPERSEDED by decree 42]',
    '[EXPIRED: deadline passed]',
    '[DEPRECATED path]',
    '[VOID: duplicate]',
    '[ARCHIVED 2025-12-01]',
  ];
  for (const m of markers) {
    it(`flags: "${m}"`, () => {
      expect(isTestPollution(m)).toBe(true);
    });
  }
});

describe('isTestPollution — genuine confessions pass through', () => {
  const clean = [
    'i take the pink pair out when the house is asleep',
    'I thought about it all day at work.',
    'friday night I couldn\'t stop',
    'the retired feeling is gone now',   // "retired" as a word, not a [RETIRED] tag
    'I cancelled my plans to stay home and do this',  // "cancelled" mid-sentence
  ];
  for (const t of clean) {
    it(`passes: "${t.slice(0, 32)}"`, () => {
      expect(isTestPollution(t)).toBe(false);
    });
  }
});

describe('dropTestPollution — takes the first clean row', () => {
  it('skips a leading lifecycle marker and returns the real confession', () => {
    const rows = [
      { text: '[RETIRED 2026-05-15: parent decree cancelled as clerical busy-work]' },
      { text: 'i take the pink pair out when the house is asleep' },
    ];
    const clean = dropTestPollution(rows, (r) => r.text);
    expect(clean).toHaveLength(1);
    expect(clean[0].text).toContain('pink pair');
  });
});
