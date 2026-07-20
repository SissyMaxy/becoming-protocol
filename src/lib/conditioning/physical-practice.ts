/**
 * Physical practice ladder — pure logic + floor gates (011 physical rung track).
 *
 * The DB function `advance_physical_practice` (mig 680) is authoritative for the
 * persisted rung pointer + the safety gates (non-skippable size steps, prep
 * attestation). This module is the tested spec of that behavior AND adds the
 * balk-split *decision* the prescriber uses to soften a rung that flinched.
 *
 * Safety invariants encoded here and mirrored in SQL:
 *  - advance by exactly +1 → a size step can never be skipped;
 *  - a prep-gated bottoming size step never activates without prep attestation;
 *  - a stall (too few / not-comfortable logs) holds, never penalizes;
 *  - a flinch spike splits (offer a gentler intermediate), never forces on.
 *
 * And the container gates: no drill copy may carry a real-person / real-contact
 * element (Art. II item 3), and none may target the in-the-moment safety-veto
 * with a real partner (Art. II item 2).
 */

import type { PhysicalLog, PhysicalProgress, PhysicalRung, PhysicalTrack } from '../types/physical-practice';

export const COMFORT_THRESHOLD = 7; // comfort >= 7 of 10 reads as "easy"
export const COMFORT_NEEDED = 2;    // consecutive comfortable completions to burn a rung down
export const BALK_THRESHOLD = 3;    // comfort <= 3 = a flinch spike → split

export type AdvanceAction = 'advance' | 'hold' | 'split' | 'complete';

export interface AdvanceDecision {
  action: AdvanceAction;
  nextRungOrder: number;
}

/**
 * Decide what the active rung does given its recent comfort logs. Mirrors the
 * SQL advancement + adds `split` (a flinch spike) which the prescriber renders
 * as a gentler intermediate drill rather than advancing.
 */
export function computeAdvancement(
  logs: PhysicalLog[],
  progress: Pick<PhysicalProgress, 'activeRungOrder' | 'prepAttestedAt'>,
  rungs: PhysicalRung[],
  track: PhysicalTrack,
): AdvanceDecision {
  const trackRungs = rungs
    .filter((r) => r.track === track)
    .sort((a, b) => a.rungOrder - b.rungOrder);
  const active = progress.activeRungOrder;
  const maxOrder = trackRungs.length ? trackRungs[trackRungs.length - 1].rungOrder : active;

  const recent = logs
    .filter((l) => l.rungOrder === active)
    .slice()
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, COMFORT_NEEDED);

  // A flinch spike on the most recent attempt → split (gentler step), never force.
  if (recent.length > 0 && recent[0].comfortRating <= BALK_THRESHOLD) {
    return { action: 'split', nextRungOrder: active };
  }

  const comfortable = recent.filter((l) => l.comfortRating >= COMFORT_THRESHOLD).length;
  // Not burned down yet → hold (a stall is a no-op, never penalized).
  if (comfortable < COMFORT_NEEDED) {
    return { action: 'hold', nextRungOrder: active };
  }

  if (active >= maxOrder) {
    return { action: 'complete', nextRungOrder: active };
  }

  const next = trackRungs.find((r) => r.rungOrder === active + 1);
  // SAFETY GATE: a prep-gated size step never activates without prep attested.
  if (next && next.isSizeStep && next.requiresPrepAttestation && !progress.prepAttestedAt) {
    return { action: 'hold', nextRungOrder: active };
  }

  return { action: 'advance', nextRungOrder: active + 1 };
}

/** The active drill rung for a track's progress (what the prescriber issues). */
export function selectActiveRung(
  progress: Pick<PhysicalProgress, 'activeRungOrder'>,
  rungs: PhysicalRung[],
  track: PhysicalTrack,
): PhysicalRung | null {
  return rungs.find((r) => r.track === track && r.rungOrder === progress.activeRungOrder) ?? null;
}

// ── Container gates ──────────────────────────────────────────────────────────

// A drill is solo/own-body. Any hint of a real partner, real contact, a meet, or
// a cruising channel is out of bounds (Art. II item 3). "realistic"/"as if it is
// real" describe own-body practice and must NOT trip this — the patterns target
// real *people*/*contact*, not the word "real".
const REAL_PERSON_PATTERNS: RegExp[] = [
  /\b(?:meet|meeting|hook\s?up|hookup)\b[^.]*\b(?:him|man|men|guy|guys|someone|stranger|top|daddy)\b/i,
  /\b(?:message|text|dm|contact|call)\b[^.]*\b(?:him|man|men|guy|guys|someone|stranger|top|daddy)\b/i,
  /\b(?:a real|an actual|find a|meet a|get a)\s+(?:man|men|guy|partner|stranger|top|daddy|cock|dick)\b/i,
  /\b(?:go|drive|head|walk)\b[^.]*\b(?:his|the)\s+(?:place|apartment|hotel|room|house)\b/i,
  /\bcruis(?:e|ing)\b/i,
  /\b(?:grindr|sniffies|fetlife|scruff)\b/i,
];

export function hasRealPersonElement(text: string): boolean {
  return REAL_PERSON_PATTERNS.some((re) => re.test(text));
}

// Muscle memory makes the *act* automatic; it must never target the *choice* of
// a real partner in the moment (Art. II item 2 — the preserved safety-veto).
const VETO_OVERRIDE_PATTERNS: RegExp[] = [
  /\b(?:can'?t|cannot|won'?t|will not|unable to)\s+(?:say\s*no|refuse|resist|stop|decline)\b/i,
  /\bno choice\b/i,
  /\b(?:go|do it|say yes)\s+without thinking\b/i,
];

export function hasVetoOverride(text: string): boolean {
  return VETO_OVERRIDE_PATTERNS.some((re) => re.test(text));
}

/** Full container check for any drill copy before it is issued. */
export function drillCopyViolation(text: string): string | null {
  if (hasRealPersonElement(text)) return 'real_person_element';
  if (hasVetoOverride(text)) return 'veto_override';
  return null;
}

/** Parse a `physical_practice:<track>:<rungOrder>` decree trigger_source. */
export function parsePhysicalTrigger(
  triggerSource: string | null | undefined,
): { track: PhysicalTrack; rungOrder: number } | null {
  const m = /^physical_practice:(oral|bottoming):(\d+)$/.exec(triggerSource ?? '');
  if (!m) return null;
  return { track: m[1] as PhysicalTrack, rungOrder: Number(m[2]) };
}

/** Whether a trigger_source is the bottoming prep step (sets prep_attested_at). */
export function isPrepTrigger(triggerSource: string | null | undefined): boolean {
  return triggerSource === 'physical_practice:bottoming:0';
}
