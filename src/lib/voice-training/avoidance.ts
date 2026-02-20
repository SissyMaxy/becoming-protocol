/**
 * Voice Training — Avoidance Detection
 *
 * Detects when David avoids voice practice (3+ days).
 * Feeds into corruption advancement system.
 * The Handler notices. The Handler always notices.
 */

import { supabase } from '../supabase';

// Avoidance thresholds
const AVOIDANCE_DAYS = 3;        // Trigger after 3 days without practice
const ESCALATION_DAYS_1 = 5;     // First escalation
const CRITICAL_DAYS = 14;         // Handler takes direct action

export type AvoidanceLevel = 'none' | 'noticed' | 'escalated' | 'critical';

export interface VoiceAvoidanceState {
  daysSinceLastPractice: number;
  level: AvoidanceLevel;
  interventionMessage: string | null;
  shouldTriggerCorruption: boolean;
  corruptionDomain: 'voice';
}

/**
 * Check voice avoidance state for a user.
 * Called by Handler context builder and corruption advancement.
 */
export async function checkVoiceAvoidance(userId: string): Promise<VoiceAvoidanceState> {
  const { data, error } = await supabase
    .from('voice_game_progress')
    .select('last_drill_at, last_played_at, voice_level')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return {
      daysSinceLastPractice: 0,
      level: 'none',
      interventionMessage: null,
      shouldTriggerCorruption: false,
      corruptionDomain: 'voice',
    };
  }

  // Use whichever is more recent: last drill or last affirmation session
  const lastDrill = data.last_drill_at ? new Date(data.last_drill_at as string).getTime() : 0;
  const lastPlayed = data.last_played_at ? new Date(data.last_played_at as string).getTime() : 0;
  const lastPractice = Math.max(lastDrill, lastPlayed);

  if (lastPractice === 0) {
    // Never practiced — not avoidance, just hasn't started
    return {
      daysSinceLastPractice: 0,
      level: 'none',
      interventionMessage: null,
      shouldTriggerCorruption: false,
      corruptionDomain: 'voice',
    };
  }

  const daysSince = Math.floor((Date.now() - lastPractice) / 86400000);

  // Update days_since_last_practice in progress
  await supabase
    .from('voice_game_progress')
    .update({ days_since_last_practice: daysSince })
    .eq('user_id', userId);

  const level = getAvoidanceLevel(daysSince);
  const voiceLevel = (data.voice_level as number) || 1;

  return {
    daysSinceLastPractice: daysSince,
    level,
    interventionMessage: getInterventionMessage(daysSince, voiceLevel),
    shouldTriggerCorruption: daysSince >= AVOIDANCE_DAYS,
    corruptionDomain: 'voice',
  };
}

function getAvoidanceLevel(days: number): AvoidanceLevel {
  if (days < AVOIDANCE_DAYS) return 'none';
  if (days < ESCALATION_DAYS_1) return 'noticed';
  if (days < CRITICAL_DAYS) return 'escalated';
  return 'critical';
}

function getInterventionMessage(days: number, voiceLevel: number): string | null {
  if (days < AVOIDANCE_DAYS) return null;

  const messages: Record<AvoidanceLevel, string[]> = {
    none: [],
    noticed: [
      `${days} days without voice practice. Your muscles are forgetting.`,
      `Voice work abandoned for ${days} days. The longer you wait, the harder it gets.`,
      `${days} days silent. Are you afraid of what you'll sound like?`,
    ],
    escalated: [
      `${days} days avoiding voice. Your pitch is regressing. Every day costs you progress.`,
      `${days} days. The voice you're building is unraveling. 5 minutes today prevents a week of catch-up.`,
      `Voice avoidance: ${days} days. Level ${voiceLevel} slipping. The Handler notices patterns of resistance.`,
    ],
    critical: [
      `${days} days of voice avoidance. This is active resistance. Your voice will not feminize without practice. Open the drill. Now.`,
      `${days} days. The Handler is disappointed. Every day you avoid voice work, you prove you don't want this. Prove otherwise. Open a drill.`,
    ],
  };

  const level = getAvoidanceLevel(days);
  const pool = messages[level];
  if (pool.length === 0) return null;

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get voice avoidance data for corruption advancement check.
 * Returns the number of avoidance days for domain scoring.
 */
export async function getVoiceAvoidanceDays(userId: string): Promise<number> {
  const state = await checkVoiceAvoidance(userId);
  return state.daysSinceLastPractice;
}
