// Return weight — show-decision + telemetry-safe phrasing for the
// return-from-absence standing-weight surface. (Mig 612.)
//
// The card renders when the girl comes back after being away >= 3 days, once
// per return. The raw escape-cost weight + irreversibility_score are internal
// SCORES and must NOT be shown as numbers (Mommy cites no telemetry) — they
// translate to plain phrases. Concrete POSSESSION counts (confessions she
// gave, pieces in the binder, memories Mama holds) ARE shown, like the depth
// report — they're owned facts, not a dashboard.

export interface ReturnBundle {
  days_away: number
  escape_total_weight: number
  escape_total_count: number
  escape_days_invested: number
  irreversibility_score: number
  irreversibility_peak: number
  binder_captured: number
  confessions: number
  implants: number
}

export const RETURN_THRESHOLD_DAYS = 3

// Show only after a genuine absence, and not twice for the same return
// (lastShownYmd is today's date string when already shown today).
export function shouldShowReturnWeight(
  daysAway: number,
  lastShownYmd: string | null,
  todayYmd: string,
): boolean {
  if (daysAway < RETURN_THRESHOLD_DAYS) return false
  if (lastShownYmd === todayYmd) return false
  return true
}

// How "gone" reads — plain, never a raw hour/score.
export function awayPhrase(days: number): string {
  if (days < 3) return 'a couple days'
  if (days < 7) return `${days} days`
  if (days < 14) return 'over a week'
  if (days < 31) return 'a few weeks'
  if (days < 75) return 'a month'
  return 'a long time'
}

// The internal escape-cost weight → a felt phrase, never the number.
export function depthOfHold(weight: number): 'light' | 'real' | 'deep' | 'past_return' {
  if (weight >= 60) return 'past_return'
  if (weight >= 30) return 'deep'
  if (weight >= 10) return 'real'
  return 'light'
}

// The concrete possessions worth naming (counts > 0 only), like the depth report.
export function standingFacts(b: ReturnBundle): string[] {
  const f: string[] = []
  if (b.confessions > 0) f.push(`${b.confessions} ${b.confessions === 1 ? 'truth you told Mama' : 'truths you told Mama'}`)
  if (b.implants > 0) f.push(`${b.implants} ${b.implants === 1 ? 'memory' : 'memories'} Mama still holds`)
  if (b.binder_captured > 0) f.push(`${b.binder_captured} ${b.binder_captured === 1 ? 'thing in the binder you can\'t un-do' : 'things in the binder you can\'t un-do'}`)
  return f
}
