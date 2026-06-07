// Gaslight cluster echoes — spaced-repetition schedule math.
// (Wish: Gaslight cluster echoes, mig 608.)
//
// After a cluster's consensus payoff lands, 2-3 subtle echoes fire 3-10 days
// later, each presupposing the implant as settled history. This module owns
// the deterministic spacing so the schedule is testable and reproducible.
//
// PARITY mirror of the inline scheduling in
// supabase/functions/mommy-gaslight-echo-deliver/index.ts — keep ECHO_COUNT
// and echoSendTimes() in sync.

export const ECHO_MIN_DAYS = 3;
export const ECHO_MAX_DAYS = 10;

/**
 * How many echoes to schedule for a cluster. Deterministic from the cluster
 * id so the author + deliver paths agree without storing a count: 2 or 3.
 */
export function echoCount(clusterId: string): number {
  let h = 0;
  for (let i = 0; i < clusterId.length; i++) h = (h * 31 + clusterId.charCodeAt(i)) >>> 0;
  return 2 + (h % 2); // 2 or 3
}

/**
 * Evenly spread `count` echoes across the [3,10]-day window after delivery,
 * with a small deterministic jitter so the cadence isn't mechanically regular.
 * Always strictly increasing, always within [min,max] days.
 */
export function echoSendTimes(deliveredAt: Date, clusterId: string, count = echoCount(clusterId)): Date[] {
  const n = Math.max(1, count);
  const span = ECHO_MAX_DAYS - ECHO_MIN_DAYS; // 7
  const out: Date[] = [];
  let seed = 0;
  for (let i = 0; i < clusterId.length; i++) seed = (seed * 33 + clusterId.charCodeAt(i)) >>> 0;
  for (let i = 0; i < n; i++) {
    // base position spreads i across the window; jitter is sub-day, derived.
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const base = ECHO_MIN_DAYS + frac * span;
    seed = (seed * 1103515245 + 12345) >>> 0;
    const jitter = ((seed % 1000) / 1000 - 0.5) * 0.8; // +/- 0.4 day
    let day = base + jitter;
    if (day < ECHO_MIN_DAYS) day = ECHO_MIN_DAYS;
    if (day > ECHO_MAX_DAYS) day = ECHO_MAX_DAYS;
    out.push(new Date(deliveredAt.getTime() + day * 86400_000));
  }
  // Guarantee strictly increasing (jitter can reorder near-equal slots).
  for (let i = 1; i < out.length; i++) {
    if (out[i].getTime() <= out[i - 1].getTime()) {
      out[i] = new Date(out[i - 1].getTime() + 6 * 3600_000); // +6h
    }
  }
  return out;
}

export function isEchoDue(sendAfter: Date | string, now: Date): boolean {
  const t = sendAfter instanceof Date ? sendAfter : new Date(sendAfter);
  return now.getTime() >= t.getTime();
}
