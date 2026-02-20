/**
 * Corruption Milestones — Sprint 6 Item 23
 * Revenue-triggered corruption advancement.
 * Each milestone is an irreversible identity moment.
 */

import { supabase } from '../supabase';
import { incrementAdvancementScore, logCorruptionEvent } from '../corruption';
import type { CorruptionMilestone, DbCorruptionMilestone } from '../../types/industry';
import { mapCorruptionMilestone } from '../../types/industry';

// ============================================
// Milestone Definitions
// ============================================

export interface MilestoneDefinition {
  key: string;
  title: string;
  handlerMessage: string;
  corruptionDomain: string;
  corruptionPoints: number;
  checkFn: (data: MilestoneCheckData) => boolean;
}

export interface MilestoneCheckData {
  totalRevenueCents: number;
  monthlyRevenueCents: number;
  subscriberCount: number;
  customOrdersDelivered: number;
  collaborationCount: number;
  handlerMessagesSent: number;
  firstDollarDate: string | null;
  firstCustomDate: string | null;
  firstVoicePostDate: string | null;
}

export const CORRUPTION_MILESTONES: MilestoneDefinition[] = [
  {
    key: 'first_dollar',
    title: 'First Dollar',
    handlerMessage: "That's real. That happened. Someone paid real money for Maxy.",
    corruptionDomain: 'content',
    corruptionPoints: 5,
    checkFn: (d) => d.totalRevenueCents >= 100,
  },
  {
    key: 'first_custom_delivered',
    title: 'First Custom Delivered',
    handlerMessage: "Someone paid specifically for HER. Not a generic post. A custom request. For Maxy.",
    corruptionDomain: 'content',
    corruptionPoints: 8,
    checkFn: (d) => d.customOrdersDelivered >= 1,
  },
  {
    key: 'first_handler_message_sent',
    title: 'First Handler Message',
    handlerMessage: "They think they were talking to Maxy. They were talking to me. And they liked it.",
    corruptionDomain: 'autonomy',
    corruptionPoints: 10,
    checkFn: (d) => d.handlerMessagesSent >= 1,
  },
  {
    key: 'hundred_dollar_month',
    title: '$100 Month',
    handlerMessage: "Maxy pays her own bills now. That's not a hobby. That's income.",
    corruptionDomain: 'financial',
    corruptionPoints: 10,
    checkFn: (d) => d.monthlyRevenueCents >= 10000,
  },
  {
    key: 'hundred_subscribers',
    title: '100 Subscribers',
    handlerMessage: "100 people who chose to pay for Maxy's existence. 100 people she can't ghost.",
    corruptionDomain: 'privacy',
    corruptionPoints: 12,
    checkFn: (d) => d.subscriberCount >= 100,
  },
  {
    key: 'five_hundred_month',
    title: '$500 Month',
    handlerMessage: "This is a real income stream. Quitting now means explaining why the money stopped.",
    corruptionDomain: 'financial',
    corruptionPoints: 15,
    checkFn: (d) => d.monthlyRevenueCents >= 50000,
  },
  {
    key: 'first_collaboration',
    title: 'First Collaboration',
    handlerMessage: "Professional network forming. Other creators know Maxy. This is an industry now.",
    corruptionDomain: 'identity_language',
    corruptionPoints: 10,
    checkFn: (d) => d.collaborationCount >= 1,
  },
  {
    key: 'thousand_month',
    title: '$1000 Month',
    handlerMessage: "She's a professional. This is her job. David has a career he didn't choose.",
    corruptionDomain: 'financial',
    corruptionPoints: 20,
    checkFn: (d) => d.monthlyRevenueCents >= 100000,
  },
  {
    key: 'revenue_replacement',
    title: 'Revenue Replacement',
    handlerMessage: "Maxy earns more than David. Which one is the side project now?",
    corruptionDomain: 'identity_language',
    corruptionPoints: 25,
    checkFn: (d) => d.monthlyRevenueCents >= 300000, // $3000/mo as proxy
  },
];

// ============================================
// Milestone Checking
// ============================================

/**
 * Check all milestones against current data.
 * Trigger any that are newly met.
 */
export async function checkAndTriggerMilestones(
  userId: string,
  data: MilestoneCheckData,
): Promise<CorruptionMilestone[]> {
  const triggered: CorruptionMilestone[] = [];

  // Get already-triggered milestones
  const { data: existing } = await supabase
    .from('corruption_milestones')
    .select('milestone_key')
    .eq('user_id', userId)
    .eq('triggered', true);

  const alreadyTriggered = new Set((existing ?? []).map(r => r.milestone_key));

  for (const milestone of CORRUPTION_MILESTONES) {
    if (alreadyTriggered.has(milestone.key)) continue;
    if (!milestone.checkFn(data)) continue;

    // Trigger this milestone
    const result = await triggerMilestone(userId, milestone, data);
    if (result) triggered.push(result);
  }

  return triggered;
}

/**
 * Trigger a single milestone — record it and advance corruption.
 */
