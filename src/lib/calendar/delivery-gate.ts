// Delivery-time deferral helper.
//
// Outreach inserts always succeed immediately (the caller doesn't block on
// calendar state). What we DO is, at insert time, look at the user's recent
// freebusy_cache. If `nowOrSchedule` falls inside a busy window, return the
// window-end + 5min as `deliverAfter`. Otherwise return null.
//
// The consumer queries (proactive-outreach.ts:getPendingOutreach + the Today
// queue read in useTodayData.ts) gate by:
//   (deliver_after IS NULL OR deliver_after <= now())

export interface BusyWindow {
  window_start: string;
  window_end: string;
}

const BUFFER_MS = 5 * 60_000;

/**
 * Given the freebusy_cache rows for a user and the time we'd like to deliver
 * the outreach, return the deferred deliver-after time, or null if no defer.
 *
 * Pure function: no DB, no clock. Tests pass synthetic windows + nowMs.
 */
export function computeDeliverAfter(
  busyWindows: BusyWindow[],
  scheduleAtMs: number,
): Date | null {
  // Find the busy window that contains scheduleAtMs.
  for (const w of busyWindows) {
    const start = Date.parse(w.window_start);
    const end = Date.parse(w.window_end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (scheduleAtMs >= start && scheduleAtMs < end) {
      return new Date(end + BUFFER_MS);
    }
  }
  return null;
}
