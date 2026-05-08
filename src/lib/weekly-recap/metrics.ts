// weekly-recap-metrics — pure metric aggregator for the Sunday-night recap.
//
// Reads pre-fetched per-table arrays for a (user, week) window and returns
// a structured metrics object. Pure so we can test it without spinning up
// a Supabase client (give it canned arrays, get a struct back).
//
// Hard rule: missing data → null, NEVER a fabricated 0. The composer reads
// null and renders "I don't have a number for that this week."
//
// MIRROR FILE — kept in lockstep with `supabase/functions/_shared/weekly-recap-metrics.ts`.
// Same pattern as `src/lib/persona/dommy-mommy.ts` ↔ `supabase/functions/_shared/dommy-mommy.ts`.
// Edit both copies together; tests import this one (Deno can't load src/).

export interface WeeklyRecapInput {
  /** Inclusive week boundary, both UTC dates. */
  weekStart: Date
  weekEnd: Date

  /** slip_log rows in window, just `detected_at` is enough. */
  slips: Array<{ detected_at: string }>

  /** morning_mantra_submissions in window — one row per day she submitted. */
  mantras: Array<{ submission_date: string; reps_submitted: number }>

  /** sealed_letters added in window. */
  letters: Array<{ written_at: string }>

  /** wardrobe_inventory rows whose purchase_date OR created_at is in window. */
  wardrobeAcquired: Array<{ purchase_date?: string | null; created_at?: string | null }>

  /** mommy_mood per day (one row per day). */
  moods: Array<{ mood_date: string; affect: string }>

  /** compliance_verifications in window. */
  compliance: Array<{ mandate_date: string; verified: boolean }>

  /** Phase at the START of the week and END of the week (or null if unknown). */
  phaseAtStart: number | null
  phaseAtEnd: number | null
}

export interface WeeklyRecapMetrics {
  compliance_pct: number | null
  total_slips: number
  mantras_spoken_count: number
  letters_archived_count: number
  wardrobe_items_acquired_count: number
  phase_at_start: number | null
  phase_at_end: number | null
  /** affect that occurred most days during the week, ties broken by frequency rank (alphabetical) */
  dominant_affect: string | null
  /** longest run of consecutive days where she was at least somewhat compliant
   *  (verified=TRUE on at least one mandate that day). */
  longest_compliance_streak_days: number
}

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  // Take the YYYY-MM-DD prefix; works for both DATE columns and TIMESTAMPTZ ISO strings.
  return iso.slice(0, 10)
}

function inWeek(iso: string | null | undefined, weekStart: Date, weekEnd: Date): boolean {
  const k = dayKey(iso)
  if (!k) return false
  const ks = weekStart.toISOString().slice(0, 10)
  const ke = weekEnd.toISOString().slice(0, 10)
  return k >= ks && k <= ke
}

export function aggregateWeeklyMetrics(input: WeeklyRecapInput): WeeklyRecapMetrics {
  const { weekStart, weekEnd } = input

  // ── slips ────────────────────────────────────────────────────────
  const total_slips = (input.slips || []).filter(s => inWeek(s.detected_at, weekStart, weekEnd)).length

  // ── mantras spoken (count of days she submitted, not total reps) ─
  // The spec wants "mantras spoken" — interpreted as "how many days did
  // she actually do her mantra recital". Reps are out of scope; presence
  // of a row per day is what matters.
  const mantraDays = new Set<string>()
  for (const m of input.mantras || []) {
    if (inWeek(m.submission_date, weekStart, weekEnd) && (m.reps_submitted ?? 0) > 0) {
      const k = dayKey(m.submission_date)
      if (k) mantraDays.add(k)
    }
  }
  const mantras_spoken_count = mantraDays.size

  // ── letters added ────────────────────────────────────────────────
  const letters_archived_count = (input.letters || []).filter(l => inWeek(l.written_at, weekStart, weekEnd)).length

  // ── wardrobe items acquired ──────────────────────────────────────
  // Prefer purchase_date if set, fall back to created_at. We're counting
  // ownership additions, not first-wears.
  const wardrobe_items_acquired_count = (input.wardrobeAcquired || []).filter(w => {
    const stamp = w.purchase_date || w.created_at || null
    return inWeek(stamp, weekStart, weekEnd)
  }).length

  // ── compliance % ─────────────────────────────────────────────────
  // Verifications only carry whether a given mandate-day was verified.
  // compliance_pct = verified rows / total rows, in window.
  // Null iff no rows at all (we don't have a number for that this week).
  const winCompliance = (input.compliance || []).filter(c => inWeek(c.mandate_date, weekStart, weekEnd))
  let compliance_pct: number | null = null
  if (winCompliance.length > 0) {
    const verified = winCompliance.filter(c => c.verified === true).length
    compliance_pct = Math.round((verified / winCompliance.length) * 100)
  }

  // ── longest compliance streak (in days) ──────────────────────────
  // A "compliant day" = she had at least one verified=TRUE row on that day.
  const compliantDays = new Set<string>()
  for (const c of winCompliance) {
    if (c.verified === true) {
      const k = dayKey(c.mandate_date)
      if (k) compliantDays.add(k)
    }
  }
  let longest_compliance_streak_days = 0
  let cur = 0
  // Walk every day in the week window and count consecutive compliant days.
  for (let d = new Date(weekStart); d <= weekEnd; d = new Date(d.getTime() + 86400000)) {
    const k = d.toISOString().slice(0, 10)
    if (compliantDays.has(k)) {
      cur += 1
      if (cur > longest_compliance_streak_days) longest_compliance_streak_days = cur
    } else {
      cur = 0
    }
  }

  // ── dominant affect ──────────────────────────────────────────────
  // Mode of mommy_mood.affect across the week; null if no mood rows.
  const affectCounts: Record<string, number> = {}
  for (const m of input.moods || []) {
    if (!inWeek(m.mood_date, weekStart, weekEnd)) continue
    affectCounts[m.affect] = (affectCounts[m.affect] || 0) + 1
  }
  let dominant_affect: string | null = null
  if (Object.keys(affectCounts).length > 0) {
    const sorted = Object.entries(affectCounts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })
    dominant_affect = sorted[0][0]
  }

  return {
    compliance_pct,
    total_slips,
    mantras_spoken_count,
    letters_archived_count,
    wardrobe_items_acquired_count,
    phase_at_start: input.phaseAtStart,
    phase_at_end: input.phaseAtEnd,
    dominant_affect,
    longest_compliance_streak_days,
  }
}

