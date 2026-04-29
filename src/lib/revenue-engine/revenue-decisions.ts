/**
 * Revenue Decision Engine
 *
 * The Handler makes financial decisions autonomously.
 * Pricing changes, tier adjustments, promotional campaigns,
 * content investment decisions — all without Maxy's input.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
import type { RevenueDecision, WeeklyRevenueReview } from '../../types/revenue-engine';

// ── Handler-state loader (centrality compliance) ───────────────────

async function loadRevenueHandlerState(userId: string): Promise<{
  handler_persona: string | null;
  current_phase: number | null;
  denial_day: number | null;
  hard_mode_active: boolean | null;
  chastity_locked: boolean | null;
} | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from('user_state')
    .select('handler_persona, current_phase, denial_day, hard_mode_active, chastity_locked')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as Record<string, unknown> as never) || null;
}

function handlerVoiceFooter(state: Awaited<ReturnType<typeof loadRevenueHandlerState>>): string {
  if (!state) return '';
  const parts: string[] = [];
  if (state.handler_persona) parts.push(`persona=${state.handler_persona}`);
  if (state.current_phase != null) parts.push(`phase=${state.current_phase}`);
  if (state.denial_day != null) parts.push(`denial_day=${state.denial_day}`);
  if (state.hard_mode_active) parts.push('hard_mode=on');
  if (state.chastity_locked) parts.push('chastity=locked');
  return parts.length ? `\nCurrent state: ${parts.join(', ')}. Decisions must reflect this.` : '';
}

// ── Date helpers ────────────────────────────────────────────────────

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split('T')[0];
}

function getPreviousWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day - 7;
  return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split('T')[0];
}

// ── Revenue data helpers ────────────────────────────────────────────

async function getWeeklyRevenue(userId: string, weekStart: string, weekEnd?: string): Promise<{
  total: number;
  byPlatform: Record<string, number>;
  bySource: Record<string, number>;
}> {
  const query = supabase
    .from('revenue_log')
    .select('amount, platform, source')
    .eq('user_id', userId)
    .gte('created_at', weekStart);

  if (weekEnd) {
    query.lt('created_at', weekEnd);
  }

  const { data } = await query;

  if (!data || data.length === 0) {
    return { total: 0, byPlatform: {}, bySource: {} };
  }

  const byPlatform: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let total = 0;

  for (const row of data) {
    const amount = Number(row.amount) || 0;
    total += amount;
    byPlatform[row.platform || 'unknown'] = (byPlatform[row.platform || 'unknown'] || 0) + amount;
    bySource[row.source || 'unknown'] = (bySource[row.source || 'unknown'] || 0) + amount;
  }

  return { total, byPlatform, bySource };
}

// ── Weekly revenue review ───────────────────────────────────────────

/**
 * Weekly: Handler reviews revenue performance and adjusts strategy.
 * Runs Sunday night alongside the calendar generation.
 */
