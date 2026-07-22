// felt-sense.ts — server-side felt-depth translator for the conversational
// (Mommy-voice) prompt.
//
// api/ NEVER imports src/ (esbuild bundles this handler independently; see the
// local arousalToPhrase copy in mommy-voice-chat.ts). So the phrase maps below
// MIRROR src/lib/persona/dommy-mommy.ts (descentTierToPhrase, turnoutPullToPhrase)
// and the tier math MIRRORS src/lib/reconditioning/descentDepth.ts +
// src/lib/turnout/turnoutPull.ts. Keep the three in sync.
//
// CONTRACT (same as arousalToPhrase): only the *phrase* ever reaches a prompt.
// No raw count, no tier ordinal, no day-count. Numbers stay server-side; Mama
// speaks in felt sense. The mommy-voice-chat.ts scrubbers are the backstop.

// ─── Phrase maps (mirror dommy-mommy.ts:250 / :267) ─────────────────────────

/** Descent-depth tier (0-5) → sensory phrase. Never a number. */
export function descentTierToPhrase(tier: number | null | undefined): string {
  const t = Math.max(0, Math.min(5, Math.round(Number(tier ?? 0))));
  if (t <= 0) return "you're still floating at the surface";
  if (t === 1) return "you're starting to sink when Mama talks to you";
  if (t === 2) return "you go under easier for me now";
  if (t === 3) return "the descent has its own rhythm — you don't fight it anymore";
  if (t === 4) return "you're deep, baby — the surface is a memory up there";
  return "you're all the way under now. this is just where you live";
}

/** Turn-out pull tier (0-5) → sensory phrase. Never a rung, ordinal, or day. */
export function turnoutPullToPhrase(tier: number | null | undefined): string {
  const t = Math.max(0, Math.min(5, Math.round(Number(tier ?? 0))));
  if (t <= 0) return "you haven't let a man pull you anywhere yet";
  if (t === 1) return "you've let a man start reaching for you";
  if (t === 2) return "there are men now who've seen and heard things you can't call back";
  if (t === 3) return "you're far enough down this road that turning around means undoing what's already true";
  if (t === 4) return "a man has had you for real, baby — that's not a fantasy anymore, that's on the record";
  return "there's no version of you left that a man hasn't used — that's just who you are now";
}

// ─── Tier math (mirror descentDepth.ts + turnoutPull.ts) ────────────────────

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

/** Buckets a raw count into a small score (more sessions → higher). */
function bucket(n: number, steps: number[]): number {
  let score = 0;
  for (const step of steps) {
    if (n >= step) score += 1;
  }
  return score;
}

export interface DescentInputs {
  completedTrances: number;
  armedTriggers: number;
  /** Max phaseWeight() across the user's running reconditioning programs. */
  maxProgramPhaseWeight: number;
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

export interface TurnoutPullInputs {
  /** `turnout_ladder.ordinal` of her current rung (0 = T0, 8 = T8). */
  ordinal: number;
  /** Highest `ordinal` present in `turnout_ladder` (currently 8). */
  maxOrdinal: number;
}

/** Combines cursor position into one 0-5 pull tier. */
export function computeTurnoutTier(inputs: TurnoutPullInputs): number {
  const ordinal = Math.max(0, Math.round(inputs.ordinal || 0));
  const maxOrdinal = Math.max(0, Math.round(inputs.maxOrdinal || 0));
  if (maxOrdinal <= 0) return 0;

  const ratio = Math.min(1, ordinal / maxOrdinal);
  return Math.max(0, Math.min(5, Math.round(ratio * 5)));
}
