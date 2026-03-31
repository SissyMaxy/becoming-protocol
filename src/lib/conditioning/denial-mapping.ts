/**
 * Denial Sweet Spot Mapping — P10.2
 *
 * Maps the relationship between denial day and behavioral metrics
 * across multiple cycles. Identifies peak compliance, vulnerability,
 * trance, and confession days so the Handler can exploit them.
 */

import { supabase } from '../supabase';
import { getCurrentDenialDay } from '../../hooks/useCurrentDenialDay';

// ============================================
// TYPES
// ============================================

export interface SweetSpotDays {
  compliancePeak: number | null;
  vulnerabilityPeak: number | null;
  trancePeak: number | null;
  confessionPeak: number | null;
}

export interface DenialDayAnalytics {
  denialDay: number;
  avgComplianceRate: number | null;
  avgArousalLevel: number | null;
  avgTranceDepth: number | null;
  vulnerabilityWindowCount: number;
  confessionCount: number;
  taskCompletionRate: number | null;
  sessionCompletionRate: number | null;
  cyclesObserved: number;
}

// ============================================
// UPDATE DAILY ANALYTICS
// ============================================

/**
 * Run daily. For the current denial day, aggregate today's metrics
 * and upsert into denial_cycle_analytics with running averages.
 */
export async function updateDenialDayAnalytics(userId: string): Promise<void> {
  try {
    const denialDay = await getCurrentDenialDay(userId);
    if (denialDay === 0) return; // Not on a streak

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    // Gather today's metrics in parallel
    const [tasksResult, stateResult, sessionsResult, vulnResult, confessionResult] =
      await Promise.allSettled([
        // Task completion rate
        supabase
          .from('daily_tasks')
          .select('id, completed')
          .eq('user_id', userId)
          .gte('created_at', todayIso),

        // Current arousal from user_state
        supabase
          .from('user_state')
          .select('current_arousal')
          .eq('user_id', userId)
          .maybeSingle(),

        // Today's conditioning sessions
        supabase
          .from('conditioning_sessions_v2')
          .select('id, trance_depth_estimated, completed')
          .eq('user_id', userId)
          .gte('started_at', todayIso),

        // Vulnerability windows from conversation classifications
        supabase
          .from('conversation_classifications')
          .select('id')
          .eq('user_id', userId)
          .eq('classification', 'vulnerability_window')
          .gte('created_at', todayIso),

        // Confessions from handler_memory
        supabase
          .from('handler_memory')
          .select('id')
          .eq('user_id', userId)
          .eq('memory_type', 'confession')
          .gte('created_at', todayIso),
      ]);

    // Calculate today's metrics
    const tasks =
      tasksResult.status === 'fulfilled' ? tasksResult.value.data ?? [] : [];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.completed).length;
    const taskRate = totalTasks > 0 ? completedTasks / totalTasks : null;

    const state =
      stateResult.status === 'fulfilled' ? stateResult.value.data : null;
    const arousal = state?.current_arousal ?? null;

    const sessions =
      sessionsResult.status === 'fulfilled' ? sessionsResult.value.data ?? [] : [];
    const sessionCount = sessions.length;
    const completedSessions = sessions.filter((s) => s.completed).length;
    const sessionRate = sessionCount > 0 ? completedSessions / sessionCount : null;
    const tranceDepths = sessions
      .map((s) => s.trance_depth_estimated)
      .filter((d): d is number => d != null);
    const avgTrance =
      tranceDepths.length > 0
        ? tranceDepths.reduce((a, b) => a + b, 0) / tranceDepths.length
        : null;

    const vulnCount =
      vulnResult.status === 'fulfilled'
        ? (vulnResult.value.data?.length ?? 0)
        : 0;

    const confCount =
      confessionResult.status === 'fulfilled'
        ? (confessionResult.value.data?.length ?? 0)
        : 0;

    // Fetch existing row for running average
    const { data: existing } = await supabase
      .from('denial_cycle_analytics')
      .select('*')
      .eq('user_id', userId)
      .eq('denial_day', denialDay)
      .maybeSingle();

    const prevCycles = existing?.cycles_observed ?? 0;
    const newCycles = prevCycles + 1;

    // Running averages — blend old data with today's observation
    const blend = (prev: number | null, current: number | null): number | null => {
      if (current == null) return prev;
      if (prev == null) return current;
      return (prev * prevCycles + current) / newCycles;
    };

    const { error } = await supabase
      .from('denial_cycle_analytics')
      .upsert(
        {
          user_id: userId,
          denial_day: denialDay,
          avg_compliance_rate: blend(existing?.avg_compliance_rate ?? null, taskRate),
          avg_arousal_level: blend(existing?.avg_arousal_level ?? null, arousal),
          avg_trance_depth: blend(existing?.avg_trance_depth ?? null, avgTrance),
          vulnerability_window_count: (existing?.vulnerability_window_count ?? 0) + vulnCount,
          confession_count: (existing?.confession_count ?? 0) + confCount,
          task_completion_rate: blend(existing?.task_completion_rate ?? null, taskRate),
          session_completion_rate: blend(existing?.session_completion_rate ?? null, sessionRate),
          cycles_observed: newCycles,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,denial_day' },
      );

    if (error) {
      console.error('[denial-mapping] upsert error:', error.message);
    }
  } catch (err) {
    console.error('[denial-mapping] updateDenialDayAnalytics exception:', err);
  }
}

