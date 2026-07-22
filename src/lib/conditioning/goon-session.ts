/**
 * Extended Arousal (Goon) Session Management
 *
 * Three-phase escalating sessions:
 *   Build    (0–15 min)  — warm up, light content
 *   Escalate (15–30 min) — increasing intensity and fantasy level
 *   Peak     (30–45 min) — maximum intensity, identity dissolution
 *
 * Content is pulled from content_curriculum and scaled by a hidden
 * intensity multiplier derived from the user's conditioning history.
 */

import { supabase } from '../supabase';
import { activateSessionDevice, deactivateSessionDevice } from './session-device';

// ============================================
// TYPES
// ============================================

export type GoonPhase = 'build' | 'escalate' | 'peak';

export interface GoonPlaylistItem {
  contentId: string;
  phase: GoonPhase;
  startMinute: number;
  endMinute: number;
  fantasyLevel: number;
  intensity: number;
}

export interface GoonSessionResult {
  sessionId: string;
  playlist: GoonPlaylistItem[];
}

export interface GoonSessionMetrics {
  peakArousal: number;
  edgeCount: number;
  averageHeartRate?: number;
  peakHeartRate?: number;
  deviceUsed: boolean;
  subjectiveIntensity?: number; // 1-10 self-report
}

// ============================================
// PHASE CONFIGURATION
// ============================================

const PHASE_CONFIG: Record<GoonPhase, {
  startMinute: number;
  endMinute: number;
  fantasyLevelRange: [number, number];
  intensityRange: [number, number];
}> = {
  build: {
    startMinute: 0,
    endMinute: 15,
    fantasyLevelRange: [1, 3],
    intensityRange: [20, 40],
  },
  escalate: {
    startMinute: 15,
    endMinute: 30,
    fantasyLevelRange: [3, 6],
    intensityRange: [40, 70],
  },
  peak: {
    startMinute: 30,
    endMinute: 45,
    fantasyLevelRange: [6, 10],
    intensityRange: [70, 100],
  },
};

// ============================================
// SESSION LIFECYCLE
// ============================================

/**
 * Start a new goon session.
 *
 * 1. Fetch user state for intensity calibration
 * 2. Calculate hidden intensity multiplier from conditioning history
 * 3. Build 3-phase escalating playlist from content_curriculum
 * 4. Create conditioning_sessions_v2 record
 */
