// Mommy-led body program — weekday-locked split, warm-up/cooldown phases,
// progression, MVW downshift, and in-voice commands that never leak telemetry
// or carve-out language.

import { describe, it, expect } from 'vitest';
import {
  bodyProgramDay, bodyOrderForTarget, minimumViableOrder, MVW_RECOVERY_FLOOR,
  type BodyOrder,
} from '../../lib/body-program';
import { assertMommyOrderBite } from '../../lib/mommy-orders';

// 2026-07-13 is a Monday — the split is weekday-locked, so tests anchor there.
const START = '2026-07-13';
const day = (iso: string): BodyOrder => bodyProgramDay(START, iso);

describe('body program — the weekday-locked split', () => {
  it('before the start date, issues the baseline kickoff (mirror shot due)', () => {
    const o = day('2026-07-12');
    expect(o.dayIndex).toBeLessThan(0);
    expect(o.kind).toBe('measure');
    expect(o.proofKind).toBe('photo');
    expect(o.command.toLowerCase()).toContain('tomorrow you start');
  });

  it('Monday is Lower A — a train day with timer proof', () => {
    const o = day('2026-07-13');
    expect(o.kind).toBe('train');
    expect(o.sessionName).toBe('Lower A');
    expect(o.proofKind).toBe('timer');
    expect(o.blocks.some(b => b.move === 'Hip thrusts')).toBe(true);
  });

  it('Wednesday is Lower B and Friday is the heavy Glute focus', () => {
    expect(day('2026-07-15').sessionName).toBe('Lower B');
    expect(day('2026-07-17').sessionName).toBe('Glute focus');
  });

  it('runs 3 train / 3 fuel / 1 rest across a calendar week', () => {
    const kinds = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19']
      .map((d) => day(d).kind);
    expect(kinds.filter((k) => k === 'train')).toHaveLength(3);   // Mon / Wed / Fri
    expect(kinds.filter((k) => k === 'fuel')).toHaveLength(3);    // Tue / Thu / Sun
    expect(kinds.filter((k) => k === 'rest')).toHaveLength(1);    // Sat
  });

  it('locks the split to the weekday even when the program starts mid-week', () => {
    // Start Thursday 2026-07-16: the very next day is still Friday = Glute focus.
    const o = bodyProgramDay('2026-07-16', '2026-07-17');
    expect(o.kind).toBe('train');
    expect(o.sessionName).toBe('Glute focus');
    // And the following Monday is Lower A.
    expect(bodyProgramDay('2026-07-16', '2026-07-20').sessionName).toBe('Lower A');
  });

  it('rest day is Saturday, on Mommy\'s orders, and needs no proof', () => {
    const o = day('2026-07-18');
    expect(o.kind).toBe('rest');
    expect(o.proofKind).toBe('none');
    expect(o.command.toLowerCase()).toMatch(/rest today/);
  });

  it('drops a progress-shot measure day every second Sunday', () => {
    const wk1sun = day('2026-07-19'); // week 1 Sunday → fuel
    const wk2sun = day('2026-07-26'); // week 2 Sunday → measure
    expect(wk1sun.kind).toBe('fuel');
    expect(wk2sun.kind).toBe('measure');
    expect(wk2sun.proofKind).toBe('photo');
  });
});

describe('body program — warm-up and cooldown wrap every train day', () => {
  const trainDays = ['2026-07-13', '2026-07-15', '2026-07-17'];

  it('train days carry warmup and cooldown phase blocks around the main work', () => {
    for (const d of trainDays) {
      const o = day(d);
      const phases = o.blocks.map(b => b.phase ?? 'main');
      expect(phases.filter(p => p === 'warmup').length).toBeGreaterThanOrEqual(2);
      expect(phases.filter(p => p === 'cooldown').length).toBeGreaterThanOrEqual(2);
      expect(phases.filter(p => p === 'main').length).toBeGreaterThanOrEqual(3);
      // Ordered: all warmups before all mains before all cooldowns.
      expect(phases.join(',')).toMatch(/^(warmup,)+(main,)+(cooldown,?)+$/);
    }
  });

  it('fuel, rest, and measure days have no phased blocks', () => {
    for (const d of ['2026-07-14', '2026-07-18', '2026-07-26']) {
      const o = day(d);
      expect(o.blocks.every(b => b.phase === undefined)).toBe(true);
    }
  });
});

describe('body program — progression climbs', () => {
  const hipThrusts = (iso: string) =>
    day(iso).blocks.find(b => b.move.startsWith('Hip thrusts'))!.prescription;

  it('weeks 1–2 are 3 sets, week 3+ is 4 sets', () => {
    expect(hipThrusts('2026-07-13')).toContain('3 × '); // week 1
    expect(hipThrusts('2026-07-27')).toContain('4 × '); // week 3 Monday
  });

  it('week 1 is bodyweight; later weeks add load', () => {
    expect(hipThrusts('2026-07-13').toLowerCase()).toContain('bodyweight');
    expect(hipThrusts('2026-07-27').toLowerCase()).toMatch(/more than last week|add a little/);
  });
});

describe('body program — minimum-viable downshift', () => {
  it('swaps a train day down to ten bridges, keeping timer proof', () => {
    const o = minimumViableOrder(day('2026-07-13'));
    expect(o.kind).toBe('train');
    expect(o.proofKind).toBe('timer');
    expect(o.blocks).toHaveLength(1);
    expect(o.blocks[0].move).toBe('Glute bridges');
    expect(o.command.toLowerCase()).toContain('ten');
  });

  it('never explains the calibration in telemetry terms', () => {
    const c = minimumViableOrder(day('2026-07-13')).command;
    expect(c).not.toMatch(/recover(y|ies)\s*(score|%|\d)/i);
    expect(c).not.toMatch(/\d+\s*\/\s*10/);
    expect(assertMommyOrderBite(c)).toEqual({ ok: true });
  });

  it('passes non-train days through untouched', () => {
    const fuel = day('2026-07-14');
    expect(minimumViableOrder(fuel)).toBe(fuel);
  });

  it('exposes the WHOOP red-zone floor as the trigger threshold', () => {
    expect(MVW_RECOVERY_FLOOR).toBe(34);
  });
});

describe('body program — target integration seam', () => {
  it('returns today\'s order for a body-conditioning target', () => {
    const o = bodyOrderForTarget(
      { program: 'body_conditioning', split: 'lower_led_3x', program_start: START },
      '2026-07-13',
    );
    expect(o?.sessionName).toBe('Lower A');
  });

  it('returns null for a non-body target or missing start', () => {
    expect(bodyOrderForTarget({ program: 'reconditioning' }, '2026-07-13')).toBeNull();
    expect(bodyOrderForTarget({ program: 'body_conditioning' }, '2026-07-13')).toBeNull();
    expect(bodyOrderForTarget(null, '2026-07-13')).toBeNull();
  });
});

describe('body program — in-voice, no telemetry, no carve-outs', () => {
  const sampleDays = [
    '2026-07-12', '2026-07-13', '2026-07-15', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-26', '2026-07-27',
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
    expect(assertMommyOrderBite(minimumViableOrder(day('2026-07-13')).command)).toEqual({ ok: true });
  });
});
