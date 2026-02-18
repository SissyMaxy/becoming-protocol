/**
 * Gina Ladder Engine
 *
 * Rung advancement logic, cooldown enforcement, and channel-level gating
 * for task selection. Plugs into the rules engine's meetsCondition().
 *
 * 10 channels, 5 rungs each. Advancement based on seed outcomes.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export const GINA_CHANNELS = [
  'scent',
  'touch',
  'domestic',
  'intimacy',
  'visual',
  'social',
  'bedroom',
  'pronoun',
  'financial',
  'body_change_touch',
] as const;

export type GinaChannel = typeof GINA_CHANNELS[number];

export interface GinaLadderState {
  id: string;
  userId: string;
  channel: GinaChannel;
  currentRung: number; // 0=not started, 1-5
  rungEnteredAt: Date | null;
  lastSeedDate: Date | null;
  lastSeedResult: 'positive' | 'neutral' | 'negative' | 'callout' | null;
  consecutiveFailures: number;
  cooldownUntil: Date | null;
  positiveSeedsAtRung: number;
  totalSeedsAtRung: number;
}

export interface AdvancementCriteria {
  requiredPositiveSeeds: number;
  maxNegativeInLast: number; // max negative in last N seeds
  lastNSeeds: number; // N for the above check
  measurementThreshold?: number; // score threshold from measurements
  sustainedPeriods?: number; // periods above threshold for L3->L4
  requiresGinaInitiated?: boolean; // L4->L5 needs unprompted behavior
}

export interface AdvancementResult {
  canAdvance: boolean;
  reason: string;
  newRung?: number;
}

export interface ChannelGateCheck {
  channel: GinaChannel;
  taskLevel: number;
  allowed: boolean;
  reason: string;
  inCooldown: boolean;
  cooldownEnds?: Date;
}

// ============================================
// ADVANCEMENT CRITERIA PER RUNG TRANSITION
// ============================================

const ADVANCEMENT_CRITERIA: Record<string, AdvancementCriteria> = {
  '0_to_1': {
    requiredPositiveSeeds: 0, // Auto-start: first seed attempt unlocks L1
    maxNegativeInLast: 5,
    lastNSeeds: 5,
  },
  '1_to_2': {
    requiredPositiveSeeds: 3,
    maxNegativeInLast: 0, // zero negative in last 5
    lastNSeeds: 5,
  },
  '2_to_3': {
    requiredPositiveSeeds: 5,
    maxNegativeInLast: 1,
    lastNSeeds: 7,
    measurementThreshold: 3.0, // score above 3.0
  },
  '3_to_4': {
    requiredPositiveSeeds: 5,
    maxNegativeInLast: 1,
    lastNSeeds: 10,
    measurementThreshold: 3.5,
    sustainedPeriods: 2, // above threshold for 2+ measurement periods
  },
  '4_to_5': {
    requiredPositiveSeeds: 3,
    maxNegativeInLast: 0,
    lastNSeeds: 5,
    measurementThreshold: 4.0,
    requiresGinaInitiated: true, // Gina-initiated behaviors detected
  },
};

// Cooldown durations by failure type
const COOLDOWN_DAYS: Record<string, number> = {
  double_failure: 14,
  callout: 21,
  rupture: 30,
};

// ============================================
// LADDER STATE QUERIES
// ============================================

function mapRowToState(row: Record<string, unknown>): GinaLadderState {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    channel: row.channel as GinaChannel,
    currentRung: (row.current_rung as number) || 0,
    rungEnteredAt: row.rung_entered_at ? new Date(row.rung_entered_at as string) : null,
    lastSeedDate: row.last_seed_date ? new Date(row.last_seed_date as string) : null,
    lastSeedResult: row.last_seed_result as GinaLadderState['lastSeedResult'],
    consecutiveFailures: (row.consecutive_failures as number) || 0,
    cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until as string) : null,
    positiveSeedsAtRung: (row.positive_seeds_at_rung as number) || 0,
    totalSeedsAtRung: (row.total_seeds_at_rung as number) || 0,
  };
}

export async function getAllChannelStates(userId: string): Promise<GinaLadderState[]> {
  const { data, error } = await supabase
    .from('gina_ladder_state')
    .select('*')
    .eq('user_id', userId)
    .order('channel');

  if (error) {
    console.error('Failed to get ladder states:', error);
    return [];
  }

  return (data || []).map(mapRowToState);
}

export async function getChannelState(
  userId: string,
  channel: GinaChannel
): Promise<GinaLadderState | null> {
  const { data, error } = await supabase
    .from('gina_ladder_state')
    .select('*')
    .eq('user_id', userId)
    .eq('channel', channel)
    .single();

  if (error || !data) return null;
  return mapRowToState(data);
}

export async function initializeLadder(userId: string): Promise<void> {
  const { error } = await supabase.rpc('initialize_gina_ladder', {
    p_user_id: userId,
  });

  if (error) {
    console.error('Failed to initialize ladder:', error);
    // Fallback: insert manually
    for (const channel of GINA_CHANNELS) {
      await supabase
        .from('gina_ladder_state')
        .upsert({
          user_id: userId,
          channel,
          current_rung: 0,
        }, { onConflict: 'user_id,channel' });
    }
  }
}

// ============================================
// COOLDOWN ENFORCEMENT
// ============================================

export function isInCooldown(state: GinaLadderState): boolean {
  if (!state.cooldownUntil) return false;
  return new Date() < state.cooldownUntil;
}

export function getCooldownRemaining(state: GinaLadderState): number {
  if (!state.cooldownUntil) return 0;
  const remaining = state.cooldownUntil.getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
}

export async function setCooldown(
  userId: string,
  channel: GinaChannel,
  recoveryType: 'double_failure' | 'callout' | 'rupture'
): Promise<Date> {
  const days = COOLDOWN_DAYS[recoveryType] || 14;
  const cooldownUntil = new Date();
  cooldownUntil.setDate(cooldownUntil.getDate() + days);

  await supabase
    .from('gina_ladder_state')
    .update({
      cooldown_until: cooldownUntil.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('channel', channel);

  return cooldownUntil;
}

export async function clearCooldown(
  userId: string,
  channel: GinaChannel
): Promise<void> {
  await supabase
    .from('gina_ladder_state')
    .update({
      cooldown_until: null,
      consecutive_failures: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('channel', channel);
}

// ============================================
// RUNG ADVANCEMENT
// ============================================

export async function checkAdvancement(
  userId: string,
  channel: GinaChannel
): Promise<AdvancementResult> {
  const state = await getChannelState(userId, channel);
  if (!state) {
    return { canAdvance: false, reason: 'Channel state not found' };
  }

  if (state.currentRung >= 5) {
    return { canAdvance: false, reason: 'Already at maximum rung' };
  }

  if (isInCooldown(state)) {
    return {
      canAdvance: false,
      reason: `In cooldown until ${state.cooldownUntil?.toLocaleDateString()}`,
    };
  }

  const key = `${state.currentRung}_to_${state.currentRung + 1}`;
  const criteria = ADVANCEMENT_CRITERIA[key];

  if (!criteria) {
    return { canAdvance: false, reason: 'No advancement criteria defined' };
  }

  // Check positive seed count at current rung
  if (state.positiveSeedsAtRung < criteria.requiredPositiveSeeds) {
    return {
      canAdvance: false,
      reason: `Need ${criteria.requiredPositiveSeeds} positive seeds, have ${state.positiveSeedsAtRung}`,
    };
  }

  // Check recent negative seeds
  const { data: recentSeeds } = await supabase
    .from('gina_seed_log')
    .select('gina_response')
    .eq('user_id', userId)
    .eq('channel', channel)
    .eq('rung', state.currentRung)
    .order('created_at', { ascending: false })
    .limit(criteria.lastNSeeds);

  const negativeCount = (recentSeeds || []).filter(
    s => s.gina_response === 'negative' || s.gina_response === 'callout'
  ).length;

  if (negativeCount > criteria.maxNegativeInLast) {
    return {
      canAdvance: false,
      reason: `${negativeCount} negative responses in last ${criteria.lastNSeeds} seeds (max: ${criteria.maxNegativeInLast})`,
    };
  }

  // Check measurement threshold (for L2+ transitions)
  if (criteria.measurementThreshold !== undefined) {
    const { data: measurements } = await supabase
      .from('gina_measurements')
      .select('score')
      .eq('user_id', userId)
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(criteria.sustainedPeriods || 1);

    if (!measurements || measurements.length === 0) {
      return {
        canAdvance: false,
        reason: 'No measurement data available for this channel',
      };
    }

    const allAboveThreshold = measurements.every(
      m => (m.score || 0) >= criteria.measurementThreshold!
    );

    if (!allAboveThreshold) {
      return {
        canAdvance: false,
        reason: `Measurement score below ${criteria.measurementThreshold} threshold`,
      };
    }

    if (criteria.sustainedPeriods && measurements.length < criteria.sustainedPeriods) {
      return {
        canAdvance: false,
        reason: `Need ${criteria.sustainedPeriods} measurement periods above threshold, have ${measurements.length}`,
      };
    }
  }

  return {
    canAdvance: true,
    reason: 'All advancement criteria met',
    newRung: state.currentRung + 1,
  };
}

export async function advanceRung(
  userId: string,
  channel: GinaChannel
): Promise<{ success: boolean; newRung: number; error?: string }> {
  const check = await checkAdvancement(userId, channel);

  if (!check.canAdvance || !check.newRung) {
    return { success: false, newRung: 0, error: check.reason };
  }

  const { error } = await supabase
    .from('gina_ladder_state')
    .update({
      current_rung: check.newRung,
      rung_entered_at: new Date().toISOString(),
      positive_seeds_at_rung: 0, // Reset for new rung
      total_seeds_at_rung: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('channel', channel);

  if (error) {
    return { success: false, newRung: 0, error: error.message };
  }

  // Log milestone
  await supabase.from('milestones').insert({
    user_id: userId,
    milestone_type: 'gina_rung_advancement',
    description: `${channel} channel advanced to rung ${check.newRung}`,
  });

  return { success: true, newRung: check.newRung };
}

// ============================================
// CHANNEL-LEVEL GATING (for Task Selection)
// ============================================

/**
 * Check if a task at a given level is allowed for this channel.
 * Used by the rules engine to filter Gina-domain tasks.
 */
