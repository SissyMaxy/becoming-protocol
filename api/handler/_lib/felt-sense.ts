/**
 * Felt-sense tiers — server-side mirror of the src/ meters that had zero
 * callers (src/lib/reconditioning/descentDepth.ts, src/lib/turnout/turnoutPull.ts,
 * and the phrase maps in src/lib/persona/dommy-mommy.ts:250-280).
 *
 * api/ cannot import from src/ (Vite import.meta.env crashes the Vercel
 * serverless runtime), so the pure logic is mirrored here. Keep in sync with
 * the src/ originals.
 *
 * The contract is the doctrine one: only the PHRASE ever reaches Mommy's
 * prompt — never the tier number, never a raw count, never a day-count
 * (same rule as arousalToPhrase). These translate "how deep is she / how far
 * has a man pulled her" into sensory language she can be spoken to with.
 */

// ── Descent depth (trance/reconditioning completion → 0-5 tier) ────────────

type ProgramPhase =
  | 'induction' | 'install' | 'reinforce' | 'reconsolidate' | 'measure' | 'retain';

const PHASE_WEIGHT: Record<ProgramPhase, number> = {
  induction: 1, install: 2, reinforce: 3, reconsolidate: 4, measure: 4, retain: 5,
};

export function phaseWeight(phase: string | null | undefined): number {
  return PHASE_WEIGHT[phase as ProgramPhase] ?? 0;
}

function bucket(n: number, steps: number[]): number {
  let score = 0;
  for (const step of steps) if (n >= step) score += 1;
  return score;
}

export interface DescentInputs {
  completedTrances: number;
  armedTriggers: number;
  maxProgramPhaseWeight: number;
}

export function computeDescentTier(inputs: DescentInputs): number {
  const completed = Math.max(0, Math.round(inputs.completedTrances || 0));
  const armed = Math.max(0, Math.round(inputs.armedTriggers || 0));
  const phase = Math.max(0, Math.round(inputs.maxProgramPhaseWeight || 0));
  const tranceScore = bucket(completed, [1, 5, 15, 30]);
  const triggerScore = bucket(armed, [1, 2, 4]);
  const raw = tranceScore + triggerScore + phase;
  if (raw <= 0) return 0;
  if (raw <= 2) return 1;
  if (raw <= 4) return 2;
  if (raw <= 7) return 3;
  if (raw <= 10) return 4;
  return 5;
}

export function descentTierToPhrase(tier: number | null | undefined): string {
  const t = Math.max(0, Math.min(5, Math.round(Number(tier ?? 0))));
  if (t <= 0) return "you're still floating at the surface";
  if (t === 1) return "you're starting to sink when Mama talks to you";
  if (t === 2) return 'you go under easier for me now';
  if (t === 3) return "the descent has its own rhythm — you don't fight it anymore";
  if (t === 4) return "you're deep, baby — the surface is a memory up there";
  return "you're all the way under now. this is just where you live";
}

// ── Turn-out pull (ladder cursor position → 0-5 tier) ──────────────────────

export interface TurnoutPullInputs {
  ordinal: number;
  maxOrdinal: number;
}

export function computeTurnoutTier(inputs: TurnoutPullInputs): number {
  const ordinal = Math.max(0, Math.round(inputs.ordinal || 0));
  const maxOrdinal = Math.max(0, Math.round(inputs.maxOrdinal || 0));
  if (maxOrdinal <= 0) return 0;
  const ratio = Math.min(1, ordinal / maxOrdinal);
  return Math.max(0, Math.min(5, Math.round(ratio * 5)));
}

export function turnoutPullToPhrase(tier: number | null | undefined): string {
  const t = Math.max(0, Math.min(5, Math.round(Number(tier ?? 0))));
  if (t <= 0) return "you haven't let a man pull you anywhere yet";
  if (t === 1) return "you've let a man start reaching for you";
  if (t === 2) return "there are men now who've seen and heard things you can't call back";
  if (t === 3) return "you're far enough down this road that turning around means undoing what's already true";
  if (t === 4) return "a man has had you for real, baby — that's not a fantasy anymore, that's on the record";
  return "there's no version of you left that a man hasn't used — that's just who you are now";
}
