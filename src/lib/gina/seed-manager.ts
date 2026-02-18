/**
 * Gina Seed Manager
 *
 * Handles seed logging, ladder state updates on each response,
 * and recovery cascade triggering (consecutive failures, cooldowns).
 */

import { supabase } from '../supabase';
import {
  type GinaChannel,
  getChannelState,
  setCooldown,
  isInCooldown,
} from './ladder-engine';

// ============================================
// TYPES
// ============================================

export type SeedResponse = 'positive' | 'neutral' | 'negative' | 'callout' | 'no_reaction';

export type RecoveryType = 'single_failure' | 'double_failure' | 'callout' | 'rupture';

export interface SeedEntry {
  id: string;
  userId: string;
  channel: GinaChannel;
  rung: number;
  taskId?: string;
  seedDescription: string;
  ginaResponse: SeedResponse;
  ginaExactWords?: string;
  contextNotes?: string;
  herMood?: string;
  timing?: string;
  setting?: string;
  recoveryTriggered: boolean;
  recoveryType?: RecoveryType;
  createdAt: Date;
}

export interface LogSeedInput {
  channel: GinaChannel;
  rung?: number; // Auto-filled from current if omitted
  taskId?: string;
  seedDescription: string;
  ginaResponse: SeedResponse;
  ginaExactWords?: string;
  contextNotes?: string;
  herMood?: string;
  timing?: string;
  setting?: string;
}

export interface SeedLogResult {
  seedId: string;
  recoveryTriggered: boolean;
  recoveryType?: RecoveryType;
  cooldownSet: boolean;
  cooldownUntil?: Date;
  rungAdvancementPossible: boolean;
  newConsecutiveFailures: number;
}

// ============================================
// SEED LOGGING
// ============================================

