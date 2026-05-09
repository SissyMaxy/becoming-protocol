/**
 * Pure template-selection + voice-modulation logic for audio sessions.
 * No I/O — the edge function passes in already-fetched rows.
 *
 * Mirrored at supabase/functions/_shared/audio-session-selector.ts so the
 * Deno render function can import from a Deno-safe path. Keep them in sync.
 */

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
  | 'primer_universal';

export type AudioSessionIntensity = 'gentle' | 'firm' | 'cruel';

export interface AudioSessionTemplate {
  id: string;
  kind: AudioSessionKind;
  name: string;
  prompt_template: string;
  target_duration_minutes: number;
  affect_bias: string[];
  phase_min: number;
  intensity_tier: AudioSessionIntensity;
  active?: boolean;
}

export interface SelectorContext {
  kind: AudioSessionKind;
  /** User's current_phase from user_state (defaults to 1). */
  currentPhase: number;
  /** Today's mommy_mood.affect (lowercase token) — drives bias preference. */
  todayAffect: string | null;
  /** Requested tier; phase-gating may downgrade it. */
  requestedTier: AudioSessionIntensity;
  /**
   * Recent renders' template_ids for this user — selector deprioritizes
   * recently-used templates to keep variety. Empty array if none.
   */
  recentTemplateIds: string[];
}

/**
 * Per-kind affect preference. The TTS render function maps the chosen
 * affect through affectToVoiceSettings(); the per-kind list is what we
 * walk down looking for a match against today's mommy_mood.affect, and
 * the head element is the "default" if no match lands.
 */
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
};

/**
 * Phase-tier ceiling. Cruel content requires phase 3+; firm requires
 * phase 2+. A phase-1 user requesting cruel quietly gets gentle; a
 * phase-2 user requesting cruel gets firm. This is an architectural
 * gate, not a preference — cruel-tier copy presumes she's deep enough
 * to receive it as care, not damage.
 */
export function clampTierByPhase(
  requested: AudioSessionIntensity,
  phase: number,
): AudioSessionIntensity {
  if (requested === 'cruel' && phase < 3) {
    return phase >= 2 ? 'firm' : 'gentle';
  }
  if (requested === 'firm' && phase < 2) {
    return 'gentle';
  }
  return requested;
}

/**
 * Pick the best template for the requested kind given current phase,
 * tier, and today's affect. Returns null if no template is eligible
 * (which means the kind has no rows or the phase is too low for any
 * tier — both bugs in the seed catalog, not the selector).
 *
 * Selection priority:
 *   1. Tier match (after phase clamping)
 *   2. Affect bias contains today's affect
 *   3. Phase eligibility (phase_min <= currentPhase)
 *   4. NOT in recentTemplateIds (variety)
 *   5. Highest phase_min among ties (more advanced when eligible)
 *
 * Falls back relaxing (4) → (2) → (1) so a request always gets *something*
 * if any phase-eligible template exists.
 */
export function selectTemplate(
  templates: AudioSessionTemplate[],
  ctx: SelectorContext,
): { template: AudioSessionTemplate; tier: AudioSessionIntensity } | null {
  const tier = clampTierByPhase(ctx.requestedTier, ctx.currentPhase);
  const sameKind = templates.filter(
    (t) => t.kind === ctx.kind && t.active !== false,
  );
  if (sameKind.length === 0) return null;

  const phaseEligible = sameKind.filter((t) => t.phase_min <= ctx.currentPhase);
  if (phaseEligible.length === 0) return null;

  const recent = new Set(ctx.recentTemplateIds);

  const score = (t: AudioSessionTemplate): number => {
    let s = 0;
    if (t.intensity_tier === tier) s += 1000;
    if (
      ctx.todayAffect &&
      t.affect_bias.includes(ctx.todayAffect.toLowerCase())
    ) {
      s += 100;
    }
    if (!recent.has(t.id)) s += 10;
    s += t.phase_min;
    return s;
  };

  const sorted = [...phaseEligible].sort((a, b) => score(b) - score(a));
  return { template: sorted[0], tier };
}

/**
 * Substitute {{placeholders}} into a prompt_template. Unknown placeholders
 * are left as-is (so the prompt visibly fails review rather than getting
 * silently dropped) but a small whitelist of expected ones gets defaults
 * when the user lacks the underlying state.
 */
export interface PlaceholderValues {
  feminine_name?: string | null;
  honorific?: string | null;
  phase?: number | null;
  affect?: string | null;
  recent_slips?: number | null;
  recent_mantra?: string | null;
  duration_minutes: number;
  target_word_count: number;
  intensity_tier: AudioSessionIntensity;
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
  };
  return template.replace(/\{\{(\w+)\}\}/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(fallbacks, key)) {
      return fallbacks[key];
    }
    return full;
  });
}

/**
 * Words-per-minute for a TTS-paced narrative. Slightly under
 * conversational (160-180 wpm) because session prose is meditative.
 */
export const SESSION_WPM = 150;

export function targetWordCount(durationMinutes: number): number {
  return Math.max(60, Math.round(durationMinutes * SESSION_WPM));
}

/**
 * Resolve the affect that drives TTS modulation for a given kind,
 * preferring today's mood if it's already in the kind's bias list,
 * otherwise the first kind-default.
 */
export function resolveAffectForKind(
  kind: AudioSessionKind,
  todayAffect: string | null,
): string {
  const bias = KIND_AFFECT_BIAS[kind] ?? ['patient'];
  if (todayAffect) {
    const lower = todayAffect.toLowerCase().trim();
    if (bias.includes(lower)) return lower;
  }
  return bias[0];
}
