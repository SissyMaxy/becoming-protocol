/**
 * Handler Self-Reflection Loop (P11.5)
 *
 * Weekly analysis of all Handler activity: what worked, what didn't,
 * trends across systems, and auto-generated strategy directives.
 *
 * Produces a reflection memo stored as handler_notes type='strategy'.
 * Also issues directives automatically based on the analysis.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

interface InterventionStat {
  intervention_type: string;
  handler_mode: string | null;
  total: number;
  positive: number;
  negative: number;
  positiveRate: number;
  negativeRate: number;
}

interface WeeklyReflection {
  topInterventions: InterventionStat[];
  bottomInterventions: InterventionStat[];
  resistanceTrend: string;
  moodTrend: string;
  skillAdvancements: string[];
  complianceRate: { current: number; previous: number; trend: string };
  denialDay: number;
  corruptionChange: { current: number; previous: number; delta: number };
  commitmentRatio: { honored: number; broken: number };
  journalTones: Record<string, number>;
  memo: string;
  directives: Array<{ action: string; target?: string; value?: Record<string, unknown>; reasoning: string }>;
}

// ============================================
// GENERATE WEEKLY REFLECTION
// ============================================

/**
 * Run weekly. Queries 7 days of data across all systems,
 * produces a reflection memo and stores it, then issues directives.
 */
