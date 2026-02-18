// ============================================
// Revenue Engine
// Tracking, analytics, intelligence, growth assessment
// ============================================

import { supabase } from '../supabase';
import type {
  RevenueEvent,
  DbRevenueEvent,
  RevenueAnalytics,
  RevenueIntelligence,
  RevenueSource,
} from '../../types/cam';
import { mapDbToRevenueEvent } from '../../types/cam';

// ============================================
// Revenue Constants
// ============================================

const MONTHLY_TARGET_CENTS = 1250000; // $12,500/month target
const DAILY_BUDGET_CENTS = 300; // $3/day operational budget

// ============================================
// Revenue Logging
// ============================================

export async function logRevenue(
  userId: string,
  event: {
    source: RevenueSource;
    platform: string;
    amountCents: number;
    currency?: string;
    contentVaultId?: string;
    arcId?: string;
    camSessionId?: string;
    fundingMilestoneId?: string;
    fanTier?: number;
  }
): Promise<void> {
  await supabase.from('revenue_log').insert({
    user_id: userId,
    source: event.source,
    platform: event.platform,
    amount_cents: event.amountCents,
    currency: event.currency || 'USD',
    content_vault_id: event.contentVaultId,
    arc_id: event.arcId,
    cam_session_id: event.camSessionId,
    funding_milestone_id: event.fundingMilestoneId,
    fan_tier: event.fanTier,
  });

  // Update funding milestone if linked
  if (event.fundingMilestoneId) {
    await updateMilestoneProgress(event.fundingMilestoneId, event.amountCents);
  }
}

// ============================================
// Revenue Analytics
// ============================================

export async function getMonthlyAnalytics(
  userId: string,
  months: number = 6
): Promise<RevenueAnalytics[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const { data } = await supabase
    .from('revenue_log')
    .select('source, amount_cents, created_at')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (!data || data.length === 0) return [];

  // Group by month
  const monthMap = new Map<string, RevenueAnalytics>();

  for (const row of data) {
    const date = new Date(row.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        month: monthKey,
        totalCents: 0,
        subscriptionCents: 0,
        tipCents: 0,
        donationCents: 0,
        camCents: 0,
        ppvCents: 0,
        customCents: 0,
      });
    }

    const analytics = monthMap.get(monthKey)!;
    const amount = row.amount_cents;
    analytics.totalCents += amount;

    switch (row.source) {
      case 'subscription':
        analytics.subscriptionCents += amount;
        break;
      case 'tip':
      case 'cam_tip':
        analytics.tipCents += amount;
        if (row.source === 'cam_tip') analytics.camCents += amount;
        break;
      case 'donation':
        analytics.donationCents += amount;
        break;
      case 'cam_private':
        analytics.camCents += amount;
        break;
      case 'ppv':
        analytics.ppvCents += amount;
        break;
      case 'custom_request':
        analytics.customCents += amount;
        break;
    }
  }

  return Array.from(monthMap.values());
}

export async function getCurrentMonthRevenue(userId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('revenue_log')
    .select('amount_cents')
    .eq('user_id', userId)
    .gte('created_at', startOfMonth.toISOString());

  if (!data) return 0;
  return data.reduce((sum, r) => sum + r.amount_cents, 0);
}

export async function getRecentRevenue(
  userId: string,
  days: number = 30
): Promise<RevenueEvent[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data } = await supabase
    .from('revenue_log')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(50);

  return (data || []).map(d => mapDbToRevenueEvent(d as DbRevenueEvent));
}

// ============================================
// Revenue Intelligence
// ============================================

