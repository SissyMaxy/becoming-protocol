/**
 * Trans-Specific Exercise Programming (P5.3)
 *
 * Prescribes feminization-aligned workouts gated by Whoop recovery.
 * Focuses on glutes, hips, flexibility, yoga. Explicitly excludes
 * testosterone-boosting compound upper body movements.
 *
 * Verifies workout completion via Whoop strain data.
 */

import { supabase } from '../supabase';
import { buildWhoopContext } from '../whoop-context';

// ============================================
// TYPES
// ============================================

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  notes: string;
}

export interface WorkoutPrescription {
  exercises: Exercise[];
  warmup: string;
  cooldown: string;
  estimatedMinutes: number;
  recoveryZone: string;
  prescribedAt: string;
}

export interface WorkoutCompletion {
  completed: boolean;
  strainDelta: number;
  evidence: string;
}

// ============================================
// EXERCISE LIBRARY
// ============================================

const GLUTE_EXERCISES: Exercise[] = [
  { name: 'Glute Bridges', sets: 3, reps: '15', notes: 'Squeeze at top for 2 seconds' },
  { name: 'Hip Thrusts', sets: 3, reps: '12', notes: 'Barbell or bodyweight. Full hip extension.' },
  { name: 'Bulgarian Split Squats', sets: 3, reps: '10 each', notes: 'Rear foot elevated. Lean forward slightly for glute emphasis.' },
  { name: 'Cable Kickbacks', sets: 3, reps: '15', notes: 'Squeeze glute at full extension. Slow negatives.' },
  { name: 'Side-Lying Leg Raises', sets: 3, reps: '20', notes: 'Keep hips stacked. Control the descent.' },
  { name: 'Clamshells', sets: 3, reps: '15', notes: 'Band above knees for resistance.' },
  { name: 'Donkey Kicks', sets: 3, reps: '15', notes: 'Keep core tight. No arching.' },
  { name: 'Hip Circle Walks', sets: 3, reps: '20 steps', notes: 'Band at ankles. Stay low.' },
  { name: 'Fire Hydrants', sets: 3, reps: '15', notes: 'Slow and controlled. Pause at top.' },
  { name: 'Sumo Squats', sets: 3, reps: '12', notes: 'Wide stance. Toes pointed out. Dumbbell or bodyweight.' },
];

const YOGA_POSES: Exercise[] = [
  { name: 'Pigeon Pose', sets: 1, reps: '60s each side', notes: 'Deep hip opener. Breathe into the stretch.' },
  { name: 'Happy Baby', sets: 1, reps: '60s', notes: 'Rock gently side to side.' },
  { name: 'Warrior III', sets: 1, reps: '30s each side', notes: 'Focus on balance and hip alignment.' },
  { name: 'Tree Pose', sets: 1, reps: '45s each side', notes: 'Engage core. Gaze fixed.' },
  { name: 'Goddess Pose', sets: 1, reps: '45s', notes: 'Deep squat position. Arms in cactus.' },
];

const FLEXIBILITY_EXERCISES: Exercise[] = [
  { name: 'Hip Flexor Stretch', sets: 1, reps: '45s each side', notes: 'Half-kneeling. Push hips forward.' },
  { name: 'Seated Butterfly', sets: 1, reps: '60s', notes: 'Press knees toward floor gently.' },
  { name: 'Standing Quad Stretch', sets: 1, reps: '30s each side', notes: 'Keep knees together. Hold wall for balance.' },
  { name: 'Reclined Spinal Twist', sets: 1, reps: '45s each side', notes: 'Knees stacked. Shoulders flat.' },
  { name: 'Cat-Cow Stretch', sets: 1, reps: '10 cycles', notes: 'Slow breath-matched movement.' },
];

/**
 * EXCLUDED exercises (testosterone-boosting compound upper body):
 * - Bench press
 * - Overhead press
 * - Heavy deadlifts
 * - Barbell rows
 * - Pull-ups
 */

// ============================================
// CORE
// ============================================

/**
 * Prescribe a workout based on Whoop recovery zone.
 *
 * GREEN (67%+): Full workout — glutes, yoga, flexibility
 * YELLOW (34-66%): Light workout — yoga, stretching, light glutes
 * RED (<34%): Rest day — gentle stretching only
 */
