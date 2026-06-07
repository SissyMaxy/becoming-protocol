/**
 * irreversible-proof — pure decision logic for the real-world proof binder.
 *
 * PARITY mirror of supabase/migrations/606_irreversible_proof_binder.sql
 * (trg_irrev_cc_gate + trg_gina_consent_withdraw) and the overdue selection
 * in supabase/functions/irreversible-proof-nudge/index.ts. The SQL triggers
 * are the enforcement chokepoint; this module lets the Binder UI and the
 * nudge fn reason about the same rules without re-deriving them.
 *
 * NON-NEGOTIABLE encoded here: a Gina-CC may ONLY queue when the MASTER
 * switch (Gina's own consent) is 'granted' AND Maxy opted this item in AND
 * the proof is actually captured. Any other master value (default 'never',
 * or 'withdrawn') blocks it. Withdrawal cancels every still-pending CC.
 */

export type GinaWitnessConsent = 'never' | 'granted' | 'withdrawn';
export type CcStatus = 'none' | 'queued' | 'sent' | 'cancelled';
export type EventStatus = 'pending' | 'captured' | 'cancelled';

export interface IrreversibleEventLike {
  status: EventStatus;
  gina_cc_opt_in: boolean;
  cc_status: CcStatus;
  proof_due_at?: string | null;
  last_nudged_at?: string | null;
}

/**
 * Master gate. The ONLY condition under which a CC is allowed to leave the
 * app. Mirrors the BOTH-must-hold rule in trg_irrev_cc_gate.
 */
export function ginaCcAllowed(
  masterConsent: GinaWitnessConsent,
  optedIn: boolean,
  status: EventStatus,
): boolean {
  return masterConsent === 'granted' && optedIn === true && status === 'captured';
}

/**
 * Compute the CC status a row SHOULD have, given the master switch + opt-in +
 * capture state + its current cc_status. Mirrors trg_irrev_cc_gate exactly:
 *  - no opt-in           → demote a stray 'queued' to 'none'
 *  - master not granted  → demote a stray 'queued' to 'none'
 *  - allowed + currently 'none' + captured → 'queued'
 *  - otherwise           → unchanged (preserves 'sent'/'cancelled')
 */
export function resolveCcStatus(
  masterConsent: GinaWitnessConsent,
  row: Pick<IrreversibleEventLike, 'status' | 'gina_cc_opt_in' | 'cc_status'>,
): CcStatus {
  if (!row.gina_cc_opt_in) {
    return row.cc_status === 'queued' ? 'none' : row.cc_status;
  }
  if (masterConsent !== 'granted') {
    return row.cc_status === 'queued' ? 'none' : row.cc_status;
  }
  if (row.status === 'captured' && row.cc_status === 'none') return 'queued';
  return row.cc_status;
}

/**
 * Retroactive withdrawal: when the master switch moves off 'granted', every
 * still-pending ('queued') CC is cancelled. Returns true if THIS row should
 * be cancelled by the withdrawal. Mirrors trg_gina_consent_withdraw.
 */
export function withdrawalCancels(
  newConsent: GinaWitnessConsent,
  row: Pick<IrreversibleEventLike, 'cc_status'>,
): boolean {
  return newConsent !== 'granted' && row.cc_status === 'queued';
}

/**
 * Is a pending item overdue for its proof, and not already nudged today?
 * Mirrors the selection in irreversible-proof-nudge.
 */
export function isOverdue(row: IrreversibleEventLike, now: Date = new Date()): boolean {
  if (row.status !== 'pending') return false;
  if (!row.proof_due_at) return false;
  if (new Date(row.proof_due_at).getTime() > now.getTime()) return false;
  if (row.last_nudged_at) {
    const since = now.getTime() - new Date(row.last_nudged_at).getTime();
    if (since < 20 * 60 * 60 * 1000) return false; // nudge at most ~daily
  }
  return true;
}
