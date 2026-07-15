// Mommy-led body program — deterministic weekly split, progression, proof, and
// in-voice commands that never leak telemetry or carve-out language.

import { describe, it, expect } from 'vitest';
import { bodyProgramDay, bodyOrderForTarget, type BodyOrder } from '../../lib/body-program';
import { assertMommyOrderBite } from '../../lib/mommy-orders';

const START = '2026-07-14';
const day = (iso: string): BodyOrder => bodyProgramDay(START, iso);

describe('body program — the weekly split', () => {
  it('before the start date, issues the baseline kickoff (mirror shot due)', () => {
    const o = day('2026-07-13');
    expect(o.dayIndex).toBeLessThan(0);
    expect(o.kind).toBe('measure');
    expect(o.proofKind).toBe('photo');
    expect(o.command.toLowerCase()).toContain('tomorrow you start');
  });

  it('day 0 is Lower A — a train day with timer proof', () => {
    const o = day('2026-07-14');
    expect(o.kind).toBe('train');
    expect(o.sessionName).toBe('Lower A');
    expect(o.proofKind).toBe('timer');
    expect(o.blocks[0].move).toBe('Hip thrusts');
  });

  it('runs 3 train / 3 fuel / 1 rest across the cycle', () => {
    const kinds = ['2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-20']
      .map((d) => day(d).kind);
    expect(kinds.filter((k) => k === 'train')).toHaveLength(3);   // Lower A / B / Glute
    expect(kinds.filter((k) => k === 'fuel')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'rest')).toHaveLength(1);
  });

  it('rest day is on Mommy\'s orders and needs no proof', () => {
    const o = day('2026-07-19');
    expect(o.kind).toBe('rest');
    expect(o.proofKind).toBe('none');
    expect(o.command.toLowerCase()).toMatch(/rest today/);
  });

  it('drops a progress-shot measure day every second Sunday', () => {
    const wk1sun = day('2026-07-20'); // week 1 cycle-day 6 → fuel
    const wk2sun = day('2026-07-27'); // week 2 cycle-day 6 → measure
    expect(wk1sun.kind).toBe('fuel');
    expect(wk2sun.kind).toBe('measure');
    expect(wk2sun.proofKind).toBe('photo');
  });
});

describe('body program — progression climbs', () => {
  it('weeks 1–2 are 3 sets, week 3+ is 4 sets', () => {
    expect(day('2026-07-14').blocks[0].prescription).toContain('3 × '); // week 1
    expect(day('2026-07-28').blocks[0].prescription).toContain('4 × '); // week 3 Lower A
  });

  it('week 1 is bodyweight; later weeks add load', () => {
    expect(day('2026-07-14').blocks[0].prescription.toLowerCase()).toContain('bodyweight');
    expect(day('2026-07-28').blocks[0].prescription.toLowerCase()).toMatch(/more than last week|add a little/);
  });
});

describe('body program — target integration seam', () => {
  it('returns today\'s order for a body-conditioning target', () => {
    const o = bodyOrderForTarget(
      { program: 'body_conditioning', split: 'lower_led_3x', program_start: START },
      '2026-07-14',
    );
    expect(o?.sessionName).toBe('Lower A');
  });

  it('returns null for a non-body target or missing start', () => {
    expect(bodyOrderForTarget({ program: 'reconditioning' }, '2026-07-14')).toBeNull();
    expect(bodyOrderForTarget({ program: 'body_conditioning' }, '2026-07-14')).toBeNull();
    expect(bodyOrderForTarget(null, '2026-07-14')).toBeNull();
  });
});

describe('body program — in-voice, no telemetry, no carve-outs', () => {
  const sampleDays = [
    '2026-07-13', '2026-07-14', '2026-07-16', '2026-07-18', '2026-07-19', '2026-07-20', '2026-07-27', '2026-07-28',
  ];

  it('no command leaks a "day N" / /10 telemetry token', () => {
    for (const d of sampleDays) {
      const c = day(d).command;
      expect(c).not.toMatch(/\bday\s+\d/i);
      expect(c).not.toMatch(/\d+\s*\/\s*10/);
    }
  });

  it('every command commands (passes the mommy-order bite guard)', () => {
    for (const d of sampleDays) {
      expect(assertMommyOrderBite(day(d).command)).toEqual({ ok: true });
    }
  });
});
