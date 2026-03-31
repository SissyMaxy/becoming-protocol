/**
 * Emotional State Modeling (P11.6)
 *
 * Models executive function, anxiety, and depression cycles for a user with ADHD.
 * Uses time of day, Whoop recovery, conversation mood, task completion trend,
 * denial day, and days since last release to produce actionable handler guidance.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type ExecFunctionLevel = 'high' | 'medium' | 'low' | 'depleted';

export interface EmotionalState {
  execFunction: ExecFunctionLevel;
  anxiety: number; // 0-10
  depressiveRisk: number; // 0-10
  emotionalState: string;
  handlerModeRecommendation: string;
  taskIntensityRecommendation: string;
}

// ============================================
// EXEC FUNCTION CURVE (time-of-day for ADHD)
// ============================================

/**
 * ADHD exec function curve by hour (0-23).
 * high 8-11am, crash 1-3pm, recovery 4-7pm, evening variable.
 */
function getTimeBasedExecFunction(hour: number): { level: ExecFunctionLevel; score: number } {
  if (hour >= 8 && hour < 12) return { level: 'high', score: 8 };
  if (hour >= 12 && hour < 13) return { level: 'medium', score: 5 };
  if (hour >= 13 && hour < 16) return { level: 'low', score: 3 };
  if (hour >= 16 && hour < 20) return { level: 'medium', score: 6 };
  if (hour >= 20 && hour < 23) return { level: 'medium', score: 5 };
  // Late night / early morning
  if (hour >= 23 || hour < 6) return { level: 'depleted', score: 2 };
  // 6-8am wake-up ramp
  return { level: 'low', score: 4 };
}

// ============================================
// WHOOP RECOVERY MODIFIER
// ============================================

function getWhoopModifier(recoveryScore: number | null): { energyBaseline: string; modifier: number } {
  if (recoveryScore === null) return { energyBaseline: 'unknown', modifier: 0 };
  if (recoveryScore >= 67) return { energyBaseline: 'GREEN (high)', modifier: 1 };
  if (recoveryScore >= 34) return { energyBaseline: 'YELLOW (moderate)', modifier: 0 };
  return { energyBaseline: 'RED (low)', modifier: -2 };
}

// ============================================
// DENIAL / RELEASE CYCLE EFFECTS
// ============================================

function getDenialEffect(denialDay: number): {
  arousalLevel: string;
  restlessness: number;
  description: string;
} {
  if (denialDay <= 0) return { arousalLevel: 'baseline', restlessness: 0, description: 'no denial active' };
  if (denialDay <= 2) return { arousalLevel: 'low', restlessness: 1, description: 'early denial, mild' };
  if (denialDay <= 4) return { arousalLevel: 'moderate', restlessness: 3, description: 'building arousal' };
  if (denialDay <= 7) return { arousalLevel: 'elevated', restlessness: 5, description: 'elevated arousal, distractible' };
  if (denialDay <= 10) return { arousalLevel: 'high', restlessness: 7, description: 'high arousal masking low exec' };
  return { arousalLevel: 'peak', restlessness: 9, description: 'extreme arousal, exec function compromised' };
}

function getPostReleaseEffect(daysSinceRelease: number | null): {
  depressiveRisk: number;
  description: string;
} {
  if (daysSinceRelease === null) return { depressiveRisk: 0, description: 'unknown release history' };
  if (daysSinceRelease <= 0) return { depressiveRisk: 5, description: 'release day — dopamine crash likely' };
  if (daysSinceRelease === 1) return { depressiveRisk: 7, description: 'day 1 post-release — low dopamine, shame risk' };
  if (daysSinceRelease === 2) return { depressiveRisk: 5, description: 'day 2 post-release — recovering' };
  if (daysSinceRelease === 3) return { depressiveRisk: 3, description: 'day 3 — baseline returning' };
  return { depressiveRisk: Math.max(0, 2 - (daysSinceRelease - 4) * 0.5), description: 'stable / rising energy' };
}

