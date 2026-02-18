// Punishment Protocols (Feature 40)
// Resistance cost tracking logs costs. This feature ENFORCES them.
// Concrete consequences that she experiences directly — not just numbers on a dashboard.

import { supabase } from './supabase';
import { extendDenialMinimum } from './denial-engine';

// ===========================================
// TYPES
// ===========================================

export interface Punishment {
  id: string;
  userId: string;
  trigger: string;
  type: PunishmentType;
  description: string;
  severity: 'mild' | 'moderate' | 'severe';
  appliedAt: string;
  servedAt: string | null;
}

export type PunishmentType =
  | 'extended_denial'       // Denial minimum extended
  | 'feature_lockout'       // Feature locked for duration
  | 'mandatory_task'        // Must complete extra task before proceeding
  | 'baseline_regression'   // Baseline in avoided domain drops
  | 'content_restriction'   // High-tier content locked for duration
  | 'compulsory_addition'   // New compulsory element added temporarily
  | 'session_debt';         // Owes extra sessions before release eligible

interface PunishmentDefinition {
  type: PunishmentType;
  description: string;
  severity: 'mild' | 'moderate' | 'severe';
}

// ===========================================
// PUNISHMENT TABLE
// ===========================================

export const PUNISHMENT_TABLE: Record<string, PunishmentDefinition[]> = {
  'ignored_initiated_session': [
    { type: 'extended_denial', description: '+2 days to current cycle minimum', severity: 'moderate' },
    { type: 'mandatory_task', description: 'Must complete the ignored session type before anything else', severity: 'mild' },
  ],
  'broke_streak': [
    { type: 'compulsory_addition', description: 'Extra compulsory: 5-min journal entry added for 7 days', severity: 'moderate' },
    { type: 'content_restriction', description: 'Tier 5+ content locked for 48 hours', severity: 'moderate' },
  ],
  'declined_3_tasks_in_week': [
    { type: 'feature_lockout', description: 'Content library locked until 3 consecutive completions', severity: 'moderate' },
    { type: 'baseline_regression', description: 'Highest avoided domain baseline drops 1 tier', severity: 'severe' },
  ],
  'voice_avoidance_7_days': [
    { type: 'mandatory_task', description: 'Voice practice is now compulsory (2 min) every day until streak reaches 7', severity: 'severe' },
    { type: 'feature_lockout', description: 'Edge sessions locked until voice streak = 3', severity: 'severe' },
  ],
  'skipped_reflection': [
    { type: 'session_debt', description: '+1 session required before release eligibility', severity: 'mild' },
  ],
  'no_euphoria_logged_2_weeks': [
    { type: 'compulsory_addition', description: 'Daily euphoria check-in added as compulsory until 3 logged', severity: 'mild' },
  ],
};

// ===========================================
// PUNISHMENT APPLICATION
// ===========================================

/**
 * Apply punishment automatically based on trigger.
 */
