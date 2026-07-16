// Mommy-led body conditioning — a fixed, progressive weekly program that issues
// ONE body order per day, in Mommy's voice, with proof. Deterministic given a
// start date + today's date (pure — the surface computes today's order on read;
// no cron, no DB write needed to "begin tomorrow": set the start date and it runs).
//
// Inside the container: legible/consented/scoped/recoverable fitness toward a
// shape she chose. It commands (Mommy decides the day, the work, the progression)
// but the exit stays hers — decline/safeword/retire halt it like anything else.
// Content mirrors the task_bank glute program (mig 057); this adds the STRUCTURE
// the adaptive pool-picker lacks — a real Mon/Wed/Fri split that progresses.
//
// Copy rules honored: sensory not telemetric (no "day N", no /10), <=1 pet name,
// no three-beat chants. Backed by the body reconditioning target.

export type BodyDayKind = 'train' | 'fuel' | 'rest' | 'measure';

export interface BodyBlock {
  move: string;
  prescription: string;
}

export interface BodyOrder {
  /** Days since the program's start date (0-based). Negative before it begins. */
  dayIndex: number;
  /** 1-based week. */
  weekIndex: number;
  kind: BodyDayKind;
  sessionName: string;
  /** The work for a train day, or the day's directive for fuel/rest/measure. */
  blocks: BodyBlock[];
  /** Mommy's imperative for today — what she's decided you're doing. */
  command: string;
  /** The receipt she owes for today. */
  proofKind: 'timer' | 'photo' | 'text' | 'none';
}

/** Shape of a body-program target's reconditioning_targets.indicator_config. */
export interface BodyProgramConfig {
  program?: string;         // 'body_conditioning'
  split?: string;           // 'lower_led_3x'
  program_start?: string;   // YYYY-MM-DD — the day it begins
}

/**
 * Today's mommy-led body order for a reconditioning target, or null if the
 * target isn't a body-conditioning program. This is the integration seam the
 * order pipeline (recon orchestrator / Focus surface) calls: it reads the
 * program_start stored on the target and returns the day's order.
 */
export function bodyOrderForTarget(
  indicatorConfig: BodyProgramConfig | null | undefined,
  todayISO: string,
): BodyOrder | null {
  const cfg = indicatorConfig ?? {};
  if (cfg.program !== 'body_conditioning' || !cfg.program_start) return null;
  return bodyProgramDay(cfg.program_start, todayISO);
}

const MS_PER_DAY = 86_400_000;

