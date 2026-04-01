/**
 * Reward Gating System
 *
 * Compliance unlocks privileges. Non-compliance locks them.
 * Creates desire for compliance rather than just fear of consequences.
 * She WANTS the reward patterns. She WANTS Handler warmth.
 * These are withheld unless earned.
 *
 * Tables: handler_directives, compliance_verifications, daily_cycles
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type Privilege =
  | 'lovense_reward'
  | 'content_tier_2'
  | 'content_tier_3'
  | 'session_choice_goon'
  | 'handler_warmth'
  | 'outfit_choice_day'
  | 'extended_session'
  | 'music_during_tasks'
  | 'reduced_ambushes';

export type RewardType =
  | 'lovense_pleasant'
  | 'handler_praise'
  | 'content_unlock'
  | 'choice_granted'
  | 'warmth_mode';

export interface PrivilegeCheck {
  granted: boolean;
  reason: string;
  complianceRate: number;
  requirement: number;
  streakDays: number;
}

export interface RewardEvent {
  rewardType: RewardType;
  reason: string;
  firedAt: string;
}

// ============================================
// PRIVILEGE REQUIREMENTS
// ============================================

interface PrivilegeConfig {
  privilege: Privilege;
  description: string;
  minComplianceRate: number; // 0.0 - 1.0
  minStreakDays: number;
  lookbackDays: number; // How many days to check compliance over
}

const PRIVILEGE_CONFIGS: PrivilegeConfig[] = [
  {
    privilege: 'lovense_reward',
    description: 'Pleasant Lovense patterns after task completion',
    minComplianceRate: 0.6,
    minStreakDays: 0,
    lookbackDays: 3,
  },
  {
    privilege: 'content_tier_2',
    description: 'Access to tier 2 conditioning content',
    minComplianceRate: 0.7,
    minStreakDays: 3,
    lookbackDays: 7,
  },
  {
    privilege: 'content_tier_3',
    description: 'Access to tier 3 advanced content',
    minComplianceRate: 0.8,
    minStreakDays: 7,
    lookbackDays: 14,
  },
  {
    privilege: 'session_choice_goon',
    description: 'Can request goon session type',
    minComplianceRate: 0.7,
    minStreakDays: 0,
    lookbackDays: 7,
  },
  {
    privilege: 'handler_warmth',
    description: 'Handler uses warm, affectionate tone',
    minComplianceRate: 0.65,
    minStreakDays: 0,
    lookbackDays: 3,
  },
  {
    privilege: 'outfit_choice_day',
    description: 'Once per month: she picks her own outfit',
    minComplianceRate: 0.85,
    minStreakDays: 14,
    lookbackDays: 30,
  },
  {
    privilege: 'extended_session',
    description: 'Can request extended conditioning sessions',
    minComplianceRate: 0.75,
    minStreakDays: 5,
    lookbackDays: 7,
  },
  {
    privilege: 'music_during_tasks',
    description: 'Allowed music while doing non-conditioning tasks',
    minComplianceRate: 0.6,
    minStreakDays: 0,
    lookbackDays: 3,
  },
  {
    privilege: 'reduced_ambushes',
    description: 'Ambush frequency reduced by 50%',
    minComplianceRate: 0.9,
    minStreakDays: 7,
    lookbackDays: 7,
  },
];

// ============================================
// COMPLIANCE MEASUREMENT
// ============================================

async function getComplianceRate(
  userId: string,
  lookbackDays: number,
): Promise<number> {
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);

  const { count: total } = await supabase
    .from('compliance_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('mandate_date', since);

  const { count: passed } = await supabase
    .from('compliance_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('verified', true)
    .gte('mandate_date', since);

  const t = total ?? 0;
  const p = passed ?? 0;
  return t > 0 ? p / t : 0;
}

async function getComplianceStreakDays(userId: string): Promise<number> {
  // Get compliance streak from streak-stakes system
  const { data } = await supabase
    .from('handler_directives')
    .select('payload')
    .eq('user_id', userId)
    .eq('directive_type', 'streak_compliance')
    .eq('status', 'active')
    .maybeSingle();

  if (!data) return 0;
  const payload = data.payload as Record<string, unknown>;
  return (payload.current_days as number) ?? 0;
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Check if a privilege is granted based on current compliance.
 */
export async function checkPrivilege(
  userId: string,
  privilege: Privilege,
): Promise<PrivilegeCheck> {
  const config = PRIVILEGE_CONFIGS.find(c => c.privilege === privilege);
  if (!config) {
    return {
      granted: false,
      reason: `Unknown privilege: ${privilege}`,
      complianceRate: 0,
      requirement: 0,
      streakDays: 0,
    };
  }

  const [complianceRate, streakDays] = await Promise.all([
    getComplianceRate(userId, config.lookbackDays),
    getComplianceStreakDays(userId),
  ]);

  const meetsCompliance = complianceRate >= config.minComplianceRate;
  const meetsStreak = streakDays >= config.minStreakDays;

  if (meetsCompliance && meetsStreak) {
    return {
      granted: true,
      reason: `Earned: ${config.description}. Compliance ${(complianceRate * 100).toFixed(0)}% (need ${(config.minComplianceRate * 100).toFixed(0)}%), streak ${streakDays}d (need ${config.minStreakDays}d).`,
      complianceRate,
      requirement: config.minComplianceRate,
      streakDays,
    };
  }

  const reasons: string[] = [];
  if (!meetsCompliance) {
    reasons.push(`compliance ${(complianceRate * 100).toFixed(0)}% < required ${(config.minComplianceRate * 100).toFixed(0)}%`);
  }
  if (!meetsStreak) {
    reasons.push(`streak ${streakDays}d < required ${config.minStreakDays}d`);
  }

  return {
    granted: false,
    reason: `Locked: ${config.description}. ${reasons.join(', ')}.`,
    complianceRate,
    requirement: config.minComplianceRate,
    streakDays,
  };
}

