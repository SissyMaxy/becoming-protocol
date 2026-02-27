/**
 * Content Pipeline — Revenue
 *
 * Revenue logging, summaries, briefings, threshold checks.
 * Handler tracks the money. David sees one curated line.
 */

import { supabase } from '../supabase';
import type { RevenueSummary } from '../../types/content-pipeline';

// ── Log revenue ─────────────────────────────────────────

export async function logRevenue(
  userId: string,
  entry: {
    source: string;
    platform: string;
    amount_cents: number;
    currency?: string;
    revenue_type?: string;
    distribution_id?: string;
    session_id?: string;
    notes?: string;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('revenue_log')
    .insert({
      user_id: userId,
      source: entry.source,
      platform: entry.platform,
      amount_cents: entry.amount_cents,
      currency: entry.currency || 'USD',
      revenue_type: entry.revenue_type || null,
      distribution_id: entry.distribution_id || null,
      session_id: entry.session_id || null,
      period_date: new Date().toISOString().split('T')[0],
      notes: entry.notes || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[revenue] logRevenue error:', error);
    return null;
  }

  return data.id;
}

// ── Revenue summary ─────────────────────────────────────

export async function getRevenueSummary(userId: string): Promise<RevenueSummary> {
  const { data, error } = await supabase
    .from('revenue_log')
    .select('amount_cents, platform, source, revenue_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    return {
      total_cents: 0,
      this_month_cents: 0,
      last_30d_cents: 0,
      by_platform: {},
      by_type: {},
      daily_average_cents: 0,
      trend: 'flat',
    };
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

  let total = 0;
  let thisMonth = 0;
  let last30d = 0;
  let prev30d = 0;
  const byPlatform: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const row of data) {
    const cents = row.amount_cents as number;
    const created = new Date(row.created_at as string);
    total += cents;

    if (created >= monthStart) thisMonth += cents;
    if (created >= thirtyDaysAgo) last30d += cents;
    if (created >= sixtyDaysAgo && created < thirtyDaysAgo) prev30d += cents;

    const platform = row.platform as string;
    byPlatform[platform] = (byPlatform[platform] || 0) + cents;

    const type = (row.revenue_type || row.source) as string;
    byType[type] = (byType[type] || 0) + cents;
  }

  const firstEntry = new Date(data[data.length - 1].created_at as string);
  const daysSinceFirst = Math.max(1, Math.ceil((now.getTime() - firstEntry.getTime()) / 86400000));
  const dailyAverage = Math.round(total / daysSinceFirst);

  const trend: RevenueSummary['trend'] = last30d > prev30d * 1.1
    ? 'up'
    : last30d < prev30d * 0.9
      ? 'down'
      : 'flat';

  return {
    total_cents: total,
    this_month_cents: thisMonth,
    last_30d_cents: last30d,
    by_platform: byPlatform,
    by_type: byType,
    daily_average_cents: dailyAverage,
    trend,
  };
}

// ── Revenue briefing (for morning briefing) ─────────────

export async function getRevenueBriefing(userId: string): Promise<{
  yesterday_cents: number;
  this_month_cents: number;
  trend: string;
}> {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const { data: yesterdayData } = await supabase
    .from('revenue_log')
    .select('amount_cents')
    .eq('user_id', userId)
    .eq('period_date', yesterdayStr);

  const yesterdayCents = (yesterdayData || []).reduce(
    (sum, r) => sum + (r.amount_cents as number), 0
  );

  const summary = await getRevenueSummary(userId);

  return {
    yesterday_cents: yesterdayCents,
    this_month_cents: summary.this_month_cents,
    trend: summary.trend,
  };
}

// ── Log revenue (extended) ───────────────────────────────

export async function logRevenueExtended(
  userId: string,
  entry: {
    source: string;
    platform: string;
    amount_cents: number;
    currency?: string;
    revenue_type?: string;
    revenue_date?: string;
    fan_username?: string;
    description?: string;
    scraped?: boolean;
    scrape_source?: string;
    platform_transaction_id?: string;
    distribution_id?: string;
    session_id?: string;
    notes?: string;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('revenue_log')
    .insert({
      user_id: userId,
      source: entry.source,
      platform: entry.platform,
      amount_cents: entry.amount_cents,
      currency: entry.currency || 'USD',
      revenue_type: entry.revenue_type || null,
      revenue_date: entry.revenue_date || new Date().toISOString().split('T')[0],
      fan_username: entry.fan_username || null,
      description: entry.description || null,
      scraped: entry.scraped || false,
      scrape_source: entry.scrape_source || null,
      platform_transaction_id: entry.platform_transaction_id || null,
      distribution_id: entry.distribution_id || null,
      session_id: entry.session_id || null,
      period_date: entry.revenue_date || new Date().toISOString().split('T')[0],
      notes: entry.notes || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[revenue] logRevenueExtended error:', error);
    return null;
  }
  return data.id;
}

// ── Import CSV rows ──────────────────────────────────────

export async function importRevenueCSV(
  userId: string,
  rows: Array<{
    platform: string;
    amount_cents: number;
    revenue_type?: string;
    revenue_date: string;
    fan_username?: string;
    description?: string;
    platform_transaction_id?: string;
  }>
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const result = await logRevenueExtended(userId, {
      source: 'csv_import',
      platform: row.platform,
      amount_cents: row.amount_cents,
      revenue_type: row.revenue_type,
      revenue_date: row.revenue_date,
      fan_username: row.fan_username,
      description: row.description,
      platform_transaction_id: row.platform_transaction_id,
      scraped: true,
      scrape_source: 'csv',
    });

    if (result) imported++;
    else skipped++;
  }

  return { imported, skipped };
}

// ── Get revenue by date range ────────────────────────────

export async function getRevenueByDate(
  userId: string,
  start: string,
  end: string
): Promise<Array<{ date: string; total_cents: number; entries: number }>> {
  const { data, error } = await supabase
    .from('revenue_log')
    .select('amount_cents, revenue_date')
    .eq('user_id', userId)
    .gte('revenue_date', start)
    .lte('revenue_date', end)
    .order('revenue_date', { ascending: true });

  if (error || !data) return [];

  const byDate: Record<string, { total_cents: number; entries: number }> = {};
  for (const row of data) {
    const d = (row.revenue_date as string) || 'unknown';
    if (!byDate[d]) byDate[d] = { total_cents: 0, entries: 0 };
    byDate[d].total_cents += row.amount_cents as number;
    byDate[d].entries++;
  }

  return Object.entries(byDate).map(([date, val]) => ({ date, ...val }));
}

// ── Screenshot OCR stub ──────────────────────────────────

export async function scrapeRevenueFromScreenshot(
  _userId: string,
  _imageUrl: string
): Promise<Array<{ platform: string; amount_cents: number; revenue_date: string }>> {
  // TODO: Wire Claude vision to extract revenue data from screenshots
  console.log('[revenue] scrapeRevenueFromScreenshot stub — not yet implemented');
  return [];
}

// ── Revenue threshold checks (for corruption advancement) ──

export async function checkRevenueThresholds(userId: string): Promise<{
  hasAnyRevenue: boolean;
  monthlyOver500: boolean;
  monthlyOver2000: boolean;
  monthlyOver5000: boolean;
}> {
  const summary = await getRevenueSummary(userId);
  const monthly = summary.this_month_cents;

  return {
    hasAnyRevenue: summary.total_cents > 0,
    monthlyOver500: monthly >= 50000,      // $500
    monthlyOver2000: monthly >= 200000,    // $2,000
    monthlyOver5000: monthly >= 500000,    // $5,000
  };
}