export async function prescribeWorkout(userId: string): Promise<WorkoutPrescription> {
  const whoop = await buildWhoopContext(userId);
  const recoveryZone = whoop.recoveryZone ?? 'YELLOW';

  let exercises: Exercise[];
  let warmup: string;
  let cooldown: string;
  let estimatedMinutes: number;

  switch (recoveryZone) {
    case 'GREEN': {
      // Full workout: 4-5 glute exercises + 2 yoga + 1 flexibility
      const gluteSelection = selectRandom(GLUTE_EXERCISES, 5);
      const yogaSelection = selectRandom(YOGA_POSES, 2);
      const flexSelection = selectRandom(FLEXIBILITY_EXERCISES, 1);
      exercises = [...gluteSelection, ...yogaSelection, ...flexSelection];
      warmup = '5 min light cardio (walking or cycling) + hip circles + bodyweight squats (2x10)';
      cooldown = '5 min walking + full-body foam rolling, focus on glutes and hip flexors';
      estimatedMinutes = 55;
      break;
    }
    case 'YELLOW': {
      // Light workout: 2 light glutes + 2 yoga + 2 flexibility
      const lightGlutes = selectRandom(
        GLUTE_EXERCISES.filter(e => !['Hip Thrusts', 'Bulgarian Split Squats', 'Sumo Squats'].includes(e.name)),
        2
      );
      // Reduce sets for light day
      const reducedGlutes = lightGlutes.map(e => ({ ...e, sets: 2 }));
      const yogaSelection = selectRandom(YOGA_POSES, 2);
      const flexSelection = selectRandom(FLEXIBILITY_EXERCISES, 2);
      exercises = [...reducedGlutes, ...yogaSelection, ...flexSelection];
      warmup = '5 min gentle walking + hip circles';
      cooldown = '3 min deep breathing + gentle full-body stretch';
      estimatedMinutes = 35;
      break;
    }
    case 'RED':
    default: {
      // Rest day: stretching only
      const flexSelection = selectRandom(FLEXIBILITY_EXERCISES, 3);
      const gentleYoga = selectRandom(
        YOGA_POSES.filter(e => ['Happy Baby', 'Pigeon Pose'].includes(e.name)),
        1
      );
      exercises = [...gentleYoga, ...flexSelection];
      warmup = '3 min deep breathing + gentle neck and shoulder rolls';
      cooldown = '2 min savasana + body scan';
      estimatedMinutes = 20;
      break;
    }
  }

  const prescription: WorkoutPrescription = {
    exercises,
    warmup,
    cooldown,
    estimatedMinutes,
    recoveryZone,
    prescribedAt: new Date().toISOString(),
  };

  // Persist prescription
  await persistWorkoutPrescription(userId, prescription);

  return prescription;
}

/**
 * Verify workout completion using Whoop strain data.
 *
 * Checks if day_strain increased by 2+ during the day AND avg HR was elevated,
 * which indicates a workout likely occurred.
 */
