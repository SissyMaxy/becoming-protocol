/**
 * Financial Engine - Handler Autonomous System
 *
 * Manages the Maxy Fund, revenue tracking, financial consequences,
 * and feminization purchases. The Handler controls all finances.
 *
 * Key concepts:
 * - Revenue flows in from platform accounts (OnlyFans, Fansly, etc.)
 * - Fund is allocated: reserve for consequences, feminization purchases, payouts
 * - Consequences deduct from fund first; if empty, create pending Stripe charge
 * - "Bleeding" is continuous financial penalty for noncompliance ($ per minute)
 * - Monthly penalty limits prevent runaway consequences
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface MaxyFund {
  userId: string;
  balance: number;
  totalEarned: number;
  totalPenalties: number;
  totalSpentFeminization: number;
  totalPaidOut: number;
  pendingPayout: number;
  payoutThreshold: number;
  reservePercentage: number;
  monthlyPenaltyLimit: number;
  monthlyPenaltiesThisMonth: number;
}

export interface FundTransaction {
  id: string;
  userId: string;
  transactionType: string;
  amount: number;
  description: string;
  referenceId: string | null;
  referenceType: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface RevenueEvent {
  id: string;
  userId: string;
  platform: string;
  revenueType: string;
  amount: number;
  currency: string;
  netAmount: number | null;
  subscriberId: string | null;
  subscriberName: string | null;
  contentId: string | null;
  createdAt: string;
}

interface FinancialConsequenceRecord {
  id: string;
  userId: string;
  triggerReason: string;
  amountCents: number;
  currency: string;
  targetOrg: string | null;
  status: string;
  stripePaymentId: string | null;
  processedAt: string | null;
  errorMessage: string | null;
  enforcementTier: number | null;
  consecutiveDaysNoncompliant: number | null;
  createdAt: string;
}

export interface EarningsSummary {
  total: number;
  byPlatform: Record<string, number>;
  byType: Record<string, number>;
}

// ============================================
// HELPERS
// ============================================

/**
 * Get the current YYYY-MM string for monthly penalty tracking.
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get today's date as ISO date string (YYYY-MM-DD).
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Map a database row from maxy_fund to our MaxyFund interface.
 */
function mapFundRow(row: Record<string, unknown>): MaxyFund {
  return {
    userId: row.user_id as string,
    balance: Number(row.balance) || 0,
    totalEarned: Number(row.total_earned) || 0,
    totalPenalties: Number(row.total_penalties) || 0,
    totalSpentFeminization: Number(row.total_spent_feminization) || 0,
    totalPaidOut: Number(row.total_paid_out) || 0,
    pendingPayout: Number(row.pending_payout) || 0,
    payoutThreshold: Number(row.payout_threshold) || 100,
    reservePercentage: Number(row.reserve_percentage) || 0.2,
    monthlyPenaltyLimit: Number(row.monthly_penalty_limit) || 500,
    monthlyPenaltiesThisMonth: Number(row.monthly_penalties_this_month) || 0,
  };
}

/**
 * Map a database row from fund_transactions to our FundTransaction interface.
 */
function mapTransactionRow(row: Record<string, unknown>): FundTransaction {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    transactionType: row.transaction_type as string,
    amount: Number(row.amount) || 0,
    description: (row.description as string) || '',
    referenceId: (row.reference_id as string) || null,
    referenceType: (row.reference_type as string) || null,
    balanceAfter: Number(row.balance_after) || 0,
    createdAt: row.created_at as string,
  };
}

/**
 * Map a database row from revenue_events to our RevenueEvent interface.
 */
export function mapRevenueRow(row: Record<string, unknown>): RevenueEvent {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    platform: row.platform as string,
    revenueType: row.revenue_type as string,
    amount: Number(row.amount) || 0,
    currency: (row.currency as string) || 'USD',
    netAmount: row.net_amount != null ? Number(row.net_amount) : null,
    subscriberId: (row.subscriber_id as string) || null,
    subscriberName: (row.subscriber_name as string) || null,
    contentId: (row.content_id as string) || null,
    createdAt: row.created_at as string,
  };
}

/**
 * Ensure the monthly penalty counter is reset if we've rolled into a new month.
 * Returns the (possibly reset) current monthly penalties total.
 */
