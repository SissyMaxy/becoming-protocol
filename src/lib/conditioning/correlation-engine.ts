/**
 * Cross-System Correlation Engine (P10.8)
 *
 * Finds hidden relationships between systems by computing Pearson correlations
 * across 30 days of data. Run weekly. Stores results in cross_system_correlations.
 *
 * "On days she does voice practice, trance depth is 40% deeper."
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface CorrelationResult {
  correlationType: string;
  factorA: string;
  factorB: string;
  strength: number;
  sampleSize: number;
  description: string;
}

interface CorrelationSpec {
  type: string;
  factorA: string;
  factorB: string;
  query: (userId: string) => Promise<{ x: number[]; y: number[] }>;
  describer: (r: number, n: number) => string;
}

// ============================================
// PEARSON CORRELATION
// ============================================

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 5) return 0;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? 0 : num / den;
}

// ============================================
// DATA QUERY HELPERS
// ============================================

/** Get dates 30 days back as YYYY-MM-DD strings */
function last30Days(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

/** Align two date maps into paired arrays (only dates present in both) */
function alignMaps(
  mapA: Map<string, number>,
  mapB: Map<string, number>,
): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (const [date, valA] of mapA) {
    const valB = mapB.get(date);
    if (valB !== undefined) {
      x.push(valA);
      y.push(valB);
    }
  }
  return { x, y };
}

/** Query voice practice days (1/0 per day) */
async function getVoicePracticeDays(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('voice_drill_log')
    .select('completed_at')
    .eq('user_id', userId)
    .gte('completed_at', cutoff.toISOString());

  const m = new Map<string, number>();
  for (const d of last30Days()) m.set(d, 0);
  if (data) {
    for (const row of data) {
      const date = new Date(row.completed_at).toISOString().split('T')[0];
      m.set(date, 1);
    }
  }
  return m;
}

/** Query trance depth per day (avg of sessions that day) */
async function getTranceDepthDays(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('conditioning_sessions')
    .select('started_at, trance_depth_estimated')
    .eq('user_id', userId)
    .gte('started_at', cutoff.toISOString())
    .not('trance_depth_estimated', 'is', null);

  const dayTotals = new Map<string, { sum: number; count: number }>();
  if (data) {
    for (const row of data) {
      const date = new Date(row.started_at).toISOString().split('T')[0];
      const existing = dayTotals.get(date) || { sum: 0, count: 0 };
      existing.sum += row.trance_depth_estimated;
      existing.count += 1;
      dayTotals.set(date, existing);
    }
  }

  const m = new Map<string, number>();
  for (const [date, v] of dayTotals) {
    m.set(date, v.sum / v.count);
  }
  return m;
}

/** Query denial day number per date */
async function getDenialDayPerDate(userId: string): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('denial_state')
    .select('denial_start, last_release')
    .eq('user_id', userId)
    .single();

  const m = new Map<string, number>();
  if (!data?.denial_start) return m;

  const start = new Date(data.denial_start);
  for (const dateStr of last30Days()) {
    const d = new Date(dateStr);
    const dayNum = Math.max(0, Math.floor((d.getTime() - start.getTime()) / 86400000));
    m.set(dateStr, dayNum);
  }
  return m;
}

/** Query task completion rate per day */
async function getCompliancePerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('task_completions')
    .select('completed_at, status')
    .eq('user_id', userId)
    .gte('completed_at', cutoff.toISOString());

  const dayStats = new Map<string, { done: number; total: number }>();
  if (data) {
    for (const row of data) {
      const date = new Date(row.completed_at).toISOString().split('T')[0];
      const existing = dayStats.get(date) || { done: 0, total: 0 };
      existing.total += 1;
      if (row.status === 'completed') existing.done += 1;
      dayStats.set(date, existing);
    }
  }

  const m = new Map<string, number>();
  for (const [date, v] of dayStats) {
    m.set(date, v.total > 0 ? v.done / v.total : 0);
  }
  return m;
}