export async function verifyWorkoutCompletion(
  userId: string,
  date: string
): Promise<WorkoutCompletion> {
  try {
    // Get the day's whoop metrics
    const { data: metrics } = await supabase
      .from('whoop_metrics')
      .select('day_strain')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    // Get the previous day's strain for delta
    const prevDate = new Date(new Date(date).getTime() - 86400000).toISOString().split('T')[0];
    const { data: prevMetrics } = await supabase
      .from('whoop_metrics')
      .select('day_strain')
      .eq('user_id', userId)
      .eq('date', prevDate)
      .maybeSingle();

    // Check for workouts logged on that day
    const { data: workouts } = await supabase
      .from('whoop_workouts')
      .select('strain, average_heart_rate, duration_milli, sport_name')
      .eq('user_id', userId)
      .eq('date', date);

    const todayStrain = metrics?.day_strain ?? 0;
    const prevStrain = prevMetrics?.day_strain ?? 0;
    const strainDelta = todayStrain - prevStrain;

    // Evidence collection
    const evidence: string[] = [];
    let completed = false;

    // Primary check: strain delta
    if (strainDelta >= 2) {
      evidence.push(`strain delta +${strainDelta.toFixed(1)} (threshold: 2.0)`);
      completed = true;
    }

    // Secondary check: logged workouts with elevated HR
    if (workouts && workouts.length > 0) {
      const relevantWorkouts = workouts.filter(w =>
        (w.average_heart_rate ?? 0) > 100 && (w.duration_milli ?? 0) > 900000 // 15+ min
      );

      if (relevantWorkouts.length > 0) {
        const w = relevantWorkouts[0];
        const mins = w.duration_milli ? Math.round(w.duration_milli / 60000) : 0;
        evidence.push(`workout logged: ${w.sport_name ?? 'Activity'} (${mins}min, avg HR ${w.average_heart_rate}bpm, strain ${w.strain?.toFixed(1) ?? '?'})`);
        completed = true;
      } else {
        evidence.push(`${workouts.length} workout(s) logged but HR/duration below threshold`);
      }
    }

    if (evidence.length === 0) {
      evidence.push('no strain increase or workouts detected');
    }

    // Persist verification
    await persistWorkoutVerification(userId, date, completed, strainDelta, evidence.join('; '));

    return {
      completed,
      strainDelta,
      evidence: evidence.join('; '),
    };
  } catch (err) {
    console.error('[exercise-rx] verifyWorkoutCompletion exception:', err);
    return {
      completed: false,
      strainDelta: 0,
      evidence: 'verification failed — error querying whoop data',
    };
  }
}

/**
 * Build handler context string showing today's exercise prescription and completion.
 */
export async function buildExercisePrescriptionContext(
  userId: string
): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Fetch today's prescription
    const { data: rx } = await supabase
      .from('exercise_prescriptions')
      .select('recovery_zone, estimated_minutes, exercises, verified, strain_delta')
      .eq('user_id', userId)
      .eq('prescribed_date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!rx) return '';

    const whoop = await buildWhoopContext(userId);
    const zone = rx.recovery_zone ?? whoop.recoveryZone ?? 'UNKNOWN';
    const exerciseCount = Array.isArray(rx.exercises) ? rx.exercises.length : 0;

    const parts: string[] = [];
    parts.push(`EXERCISE RX: ${zone} day — ${exerciseCount} exercises, ~${rx.estimated_minutes ?? '?'}min`);

    if (rx.verified === true) {
      parts.push(`  VERIFIED COMPLETE (strain delta: +${(rx.strain_delta ?? 0).toFixed(1)})`);
    } else if (rx.verified === false) {
      parts.push('  NOT YET VERIFIED — check if workout was done');
    } else {
      parts.push('  pending verification');
    }

    // Current Whoop state for real-time context
    if (whoop.available && whoop.dayStrain != null) {
      parts.push(`  current day strain: ${whoop.dayStrain.toFixed(1)}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

function selectRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

async function persistWorkoutPrescription(
  userId: string,
  rx: WorkoutPrescription
): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase
      .from('exercise_prescriptions')
      .upsert({
        user_id: userId,
        prescribed_date: today,
        recovery_zone: rx.recoveryZone,
        estimated_minutes: rx.estimatedMinutes,
        exercises: rx.exercises,
        warmup: rx.warmup,
        cooldown: rx.cooldown,
        verified: null,
        strain_delta: null,
      }, { onConflict: 'user_id,prescribed_date' });

    if (error) {
      console.error('[exercise-rx] persistWorkoutPrescription error:', error.message);
    }
  } catch (err) {
    console.error('[exercise-rx] persistWorkoutPrescription exception:', err);
  }
}

async function persistWorkoutVerification(
  userId: string,
  date: string,
  completed: boolean,
  strainDelta: number,
  evidence: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('exercise_prescriptions')
      .update({
        verified: completed,
        strain_delta: strainDelta,
        verification_evidence: evidence,
        verified_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('prescribed_date', date);

    if (error) {
      console.error('[exercise-rx] persistWorkoutVerification error:', error.message);
    }
  } catch (err) {
    console.error('[exercise-rx] persistWorkoutVerification exception:', err);
  }
}
