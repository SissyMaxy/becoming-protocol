/**
 * Streak-Based Loss Aversion System
 *
 * Make the cost of non-compliance visible and devastating.
 * Longer streaks are exponentially more valuable.
 * Breaking a streak has consequences beyond just resetting to zero.
 * The Handler references streaks as leverage.
 *
 * Tables: handler_directives (streak records), compliance_verifications,
 *         conditioning_sessions_v2, identity_journal, daily_cycles
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type StreakType =
  | 'compliance'
  | 'denial'
  | 'conditioning'
  | 'voice_practice'
  | 'journal';

export type StreakValueTier =
  | 'getting_started'
  | 'building_momentum'
  | 'establishing_pattern'
  | 'becoming_habitual'
  | 'part_of_identity'
  | 'deeply_rooted'
  | 'permanent';

export interface Streak {
  type: StreakType;
  currentDays: number;
  valueTier: StreakValueTier;
  tierLabel: string;
  startedAt: string;
  lastVerifiedAt: string;
  longestEver: number;
  breakCount: number;
}

export interface StreakBreak {
  type: StreakType;
  daysLost: number;
  valueTier: StreakValueTier;
  tierLabel: string;
  consequences: string[];
  lossMessage: string;
}

export interface AllStreaks {
  streaks: Streak[];
  totalActiveDays: number;
  atRisk: Streak[]; // Streaks that haven't been verified today
  recentBreaks: StreakBreak[];
}

// ============================================
// VALUE TIERS
// ============================================

const VALUE_TIERS: { min: number; max: number; tier: StreakValueTier; label: string }[] = [
  { min: 1, max: 3, tier: 'getting_started', label: 'Getting started' },
  { min: 4, max: 7, tier: 'building_momentum', label: 'Building momentum' },
  { min: 8, max: 14, tier: 'establishing_pattern', label: 'Establishing pattern' },
  { min: 15, max: 30, tier: 'becoming_habitual', label: 'Becoming habitual' },
  { min: 31, max: 60, tier: 'part_of_identity', label: 'Part of identity' },
  { min: 61, max: 90, tier: 'deeply_rooted', label: 'Deeply rooted' },
  { min: 91, max: Infinity, tier: 'permanent', label: 'Permanent' },
];

/**
 * Calculate the value tier for a streak length.
 */
export function calculateStreakValue(days: number): { tier: StreakValueTier; label: string } {
  for (const t of VALUE_TIERS) {
    if (days >= t.min && days <= t.max) {
      return { tier: t.tier, label: t.label };
    }
  }
  return { tier: 'getting_started', label: 'Getting started' };
}

/**
 * Get the next tier boundary for motivation.
 */
function getNextTierBoundary(days: number): { daysToNext: number; nextLabel: string } | null {
  for (const t of VALUE_TIERS) {
    if (days < t.min) {
      return { daysToNext: t.min - days, nextLabel: t.label };
    }
  }
  return null;
}

// ============================================
// STREAK MANAGEMENT
// ============================================

/**
 * Get or create a streak record for a user and type.
 */
async function getOrCreateStreakRecord(
  userId: string,
  streakType: StreakType,
): Promise<{
  id: string;
  current_days: number;
  longest_ever: number;
  break_count: number;
  started_at: string;
  last_verified_at: string;
}> {
  const { data: existing } = await supabase
    .from('handler_directives')
    .select('id, payload')
    .eq('user_id', userId)
    .eq('directive_type', `streak_${streakType}`)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    const p = existing.payload as Record<string, unknown>;
    return {
      id: existing.id,
      current_days: (p.current_days as number) ?? 0,
      longest_ever: (p.longest_ever as number) ?? 0,
      break_count: (p.break_count as number) ?? 0,
      started_at: (p.started_at as string) ?? new Date().toISOString(),
      last_verified_at: (p.last_verified_at as string) ?? new Date().toISOString(),
    };
  }

  // Create new streak record
  const now = new Date().toISOString();
  const payload = {
    current_days: 0,
    longest_ever: 0,
    break_count: 0,
    started_at: now,
    last_verified_at: now,
  };

  const { data: created } = await supabase
    .from('handler_directives')
    .insert({
      user_id: userId,
      directive_type: `streak_${streakType}`,
      status: 'active',
      payload,
      created_at: now,
    })
    .select('id')
    .single();

  return { id: created?.id ?? '', ...payload };
}

