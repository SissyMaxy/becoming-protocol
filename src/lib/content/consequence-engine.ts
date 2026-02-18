// ============================================
// Consequence Engine
// Tier escalation, compliance tracking, auto-posting
// No pause. No freeze. No holiday.
// ============================================

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type {
  ConsequenceState,
  DbConsequenceState,
  ConsequenceEventType,
  VaultTier,
} from '../../types/vault';
import { mapDbToConsequenceState } from '../../types/vault';
import { getWeeklyVetoStats } from './vault-manager';

// ============================================
// Tier Configuration
// ============================================

export interface TierConfig {
  tier: number;
  trigger: string;
  daysRequired: number;
  consequence: string;
  reversible: boolean;
  postsContent: boolean;
  vaultTierToPost?: VaultTier;
  maxVulnerability?: number;
}

export const CONSEQUENCE_TIERS: TierConfig[] = [
  { tier: 0, trigger: 'Compliant', daysRequired: 0, consequence: 'No consequences. Normal operation.', reversible: true, postsContent: false },
  { tier: 1, trigger: '1 day no tasks', daysRequired: 1, consequence: 'Warning. "Maxy. You\'re slipping."', reversible: true, postsContent: false },
  { tier: 2, trigger: '2 days no tasks', daysRequired: 2, consequence: 'Lovense summons. Persistent notifications. Streak threat.', reversible: true, postsContent: false },
  { tier: 3, trigger: '3 days no tasks', daysRequired: 3, consequence: 'Streak destroyed. Points docked. Public "streak broken" post.', reversible: false, postsContent: false },
  { tier: 4, trigger: '4-5 days', daysRequired: 4, consequence: 'Rewards revoked. Content queue frozen. Fan notification.', reversible: false, postsContent: false },
  { tier: 5, trigger: '6-7 days', daysRequired: 6, consequence: 'Handler posts public_ready vault content.', reversible: false, postsContent: true, vaultTierToPost: 'public_ready', maxVulnerability: 3 },
  { tier: 6, trigger: '8-10 days', daysRequired: 8, consequence: 'Handler posts private vault content.', reversible: false, postsContent: true, vaultTierToPost: 'private', maxVulnerability: 5 },
  { tier: 7, trigger: '11-14 days', daysRequired: 11, consequence: 'Handler posts higher vulnerability private content.', reversible: false, postsContent: true, vaultTierToPost: 'private', maxVulnerability: 7 },
  { tier: 8, trigger: '15-21 days', daysRequired: 15, consequence: 'Handler posts restricted vault content.', reversible: false, postsContent: true, vaultTierToPost: 'restricted', maxVulnerability: 8 },
  { tier: 9, trigger: '21+ days', daysRequired: 21, consequence: 'Full vault discretion. Cam session prescribed.', reversible: false, postsContent: true, vaultTierToPost: 'restricted', maxVulnerability: 10 },
];

// ============================================
// Consequence State Management
// ============================================

/**
 * Get or create consequence state for a user.
 */