export async function checkChannelGate(
  userId: string,
  channel: GinaChannel,
  taskLevel: number
): Promise<ChannelGateCheck> {
  const state = await getChannelState(userId, channel);

  if (!state) {
    return {
      channel,
      taskLevel,
      allowed: false,
      reason: 'Channel not initialized',
      inCooldown: false,
    };
  }

  if (isInCooldown(state)) {
    return {
      channel,
      taskLevel,
      allowed: false,
      reason: `Channel in cooldown (${getCooldownRemaining(state)} days remaining)`,
      inCooldown: true,
      cooldownEnds: state.cooldownUntil || undefined,
    };
  }

  // Task level must be <= current rung
  if (taskLevel > state.currentRung) {
    return {
      channel,
      taskLevel,
      allowed: false,
      reason: `Task level ${taskLevel} exceeds current rung ${state.currentRung}`,
      inCooldown: false,
    };
  }

  return {
    channel,
    taskLevel,
    allowed: true,
    reason: 'Task level within current rung',
    inCooldown: false,
  };
}

/**
 * Get all channels with their gate status for task filtering.
 */
export async function getAllChannelGates(
  userId: string
): Promise<Map<GinaChannel, { currentRung: number; inCooldown: boolean }>> {
  const states = await getAllChannelStates(userId);
  const gates = new Map<GinaChannel, { currentRung: number; inCooldown: boolean }>();

  for (const state of states) {
    gates.set(state.channel, {
      currentRung: state.currentRung,
      inCooldown: isInCooldown(state),
    });
  }

  return gates;
}

