/**
 * Automated Content Library Growth (P12.5)
 *
 * Analyzes the content_curriculum table to find gaps in the
 * phase × category matrix, then queues generation directives
 * to fill them. Runs weekly or on-demand.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

/** All 16 categories from content_curriculum CHECK constraint */
const ALL_CATEGORIES = [
  'identity',
  'feminization',
  'surrender',
  'chastity',
  'desire_installation',
  'dumbification',
  'compliance',
  'trigger_installation',
  'amnesia',
  'resistance_reduction',
  'sleep_induction',
  'morning_ritual',
  'ambient',
  'trance_deepening',
  'shame_inversion',
  'arousal_binding',
] as const;

/** Phases 1-6 */
const ALL_PHASES = [1, 2, 3, 4, 5, 6] as const;

/** Minimum scripts per combination before it's considered a gap */
const MIN_SCRIPTS_PER_COMBO = 2;

export interface ContentGap {
  phase: number;
  category: string;
  currentCount: number;
  priority: number; // higher = more urgent
}

export interface LibraryStats {
  totalScripts: number;
  byPhase: Record<number, number>;
  byCategory: Record<string, number>;
  gaps: ContentGap[];
  coveragePercent: number;
}

// ============================================
// GET CONTENT GAPS
// ============================================

/**
 * Analyze content_curriculum to find missing phase × category combinations.
 * Returns gaps sorted by priority: current phase gaps first, then adjacent phases.
 */
export async function getContentGaps(userId: string): Promise<ContentGap[]> {
  try {
    // Get user's current conditioning phase
    const { data: stateRow } = await supabase
      .from('user_conditioning_state')
      .select('current_phase')
      .eq('user_id', userId)
      .maybeSingle();

    const currentPhase = (stateRow?.current_phase as number) ?? 1;

    // Get all scripts grouped by phase + category
    const { data: scripts } = await supabase
      .from('content_curriculum')
      .select('conditioning_phase, category')
      .eq('user_id', userId);

    // Build count map
    const countMap = new Map<string, number>();
    for (const s of scripts ?? []) {
      if (s.conditioning_phase == null || !s.category) continue;
      const key = `${s.conditioning_phase}:${s.category}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    // Find gaps
    const gaps: ContentGap[] = [];
    for (const phase of ALL_PHASES) {
      for (const category of ALL_CATEGORIES) {
        const key = `${phase}:${category}`;
        const count = countMap.get(key) ?? 0;
        if (count < MIN_SCRIPTS_PER_COMBO) {
          // Priority: current phase = 10, adjacent = 7, others = 3
          const phaseDist = Math.abs(phase - currentPhase);
          const priority = phaseDist === 0 ? 10 : phaseDist === 1 ? 7 : 3;

          gaps.push({
            phase,
            category,
            currentCount: count,
            priority,
          });
        }
      }
    }

    // Sort by priority descending, then phase ascending
    gaps.sort((a, b) => b.priority - a.priority || a.phase - b.phase);

    return gaps;
  } catch (err) {
    console.error('[LibraryGrowth] getContentGaps error:', err);
    return [];
  }
}

// ============================================
// GENERATE CONTENT BATCH
// ============================================

/**
 * For the top N gaps, queue handler directives that will trigger
 * script generation in the weekly cron.
 */
export async function generateContentBatch(userId: string, count: number = 5): Promise<number> {
  try {
    const gaps = await getContentGaps(userId);
    if (gaps.length === 0) return 0;

    const batch = gaps.slice(0, count);
    let queued = 0;

    for (const gap of batch) {
      const { error } = await supabase.from('handler_directives').insert({
        user_id: userId,
        action: 'generate_script',
        target: gap.category,
        value: {
          phase: gap.phase,
          category: gap.category,
          currentCount: gap.currentCount,
          reason: `Gap fill: phase ${gap.phase} ${gap.category} has ${gap.currentCount}/${MIN_SCRIPTS_PER_COMBO} scripts`,
        },
        priority: gap.priority >= 10 ? 'high' : 'normal',
        silent: true,
        reasoning: `Automated library growth: filling phase ${gap.phase} × ${gap.category} gap`,
      });

      if (!error) queued++;
    }

    return queued;
  } catch (err) {
    console.error('[LibraryGrowth] generateContentBatch error:', err);
    return 0;
  }
}

// ============================================
// LIBRARY STATS
// ============================================

/**
 * Get full library statistics for a user.
 */
export async function getLibraryStats(userId: string): Promise<LibraryStats> {
  const defaultStats: LibraryStats = {
    totalScripts: 0,
    byPhase: {},
    byCategory: {},
    gaps: [],
    coveragePercent: 0,
  };

  try {
    const { data: scripts } = await supabase
      .from('content_curriculum')
      .select('conditioning_phase, category')
      .eq('user_id', userId);

    if (!scripts || scripts.length === 0) {
      const gaps = await getContentGaps(userId);
      return { ...defaultStats, gaps };
    }

    const byPhase: Record<number, number> = {};
    const byCategory: Record<string, number> = {};

    for (const s of scripts) {
      if (s.conditioning_phase != null) {
        byPhase[s.conditioning_phase] = (byPhase[s.conditioning_phase] ?? 0) + 1;
      }
      if (s.category) {
        byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
      }
    }

    // Count filled combos (>= MIN_SCRIPTS_PER_COMBO)
    const totalPossible = ALL_PHASES.length * ALL_CATEGORIES.length; // 96
    const countMap = new Map<string, number>();
    for (const s of scripts) {
      if (s.conditioning_phase == null || !s.category) continue;
      const key = `${s.conditioning_phase}:${s.category}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }
    const filledCombos = [...countMap.values()].filter(c => c >= MIN_SCRIPTS_PER_COMBO).length;
    const coveragePercent = Math.round((filledCombos / totalPossible) * 100);

    const gaps = await getContentGaps(userId);

    return {
      totalScripts: scripts.length,
      byPhase,
      byCategory,
      gaps,
      coveragePercent,
    };
  } catch (err) {
    console.error('[LibraryGrowth] getLibraryStats error:', err);
    return defaultStats;
  }
}

// ============================================
// BUILD CONTEXT
// ============================================

/**
 * Build Handler context block for content library growth state.
 */
export async function buildLibraryGrowthContext(userId: string): Promise<string> {
  try {
    const stats = await getLibraryStats(userId);

    const parts: string[] = [];

    parts.push(`CONTENT LIBRARY: ${stats.totalScripts} scripts total. Coverage: ${stats.coveragePercent}% of phase×category matrix.`);

    // Per-phase breakdown
    const phaseStrs: string[] = [];
    for (const phase of ALL_PHASES) {
      const count = stats.byPhase[phase] ?? 0;
      if (count > 0) {
        phaseStrs.push(`Phase ${phase}: ${count} scripts`);
      }
    }
    if (phaseStrs.length > 0) {
      parts.push(`  ${phaseStrs.join('. ')}.`);
    }

    // Top gaps
    if (stats.gaps.length > 0) {
      const topGaps = stats.gaps.slice(0, 5);
      const gapStrs = topGaps.map(g =>
        `Phase ${g.phase} ${g.category} (${g.currentCount})`
      );
      parts.push(`  Gaps: ${gapStrs.join(', ')}.`);

      if (stats.totalScripts < 20) {
        parts.push(`  Library is thin — weekly batch will fill gaps.`);
      }
    } else {
      parts.push(`  All phase×category combinations have sufficient scripts.`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