/** Query confession count per day */
async function getConfessionsPerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('log_entries')
    .select('created_at')
    .eq('user_id', userId)
    .eq('entry_type', 'confession')
    .gte('created_at', cutoff.toISOString());

  const m = new Map<string, number>();
  for (const d of last30Days()) m.set(d, 0);
  if (data) {
    for (const row of data) {
      const date = new Date(row.created_at).toISOString().split('T')[0];
      m.set(date, (m.get(date) || 0) + 1);
    }
  }
  return m;
}

/** Query whoop recovery score per day */
async function getWhoopRecoveryPerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('whoop_recovery')
    .select('date, recovery_score')
    .eq('user_id', userId)
    .gte('date', cutoff.toISOString().split('T')[0]);

  const m = new Map<string, number>();
  if (data) {
    for (const row of data) {
      m.set(row.date, row.recovery_score);
    }
  }
  return m;
}

/** Query session completion per day (1 = completed, 0 = not) */
async function getSessionCompletionPerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('conditioning_sessions')
    .select('started_at, completed')
    .eq('user_id', userId)
    .gte('started_at', cutoff.toISOString());

  const dayStats = new Map<string, { completed: number; total: number }>();
  if (data) {
    for (const row of data) {
      const date = new Date(row.started_at).toISOString().split('T')[0];
      const existing = dayStats.get(date) || { completed: 0, total: 0 };
      existing.total += 1;
      if (row.completed) existing.completed += 1;
      dayStats.set(date, existing);
    }
  }

  const m = new Map<string, number>();
  for (const [date, v] of dayStats) {
    m.set(date, v.total > 0 ? v.completed / v.total : 0);
  }
  return m;
}

/** Query exercise completion per day */
async function getExercisePerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('exercise_log')
    .select('completed_at')
    .eq('user_id', userId)
    .gte('completed_at', cutoff.toISOString());

  const m = new Map<string, number>();
  for (const d of last30Days()) m.set(d, 0);
  if (data) {
    for (const row of data) {
      const date = new Date(row.completed_at).toISOString().split('T')[0];
      m.set(date, 1);
    }
  }
  return m;
}

/** Query mood per day from log entries (arousal_level as proxy) */
async function getMoodPerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('log_entries')
    .select('created_at, arousal_level')
    .eq('user_id', userId)
    .gte('created_at', cutoff.toISOString())
    .not('arousal_level', 'is', null);

  const dayTotals = new Map<string, { sum: number; count: number }>();
  if (data) {
    for (const row of data) {
      const date = new Date(row.created_at).toISOString().split('T')[0];
      const existing = dayTotals.get(date) || { sum: 0, count: 0 };
      existing.sum += row.arousal_level;
      existing.count += 1;
      dayTotals.set(date, existing);
    }
  }

  const m = new Map<string, number>();
  for (const [date, v] of dayTotals) {
    m.set(date, v.sum / v.count);
  }
  return m;
}

/** Query journal entries per day */
async function getJournalPerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('journal_entries')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', cutoff.toISOString());

  const m = new Map<string, number>();
  for (const d of last30Days()) m.set(d, 0);
  if (data) {
    for (const row of data) {
      const date = new Date(row.created_at).toISOString().split('T')[0];
      m.set(date, (m.get(date) || 0) + 1);
    }
  }
  return m;
}

/** Shift a date map forward by N days (for next-day correlations) */
function shiftMapForward(m: Map<string, number>, days: number): Map<string, number> {
  const shifted = new Map<string, number>();
  for (const [dateStr, value] of m) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    shifted.set(d.toISOString().split('T')[0], value);
  }
  return shifted;
}

/** Query ambush count per day */
async function getAmbushPerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('scheduled_ambushes')
    .select('fire_at')
    .eq('user_id', userId)
    .eq('status', 'fired')
    .gte('fire_at', cutoff.toISOString());

  const m = new Map<string, number>();
  for (const d of last30Days()) m.set(d, 0);
  if (data) {
    for (const row of data) {
      const date = new Date(row.fire_at).toISOString().split('T')[0];
      m.set(date, (m.get(date) || 0) + 1);
    }
  }
  return m;
}