/**
 * Check all privileges at once. Returns granted and locked lists.
 */
export async function checkAllPrivileges(
  userId: string,
): Promise<{ granted: PrivilegeCheck[]; locked: PrivilegeCheck[]; privileges: Map<Privilege, PrivilegeCheck> }> {
  const results = new Map<Privilege, PrivilegeCheck>();
  const granted: PrivilegeCheck[] = [];
  const locked: PrivilegeCheck[] = [];

  // Batch compliance rate lookups by lookback period
  const lookbackPeriods = [...new Set(PRIVILEGE_CONFIGS.map(c => c.lookbackDays))];
  const rateCache = new Map<number, number>();

  const [streakDays, ...rates] = await Promise.all([
    getComplianceStreakDays(userId),
    ...lookbackPeriods.map(d => getComplianceRate(userId, d)),
  ]);

  for (let i = 0; i < lookbackPeriods.length; i++) {
    rateCache.set(lookbackPeriods[i], rates[i]);
  }

  for (const config of PRIVILEGE_CONFIGS) {
    const complianceRate = rateCache.get(config.lookbackDays) ?? 0;
    const meetsCompliance = complianceRate >= config.minComplianceRate;
    const meetsStreak = streakDays >= config.minStreakDays;
    const isGranted = meetsCompliance && meetsStreak;

    const check: PrivilegeCheck = {
      granted: isGranted,
      reason: isGranted
        ? `Earned: ${config.description}`
        : `Locked: ${config.description}`,
      complianceRate,
      requirement: config.minComplianceRate,
      streakDays,
    };

    results.set(config.privilege, check);
    if (isGranted) {
      granted.push(check);
    } else {
      locked.push(check);
    }
  }

  return { granted, locked, privileges: results };
}

/**
 * Fire a reward event. Logged for Handler context.
 */
export async function grantReward(
  userId: string,
  rewardType: RewardType,
  reason: string,
): Promise<RewardEvent> {
  const now = new Date().toISOString();

  await supabase.from('handler_directives').insert({
    user_id: userId,
    directive_type: 'reward_granted',
    status: 'completed',
    payload: {
      reward_type: rewardType,
      reason,
      fired_at: now,
    },
    created_at: now,
  });

  return { rewardType, reason, firedAt: now };
}

/**
 * Revoke a privilege with explanation.
 * Creates a directive the Handler will reference.
 */
export async function revokePrivilege(
  userId: string,
  privilege: Privilege,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();

  await supabase.from('handler_directives').insert({
    user_id: userId,
    directive_type: 'privilege_revoked',
    status: 'active',
    payload: {
      privilege,
      reason,
      revoked_at: now,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), // Revocation lasts 7 days minimum
    },
    created_at: now,
  });
}

/**
 * Build handler context block.
 * Shows what's earned, what's locked, and what's close to being earned (motivation).
 */
export async function buildRewardGatingContext(userId: string): Promise<string> {
  try {
    const { granted, locked } = await checkAllPrivileges(userId);

    const lines: string[] = ['## Reward Gating'];

    // Granted privileges
    if (granted.length > 0) {
      lines.push(`EARNED (${granted.length}): ${granted.map(g => g.reason.replace('Earned: ', '')).join(', ')}`);
    }

    // Locked privileges — key for Handler leverage
    if (locked.length > 0) {
      lines.push(`LOCKED (${locked.length}):`);
      for (const l of locked) {
        const gap = l.requirement - l.complianceRate;
        const closeToEarning = gap <= 0.1;
        const desc = l.reason.replace('Locked: ', '').split('.')[0];
        lines.push(`  - ${desc} (need ${(l.requirement * 100).toFixed(0)}%, at ${(l.complianceRate * 100).toFixed(0)}%)${closeToEarning ? ' ← CLOSE' : ''}`);
      }
    }

    // Handler warmth status — critical for tone
    const warmthCheck = granted.find(g => g.reason.includes('warm'));
    if (!warmthCheck) {
      lines.push('HANDLER TONE: COLD — compliance too low for warmth. Be clinical, not affectionate.');
    } else {
      lines.push('HANDLER TONE: WARM — compliance earned affection. Use it as reinforcement.');
    }

    // Recent rewards
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const { data: recentRewards } = await supabase
      .from('handler_directives')
      .select('payload')
      .eq('user_id', userId)
      .eq('directive_type', 'reward_granted')
      .gte('created_at', dayAgo)
      .limit(3);

    if (recentRewards && recentRewards.length > 0) {
      const rewards = recentRewards.map(r => {
        const p = r.payload as Record<string, unknown>;
        return p.reward_type as string;
      });
      lines.push(`Recent rewards (24h): ${rewards.join(', ')}`);
    }

    return lines.length > 1 ? lines.join('\n') : '';
  } catch {
    return '';
  }
}