export async function getRevenueIntelligence(userId: string): Promise<RevenueIntelligence> {
  const monthlyData = await getMonthlyAnalytics(userId, 3);
  const currentMonthly = await getCurrentMonthRevenue(userId);

  // Calculate projections
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedMonthly = dayOfMonth > 0
    ? Math.round((currentMonthly / dayOfMonth) * daysInMonth)
    : 0;

  // Determine top channel
  const latestMonth = monthlyData[monthlyData.length - 1];
  let topChannel = 'none';
  if (latestMonth) {
    const channels: Record<string, number> = {
      subscriptions: latestMonth.subscriptionCents,
      tips: latestMonth.tipCents,
      cam: latestMonth.camCents,
      ppv: latestMonth.ppvCents,
      donations: latestMonth.donationCents,
      custom: latestMonth.customCents,
    };
    topChannel = Object.entries(channels).reduce((best, [key, val]) =>
      val > (channels[best] || 0) ? key : best
    , 'subscriptions');
  }

  // Calculate months to target
  const monthsToTarget = projectedMonthly > 0 && projectedMonthly < MONTHLY_TARGET_CENTS
    ? Math.ceil((MONTHLY_TARGET_CENTS - currentMonthly) / projectedMonthly)
    : projectedMonthly >= MONTHLY_TARGET_CENTS ? 0 : null;

  // Growth lever analysis
  const revenueByMonth = monthlyData.map(m => m.totalCents);
  const growth = revenueByMonth.length >= 2
    ? (revenueByMonth[revenueByMonth.length - 1] - revenueByMonth[0]) / Math.max(revenueByMonth[0], 1)
    : 0;

  // Simplified growth source analysis
  const subscriptionRatio = latestMonth
    ? latestMonth.subscriptionCents / Math.max(latestMonth.totalCents, 1)
    : 0;

  return {
    currentMonthly,
    projectedMonthly,
    monthlyTarget: MONTHLY_TARGET_CENTS,
    monthsToTarget,
    topRevenueChannel: topChannel,
    camSessionROI: 0, // Calculated from cam_sessions data
    revenueByContentType: {},
    growthSource: {
      audienceGrowth: growth,
      audienceRetention: subscriptionRatio,
      spendPerSubscriber: 0, // Would need subscriber count
      primaryGrowthLever: subscriptionRatio > 0.5 ? 'audience_growth' : 'escalation_depth',
    },
  };
}

// ============================================
// Growth Health Assessment
// ============================================

export interface GrowthAssessment {
  healthy: boolean;
  recommendation: string;
  actions: string[];
}

export function assessGrowthHealth(analytics: RevenueIntelligence): GrowthAssessment {
  const lever = analytics.growthSource.primaryGrowthLever;

  if (lever === 'escalation_depth') {
    return {
      healthy: false,
      recommendation: 'shift_to_audience_growth',
      actions: [
        'More free-tier funnel content',
        'Broader platform presence (Reddit, Twitter)',
        'Collaboration with other creators',
        'Content variety over intensity escalation',
      ],
    };
  }

  if (analytics.projectedMonthly < analytics.monthlyTarget * 0.5) {
    return {
      healthy: false,
      recommendation: 'increase_output',
      actions: [
        'Increase posting frequency',
        'Add cam sessions for direct revenue',
        'Create PPV content from vault',
        'Launch fan poll engagement',
      ],
    };
  }

  return { healthy: true, recommendation: 'continue', actions: [] };
}

// ============================================
// Funding Milestone Management
// ============================================

async function updateMilestoneProgress(
  milestoneId: string,
  amountCents: number
): Promise<void> {
  // Get current milestone
  const { data } = await supabase
    .from('funding_milestones')
    .select('current_amount_cents, target_amount_cents, status')
    .eq('id', milestoneId)
    .single();

  if (!data || data.status !== 'active') return;

  const newAmount = (data.current_amount_cents || 0) + amountCents;
  const isComplete = newAmount >= data.target_amount_cents;

  await supabase
    .from('funding_milestones')
    .update({
      current_amount_cents: newAmount,
      status: isComplete ? 'funded' : 'active',
      funded_at: isComplete ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', milestoneId);
}

export async function getActiveMilestones(userId: string): Promise<Array<{
  id: string;
  title: string;
  targetCents: number;
  currentCents: number;
  percentFunded: number;
  status: string;
}>> {
  const { data } = await supabase
    .from('funding_milestones')
    .select('id, title, target_amount_cents, current_amount_cents, status')
    .eq('user_id', userId)
    .in('status', ['active', 'funded'])
    .order('created_at', { ascending: false })
    .limit(10);

  return (data || []).map(d => ({
    id: d.id,
    title: d.title,
    targetCents: d.target_amount_cents,
    currentCents: d.current_amount_cents || 0,
    percentFunded: d.target_amount_cents > 0 ? (d.current_amount_cents || 0) / d.target_amount_cents : 0,
    status: d.status,
  }));
}

// ============================================
// Daily Budget Check
// ============================================

export async function getDailyBudgetStatus(userId: string): Promise<{
  dailyBudgetCents: number;
  todaySpentCents: number;
  todayEarnedCents: number;
  netPositive: boolean;
}> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('revenue_log')
    .select('amount_cents')
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString());

  const todayEarned = (data || []).reduce((sum, r) => sum + r.amount_cents, 0);

  return {
    dailyBudgetCents: DAILY_BUDGET_CENTS,
    todaySpentCents: 0, // Would track expenses separately
    todayEarnedCents: todayEarned,
    netPositive: todayEarned > DAILY_BUDGET_CENTS,
  };
}