/** Query arousal per day */
async function getArousalPerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('arousal_logs')
    .select('created_at, level')
    .eq('user_id', userId)
    .gte('created_at', cutoff.toISOString());

  const dayTotals = new Map<string, { sum: number; count: number }>();
  if (data) {
    for (const row of data) {
      const date = new Date(row.created_at).toISOString().split('T')[0];
      const existing = dayTotals.get(date) || { sum: 0, count: 0 };
      existing.sum += row.level;
      existing.count += 1;
      dayTotals.set(date, existing);
    }
  }

  const m = new Map<string, number>();
  for (const [date, v] of dayTotals) {
    m.set(date, v.sum / v.count);
  }
  return m;
}

/** Query conditioning session count per day */
async function getConditioningSessionsPerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('conditioning_sessions')
    .select('started_at')
    .eq('user_id', userId)
    .gte('started_at', cutoff.toISOString());

  const m = new Map<string, number>();
  for (const d of last30Days()) m.set(d, 0);
  if (data) {
    for (const row of data) {
      const date = new Date(row.started_at).toISOString().split('T')[0];
      m.set(date, (m.get(date) || 0) + 1);
    }
  }
  return m;
}

/** Query feminine language ratio per day */
async function getFeminineLangPerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('identity_language_metrics')
    .select('date, feminine_ratio')
    .eq('user_id', userId)
    .gte('date', cutoff.toISOString().split('T')[0])
    .not('feminine_ratio', 'is', null);

  const m = new Map<string, number>();
  if (data) {
    for (const row of data) {
      m.set(row.date, row.feminine_ratio);
    }
  }
  return m;
}

/** Query Gina positive seed count per day */
async function getGinaPositiveSeedsPerDay(userId: string): Promise<Map<string, number>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { data } = await supabase
    .from('gina_seed_log')
    .select('created_at, gina_response')
    .eq('user_id', userId)
    .eq('gina_response', 'positive')
    .gte('created_at', cutoff.toISOString());

  const m = new Map<string, number>();
  for (const d of last30Days()) m.set(d, 0);
  if (data) {
    for (const row of data) {
      const date = new Date(row.created_at).toISOString().split('T')[0];
      m.set(date, (m.get(date) || 0) + 1);
    }
  }
  return m;
}

/** Query days since last release for compliance-drop analysis */
async function getPostReleaseCompliancePairs(userId: string): Promise<{ x: number[]; y: number[] }> {
  const { data: denialData } = await supabase
    .from('denial_state')
    .select('last_release')
    .eq('user_id', userId)
    .single();

  if (!denialData?.last_release) return { x: [], y: [] };

  const releaseDate = new Date(denialData.last_release);
  const compliance = await getCompliancePerDay(userId);

  const x: number[] = [];
  const y: number[] = [];

  for (const [dateStr, rate] of compliance) {
    const d = new Date(dateStr);
    const daysSinceRelease = Math.floor((d.getTime() - releaseDate.getTime()) / 86400000);
    if (daysSinceRelease >= 0 && daysSinceRelease <= 14) {
      x.push(daysSinceRelease);
      y.push(rate);
    }
  }

  return { x, y };
}

// ============================================
// CORRELATION SPECS
// ============================================