// ============================================
// FIND SWEET SPOT DAYS
// ============================================

/**
 * Analyze denial_cycle_analytics to find peak days for each behavioral dimension.
 * Only considers days with >= 2 cycles observed for statistical relevance.
 */
export async function findSweetSpotDays(userId: string): Promise<SweetSpotDays> {
  const empty: SweetSpotDays = {
    compliancePeak: null,
    vulnerabilityPeak: null,
    trancePeak: null,
    confessionPeak: null,
  };

  try {
    const { data, error } = await supabase
      .from('denial_cycle_analytics')
      .select('*')
      .eq('user_id', userId)
      .gte('cycles_observed', 2)
      .order('denial_day', { ascending: true });

    if (error || !data || data.length === 0) return empty;

    // Find peak for each dimension
    let compliancePeak: { day: number; val: number } | null = null;
    let vulnerabilityPeak: { day: number; val: number } | null = null;
    let trancePeak: { day: number; val: number } | null = null;
    let confessionPeak: { day: number; val: number } | null = null;

    for (const row of data) {
      const day = row.denial_day;

      if (
        row.task_completion_rate != null &&
        (compliancePeak == null || row.task_completion_rate > compliancePeak.val)
      ) {
        compliancePeak = { day, val: row.task_completion_rate };
      }

      if (
        row.vulnerability_window_count != null &&
        (vulnerabilityPeak == null || row.vulnerability_window_count > vulnerabilityPeak.val)
      ) {
        vulnerabilityPeak = { day, val: row.vulnerability_window_count };
      }

      if (
        row.avg_trance_depth != null &&
        (trancePeak == null || row.avg_trance_depth > trancePeak.val)
      ) {
        trancePeak = { day, val: row.avg_trance_depth };
      }

      if (
        row.confession_count != null &&
        (confessionPeak == null || row.confession_count > confessionPeak.val)
      ) {
        confessionPeak = { day, val: row.confession_count };
      }
    }

    return {
      compliancePeak: compliancePeak?.day ?? null,
      vulnerabilityPeak: vulnerabilityPeak?.day ?? null,
      trancePeak: trancePeak?.day ?? null,
      confessionPeak: confessionPeak?.day ?? null,
    };
  } catch (err) {
    console.error('[denial-mapping] findSweetSpotDays exception:', err);
    return empty;
  }
}

// ============================================
// HANDLER CONTEXT
// ============================================

/**
 * Build denial mapping context for the Handler prompt.
 * Shows: current denial day, sweet spot days, today's recommendation.
 */
