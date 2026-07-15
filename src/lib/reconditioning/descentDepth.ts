/**
 * Descent depth — the cinematic meter from DESIGN_RECONDITIONING_ENGINE §4
 * ("Escalating 'descent depth' meter... derived from session-completion
 * timestamps; shown as *descent*, never as a /10 or day-count").
 *
 * Pure, testable tier computation. Callers fetch the three raw counts from
 * Supabase (completed trances, armed post-hypnotic triggers, deepest running
 * reconditioning-program phase) and pass them in here; the tier (0-5) is the
 * only thing that reaches the UI, translated by descentTierToPhrase() — no
 * raw count or day-count is ever rendered.
 */

export type ProgramPhase =
  | 'induction'
  | 'install'
  | 'reinforce'
  | 'reconsolidate'
  | 'measure'
  | 'retain';

const PHASE_WEIGHT: Record<ProgramPhase, number> = {
  induction: 1,
  install: 2,
  reinforce: 3,
  reconsolidate: 4,
  measure: 4,
  retain: 5,
};

/** Weight of the deepest phase across running programs; 0 if none/unknown. */
export function phaseWeight(phase: string | null | undefined): number {
  return PHASE_WEIGHT[phase as ProgramPhase] ?? 0;
}

export interface DescentInputs {
  completedTrances: number;
  armedTriggers: number;
  /** Max phaseWeight() across the user's running reconditioning programs. */
  maxProgramPhaseWeight: number;
}

/** Buckets a raw count into a small 0-4 score (more sessions → higher). */
function bucket(n: number, steps: number[]): number {
  let score = 0;
  for (const step of steps) {
    if (n >= step) score += 1;
  }
  return score;
}

/** Combines the three signals into one 0-5 depth tier. */
export function computeDescentTier(inputs: DescentInputs): number {
  const completed = Math.max(0, Math.round(inputs.completedTrances || 0));
  const armed = Math.max(0, Math.round(inputs.armedTriggers || 0));
  const phase = Math.max(0, Math.round(inputs.maxProgramPhaseWeight || 0));

  const tranceScore = bucket(completed, [1, 5, 15, 30]); // 0..4
  const triggerScore = bucket(armed, [1, 2, 4]); // 0..3
  const raw = tranceScore + triggerScore + phase; // 0..12ish

  if (raw <= 0) return 0;
  if (raw <= 2) return 1;
  if (raw <= 4) return 2;
  if (raw <= 7) return 3;
  if (raw <= 10) return 4;
  return 5;
}
