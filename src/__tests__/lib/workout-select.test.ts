// workout-prescriber rotation — regression tests.
//
// Bug: the daily rotation was keyed on user_state.workout_streak_days, which
// only increments when a prescription is completed. A stuck streak (0 since
// at least 2026-07-13) froze the rotation on glute_sculpt every single day —
// "no clear exercise routine", just the same card forever. The rotation is
// now keyed on the scheduled date, so the 7-template cycle advances no
// matter what the completion state is.

import { describe, it, expect } from 'vitest';
import {
  selectWorkout,
  WORKOUT_ROTATION,
  LOW_RECOVERY_POOL,
} from '../../../supabase/functions/_shared/workout-select';

const day = (n: number): string => {
  const d = new Date(Date.UTC(2026, 6, 13 + n)); // 2026-07-13 + n
  return d.toISOString().slice(0, 10);
};

describe('selectWorkout rotation', () => {
  it('covers all 7 templates across 7 consecutive days (the frozen-rotation regression)', () => {
    const week = Array.from({ length: 7 }, (_, i) =>
      selectWorkout({ recovery: null, dateISO: day(i), preference: null }),
    );
    expect(new Set(week).size).toBe(7);
    expect(week.sort()).toEqual([...WORKOUT_ROTATION].sort());
  });

  it('never prescribes the same template on consecutive days without wearable/preference input', () => {
    for (let i = 0; i < 14; i++) {
      const a = selectWorkout({ recovery: null, dateISO: day(i), preference: null });
      const b = selectWorkout({ recovery: null, dateISO: day(i + 1), preference: null });
      expect(a).not.toBe(b);
    }
  });

  it('is deterministic for a given date', () => {
    const a = selectWorkout({ recovery: 80, dateISO: '2026-07-18', preference: null });
    const b = selectWorkout({ recovery: 80, dateISO: '2026-07-18', preference: null });
    expect(a).toBe(b);
  });
});

describe('selectWorkout recovery gates', () => {
  it('recovery < 34 always yields recovery_stretch', () => {
    expect(selectWorkout({ recovery: 20, dateISO: day(0), preference: 'glute_sculpt' })).toBe('recovery_stretch');
  });

  it('recovery 34-49 yields only light workouts, still rotating by date', () => {
    const picks = Array.from({ length: 6 }, (_, i) =>
      selectWorkout({ recovery: 40, dateISO: day(i), preference: null }),
    );
    for (const p of picks) expect(LOW_RECOVERY_POOL).toContain(p);
    expect(new Set(picks).size).toBeGreaterThan(1);
  });
});

describe('selectWorkout preference weighting', () => {
  it('honors a valid preference when the 40% roll hits', () => {
    const pick = selectWorkout({ recovery: 80, dateISO: day(1), preference: 'dance_cardio', rand: () => 0.1 });
    expect(pick).toBe('dance_cardio');
  });

  it('falls back to the date rotation when the roll misses', () => {
    const pick = selectWorkout({ recovery: 80, dateISO: day(1), preference: 'dance_cardio', rand: () => 0.9 });
    expect(pick).toBe(selectWorkout({ recovery: 80, dateISO: day(1), preference: null }));
  });

  it('ignores an invalid preference entirely', () => {
    const pick = selectWorkout({ recovery: 80, dateISO: day(2), preference: 'bench_press_bro', rand: () => 0.1 });
    expect(WORKOUT_ROTATION).toContain(pick as (typeof WORKOUT_ROTATION)[number]);
  });
});