function buildCorrelationSpecs(userId: string): CorrelationSpec[] {
  return [
    {
      type: 'voice_practice_trance_depth',
      factorA: 'voice_practice',
      factorB: 'trance_depth',
      query: async () => {
        const [voice, trance] = await Promise.all([
          getVoicePracticeDays(userId),
          getTranceDepthDays(userId),
        ]);
        return alignMaps(voice, trance);
      },
      describer: (r, n) =>
        r > 0
          ? `Voice practice days -> ${Math.round(Math.abs(r) * 100)}% deeper trance (r=${r.toFixed(2)}, n=${n})`
          : `Voice practice shows no positive trance correlation (r=${r.toFixed(2)}, n=${n})`,
    },
    {
      type: 'denial_day_compliance',
      factorA: 'denial_day',
      factorB: 'compliance_rate',
      query: async () => {
        const [denial, compliance] = await Promise.all([
          getDenialDayPerDate(userId),
          getCompliancePerDay(userId),
        ]);
        return alignMaps(denial, compliance);
      },
      describer: (r, n) =>
        r > 0
          ? `Higher denial day -> compliance +${Math.round(Math.abs(r) * 100)}% (r=${r.toFixed(2)}, n=${n})`
          : `Denial day negatively correlates with compliance (r=${r.toFixed(2)}, n=${n})`,
    },
    {
      type: 'denial_day_confessions',
      factorA: 'denial_day',
      factorB: 'confession_rate',
      query: async () => {
        const [denial, confessions] = await Promise.all([
          getDenialDayPerDate(userId),
          getConfessionsPerDay(userId),
        ]);
        return alignMaps(denial, confessions);
      },
      describer: (r, n) =>
        r > 0
          ? `Higher denial day -> confessions more likely (r=${r.toFixed(2)}, n=${n})`
          : `Confessions less likely as denial progresses (r=${r.toFixed(2)}, n=${n})`,
    },
    {
      type: 'whoop_recovery_sessions',
      factorA: 'whoop_recovery',
      factorB: 'session_completion',
      query: async () => {
        const [recovery, sessions] = await Promise.all([
          getWhoopRecoveryPerDay(userId),
          getSessionCompletionPerDay(userId),
        ]);
        return alignMaps(recovery, sessions);
      },
      describer: (r, n) =>
        r > 0
          ? `Higher recovery -> ${Math.round(Math.abs(r) * 100)}% better session completion (r=${r.toFixed(2)}, n=${n})`
          : `Recovery score does not predict session completion (r=${r.toFixed(2)}, n=${n})`,
    },
    {
      type: 'exercise_mood',
      factorA: 'exercise_completion',
      factorB: 'mood',
      query: async () => {
        const [exercise, mood] = await Promise.all([
          getExercisePerDay(userId),
          getMoodPerDay(userId),
        ]);
        return alignMaps(exercise, mood);
      },
      describer: (r, n) =>
        r > 0
          ? `Exercise days -> mood +${Math.round(Math.abs(r) * 100)}% (r=${r.toFixed(2)}, n=${n})`
          : `Exercise shows no mood improvement (r=${r.toFixed(2)}, n=${n})`,
    },
    {
      type: 'journal_next_day_compliance',
      factorA: 'journal_entries',
      factorB: 'compliance_next_day',
      query: async () => {
        const [journal, compliance] = await Promise.all([
          getJournalPerDay(userId),
          getCompliancePerDay(userId),
        ]);
        // Shift journal back by 1 day so we correlate today's journal with tomorrow's compliance
        const shiftedJournal = shiftMapForward(journal, 1);
        return alignMaps(shiftedJournal, compliance);
      },
      describer: (r, n) =>
        r > 0
          ? `Journal entries -> next-day compliance +${Math.round(Math.abs(r) * 100)}% (r=${r.toFixed(2)}, n=${n})`
          : `Journaling does not predict next-day compliance (r=${r.toFixed(2)}, n=${n})`,
    },
    {
      type: 'post_release_compliance_drop',
      factorA: 'days_since_release',
      factorB: 'compliance_rate',
      query: () => getPostReleaseCompliancePairs(userId),
      describer: (r, n) =>
        r > 0
          ? `Post-release -> compliance recovers over time (r=${r.toFixed(2)}, n=${n})`
          : `Post-release -> ${Math.round(Math.abs(r) * 100)}% compliance dip (r=${r.toFixed(2)}, n=${n})`,
    },
    {
      type: 'ambush_arousal',
      factorA: 'ambush_count',
      factorB: 'arousal',
      query: async () => {
        const [ambush, arousal] = await Promise.all([
          getAmbushPerDay(userId),
          getArousalPerDay(userId),
        ]);
        return alignMaps(ambush, arousal);
      },
      describer: (r, n) =>
        r > 0
          ? `More ambushes -> arousal +${Math.round(Math.abs(r) * 100)}% (r=${r.toFixed(2)}, n=${n})`
          : `Ambushes do not increase arousal (r=${r.toFixed(2)}, n=${n})`,
    },
    {
      type: 'conditioning_feminine_language',
      factorA: 'conditioning_sessions',
      factorB: 'feminine_language',
      query: async () => {
        const [sessions, lang] = await Promise.all([
          getConditioningSessionsPerDay(userId),
          getFeminineLangPerDay(userId),
        ]);
        return alignMaps(sessions, lang);
      },
      describer: (r, n) =>
        r > 0
          ? `Conditioning sessions -> feminine language +${Math.round(Math.abs(r) * 100)}% (r=${r.toFixed(2)}, n=${n})`
          : `Conditioning sessions do not correlate with feminine language (r=${r.toFixed(2)}, n=${n})`,
    },
    {
      type: 'gina_seeds_compliance',
      factorA: 'gina_positive_seeds',
      factorB: 'overall_compliance',
      query: async () => {
        const [seeds, compliance] = await Promise.all([
          getGinaPositiveSeedsPerDay(userId),
          getCompliancePerDay(userId),
        ]);
        return alignMaps(seeds, compliance);
      },
      describer: (r, n) =>
        r > 0
          ? `Gina positive seeds -> compliance +${Math.round(Math.abs(r) * 100)}% (r=${r.toFixed(2)}, n=${n})`
          : `Gina progress does not correlate with compliance (r=${r.toFixed(2)}, n=${n})`,
    },
  ];
}

