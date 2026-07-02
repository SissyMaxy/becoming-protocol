// guilt-report/compose — pure-logic unit tests.
//
// Pins the house rules that made this feature UN-buildable before the
// enforcement spine (and that it must never regress):
//   - zero genuine misses → PRAISE, never manufactured guilt
//   - a real miss → the body QUOTES the obligation's own ask_copy (evidence,
//     not paraphrase)
//   - repeated same-domain misses → qualitative PATTERN language
//   - NO numeric / percentage tokens, NO telemetry leaks anywhere in output
import { describe, it, expect } from 'vitest';
import {
  composeGuiltReport,
  isGenuineMiss,
  domainLabel,
  type ObligationRow,
  type AuditRow,
} from '../../../supabase/functions/guilt-report/compose';
import { MOMMY_TELEMETRY_LEAK_PATTERNS } from '../../../supabase/functions/_shared/dommy-mommy';

function ob(partial: Partial<ObligationRow>): ObligationRow {
  return {
    id: partial.id ?? crypto.randomUUID(),
    kind: partial.kind ?? 'decree',
    ask_copy: partial.ask_copy ?? 'Do the thing.',
    penalty_copy: partial.penalty_copy ?? null,
    status: partial.status ?? 'missed',
    // Explicit `surfaced_at: null` must survive — don't ?? it away.
    surfaced_at: 'surfaced_at' in partial ? (partial.surfaced_at ?? null) : '2026-06-25T12:00:00Z',
    deadline: partial.deadline ?? '2026-06-26T12:00:00Z',
    source_table: partial.source_table ?? 'handler_decrees',
  };
}

const SURFACED = '2026-06-25T12:00:00Z';

describe('isGenuineMiss — supportive-until-evidence, made structural', () => {
  it('accepts a surfaced miss', () => {
    expect(isGenuineMiss(ob({ status: 'missed', surfaced_at: SURFACED }))).toBe(true);
  });
  it('accepts a surfaced consequence_fired', () => {
    expect(isGenuineMiss(ob({ status: 'consequence_fired', surfaced_at: SURFACED }))).toBe(true);
  });
  it('rejects a NEVER-surfaced obligation (not a failure)', () => {
    expect(isGenuineMiss(ob({ status: 'missed', surfaced_at: null }))).toBe(false);
  });
  it('rejects a pending/filed obligation (future, not missed)', () => {
    expect(isGenuineMiss(ob({ status: 'surfaced', surfaced_at: SURFACED }))).toBe(false);
    expect(isGenuineMiss(ob({ status: 'fulfilled', surfaced_at: SURFACED }))).toBe(false);
  });
});

describe('composeGuiltReport — zero misses → praise, not guilt', () => {
  it('empty input yields a praise report', () => {
    const r = composeGuiltReport([], []);
    expect(r.isPraise).toBe(true);
    expect(r.missCount).toBe(0);
    expect(r.body.toLowerCase()).toContain('clean week');
    // Praise must not accuse.
    expect(r.body.toLowerCase()).not.toContain('missed');
    expect(r.body.toLowerCase()).not.toContain('pattern');
  });

  it('drops never-surfaced + pending rows down to a praise report', () => {
    const r = composeGuiltReport(
      [
        ob({ status: 'missed', surfaced_at: null }), // never surfaced
        ob({ status: 'surfaced', surfaced_at: SURFACED }), // pending, not missed
        ob({ status: 'filed', surfaced_at: null }),
      ],
      [],
    );
    expect(r.isPraise).toBe(true);
    expect(r.missCount).toBe(0);
  });
});