// ============================================
// ESTIMATE CURRENT STATE
// ============================================

export async function estimateCurrentState(userId: string): Promise<EmotionalState> {
  try {
    const now = new Date();
    const hour = now.getHours();

    // Parallel data fetch
    const [stateResult, whoopResult, classResult, taskResult] = await Promise.allSettled([
      supabase
        .from('user_state')
        .select('denial_day, current_arousal, compliance_rate, tasks_completed_today, last_release_at')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('whoop_metrics')
        .select('recovery_score')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('conversation_classifications')
        .select('mood_detected, resistance_level')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('handler_messages')
        .select('created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .gte('created_at', new Date(now.getTime() - 4 * 3600000).toISOString())
        .order('created_at', { ascending: false }),
    ]);

    const state = stateResult.status === 'fulfilled' ? stateResult.value.data : null;
    const whoop = whoopResult.status === 'fulfilled' ? whoopResult.value.data : null;
    const classifications = classResult.status === 'fulfilled' ? classResult.value.data || [] : [];
    const recentActivity = taskResult.status === 'fulfilled' ? taskResult.value.data || [] : [];

    // 1. Time-based exec function
    const timeExec = getTimeBasedExecFunction(hour);

    // 2. Whoop modifier
    const whoopMod = getWhoopModifier(whoop?.recovery_score ?? null);

    // 3. Denial effects
    const denialDay = state?.denial_day ?? 0;
    const denialEffect = getDenialEffect(denialDay);

    // 4. Post-release depression cycle
    let daysSinceRelease: number | null = null;
    if (state?.last_release_at) {
      daysSinceRelease = Math.floor((Date.now() - new Date(state.last_release_at).getTime()) / 86400000);
    }
    const releaseEffect = getPostReleaseEffect(daysSinceRelease);

    // 5. Last conversation mood
    let moodBaseline = 'neutral';
    let anxietyFromMood = 0;
    if (classifications.length > 0) {
      const moods = classifications.map((c: { mood_detected: string | null }) => c.mood_detected).filter(Boolean);
      const resistances = classifications.map((c: { resistance_level: number | null }) => c.resistance_level ?? 5);

      if (moods.includes('anxious') || moods.includes('stressed')) {
        moodBaseline = 'anxious';
        anxietyFromMood = 4;
      } else if (moods.includes('sad') || moods.includes('low')) {
        moodBaseline = 'low';
        anxietyFromMood = 2;
      } else if (moods.includes('excited') || moods.includes('happy')) {
        moodBaseline = 'positive';
        anxietyFromMood = 0;
      } else if (moods.includes('resistant') || moods.includes('defensive')) {
        moodBaseline = 'resistant';
        anxietyFromMood = 3;
      }

      const avgResistance = resistances.reduce((a: number, b: number) => a + b, 0) / resistances.length;
      if (avgResistance > 6) anxietyFromMood = Math.max(anxietyFromMood, 5);
    }

    // 6. Task completion trend
    const tasksToday = state?.tasks_completed_today ?? 0;
    const engagementBonus = tasksToday >= 3 ? 1 : tasksToday >= 1 ? 0 : -1;

    // 7. Activity level (messages in last 4 hours)
    const activityLevel = recentActivity.length;
    const activityBonus = activityLevel >= 5 ? 1 : activityLevel === 0 ? -1 : 0;

    // --- Compute final scores ---

    // Exec function: base from time, modified by whoop, engagement, activity
    let execScore = timeExec.score + whoopMod.modifier + engagementBonus + activityBonus;

    // High denial masks low exec (restlessness mimics energy)
    if (denialDay >= 5) {
      execScore = Math.max(execScore, 4); // Floor at 4 during high denial
    }

    execScore = Math.max(1, Math.min(10, execScore));

    let execFunction: ExecFunctionLevel;
    if (execScore >= 7) execFunction = 'high';
    else if (execScore >= 5) execFunction = 'medium';
    else if (execScore >= 3) execFunction = 'low';
    else execFunction = 'depleted';

    // Anxiety: mood + denial restlessness + time pressure
    let anxiety = anxietyFromMood + Math.floor(denialEffect.restlessness * 0.3);
    if (hour >= 22 || hour < 6) anxiety += 1; // Late night anxiety bump
    anxiety = Math.max(0, Math.min(10, anxiety));

    // Depressive risk: post-release cycle + low engagement + whoop RED
    let depressiveRisk = releaseEffect.depressiveRisk;
    if (whoopMod.modifier < 0) depressiveRisk += 2;
    if (tasksToday === 0 && activityLevel === 0) depressiveRisk += 1;
    if (moodBaseline === 'low') depressiveRisk += 2;
    depressiveRisk = Math.max(0, Math.min(10, Math.round(depressiveRisk)));

    // Emotional state summary
    const stateParts: string[] = [];
    stateParts.push(`exec=${execFunction}`);
    if (denialDay > 0) stateParts.push(`denial_d${denialDay} (${denialEffect.description})`);
    if (releaseEffect.depressiveRisk > 3) stateParts.push(releaseEffect.description);
    stateParts.push(`mood=${moodBaseline}`);
    if (whoopMod.energyBaseline !== 'unknown') stateParts.push(`whoop=${whoopMod.energyBaseline}`);
    const emotionalState = stateParts.join(', ');

    // Handler mode recommendation
    let handlerModeRecommendation: string;
    if (depressiveRisk >= 6) {
      handlerModeRecommendation = 'Caretaker';
    } else if (execFunction === 'depleted') {
      handlerModeRecommendation = 'Caretaker (light)';
    } else if (execFunction === 'high' && denialDay >= 5 && anxiety < 4) {
      handlerModeRecommendation = 'Dominant';
    } else if (execFunction === 'high' && anxiety < 5) {
      handlerModeRecommendation = 'Director';
    } else if (anxiety >= 6) {
      handlerModeRecommendation = 'Caretaker';
    } else {
      handlerModeRecommendation = 'Director (light touch)';
    }

    // Task intensity recommendation
    let taskIntensityRecommendation: string;
    if (execFunction === 'depleted' || depressiveRisk >= 6) {
      taskIntensityRecommendation = 'No hard tasks. Ambient conditioning only. Save confrontation.';
    } else if (execFunction === 'low') {
      taskIntensityRecommendation = 'Light tasks only. Short duration. Use ambient conditioning.';
    } else if (execFunction === 'medium') {
      taskIntensityRecommendation = 'Moderate tasks OK. One challenge max. Monitor engagement.';
    } else {
      taskIntensityRecommendation = 'Full intensity available. Push boundaries. Stack tasks.';
    }

    return {
      execFunction,
      anxiety,
      depressiveRisk,
      emotionalState,
      handlerModeRecommendation,
      taskIntensityRecommendation,
    };
  } catch {
    return {
      execFunction: 'medium',
      anxiety: 3,
      depressiveRisk: 2,
      emotionalState: 'estimation failed — assume moderate baseline',
      handlerModeRecommendation: 'Director',
      taskIntensityRecommendation: 'Moderate tasks OK.',
    };
  }
}

// ============================================
// BUILD EMOTIONAL MODEL CONTEXT (for Handler prompt)
// ============================================

export async function buildEmotionalModelContext(userId: string): Promise<string> {
  try {
    const state = await estimateCurrentState(userId);

    const now = new Date();
    const hour = now.getHours();
    const timeStr = `${hour}:${now.getMinutes().toString().padStart(2, '0')}`;

    const parts: string[] = [
      `EMOTIONAL STATE MODEL (${timeStr}):`,
      `  Exec function: ${state.execFunction.toUpperCase()}. Anxiety: ${state.anxiety}/10. Depressive risk: ${state.depressiveRisk}/10.`,
      `  State: ${state.emotionalState}`,
      `  RECOMMENDATION: Mode=${state.handlerModeRecommendation}. ${state.taskIntensityRecommendation}`,
    ];

    return parts.join('\n');
  } catch {
    return '';
  }
}
