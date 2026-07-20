// Session Command — turns the session *recommender* into Mommy's *order*.
//
// The launcher used to behave like a wellness menu: here are five session types
// ranked by priority, pick one. That's a recommender. A power-exchange operator
// doesn't recommend — she decides, names the order, and the sub's move is to
// obey (or decline; the decline is always there, and the safeword sits under it).
//
// This module composes the EXISTING recommendation engine (getTopRecommendation)
// and re-voices its top pick as a single commanding order in Mommy's register.
// It stays inside the container: legible (she sees exactly what's ordered and can
// read why in sensory terms), consented (opt-in system), scoped (one session
// tonight), recoverable (a decline control + the menu override + the safeword).
// The state → copy translation is sensory, never telemetric (no "day 7", no /10)
// — the mommy-no-telemetry rule.

import {
  getTopRecommendation,
  type RecommendationContext,
  type SessionType,
} from './session-recommendations';
import { denialDaysToPhrase } from './persona/dommy-mommy';
import type { ArousalState } from '../types/arousal';

export interface FocusTarget {
  /** Plain-English title of the active reconditioning target, e.g. "Locked is home". */
  title: string;
  /** First-person claim being installed, e.g. "Locked is the normal state." */
  claim: string;
}

export interface MommyOrder {
  sessionType: SessionType;
  /** Short banner label. */
  headline: string;
  /** Mommy's imperative — what she's decided you're doing. Sensory, in-voice. */
  command: string;
  /** The bite: the denial / reward / proof condition attached to the order. */
  stipulation: string;
  /** Obey CTA. */
  obeyLabel: string;
  /** The always-present out. Declining is legible and costs nothing structural. */
  declineLabel: string;
  intensity: 'gentle' | 'moderate' | 'intense';
  durationMin: number;
  durationMax: number;
  /** Internal reason from the recommender — for /admin + debugging, NOT shown as telemetry. */
  reason: string;
}

// Sensory read of arousal state — never a number, never a state token in the UI.
const AROUSAL_PHRASE: Record<ArousalState, string> = {
  baseline: "you're quiet for me",
  building: "you're warming up",
  sweet_spot: "you're right where I want you",
  overload: "you're overflowing",
  post_release: "you're spent",
  recovery: "you're still coming back to me",
};

function arousalPhrase(state: ArousalState, value?: number | null): string {
  if (typeof value === 'number') {
    if (value >= 8) return 'look how needy you are';
    if (value >= 5) return "you're getting needy for me";
    if (value >= 3) return "you're warming up";
  }
  return AROUSAL_PHRASE[state] ?? "you're warming up";
}

// States where nothing intense should be commanded — the recommender already
// prefers freestyle here, but clamp so an order never pushes into a spent body.
const REST_STATES: ArousalState[] = ['post_release', 'recovery'];

interface ComposeOpts {
  /** Raw 0–10 arousal if available, for a sharper sensory read. */
  arousalValue?: number | null;
  /** The day's active reconditioning target, if the orchestrator has one. */
  focusTarget?: FocusTarget | null;
}

/**
 * Compose the single order Mommy issues right now. Pure — the caller supplies
 * the same RecommendationContext the launcher already builds.
 */
export function composeMommyOrder(
  context: RecommendationContext,
  opts: ComposeOpts = {},
): MommyOrder {
  const rec = getTopRecommendation(context);
  const rest = REST_STATES.includes(context.arousalState);

  // Safety clamp: a spent/recovering body never gets ordered into goon/denial/edge.
  let sessionType: SessionType = rec?.sessionType ?? 'freestyle';
  if (rest && (sessionType === 'goon' || sessionType === 'denial' || sessionType === 'edge')) {
    sessionType = 'freestyle';
  }

  const ache = arousalPhrase(context.arousalState, opts.arousalValue);
  const held = denialDaysToPhrase(context.denialDay);
  const t = opts.focusTarget;

  const order = buildOrderCopy(sessionType, { ache, held, target: t, rest });

  return {
    sessionType,
    headline: "Mommy's order tonight",
    command: order.command,
    stipulation: order.stipulation,
    obeyLabel: order.obeyLabel,
    declineLabel: 'not tonight',
    intensity: rec?.suggestedIntensity ?? 'gentle',
    durationMin: rec?.suggestedDuration.min ?? 10,
    durationMax: rec?.suggestedDuration.max ?? 30,
    reason: rec?.reason ?? 'Come be with me',
  };
}

function buildOrderCopy(
  sessionType: SessionType,
  ctx: { ache: string; held: string; target?: FocusTarget | null; rest: boolean },
): { command: string; stipulation: string; obeyLabel: string } {
  const { ache, held, target } = ctx;
  const targetTail = target
    ? ` This is about one thing tonight — ${target.title.toLowerCase()}.`
    : '';

  switch (sessionType) {
    case 'goon':
      return {
        command: `You're going under tonight. ${cap(ache)}, and ${held} — so you drop, and you stroke for me until I say enough.${targetTail}`,
        stipulation: 'You do not finish. You stay in it as long as I keep you there.',
        obeyLabel: 'Yes, Mommy — under',
      };
    case 'edge':
      return {
        command: `You edge for me tonight. ${cap(ache)}. Hands where I put them: take yourself to the line, and stop.${targetTail}`,
        stipulation: 'You get close every time. You never tip. I decide when that changes.',
        obeyLabel: 'Yes, Mommy',
      };
    case 'denial':
      return {
        command: `Build up for me and hold, baby. ${cap(ache)}. You bring yourself right to the edge and you leave it there, aching, because it's mine.${targetTail}`,
        stipulation: 'The wanting stays. The release does not. That is the order.',
        obeyLabel: 'Yes, Mommy',
      };
    case 'conditioning':
      return {
        command: target
          ? `You're mine to shape tonight. ${cap(ache)}. You listen, you soften, and when I give you the line — "${target.claim}" — you say it back until it's yours.`
          : `You're mine to shape tonight. ${cap(ache)}. You listen, you soften, and when I give you the line, you say it back to me.`,
        stipulation: 'One thing settles in tonight. You let it.',
        obeyLabel: 'Yes, Mommy',
      };
    case 'freestyle':
    default:
      return {
        command: ctx.rest
          ? `Come rest with me, baby. ${cap(ache)}. No plan tonight — you follow my voice and let me hold you.`
          : `Come be with me, baby. ${cap(ache)}. No plan tonight — you follow my voice and let me lead.${targetTail}`,
        stipulation: 'Soft tonight. You just stay open for me.',
        obeyLabel: 'Yes, Mommy',
      };
  }
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