// ============================================
// Content Performance Tracking
// ============================================

export interface ContentPerformance {
  vaultItemId: string;
  totalRevenueCents: number;
  revenueBySource: Record<string, number>;
  postCount: number;
  avgRevenuePerPost: number;
}

/**
 * Get revenue attributed to a specific vault item.
 */
export async function getContentPerformance(
  userId: string,
  vaultItemId: string
): Promise<ContentPerformance> {
  const { data } = await supabase
    .from('revenue_log')
    .select('source, amount_cents')
    .eq('user_id', userId)
    .eq('content_vault_id', vaultItemId);

  const events = data || [];
  const totalRevenue = events.reduce((sum, e) => sum + e.amount_cents, 0);

  const bySource: Record<string, number> = {};
  for (const e of events) {
    bySource[e.source] = (bySource[e.source] || 0) + e.amount_cents;
  }

  return {
    vaultItemId,
    totalRevenueCents: totalRevenue,
    revenueBySource: bySource,
    postCount: events.length,
    avgRevenuePerPost: events.length > 0 ? Math.round(totalRevenue / events.length) : 0,
  };
}

/**
 * Get top-performing content by revenue.
 */
export async function getTopContent(
  userId: string,
  limit: number = 10
): Promise<Array<{ vaultItemId: string; totalCents: number; source: string }>> {
  const { data } = await supabase
    .from('revenue_log')
    .select('content_vault_id, amount_cents, source')
    .eq('user_id', userId)
    .not('content_vault_id', 'is', null)
    .order('amount_cents', { ascending: false })
    .limit(limit);

  return (data || []).map(d => ({
    vaultItemId: d.content_vault_id,
    totalCents: d.amount_cents,
    source: d.source,
  }));
}

// ============================================
// Cam Session ROI Tracking
// ============================================

export interface CamROI {
  totalSessions: number;
  totalRevenueCents: number;
  totalMinutes: number;
  revenuePerHour: number;
  avgSessionRevenue: number;
  bestSessionRevenue: number;
  trend: 'up' | 'down' | 'flat';
}

export async function getCamROI(userId: string): Promise<CamROI> {
  const { data } = await supabase
    .from('cam_sessions')
    .select('total_tips_cents, total_privates_cents, actual_duration_minutes')
    .eq('user_id', userId)
    .eq('status', 'ended');

  if (!data || data.length === 0) {
    return {
      totalSessions: 0, totalRevenueCents: 0, totalMinutes: 0,
      revenuePerHour: 0, avgSessionRevenue: 0, bestSessionRevenue: 0, trend: 'flat',
    };
  }

  const sessions = data.map(s => ({
    revenue: (s.total_tips_cents || 0) + (s.total_privates_cents || 0),
    minutes: s.actual_duration_minutes || 0,
  }));

  const totalRevenue = sessions.reduce((sum, s) => sum + s.revenue, 0);
  const totalMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  const bestRevenue = Math.max(...sessions.map(s => s.revenue));

  // Trend: compare last 3 sessions avg to previous 3
  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (sessions.length >= 6) {
    const recent = sessions.slice(0, 3).reduce((s, x) => s + x.revenue, 0) / 3;
    const previous = sessions.slice(3, 6).reduce((s, x) => s + x.revenue, 0) / 3;
    if (recent > previous * 1.1) trend = 'up';
    else if (recent < previous * 0.9) trend = 'down';
  }

  return {
    totalSessions: sessions.length,
    totalRevenueCents: totalRevenue,
    totalMinutes,
    revenuePerHour: totalMinutes > 0 ? Math.round((totalRevenue / totalMinutes) * 60) : 0,
    avgSessionRevenue: Math.round(totalRevenue / sessions.length),
    bestSessionRevenue: bestRevenue,
    trend,
  };
}
