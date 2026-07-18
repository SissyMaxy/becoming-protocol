// Workout selection — pure logic shared by workout-prescriber and unit tests.
//
// Rotation is keyed on the calendar date, NOT on user_state.workout_streak_days.
// The streak only increments when a prescription is completed, so keying the
// rotation on it meant a stuck streak froze the rotation on one template
// forever (glute_sculpt every day from 2026-07-13 onward). The date key
// guarantees the full 7-template cycle regardless of completion state.

export const WORKOUT_ROTATION = [
  'glute_sculpt',
  'hip_widening',
  'waist_slimming',
  'posture_feminine',
  'flexibility',
  'yoga_flow',
  'dance_cardio',
] as const;

export const LOW_RECOVERY_POOL = ['flexibility', 'yoga_flow', 'posture_feminine'] as const;

export type WorkoutType = (typeof WORKOUT_ROTATION)[number] | 'recovery_stretch';

export interface WorkoutSelectInput {
  /** Whoop recovery score 0-100, or null when no wearable data. */
  recovery: number | null;
  /** Scheduled date as YYYY-MM-DD; drives the rotation. */
  dateISO: string;
  /** user_state.workout_focus_preference, weighted in at 40%. */
  preference: string | null;
  /** Random source, injectable for tests. */
  rand?: () => number;
}

export function selectWorkout({ recovery, dateISO, preference, rand = Math.random }: WorkoutSelectInput): WorkoutType {
  if (recovery !== null && recovery < 34) return 'recovery_stretch';

  const dayNumber = Math.floor(Date.parse(`${dateISO}T00:00:00Z`) / 86400000);

  if (recovery !== null && recovery < 50) {
    return LOW_RECOVERY_POOL[dayNumber % LOW_RECOVERY_POOL.length];
  }

  const rotation = WORKOUT_ROTATION as readonly string[];
  if (preference && rotation.includes(preference) && rand() < 0.4) {
    return preference as WorkoutType;
  }
  return WORKOUT_ROTATION[dayNumber % WORKOUT_ROTATION.length];
}