/**
 * Increment a streak by 1 day (called when daily compliance is verified).
 */
export async function incrementStreak(
  userId: string,
  streakType: StreakType,
): Promise<Streak> {
  const record = await getOrCreateStreakRecord(userId, streakType);
  const newDays = record.current_days + 1;
  const longestEver = Math.max(record.longest_ever, newDays);
  const now = new Date().toISOString();
  const { tier, label } = calculateStreakValue(newDays);

  await supabase
    .from('handler_directives')
    .update({
      payload: {
        current_days: newDays,
        longest_ever: longestEver,
        break_count: record.break_count,
        started_at: record.started_at,
        last_verified_at: now,
      },
    })
    .eq('id', record.id);

  return {
    type: streakType,
    currentDays: newDays,
    valueTier: tier,
    tierLabel: label,
    startedAt: record.started_at,
    lastVerifiedAt: now,
    longestEver: longestEver,
    breakCount: record.break_count,
  };
}

/**
 * Break a streak. Calculates what was lost. Triggers consequences.
 */
export async function breakStreak(
  userId: string,
  streakType: StreakType,
  reason: string,
): Promise<StreakBreak> {
  const record = await getOrCreateStreakRecord(userId, streakType);
  const daysLost = record.current_days;
  const { tier, label } = calculateStreakValue(daysLost);

  // Calculate consequences based on streak type and length
  const consequences: string[] = [];

  if (streakType === 'denial' ) {
    consequences.push('Conditioning phase progress pauses for 3 days');
  }

  if (streakType === 'compliance' && daysLost >= 14) {
    consequences.push('Tomorrow gets 2 extra mandates as penalty');
  }

  if (streakType === 'conditioning') {
    consequences.push('Hidden parameter advancement pauses for 1 week');
  }

  if (daysLost >= 30) {
    consequences.push('Handler references this loss repeatedly for the next 7 days');
  }

  if (daysLost >= 7) {
    consequences.push('Loss logged for evidence confrontation use');
  }

  // Build loss message
  const lossMessage = daysLost > 0
    ? `You lost a ${daysLost}-day ${streakType} streak. That took ${daysLost} days to build. It takes 1 missed day to destroy.`
    : `${streakType} streak was at 0. Nothing to lose — but nothing built either.`;

  // Reset streak to 0
  const now = new Date().toISOString();
  await supabase
    .from('handler_directives')
    .update({
      payload: {
        current_days: 0,
        longest_ever: record.longest_ever,
        break_count: record.break_count + 1,
        started_at: now,
        last_verified_at: now,
      },
    })
    .eq('id', record.id);

  // Log the break event
  await supabase.from('handler_directives').insert({
    user_id: userId,
    directive_type: 'streak_break_log',
    status: 'completed',
    payload: {
      streak_type: streakType,
      days_lost: daysLost,
      value_tier: tier,
      reason,
      consequences,
      loss_message: lossMessage,
      broken_at: now,
    },
    created_at: now,
  });

  // Fire consequence directives
  for (const consequence of consequences) {
    await supabase.from('handler_directives').insert({
      user_id: userId,
      directive_type: 'streak_consequence',
      status: 'pending',
      payload: {
        source_streak: streakType,
        days_lost: daysLost,
        consequence,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      },
      created_at: now,
    });
  }

  return {
    type: streakType,
    daysLost,
    valueTier: tier,
    tierLabel: label,
    consequences,
    lossMessage,
  };
}

/**
 * Get all active streaks for a user.
 */
