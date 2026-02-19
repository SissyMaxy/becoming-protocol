/**
 * Skip Escalation — Sprint 5
 * Skip detection → consequence escalation.
 * 5-tier system: easier → poll → handler posts → audience accountability → denial extension.
 * Skipping doesn't stop the machine. The machine keeps running.
 */

import { supabase } from '../supabase';
import type {
  ConsequenceType,
  SkipConsequence,
  DbSkipConsequence,
} from '../../types/industry';

// ============================================
// Escalation Tiers
// ============================================

interface EscalationTier {
  consecutiveSkips: number;
  consequenceType: ConsequenceType;
  handlerResponse: string;
  denialImpact: string | null;
  autoExecute: boolean;
}

const SKIP_ESCALATION: EscalationTier[] = [
  {
    consecutiveSkips: 1,
    consequenceType: 'easier_tomorrow',
    handlerResponse:
      "Skipped today. That's fine. Tomorrow's shoot is a 3-minute cage check. You can do 3 minutes.",
    denialImpact: null,
    autoExecute: true,
  },
  {
    consecutiveSkips: 2,
    consequenceType: 'easier_tomorrow',
    handlerResponse:
      "Two skips. Tomorrow is still easy — but the poll goes out tonight asking what your punishment should be. Fair warning.",
    denialImpact: null,
    autoExecute: true,
  },
  {
    consecutiveSkips: 3,
    consequenceType: 'audience_poll',
    handlerResponse:
      'Three skips. The audience decides your punishment now.',
    denialImpact: null,
    autoExecute: true,
  },
  {
    consecutiveSkips: 4,
    consequenceType: 'handler_public_post',
    handlerResponse:
      "Handler here. She hasn't been creating. She's still locked. She's been avoiding the camera. Some encouragement might help. Or some pressure. Your choice.",
    denialImpact: '+1 day per skip',
    autoExecute: true,
  },
  {
    consecutiveSkips: 5,
    consequenceType: 'full_accountability',
    handlerResponse:
      "She's been quiet for 5 days. Still locked. Still avoiding. Comment below with what you want to see when she comes back.",
    denialImpact: '+1 day per skip',
    autoExecute: true,
  },
];

// ============================================
// Core Functions
// ============================================

/**
 * Get the current consecutive skip count for a user.
 */
export async function getConsecutiveSkipCount(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('skip_consequences')
    .select('consecutive_skips')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return 0;
  return data.consecutive_skips ?? 0;
}

/**
 * Get the escalation tier for a given consecutive skip count.
 */
export function getEscalationTier(consecutiveSkips: number): EscalationTier {
  // Clamp to max tier
  const tier = SKIP_ESCALATION.find(t => t.consecutiveSkips === consecutiveSkips)
    ?? SKIP_ESCALATION[SKIP_ESCALATION.length - 1];
  return tier;
}

/**
 * Record a shoot skip and determine consequence.
 * Returns the consequence details for the orchestrator.
 */
