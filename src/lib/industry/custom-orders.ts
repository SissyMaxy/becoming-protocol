/**
 * Custom Orders — Sprint 6 Items 21-22
 * processCustomInquiry: Handler evaluates fan request, quotes price
 * fulfillCustomOrder: Creates shoot prescription, manages delivery
 */

import { supabase } from '../supabase';
import type {
  CustomOrder,
  CustomOrderStatus,
  DbCustomOrder,
} from '../../types/industry';
import { mapCustomOrder } from '../../types/industry';

// ============================================
// Pricing Configuration
// ============================================

const BASE_PRICES: Record<string, number> = {
  photo_set: 2500,       // $25
  short_video: 3500,     // $35
  cage_check: 1500,      // $15
  outfit_request: 2000,  // $20
  edge_capture: 4000,    // $40
  tease_video: 3000,     // $30
  custom_scenario: 5000, // $50
  voice_clip: 1500,      // $15
};

const COMPLEXITY_MULTIPLIERS: Record<string, number> = {
  simple: 1.0,
  moderate: 1.5,
  complex: 2.0,
  premium: 3.0,
};

// ============================================
// Process Custom Inquiry
// ============================================

/**
 * Handler evaluates a custom content request from a fan.
 * Returns the order with evaluation and price quote.
 */
export async function processCustomInquiry(
  userId: string,
  inquiry: {
    fanUsername: string;
    platform: string;
    inquiryText: string;
  },
): Promise<CustomOrder | null> {
  // Evaluate the inquiry
  const evaluation = evaluateInquiry(inquiry.inquiryText);
  const quotedPrice = calculatePrice(evaluation.contentType, evaluation.complexity);

  const { data, error } = await supabase
    .from('custom_orders')
    .insert({
      user_id: userId,
      fan_username: inquiry.fanUsername,
      platform: inquiry.platform,
      inquiry_text: inquiry.inquiryText,
      handler_evaluation: evaluation.evaluation,
      quoted_price_cents: quotedPrice,
      delivery_status: 'quoted',
    })
    .select()
    .single();

  if (error || !data) return null;
  return mapCustomOrder(data as DbCustomOrder);
}

/**
 * Accept a custom order — creates a shoot prescription.
 */