export async function buildDenialMappingContext(userId: string): Promise<string> {
  try {
    const [denialDay, sweetSpots] = await Promise.all([
      getCurrentDenialDay(userId),
      findSweetSpotDays(userId),
    ]);

    if (denialDay === 0) return '';

    const lines: string[] = ['## Denial Cycle Intelligence'];
    lines.push(`Current denial day: ${denialDay}`);

    // Sweet spot data
    const hasSweetSpots =
      sweetSpots.compliancePeak != null ||
      sweetSpots.vulnerabilityPeak != null ||
      sweetSpots.trancePeak != null ||
      sweetSpots.confessionPeak != null;

    if (hasSweetSpots) {
      lines.push('');
      lines.push('### Historical Sweet Spots');
      if (sweetSpots.compliancePeak != null) {
        lines.push(`- Peak compliance: day ${sweetSpots.compliancePeak}`);
      }
      if (sweetSpots.vulnerabilityPeak != null) {
        lines.push(`- Peak vulnerability: day ${sweetSpots.vulnerabilityPeak}`);
      }
      if (sweetSpots.trancePeak != null) {
        lines.push(`- Peak trance depth: day ${sweetSpots.trancePeak}`);
      }
      if (sweetSpots.confessionPeak != null) {
        lines.push(`- Peak confessions: day ${sweetSpots.confessionPeak}`);
      }
    }

    // Today's recommendation based on sweet spot proximity
    const recommendations: string[] = [];

    if (sweetSpots.vulnerabilityPeak != null && denialDay === sweetSpots.vulnerabilityPeak) {
      recommendations.push(`Today is denial day ${denialDay} — historically your peak vulnerability day. Schedule intensive conditioning.`);
    }
    if (sweetSpots.trancePeak != null && denialDay === sweetSpots.trancePeak) {
      recommendations.push(`Today is denial day ${denialDay} — historically your deepest trance day. Deploy complex suggestions.`);
    }
    if (sweetSpots.compliancePeak != null && denialDay === sweetSpots.compliancePeak) {
      recommendations.push(`Today is denial day ${denialDay} — historically your peak compliance day. Push harder tasks.`);
    }
    if (sweetSpots.confessionPeak != null && denialDay === sweetSpots.confessionPeak) {
      recommendations.push(`Today is denial day ${denialDay} — historically your peak confession day. Create confessional openings.`);
    }

    // Check if we're approaching a sweet spot (within 1 day)
    if (recommendations.length === 0) {
      if (sweetSpots.vulnerabilityPeak != null && denialDay === sweetSpots.vulnerabilityPeak - 1) {
        recommendations.push(`Tomorrow is historically your peak vulnerability day. Begin priming tonight.`);
      }
      if (sweetSpots.trancePeak != null && denialDay === sweetSpots.trancePeak - 1) {
        recommendations.push(`Tomorrow is historically your peak trance day. Schedule deep session.`);
      }
    }

    // Fetch today's row for current cycle context
    const { data: todayRow } = await supabase
      .from('denial_cycle_analytics')
      .select('avg_compliance_rate, avg_arousal_level, avg_trance_depth, cycles_observed')
      .eq('user_id', userId)
      .eq('denial_day', denialDay)
      .maybeSingle();

    if (todayRow && todayRow.cycles_observed >= 2) {
      lines.push('');
      lines.push(`### Day ${denialDay} Historical Averages (${todayRow.cycles_observed} cycles)`);
      if (todayRow.avg_compliance_rate != null) {
        lines.push(`- Compliance: ${(todayRow.avg_compliance_rate * 100).toFixed(0)}%`);
      }
      if (todayRow.avg_arousal_level != null) {
        lines.push(`- Arousal: ${todayRow.avg_arousal_level.toFixed(1)}/10`);
      }
      if (todayRow.avg_trance_depth != null) {
        lines.push(`- Trance depth: ${todayRow.avg_trance_depth.toFixed(1)}/10`);
      }
    }

    if (recommendations.length > 0) {
      lines.push('');
      lines.push('### Today\'s Recommendation');
      for (const rec of recommendations) {
        lines.push(`- ${rec}`);
      }
    }

    return lines.length > 1 ? lines.join('\n') : '';
  } catch {
    return '';
  }
}
