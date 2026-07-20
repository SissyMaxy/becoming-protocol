// Workout templates — home-equipment gate + structural checks.
//
// The prescriber's original templates included cable-machine work (cable
// kickbacks, standing cable abduction) that can't be done at home —
// prescriptions must only demand what she owns. This gate keeps every
// template living-room-doable and keeps the rotation and templates in sync.

import { describe, it, expect } from 'vitest';
import { WORKOUT_TEMPLATES } from '../../../supabase/functions/_shared/workout-templates';
import { WORKOUT_ROTATION } from '../../../supabase/functions/_shared/workout-select';

const BANNED_EQUIPMENT = /\b(cable|machine|barbell|dumbbell|kettlebell|treadmill|smith|leg press|bench press)\b/i;

describe('workout templates — home equipment gate', () => {
  for (const [key, tpl] of Object.entries(WORKOUT_TEMPLATES)) {
    it(`${key} requires no gym equipment`, () => {
      for (const ex of tpl.exercises) {
        const text = `${ex.name} ${ex.notes ?? ''}`;
        expect(text, `"${ex.name}" in ${key} demands gym equipment`).not.toMatch(BANNED_EQUIPMENT);
      }
    });
  }
});

describe('workout templates — structure', () => {
  it('every rotation entry has a template', () => {
    for (const type of WORKOUT_ROTATION) {
      expect(WORKOUT_TEMPLATES[type], `missing template for ${type}`).toBeDefined();
    }
    expect(WORKOUT_TEMPLATES.recovery_stretch).toBeDefined();
  });

  it('phased templates run warmup -> main -> cooldown in order', () => {
    const order = { warmup: 0, main: 1, cooldown: 2 } as const;
    for (const [key, tpl] of Object.entries(WORKOUT_TEMPLATES)) {
      const phases = tpl.exercises.map(e => e.phase).filter(Boolean) as Array<keyof typeof order>;
      if (phases.length === 0) continue;
      expect(phases.length, `${key}: mix of phased and unphased exercises`).toBe(tpl.exercises.length);
      for (let i = 1; i < phases.length; i++) {
        expect(order[phases[i]], `${key}: phases out of order`).toBeGreaterThanOrEqual(order[phases[i - 1]]);
      }
    }
  });

  it('glute_sculpt mirrors the Day 1 Glute Activation program (couch hip thrusts 3x20 centerpiece)', () => {
    const glute = WORKOUT_TEMPLATES.glute_sculpt;
    const thrusts = glute.exercises.find(e => e.name === 'Hip thrusts');
    expect(thrusts).toBeDefined();
    expect(thrusts!.sets).toBe(3);
    expect(thrusts!.reps).toBe(20);
    expect(thrusts!.phase).toBe('main');
    expect(glute.duration).toBe(25);
    expect(glute.exercises.some(e => e.phase === 'warmup')).toBe(true);
    expect(glute.exercises.some(e => e.phase === 'cooldown')).toBe(true);
  });
});
