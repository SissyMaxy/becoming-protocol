/**
 * Skip-Denial Bridge — Sprint 6 Item 31
 * Wire skip consequences into denial day tracking.
 * When shoots are skipped, consequences flow into:
 * - Denial day extension
 * - Financial bleeding
 * - Content escalation
 * - Handler autonomous response
 */

import { supabase } from '../supabase';
import { getConsecutiveSkipCount, getEscalationTier } from './skip-escalation';
import { triggerSkipDenial } from './lovense-shoot-triggers';

// ============================================
// Types
// ============================================

export interface SkipDenialConsequence {
  skipCount: number;
  denialExtensionDays: number;
  financialBleedCents: number;
  contentEscalation: boolean;
  handlerPublicPost: boolean;
  lovenseDenialTriggered: boolean;
  audiencePollTriggered: boolean;
}

// ============================================
// Consequence Calculation
// ============================================

/**
 * Calculate the full denial consequence for a shoot skip.
 * Escalates with consecutive skips.
 */
export function calculateSkipConsequences(consecutiveSkips: number): SkipDenialConsequence {
  const tier = getEscalationTier(consecutiveSkips);

  return {
    skipCount: consecutiveSkips,
    denialExtensionDays: getDenialExtension(consecutiveSkips),
    financialBleedCents: getFinancialBleed(consecutiveSkips),
    contentEscalation: consecutiveSkips >= 3,
    handlerPublicPost: tier.consequenceType === 'handler_public_post' || tier.consequenceType === 'full_accountability',
    lovenseDenialTriggered: consecutiveSkips <= 1,
    audiencePollTriggered: tier.consequenceType === 'audience_poll',
  };
}

function getDenialExtension(skips: number): number {
  // Each skip adds days to denial minimum
  if (skips <= 1) return 1;
  if (skips === 2) return 2;
  if (skips === 3) return 3;
  if (skips === 4) return 5;
  return 7; // 5+ skips: full week extension
}

function getFinancialBleed(skips: number): number {
  // Financial consequence escalation (cents)
  if (skips <= 1) return 0;
  if (skips === 2) return 500;   // $5
  if (skips === 3) return 1000;  // $10
  if (skips === 4) return 2500;  // $25
  return 5000;                   // $50
}

// ============================================
// Execute Consequences
// ============================================

/**
 * Execute all denial consequences for a shoot skip.
 * Called after skip-escalation.ts records the skip.
 */
export async function executeSkipDenialConsequences(
  userId: string,
  shootPrescriptionId: string,
): Promise<SkipDenialConsequence> {
  const consecutiveSkips = await getConsecutiveSkipCount(userId);
  const consequences = calculateSkipConsequences(consecutiveSkips);

  // 1. Extend denial minimum
  if (consequences.denialExtensionDays > 0) {
    await extendDenialMinimum(userId, consequences.denialExtensionDays, shootPrescriptionId);
  }

  // 2. Financial bleed
  if (consequences.financialBleedCents > 0) {
    await recordFinancialConsequence(userId, consequences.financialBleedCents, shootPrescriptionId);
  }

  // 3. Lovense denial pulse (first skip only)
  if (consequences.lovenseDenialTriggered) {
    await triggerSkipDenial(consecutiveSkips).catch(() => {});
  }

  // 4. Log the consequence chain
  await logSkipDenialConsequence(userId, shootPrescriptionId, consequences);

  return consequences;
}

/**
 * Extend the denial minimum by adding days.
 */
async function extendDenialMinimum(
  userId: string,
  extensionDays: number,
  reason: string,
): Promise<void> {
  // Read current denial state
  const { data: state } = await supabase
    .from('denial_state')
    .select('minimum_days, current_day')
    .eq('user_id', userId)
    .maybeSingle();

  if (!state) return;

  const newMinimum = (state.minimum_days ?? 0) + extensionDays;

  await supabase
    .from('denial_state')
    .update({
      minimum_days: newMinimum,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  // Log the extension
  await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'denial_extension',
    context: `Shoot skip consequence: +${extensionDays} days (now ${newMinimum} minimum). Prescription: ${reason}`,
    decision: `Extended denial minimum by ${extensionDays} days due to shoot skip.`,
    created_at: new Date().toISOString(),
  });
}