// ============================================
// CORE ENGINE
// ============================================

/**
 * Run weekly. Compute all 10 correlations and upsert into cross_system_correlations.
 */
export async function computeCorrelations(userId: string): Promise<CorrelationResult[]> {
  const specs = buildCorrelationSpecs(userId);
  const results: CorrelationResult[] = [];

  for (const spec of specs) {
    try {
      const { x, y } = await spec.query(userId);
      const r = pearson(x, y);
      const n = x.length;
      const description = spec.describer(r, n);

      const result: CorrelationResult = {
        correlationType: spec.type,
        factorA: spec.factorA,
        factorB: spec.factorB,
        strength: Math.round(r * 1000) / 1000,
        sampleSize: n,
        description,
      };

      results.push(result);

      // Upsert into cross_system_correlations
      await supabase
        .from('cross_system_correlations')
        .upsert(
          {
            user_id: userId,
            correlation_type: spec.type,
            factor_a: spec.factorA,
            factor_b: spec.factorB,
            correlation_strength: result.strength,
            sample_size: n,
            description,
            computed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,correlation_type' },
        );
    } catch {
      // Skip failed correlations — some tables may not exist yet
    }
  }

  return results;
}

/**
 * Return correlations with |strength| > 0.3 and sample_size > 10.
 */
export async function getSignificantCorrelations(userId: string): Promise<CorrelationResult[]> {
  try {
    const { data, error } = await supabase
      .from('cross_system_correlations')
      .select('*')
      .eq('user_id', userId)
      .gt('sample_size', 10);

    if (error || !data) return [];

    return data
      .filter((row: any) => Math.abs(row.correlation_strength) > 0.3)
      .map((row: any) => ({
        correlationType: row.correlation_type,
        factorA: row.factor_a,
        factorB: row.factor_b,
        strength: row.correlation_strength,
        sampleSize: row.sample_size,
        description: row.description,
      }));
  } catch {
    return [];
  }
}

/**
 * Handler context block for cross-system correlations.
 */
export async function buildCorrelationContext(userId: string): Promise<string> {
  try {
    const significant = await getSignificantCorrelations(userId);
    if (significant.length === 0) return '';

    const lines = ['CORRELATIONS:'];
    for (const c of significant) {
      lines.push(`  ${c.description}`);
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}