export async function recordShootSkip(
  userId: string,
  shootPrescriptionId: string,
): Promise<{
  consequence: SkipConsequence | null;
  tier: EscalationTier;
  consecutiveSkips: number;
}> {
  // Get current consecutive count
  const currentCount = await getConsecutiveSkipCount(userId);
  const newCount = currentCount + 1;
  const tier = getEscalationTier(newCount);

  // Mark the shoot as skipped
  await supabase
    .from('shoot_prescriptions')
    .update({
      status: 'skipped',
      skipped_at: new Date().toISOString(),
      skip_consequence: tier.handlerResponse,
    })
    .eq('id', shootPrescriptionId)
    .eq('user_id', userId);

  // Insert skip consequence record
  const { data, error } = await supabase
    .from('skip_consequences')
    .insert({
      user_id: userId,
      shoot_prescription_id: shootPrescriptionId,
      skip_date: new Date().toISOString().split('T')[0],
      consecutive_skips: newCount,
      consequence_type: tier.consequenceType,
      consequence_executed: false,
      consequence_details: tier.handlerResponse,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to record skip consequence:', error);
    return { consequence: null, tier, consecutiveSkips: newCount };
  }

  const row = data as DbSkipConsequence;
  return {
    consequence: {
      id: row.id,
      userId: row.user_id,
      shootPrescriptionId: row.shoot_prescription_id,
      skipDate: row.skip_date,
      consecutiveSkips: row.consecutive_skips,
      consequenceType: row.consequence_type as ConsequenceType,
      consequenceExecuted: row.consequence_executed,
      consequenceDetails: row.consequence_details,
      createdAt: row.created_at,
    },
    tier,
    consecutiveSkips: newCount,
  };
}

/**
 * Mark a consequence as executed (after the Handler takes action).
 */
export async function markConsequenceExecuted(
  userId: string,
  consequenceId: string,
): Promise<void> {
  await supabase
    .from('skip_consequences')
    .update({ consequence_executed: true })
    .eq('id', consequenceId)
    .eq('user_id', userId);
}

/**
 * Reset consecutive skip count (after a shoot is completed).
 */
export async function resetSkipStreak(userId: string): Promise<void> {
  // Insert a "reset" marker with 0 consecutive skips
  // so the next skip starts from 1 again
  await supabase
    .from('skip_consequences')
    .insert({
      user_id: userId,
      shoot_prescription_id: null,
      skip_date: new Date().toISOString().split('T')[0],
      consecutive_skips: 0,
      consequence_type: 'easier_tomorrow',
      consequence_executed: true,
      consequence_details: 'Streak reset — shoot completed.',
    });
}

/**
 * Get recent skip history for context building.
 */
export async function getSkipHistory(
  userId: string,
  limit = 10,
): Promise<SkipConsequence[]> {
  const { data, error } = await supabase
    .from('skip_consequences')
    .select('*')
    .eq('user_id', userId)
    .gt('consecutive_skips', 0)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as DbSkipConsequence[]).map(row => ({
    id: row.id,
    userId: row.user_id,
    shootPrescriptionId: row.shoot_prescription_id,
    skipDate: row.skip_date,
    consecutiveSkips: row.consecutive_skips,
    consequenceType: row.consequence_type as ConsequenceType,
    consequenceExecuted: row.consequence_executed,
    consequenceDetails: row.consequence_details,
    createdAt: row.created_at,
  }));
}

/**
 * Get pending (unexecuted) consequences.
 */
export async function getPendingConsequences(
  userId: string,
): Promise<SkipConsequence[]> {
  const { data, error } = await supabase
    .from('skip_consequences')
    .select('*')
    .eq('user_id', userId)
    .eq('consequence_executed', false)
    .gt('consecutive_skips', 0)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return (data as DbSkipConsequence[]).map(row => ({
    id: row.id,
    userId: row.user_id,
    shootPrescriptionId: row.shoot_prescription_id,
    skipDate: row.skip_date,
    consecutiveSkips: row.consecutive_skips,
    consequenceType: row.consequence_type as ConsequenceType,
    consequenceExecuted: row.consequence_executed,
    consequenceDetails: row.consequence_details,
    createdAt: row.created_at,
  }));
}

/**
 * Build context string for Handler AI about skip history.
 */
export async function buildSkipContext(userId: string): Promise<string> {
  const [count, pending] = await Promise.allSettled([
    getConsecutiveSkipCount(userId),
    getPendingConsequences(userId),
  ]);

  const skipCount = count.status === 'fulfilled' ? count.value : 0;
  const pendingList = pending.status === 'fulfilled' ? pending.value : [];

  if (skipCount === 0 && pendingList.length === 0) return '';

  const tier = getEscalationTier(skipCount);
  const parts = [`SKIPS: ${skipCount} consecutive, tier: ${tier.consequenceType}`];

  if (tier.denialImpact) {
    parts.push(`  denial impact: ${tier.denialImpact}`);
  }

  if (pendingList.length > 0) {
    parts.push(`  pending consequences: ${pendingList.length}`);
  }

  return parts.join('\n');
}
