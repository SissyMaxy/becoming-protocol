/**
 * Auto-Purchase Engine — Item 7
 *
 * Daily fund balance check + threshold-based auto-purchasing.
 * When the Maxy fund exceeds the threshold, buys the next item
 * from the feminization wishlist. Investment logging for sunk cost ratchet.
 */

import { supabase } from '../supabase';

interface FundBalance {
  balance: number;
  totalInvested: number;
  lastPurchaseAt: string | null;
}

/**
 * Get current Maxy fund balance.
 */
export async function getFundBalance(userId: string): Promise<FundBalance> {
  const { data: transactions } = await supabase
    .from('fund_transactions')
    .select('amount, transaction_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!transactions) return { balance: 0, totalInvested: 0, lastPurchaseAt: null };

  let balance = 0;
  let totalInvested = 0;
  let lastPurchaseAt: string | null = null;

  for (const t of transactions) {
    balance += t.amount; // Positive = deposit, negative = purchase
    if (t.amount < 0) {
      totalInvested += Math.abs(t.amount);
      if (!lastPurchaseAt) lastPurchaseAt = t.created_at;
    }
  }

  return { balance, totalInvested, lastPurchaseAt };
}

/**
 * Check if auto-purchase should trigger and execute it.
 */
export async function checkAndPurchase(userId: string): Promise<{
  purchased: boolean;
  item?: string;
  amount?: number;
  newBalance?: number;
}> {
  const fund = await getFundBalance(userId);

  // Get purchase threshold from parameters (default $25)
  const { data: thresholdParam } = await supabase
    .from('handler_parameters')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'purchasing.auto_threshold')
    .maybeSingle();

  const threshold = thresholdParam?.value ?? 25;

  if (fund.balance < threshold) {
    return { purchased: false };
  }

  // Get next item from wishlist (highest priority, not yet purchased)
  const { data: nextItem } = await supabase
    .from('feminization_wishlist')
    .select('id, name, price, category, url')
    .eq('user_id', userId)
    .eq('purchased', false)
    .lte('price', fund.balance) // Can afford it
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextItem) {
    return { purchased: false };
  }

  // Execute purchase
  // 1. Deduct from fund
  await supabase.from('fund_transactions').insert({
    user_id: userId,
    amount: -nextItem.price,
    transaction_type: 'auto_purchase',
    description: `Auto-purchased: ${nextItem.name}`,
    reference_id: nextItem.id,
  });

  // 2. Mark wishlist item as purchased
  await supabase.from('feminization_wishlist').update({
    purchased: true,
    purchased_at: new Date().toISOString(),
    purchase_method: 'auto',
  }).eq('id', nextItem.id);

  // 3. Log investment for sunk cost tracking
  await supabase.from('feminization_purchases').insert({
    user_id: userId,
    item_name: nextItem.name,
    category: nextItem.category,
    amount: nextItem.price,
    purchase_url: nextItem.url,
    auto_purchased: true,
  });

  const newBalance = fund.balance - nextItem.price;

  return {
    purchased: true,
    item: nextItem.name,
    amount: nextItem.price,
    newBalance,
  };
}

/**
 * Build investment context for the Handler (sunk cost ratchet).
 */
export async function buildInvestmentContext(userId: string): Promise<string> {
  const fund = await getFundBalance(userId);

  if (fund.totalInvested === 0) return '';

  const { count: itemCount } = await supabase
    .from('feminization_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const lines = ['## Feminization Investment'];
  lines.push(`Total invested: $${fund.totalInvested.toFixed(2)}`);
  lines.push(`Items purchased: ${itemCount || 0}`);
  lines.push(`Current fund balance: $${fund.balance.toFixed(2)}`);

  if (fund.lastPurchaseAt) {
    const daysAgo = Math.round((Date.now() - new Date(fund.lastPurchaseAt).getTime()) / 86400000);
    lines.push(`Last purchase: ${daysAgo} day(s) ago`);
  }

  return lines.join('\n');
}
