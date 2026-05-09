// Deno-side mirror of src/lib/audio-sessions/template-selector.ts
// Edge function imports from here. Keep in sync with the src/ copy.

export type AudioSessionKind =
  | 'session_edge'
  | 'session_goon'
  | 'session_conditioning'
  | 'session_freestyle'
  | 'session_denial'
  | 'primer_posture'
  | 'primer_gait'
  | 'primer_sitting'
  | 'primer_hands'
  | 'primer_fullbody'
  | 'primer_universal'

export type AudioSessionIntensity = 'gentle' | 'firm' | 'cruel'

export interface AudioSessionTemplate {
  id: string
  kind: AudioSessionKind
  name: string
  prompt_template: string
  target_duration_minutes: number
  affect_bias: string[]
  phase_min: number
  intensity_tier: AudioSessionIntensity
  active?: boolean
}

export interface SelectorContext {
  kind: AudioSessionKind
  currentPhase: number
  todayAffect: string | null
  requestedTier: AudioSessionIntensity
  recentTemplateIds: string[]
}

export const KIND_AFFECT_BIAS: Record<AudioSessionKind, string[]> = {
  session_edge: ['aching', 'restless'],
  session_goon: ['hungry', 'delighted'],
  session_conditioning: ['patient', 'watching'],
  session_freestyle: ['delighted', 'amused'],
  session_denial: ['possessive', 'restless'],
  primer_posture: ['patient'],
  primer_gait: ['patient'],
  primer_sitting: ['patient'],
  primer_hands: ['patient'],
  primer_fullbody: ['patient'],
  primer_universal: ['patient'],
}

export function clampTierByPhase(
  requested: AudioSessionIntensity,
  phase: number,
): AudioSessionIntensity {
  if (requested === 'cruel' && phase < 3) {
    return phase >= 2 ? 'firm' : 'gentle'
  }
  if (requested === 'firm' && phase < 2) {
    return 'gentle'
  }
  return requested
}

export function selectTemplate(
  templates: AudioSessionTemplate[],
  ctx: SelectorContext,
): { template: AudioSessionTemplate; tier: AudioSessionIntensity } | null {
  const tier = clampTierByPhase(ctx.requestedTier, ctx.currentPhase)
  const sameKind = templates.filter(
    (t) => t.kind === ctx.kind && t.active !== false,
  )
  if (sameKind.length === 0) return null

  const phaseEligible = sameKind.filter((t) => t.phase_min <= ctx.currentPhase)
  if (phaseEligible.length === 0) return null

  const recent = new Set(ctx.recentTemplateIds)

  const score = (t: AudioSessionTemplate): number => {
    let s = 0
    if (t.intensity_tier === tier) s += 1000
    if (
      ctx.todayAffect &&
      t.affect_bias.includes(ctx.todayAffect.toLowerCase())
    ) {
      s += 100
    }
    if (!recent.has(t.id)) s += 10
    s += t.phase_min
    return s
  }

  const sorted = [...phaseEligible].sort((a, b) => score(b) - score(a))
  return { template: sorted[0], tier }
}

export interface PlaceholderValues {
  feminine_name?: string | null
  honorific?: string | null
  phase?: number | null
  affect?: string | null
  recent_slips?: number | null
  recent_mantra?: string | null
  duration_minutes: number
  target_word_count: number
  intensity_tier: AudioSessionIntensity
}

export function substitutePlaceholders(
  template: string,
  values: PlaceholderValues,
): string {
  const fallbacks: Record<string, string> = {
    feminine_name: values.feminine_name?.trim() || 'baby',
    honorific: values.honorific?.trim() || 'Mama',
    phase: values.phase != null ? String(values.phase) : '1',
    affect: values.affect?.trim() || 'patient',
    recent_slips:
      values.recent_slips != null ? String(values.recent_slips) : '0',
    recent_mantra: values.recent_mantra?.trim() || '',
    duration_minutes: String(values.duration_minutes),
    target_word_count: String(values.target_word_count),
    intensity_tier: values.intensity_tier,
  }
  return template.replace(/\{\{(\w+)\}\}/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(fallbacks, key)) {
      return fallbacks[key]
    }
    return full
  })
}

export const SESSION_WPM = 150

export function targetWordCount(durationMinutes: number): number {
  return Math.max(60, Math.round(durationMinutes * SESSION_WPM))
}

export function resolveAffectForKind(
  kind: AudioSessionKind,
  todayAffect: string | null,
): string {
  const bias = KIND_AFFECT_BIAS[kind] ?? ['patient']
  if (todayAffect) {
    const lower = todayAffect.toLowerCase().trim()
    if (bias.includes(lower)) return lower
  }
  return bias[0]
}
