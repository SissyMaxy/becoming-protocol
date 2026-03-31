/**
 * Closed-Loop Content Optimization — P10.1
 *
 * Tracks which conditioning scripts work best neurologically,
 * then uses that data to select optimal content for future sessions.
 * Closes the feedback loop: play → measure → learn → prescribe better.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface EffectivenessMetrics {
  avgHrv: number | null;
  avgHr: number | null;
  tranceDepth: number;        // 0-10 scale
  sessionDuration: number;    // minutes
  completedFully: boolean;
  postSessionMood: number;    // 1-10 scale
}

export interface OptimalContentItem {
  id: string;
  title: string;
  category: string;
  effectivenessScore: number | null;
  timesCompleted: number;
  timesPrescribed: number;
  avgTranceDepth: number | null;
}

export interface ContentOptimizationContext {
  topByCategory: Record<string, OptimalContentItem[]>;
  leastEffective: OptimalContentItem[];
  insufficientData: OptimalContentItem[];
}

// ============================================
// RECORD EFFECTIVENESS
// ============================================

/**
 * After a conditioning session ends, record the neurological effectiveness.
 * Calculates a weighted score and updates the content_curriculum row
 * with running averages.
 */
export async function recordContentEffectiveness(
  userId: string,
  curriculumId: string,
  _sessionId: string,
  metrics: EffectivenessMetrics,
): Promise<number | null> {
  try {
    // Fetch user's HRV baseline from whoop_metrics (last 7 days avg)
    const { data: whoopData } = await supabase
      .from('whoop_metrics')
      .select('hrv')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(7);

    const baselineHrv = whoopData && whoopData.length > 0
      ? whoopData.reduce((sum, r) => sum + (r.hrv ?? 0), 0) / whoopData.length
      : null;

    // Calculate effectiveness score (0-10 scale)
    // HRV increase from baseline (40%) + trance depth (30%) + completion (20%) + mood (10%)
    let hrvComponent = 0;
    if (baselineHrv && baselineHrv > 0 && metrics.avgHrv != null) {
      // HRV increase as a ratio, capped at 2x for a perfect 10
      const hrvRatio = Math.min((metrics.avgHrv - baselineHrv) / baselineHrv, 1);
      hrvComponent = Math.max(0, hrvRatio * 10);
    } else {
      // No HRV data — use neutral 5
      hrvComponent = 5;
    }

    const tranceComponent = Math.min(metrics.tranceDepth, 10);
    const completionComponent = metrics.completedFully ? 10 : 3;
    const moodComponent = Math.min(metrics.postSessionMood, 10);

    const effectivenessScore =
      hrvComponent * 0.4 +
      tranceComponent * 0.3 +
      completionComponent * 0.2 +
      moodComponent * 0.1;

    // Fetch current curriculum row for running average calculation
    const { data: current, error: fetchErr } = await supabase
      .from('content_curriculum')
      .select('times_completed, avg_trance_depth, avg_arousal_during, effectiveness_score')
      .eq('id', curriculumId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !current) {
      console.error('[content-optimizer] curriculum not found:', fetchErr?.message);
      return null;
    }

    const prevCount = current.times_completed ?? 0;
    const newCount = prevCount + 1;

    // Running averages
    const newAvgTrance = current.avg_trance_depth != null
      ? (current.avg_trance_depth * prevCount + metrics.tranceDepth) / newCount
      : metrics.tranceDepth;

    // Use avgHr as arousal proxy when available
    const arousalProxy = metrics.avgHr ?? metrics.tranceDepth;
    const newAvgArousal = current.avg_arousal_during != null
      ? (current.avg_arousal_during * prevCount + arousalProxy) / newCount
      : arousalProxy;

    // Effectiveness score: weighted running average (recent sessions count more)
    const newEffectiveness = current.effectiveness_score != null
      ? (current.effectiveness_score * prevCount + effectivenessScore * 2) / (prevCount + 2)
      : effectivenessScore;

    const { error: updateErr } = await supabase
      .from('content_curriculum')
      .update({
        times_completed: newCount,
        avg_trance_depth: Math.round(newAvgTrance * 100) / 100,
        avg_arousal_during: Math.round(newAvgArousal * 100) / 100,
        effectiveness_score: Math.round(newEffectiveness * 100) / 100,
        updated_at: new Date().toISOString(),
      })
      .eq('id', curriculumId)
      .eq('user_id', userId);

    if (updateErr) {
      console.error('[content-optimizer] update error:', updateErr.message);
      return null;
    }

    return Math.round(newEffectiveness * 100) / 100;
  } catch (err) {
    console.error('[content-optimizer] recordContentEffectiveness exception:', err);
    return null;
  }
}

// ============================================
// GET OPTIMAL CONTENT
// ============================================