// ============================================
// TRIGGER CONDITION EVALUATORS
// For rules engine meetsCondition() extension
// ============================================

export async function evaluateGinaTrigger(
  userId: string,
  trigger: string
): Promise<boolean> {
  switch (trigger) {
    case 'gina_negative_reaction': {
      const states = await getAllChannelStates(userId);
      return states.some(s => s.lastSeedResult === 'negative');
    }

    case 'gina_double_failure': {
      const states = await getAllChannelStates(userId);
      return states.some(s => s.consecutiveFailures >= 2);
    }

    case 'gina_direct_callout': {
      const states = await getAllChannelStates(userId);
      return states.some(s => s.lastSeedResult === 'callout');
    }

    case 'gina_discovery_rupture': {
      // Manual trigger — check if any channel recently had a rupture
      const { data } = await supabase
        .from('gina_seed_log')
        .select('id')
        .eq('user_id', userId)
        .eq('recovery_type', 'rupture')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1);
      return (data?.length || 0) > 0;
    }

    case 'post_disclosure_stable': {
      const { data } = await supabase
        .from('gina_arc_state')
        .select('gate_status')
        .eq('user_id', userId)
        .eq('arc', 'identity_processing')
        .single();
      return data?.gate_status === 'unlocked' || data?.gate_status === 'active' || data?.gate_status === 'completed';
    }

    case 'pre_disclosure': {
      const { data } = await supabase
        .from('user_state')
        .select('gina_visibility_level')
        .eq('user_id', userId)
        .single();
      return (data?.gina_visibility_level || 0) < 4;
    }

    case 'post_first_ally': {
      const { data } = await supabase
        .from('gina_disclosure_map')
        .select('id')
        .eq('user_id', userId)
        .eq('awareness_status', 'supportive')
        .limit(1);
      return (data?.length || 0) >= 1;
    }

    case 'inner_circle_stable': {
      const { data } = await supabase
        .from('gina_disclosure_map')
        .select('id')
        .eq('user_id', userId)
        .eq('awareness_status', 'supportive');
      return (data?.length || 0) >= 3;
    }

    case 'weekly_review': {
      return new Date().getDay() === 0; // Sunday
    }

    case 'monthly_review': {
      return new Date().getDate() === 1;
    }

    case 'biweekly_review': {
      const weekNumber = Math.ceil(
        (new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) /
        (7 * 24 * 60 * 60 * 1000)
      );
      return weekNumber % 2 === 0 && new Date().getDay() === 0;
    }

    case 'post_occasion': {
      // Manual trigger — check if occasion debrief is pending
      return false; // Requires manual activation
    }

    default:
      return false;
  }
}

