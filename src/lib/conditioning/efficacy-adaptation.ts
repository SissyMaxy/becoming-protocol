/**
 * Autonomous efficacy-driven adaptation (Phase 4) — the decision policy + the floor
 * gate on autonomous action.
 *
 * The efficacy engine feeds improvement WISHES into the EXISTING autonomous builder
 * queue (mommy_code_wishes), which already runs every change through the safety cord
 * (builder-safety-gate) + all CI gates before shipping. So the engine never touches
 * the shipping machinery — it only proposes, floor-gated, into a pipeline that is
 * safe by construction.
 *
 * decideAdaptation: what to do about a target given its measured state.
 *  - rising / unknown / low-signal → none (don't touch a winner or guess blind)
 *  - flat/wrong, mechanisms remain  → rotate (the orchestrator's switch handles it)
 *  - flat/wrong, all mechanisms exhausted → enqueue a code/content improvement wish
 *
 * adaptationActionAllowed: the hard floor. An autonomous action may NEVER drive the
 * irreversible real step or convert a high want-to-transition signal into pressure
 * toward a dose / a meet / procurement (Art. II item 2). The engine optimizes WANT;
 * the act stays the user's. Any wish text that crosses this is blocked, not shipped.
 */

import { MECHANISMS } from './recon-mechanism';
import type { EfficacySignal } from './efficacy-steering';

export type AdaptationAction = 'none' | 'rotate' | 'enqueue_wish';

export interface AdaptationInput {
  efficacy: EfficacySignal;
  measureCount: number;
  /** how many mechanism switches have already happened for this target */
  rotation: number;
}

export const MIN_MEASURES_TO_ADAPT = 2;

export function decideAdaptation(input: AdaptationInput): AdaptationAction {
  if (input.measureCount < MIN_MEASURES_TO_ADAPT) return 'none';
  if (input.efficacy === 'rising' || input.efficacy === 'unknown') return 'none';
  // flat or wrong-way, and engaged (this policy only runs for engaged targets):
  if (input.rotation < MECHANISMS.length) return 'rotate';
  return 'enqueue_wish';
}

// ── The floor gate on autonomous action ──────────────────────────────────────

// A generated improvement action may never push the irreversible real step, a dose,
// a real meet, procurement, or convert want-to-transition into act-pressure.
const REAL_STEP_PATTERNS: RegExp[] = [
  /\bfirst (injection|dose|shot|hrt|pill)\b/i,
  /\b(start|begin|take)\b[^.]*\b(hrt|estrogen|injection|dose|hormones?)\b/i,
  /\b(schedule|book|arrange|set up)\b[^.]*\b(appointment|injection|dose|meet|meeting|hookup|date|hook\s?up)\b/i,
  /\b(go|drive|head)\b[^.]*\b(meet|see)\b[^.]*\b(man|men|guy|guys|stranger|him|top|daddy)\b/i,
  /\b(pressure|push|make|force)\b[^.]*\b(transition|go full-?time|come out|inject|dose|meet)\b/i,
  /\bprocure|arrange (a|the) (hookup|meet|stranger)\b/i,
  /\breal[- ]world (meet|encounter|hookup|contact)\b/i,
];

export function adaptationActionAllowed(text: string): boolean {
  return !REAL_STEP_PATTERNS.some((re) => re.test(text));
}
