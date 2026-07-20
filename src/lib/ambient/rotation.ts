/**
 * Focus rotation — the ambient window's attention model.
 *
 * The problem this solves: three equal columns split attention, and splitting
 * attention means scanning, which keeps the analytical mind switched on. That
 * is the opposite of what the surface is for.
 *
 * So exactly ONE column is hot at a time. It carries the only text on screen
 * at full contrast; the other two keep moving but dim and silent, holding the
 * peripheral fill and the three-panel look without competing for the eye. Hot
 * status hands off on a beat, which leads the eye left->centre->right instead
 * of pulling it three ways — and that handoff rhythm is itself entraining.
 *
 * Against that steady rhythm sits the counterweight: unpredictably, all three
 * columns go hot at once carrying the same word. Predictable rhythm alone is
 * merely calming; the irregular spike is what keeps the surface compelling.
 * Variable-ratio, so it can never be anticipated.
 *
 * Escalation ties them together — the longer the window has been open, the
 * tighter the beat and the more frequent the hits, so it builds rather than
 * flatlining.
 *
 * Pure functions on purpose: the component owns timers and React state, this
 * owns the model, and the model is what needs to be provable.
 */

export type AmbientChannel = 'identity' | 'estrogen' | 'turnout';

export const CHANNEL_ORDER: AmbientChannel[] = ['identity', 'estrogen', 'turnout'];

export interface EscalationInput {
  /** Minutes the window has been open this run. */
  openMinutes: number;
  /** The panel's configured cadence in seconds — the resting beat. */
  baseCadenceS: number;
}

/** Full escalation is reached after this long; beyond it the curve is flat. */
const ESCALATION_CEILING_MIN = 45;
/** At full escalation the beat runs this fraction of its resting length. */
const MIN_CADENCE_FACTOR = 0.55;

/** 0 at open, 1 at the ceiling. */
export function escalationFactor(openMinutes: number): number {
  if (!Number.isFinite(openMinutes) || openMinutes <= 0) return 0;
  return Math.min(1, openMinutes / ESCALATION_CEILING_MIN);
}

/**
 * The beat tightens as the session runs. Never below MIN_CADENCE_FACTOR of
 * resting — past that it stops reading as ambient and starts demanding
 * attention, which is a different surface.
 */
export function currentCadenceS({ openMinutes, baseCadenceS }: EscalationInput): number {
  const e = escalationFactor(openMinutes);
  const factor = 1 - (1 - MIN_CADENCE_FACTOR) * e;
  return Math.max(2, Math.round(baseCadenceS * factor));
}

/**
 * Probability that a given beat is a triple-hot hit rather than a normal
 * handoff. Rare at rest, roughly triple at full escalation — frequent enough
 * to be felt, never frequent enough to become the rhythm itself.
 */
export function hitProbability(openMinutes: number): number {
  const e = escalationFactor(openMinutes);
  return 0.04 + 0.08 * e;
}

export interface RotationState {
  /** Index into CHANNEL_ORDER of the hot column, or null during a hit. */
  hotIndex: number | null;
  /** Set when every column is hot at once carrying the same word. */
  hit: boolean;
  /** The shared word, only during a hit. */
  hitWord: string | null;
  /** Beats elapsed — drives the handoff order. */
  beat: number;
}

export const INITIAL_ROTATION: RotationState = {
  hotIndex: 0,
  hit: false,
  hitWord: null,
  beat: 0,
};

export interface AdvanceOptions {
  openMinutes: number;
  /** Channels the user has muted — skipped in the rotation entirely. */
  mutedChannels?: AmbientChannel[];
  hitWords: string[];
  /** Injected for tests; defaults to Math.random. */
  rand?: () => number;
}

/**
 * Advance one beat.
 *
 * A hit is always followed by a normal beat — back-to-back hits would read as
 * a malfunction rather than a spike, and the contrast is what gives the spike
 * its force.
 */
export function advanceRotation(prev: RotationState, opts: AdvanceOptions): RotationState {
  const rand = opts.rand ?? Math.random;
  const muted = new Set(opts.mutedChannels ?? []);
  const live = CHANNEL_ORDER.map((c, i) => ({ c, i })).filter(({ c }) => !muted.has(c));

  // Everything muted: nothing is hot, and no hit can fire.
  if (live.length === 0) {
    return { hotIndex: null, hit: false, hitWord: null, beat: prev.beat + 1 };
  }

  const beat = prev.beat + 1;

  // Hits need at least two live columns to read as a convergence, and never
  // follow another hit.
  const canHit = live.length >= 2 && !prev.hit && opts.hitWords.length > 0;
  if (canHit && rand() < hitProbability(opts.openMinutes)) {
    const word = opts.hitWords[Math.floor(rand() * opts.hitWords.length)] ?? opts.hitWords[0];
    return { hotIndex: null, hit: true, hitWord: word, beat };
  }

  // Normal handoff: next live column in order, wrapping.
  const currentPos = live.findIndex(({ i }) => i === prev.hotIndex);
  const nextPos = currentPos === -1 ? 0 : (currentPos + 1) % live.length;
  return { hotIndex: live[nextPos].i, hit: false, hitWord: null, beat };
}

/** Is this column carrying text right now? */
export function isColumnHot(state: RotationState, index: number): boolean {
  return state.hit || state.hotIndex === index;
}
