/**
 * Content Pipeline — Fans
 *
 * Fan profiles, tier classification, message drafting.
 * Handler manages all fan interactions. David never reads DMs.
 */

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type { FanProfile, FanTier, FanMessage, FanInteraction } from '../../types/content-pipeline';

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

// ── Log fan interaction ──────────────────────────────────

export async function logFanInteraction(
  userId: string,
  interaction: {
    fan_username: string;
    fan_platform: string;
    fan_tier?: string;
    interaction_type: string;
    content?: string;
    source_post_url?: string;
    tip_amount_cents?: number;
  }
): Promise<FanInteraction | null> {
  const { data, error } = await supabase
    .from('fan_interactions')
    .insert({
      user_id: userId,
      fan_username: interaction.fan_username,
      fan_platform: interaction.fan_platform,
      fan_tier: interaction.fan_tier || 'casual',
      interaction_type: interaction.interaction_type,
      content: interaction.content || null,
      source_post_url: interaction.source_post_url || null,
      tip_amount_cents: interaction.tip_amount_cents || 0,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[fans] logFanInteraction error:', error);
    return null;
  }
  return data as FanInteraction;
}

// ── Get fan interactions ─────────────────────────────────

export async function getFanInteractions(
  userId: string,
  filters?: {
    interaction_type?: string;
    sentiment?: string;
    response_approved?: boolean;
    limit?: number;
  }
): Promise<FanInteraction[]> {
  let query = supabase
    .from('fan_interactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filters?.interaction_type) query = query.eq('interaction_type', filters.interaction_type);
  if (filters?.sentiment) query = query.eq('sentiment', filters.sentiment);
  if (filters?.response_approved !== undefined) query = query.eq('response_approved', filters.response_approved);
  query = query.limit(filters?.limit || 50);

  const { data, error } = await query;
  if (error) {
    console.error('[fans] getFanInteractions error:', error);
    return [];
  }
  return (data || []) as FanInteraction[];
}

// ── Get pending interactions (needs review) ──────────────

export async function getPendingInteractions(userId: string): Promise<FanInteraction[]> {
  const { data, error } = await supabase
    .from('fan_interactions')
    .select('*')
    .eq('user_id', userId)
    .not('handler_response', 'is', null)
    .eq('response_approved', false)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return [];
  return (data || []) as FanInteraction[];
}

// ── Approve interaction response ─────────────────────────

export async function approveInteractionResponse(
  interactionId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('fan_interactions')
    .update({
      response_approved: true,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', interactionId)
    .eq('user_id', userId);

  return !error;
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