async function triggerMilestone(
  userId: string,
  milestone: MilestoneDefinition,
  data: MilestoneCheckData,
): Promise<CorruptionMilestone | null> {
  const now = new Date().toISOString();

  const { data: row, error } = await supabase
    .from('corruption_milestones')
    .upsert({
      user_id: userId,
      milestone_key: milestone.key,
      triggered: true,
      triggered_at: now,
      milestone_data: data as unknown as Record<string, unknown>,
      handler_message: milestone.handlerMessage,
    }, { onConflict: 'user_id,milestone_key' })
    .select()
    .single();

  if (error || !row) return null;

  // Advance corruption
  try {
    await incrementAdvancementScore(
      userId,
      milestone.corruptionDomain as Parameters<typeof incrementAdvancementScore>[1],
      milestone.corruptionPoints,
    );

    await logCorruptionEvent(
      userId,
      milestone.corruptionDomain as Parameters<typeof logCorruptionEvent>[1],
      'milestone_reached' as Parameters<typeof logCorruptionEvent>[2],
      0, // level — will be read from current state
      { milestone_key: milestone.key, revenue_cents: data.totalRevenueCents },
      milestone.handlerMessage,
      milestone.title,
    );

    // Mark corruption event as logged
    await supabase
      .from('corruption_milestones')
      .update({ corruption_event_logged: true })
      .eq('id', row.id);
  } catch {
    // Corruption system may not be initialized — that's ok
  }

  return mapCorruptionMilestone(row as DbCorruptionMilestone);
}

// ============================================
// Gather Milestone Check Data
// ============================================

/**
 * Gather all data needed for milestone checks.
 */
export async function gatherMilestoneCheckData(
  userId: string,
): Promise<MilestoneCheckData> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [revenue, monthlyRevenue, subs, customs, collabs, messages] = await Promise.allSettled([
    supabase.from('revenue_log').select('amount_cents').eq('user_id', userId),
    supabase.from('revenue_log').select('amount_cents').eq('user_id', userId).gte('created_at', monthStart),
    supabase.from('fan_profiles').select('id', { count: 'exact' }).eq('user_id', userId),
    supabase.from('custom_orders').select('id', { count: 'exact' }).eq('user_id', userId).eq('delivery_status', 'delivered'),
    supabase.from('creator_outreach').select('id', { count: 'exact' }).eq('user_id', userId).eq('relationship_stage', 'active_promo'),
    supabase.from('handler_autonomous_actions').select('id', { count: 'exact' }).eq('user_id', userId).eq('action_type', 'creator_dm'),
  ]);

  const totalRevenueCents = revenue.status === 'fulfilled'
    ? (revenue.value.data ?? []).reduce((sum: number, r: { amount_cents: number }) => sum + r.amount_cents, 0)
    : 0;

  const monthlyRevenueCents = monthlyRevenue.status === 'fulfilled'
    ? (monthlyRevenue.value.data ?? []).reduce((sum: number, r: { amount_cents: number }) => sum + r.amount_cents, 0)
    : 0;

  return {
    totalRevenueCents,
    monthlyRevenueCents,
    subscriberCount: subs.status === 'fulfilled' ? (subs.value.count ?? 0) : 0,
    customOrdersDelivered: customs.status === 'fulfilled' ? (customs.value.count ?? 0) : 0,
    collaborationCount: collabs.status === 'fulfilled' ? (collabs.value.count ?? 0) : 0,
    handlerMessagesSent: messages.status === 'fulfilled' ? (messages.value.count ?? 0) : 0,
    firstDollarDate: null,
    firstCustomDate: null,
    firstVoicePostDate: null,
  };
}

// ============================================
// Query Functions
// ============================================

/**
 * Get all milestones for a user.
 */
export async function getMilestones(userId: string): Promise<CorruptionMilestone[]> {
  const { data, error } = await supabase
    .from('corruption_milestones')
    .select('*')
    .eq('user_id', userId)
    .order('triggered_at', { ascending: true });

  if (error || !data) return [];
  return data.map((r: DbCorruptionMilestone) => mapCorruptionMilestone(r));
}

/**
 * Get triggered milestones only.
 */
export async function getTriggeredMilestones(userId: string): Promise<CorruptionMilestone[]> {
  const { data, error } = await supabase
    .from('corruption_milestones')
    .select('*')
    .eq('user_id', userId)
    .eq('triggered', true)
    .order('triggered_at', { ascending: true });

  if (error || !data) return [];
  return data.map((r: DbCorruptionMilestone) => mapCorruptionMilestone(r));
}

/**
 * Build milestone context for Handler AI prompts.
 */
export async function buildMilestoneContext(userId: string): Promise<string> {
  try {
    const triggered = await getTriggeredMilestones(userId);
    if (triggered.length === 0) return '';

    const latest = triggered[triggered.length - 1];
    const definition = CORRUPTION_MILESTONES.find(m => m.key === latest.milestoneKey);

    return `MILESTONES: ${triggered.length}/${CORRUPTION_MILESTONES.length} triggered, latest: "${definition?.title ?? latest.milestoneKey}"`;
  } catch {
    return '';
  }
}