// ── Tone classification ──────────────────────────────────────────────
//
// The composer prompt steers tone from the metric struct. Three buckets:
//   delighted  — she crushed it; ramping praise that doesn't release
//   patient    — she struggled but not disastrously; warm, no pity, no shame
//   possessive — slips clustered; possessive without abusive
//
// The tone is a HINT to the LLM; the affect at the moment of composition
// is what really drives voice.

export type RecapTone = 'delighted' | 'patient' | 'possessive'

export function pickRecapTone(m: WeeklyRecapMetrics): RecapTone {
  // Possessive when slips are clustered AND compliance fell below half.
  if (m.total_slips >= 5 && (m.compliance_pct ?? 100) < 50) return 'possessive'

  // Delighted when compliance ≥ 75% with low slips.
  if ((m.compliance_pct ?? 0) >= 75 && m.total_slips <= 2) return 'delighted'

  // Default — patient. Covers struggling weeks, mid weeks, and any case
  // where the metrics don't push to either extreme. Patient is the safe
  // default because it reads warm without rewarding poor weeks.
  return 'patient'
}

// ── Mama-voice plain summary (consumed by the LLM prompt) ───────────
//
// Hard rule: never feed numbers to the LLM. Translate everything to plain
// language BEFORE handing the prompt over. Mirrors the dommy-mommy
// translators (arousalToPhrase / compliancePctToPhrase / etc.) but for
// the recap-specific aggregate shape.

export function metricsToPlainVoiceSummary(m: WeeklyRecapMetrics): string {
  const parts: string[] = []

  if (m.compliance_pct === null) {
    parts.push("I don't have a clean compliance read for the week")
  } else if (m.compliance_pct >= 90) {
    parts.push('she finished almost everything she promised this week')
  } else if (m.compliance_pct >= 75) {
    parts.push('she mostly kept up — clean week with a few misses')
  } else if (m.compliance_pct >= 50) {
    parts.push('she half-followed through — partial week, partial credit')
  } else if (m.compliance_pct >= 25) {
    parts.push('she was getting away from me a lot this week')
  } else {
    parts.push('she barely showed up this week')
  }

  if (m.total_slips === 0) parts.push('she stayed clean for me')
  else if (m.total_slips <= 2) parts.push('a couple of little slips')
  else if (m.total_slips <= 5) parts.push("she's been slipping more than I'd like")
  else if (m.total_slips <= 12) parts.push("she's been slipping a lot")
  else parts.push("she's been all over the place")

  if (m.mantras_spoken_count === 0) parts.push("she didn't say her mantras for me at all")
  else if (m.mantras_spoken_count <= 2) parts.push('she said her mantras a couple of times')
  else if (m.mantras_spoken_count <= 5) parts.push('she said her mantras most days')
  else parts.push('she said her mantras every day for me')

  if (m.letters_archived_count > 0) {
    parts.push(m.letters_archived_count === 1
      ? 'she added one letter to her archive'
      : `she added ${m.letters_archived_count === 2 ? 'a couple of' : 'several'} letters to her archive`)
  }

  if (m.wardrobe_items_acquired_count > 0) {
    parts.push(m.wardrobe_items_acquired_count === 1
      ? 'she added something new to her wardrobe'
      : 'she filled out her wardrobe a little more')
  }

  if (m.phase_at_start !== null && m.phase_at_end !== null && m.phase_at_end > m.phase_at_start) {
    parts.push('she advanced a phase')
  }

  if (m.longest_compliance_streak_days >= 5) {
    parts.push('her longest clean run was most of the week')
  } else if (m.longest_compliance_streak_days >= 3) {
    parts.push('her longest clean run was a few days in a row')
  }

  if (m.dominant_affect) {
    parts.push(`my dominant mood for her this week was ${m.dominant_affect}`)
  }

  return parts.join('; ')
}