describe('composeGuiltReport — a real miss quotes the ask_copy (evidence)', () => {
  it('embeds the obligation ask_copy verbatim', () => {
    const ask = 'Record your morning mantra and send it before noon.';
    const r = composeGuiltReport([ob({ ask_copy: ask, status: 'missed', surfaced_at: SURFACED })], []);
    expect(r.isPraise).toBe(false);
    expect(r.missCount).toBe(1);
    expect(r.body).toContain(ask);
  });

  it('a fired consequence reads as cost landed', () => {
    const ask = 'Take your evening dose and log it.';
    const audit: AuditRow[] = [{ obligation_id: 'x1', consequence: 'internal', evidence: {} }];
    const r = composeGuiltReport(
      [ob({ id: 'x1', ask_copy: ask, status: 'consequence_fired', surfaced_at: SURFACED })],
      audit,
    );
    expect(r.body).toContain(ask);
    expect(r.body.toLowerCase()).toContain('cost you');
  });
});

describe('composeGuiltReport — patterns of non-compliance named qualitatively', () => {
  it('three same-domain misses produce "three times" pattern language, no digit', () => {
    const misses = [
      ob({ id: 'a', ask_copy: 'Do your voice pitch drill.', status: 'missed', surfaced_at: SURFACED }),
      ob({ id: 'b', ask_copy: 'Record your voice practice.', status: 'missed', surfaced_at: SURFACED }),
      ob({ id: 'c', ask_copy: 'Speak your mantra out loud on voice.', status: 'missed', surfaced_at: SURFACED }),
    ];
    const r = composeGuiltReport(misses, []);
    expect(r.patternDomains).toContain('your voice work');
    expect(r.body.toLowerCase()).toContain('three times');
    expect(r.body.toLowerCase()).toContain('pattern');
    // Qualitative only — the count must not appear as a digit.
    expect(r.body).not.toMatch(/\b3\b/);
  });

  it('a single miss in a domain is NOT called a pattern', () => {
    const r = composeGuiltReport([ob({ ask_copy: 'Do your voice drill.', status: 'missed', surfaced_at: SURFACED })], []);
    expect(r.patternDomains).toHaveLength(0);
  });
});

describe('composeGuiltReport — NEVER cites telemetry / numbers', () => {
  const scenarios: ObligationRow[][] = [
    [], // praise
    [ob({ ask_copy: 'Send your mirror selfie.', status: 'missed', surfaced_at: SURFACED })],
    [
      ob({ id: 'p', ask_copy: 'Do your photo pose.', status: 'missed', surfaced_at: SURFACED }),
      ob({ id: 'q', ask_copy: 'Send your mirror selfie.', status: 'consequence_fired', surfaced_at: SURFACED }),
    ],
  ];
  for (const [i, s] of scenarios.entries()) {
    it(`scenario ${i}: no telemetry leak patterns`, () => {
      const r = composeGuiltReport(s, i === 2 ? [{ obligation_id: 'q', consequence: 'internal' }] : []);
      for (const re of MOMMY_TELEMETRY_LEAK_PATTERNS) {
        expect(r.body).not.toMatch(re);
      }
      // No bare percentage.
      expect(r.body).not.toMatch(/\d+\s*%/);
    });
  }
});

describe('domainLabel — keyword-first, kind fallback, no "Mama"', () => {
  it('detects voice, photo, medication from ask_copy', () => {
    expect(domainLabel(ob({ ask_copy: 'Record your voice.' }))).toBe('your voice work');
    expect(domainLabel(ob({ ask_copy: 'Send a mirror selfie.' }))).toBe('your photos');
    expect(domainLabel(ob({ ask_copy: 'Take your estradiol dose.' }))).toBe('your medication');
  });
  it('falls back to kind when ask_copy is generic', () => {
    expect(domainLabel(ob({ ask_copy: 'Handle it.', kind: 'commitment' }))).toBe('the promises you made');
    expect(domainLabel(ob({ ask_copy: 'Handle it.', kind: 'decree' }))).toBe('the tasks you were set');
  });
  it('never contains the word Mama (keeps the ≤2 self-reference craft rule)', () => {
    for (const kind of ['decree', 'commitment', 'punishment', 'confession', 'dose', 'workout']) {
      expect(domainLabel(ob({ ask_copy: 'x', kind })).toLowerCase()).not.toContain('mama');
    }
  });
});