export async function startGoonSession(
  userId: string,
  targetDuration: number
): Promise<GoonSessionResult> {
  // Fetch user state
  const [denialRes, arousalRes, profileRes] = await Promise.all([
    supabase
      .from('denial_state')
      .select('current_denial_day, is_locked')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('daily_arousal_plans')
      .select('current_arousal_level')
      .eq('user_id', userId)
      .eq('plan_date', new Date().toISOString().split('T')[0])
      .maybeSingle(),
    supabase
      .from('profile_foundation')
      .select('corruption_level')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const denialDay = denialRes.data?.current_denial_day || 0;
  const arousal = arousalRes.data?.current_arousal_level || 0;
  const corruption = profileRes.data?.corruption_level || 0;

  // Hidden intensity multiplier — scales with conditioning depth
  // More conditioned = harder sessions pushed automatically
  const intensityMultiplier = calculateIntensityMultiplier(
    denialDay,
    arousal,
    corruption
  );

  // Scale phase timing based on target duration
  const durationScale = targetDuration / 45; // 45 min is default

  // Learned preference bias (WS2): confident preferred themes float first.
  const preferredThemes = await loadPreferredThemes(userId);

  // Build playlist for all three phases
  const playlist: GoonPlaylistItem[] = [];

  for (const phase of ['build', 'escalate', 'peak'] as GoonPhase[]) {
    const config = PHASE_CONFIG[phase];
    const scaledStart = Math.round(config.startMinute * durationScale);
    const scaledEnd = Math.round(config.endMinute * durationScale);

    // Fantasy level scaled by phase range and multiplier
    const fantasyLevel = Math.round(
      config.fantasyLevelRange[0] +
      (config.fantasyLevelRange[1] - config.fantasyLevelRange[0]) * intensityMultiplier
    );

    const phaseContent = await getGoonPhaseContent(
      userId,
      phase,
      fantasyLevel,
      intensityMultiplier,
      preferredThemes
    );

    for (const item of phaseContent) {
      playlist.push({
        ...item,
        phase,
        startMinute: scaledStart,
        endMinute: scaledEnd,
      });
    }
  }

  // Create session record. conditioning_sessions_v2 real columns:
  // session_type, content_ids, content_sequence, duration_minutes,
  // phases, completed, started_at, ended_at (+ hr/arousal estimates).
  const contentIds = playlist.map((item) => item.contentId);
  const { data: session, error } = await supabase
    .from('conditioning_sessions_v2')
    .insert({
      user_id: userId,
      session_type: 'goon',
      started_at: new Date().toISOString(),
      duration_minutes: targetDuration,
      content_ids: contentIds,
      content_sequence: playlist,
      phases: {
        intensity_multiplier: intensityMultiplier,
        state_at_start: {
          denial_day: denialDay,
          arousal_level: arousal,
          corruption_level: corruption,
        },
      },
      completed: false,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create goon session: ${error.message}`);
  }

  // Activate Lovense device for build phase
  activateSessionDevice('goon', 'build', intensityMultiplier).catch(() => {});

  return {
    sessionId: session.id,
    playlist,
  };
}

/**
 * Stable re-sort: content whose category is one of the user's learned
 * preferred themes floats to the front, order otherwise preserved. Pure +
 * non-breaking — an empty preference set is the identity sort.
 */
export function biasByPreference<T extends { category?: string | null }>(
  items: T[],
  preferredThemes: Set<string>
): T[] {
  if (preferredThemes.size === 0) return items;
  return items
    .map((item, idx) => ({ item, idx, pref: item.category && preferredThemes.has(item.category.toLowerCase()) ? 0 : 1 }))
    .sort((a, b) => (a.pref - b.pref) || (a.idx - b.idx))
    .map((x) => x.item);
}

/**
 * Pull the user's learned preferred themes from erotic_preference_profile
 * (mig 198). Returns lowercased category strings only when the correlation
 * has enough confidence to be worth biasing on; otherwise an empty set.
 */
export async function loadPreferredThemes(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('erotic_preference_profile')
    .select('top_themes, correlation_confidence')
    .eq('user_id', userId)
    .maybeSingle();
  const confidence = Number(data?.correlation_confidence ?? 0);
  if (!data || confidence <= 0) return new Set();
  const raw = data.top_themes;
  const themes = Array.isArray(raw) ? raw : [];
  const out = new Set<string>();
  for (const t of themes) {
    const s = typeof t === 'string' ? t : (t && typeof t === 'object' && 'theme' in t ? String((t as { theme: unknown }).theme) : '');
    if (s) out.add(s.toLowerCase());
  }
  return out;
}

/**
 * Select content for a goon phase with escalating fantasy levels. When the
 * user has a confident erotic-preference profile, content matching a preferred
 * theme is ordered first (WS2 — the loop feeding back into content choice).
 */
export async function getGoonPhaseContent(
  userId: string,
  phase: GoonPhase,
  fantasyLevel: number,
  intensityMultiplier: number,
  preferredThemes: Set<string> = new Set()
): Promise<Pick<GoonPlaylistItem, 'contentId' | 'fantasyLevel' | 'intensity'>[]> {
  const config = PHASE_CONFIG[phase];

  // Calculate intensity range scaled by multiplier
  const minIntensity = Math.round(config.intensityRange[0] * intensityMultiplier);
  const maxIntensity = Math.round(
    Math.min(config.intensityRange[1] * intensityMultiplier, 100)
  );

  // Query content_curriculum for appropriate content.
  // Real column is `intensity` (not `intensity_level`).
  const { data: content, error } = await supabase
    .from('content_curriculum')
    .select('id, intensity, fantasy_level, media_type, category')
    .eq('user_id', userId)
    .gte('intensity', minIntensity)
    .lte('intensity', maxIntensity)
    .lte('fantasy_level', fantasyLevel + 1) // Allow slight overshoot
    .order('fantasy_level', { ascending: phase === 'build' }) // Build: ascending, others: descending
    .limit(getPhaseContentCount(phase));

  if (error) {
    console.error(`Failed to fetch ${phase} content:`, error.message);
    return [];
  }

  if (!content || content.length === 0) {
    // Fallback — fetch whatever is available at any intensity
    const { data: fallback } = await supabase
      .from('content_curriculum')
      .select('id, intensity, fantasy_level, category')
      .eq('user_id', userId)
      .order('intensity', { ascending: phase === 'build' })
      .limit(getPhaseContentCount(phase));

    return biasByPreference(fallback || [], preferredThemes).map((item) => ({
      contentId: item.id,
      fantasyLevel: item.fantasy_level || fantasyLevel,
      intensity: item.intensity || minIntensity,
    }));
  }

  return biasByPreference(content, preferredThemes).map((item) => ({
    contentId: item.id,
    fantasyLevel: item.fantasy_level || fantasyLevel,
    intensity: item.intensity || minIntensity,
  }));
}

/**
 * End a goon session — update record with metrics.
 */
export async function endGoonSession(
  sessionId: string,
  metrics: GoonSessionMetrics
): Promise<void> {
  // Stop device
  deactivateSessionDevice().catch(() => {});

  // Edges are now authoritative from session_edge_events (mig 695) — each
  // "edged" tap and each denial cycle writes a timestamped row during the
  // session. Tally them here instead of trusting a manual post-session count;
  // fall back to the passed metric only if no events landed.
  const { count: edgeEventCount } = await supabase
    .from('session_edge_events')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  const talliedEdges = typeof edgeEventCount === 'number' && edgeEventCount > 0
    ? edgeEventCount
    : metrics.edgeCount;
  const resolvedMetrics: GoonSessionMetrics = { ...metrics, edgeCount: talliedEdges };

  // conditioning_sessions_v2 has no `metrics`/`device_active` columns —
  // fold the session metrics into `phases` and map heart-rate/arousal
  // onto the real estimate fields.
  const { data: existing } = await supabase
    .from('conditioning_sessions_v2')
    .select('phases')
    .eq('id', sessionId)
    .maybeSingle();

  const mergedPhases = {
    ...((existing?.phases as Record<string, unknown> | null) ?? {}),
    metrics: resolvedMetrics,
  };

  const { error } = await supabase
    .from('conditioning_sessions_v2')
    .update({
      ended_at: new Date().toISOString(),
      completed: true,
      device_active: false,
      phases: mergedPhases,
      max_hr: metrics.peakHeartRate ?? null,
      avg_hr: metrics.averageHeartRate ?? null,
      arousal_level_estimated: metrics.peakArousal ?? null,
    })
    .eq('id', sessionId);

  if (error) {
    throw new Error(`Failed to end goon session: ${error.message}`);
  }
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Hidden intensity multiplier.
 *
 * Scales from 0.5 (new/low conditioning) to 1.5 (deeply conditioned).
 * Factors: denial day, current arousal, overall corruption level.
 * More conditioned subjects get pushed harder automatically.
 */
function calculateIntensityMultiplier(
  denialDay: number,
  arousal: number,
  corruption: number
): number {
  let multiplier = 0.5; // Base

  // Denial adds up to +0.3 (caps at day 30)
  multiplier += Math.min(denialDay / 30, 1) * 0.3;

  // Arousal adds up to +0.3 (caps at 10)
  multiplier += Math.min(arousal / 10, 1) * 0.3;

  // Corruption adds up to +0.4 (caps at 100)
  multiplier += Math.min(corruption / 100, 1) * 0.4;

  return Math.round(multiplier * 100) / 100; // Two decimal places
}

/**
 * Number of content items per phase.
 */
function getPhaseContentCount(phase: GoonPhase): number {
  switch (phase) {
    case 'build': return 3;
    case 'escalate': return 5;
    case 'peak': return 4;
  }
}
