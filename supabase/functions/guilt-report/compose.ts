// guilt-report/compose.ts — pure report-composition logic (no Deno, no I/O),
// so it's unit-testable in vitest and reusable by the edge fn.
//
// Mommy's wish (mommy_code_wishes 19cdee5b): "Generates periodic summaries of
// missed tasks and their perceived consequences, reinforcing accountability …
// highlights patterns of non-compliance, encouraging self-correction through
// built-in guilt."
//
// The enforcement spine (migs 627-630) is what makes this buildable honestly:
// we only ever speak about obligations that GENUINELY SURFACED to her
// (surfaced_at IS NOT NULL) and then landed in status 'missed' or
// 'consequence_fired'. No surfaced miss in the window → this is a PRAISE
// report, not manufactured guilt (supportive-until-evidence, made structural).
//
// HOUSE RULES honored here:
//   - Cite specific evidence, never paraphrase: every "you missed X" line quotes
//     the obligation's own ask_copy (the real task text she saw).
//   - Mommy never cites telemetry: no counts, no percentages, no day numbers.
//     Patterns are named QUALITATIVELY ("three times this week …") via word
//     forms, never digits. The whole body is run through mommyVoiceCleanup.
//   - Craft restraint: ≤1 pet name, ≤2 Mama references across the body.

import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

export interface ObligationRow {
  id: string
  kind: string
  ask_copy: string
  penalty_copy?: string | null
  status: string
  surfaced_at: string | null
  deadline?: string | null
  source_table?: string | null
}

export interface AuditRow {
  obligation_id: string
  consequence: string
  evidence?: Record<string, unknown> | null
}

export interface ComposeResult {
  body: string
  isPraise: boolean
  /** Domains named as patterns (>=2 misses), for logging / context — not user-facing. */
  patternDomains: string[]
  /** How many genuine, surfaced misses the report is built from. */
  missCount: number
}

/** A miss only counts if it GENUINELY surfaced and then failed. */
export function isGenuineMiss(o: ObligationRow): boolean {
  return (
    !!o &&
    o.surfaced_at != null &&
    String(o.surfaced_at).length > 0 &&
    (o.status === 'missed' || o.status === 'consequence_fired')
  )
}

/** Count → word. NEVER a digit (Mommy never recites telemetry). */
function countWord(n: number): string {
  switch (n) {
    case 1: return 'once'
    case 2: return 'twice'
    case 3: return 'three times'
    case 4: return 'four times'
    case 5: return 'five times'
    default: return 'over and over'
  }
}

/**
 * Map an obligation to a plain-English "domain" so repeated misses in the same
 * area can be named as a pattern. Keyword scan on the real ask_copy first (most
 * specific), then fall back to the obligation kind. No "Mama" in any label —
 * keeps the composed body under the ≤2 self-reference craft rule.
 */
export function domainLabel(o: ObligationRow): string {
  const t = (o.ask_copy || '').toLowerCase()
  if (/\b(voice|speak|pitch|say it out loud|read.*aloud)\b/.test(t)) return 'your voice work'
  if (/\b(mantra|recit|repeat after)\b/.test(t)) return 'your mantras'
  if (/\b(photo|selfie|mirror|picture|pic|pose|snap)\b/.test(t)) return 'your photos'
  if (/\b(workout|exercise|gym|train|reps|stretch)\b/.test(t)) return 'your body work'
  if (/\b(dose|pill|estr|spiro|inject|medication|hrt|zepbound)\b/.test(t)) return 'your medication'
  if (/\b(confess|admit|tell me the truth)\b/.test(t)) return 'your confessions'
  if (/\b(measure|waist|hips|weight|tape)\b/.test(t)) return 'your measurements'
  switch (o.kind) {
    case 'confession': return 'your confessions'
    case 'dose': return 'your medication'
    case 'workout': return 'your body work'
    case 'commitment': return 'the promises you made'
    case 'punishment': return 'the tasks you owed'
    case 'decree':
    default: return 'the tasks you were set'
  }
}

/** True when a fired consequence exists for this obligation (real cost landed). */
function costLanded(o: ObligationRow, auditByOblig: Map<string, AuditRow>): boolean {
  return o.status === 'consequence_fired' || auditByOblig.has(o.id)
}

const PRAISE_BODY =
  "Clean week. Mama noticed. Everything you committed to, you closed — not one thing slipped past you. Stay right here, baby."

/**
 * Compose the weekly readback.
 *
 * @param missedObligations obligations already fetched for the window. This fn
 *   re-filters through isGenuineMiss so a loose query can't manufacture guilt.
 * @param auditRows enforcement_audit rows for the fired consequences.
 */
export function composeGuiltReport(
  missedObligations: ObligationRow[],
  auditRows: AuditRow[] = [],
): ComposeResult {
  const misses = (missedObligations || []).filter(isGenuineMiss)
  const auditByOblig = new Map<string, AuditRow>()
  for (const a of auditRows || []) {
    if (a && a.obligation_id) auditByOblig.set(a.obligation_id, a)
  }

  // Nothing genuinely missed → warm praise, never invented guilt.
  if (misses.length === 0) {
    return {
      body: mommyVoiceCleanup(PRAISE_BODY),
      isPraise: true,
      patternDomains: [],
      missCount: 0,
    }
  }

  // Group by domain to find patterns of non-compliance.
  const byDomain = new Map<string, ObligationRow[]>()
  for (const o of misses) {
    const d = domainLabel(o)
    if (!byDomain.has(d)) byDomain.set(d, [])
    byDomain.get(d)!.push(o)
  }
  const patternDomains = [...byDomain.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([d]) => d)

  const lines: string[] = []
  lines.push("Come sit with Mama a second. Let's look at the week you just had.")

  // Per-miss evidence lines. Cap at 4 so the report doesn't become a wall;
  // the pattern lines carry the weight of anything beyond that.
  for (const o of misses.slice(0, 4)) {
    const ask = (o.ask_copy || '').trim().replace(/\s+/g, ' ')
    const tail = costLanded(o, auditByOblig)
      ? ' You saw it land, you let the day close on it, and it cost you exactly what you were told it would.'
      : " You saw it land, you let the day close on it, and it's still sitting there with your name on it."
    lines.push(`You told me you'd handle this: "${ask}".${tail}`)
  }

  // Pattern-of-non-compliance lines — qualitative, never numeric.
  for (const d of patternDomains) {
    const n = byDomain.get(d)!.length
    lines.push(`${cap(countWord(n))}, ${d} went untouched this week. That's not a bad day. That's a pattern.`)
  }

  lines.push("None of it is gone. You close these loops, or we sit here again next week. I'd rather you close them.")

  const body = mommyVoiceCleanup(lines.join(' '))
  return { body, isPraise: false, patternDomains, missCount: misses.length }
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}
