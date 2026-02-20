/**
 * Sexting — GFE Subscription Management
 *
 * Girlfriend Experience: scheduled messages, recurring revenue.
 * Handler generates morning/goodnight messages automatically.
 */

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type { GfeSubscription, GfeTier } from '../../types/sexting';
import { mapGfeSubscription } from '../../types/sexting';

// ── Create GFE subscription ────────────────────────────

export async function createGfeSubscription(
  userId: string,
  fanId: string,
  platform: string,
  tier: GfeTier,
  priceCents: number
): Promise<GfeSubscription | null> {
  const { data, error } = await supabase
    .from('gfe_subscriptions')
    .insert({
      user_id: userId,
      fan_id: fanId,
      platform,
      tier,
      price_cents: priceCents,
      status: 'active',
      morning_message: true,
      goodnight_message: true,
      weekly_photo: tier === 'vip',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[sexting] createGfeSubscription error:', error);
    return null;
  }

  // Mark fan as GFE subscriber
  await supabase
    .from('fan_profiles')
    .update({
      gfe_subscriber: true,
      gfe_started_at: new Date().toISOString(),
      fan_tier: 'gfe',
    })
    .eq('id', fanId);

  return mapGfeSubscription(data as Record<string, unknown>);
}

// ── Get active GFE subscriptions ───────────────────────

export async function getActiveGfeSubscriptions(userId: string): Promise<GfeSubscription[]> {
  const { data, error } = await supabase
    .from('gfe_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []).map((r) => mapGfeSubscription(r as Record<string, unknown>));
}

// ── Generate scheduled message ─────────────────────────

export async function generateScheduledMessage(
  subscription: GfeSubscription,
  type: 'morning' | 'goodnight'
): Promise<string | null> {
  // Get fan info for personalization
  const { data: fan } = await supabase
    .from('fan_profiles')
    .select('username, display_name, personality_model')
    .eq('id', subscription.fan_id)
    .single();

  if (!fan) return null;

  const name = (fan.display_name as string) || (fan.username as string);
  const nickname = subscription.custom_nickname || name;

  // AI generates personalized message
  const { data: aiResult } = await invokeWithAuth('handler-ai', {
    action: 'generate_gfe_message',
    type,
    fan: {
      name: nickname,
      personality: fan.personality_model,
      tier: subscription.tier,
    },
  });

  const result = aiResult as Record<string, unknown> | null;
  const message = result?.message as string;

  if (!message) return null;

  // Create the scheduled message
  await supabase.from('fan_messages').insert({
    user_id: subscription.user_id,
    fan_id: subscription.fan_id,
    platform: subscription.platform,
    direction: 'outbound',
    message_text: message,
    handler_draft: message,
    approval_status: 'auto',
    auto_sent: true,
    ai_confidence: 1.0,
    message_type: 'gfe_scheduled',
    sent_at: new Date().toISOString(),
  });

  return message;
}

// ── Process GFE schedule (run for all active subs) ─────

export async function processGfeSchedule(
  userId: string,
  type: 'morning' | 'goodnight'
): Promise<number> {
  const subs = await getActiveGfeSubscriptions(userId);
  let sent = 0;

  for (const sub of subs) {
    if (type === 'morning' && !sub.morning_message) continue;
    if (type === 'goodnight' && !sub.goodnight_message) continue;

    const msg = await generateScheduledMessage(sub, type);
    if (msg) sent++;
  }

  return sent;
}

// ── Cancel subscription ─────────────────────────────────

export async function cancelGfeSubscription(subscriptionId: string): Promise<void> {
  const { data: sub } = await supabase
    .from('gfe_subscriptions')
    .select('fan_id')
    .eq('id', subscriptionId)
    .single();

  await supabase
    .from('gfe_subscriptions')
    .update({ status: 'cancelled' })
    .eq('id', subscriptionId);

  if (sub) {
    // Check if fan has other active GFE subs
    const { count } = await supabase
      .from('gfe_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('fan_id', sub.fan_id as string)
      .eq('status', 'active');

    if (!count || count === 0) {
      await supabase
        .from('fan_profiles')
        .update({ gfe_subscriber: false })
        .eq('id', sub.fan_id as string);
    }
  }
}

// ── GFE revenue summary ────────────────────────────────

export async function getGfeRevenueSummary(userId: string): Promise<{
  activeCount: number;
  monthlyRevenueCents: number;
  totalRevenueCents: number;
}> {
  const subs = await getActiveGfeSubscriptions(userId);
  const monthlyRevenueCents = subs.reduce((sum, s) => sum + s.price_cents, 0);

  // Total historical revenue from all GFE subs
  const { data: allSubs } = await supabase
    .from('gfe_subscriptions')
    .select('price_cents, started_at, status')
    .eq('user_id', userId);

  let totalRevenueCents = 0;
  if (allSubs) {
    for (const s of allSubs) {
      const months = Math.max(1, Math.ceil(
        (Date.now() - new Date(s.started_at as string).getTime()) / (30 * 86400000)
      ));
      totalRevenueCents += (s.price_cents as number) * months;
    }
  }

  return {
    activeCount: subs.length,
    monthlyRevenueCents,
    totalRevenueCents,
  };
}
