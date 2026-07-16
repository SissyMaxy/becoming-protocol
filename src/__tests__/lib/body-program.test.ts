/**
 * body-program — the pure, deterministic workout-program day computer that
 * the home surface (BodyProgramCard) renders. Locks the cycle, the weekly
 * progression, and the pre-start kickoff so the engine can't silently drift.
 */
import { describe, it, expect } from 'vitest';
import { bodyProgramDay, bodyOrderForTarget } from '../../lib/body-program';

const START = '2026-07-16'; // a Thursday; the cycle is anchored to day 0, not weekday

// day 0 of the program (program_start itself)
const day = (n: number) => {
  const d = new Date(Date.parse(`${START}T00:00:00Z`) + n * 86_400_000);
  return d.toISOString().slice(0, 10);
};

describe('bodyProgramDay — the 7-day cycle', () => {
  it('before start → the baseline kickoff (progress shot)', () => {
    const o = bodyProgramDay(START, day(-1));
    expect(o.dayIndex).toBe(-1);
    expect(o.kind).toBe('measure');
    expect(o.sessionName).toBe('Baseline');
    expect(o.proofKind).toBe('photo');
  });

  it('maps each cycle day to the right session', () => {
    expect(bodyProgramDay(START, day(0)).sessionName).toBe('Lower A');
    expect(bodyProgramDay(START, day(0)).kind).toBe('train');
    expect(bodyProgramDay(START, day(1)).kind).toBe('fuel');
    expect(bodyProgramDay(START, day(2)).sessionName).toBe('Lower B');
    expect(bodyProgramDay(START, day(3)).kind).toBe('fuel');
    expect(bodyProgramDay(START, day(4)).sessionName).toBe('Glute focus');
    expect(bodyProgramDay(START, day(5)).kind).toBe('rest');
    expect(bodyProgramDay(START, day(6)).kind).toBe('fuel'); // week 1 sunday = fuel (biweekly measure)
  });

  it('train days carry the prescribed blocks and a timer proof', () => {
    const o = bodyProgramDay(START, day(0));
    expect(o.blocks.length).toBeGreaterThanOrEqual(3);
    expect(o.blocks[0].move).toMatch(/hip thrust/i);
    expect(o.proofKind).toBe('timer');
  });

  it('the second Sunday is a progress-shot measure day', () => {
    // week 2 sunday = dayIndex 13 (week 2, cycleDay 6) → measure
    const o = bodyProgramDay(START, day(13));
    expect(o.weekIndex).toBe(2);
    expect(o.kind).toBe('measure');
  });
});

describe('weekly progression climbs', () => {
  it('sets go 3 → 4 by week 3 and reps ranges open up', () => {
    const w1 = bodyProgramDay(START, day(0)).blocks[0].prescription;   // week 1 Lower A hip thrust
    const w3 = bodyProgramDay(START, day(14)).blocks[0].prescription;  // week 3 Lower A hip thrust
    expect(w1).toMatch(/3 × 10–12/);
    expect(w3).toMatch(/4 × 12–15/);
  });

  it('week 1 is bodyweight; later weeks add load', () => {
    expect(bodyProgramDay(START, day(0)).blocks[0].prescription).toMatch(/bodyweight/i);
    expect(bodyProgramDay(START, day(14)).blocks[0].prescription).toMatch(/more than last week/i);
  });
});

describe('bodyOrderForTarget — the reconditioning-target seam', () => {
  it('returns the day order for a body_conditioning target', () => {
    const o = bodyOrderForTarget({ program: 'body_conditioning', program_start: START }, day(0));
    expect(o?.sessionName).toBe('Lower A');
  });

  it('returns null for a non-body target or missing start', () => {
    expect(bodyOrderForTarget({ program: 'something_else', program_start: START }, day(0))).toBeNull();
    expect(bodyOrderForTarget({ program: 'body_conditioning' }, day(0))).toBeNull();
    expect(bodyOrderForTarget(null, day(0))).toBeNull();
  });
});