async function ensureMonthlyPenaltyReset(userId: string): Promise<number> {
  const currentMonth = getCurrentMonth();

  const { data } = await supabase
    .from('maxy_fund')
    .select('penalty_month, monthly_penalties_this_month')
    .eq('user_id', userId)
    .single();

  if (!data) return 0;

  if (data.penalty_month !== currentMonth) {
    // New month -- reset counter
    await supabase
      .from('maxy_fund')
      .update({
        penalty_month: currentMonth,
        monthly_penalties_this_month: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    return 0;
  }

  return Number(data.monthly_penalties_this_month) || 0;
}

/**
 * Increment the monthly penalty counter by the given amount.
 */
async function incrementMonthlyPenalties(userId: string, amount: number): Promise<void> {
  const currentMonth = getCurrentMonth();

  await supabase.rpc('add_monthly_penalty_amount', {
    p_user_id: userId,
    p_amount: amount,
    p_month: currentMonth,
  }).then(({ error }) => {
    // If the RPC doesn't exist, fall back to a direct update
    if (error) {
      return supabase
        .from('maxy_fund')
        .update({
          monthly_penalties_this_month: 0,
          penalty_month: currentMonth,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    }
  });

  // Fallback: direct read-modify-write if RPC is unavailable
  const { data } = await supabase
    .from('maxy_fund')
    .select('monthly_penalties_this_month')
    .eq('user_id', userId)
    .single();

  if (data) {
    const current = Number(data.monthly_penalties_this_month) || 0;
    await supabase
      .from('maxy_fund')
      .update({
        monthly_penalties_this_month: current + amount,
        penalty_month: currentMonth,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  }
}

// ============================================
// FUND STATE
// ============================================

/**
 * Get the current state of the Maxy Fund for a user.
 * Returns null if no fund record exists (user hasn't been initialized).
 */
export async function getFund(userId: string): Promise<MaxyFund | null> {
  const { data, error } = await supabase
    .from('maxy_fund')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  // Ensure monthly penalties are current
  await ensureMonthlyPenaltyReset(userId);

  // Re-fetch after possible reset
  const { data: refreshed } = await supabase
    .from('maxy_fund')
    .select('*')
    .eq('user_id', userId)
    .single();

  return refreshed ? mapFundRow(refreshed) : mapFundRow(data);
}

// ============================================
// TRANSACTION HISTORY
// ============================================

/**
 * Get recent fund transactions, ordered newest first.
 */
export async function getTransactionHistory(
  userId: string,
  limit: number = 50
): Promise<FundTransaction[]> {
  const { data, error } = await supabase
    .from('fund_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map(mapTransactionRow);
}

// ============================================
// REVENUE PROCESSING
// ============================================

/**
 * Record a revenue event and add earnings to the Maxy Fund.
 * Returns the new fund balance after crediting.
 */
export async function processRevenue(
  userId: string,
  event: Omit<RevenueEvent, 'id' | 'createdAt'>
): Promise<number> {
  // 1. Insert the revenue event
  const { data: inserted, error: insertError } = await supabase
    .from('revenue_events')
    .insert({
      user_id: event.userId,
      platform: event.platform,
      revenue_type: event.revenueType,
      amount: event.amount,
      currency: event.currency,
      net_amount: event.netAmount,
      subscriber_id: event.subscriberId,
      subscriber_name: event.subscriberName,
      content_id: event.contentId,
      processed: true,
      processed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[FinancialEngine] Error inserting revenue event:', insertError);
    return 0;
  }

  const revenueId = inserted?.id;

  // Use net amount if available, otherwise gross amount
  const creditAmount = event.netAmount ?? event.amount;

  // 2. Add to fund via the add_to_fund SQL function (atomic balance update + transaction log)
  const { data: newBalance, error: rpcError } = await supabase.rpc('add_to_fund', {
    p_user_id: userId,
    p_amount: creditAmount,
    p_type: 'revenue',
    p_description: `${event.platform} ${event.revenueType}: $${event.amount.toFixed(2)}${event.subscriberName ? ` from ${event.subscriberName}` : ''}`,
    p_reference_id: revenueId || null,
  });

  if (rpcError) {
    console.error('[FinancialEngine] Error adding revenue to fund:', rpcError);
    return 0;
  }

  return Number(newBalance) || 0;
}

// ============================================
// FINANCIAL CONSEQUENCES
// ============================================

/**
 * Execute a financial consequence (penalty deduction).
 *
 * Deduction order:
 *   1. Deduct from Maxy Fund balance (preferred)
 *   2. If fund is insufficient, create a pending Stripe charge record
 *
 * Respects the monthly penalty limit. If the limit would be exceeded,
 * the consequence is capped at the remaining allowance. If the allowance
 * is already exhausted, a warning is logged but no deduction occurs.
 */
export async function executeConsequence(
  userId: string,
  amount: number,
  reason: string
): Promise<void> {
  if (amount <= 0) return;

  // 1. Ensure monthly reset and check limit
  const monthlyUsed = await ensureMonthlyPenaltyReset(userId);
  const fund = await getFund(userId);

  if (!fund) {
    console.warn('[FinancialEngine] No fund record for user, skipping consequence:', userId);
    return;
  }

  const remainingAllowance = Math.max(0, fund.monthlyPenaltyLimit - monthlyUsed);

  if (remainingAllowance <= 0) {
    console.warn(
      `[FinancialEngine] Monthly penalty limit reached ($${fund.monthlyPenaltyLimit}). Consequence skipped for: ${reason}`
    );
    // Log a record with status 'limit_reached' for audit trail
    await supabase.from('financial_consequences').insert({
      user_id: userId,
      trigger_reason: reason,
      amount_cents: Math.round(amount * 100),
      currency: 'usd',
      status: 'limit_reached',
      error_message: `Monthly penalty limit of $${fund.monthlyPenaltyLimit} reached. Used: $${monthlyUsed.toFixed(2)}`,
    });
    return;
  }

  // Cap the amount to the remaining monthly allowance
  const effectiveAmount = Math.min(amount, remainingAllowance);

  // 2. Determine how much comes from fund vs. external charge
  const fromFund = Math.min(effectiveAmount, fund.balance);
  const fromStripe = effectiveAmount - fromFund;

  // 3. Deduct from fund if there's balance available
  if (fromFund > 0) {
    const { error: rpcError } = await supabase.rpc('add_to_fund', {
      p_user_id: userId,
      p_amount: -fromFund,
      p_type: 'penalty',
      p_description: `Consequence: ${reason} (from fund)`,
      p_reference_id: null,
    });

    if (rpcError) {
      console.error('[FinancialEngine] Error deducting penalty from fund:', rpcError);
    }
  }

  // 4. If fund was insufficient, create a pending Stripe charge record
  if (fromStripe > 0) {
    await supabase.from('financial_consequences').insert({
      user_id: userId,
      trigger_reason: reason,
      amount_cents: Math.round(fromStripe * 100),
      currency: 'usd',
      status: 'pending',
      error_message: null,
    });

    // Also log the intent in fund_transactions for visibility
    await supabase.from('fund_transactions').insert({
      user_id: userId,
      transaction_type: 'stripe_charge',
      amount: -fromStripe,
      description: `Pending Stripe charge: ${reason}`,
      reference_id: null,
      reference_type: 'financial_consequence',
      balance_after: Math.max(0, fund.balance - fromFund),
    });
  }

  // 5. Update monthly penalty counter
  await incrementMonthlyPenalties(userId, effectiveAmount);

  // 6. Log the consequence record (for the fund portion too, if any)
  if (fromFund > 0) {
    await supabase.from('financial_consequences').insert({
      user_id: userId,
      trigger_reason: reason,
      amount_cents: Math.round(fromFund * 100),
      currency: 'usd',
      status: 'completed',
      processed_at: new Date().toISOString(),
    });
  }
}

// ============================================
// BLEEDING (continuous financial penalty)
// ============================================

/**
 * Start continuous financial bleeding.
 * Updates compliance_state to mark bleeding as active with the given rate.
 *
 * @param ratePerMinute - Dollars per minute to bleed (default: $0.25/min)
 */
export async function startBleeding(
  userId: string,
  ratePerMinute: number = 0.25
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('compliance_state')
    .update({
      bleeding_active: true,
      bleeding_started_at: now,
      bleeding_rate_per_minute: ratePerMinute,
      updated_at: now,
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[FinancialEngine] Error starting bleeding:', error);
  }
}

/**
 * Stop continuous financial bleeding and return the total amount bled.
 * Processes any outstanding bleeding before stopping.
 */
export async function stopBleeding(userId: string): Promise<{ totalBled: number }> {
  // Process any outstanding bleeding first
  const finalBledAmount = await processBleeding(userId);

  // Get today's total for the return value
  const { data: state } = await supabase
    .from('compliance_state')
    .select('bleeding_total_today')
    .eq('user_id', userId)
    .single();

  const totalBled = Number(state?.bleeding_total_today || 0) + finalBledAmount;

  // Stop bleeding
  const { error } = await supabase
    .from('compliance_state')
    .update({
      bleeding_active: false,
      bleeding_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[FinancialEngine] Error stopping bleeding:', error);
  }

  return { totalBled };
}

/**
 * Process accumulated bleeding since last check.
 * Called by cron jobs or polling. Calculates elapsed time since bleeding
 * started (or last check) and deducts the appropriate amount from the fund.
 *
 * Returns the amount deducted in this processing cycle.
 */
export async function processBleeding(userId: string): Promise<number> {
  // 1. Get compliance state
  const { data: state, error: stateError } = await supabase
    .from('compliance_state')
    .select('bleeding_active, bleeding_started_at, bleeding_rate_per_minute, bleeding_total_today, last_compliance_check')
    .eq('user_id', userId)
    .single();

  if (stateError || !state || !state.bleeding_active || !state.bleeding_started_at) {
    return 0;
  }

  const now = new Date();
  const ratePerMinute = Number(state.bleeding_rate_per_minute) || 0.25;

  // Calculate from the later of: bleeding_started_at or last_compliance_check
  const bleedingStart = new Date(state.bleeding_started_at);
  const lastCheck = state.last_compliance_check
    ? new Date(state.last_compliance_check)
    : bleedingStart;

  // Use the more recent of the two as our calculation start point
  const calcStart = lastCheck > bleedingStart ? lastCheck : bleedingStart;
  const elapsedMs = now.getTime() - calcStart.getTime();
  const elapsedMinutes = elapsedMs / (1000 * 60);

  if (elapsedMinutes < 0.5) {
    // Less than 30 seconds elapsed, skip this cycle
    return 0;
  }

  const bleedAmount = Math.round(elapsedMinutes * ratePerMinute * 100) / 100;

  if (bleedAmount <= 0) return 0;

  // 2. Check monthly limit before bleeding
  const monthlyUsed = await ensureMonthlyPenaltyReset(userId);
  const fund = await getFund(userId);

  if (!fund) return 0;

  const remainingAllowance = Math.max(0, fund.monthlyPenaltyLimit - monthlyUsed);

  if (remainingAllowance <= 0) {
    // Monthly limit reached -- stop bleeding automatically
    await stopBleeding(userId);
    console.warn('[FinancialEngine] Monthly limit reached during bleeding, auto-stopped.');
    return 0;
  }

  const effectiveBleed = Math.min(bleedAmount, remainingAllowance);

  // 3. Deduct via add_to_fund
  const { data: newBalance, error: rpcError } = await supabase.rpc('add_to_fund', {
    p_user_id: userId,
    p_amount: -effectiveBleed,
    p_type: 'bleeding',
    p_description: `Bleeding: ${elapsedMinutes.toFixed(1)} min @ $${ratePerMinute.toFixed(2)}/min`,
    p_reference_id: null,
  });

  if (rpcError) {
    console.error('[FinancialEngine] Error processing bleeding deduction:', rpcError);
    return 0;
  }

  // 4. Update compliance_state checkpoint and daily total
  const currentDailyTotal = Number(state.bleeding_total_today) || 0;

  await supabase
    .from('compliance_state')
    .update({
      bleeding_total_today: currentDailyTotal + effectiveBleed,
      last_compliance_check: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId);

  // 5. Update monthly penalty counter
  await incrementMonthlyPenalties(userId, effectiveBleed);

  // 6. If fund goes negative / hits zero, stop bleeding and create pending charge
  const resultBalance = Number(newBalance) || 0;
  if (resultBalance <= 0) {
    await stopBleeding(userId);

    // If the deduction took the fund below zero, record the overage as a pending Stripe charge
    if (resultBalance < 0) {
      const overage = Math.abs(resultBalance);
      await supabase.from('financial_consequences').insert({
        user_id: userId,
        trigger_reason: 'Bleeding exceeded fund balance',
        amount_cents: Math.round(overage * 100),
        currency: 'usd',
        status: 'pending',
      });

      // Correct the fund balance to zero (the overage is tracked as pending Stripe)
      await supabase.rpc('add_to_fund', {
        p_user_id: userId,
        p_amount: overage,
        p_type: 'stripe_charge',
        p_description: 'Balance correction: overage moved to pending Stripe charge',
        p_reference_id: null,
      });
    }
  }

  return effectiveBleed;
}

// ============================================
// FUND ALLOCATION (weekly)
// ============================================

/**
 * Weekly fund allocation.
 * Distributes available balance according to rules:
 *   1. Reserve percentage held back for future consequences
 *   2. Approved feminization purchases are funded
 *   3. Remaining above payout threshold becomes pending payout
 *
 * This should be called by a weekly cron job.
 */
export async function allocateFunds(userId: string): Promise<void> {
  const fund = await getFund(userId);
  if (!fund || fund.balance <= 0) return;

  const availableBalance = fund.balance;

  // 1. Reserve allocation
  const reserveAmount = Math.round(availableBalance * fund.reservePercentage * 100) / 100;
  const afterReserve = availableBalance - reserveAmount;

  if (afterReserve <= 0) {
    // Entire balance is reserved
    return;
  }

  // 2. Process approved feminization purchases
  const { data: approvedPurchases } = await supabase
    .from('feminization_purchases')
    .select('id, amount, item_description, priority')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .order('priority', { ascending: true }) // priority 1 = most urgent
    .order('created_at', { ascending: true });

  let remainingBudget = afterReserve;

  if (approvedPurchases && approvedPurchases.length > 0) {
    for (const purchase of approvedPurchases) {
      const purchaseAmount = Number(purchase.amount) || 0;

      if (purchaseAmount <= 0) continue;
      if (purchaseAmount > remainingBudget) continue; // Skip if can't afford

      // Deduct from fund
      const { error: rpcError } = await supabase.rpc('add_to_fund', {
        p_user_id: userId,
        p_amount: -purchaseAmount,
        p_type: 'feminization_purchase',
        p_description: `Purchase: ${purchase.item_description}`,
        p_reference_id: purchase.id,
      });

      if (rpcError) {
        console.error('[FinancialEngine] Error funding feminization purchase:', rpcError);
        continue;
      }

      // Update purchase status to ordered
      await supabase
        .from('feminization_purchases')
        .update({
          status: 'ordered',
          purchased_at: new Date().toISOString(),
        })
        .eq('id', purchase.id);

      remainingBudget -= purchaseAmount;

      if (remainingBudget <= 0) break;
    }
  }

  // 3. Payout allocation -- if remaining balance exceeds threshold
  if (remainingBudget > 0) {
    // Re-fetch fund to get current balance after purchases
    const updatedFund = await getFund(userId);
    if (!updatedFund) return;

    const currentBalance = updatedFund.balance;
    const payoutEligible = currentBalance - reserveAmount;

    if (payoutEligible > fund.payoutThreshold) {
      // Calculate payout: everything above the threshold + reserve
      const payoutAmount = payoutEligible - fund.payoutThreshold;

      if (payoutAmount > 0) {
        // Add to pending payout (actual disbursement handled externally)
        await supabase
          .from('maxy_fund')
          .update({
            pending_payout: (updatedFund.pendingPayout || 0) + payoutAmount,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      }
    }
  }

  // 4. Log the allocation decision
  await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'fund_allocation',
    decision_data: {
      available_balance: availableBalance,
      reserve_amount: reserveAmount,
      purchases_funded: approvedPurchases?.filter(p =>
        // Re-check which ones were actually funded above
        Number(p.amount) <= afterReserve
      ).length || 0,
      remaining_after_purchases: remainingBudget,
      payout_threshold: fund.payoutThreshold,
    },
    reasoning: `Weekly fund allocation: $${availableBalance.toFixed(2)} available, $${reserveAmount.toFixed(2)} reserved (${(fund.reservePercentage * 100).toFixed(0)}%)`,
    executed: true,
    executed_at: new Date().toISOString(),
  });
}

// ============================================
// EARNINGS QUERIES
// ============================================

/**
 * Get total earnings for today.
 */
export async function getTodayEarnings(userId: string): Promise<number> {
  const today = getTodayDate();

  const { data, error } = await supabase
    .from('revenue_events')
    .select('amount')
    .eq('user_id', userId)
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);

  if (error || !data) return 0;

  return data.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

/**
 * Get an earnings summary over the specified number of days.
 * Provides total revenue broken down by platform and by revenue type.
 */
export async function getEarningsSummary(
  userId: string,
  days: number = 30
): Promise<EarningsSummary> {
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('revenue_events')
    .select('amount, platform, revenue_type')
    .eq('user_id', userId)
    .gte('created_at', sinceDate);

  if (error || !data) {
    return { total: 0, byPlatform: {}, byType: {} };
  }

  let total = 0;
  const byPlatform: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const row of data) {
    const amount = Number(row.amount) || 0;
    total += amount;

    const platform = row.platform || 'unknown';
    byPlatform[platform] = (byPlatform[platform] || 0) + amount;

    const revenueType = row.revenue_type || 'unknown';
    byType[revenueType] = (byType[revenueType] || 0) + amount;
  }

  return { total, byPlatform, byType };
}

// ============================================
// UTILITY EXPORTS
// ============================================

/**
 * Get pending financial consequences that need Stripe processing.
 */
export async function getPendingConsequences(userId: string): Promise<FinancialConsequenceRecord[]> {
  const { data, error } = await supabase
    .from('financial_consequences')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    triggerReason: row.trigger_reason,
    amountCents: row.amount_cents,
    currency: row.currency,
    targetOrg: row.target_org,
    status: row.status,
    stripePaymentId: row.stripe_payment_id,
    processedAt: row.processed_at,
    errorMessage: row.error_message,
    enforcementTier: row.enforcement_tier,
    consecutiveDaysNoncompliant: row.consecutive_days_noncompliant,
    createdAt: row.created_at,
  }));
}

/**
 * Mark a pending consequence as completed after Stripe processes it.
 */
export async function markConsequenceCompleted(
  consequenceId: string,
  stripePaymentId: string
): Promise<void> {
  await supabase
    .from('financial_consequences')
    .update({
      status: 'completed',
      stripe_payment_id: stripePaymentId,
      processed_at: new Date().toISOString(),
    })
    .eq('id', consequenceId);
}

/**
 * Mark a pending consequence as failed.
 */
export async function markConsequenceFailed(
  consequenceId: string,
  errorMessage: string
): Promise<void> {
  await supabase
    .from('financial_consequences')
    .update({
      status: 'failed',
      error_message: errorMessage,
      processed_at: new Date().toISOString(),
    })
    .eq('id', consequenceId);
}

/**
 * Get a snapshot of the financial state for dashboard/reporting.
 */
export async function getFinancialSnapshot(userId: string): Promise<{
  fund: MaxyFund | null;
  todayEarnings: number;
  weekSummary: EarningsSummary;
  monthSummary: EarningsSummary;
  pendingConsequences: number;
  isBleedingActive: boolean;
  recentTransactions: FundTransaction[];
}> {
  const [fund, todayEarnings, weekSummary, monthSummary, pending, complianceState, recentTx] =
    await Promise.all([
      getFund(userId),
      getTodayEarnings(userId),
      getEarningsSummary(userId, 7),
      getEarningsSummary(userId, 30),
      getPendingConsequences(userId),
      supabase
        .from('compliance_state')
        .select('bleeding_active')
        .eq('user_id', userId)
        .single(),
      getTransactionHistory(userId, 10),
    ]);

  return {
    fund,
    todayEarnings,
    weekSummary,
    monthSummary,
    pendingConsequences: pending.length,
    isBleedingActive: complianceState.data?.bleeding_active || false,
    recentTransactions: recentTx,
  };
}
