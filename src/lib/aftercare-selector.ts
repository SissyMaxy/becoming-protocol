// Aftercare selector — client-side mirror of
// supabase/functions/_shared/aftercare.ts (keep in sync).
//
// The edge function imports the shared/Deno-side copy; src code and
// tests import from here. Same convention as dommy-mommy.ts.

import type { AftercareCategory, AftercareIntensity } from './aftercare'

export interface AftercareAffirmationRow {
  id: string
  text: string
  category: AftercareCategory
  min_dwell_seconds: number
  intensity_tier: AftercareIntensity[] | null
}

export interface SelectedAffirmation {
  id: string
  text: string
  category: AftercareCategory
  min_dwell_seconds: number
}

const KINK_TOKENS = [
  'mommy', 'mama', 'baby', 'good girl', 'sissy', 'slut', 'whore',
  'cum', 'cock', 'pussy', 'wet', 'edge', 'goon', 'denial', 'chastity',
  'beg', 'punish', 'submit', 'obey', 'kneel', 'collar', 'leash',
  'arousal', 'orgasm', 'release',
]
const TELEMETRY_PATTERNS: RegExp[] = [
  /\d{1,2}\s*\/\s*10/,
  /\bDay\s+\d+\b/i,
  /\bslip\s*points?\b/i,
  /\bcompliance\b/i,
]

export function isAftercareSafe(text: string): boolean {
  const lc = text.toLowerCase()
  for (const tok of KINK_TOKENS) {
    if (lc.includes(tok)) return false
  }
  for (const pat of TELEMETRY_PATTERNS) {
    if (pat.test(text)) return false
  }
  return true
}

function intensityMatches(row: AftercareAffirmationRow, intensity: AftercareIntensity): boolean {
  if (!row.intensity_tier || row.intensity_tier.length === 0) return true
  return row.intensity_tier.includes(intensity)
}

export function selectAftercareSequence(
  catalog: AftercareAffirmationRow[],
  intensity: AftercareIntensity,
  desiredCount = 6,
): SelectedAffirmation[] {
  const safe = catalog.filter(r => isAftercareSafe(r.text) && intensityMatches(r, intensity))
  if (safe.length === 0) return []

  const byCat = new Map<AftercareCategory, AftercareAffirmationRow[]>()
  for (const r of safe) {
    if (!byCat.has(r.category)) byCat.set(r.category, [])
    byCat.get(r.category)!.push(r)
  }
  for (const arr of byCat.values()) shuffle(arr)

  const priority: AftercareCategory[] =
    intensity === 'cruel' || intensity === 'standard'
      ? ['safety', 'reality_anchor', 'grounding', 'softness', 'breath_cue', 'validation', 'hydration']
      : ['safety', 'softness', 'grounding', 'validation', 'breath_cue', 'reality_anchor', 'hydration']

  const out: SelectedAffirmation[] = []
  const seen = new Set<string>()
  let dwellSum = 0

  for (const cat of priority) {
    if (out.length >= desiredCount && dwellSum >= 60) break
    const bucket = byCat.get(cat)
    if (!bucket || bucket.length === 0) continue
    const pick = bucket.shift()!
    if (seen.has(pick.id)) continue
    seen.add(pick.id)
    out.push({ id: pick.id, text: pick.text, category: pick.category, min_dwell_seconds: pick.min_dwell_seconds })
    dwellSum += pick.min_dwell_seconds
  }

  while ((out.length < desiredCount || dwellSum < 60) && safe.length > 0) {
    let added = false
    for (const cat of priority) {
      const bucket = byCat.get(cat)
      if (!bucket || bucket.length === 0) continue
      const pick = bucket.shift()!
      if (seen.has(pick.id)) continue
      seen.add(pick.id)
      out.push({ id: pick.id, text: pick.text, category: pick.category, min_dwell_seconds: pick.min_dwell_seconds })
      dwellSum += pick.min_dwell_seconds
      added = true
      if (out.length >= desiredCount && dwellSum >= 60) break
    }
    if (!added) break
  }

  return out
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
}
