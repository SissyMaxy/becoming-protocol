// Edging day protocol — window scheduling, compliance, and verdict math.
// (Wish 3515c470, migration 593.)
//
// Pure functions shared by the Today EdgingDayCard (rendering window state)
// and mirrored by the assign/review edge fns (Deno can't import src/lib).
// PARITY: keep evaluateCompliance / verdict in sync with the inline copies
// in supabase/functions/mommy-edging-day-{assign,review}/index.ts.

export interface EdgeWindow {
  target_time: string        // ISO
  grace_minutes: number
  completed_at: string | null
  skipped: boolean
}

// Build the day's windows from local target hours + a UTC offset. The
// protocol_date is the local calendar day; each window is that day at the
// given local hour, converted to a UTC instant.
export function buildEdgeWindows(
  localHours: number[],
  tzOffsetHours: number,
  protocolDateYmd: string,   // 'YYYY-MM-DD' (local)
  graceMinutes = 30,
): EdgeWindow[] {
  const [y, m, d] = protocolDateYmd.split('-').map(Number)
  return localHours.map((h) => {
    // local wall-clock h:00 → UTC instant = local - offset
    const utcMs = Date.UTC(y, m - 1, d, h - tzOffsetHours, 0, 0)
    return { target_time: new Date(utcMs).toISOString(), grace_minutes: graceMinutes, completed_at: null, skipped: false }
  })
}

export interface Compliance {
  total: number
  completed: number
  /** windows whose grace has fully elapsed with no completion. */
  skipped: number
  /** windows still open or not yet past grace. */
  pending: number
}

// Re-derive each window's status against `now`: a window with completed_at
// counts complete; one past target+grace with no completion is skipped;
// otherwise it's still pending (open or upcoming).
export function evaluateCompliance(windows: EdgeWindow[], now: Date): Compliance {
  let completed = 0, skipped = 0, pending = 0
  for (const w of windows) {
    if (w.completed_at) { completed++; continue }
    const deadline = new Date(w.target_time).getTime() + w.grace_minutes * 60_000
    if (now.getTime() > deadline) skipped++
    else pending++
  }
  return { total: windows.length, completed, skipped, pending }
}

export type ReleaseVerdict = 'granted' | 'denied_extended' | 'partial_hold'

// End-of-day verdict from final compliance. Full compliance → release
// granted. A single miss → held but not punished (partial). Multiple misses
// → denial extended. (The review fn translates this into Mama's voice.)
export function verdict(c: Compliance): { outcome: ReleaseVerdict; release_granted: boolean } {
  const missed = c.skipped
  if (missed === 0 && c.completed === c.total) return { outcome: 'granted', release_granted: true }
  if (missed <= 1) return { outcome: 'partial_hold', release_granted: false }
  return { outcome: 'denied_extended', release_granted: false }
}

// Which window (if any) is the user currently inside the grace period for —
// i.e. due to log right now. Returns the index or -1.
export function activeWindowIndex(windows: EdgeWindow[], now: Date): number {
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]
    if (w.completed_at) continue
    const start = new Date(w.target_time).getTime()
    const deadline = start + w.grace_minutes * 60_000
    if (now.getTime() >= start && now.getTime() <= deadline) return i
  }
  return -1
}