/**
 * Enhanced content selection that uses effectiveness data.
 * High effectiveness + low recent prescription = optimal pick.
 * Falls back to variety-based ordering for content with < 3 data points.
 */
export async function getOptimalContent(
  userId: string,
  category: string,
  context?: string,
): Promise<OptimalContentItem[]> {
  try {
    let query = supabase
      .from('content_curriculum')
      .select('id, title, category, effectiveness_score, times_completed, times_prescribed, avg_trance_depth')
      .eq('user_id', userId)
      .eq('category', category);

    if (context) {
      query = query.contains('session_contexts', [context]);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) return [];

    // Split into two groups: enough data (>= 3 completions) and insufficient
    const withData = data.filter((r) => (r.times_completed ?? 0) >= 3);
    const withoutData = data.filter((r) => (r.times_completed ?? 0) < 3);

    // Sort data-rich content by effectiveness DESC
    withData.sort((a, b) => (b.effectiveness_score ?? 0) - (a.effectiveness_score ?? 0));

    // Sort data-poor content by times_prescribed ASC (variety)
    withoutData.sort((a, b) => (a.times_prescribed ?? 0) - (b.times_prescribed ?? 0));

    // Merge: top effective content first, then variety picks
    const merged = [...withData, ...withoutData];

    return merged.slice(0, 3).map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      effectivenessScore: r.effectiveness_score,
      timesCompleted: r.times_completed ?? 0,
      timesPrescribed: r.times_prescribed ?? 0,
      avgTranceDepth: r.avg_trance_depth,
    }));
  } catch (err) {
    console.error('[content-optimizer] getOptimalContent exception:', err);
    return [];
  }
}

// ============================================
// HANDLER CONTEXT
// ============================================

/**
 * Build content optimization context for the Handler prompt.
 * Shows: top 3 most effective scripts by category, least effective, needs more data.
 */
export async function buildContentOptimizationContext(
  userId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('content_curriculum')
      .select('id, title, category, effectiveness_score, times_completed, times_prescribed, avg_trance_depth')
      .eq('user_id', userId)
      .gt('times_prescribed', 0);

    if (error || !data || data.length === 0) return '';

    const lines: string[] = ['## Content Optimization Intelligence'];

    // Group by category
    const byCategory = new Map<string, typeof data>();
    for (const row of data) {
      const list = byCategory.get(row.category) ?? [];
      list.push(row);
      byCategory.set(row.category, list);
    }

    // Top performers by category
    const topLines: string[] = [];
    for (const [cat, items] of byCategory) {
      const qualified = items.filter((i) => (i.times_completed ?? 0) >= 3 && i.effectiveness_score != null);
      if (qualified.length === 0) continue;
      qualified.sort((a, b) => (b.effectiveness_score ?? 0) - (a.effectiveness_score ?? 0));
      const top = qualified.slice(0, 3);
      const topStr = top.map((t) =>
        `"${t.title}" (${(t.effectiveness_score ?? 0).toFixed(1)}/10, depth ${(t.avg_trance_depth ?? 0).toFixed(1)})`,
      ).join(', ');
      topLines.push(`- ${cat}: ${topStr}`);
    }

    if (topLines.length > 0) {
      lines.push('');
      lines.push('### Top Performing Content');
      lines.push(...topLines);
    }

    // Least effective (score < 4, >= 3 completions)
    const allQualified = data.filter(
      (i) => (i.times_completed ?? 0) >= 3 && i.effectiveness_score != null,
    );
    const worst = allQualified
      .filter((i) => (i.effectiveness_score ?? 0) < 4)
      .sort((a, b) => (a.effectiveness_score ?? 0) - (b.effectiveness_score ?? 0))
      .slice(0, 5);

    if (worst.length > 0) {
      lines.push('');
      lines.push('### Least Effective (avoid or retire)');
      for (const w of worst) {
        lines.push(`- "${w.title}" (${w.category}): ${(w.effectiveness_score ?? 0).toFixed(1)}/10 — ${w.times_completed} completions`);
      }
    }

    // Needs more data (prescribed but < 3 completions)
    const needsData = data
      .filter((i) => (i.times_completed ?? 0) < 3 && (i.times_prescribed ?? 0) > 0)
      .sort((a, b) => (a.times_completed ?? 0) - (b.times_completed ?? 0))
      .slice(0, 5);

    if (needsData.length > 0) {
      lines.push('');
      lines.push('### Needs More Exposure (insufficient data)');
      for (const n of needsData) {
        lines.push(`- "${n.title}" (${n.category}): ${n.times_completed ?? 0}/${n.times_prescribed ?? 0} completed/prescribed`);
      }
    }

    return lines.length > 1 ? lines.join('\n') : '';
  } catch {
    return '';
  }
}