export async function weeklyRevenueReview(
  client: Anthropic,
  userId: string,
): Promise<WeeklyRevenueReview | null> {
  const handlerState = await loadRevenueHandlerState(userId);
  const stateFooter = handlerVoiceFooter(handlerState);
  const weekStart = getWeekStart();
  const prevWeekStart = getPreviousWeekStart();

  const thisWeek = await getWeeklyRevenue(userId, weekStart);
  const lastWeek = await getWeeklyRevenue(userId, prevWeekStart, weekStart);

  const growth = lastWeek.total > 0
    ? (thisWeek.total - lastWeek.total) / lastWeek.total
    : 0;

  // Get subscriber counts
  const { count: subscriberCount } = await supabase
    .from('gfe_subscribers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active');

  // Get top content
  const { data: topContent } = await supabase
    .from('ai_generated_content')
    .select('content, platform, engagement_likes, revenue_generated')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .order('engagement_likes', { ascending: false })
    .limit(5);

  const prompt = `
Weekly revenue review for Maxy's business.

THIS WEEK: $${thisWeek.total.toFixed(2)}
LAST WEEK: $${lastWeek.total.toFixed(2)}
GROWTH: ${(growth * 100).toFixed(1)}%

REVENUE BY PLATFORM:
${Object.entries(thisWeek.byPlatform).map(([p, a]) => `  ${p}: $${a.toFixed(2)}`).join('\n') || '  No revenue data'}

REVENUE BY SOURCE:
${Object.entries(thisWeek.bySource).map(([s, a]) => `  ${s}: $${a.toFixed(2)}`).join('\n') || '  No source data'}

TOP CONTENT:
${topContent?.map(c => `  "${c.content.substring(0, 60)}..." (${c.platform}) — ${c.engagement_likes} likes, $${c.revenue_generated}`).join('\n') || '  No content data'}

SUBSCRIBER COUNT: ${subscriberCount || 0}

DECISIONS TO MAKE:
1. Should subscription pricing change?
2. Should we run a promotion this week?
3. Which content type should we produce more of?
4. Which platform needs more attention?
5. Any investment decisions (boosting, equipment)?

Output JSON:
{
  "pricing_changes": [{"platform": "...", "old_price": N, "new_price": N, "reason": "..."}],
  "promotions_to_run": [{"type": "...", "platform": "...", "details": "...", "duration_days": N}],
  "content_focus_this_week": "...",
  "platform_focus": "...",
  "investment_decisions": [{"type": "...", "amount": N, "reason": "..."}],
  "projected_next_week": N,
  "months_to_crossover": N
}${stateFooter}
  `;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: 'You are an autonomous revenue strategy engine. Analyze data and make decisions. Output only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const review = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim()) as WeeklyRevenueReview;

    // Log all decisions
    for (const pricing of review.pricing_changes || []) {
      await logDecision(userId, 'pricing_change', pricing, `Price change on ${pricing.platform}: ${pricing.reason}`);
    }
    for (const promo of review.promotions_to_run || []) {
      await logDecision(userId, 'promotion', promo, `Promotion: ${promo.details}`);
    }
    if (review.content_focus_this_week) {
      await logDecision(userId, 'content_focus', { focus: review.content_focus_this_week }, review.content_focus_this_week);
    }
    for (const investment of review.investment_decisions || []) {
      await logDecision(userId, 'investment', investment, `Investment: ${investment.type} — $${investment.amount}`);
    }

    return review;
  } catch (err) {
    console.error('[revenue-decisions] Weekly review failed:', err);
    return null;
  }
}

// ── Decision logging ────────────────────────────────────────────────

async function logDecision(
  userId: string,
  type: string,
  data: Record<string, unknown>,
  rationale: string,
): Promise<void> {
  // Tag every decision with current handler state — every revenue decision
  // is a Handler-authored artifact; persona/phase/mode at decision-time is
  // forensic context for review and undo.
  const handlerState = await loadRevenueHandlerState(userId);
  await supabase.from('revenue_decisions').insert({
    user_id: userId,
    decision_type: type,
    decision_data: { ...data, _handler_state_at_decision: handlerState },
    rationale,
  });
}

/**
 * Execute a logged decision (mark as executed).
 */
export async function executeDecision(decisionId: string): Promise<void> {
  await supabase
    .from('revenue_decisions')
    .update({
      executed: true,
      executed_at: new Date().toISOString(),
    })
    .eq('id', decisionId);
}

/**
 * Get recent decisions.
 */
export async function getRecentDecisions(
  userId: string,
  limit: number = 20,
): Promise<RevenueDecision[]> {
  const { data } = await supabase
    .from('revenue_decisions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []) as RevenueDecision[];
}

/**
 * Get pending (unexecuted) decisions.
 */
export async function getPendingDecisions(userId: string): Promise<RevenueDecision[]> {
  const { data } = await supabase
    .from('revenue_decisions')
    .select('*')
    .eq('user_id', userId)
    .eq('executed', false)
    .order('created_at', { ascending: true });

  return (data || []) as RevenueDecision[];
}
