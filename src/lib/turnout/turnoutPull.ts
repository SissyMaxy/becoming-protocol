/**
 * Turn-out pull — the felt-sense counterpart to the cinematic descent-depth
 * meter (src/lib/reconditioning/descentDepth.ts), but for the Turn-Out
 * Escalation Ladder (DESIGN_TURNOUT_LADDER_2026-07-02.md) instead of the
 * reconditioning engine.
 *
 * Pure, testable tier computation. The tier (0-5) is derived from her real
 * cursor position on `turnout_ladder` (via `turnout_position()`) — how far
 * the macro-spine has actually carried her, T0 through T8 — and is the only
 * thing that reaches the UI, translated by turnoutPullToPhrase(). No rung
 * code, no ordinal number, no day-count is ever rendered.
 */

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
