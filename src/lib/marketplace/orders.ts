/**
 * Marketplace — Order Lifecycle
 *
 * Fan purchases → Handler routes into protocol task system.
 * David doesn't know which tasks are paid vs organic.
 */

import { supabase } from '../supabase';
import type { TaskOrder } from '../../types/marketplace';
import { mapOrder } from '../../types/marketplace';
import { incrementOrdersFilled } from './listings';

// ── Create order ────────────────────────────────────────

export async function createOrder(
  userId: string,
  listingId: string,
  fanId: string,
  amountCents: number,
  platform: string,
  specialInstructions?: string
): Promise<TaskOrder | null> {
  const { data, error } = await supabase
    .from('task_orders')
    .insert({
      user_id: userId,
      listing_id: listingId,
      fan_id: fanId,
      amount_cents: amountCents,
      platform,
      special_instructions: specialInstructions || null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[marketplace] createOrder error:', error);
    return null;
  }

  // Increment listing's orders_filled
  await incrementOrdersFilled(listingId);

  return mapOrder(data as Record<string, unknown>);
}

// ── Accept order (Handler routes to task system) ────────

export async function acceptOrder(
  orderId: string,
  internalTaskCode?: string
): Promise<void> {
  await supabase
    .from('task_orders')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      internal_task_code: internalTaskCode || null,
    })
    .eq('id', orderId);
}

// ── Mark order in progress ──────────────────────────────

export async function startOrder(orderId: string): Promise<void> {
  await supabase
    .from('task_orders')
    .update({ status: 'in_progress' })
    .eq('id', orderId);
}

// ── Complete order (attach content) ─────────────────────

export async function completeOrder(
  orderId: string,
  deliveryVaultId?: string
): Promise<void> {
  await supabase
    .from('task_orders')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      delivery_vault_id: deliveryVaultId || null,
    })
    .eq('id', orderId);
}

// ── Deliver order to fan ────────────────────────────────

export async function deliverOrder(orderId: string): Promise<void> {
  await supabase
    .from('task_orders')
    .update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    })
    .eq('id', orderId);
}

// ── Cancel / refund order ───────────────────────────────

export async function cancelOrder(orderId: string): Promise<void> {
  await supabase
    .from('task_orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId);
}

export async function refundOrder(orderId: string): Promise<void> {
  await supabase
    .from('task_orders')
    .update({ status: 'refunded' })
    .eq('id', orderId);
}

// ── Get orders by status ────────────────────────────────

export async function getActiveOrders(userId: string): Promise<TaskOrder[]> {
  const { data, error } = await supabase
    .from('task_orders')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'accepted', 'in_progress', 'completed'])
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []).map((r) => mapOrder(r as Record<string, unknown>));
}

export async function getPendingOrders(userId: string): Promise<TaskOrder[]> {
  const { data, error } = await supabase
    .from('task_orders')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []).map((r) => mapOrder(r as Record<string, unknown>));
}

// ── Order stats ─────────────────────────────────────────

export async function getOrderStats(userId: string): Promise<{
  pending: number;
  pendingRevenueCents: number;
  completed: number;
  delivered: number;
  totalRevenueCents: number;
  avgOrderCents: number;
}> {
  const { data } = await supabase
    .from('task_orders')
    .select('status, amount_cents')
    .eq('user_id', userId);

  if (!data) return { pending: 0, pendingRevenueCents: 0, completed: 0, delivered: 0, totalRevenueCents: 0, avgOrderCents: 0 };

  const pending = data.filter((r) => r.status === 'pending');
  const completed = data.filter((r) => r.status === 'completed' || r.status === 'delivered');
  const delivered = data.filter((r) => r.status === 'delivered');

  const pendingRevenueCents = pending.reduce((s, r) => s + (r.amount_cents as number), 0);
  const totalRevenueCents = completed.reduce((s, r) => s + (r.amount_cents as number), 0);
  const avgOrderCents = completed.length > 0 ? Math.round(totalRevenueCents / completed.length) : 0;

  return {
    pending: pending.length,
    pendingRevenueCents,
    completed: completed.length,
    delivered: delivered.length,
    totalRevenueCents,
    avgOrderCents,
  };
}