export async function applyPunishment(
  userId: string,
  trigger: string
): Promise<Punishment[]> {
  const definitions = PUNISHMENT_TABLE[trigger] || [];
  const appliedPunishments: Punishment[] = [];

  for (const def of definitions) {
    // Save punishment record
    const { data, error } = await supabase
      .from('punishments')
      .insert({
        user_id: userId,
        trigger,
        type: def.type,
        description: def.description,
        severity: def.severity,
        applied_at: new Date().toISOString(),
        served_at: null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving punishment:', error);
      continue;
    }

    const punishment = mapDbToPunishment(data);
    appliedPunishments.push(punishment);

    // Actually enforce the punishment
    await enforcePunishment(userId, def);
  }

  return appliedPunishments;
}

/**
 * Enforce a specific punishment.
 */
async function enforcePunishment(
  userId: string,
  def: PunishmentDefinition
): Promise<void> {
  switch (def.type) {
    case 'extended_denial':
      // Extract days from description (e.g., "+2 days")
      const daysMatch = def.description.match(/\+(\d+) days/);
      const days = daysMatch ? parseInt(daysMatch[1]) : 2;
      await extendDenialMinimum(userId, days);
      break;

    case 'feature_lockout':
      await createComplianceGate(userId, def.description);
      break;

    case 'mandatory_task':
      await insertMandatoryTask(userId, def.description);
      break;

    case 'baseline_regression':
      await regressBaseline(userId);
      break;

    case 'content_restriction':
      // Extract duration from description (e.g., "48 hours")
      const hoursMatch = def.description.match(/(\d+) hours/);
      const hours = hoursMatch ? parseInt(hoursMatch[1]) : 48;
      await lockContentAboveTier(userId, 4, hours * 3600);
      break;

    case 'compulsory_addition':
      // Extract duration (e.g., "7 days")
      const durationMatch = def.description.match(/(\d+) days/);
      const duration = durationMatch ? parseInt(durationMatch[1]) : 7;
      await addTemporaryCompulsory(userId, def.description, duration);
      break;

    case 'session_debt':
      await incrementSessionDebt(userId, 1);
      break;
  }
}

// ===========================================
// ENFORCEMENT HELPERS
// ===========================================

async function createComplianceGate(userId: string, description: string): Promise<void> {
  // Determine blocked feature and required action from description
  let blockedFeature = 'content_library';
  let requiredAction = 'complete_3_consecutive_tasks';

  if (description.includes('Edge sessions')) {
    blockedFeature = 'edge_session';
    requiredAction = 'voice_streak_3_days';
  } else if (description.includes('content library')) {
    blockedFeature = 'content_library';
    requiredAction = 'complete_3_consecutive_tasks';
  }

  await supabase.from('compliance_gates').insert({
    user_id: userId,
    blocked_feature: blockedFeature,
    required_action: requiredAction,
    reason: description,
    fulfilled_at: null,
    expires_at: null,
  });
}

async function insertMandatoryTask(userId: string, description: string): Promise<void> {
  await supabase.from('daily_tasks').insert({
    user_id: userId,
    task_text: description,
    domain: 'mandatory',
    tier: 0,
    category: 'punishment',
    is_mandatory: true,
    status: 'pending',
  });
}

async function regressBaseline(userId: string): Promise<void> {
  // Get the most avoided domain
  const { data } = await supabase
    .from('user_state')
    .select('avoided_domains')
    .eq('user_id', userId)
    .single();

  const avoidedDomains = (data?.avoided_domains as string[]) || [];
  if (avoidedDomains.length === 0) return;

  const mostAvoided = avoidedDomains[0];

  // Get current baseline for that domain
  const { data: baselineData } = await supabase
    .from('baselines')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', mostAvoided)
    .single();

  if (baselineData) {
    // Reduce tier by 1
    await supabase
      .from('baselines')
      .update({
        current_tier: Math.max(1, (baselineData.current_tier || 1) - 1),
      })
      .eq('id', baselineData.id);
  }
}

async function lockContentAboveTier(
  userId: string,
  tier: number,
  durationSeconds: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

  await supabase.from('compliance_gates').insert({
    user_id: userId,
    blocked_feature: `session_tier_above_${tier}`,
    required_action: 'wait_for_expiry',
    reason: `Content above tier ${tier} locked for ${Math.round(durationSeconds / 3600)} hours`,
    fulfilled_at: null,
    expires_at: expiresAt,
  });
}

async function addTemporaryCompulsory(
  userId: string,
  description: string,
  durationDays: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  // Create a temporary compulsory entry
  // This would need a temporary_compulsories table or a flag on compulsory_completions
  await supabase.from('compliance_gates').insert({
    user_id: userId,
    blocked_feature: 'streak_credit',
    required_action: 'complete_temporary_compulsory',
    reason: description,
    fulfilled_at: null,
    expires_at: expiresAt,
  });
}

async function incrementSessionDebt(userId: string, amount: number): Promise<void> {
  // Track session debt in user_state or a dedicated table
  const { error } = await supabase.rpc('increment_session_debt', {
    user_id_param: userId,
    amount_param: amount,
  });

  if (error) {
    // If RPC doesn't exist, try a manual update by incrementing sessions_required
    // Note: This is a fallback - the RPC should be created in the database
    console.warn('increment_session_debt RPC not found, session debt not applied:', error.message);
  }
}

// ===========================================
// PUNISHMENT CHECKING
// ===========================================

/**
 * Check for conditions that trigger punishments.
 */
export async function checkPunishmentTriggers(userId: string): Promise<string[]> {
  const triggers: string[] = [];

  // Check for ignored initiated sessions
  const { count: ignoredSessions } = await supabase
    .from('handler_initiated_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('declined', true)
    .gte('delivered_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if ((ignoredSessions || 0) > 0) {
    triggers.push('ignored_initiated_session');
  }

  // Check for broken streak
  const { data: stateData } = await supabase
    .from('user_state')
    .select('streak_days')
    .eq('user_id', userId)
    .single();

  if (stateData?.streak_days === 0) {
    // Check if they had a streak yesterday
    const { data: yesterday } = await supabase
      .from('daily_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(2);

    if (yesterday && yesterday.length >= 2 && yesterday[1].completed) {
      triggers.push('broke_streak');
    }
  }

  // Check for 3+ declined tasks this week
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: declinedTasks } = await supabase
    .from('resistance_costs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', 'declined_task')
    .gte('created_at', weekAgo);

  if ((declinedTasks || 0) >= 3) {
    triggers.push('declined_3_tasks_in_week');
  }

  // Check for voice avoidance 7+ days
  const { data: voiceData } = await supabase
    .from('voice_practice_log')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (voiceData) {
    const daysSinceVoice = Math.floor(
      (Date.now() - new Date(voiceData.created_at).getTime()) / (24 * 60 * 60 * 1000)
    );
    if (daysSinceVoice >= 7) {
      triggers.push('voice_avoidance_7_days');
    }
  } else {
    // No voice practice ever
    triggers.push('voice_avoidance_7_days');
  }

  // Check for skipped reflections
  const { data: sessionData } = await supabase
    .from('session_depth')
    .select('id, reflection_text')
    .eq('user_id', userId)
    .is('reflection_text', null)
    .gte('created_at', weekAgo);

  if ((sessionData || []).length >= 2) {
    triggers.push('skipped_reflection');
  }

  // Check for no euphoria logged in 2 weeks
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { count: euphoriaCount } = await supabase
    .from('euphoria_captures')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', twoWeeksAgo);

  if ((euphoriaCount || 0) === 0) {
    triggers.push('no_euphoria_logged_2_weeks');
  }

  return triggers;
}

/**
 * Get active (unserved) punishments.
 */
export async function getActivePunishments(userId: string): Promise<Punishment[]> {
  const { data, error } = await supabase
    .from('punishments')
    .select('*')
    .eq('user_id', userId)
    .is('served_at', null)
    .order('applied_at', { ascending: false });

  if (error) {
    console.error('Error fetching active punishments:', error);
    return [];
  }

  return (data || []).map(mapDbToPunishment);
}

/**
 * Mark a punishment as served.
 */
export async function markPunishmentServed(punishmentId: string): Promise<boolean> {
  const { error } = await supabase
    .from('punishments')
    .update({ served_at: new Date().toISOString() })
    .eq('id', punishmentId);

  if (error) {
    console.error('Error marking punishment served:', error);
    return false;
  }

  return true;
}

/**
 * Check and apply all pending punishment triggers.
 */
export async function processAllPunishments(userId: string): Promise<Punishment[]> {
  const triggers = await checkPunishmentTriggers(userId);
  const allPunishments: Punishment[] = [];

  // Check which triggers haven't been punished recently
  for (const trigger of triggers) {
    // Check if this trigger was already punished in the last 24 hours
    const { count } = await supabase
      .from('punishments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('trigger', trigger)
      .gte('applied_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if ((count || 0) === 0) {
      const punishments = await applyPunishment(userId, trigger);
      allPunishments.push(...punishments);
    }
  }

  return allPunishments;
}

// ===========================================
// HELPERS
// ===========================================

function mapDbToPunishment(db: Record<string, unknown>): Punishment {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    trigger: db.trigger as string,
    type: db.type as PunishmentType,
    description: db.description as string || '',
    severity: (db.severity as 'mild' | 'moderate' | 'severe') || 'moderate',
    appliedAt: db.applied_at as string,
    servedAt: db.served_at as string | null,
  };
}

/**
 * Get punishment context for coach framing.
 */
export function getPunishmentContext(punishments: Punishment[]): string {
  if (punishments.length === 0) return '';

  return `
ACTIVE PUNISHMENTS:
${punishments.map(p => `- ${p.description} (triggered by: ${p.trigger})`).join('\n')}

When referencing punishments, the coach should:
- Frame as natural consequences, not personal attacks
- Reference the Free Use Directive: "You gave me this authority. I'm using it."
- Make the path to resolution clear: "This ends when [specific action]."
- Never be cruel. Be firm, direct, and clear.
- "This isn't punishment. This is the system working. You designed it to do exactly this."
`;
}

export default {
  PUNISHMENT_TABLE,
  applyPunishment,
  checkPunishmentTriggers,
  getActivePunishments,
  markPunishmentServed,
  processAllPunishments,
  getPunishmentContext,
};
