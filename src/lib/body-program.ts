// Mommy-led body conditioning — a fixed, progressive weekly program that issues
// ONE body order per day, in Mommy's voice, with proof. Deterministic given a
// start date + today's date (pure — the surface computes today's order on read;
// no cron, no DB write needed to "begin tomorrow": set the start date and it runs).
//
// The split is WEEKDAY-LOCKED: Monday Lower A, Wednesday Lower B, Friday Glute
// focus, Saturday rest, Sunday fuel (progress shot every second week), Tuesday/
// Thursday fuel. Progression pace still runs off the program start date, so a
// mid-week start just means a short first week.
//
// Every train day carries a real warm-up and cooldown (phase-tagged blocks);
// the logger walks them in order. On a wrecked-recovery day the surface swaps
// in the minimum-viable order (minimumViableOrder) — ten bridges keeps the
// chain alive; the calibration is invisible in the copy.
//
// Inside the container: legible/consented/scoped/recoverable fitness toward a
// shape she chose. It commands (Mommy decides the day, the work, the progression)
// but the exit stays hers — decline/safeword/retire halt it like anything else.
// Content mirrors the task_bank glute program (mig 057); this adds the STRUCTURE
// the adaptive pool-picker lacks — a real Mon/Wed/Fri split that progresses.
//
// Copy rules honored: sensory not telemetric (no "day N", no /10), <=1 pet name,
// no three-beat chants. Backed by the body reconditioning target (mig 670).

export type BodyDayKind = 'train' | 'fuel' | 'rest' | 'measure';

export type BodyBlockPhase = 'warmup' | 'main' | 'cooldown';

