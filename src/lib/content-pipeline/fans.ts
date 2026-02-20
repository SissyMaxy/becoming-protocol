/**
 * Content Pipeline — Fans
 *
 * Fan profiles, tier classification, message drafting.
 * Handler manages all fan interactions. David never reads DMs.
 */

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type { FanProfile, FanTier, FanMessage } from '../../types/content-pipeline';

// ── Tier thresholds ─────────────────────────────────────

function calculateTier(totalSpent: number, engagementScore: number): FanTier {
  if (totalSpent >= 10000 || engagementScore >= 90) return 'whale';     // $100+
  if (totalSpent >= 3000 || engagementScore >= 60) return 'supporter';  // $30+
  if (totalSpent >= 500 || engagementScore >= 30) return 'regular';     // $5+
  return 'casual';
}

// ── Upsert fan profile ──────────────────────────────────

export async function upsertFan(
  userId: string,
  fan: {
    platform: FanProfile['platform'];
    username: string;
    display_name?: string;
    spent_cents?: number;
    message_count?: number;
    tip_count?: number;
  }
): Promise<FanProfile | null> {
  // Check if fan exists
  const { data: existing } = await supabase
    .from('fan_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', fan.platform)
    .eq('username', fan.username)
    .single();

  if (existing) {
    const totalSpent = (existing.total_spent_cents as number) + (fan.spent_cents || 0);
    const msgCount = (existing.message_count as number) + (fan.message_count || 0);
    const tipCount = (existing.tip_count as number) + (fan.tip_count || 0);
    const engagement = Math.min(100, tipCount * 5 + msgCount * 2 + totalSpent / 100);
    const tier = calculateTier(totalSpent, engagement);

    const { data, error } = await supabase
      .from('fan_profiles')
      .update({
        display_name: fan.display_name || existing.display_name,
        total_spent_cents: totalSpent,
        message_count: msgCount,
        tip_count: tipCount,
        engagement_score: engagement,
        fan_tier: tier,
        last_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      console.error('[fans] upsertFan update error:', error);
      return null;
    }
    return data as FanProfile;
  }

  // New fan
  const totalSpent = fan.spent_cents || 0;
  const msgCount = fan.message_count || 0;
  const tipCount = fan.tip_count || 0;
  const engagement = Math.min(100, tipCount * 5 + msgCount * 2 + totalSpent / 100);
  const tier = calculateTier(totalSpent, engagement);

  const { data, error } = await supabase
    .from('fan_profiles')
    .insert({
      user_id: userId,
      platform: fan.platform,
      username: fan.username,
      display_name: fan.display_name || null,
      total_spent_cents: totalSpent,
      message_count: msgCount,
      tip_count: tipCount,
      engagement_score: engagement,
      fan_tier: tier,
      last_interaction_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    console.error('[fans] upsertFan insert error:', error);
    return null;
  }
  return data as FanProfile;
}

// ── Get top fans ────────────────────────────────────────

export async function getTopFans(userId: string, limit = 20): Promise<FanProfile[]> {
  const { data, error } = await supabase
    .from('fan_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('engagement_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[fans] getTopFans error:', error);
    return [];
  }
  return (data || []) as FanProfile[];
}

// ── Get fans by tier ────────────────────────────────────

export async function getFansByTier(userId: string, tier: FanTier): Promise<FanProfile[]> {
  const { data, error } = await supabase
    .from('fan_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('fan_tier', tier)
    .order('engagement_score', { ascending: false });

  if (error) return [];
  return (data || []) as FanProfile[];
}

// ── Draft fan message (AI in Maxy's voice) ──────────────

export async function draftFanMessage(
  userId: string,
  fanId: string,
  inboundMessage: string
): Promise<FanMessage | null> {
  // Get fan context
  const { data: fan } = await supabase
    .from('fan_profiles')
    .select('*')
    .eq('id', fanId)
    .eq('user_id', userId)
    .single();

  if (!fan) return null;

  // AI drafts response
  const { data: aiResult } = await invokeWithAuth('handler-ai', {
    action: 'draft_fan_message',
    fan: {
      username: fan.username,
      tier: fan.fan_tier,
      total_spent: fan.total_spent_cents,
      platform: fan.platform,
    },
    inbound_message: inboundMessage,
  });

  const draft = (aiResult && typeof aiResult === 'object')
    ? (aiResult as Record<string, unknown>).draft as string || 'Thanks for the message! 💕'
    : 'Thanks for the message! 💕';

  // Create message record
  const { data: msg, error } = await supabase
    .from('fan_messages')
    .insert({
      user_id: userId,
      fan_id: fanId,
      platform: fan.platform as string,
      direction: 'outbound',
      message_text: inboundMessage,
      handler_draft: draft,
      approval_status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[fans] draftFanMessage error:', error);
    return null;
  }

  return msg as FanMessage;
}

// ── Get pending messages ────────────────────────────────

export async function getPendingMessages(userId: string): Promise<FanMessage[]> {
  const { data, error } = await supabase
    .from('fan_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []) as FanMessage[];
}

// ── Fan count ───────────────────────────────────────────

export async function getFanCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('fan_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return 0;
  return count || 0;
}
