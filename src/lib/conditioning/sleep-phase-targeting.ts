/**
 * Whoop Sleep Phase Targeting (P10.5)
 *
 * Analyzes sleep architecture from Whoop data to recommend conditioning
 * content types. REM-dominant nights → identity scripts. Deep-sleep-dominant
 * → trigger installation. Light-sleep-dominant → ambient affirmations.
 *
 * Advisory only — tells the Handler and sleep prescription system what
 * type of content to prescribe based on last night's sleep architecture.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface SleepPhaseRecommendation {
  recommendedCategory: 'identity_scripts' | 'trigger_installation' | 'ambient_affirmations' | 'mixed';
  recommendedIntensity: number; // 1-10
  reasoning: string;
  sleepData?: {
    remHours: number;
    deepHours: number;
    lightHours: number;
    totalHours: number;
    dominantPhase: 'rem' | 'deep' | 'light';
  };
}

// ============================================
// RECOMMENDATION ENGINE
// ============================================

/**
 * Query latest Whoop metrics for sleep data and recommend conditioning
 * content category based on sleep phase distribution.
 */
export async function getSleepPhaseRecommendation(
  userId: string,
): Promise<SleepPhaseRecommendation | null> {
  try {
    // Check Whoop connection
    const { data: tokenRow } = await supabase
      .from('whoop_tokens')
      .select('id')
      .eq('user_id', userId)
      .is('disconnected_at', null)
      .maybeSingle();

    if (!tokenRow) return null;

    // Get most recent sleep metrics (today or yesterday)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const { data: metrics } = await supabase
      .from('whoop_metrics')
      .select('rem_sleep_milli, deep_sleep_milli, light_sleep_milli, total_sleep_duration_milli, date')
      .eq('user_id', userId)
      .in('date', [today, yesterday])
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!metrics) return null;

    const remMilli = metrics.rem_sleep_milli || 0;
    const deepMilli = metrics.deep_sleep_milli || 0;
    const lightMilli = metrics.light_sleep_milli || 0;
    const totalMilli = metrics.total_sleep_duration_milli || (remMilli + deepMilli + lightMilli);

    if (totalMilli === 0) return null;

    const remHours = remMilli / 3600000;
    const deepHours = deepMilli / 3600000;
    const lightHours = lightMilli / 3600000;
    const totalHours = totalMilli / 3600000;

    const remPct = remMilli / totalMilli;
    const deepPct = deepMilli / totalMilli;
    const lightPct = lightMilli / totalMilli;

    // Determine dominant phase
    let dominantPhase: 'rem' | 'deep' | 'light';
    if (remPct >= deepPct && remPct >= lightPct) {
      dominantPhase = 'rem';
    } else if (deepPct >= remPct && deepPct >= lightPct) {
      dominantPhase = 'deep';
    } else {
      dominantPhase = 'light';
    }

    const sleepData = { remHours, deepHours, lightHours, totalHours, dominantPhase };

    // REM-dominant: identity content is being processed well → identity scripts
    if (dominantPhase === 'rem' && remPct > 0.20) {
      const intensity = Math.min(10, Math.round(5 + (remPct - 0.20) * 25));
      return {
        recommendedCategory: 'identity_scripts',
        recommendedIntensity: intensity,
        reasoning: `REM-dominant night (${Math.round(remPct * 100)}% REM, ${remHours.toFixed(1)}h). Identity content is consolidating in REM — prescribe identity scripts to deepen integration.`,
        sleepData,
      };
    }

    // Deep-sleep-dominant: subconscious processing active → trigger installation
    if (dominantPhase === 'deep' && deepPct > 0.15) {
      const intensity = Math.min(10, Math.round(6 + (deepPct - 0.15) * 20));
      return {
        recommendedCategory: 'trigger_installation',
        recommendedIntensity: intensity,
        reasoning: `Deep-sleep-dominant night (${Math.round(deepPct * 100)}% deep, ${deepHours.toFixed(1)}h). Subconscious processing is active — prescribe trigger installation scripts.`,
        sleepData,
      };
    }

    // Light-sleep-dominant: lighter conditioning appropriate → ambient affirmations
    if (dominantPhase === 'light') {
      const intensity = Math.max(2, Math.round(4 - (lightPct - 0.50) * 10));
      return {
        recommendedCategory: 'ambient_affirmations',
        recommendedIntensity: intensity,
        reasoning: `Light-sleep-dominant night (${Math.round(lightPct * 100)}% light, ${lightHours.toFixed(1)}h). Lighter conditioning appropriate — prescribe ambient affirmations.`,
        sleepData,
      };
    }

    // Mixed sleep architecture — balanced recommendation
    return {
      recommendedCategory: 'mixed',
      recommendedIntensity: 5,
      reasoning: `Balanced sleep architecture (REM ${Math.round(remPct * 100)}%, deep ${Math.round(deepPct * 100)}%, light ${Math.round(lightPct * 100)}%). Mixed content appropriate.`,
      sleepData,
    };
  } catch (err) {
    console.error('[sleep-phase-targeting] getSleepPhaseRecommendation error:', err);
    return null;
  }
}

// ============================================
// HANDLER CONTEXT
// ============================================

/**
 * Build Handler context block with sleep phase recommendation.
 */
export async function buildSleepPhaseContext(userId: string): Promise<string> {
  try {
    const rec = await getSleepPhaseRecommendation(userId);
    if (!rec || !rec.sleepData) return '';

    const { sleepData } = rec;
    const parts: string[] = [];

    const categoryLabel: Record<string, string> = {
      identity_scripts: 'identity scripts',
      trigger_installation: 'trigger installation scripts',
      ambient_affirmations: 'ambient affirmations',
      mixed: 'mixed content',
    };

    const phaseLabel: Record<string, string> = {
      rem: 'REM-dominant',
      deep: 'deep-sleep-dominant',
      light: 'light-sleep-dominant',
    };

    parts.push(
      `SLEEP PHASE: last night: ${sleepData.remHours.toFixed(1)}h REM, ${sleepData.deepHours.toFixed(1)}h deep, ${sleepData.lightHours.toFixed(1)}h light (${sleepData.totalHours.toFixed(1)}h total)`,
    );
    parts.push(
      `  ${phaseLabel[sleepData.dominantPhase]} = ${rec.reasoning.split(' — ')[1] || rec.reasoning.split('. ').pop()}`,
    );
    parts.push(
      `  prescribe: ${categoryLabel[rec.recommendedCategory]} tonight (intensity ${rec.recommendedIntensity}/10)`,
    );

    return parts.join('\n');
  } catch (err) {
    console.error('[sleep-phase-targeting] buildSleepPhaseContext error:', err);
    return '';
  }
}