export interface BodyBlock {
  move: string;
  prescription: string;
  /** Session phase — the logger renders warmup → main → cooldown in order.
   *  Absent means 'main' (fuel/rest/measure directives have no phases). */
  phase?: BodyBlockPhase;
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
 * program_start stored on the target (mig 670) and returns the day's order.
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

/** Weekday of a YYYY-MM-DD date (0=Sunday..6=Saturday, TZ-safe). */
function weekdayOf(iso: string): number {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return 1;
  return new Date(t).getUTCDay();
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

// ── Warm-up / cooldown — every train day, phase-tagged for the logger ──────

const WARMUP_BLOCKS: BodyBlock[] = [
  { move: 'Incline treadmill', prescription: '5 minutes on the incline you keep it propped to — the one you already warm up on. Brisk walk, hips working, until you feel the blood in the glutes before the floor work.', phase: 'warmup' },
  { move: 'Glute bridges (wake-up)', prescription: '2 × 15, light and quick. Wake them up, not wear them out.', phase: 'warmup' },
  { move: 'Clamshells (wake-up)', prescription: '1 × 15 each side. Feel the side of the hip switch on before anything loads it.', phase: 'warmup' },
];

const COOLDOWN_BLOCKS: BodyBlock[] = [
  { move: 'Hip flexor stretch', prescription: '30 seconds each side, kneeling. Push the hips forward gently — undo the chair.', phase: 'cooldown' },
  { move: 'Pigeon pose', prescription: '45 seconds each side. Let the hip open on the exhale, no forcing.', phase: 'cooldown' },
  { move: 'Cat-cow', prescription: '5 slow cycles, breath matching the movement. Leave loose, not wrecked.', phase: 'cooldown' },
];

function asMain(blocks: BodyBlock[]): BodyBlock[] {
  return blocks.map(b => ({ ...b, phase: 'main' as const }));
}

function trainSession(main: BodyBlock[]): BodyBlock[] {
  return [...WARMUP_BLOCKS, ...asMain(main), ...COOLDOWN_BLOCKS];
}

function lowerA(week: number): BodyBlock[] {
  const p = progression(week);
  return trainSession([
    { move: 'Hip thrusts', prescription: `${p.sets} × ${p.reps}. ${p.load}. Two-second squeeze at the top, every rep. This is the queen — it never gets skipped.` },
    { move: 'Romanian deadlifts', prescription: `${p.sets} × ${p.reps}. Hinge at the hips, soft knees, feel it in the hamstrings and glutes — never the low back.` },
    { move: 'Split squats', prescription: `${p.sets} × ${p.reps} each leg. Slow, all the way down, drive through the front heel.` },
    { move: 'Banded lateral walks', prescription: '3 × 15 steps each way. Burn the side of the hip out to finish.' },
  ]);
}

function lowerB(week: number): BodyBlock[] {
  const p = progression(week);
  return trainSession([
    { move: 'Glute bridges', prescription: `${p.sets} × ${p.reps}. Heels down, hips high, squeeze and hold. Single-leg once these get easy.` },
    { move: 'Sumo squats', prescription: `${p.sets} × ${p.reps}. Wide stance, toes out — this puts the work in the glutes, not the quads.` },
    { move: 'Curtsy lunges', prescription: `${p.sets} × ${p.reps} each side. Step behind and across — this builds the shelf a normal lunge misses.` },
    { move: 'Clamshells + fire hydrants', prescription: '3 × 15 each side. Slow. Finish the day burning on the outer hip.' },
  ]);
}

function gluteFocus(week: number): BodyBlock[] {
  const p = progression(week);
  return trainSession([
    { move: 'Hip thrusts (heavy)', prescription: `${p.sets} × ${p.reps}. Heaviest of the week. ${p.load}.` },
    { move: 'Kickbacks', prescription: `${p.sets} × ${p.reps} each side. Squeeze at the top, no swinging.` },
    { move: 'Sumo squat pulses', prescription: '3 × 20 in the bottom third. Stay low, keep the tension.' },
    { move: 'Banded burnout', prescription: 'Lateral walks + kickbacks + squats, no rest, until it burns. Finish emptied out.' },
  ]);
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

const FUEL_ORDER = {
  kind: 'fuel' as const, sessionName: 'Fuel', blocks: FUEL_BLOCKS,
  command: 'No lifting today — you feed the body you are building. Protein at every meal, an easy walk. This is the half most people skip. You will not.',
  proofKind: 'text' as const,
};

/**
 * Today's mommy-led body order. Pure and deterministic — pass the program's
 * start date and today's date (YYYY-MM-DD). Before the start date it returns
 * the kickoff order; from the start the split is locked to the weekday:
 * Mon Lower A / Wed Lower B / Fri Glute focus / Sat rest / Sun fuel
 * (progress-shot measure every second week) / Tue+Thu fuel.
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
  const weekday = weekdayOf(todayISO);
  const p = progression(weekIndex);

  switch (weekday) {
    case 1: // Monday — Lower A
      return {
        dayIndex, weekIndex, kind: 'train', sessionName: 'Lower A', blocks: lowerA(weekIndex),
        command: `You train for me today. ${p.sets} hard sets, hands where I put them, and you squeeze at the top of every single rep. You do not leave the set until it is done.`,
        proofKind: 'timer',
      };
    case 3: // Wednesday — Lower B
      return {
        dayIndex, weekIndex, kind: 'train', sessionName: 'Lower B', blocks: lowerB(weekIndex),
        command: 'Back under the work, baby. Wide, deep, slow — the shape comes from the reps you almost skip. Finish it burning.',
        proofKind: 'timer',
      };
    case 5: // Friday — Glute focus (heavy)
      return {
        dayIndex, weekIndex, kind: 'train', sessionName: 'Glute focus', blocks: gluteFocus(weekIndex),
        command: 'The heavy day. This is the one that builds the ass everyone looked at — so you bring everything, and you empty out before you stop.',
        proofKind: 'timer',
      };
    case 6: // Saturday — rest
      return {
        dayIndex, weekIndex, kind: 'rest', sessionName: 'Rest', blocks: REST_BLOCKS,
        command: 'Rest today, on my orders. No lifting — the glutes grow while you recover, not while you grind. Keep the protein high and let the work set in.',
        proofKind: 'none',
      };
    case 0: { // Sunday — fuel, with the progress shot every second week
      const isMeasureDay = weekIndex % 2 === 0;
      if (isMeasureDay) {
        return {
          dayIndex, weekIndex, kind: 'measure', sessionName: 'Progress shot', blocks: MEASURE_BLOCKS,
          command: 'Two weeks in. Back to the mirror, same pose, take the shot. You do not get to tell me it is working — the glass tells me.',
          proofKind: 'photo',
        };
      }
      return { dayIndex, weekIndex, ...FUEL_ORDER };
    }
    default: // Tuesday / Thursday — fuel
      return { dayIndex, weekIndex, ...FUEL_ORDER };
  }
}

// ── Looking ahead — the split is never a mystery ────────────────────────────
// A fuel/rest day must still show what's coming: the card names the next
// training session and its moves so "what exercises do I do" always has a
// visible answer (visible-before-anything doctrine).

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function addDaysISO(iso: string, n: number): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Main-work move names for an order (skips warm-up/cooldown). */
export function mainMoves(order: BodyOrder): string[] {
  return order.blocks.filter(b => !b.phase || b.phase === 'main').map(b => b.move);
}

export interface UpcomingTrain {
  order: BodyOrder;
  /** 1 = tomorrow. */
  inDays: number;
  weekdayName: string;
}

/** The next train day after today (the split guarantees one within 7 days). */
export function nextTrainOrder(startISO: string, todayISO: string): UpcomingTrain {
  for (let i = 1; i <= 7; i++) {
    const d = addDaysISO(todayISO, i);
    const o = bodyProgramDay(startISO, d);
    if (o.kind === 'train') {
      return { order: o, inDays: i, weekdayName: WEEKDAY_NAMES[weekdayOf(d)] };
    }
  }
  return { order: bodyProgramDay(startISO, todayISO), inDays: 0, weekdayName: '' };
}

// ── Minimum-viable workout — the low-recovery downshift ────────────────────
// On a wrecked day (strap recovery in the red) the full session is the thing
// that gets skipped entirely. Ten bridges is small enough that it can't be
// argued with, and the streak/decree machinery counts it the same. The copy
// never explains the calibration (Exercise_Domain_Spec: "the calibration is
// invisible").

const MVW_BLOCKS: BodyBlock[] = [
  { move: 'Glute bridges', prescription: 'Ten. Slow. Two-second squeeze at the top of every single one. Floor, breathe, done — that is the whole session.', phase: 'main' },
];

/** Recovery below this (WHOOP red zone) swaps a train day down to the MVW. */
export const MVW_RECOVERY_FLOOR = 34;

/**
 * Downshift a train order to the minimum-viable session. Non-train orders
 * pass through untouched. Proof stays 'timer' so the decree machinery is
 * identical — a small day still closes the obligation.
 */
export function minimumViableOrder(order: BodyOrder): BodyOrder {
  if (order.kind !== 'train') return order;
  return {
    ...order,
    blocks: MVW_BLOCKS,
    command: 'Your body is running on empty today, so I am shrinking the order, not dropping it. Ten slow bridges on the floor, a hard squeeze at the top of every one, and you are done. Small still counts. Skipping does not.',
    proofKind: 'timer',
  };
}