// ============================================
// COMPOSITE SCORING
// ============================================

export async function getPipelineComposite(userId: string): Promise<{
  average: number;
  leading: { channel: GinaChannel; rung: number } | null;
  lagging: { channel: GinaChannel; rung: number } | null;
  widestGap: number;
  channelsStarted: number;
  channelsAtMax: number;
}> {
  const states = await getAllChannelStates(userId);

  if (states.length === 0) {
    return { average: 0, leading: null, lagging: null, widestGap: 0, channelsStarted: 0, channelsAtMax: 0 };
  }

  const started = states.filter(s => s.currentRung > 0);
  const rungs = states.map(s => s.currentRung);
  const average = rungs.reduce((a, b) => a + b, 0) / rungs.length;

  let leading: { channel: GinaChannel; rung: number } | null = null;
  let lagging: { channel: GinaChannel; rung: number } | null = null;
  let maxRung = 0;
  let minRung = 6;

  for (const state of states) {
    if (state.currentRung > maxRung) {
      maxRung = state.currentRung;
      leading = { channel: state.channel, rung: state.currentRung };
    }
    if (state.currentRung < minRung) {
      minRung = state.currentRung;
      lagging = { channel: state.channel, rung: state.currentRung };
    }
  }

  return {
    average: Math.round(average * 10) / 10,
    leading,
    lagging,
    widestGap: maxRung - minRung,
    channelsStarted: started.length,
    channelsAtMax: states.filter(s => s.currentRung >= 5).length,
  };
}
