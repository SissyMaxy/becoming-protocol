// Aftercare shared selector — used by the mommy-aftercare edge function.
//
// Aftercare is the OFF switch. It is deliberately neutral: NO persona
// voice, NO pet names, NO kink content, NO distortion, NO telemetry.
// The catalog (aftercare_affirmations) is seeded with plain comforting
// prose; this selector picks a sequence appropriate to the entry.

export type AftercareEntryTrigger = 'post_safeword' | 'post_session' | 'post_cruel' | 'manual'
export type AftercareIntensity = 'none' | 'soft' | 'standard' | 'cruel'
export type AftercareCategory =
  | 'validation' | 'safety' | 'softness' | 'reality_anchor'
  | 'hydration' | 'breath_cue' | 'grounding'

export interface AftercareAffirmation {
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

// Banned tokens — if any catalog row contains these, it's a tagging
// mistake and the row must be excluded. This is the runtime guard that
// pairs with the negative test.
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

// Intensity-tier gate. If the catalog row's intensity_tier list is
// empty/null we treat it as universal.
function intensityMatches(row: AftercareAffirmation, intensity: AftercareIntensity): boolean {
  if (!row.intensity_tier || row.intensity_tier.length === 0) return true
  return row.intensity_tier.includes(intensity)
}

// Picks 5–7 affirmations across distinct categories, with at least one
// each from {safety, grounding, softness}. Always returns ≥5 items if
// the catalog has them; sums dwell to ≥60s. Filters out anything that
// fails isAftercareSafe (defense in depth — the catalog is curated, but
// if a future migration adds a bad row, the runtime catches it).
export function selectAftercareSequence(
  catalog: AftercareAffirmation[],
  intensity: AftercareIntensity,
  desiredCount = 6,
): SelectedAffirmation[] {
  const safe = catalog.filter(r => isAftercareSafe(r.text) && intensityMatches(r, intensity))
  if (safe.length === 0) return []

  // Group by category for round-robin selection.
  const byCat = new Map<AftercareCategory, AftercareAffirmation[]>()
  for (const r of safe) {
    if (!byCat.has(r.category)) byCat.set(r.category, [])
    byCat.get(r.category)!.push(r)
  }
  // Shuffle each bucket for variety.
  for (const arr of byCat.values()) shuffle(arr)

  // Required-first ordering: safety → grounding → softness, then
  // round-robin through the rest. For cruel/standard entries we lead
  // harder on safety + reality_anchor; for soft/none we keep the order
  // but bias to softness early.
  const priority: AftercareCategory[] =
    intensity === 'cruel' || intensity === 'standard'
      ? ['safety', 'reality_anchor', 'grounding', 'softness', 'breath_cue', 'validation', 'hydration']
      : ['safety', 'softness', 'grounding', 'validation', 'breath_cue', 'reality_anchor', 'hydration']

  const out: SelectedAffirmation[] = []
  const seen = new Set<string>()
  let dwellSum = 0

  // First pass: one from each priority category if available.
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

  // Second pass: top up until count and dwell hit minimums.
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

// Voice hint stays as DATA on each row's payload — neutral ElevenLabs
// settings (max stability, low style — no persona inflection). The TTS
// branch (feature/outreach-tts-2026-04-30) can read this without our
// code depending on theirs.
export const AFTERCARE_VOICE_HINT = {
  voice_profile: 'aftercare_neutral',
  stability: 0.95,
  style: 0.05,
  similarity_boost: 0.6,
} as const

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
}