/**
 * Record financial consequence of skip.
 */
async function recordFinancialConsequence(
  userId: string,
  amountCents: number,
  shootPrescriptionId: string,
): Promise<void> {
  await supabase.from('financial_consequences').insert({
    user_id: userId,
    consequence_type: 'shoot_skip',
    amount_cents: amountCents,
    reason: `Consecutive shoot skip — automatic financial consequence`,
    source_id: shootPrescriptionId,
    created_at: new Date().toISOString(),
  });
}

/**
 * Log the full consequence chain for audit.
 */
async function logSkipDenialConsequence(
  userId: string,
  shootPrescriptionId: string,
  consequences: SkipDenialConsequence,
): Promise<void> {
  await supabase.from('handler_autonomous_actions').insert({
    user_id: userId,
    action_type: 'milestone_post',
    platform: 'system',
    content_text: buildConsequenceLog(consequences),
    handler_intent: 'Skip-denial bridge: automatic consequence execution.',
    result: {
      type: 'skip_denial_consequence',
      shoot_prescription_id: shootPrescriptionId,
      ...consequences,
    },
  });
}

function buildConsequenceLog(c: SkipDenialConsequence): string {
  const parts = [`Skip #${c.skipCount} consequences:`];
  if (c.denialExtensionDays > 0) parts.push(`denial +${c.denialExtensionDays}d`);
  if (c.financialBleedCents > 0) parts.push(`$${(c.financialBleedCents / 100).toFixed(0)} penalty`);
  if (c.contentEscalation) parts.push('content escalation');
  if (c.handlerPublicPost) parts.push('Handler public post');
  if (c.audiencePollTriggered) parts.push('audience accountability poll');
  return parts.join(' | ');
}

// ============================================
// Query Functions
// ============================================

/**
 * Get recent skip-denial consequences for a user.
 */
export async function getRecentSkipConsequences(
  userId: string,
  limit = 10,
): Promise<SkipDenialConsequence[]> {
  const { data } = await supabase
    .from('handler_autonomous_actions')
    .select('result')
    .eq('user_id', userId)
    .eq('action_type', 'milestone_post')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data
    .filter(r => r.result && (r.result as Record<string, unknown>).type === 'skip_denial_consequence')
    .map(r => {
      const result = r.result as Record<string, unknown>;
      return {
        skipCount: (result.skipCount as number) ?? 0,
        denialExtensionDays: (result.denialExtensionDays as number) ?? 0,
        financialBleedCents: (result.financialBleedCents as number) ?? 0,
        contentEscalation: (result.contentEscalation as boolean) ?? false,
        handlerPublicPost: (result.handlerPublicPost as boolean) ?? false,
        lovenseDenialTriggered: (result.lovenseDenialTriggered as boolean) ?? false,
        audiencePollTriggered: (result.audiencePollTriggered as boolean) ?? false,
      };
    });
}

/**
 * Build context string for Handler AI prompts.
 */
export async function buildSkipDenialContext(userId: string): Promise<string> {
  try {
    const skips = await getConsecutiveSkipCount(userId);
    if (skips === 0) return '';

    const consequences = calculateSkipConsequences(skips);
    const parts = [`SKIP→DENIAL: ${skips} consecutive skips`];
    if (consequences.denialExtensionDays > 0) {
      parts.push(`denial extended +${consequences.denialExtensionDays}d`);
    }
    if (consequences.financialBleedCents > 0) {
      parts.push(`$${(consequences.financialBleedCents / 100).toFixed(0)} penalty pending`);
    }
    if (consequences.handlerPublicPost) {
      parts.push('Handler public post triggered');
    }
    return parts.join(' | ');
  } catch {
    return '';
  }
}