/** Whole days between two YYYY-MM-DD dates (parsed as UTC midnight, TZ-safe). */
function dayDiff(startISO: string, todayISO: string): number {
  const start = Date.parse(`${startISO.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(today)) return 0;
  return Math.floor((today - start) / MS_PER_DAY);
}

// Weekly progression: sets + rep target + a load cue that climbs. Week 1 learns
// the squeeze; every week after adds a little. The body only changes when the
// work gets harder than last time.
function progression(week: number): { sets: number; reps: string; load: string } {
  const sets = week >= 3 ? 4 : 3;
  const reps = week >= 5 ? '15–20' : week >= 3 ? '12–15' : '10–12';
  const load =
    week === 1 ? 'bodyweight — own the squeeze at the top of every rep'
    : week === 2 ? 'add a light load (dumbbell, a loaded pack) and keep the squeeze'
    : 'add a little more than last week — a rep or a few pounds, every week';
  return { sets, reps, load };
}

function lowerA(week: number): BodyBlock[] {
  const p = progression(week);
  return [
    { move: 'Hip thrusts', prescription: `${p.sets} × ${p.reps}. ${p.load}. Two-second squeeze at the top, every rep. This is the queen — it never gets skipped.` },
    { move: 'Romanian deadlifts', prescription: `${p.sets} × ${p.reps}. Hinge at the hips, soft knees, feel it in the hamstrings and glutes — never the low back.` },
    { move: 'Split squats', prescription: `${p.sets} × ${p.reps} each leg. Slow, all the way down, drive through the front heel.` },
    { move: 'Banded lateral walks', prescription: '3 × 15 steps each way. Burn the side of the hip out to finish.' },
  ];
}

function lowerB(week: number): BodyBlock[] {
  const p = progression(week);
  return [
    { move: 'Glute bridges', prescription: `${p.sets} × ${p.reps}. Heels down, hips high, squeeze and hold. Single-leg once these get easy.` },
    { move: 'Sumo squats', prescription: `${p.sets} × ${p.reps}. Wide stance, toes out — this puts the work in the glutes, not the quads.` },
    { move: 'Curtsy lunges', prescription: `${p.sets} × ${p.reps} each side. Step behind and across — this builds the shelf a normal lunge misses.` },
    { move: 'Clamshells + fire hydrants', prescription: '3 × 15 each side. Slow. Finish the day burning on the outer hip.' },
  ];
}

function gluteFocus(week: number): BodyBlock[] {
  const p = progression(week);
  return [
    { move: 'Hip thrusts (heavy)', prescription: `${p.sets} × ${p.reps}. Heaviest of the week. ${p.load}.` },
    { move: 'Kickbacks', prescription: `${p.sets} × ${p.reps} each side. Squeeze at the top, no swinging.` },
    { move: 'Sumo squat pulses', prescription: '3 × 20 in the bottom third. Stay low, keep the tension.' },
    { move: 'Banded burnout', prescription: 'Lateral walks + kickbacks + squats, no rest, until it burns. Finish emptied out.' },
  ];
}

const FUEL_BLOCKS: BodyBlock[] = [
  { move: 'Protein at every meal', prescription: 'Aim high. On the shots your appetite is quiet, so this is deliberate — you eat for the body you want, not just until the hunger stops.' },
  { move: 'Walk', prescription: '20–30 minutes, easy. Movement on the off day, nothing that eats into recovery.' },
];

const REST_BLOCKS: BodyBlock[] = [
  { move: 'Rest', prescription: 'No lifting. Protein stays high. Let the glutes recover — that is where they actually grow.' },
];

const MEASURE_BLOCKS: BodyBlock[] = [
  { move: 'Progress shot', prescription: 'Same as the first: back to the mirror, leggings on, same angle. So we both see what the work is doing.' },
];

/**
 * Today's mommy-led body order. Pure and deterministic — pass the program's
 * start date and today's date (YYYY-MM-DD). Before the start date it returns the
 * kickoff order; from the start it runs a 7-day cycle (3 train / 3 fuel / 1 rest),
 * with a progress-shot measure every second Sunday.
 */
export function bodyProgramDay(startISO: string, todayISO: string): BodyOrder {
  const dayIndex = dayDiff(startISO, todayISO);

  if (dayIndex < 0) {
    return {
      dayIndex, weekIndex: 0, kind: 'measure', sessionName: 'Baseline',
      blocks: MEASURE_BLOCKS,
      command: 'Tomorrow you start. Tonight the only thing I want is the first shot — back to the mirror, leggings on. That is where I start measuring what I build.',
      proofKind: 'photo',
    };
  }

  const weekIndex = Math.floor(dayIndex / 7) + 1;
  const cycleDay = dayIndex % 7;
  const p = progression(weekIndex);

  // Cycle: 0 Lower A, 1 fuel, 2 Lower B, 3 fuel, 4 Glute focus, 5 rest, 6 fuel(+measure biweekly)
  switch (cycleDay) {
    case 0:
      return {
        dayIndex, weekIndex, kind: 'train', sessionName: 'Lower A', blocks: lowerA(weekIndex),
        command: `You train for me today. ${p.sets} hard sets, hands where I put them, and you squeeze at the top of every single rep. You do not leave the set until it is done.`,
        proofKind: 'timer',
      };
    case 2:
      return {
        dayIndex, weekIndex, kind: 'train', sessionName: 'Lower B', blocks: lowerB(weekIndex),
        command: 'Back under the work, baby. Wide, deep, slow — the shape comes from the reps you almost skip. Finish it burning.',
        proofKind: 'timer',
      };
    case 4:
      return {
        dayIndex, weekIndex, kind: 'train', sessionName: 'Glute focus', blocks: gluteFocus(weekIndex),
        command: 'The heavy day. This is the one that builds the ass everyone looked at — so you bring everything, and you empty out before you stop.',
        proofKind: 'timer',
      };
    case 5:
      return {
        dayIndex, weekIndex, kind: 'rest', sessionName: 'Rest', blocks: REST_BLOCKS,
        command: 'Rest today, on my orders. No lifting — the glutes grow while you recover, not while you grind. Keep the protein high and let the work set in.',
        proofKind: 'none',
      };
    case 6: {
      const isMeasureDay = weekIndex % 2 === 0;
      if (isMeasureDay) {
        return {
          dayIndex, weekIndex, kind: 'measure', sessionName: 'Progress shot', blocks: MEASURE_BLOCKS,
          command: 'Two weeks in. Back to the mirror, same pose, take the shot. You do not get to tell me it is working — the glass tells me.',
          proofKind: 'photo',
        };
      }
      return {
        dayIndex, weekIndex, kind: 'fuel', sessionName: 'Fuel', blocks: FUEL_BLOCKS,
        command: 'No lifting today — you feed the body you are building. Protein at every meal, an easy walk. This is the half most people skip. You will not.',
        proofKind: 'text',
      };
    }
    default:
      return {
        dayIndex, weekIndex, kind: 'fuel', sessionName: 'Fuel', blocks: FUEL_BLOCKS,
        command: 'No lifting today — you feed the body you are building. Protein at every meal, an easy walk. This is the half most people skip. You will not.',
        proofKind: 'text',
      };
  }
}