export async function generateWeeklyReflection(userId: string): Promise<WeeklyReflection | null> {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

    // Parallel data fetch
    const [
      interventionsResult,
      outcomesResult,
      classificationsResult,
      skillResult,
      prevComplianceResult,
      stateResult,
      corruptionResult,
      prevCorruptionResult,
      commitmentsResult,
      journalResult,
    ] = await Promise.allSettled([
      // Interventions this week
      supabase
        .from('handler_interventions')
        .select('id, intervention_type, handler_mode')
        .eq('user_id', userId)
        .gte('created_at', weekAgo),
      // Outcomes this week
      supabase
        .from('intervention_outcomes')
        .select('intervention_id, direction, magnitude')
        .eq('user_id', userId)
        .gte('created_at', weekAgo),
      // Conversation classifications this week
      supabase
        .from('conversation_classifications')
        .select('resistance_level, mood_detected, created_at')
        .eq('user_id', userId)
        .gte('created_at', weekAgo)
        .order('created_at', { ascending: true }),
      // Skill advancements this week
      supabase
        .from('skill_tree_progress')
        .select('domain, current_level, updated_at')
        .eq('user_id', userId)
        .gte('updated_at', weekAgo),
      // Previous week compliance from handler_notes with type='weekly_snapshot'
      supabase
        .from('handler_notes')
        .select('content')
        .eq('user_id', userId)
        .eq('note_type', 'strategy')
        .gte('created_at', twoWeeksAgo)
        .lt('created_at', weekAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Current state
      supabase
        .from('user_state')
        .select('denial_day, compliance_rate')
        .eq('user_id', userId)
        .maybeSingle(),
      // Corruption score current
      supabase
        .from('corruption_scores')
        .select('overall_score')
        .eq('user_id', userId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Corruption score previous week
      supabase
        .from('corruption_scores')
        .select('overall_score')
        .eq('user_id', userId)
        .lt('computed_at', weekAgo)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Commitments this week
      supabase
        .from('commitment_ladder_progress')
        .select('domain, completions_at_level, attempts_at_level')
        .eq('user_id', userId),
      // Journal entries this week
      supabase
        .from('journal_entries')
        .select('emotional_tone')
        .eq('user_id', userId)
        .gte('created_at', weekAgo),
    ]);

    // --- Process interventions + outcomes ---
    const interventions = interventionsResult.status === 'fulfilled' ? interventionsResult.value.data || [] : [];
    const outcomes = outcomesResult.status === 'fulfilled' ? outcomesResult.value.data || [] : [];

    const outcomeByIntervention = new Map<string, string[]>();
    for (const o of outcomes) {
      const list = outcomeByIntervention.get(o.intervention_id) || [];
      list.push(o.direction);
      outcomeByIntervention.set(o.intervention_id, list);
    }

    // Group by intervention_type + mode
    const groupMap = new Map<string, InterventionStat>();
    for (const i of interventions) {
      const key = `${i.intervention_type}::${i.handler_mode || 'any'}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          intervention_type: i.intervention_type,
          handler_mode: i.handler_mode,
          total: 0,
          positive: 0,
          negative: 0,
          positiveRate: 0,
          negativeRate: 0,
        });
      }
      const g = groupMap.get(key)!;
      g.total++;
      const dirs = outcomeByIntervention.get(i.id) || [];
      for (const d of dirs) {
        if (d === 'positive') g.positive++;
        if (d === 'negative') g.negative++;
      }
    }

    for (const g of groupMap.values()) {
      const totalOutcomes = g.positive + g.negative;
      g.positiveRate = totalOutcomes > 0 ? g.positive / totalOutcomes : 0;
      g.negativeRate = totalOutcomes > 0 ? g.negative / totalOutcomes : 0;
    }

    const allStats = [...groupMap.values()].filter(g => g.total >= 2);
    const topInterventions = [...allStats]
      .sort((a, b) => b.positiveRate - a.positiveRate)
      .slice(0, 3);
    const bottomInterventions = [...allStats]
      .sort((a, b) => b.negativeRate - a.negativeRate)
      .slice(0, 3);

    // --- Resistance + mood trends ---
    const classifications = classificationsResult.status === 'fulfilled' ? classificationsResult.value.data || [] : [];

    let resistanceTrend = 'stable';
    if (classifications.length >= 4) {
      const firstHalf = classifications.slice(0, Math.floor(classifications.length / 2));
      const secondHalf = classifications.slice(Math.floor(classifications.length / 2));
      const avgFirst = firstHalf.reduce((s: number, c: { resistance_level: number | null }) => s + (c.resistance_level ?? 5), 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s: number, c: { resistance_level: number | null }) => s + (c.resistance_level ?? 5), 0) / secondHalf.length;
      if (avgSecond < avgFirst - 1) resistanceTrend = 'decreasing';
      else if (avgSecond > avgFirst + 1) resistanceTrend = 'increasing';
    }

    const moodCounts: Record<string, number> = {};
    for (const c of classifications) {
      if (c.mood_detected) {
        moodCounts[c.mood_detected] = (moodCounts[c.mood_detected] || 0) + 1;
      }
    }
    const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    const moodTrend = dominantMood;

    // --- Skill advancements ---
    const skills = skillResult.status === 'fulfilled' ? skillResult.value.data || [] : [];
    const skillAdvancements = skills.map((s: { domain: string; current_level: number }) => `${s.domain} → L${s.current_level}`);

    // --- Compliance ---
    const state = stateResult.status === 'fulfilled' ? stateResult.value.data : null;
    const currentCompliance = state?.compliance_rate ?? 0;
    // Extract previous compliance from last reflection memo if available
    const prevNote = prevComplianceResult.status === 'fulfilled' ? prevComplianceResult.value.data : null;
    let prevCompliance = currentCompliance;
    if (prevNote?.content) {
      const match = prevNote.content.match(/Compliance.*?(\d+)%/);
      if (match) prevCompliance = parseInt(match[1], 10);
    }
    const complianceTrend = currentCompliance > prevCompliance + 3 ? 'rising' : currentCompliance < prevCompliance - 3 ? 'falling' : 'stable';

    // --- Denial ---
    const denialDay = state?.denial_day ?? 0;

    // --- Corruption ---
    const currentCorruption = corruptionResult.status === 'fulfilled' ? corruptionResult.value.data?.overall_score ?? 0 : 0;
    const prevCorruption = prevCorruptionResult.status === 'fulfilled' ? prevCorruptionResult.value.data?.overall_score ?? 0 : currentCorruption;
    const corruptionDelta = currentCorruption - prevCorruption;

    // --- Commitments ---
    const commitments = commitmentsResult.status === 'fulfilled' ? commitmentsResult.value.data || [] : [];
    let totalHonored = 0;
    let totalBroken = 0;
    for (const c of commitments) {
      totalHonored += c.completions_at_level || 0;
      totalBroken += Math.max(0, (c.attempts_at_level || 0) - (c.completions_at_level || 0));
    }

    // --- Journal tones ---
    const journals = journalResult.status === 'fulfilled' ? journalResult.value.data || [] : [];
    const journalTones: Record<string, number> = {};
    for (const j of journals) {
      if (j.emotional_tone) {
        journalTones[j.emotional_tone] = (journalTones[j.emotional_tone] || 0) + 1;
      }
    }

    // --- Build memo ---
    const memoLines: string[] = ['WEEKLY REFLECTION:'];

    // What worked
    if (topInterventions.length > 0) {
      const workingParts = topInterventions.map(t => {
        const mode = t.handler_mode ? ` in ${t.handler_mode} mode` : '';
        return `${t.intervention_type}${mode} (${(t.positiveRate * 100).toFixed(0)}% positive, n=${t.total})`;
      });
      memoLines.push(`What worked: ${workingParts.join('. ')}.`);
    } else {
      memoLines.push('What worked: Insufficient data this week.');
    }

    // What didn't
    if (bottomInterventions.length > 0 && bottomInterventions[0].negativeRate > 0.4) {
      const avoidParts = bottomInterventions
        .filter(b => b.negativeRate > 0.4)
        .map(b => {
          const mode = b.handler_mode ? ` during ${b.handler_mode}` : '';
          return `${b.intervention_type}${mode} (${(b.negativeRate * 100).toFixed(0)}% negative, n=${b.total})`;
        });
      memoLines.push(`What didn't: ${avoidParts.join('. ')}.`);
    }

    // Trends
    const trendParts: string[] = [];
    trendParts.push(`Compliance ${complianceTrend} (${prevCompliance}% → ${currentCompliance}%)`);
    trendParts.push(`Resistance ${resistanceTrend}`);
    trendParts.push(`Dominant mood: ${moodTrend}`);
    if (corruptionDelta !== 0) {
      trendParts.push(`Corruption ${corruptionDelta > 0 ? '+' : ''}${corruptionDelta.toFixed(1)} (${prevCorruption.toFixed(1)} → ${currentCorruption.toFixed(1)})`);
    }
    if (skillAdvancements.length > 0) {
      trendParts.push(`Skills advanced: ${skillAdvancements.join(', ')}`);
    }
    trendParts.push(`Denial day ${denialDay}`);
    if (totalHonored + totalBroken > 0) {
      trendParts.push(`Commitments: ${totalHonored} honored, ${totalBroken} broken`);
    }
    memoLines.push(`Trends: ${trendParts.join('. ')}.`);

    // Strategy
    const strategyParts: string[] = [];
    if (complianceTrend === 'falling') strategyParts.push('Compliance dropping — reduce task intensity, increase praise frequency');
    if (resistanceTrend === 'increasing') strategyParts.push('Resistance rising — shift to Director mode, avoid confrontation');
    if (currentCorruption < 30) strategyParts.push('Corruption low — increase conditioning session frequency');
    if (skillAdvancements.length === 0) strategyParts.push('No skill advancement — prescribe skill check for strongest domain');

    if (strategyParts.length > 0) {
      memoLines.push(`Strategy for next week: ${strategyParts.join('. ')}.`);
    }

    const memo = memoLines.join('\n');

    // --- Store as handler_notes ---
    await supabase.from('handler_notes').insert({
      user_id: userId,
      note_type: 'strategy',
      content: memo,
      priority: 4,
    });

    // --- Generate and issue directives ---
    const directives: Array<{ action: string; target?: string; value?: Record<string, unknown>; reasoning: string }> = [];

    if (complianceTrend === 'falling') {
      directives.push({
        action: 'modify_parameter',
        target: 'conditioning_intensity_multiplier',
        value: { parameter: 'conditioning_intensity_multiplier', new_value: 1.0 },
        reasoning: 'Compliance falling — reduce intensity to prevent burnout',
      });
    }

    if (resistanceTrend === 'increasing') {
      directives.push({
        action: 'schedule_ambush',
        target: 'micro_conditioning',
        value: { ambush_type: 'micro_conditioning', delay_hours: 4 },
        reasoning: 'Resistance rising — deploy ambient micro-conditioning to soften',
      });
    }

    if (skillAdvancements.length === 0) {
      directives.push({
        action: 'advance_skill',
        target: 'voice',
        value: { check_type: 'progress_check' },
        reasoning: 'No skill advancement this week — push voice domain check',
      });
    }

    if (currentCorruption < 30 && denialDay >= 3) {
      directives.push({
        action: 'generate_script',
        target: 'trance_deepening',
        value: { conditioning_target: 'trance_deepening' },
        reasoning: 'Corruption low + denial elevated — generate deepening script',
      });
    }

    // Issue directives
    for (const d of directives) {
      await supabase.from('handler_directives').insert({
        user_id: userId,
        action: d.action,
        target: d.target || null,
        value: d.value || null,
        priority: 'normal',
        silent: true,
        reasoning: d.reasoning,
      });
    }

    return {
      topInterventions,
      bottomInterventions,
      resistanceTrend,
      moodTrend,
      skillAdvancements,
      complianceRate: { current: currentCompliance, previous: prevCompliance, trend: complianceTrend },
      denialDay,
      corruptionChange: { current: currentCorruption, previous: prevCorruption, delta: corruptionDelta },
      commitmentRatio: { honored: totalHonored, broken: totalBroken },
      journalTones,
      memo,
      directives,
    };
  } catch (err) {
    console.error('[handler-reflection] generateWeeklyReflection error:', err);
    return null;
  }
}

// ============================================
// BUILD REFLECTION CONTEXT (for Handler prompt)
// ============================================

/**
 * Handler context showing the latest weekly reflection memo.
 */
export async function buildReflectionContext(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('handler_notes')
      .select('content, created_at')
      .eq('user_id', userId)
      .eq('note_type', 'strategy')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return '';

    const age = Math.ceil((Date.now() - new Date(data.created_at).getTime()) / 86400000);
    if (age > 14) return ''; // Stale — skip

    return `WEEKLY REFLECTION (${age}d ago):\n${data.content}`;
  } catch {
    return '';
  }
}