export async function acceptCustomOrder(
  userId: string,
  orderId: string,
): Promise<CustomOrder | null> {
  // Get the order
  const { data: order } = await supabase
    .from('custom_orders')
    .select('*')
    .eq('user_id', userId)
    .eq('id', orderId)
    .single();

  if (!order) return null;

  // Create shoot prescription
  const evaluation = evaluateInquiry(order.inquiry_text);
  const { data: prescription } = await supabase
    .from('shoot_prescriptions')
    .insert({
      user_id: userId,
      title: `Custom: ${order.fan_username || 'fan'} — ${evaluation.contentType}`,
      shoot_type: evaluation.shootType,
      outfit: evaluation.outfit || 'per request',
      handler_note: `Custom order from ${order.fan_username}. Request: "${order.inquiry_text}". Price: $${(order.quoted_price_cents / 100).toFixed(0)}`,
      estimated_minutes: evaluation.estimatedMinutes,
      primary_platform: order.platform || 'onlyfans',
      status: 'prescribed',
    })
    .select('id')
    .single();

  // Update order status
  const { data: updated, error } = await supabase
    .from('custom_orders')
    .update({
      accepted: true,
      delivery_status: 'accepted',
      shoot_prescription_id: prescription?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error || !updated) return null;
  return mapCustomOrder(updated as DbCustomOrder);
}

/**
 * Mark a custom order as fulfilled and record revenue.
 */
export async function fulfillCustomOrder(
  userId: string,
  orderId: string,
  mediaPaths: string[],
): Promise<CustomOrder | null> {
  const { data, error } = await supabase
    .from('custom_orders')
    .update({
      delivery_status: 'delivered',
      delivered_at: new Date().toISOString(),
      media_paths: mediaPaths,
      revenue_cents: (await getOrderPrice(orderId)) ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', orderId)
    .select()
    .single();

  if (error || !data) return null;

  // Log revenue
  const order = mapCustomOrder(data as DbCustomOrder);
  if (order.revenueCents > 0) {
    await supabase.from('revenue_log').insert({
      user_id: userId,
      source: 'custom_order',
      amount_cents: order.revenueCents,
      platform: order.platform || 'onlyfans',
      details: { order_id: orderId, fan: order.fanUsername },
      created_at: new Date().toISOString(),
    });
  }

  return order;
}

/**
 * Cancel a custom order.
 */
export async function cancelCustomOrder(
  userId: string,
  orderId: string,
  reason?: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('custom_orders')
    .update({
      delivery_status: 'cancelled',
      notes: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', orderId);

  return !error;
}

/**
 * Update order status through the pipeline.
 */
export async function updateOrderStatus(
  userId: string,
  orderId: string,
  newStatus: CustomOrderStatus,
): Promise<CustomOrder | null> {
  const { data, error } = await supabase
    .from('custom_orders')
    .update({
      delivery_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', orderId)
    .select()
    .single();

  if (error || !data) return null;
  return mapCustomOrder(data as DbCustomOrder);
}

// ============================================
// Query Functions
// ============================================

/**
 * Get all custom orders by status.
 */
export async function getCustomOrders(
  userId: string,
  status?: CustomOrderStatus,
): Promise<CustomOrder[]> {
  let query = supabase
    .from('custom_orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('delivery_status', status);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r: DbCustomOrder) => mapCustomOrder(r));
}

/**
 * Get active orders (not delivered or cancelled).
 */
export async function getActiveOrders(userId: string): Promise<CustomOrder[]> {
  const { data, error } = await supabase
    .from('custom_orders')
    .select('*')
    .eq('user_id', userId)
    .not('delivery_status', 'in', '("delivered","cancelled")')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map((r: DbCustomOrder) => mapCustomOrder(r));
}

/**
 * Get custom order revenue stats.
 */
export async function getCustomOrderStats(userId: string): Promise<{
  totalOrders: number;
  deliveredOrders: number;
  totalRevenueCents: number;
  avgOrderCents: number;
  pendingOrders: number;
}> {
  const { data } = await supabase
    .from('custom_orders')
    .select('delivery_status, revenue_cents')
    .eq('user_id', userId);

  if (!data) return { totalOrders: 0, deliveredOrders: 0, totalRevenueCents: 0, avgOrderCents: 0, pendingOrders: 0 };

  const delivered = data.filter(r => r.delivery_status === 'delivered');
  const totalRevenue = delivered.reduce((sum, r) => sum + (r.revenue_cents || 0), 0);
  const pending = data.filter(r => !['delivered', 'cancelled'].includes(r.delivery_status));

  return {
    totalOrders: data.length,
    deliveredOrders: delivered.length,
    totalRevenueCents: totalRevenue,
    avgOrderCents: delivered.length > 0 ? Math.round(totalRevenue / delivered.length) : 0,
    pendingOrders: pending.length,
  };
}

/**
 * Build context for Handler AI prompts.
 */
export async function buildCustomOrderContext(userId: string): Promise<string> {
  try {
    const active = await getActiveOrders(userId);
    if (active.length === 0) return '';

    const parts = [`CUSTOM ORDERS: ${active.length} active`];
    for (const order of active.slice(0, 3)) {
      parts.push(`  ${order.fanUsername || 'anon'} (${order.platform}): ${order.deliveryStatus} — $${((order.quotedPriceCents ?? 0) / 100).toFixed(0)}`);
    }
    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// Helpers
// ============================================

interface InquiryEvaluation {
  contentType: string;
  shootType: string;
  complexity: string;
  outfit: string | null;
  estimatedMinutes: number;
  evaluation: string;
}

function evaluateInquiry(inquiryText: string): InquiryEvaluation {
  const text = inquiryText.toLowerCase();

  // Detect content type
  let contentType = 'photo_set';
  let shootType = 'photo_set';
  let estimatedMinutes = 15;
  let complexity = 'simple';
  let outfit: string | null = null;

  if (text.includes('video') || text.includes('clip')) {
    contentType = 'short_video';
    shootType = 'short_video';
    estimatedMinutes = 10;
  }
  if (text.includes('cage') || text.includes('lock')) {
    contentType = 'cage_check';
    shootType = 'cage_check';
    estimatedMinutes = 5;
  }
  if (text.includes('tease') || text.includes('strip')) {
    contentType = 'tease_video';
    shootType = 'tease_video';
    estimatedMinutes = 15;
    complexity = 'moderate';
  }
  if (text.includes('edge') || text.includes('denial')) {
    contentType = 'edge_capture';
    shootType = 'edge_capture';
    estimatedMinutes = 20;
    complexity = 'moderate';
  }
  if (text.includes('voice') || text.includes('audio')) {
    contentType = 'voice_clip';
    estimatedMinutes = 10;
  }
  if (text.includes('outfit') || text.includes('lingerie') || text.includes('wear')) {
    contentType = 'outfit_request';
    shootType = 'outfit_of_day';
    outfit = 'per request';
  }
  if (text.includes('scenario') || text.includes('role') || text.includes('story')) {
    contentType = 'custom_scenario';
    complexity = 'complex';
    estimatedMinutes = 25;
  }

  const evaluation = `Content type: ${contentType}. Complexity: ${complexity}. Estimated time: ${estimatedMinutes}min. ${outfit ? `Outfit note: ${outfit}. ` : ''}Standard pricing applies.`;

  return { contentType, shootType, complexity, outfit, estimatedMinutes, evaluation };
}

function calculatePrice(contentType: string, complexity: string): number {
  const base = BASE_PRICES[contentType] ?? BASE_PRICES.photo_set;
  const multiplier = COMPLEXITY_MULTIPLIERS[complexity] ?? 1.0;
  return Math.round(base * multiplier);
}

async function getOrderPrice(orderId: string): Promise<number | null> {
  const { data } = await supabase
    .from('custom_orders')
    .select('quoted_price_cents')
    .eq('id', orderId)
    .single();

  return data?.quoted_price_cents ?? null;
}