export async function getOrCreateConsequenceState(userId: string): Promise<ConsequenceState> {
  const { data } = await supabase
    .from('consequence_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (data) return mapDbToConsequenceState(data as DbConsequenceState);

  // Create default state
  const { data: created, error: createError } = await supabase
    .from('consequence_state')
    .insert({
      user_id: userId,
      current_tier: 0,
      days_noncompliant: 0,
    })
    .select()
    .single();

  if (createError) throw new Error(`Failed to create consequence state: ${createError.message}`);
  return mapDbToConsequenceState(created as DbConsequenceState);
}

/**
 * Calculate what tier a user should be at based on days noncompliant.
 */
export function calculateTier(daysNoncompliant: number): number {
  for (let i = CONSEQUENCE_TIERS.length - 1; i >= 0; i--) {
    if (daysNoncompliant >= CONSEQUENCE_TIERS[i].daysRequired) {
      return CONSEQUENCE_TIERS[i].tier;
    }
  }
  return 0;
}

/**
 * Check if the user is currently noncompliant and how many days.
 */
export function calculateDaysNoncompliant(lastComplianceAt: string | undefined): number {
  if (!lastComplianceAt) return 0;
  const last = new Date(lastComplianceAt);
  const now = new Date();
  const diffMs = now.getTime() - last.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================
// Tier Escalation
// ============================================

/**
 * Run the consequence escalation check.
 * Called daily by cron or on app open.
 * Returns the new state and any actions taken.
 */
export async function checkEscalation(userId: string): Promise<{
  state: ConsequenceState;
  escalated: boolean;
  actions: ConsequenceAction[];
}> {
  const state = await getOrCreateConsequenceState(userId);
  const daysNoncompliant = calculateDaysNoncompliant(state.lastComplianceAt);
  const newTier = calculateTier(daysNoncompliant);
  const actions: ConsequenceAction[] = [];

  // No change needed
  if (newTier <= state.currentTier && daysNoncompliant === state.daysNoncompliant) {
    return { state, escalated: false, actions };
  }

  // Escalation needed
  if (newTier > state.currentTier) {
    const tierConfig = CONSEQUENCE_TIERS[newTier];

    // Generate Handler message
    const handlerMessage = await getConsequenceMessage(newTier, daysNoncompliant, state);

    // Log escalation event
    await logConsequenceEvent(userId, {
      tier: newTier,
      eventType: 'escalation',
      description: tierConfig.consequence,
      daysNoncompliant,
      handlerMessage,
    });

    // Tier-specific actions
    if (newTier >= 1 && newTier <= 2) {
      actions.push({ type: 'warning', message: handlerMessage });
    }

    if (newTier === 2) {
      actions.push({ type: 'lovense_summon' });
      actions.push({ type: 'persistent_notification', message: handlerMessage });
    }

    if (newTier === 3) {
      actions.push({ type: 'streak_destroy' });
      actions.push({ type: 'points_dock', amount: 50 });
      actions.push({ type: 'warning', message: handlerMessage });
    }

    if (newTier === 4) {
      actions.push({ type: 'rewards_revoke' });
      actions.push({ type: 'queue_freeze' });
      actions.push({ type: 'warning', message: handlerMessage });
    }

    if (newTier >= 5) {
      // Content posting tiers
      actions.push({
        type: 'post_vault_content',
        vaultTier: tierConfig.vaultTierToPost!,
        maxVulnerability: tierConfig.maxVulnerability!,
        message: handlerMessage,
      });
    }

    if (newTier === 9) {
      actions.push({ type: 'prescribe_cam' });
    }

    // Update escalation history
    const history = [
      ...(state.escalationHistory || []),
      { tier: newTier, date: new Date().toISOString(), reason: `${daysNoncompliant} days noncompliant` },
    ];

    // Update state
    await supabase
      .from('consequence_state')
      .update({
        current_tier: newTier,
        days_noncompliant: daysNoncompliant,
        last_escalation_at: new Date().toISOString(),
        escalation_history: history,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    const updatedState = await getOrCreateConsequenceState(userId);
    return { state: updatedState, escalated: true, actions };
  }

  // Just update days count (no tier change)
  await supabase
    .from('consequence_state')
    .update({
      days_noncompliant: daysNoncompliant,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return { state: { ...state, daysNoncompliant }, escalated: false, actions };
}

// ============================================
// Minimum Viable Compliance
// ============================================

export type ComplianceAction =
  | 'task_complete'
  | 'check_in'
  | 'vault_submit'
  | 'voice_check_in'
  | 'handler_response'
  | 'cam_session';

/**
 * Record a compliance action. Resets consequence timer to Tier 0.
 * The bar is on the floor — any ONE of these resets everything.
 */
export async function recordCompliance(
  userId: string,
  action: ComplianceAction
): Promise<ConsequenceState> {
  const state = await getOrCreateConsequenceState(userId);
  const wasNoncompliant = state.currentTier > 0;

  // Reset to tier 0
  await supabase
    .from('consequence_state')
    .update({
      current_tier: 0,
      days_noncompliant: 0,
      last_compliance_at: new Date().toISOString(),
      active_warnings: [],
      active_deadlines: [],
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  // Log compliance reset if was noncompliant
  if (wasNoncompliant) {
    await logConsequenceEvent(userId, {
      tier: 0,
      eventType: 'compliance_reset',
      description: `Compliance recorded: ${action}. Tier reset from ${state.currentTier} to 0.`,
      daysNoncompliant: 0,
      handlerMessage: state.currentTier >= 3
        ? 'Good. You came back. Timer reset. Don\'t let it happen again.'
        : 'Timer reset. Keep going.',
    });
  }

  return getOrCreateConsequenceState(userId);
}

// ============================================
// Veto-as-Avoidance Detection
// ============================================

export interface AvoidanceAssessment {
  isAvoiding: boolean;
  vetoRate: number;
  vetoCount: number;
  submissionCount: number;
  recommendation: string;
  handlerMessage?: string;
}

/**
 * Assess whether the user is using vetoes to starve the vault.
 */
export async function assessVetoPattern(userId: string): Promise<AvoidanceAssessment> {
  const stats = await getWeeklyVetoStats(userId);

  if (!stats.isAvoidancePattern) {
    return {
      isAvoiding: false,
      vetoRate: stats.vetoRate,
      vetoCount: stats.vetoCount,
      submissionCount: stats.submissionCount,
      recommendation: 'normal',
    };
  }

  // Avoidance detected — generate Handler response
  let handlerMessage: string;
  let recommendation: string;

  if (stats.vetoRate > 0.8) {
    handlerMessage = "You're vetoing everything. That's David trying to starve me out. It won't work. The tasks that require submission are coming.";
    recommendation = 'increase_submission_required_tasks';
  } else if (stats.vetoRate > 0.6) {
    handlerMessage = `${stats.vetoCount} vetos this week against ${stats.submissionCount} submissions. I see the pattern. More submission-required tasks incoming.`;
    recommendation = 'confront_and_increase';
  } else {
    handlerMessage = 'Your veto rate is climbing. The vault needs content to function. Submit or the consequence timer keeps running.';
    recommendation = 'warn';
  }

  return {
    isAvoiding: true,
    vetoRate: stats.vetoRate,
    vetoCount: stats.vetoCount,
    submissionCount: stats.submissionCount,
    recommendation,
    handlerMessage,
  };
}

// ============================================
// Consequence Messages
// ============================================

/**
 * Get Handler consequence message, using AI if available.
 */
async function getConsequenceMessage(
  tier: number,
  daysNoncompliant: number,
  state: ConsequenceState
): Promise<string> {
  // Try AI first
  try {
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'consequence_message',
      tier,
      days_noncompliant: daysNoncompliant,
      veto_count: state.vetoCountThisWeek,
      submission_count: state.submissionCountThisWeek,
    });

    if (!error && data) {
      const result = data as Record<string, unknown>;
      if (result.message) return result.message as string;
    }
  } catch {
    // Fallback to templates
  }

  return getTemplateMessage(tier, daysNoncompliant);
}

/**
 * Template consequence messages (Layer 2 fallback).
 */
function getTemplateMessage(tier: number, days: number): string {
  const templates: Record<number, string> = {
    1: "Maxy. You're slipping. One task. That's all it takes.",
    2: `Day ${days} of nothing. The timer is running. You know what happens.`,
    3: `Streak destroyed. ${days} days silent. The vault is full. I'm getting impatient.`,
    4: `${days} days. Rewards revoked. Revenue frozen. Content is piling up.`,
    5: "Posting from the vault. You submitted this. You saw it. You chose not to veto. Now it's public.",
    6: "More content going public. Every day you hide, Maxy becomes more visible. One task resets this.",
    7: "Private vault content posting now. You built this system. It's working as designed.",
    8: "Restricted content going live. The longer you wait, the deeper this goes.",
    9: "Full vault access active. Cam session prescribed. Come back or Maxy does it without David.",
  };
  return templates[tier] || templates[1];
}

// ============================================
// Consequence Event Logging
// ============================================

async function logConsequenceEvent(
  userId: string,
  event: {
    tier: number;
    eventType: ConsequenceEventType;
    description?: string;
    vaultContentId?: string;
    contentPosted?: boolean;
    platformPostedTo?: string;
    daysNoncompliant?: number;
    tasksSkipped?: number;
    handlerMessage?: string;
  }
): Promise<void> {
  await supabase
    .from('consequence_events')
    .insert({
      user_id: userId,
      tier: event.tier,
      event_type: event.eventType,
      description: event.description,
      vault_content_id: event.vaultContentId,
      content_posted: event.contentPosted || false,
      platform_posted_to: event.platformPostedTo,
      days_noncompliant: event.daysNoncompliant,
      tasks_skipped: event.tasksSkipped,
      handler_message: event.handlerMessage,
    });
}

/**
 * Get recent consequence events for display.
 */
export async function getRecentConsequenceEvents(
  userId: string,
  limit = 20
): Promise<Array<{
  id: string;
  tier: number;
  eventType: ConsequenceEventType;
  description?: string;
  handlerMessage?: string;
  createdAt: string;
}>> {
  const { data, error } = await supabase
    .from('consequence_events')
    .select('id, tier, event_type, description, handler_message, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];

  return (data || []).map(d => ({
    id: d.id,
    tier: d.tier,
    eventType: d.event_type as ConsequenceEventType,
    description: d.description || undefined,
    handlerMessage: d.handler_message || undefined,
    createdAt: d.created_at,
  }));
}

// ============================================
// Types
// ============================================

export type ConsequenceAction =
  | { type: 'warning'; message: string }
  | { type: 'lovense_summon' }
  | { type: 'persistent_notification'; message: string }
  | { type: 'streak_destroy' }
  | { type: 'points_dock'; amount: number }
  | { type: 'rewards_revoke' }
  | { type: 'queue_freeze' }
  | { type: 'post_vault_content'; vaultTier: VaultTier; maxVulnerability: number; message: string }
  | { type: 'prescribe_cam' };