function mapRowToSeed(row: Record<string, unknown>): SeedEntry {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    channel: row.channel as GinaChannel,
    rung: row.rung as number,
    taskId: row.task_id as string | undefined,
    seedDescription: row.seed_description as string,
    ginaResponse: row.gina_response as SeedResponse,
    ginaExactWords: row.gina_exact_words as string | undefined,
    contextNotes: row.context_notes as string | undefined,
    herMood: row.her_mood as string | undefined,
    timing: row.timing as string | undefined,
    setting: row.setting as string | undefined,
    recoveryTriggered: row.recovery_triggered as boolean,
    recoveryType: row.recovery_type as RecoveryType | undefined,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Log a seed attempt and cascade all state updates.
 *
 * This is the primary entry point for recording Gina interactions.
 * It handles:
 * 1. Writing the seed log entry
 * 2. Updating ladder state (consecutive failures, positive counts)
 * 3. Triggering recovery protocols if needed
 * 4. Setting cooldowns on double failures or callouts
 */
export async function logSeed(
  userId: string,
  input: LogSeedInput
): Promise<SeedLogResult> {
  // Get current channel state
  const channelState = await getChannelState(userId, input.channel);
  const currentRung = input.rung ?? channelState?.currentRung ?? 0;

  // Determine if recovery is triggered
  let recoveryTriggered = false;
  let recoveryType: RecoveryType | undefined;
  let cooldownSet = false;
  let cooldownUntil: Date | undefined;
  let newConsecutiveFailures = channelState?.consecutiveFailures || 0;

  if (input.ginaResponse === 'negative') {
    newConsecutiveFailures += 1;

    if (newConsecutiveFailures >= 2) {
      recoveryTriggered = true;
      recoveryType = 'double_failure';
      cooldownSet = true;
      cooldownUntil = await setCooldown(userId, input.channel, 'double_failure');
    } else {
      recoveryTriggered = true;
      recoveryType = 'single_failure';
    }
  } else if (input.ginaResponse === 'callout') {
    recoveryTriggered = true;
    recoveryType = 'callout';
    cooldownSet = true;
    cooldownUntil = await setCooldown(userId, input.channel, 'callout');
    newConsecutiveFailures = 0; // Reset count but set cooldown
  } else if (input.ginaResponse === 'positive') {
    newConsecutiveFailures = 0; // Reset on positive
  }

  // Write seed log entry
  const { data: seedData, error: seedError } = await supabase
    .from('gina_seed_log')
    .insert({
      user_id: userId,
      channel: input.channel,
      rung: currentRung,
      task_id: input.taskId,
      seed_description: input.seedDescription,
      gina_response: input.ginaResponse,
      gina_exact_words: input.ginaExactWords,
      context_notes: input.contextNotes,
      her_mood: input.herMood,
      timing: input.timing,
      setting: input.setting,
      recovery_triggered: recoveryTriggered,
      recovery_type: recoveryType,
    })
    .select('id')
    .single();

  if (seedError) {
    console.error('Failed to log seed:', seedError);
    return {
      seedId: '',
      recoveryTriggered: false,
      cooldownSet: false,
      rungAdvancementPossible: false,
      newConsecutiveFailures: 0,
    };
  }

  // Update ladder state
  const positiveIncrement = input.ginaResponse === 'positive' ? 1 : 0;
  const updateData: Record<string, unknown> = {
    last_seed_date: new Date().toISOString(),
    last_seed_result: input.ginaResponse,
    consecutive_failures: newConsecutiveFailures,
    positive_seeds_at_rung: (channelState?.positiveSeedsAtRung || 0) + positiveIncrement,
    total_seeds_at_rung: (channelState?.totalSeedsAtRung || 0) + 1,
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from('gina_ladder_state')
    .update(updateData)
    .eq('user_id', userId)
    .eq('channel', input.channel);

  // Check if rung advancement is now possible
  let rungAdvancementPossible = false;
  if (input.ginaResponse === 'positive' && !isInCooldown(channelState!)) {
    // Quick check: do we have enough positive seeds?
    const newPositiveCount = (channelState?.positiveSeedsAtRung || 0) + 1;
    const rung = channelState?.currentRung || 0;
    if (rung < 5) {
      const thresholds: Record<number, number> = { 0: 0, 1: 3, 2: 5, 3: 5, 4: 3 };
      rungAdvancementPossible = newPositiveCount >= (thresholds[rung] || 3);
    }
  }

  return {
    seedId: seedData?.id || '',
    recoveryTriggered,
    recoveryType,
    cooldownSet,
    cooldownUntil,
    rungAdvancementPossible,
    newConsecutiveFailures,
  };
}

// ============================================
// SEED QUERIES
// ============================================

export async function getSeedHistory(
  userId: string,
  channel?: GinaChannel,
  limit = 50
): Promise<SeedEntry[]> {
  let query = supabase
    .from('gina_seed_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (channel) {
    query = query.eq('channel', channel);
  }

  const { data } = await query;
  return (data || []).map(mapRowToSeed);
}

export async function getSeedsByRung(
  userId: string,
  channel: GinaChannel,
  rung: number
): Promise<SeedEntry[]> {
  const { data } = await supabase
    .from('gina_seed_log')
    .select('*')
    .eq('user_id', userId)
    .eq('channel', channel)
    .eq('rung', rung)
    .order('created_at', { ascending: false });

  return (data || []).map(mapRowToSeed);
}

export async function getRecentSeeds(
  userId: string,
  dayRange = 7
): Promise<SeedEntry[]> {
  const since = new Date();
  since.setDate(since.getDate() - dayRange);

  const { data } = await supabase
    .from('gina_seed_log')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  return (data || []).map(mapRowToSeed);
}

// ============================================
// SEED ANALYTICS
// ============================================

export async function getSeedStats(
  userId: string,
  channel?: GinaChannel
): Promise<{
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  callout: number;
  noReaction: number;
  successRate: number;
  recoveriesTriggered: number;
}> {
  let query = supabase
    .from('gina_seed_log')
    .select('gina_response, recovery_triggered')
    .eq('user_id', userId);

  if (channel) {
    query = query.eq('channel', channel);
  }

  const { data } = await query;
  const entries = data || [];

  const positive = entries.filter(e => e.gina_response === 'positive').length;
  const neutral = entries.filter(e => e.gina_response === 'neutral').length;
  const negative = entries.filter(e => e.gina_response === 'negative').length;
  const callout = entries.filter(e => e.gina_response === 'callout').length;
  const noReaction = entries.filter(e => e.gina_response === 'no_reaction').length;
  const total = entries.length;
  const recoveriesTriggered = entries.filter(e => e.recovery_triggered).length;

  return {
    total,
    positive,
    neutral,
    negative,
    callout,
    noReaction,
    successRate: total > 0 ? Math.round((positive / total) * 100) : 0,
    recoveriesTriggered,
  };
}

// ============================================
// RECOVERY MANAGEMENT
// ============================================

/**
 * Log a discovery rupture (manual trigger).
 * This is the most severe recovery — Gina discovered something directly.
 */
export async function logDiscoveryRupture(
  userId: string,
  channel: GinaChannel,
  description: string,
  ginaExactWords?: string
): Promise<SeedLogResult> {
  return logSeed(userId, {
    channel,
    seedDescription: `RUPTURE: ${description}`,
    ginaResponse: 'callout',
    ginaExactWords,
  });
}

/**
 * Get channels currently in recovery (cooldown or recent failure).
 */
export async function getChannelsInRecovery(
  userId: string
): Promise<{ channel: GinaChannel; recoveryType: string; cooldownDaysRemaining: number }[]> {
  const states = await supabase
    .from('gina_ladder_state')
    .select('channel, consecutive_failures, cooldown_until, last_seed_result')
    .eq('user_id', userId);

  const inRecovery: { channel: GinaChannel; recoveryType: string; cooldownDaysRemaining: number }[] = [];

  for (const state of states.data || []) {
    const cooldownUntil = state.cooldown_until ? new Date(state.cooldown_until) : null;
    const inCooldown = cooldownUntil && cooldownUntil > new Date();

    if (inCooldown || (state.consecutive_failures as number) > 0) {
      const daysRemaining = cooldownUntil
        ? Math.max(0, Math.ceil((cooldownUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;

      let recoveryType = 'single_failure';
      if (state.last_seed_result === 'callout') recoveryType = 'callout_recovery';
      else if ((state.consecutive_failures as number) >= 2) recoveryType = 'double_failure_cooldown';

      inRecovery.push({
        channel: state.channel as GinaChannel,
        recoveryType,
        cooldownDaysRemaining: daysRemaining,
      });
    }
  }

  return inRecovery;
}