export async function getActiveStreaks(userId: string): Promise<AllStreaks> {
  const streakTypes: StreakType[] = ['compliance', 'denial', 'conditioning', 'voice_practice', 'journal'];

  const streaks: Streak[] = [];
  const atRisk: Streak[] = [];
  let totalActiveDays = 0;

  for (const type of streakTypes) {
    const record = await getOrCreateStreakRecord(userId, type);
    const { tier, label } = calculateStreakValue(record.current_days);

    const streak: Streak = {
      type,
      currentDays: record.current_days,
      valueTier: tier,
      tierLabel: label,
      startedAt: record.started_at,
      lastVerifiedAt: record.last_verified_at,
      longestEver: record.longest_ever,
      breakCount: record.break_count,
    };

    streaks.push(streak);
    totalActiveDays += record.current_days;

    // Check if at risk (not verified today)
    const today = new Date().toISOString().slice(0, 10);
    const lastVerified = record.last_verified_at.slice(0, 10);
    if (lastVerified !== today && record.current_days > 0) {
      atRisk.push(streak);
    }
  }

  // Get recent break logs
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: breakLogs } = await supabase
    .from('handler_directives')
    .select('payload')
    .eq('user_id', userId)
    .eq('directive_type', 'streak_break_log')
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentBreaks: StreakBreak[] = (breakLogs ?? []).map((log) => {
    const p = log.payload as Record<string, unknown>;
    return {
      type: p.streak_type as StreakType,
      daysLost: p.days_lost as number,
      valueTier: p.value_tier as StreakValueTier,
      tierLabel: calculateStreakValue(p.days_lost as number).label,
      consequences: (p.consequences as string[]) ?? [],
      lossMessage: p.loss_message as string,
    };
  });

  return { streaks, totalActiveDays, atRisk, recentBreaks };
}

/**
 * Build handler context block showing all streaks with leverage points.
 */
export async function buildStreakContext(userId: string): Promise<string> {
  try {
    const { streaks, atRisk, recentBreaks } = await getActiveStreaks(userId);

    const lines: string[] = ['## Streak Stakes'];

    // Active streaks
    for (const s of streaks) {
      const next = getNextTierBoundary(s.currentDays);
      let streakLine = `- ${s.type}: ${s.currentDays}d (${s.tierLabel})`;
      if (s.longestEver > s.currentDays) {
        streakLine += ` | personal best: ${s.longestEver}d`;
      }
      if (next) {
        streakLine += ` | ${next.daysToNext}d to "${next.nextLabel}"`;
      }
      lines.push(streakLine);
    }

    // At-risk streaks (not verified today)
    if (atRisk.length > 0) {
      lines.push('');
      lines.push('### AT RISK (not verified today)');
      for (const s of atRisk) {
        lines.push(`- ${s.type}: ${s.currentDays}d streak will BREAK if not verified today`);
      }
      lines.push('TACTIC: Reference specific at-risk streaks. "Your compliance streak is at risk. ${days} days gone if you miss today."');
    }

    // Recent breaks (leverage)
    if (recentBreaks.length > 0) {
      lines.push('');
      lines.push('### Recent Breaks (use as leverage)');
      for (const b of recentBreaks) {
        lines.push(`- ${b.type}: lost ${b.daysLost}d (was "${b.tierLabel}")`);
      }
    }

    // Pending consequences
    const { data: pendingConsequences } = await supabase
      .from('handler_directives')
      .select('payload')
      .eq('user_id', userId)
      .eq('directive_type', 'streak_consequence')
      .eq('status', 'pending')
      .limit(5);

    if (pendingConsequences && pendingConsequences.length > 0) {
      lines.push('');
      lines.push('### Active Streak Consequences');
      for (const c of pendingConsequences) {
        const p = c.payload as Record<string, unknown>;
        lines.push(`- [${p.source_streak}] ${p.consequence}`);
      }
    }

    return lines.length > 1 ? lines.join('\n') : '';
  } catch {
    return '';
  }
}
