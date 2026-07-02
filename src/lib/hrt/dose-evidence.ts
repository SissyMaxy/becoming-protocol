/**
 * dose-evidence — pure grading + adherence logic for HRT dose photo evidence.
 *
 * Verify-don't-trust on the transition ladder. A dose "taken" is only fully
 * adherent when it carries a real, non-duplicate photo (pill/patch/vial/site).
 * A dose logged WITHOUT a photo is still allowed — we never force-block a
 * genuine dose — but it counts as self-reported, not verified.
 *
 * This module is deliberately pure (no supabase, no crypto, no I/O) so the
 * grading + dedup rules are unit-testable. The caller supplies the already-
 * computed sha256 of the photo bytes and the set of recently-seen hashes; the
 * hashing + storage happen at the call site (browser crypto.subtle in
 * FocusMode). A DB trigger (migration 645) is the server-side backstop that
 * re-enforces the same dedup rule regardless of what the client claims.
 *
 * House rules honoured here:
 *  - no-fabrication on active-HRT claims: adherence counts only rows that
 *    exist; verified adherence counts only rows with real evidence.
 *  - anti-circumvention: the same photo hash can't verify two doses.
 */

export type DoseEvidenceGrade = 'verified' | 'unverified' | 'duplicate';

export interface DoseEvidenceInput {
  /** Storage object path of the uploaded photo, or null if none captured. */
  photoPath: string | null | undefined;
  /** sha256 hex of the photo bytes, or null if no photo. */
  sha256: string | null | undefined;
  /** Hashes of the user's recent dose photos (for duplicate detection). */
  recentHashes: Iterable<string>;
}

export interface DoseEvidenceResult {
  verified: boolean;
  grade: DoseEvidenceGrade;
  /** Plain-English reason (audit trail / not user-facing copy). */
  reason: string;
}

/**
 * Grade a single dose's photo evidence.
 *  - no photo / no hash          → unverified (allowed, but not full adherence)
 *  - hash seen on a recent dose  → duplicate  (anti-gaming: reused photo)
 *  - novel photo present         → verified
 */
export function gradeDoseEvidence(input: DoseEvidenceInput): DoseEvidenceResult {
  const path = (input.photoPath ?? '').trim();
  const hash = (input.sha256 ?? '').trim().toLowerCase();

  if (!path || !hash) {
    return {
      verified: false,
      grade: 'unverified',
      reason: 'no photo captured — dose logged on self-report',
    };
  }

  const seen = input.recentHashes instanceof Set
    ? input.recentHashes
    : new Set(Array.from(input.recentHashes, h => String(h).trim().toLowerCase()));

  if (seen.has(hash)) {
    return {
      verified: false,
      grade: 'duplicate',
      reason: 'photo matches an earlier dose — the same picture cannot verify two doses',
    };
  }

  return {
    verified: true,
    grade: 'verified',
    reason: 'fresh photo evidence attached',
  };
}

export interface DoseRow {
  dose_taken_at: string | null;
  skipped: boolean | null;
  evidence_verified?: boolean | null;
}

export interface DoseAdherence {
  /** Doses marked taken with real, verified photo evidence. */
  takenVerified: number;
  /** Doses marked taken on self-report only (no verified photo). */
  takenUnverified: number;
  /** Doses explicitly logged as skipped. */
  skipped: number;
  /** All taken doses (verified + unverified). */
  totalTaken: number;
  /** All logged dose rows in the window. */
  total: number;
  /** Fraction of taken doses that are verified (0 when none taken). */
  verifiedRatio: number;
}

/**
 * Fold a window of dose rows into adherence counts, distinguishing verified
 * evidence from self-report. A row counts as "taken" only when it has a
 * dose_taken_at and is not skipped — never fabricate a dose that has no row.
 */
export function computeAdherence(doses: DoseRow[]): DoseAdherence {
  let takenVerified = 0;
  let takenUnverified = 0;
  let skipped = 0;

  for (const d of doses) {
    if (d.skipped) {
      skipped += 1;
      continue;
    }
    if (d.dose_taken_at != null) {
      if (d.evidence_verified) takenVerified += 1;
      else takenUnverified += 1;
    }
  }

  const totalTaken = takenVerified + takenUnverified;
  return {
    takenVerified,
    takenUnverified,
    skipped,
    totalTaken,
    total: doses.length,
    verifiedRatio: totalTaken > 0 ? takenVerified / totalTaken : 0,
  };
}

/**
 * Handler-facing adherence line (telemetry is allowed for the Handler; the
 * Mommy persona translates it downstream via the dommy-mommy phrase helpers).
 * Returns null when there are no dose rows at all — no rows, no claim.
 *
 * The Handler may only assert adherence is "strong" from VERIFIED doses; a
 * pile of self-reported doses reads as "logged, not yet proven".
 */
export function describeAdherence(a: DoseAdherence): string | null {
  if (a.total === 0) return null;

  const parts: string[] = [];
  parts.push(`${a.takenVerified} verified`);
  if (a.takenUnverified > 0) parts.push(`${a.takenUnverified} self-reported`);
  if (a.skipped > 0) parts.push(`${a.skipped} skipped`);

  let qualifier = '';
  if (a.totalTaken > 0) {
    if (a.takenVerified === 0) {
      qualifier = ' — all self-reported, none proven yet';
    } else if (a.verifiedRatio >= 0.8) {
      qualifier = ' — evidence is strong';
    } else if (a.verifiedRatio >= 0.5) {
      qualifier = ' — evidence is holding, ask for photos on the rest';
    } else {
      qualifier = ' — mostly unproven, press for photo evidence';
    }
  }

  return `Doses last 7d: ${parts.join(', ')}${qualifier}`;
}
