/**
 * Sexting — Conversation Management
 *
 * CRUD for sexting_conversations table.
 * Each fan gets one conversation per platform.
 */

import { supabase } from '../supabase';
import type { SextingConversation, HandlerPersonality } from '../../types/sexting';
import { mapConversation as mapConv } from '../../types/sexting';

// ── Get or create conversation ──────────────────────────

export async function getOrCreateConversation(
  userId: string,
  fanId: string,
  platform: string,
  personality?: HandlerPersonality
): Promise<SextingConversation | null> {
  // Check for existing active conversation
  const { data: existing } = await supabase
    .from('sexting_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('fan_id', fanId)
    .eq('platform', platform)
    .in('status', ['active', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) return mapConv(existing as Record<string, unknown>);

  // Create new
  const { data, error } = await supabase
    .from('sexting_conversations')
    .insert({
      user_id: userId,
      fan_id: fanId,
      platform,
      handler_personality: personality || null,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[sexting] getOrCreateConversation error:', error);
    return null;
  }
  return mapConv(data as Record<string, unknown>);
}

// ── Get active conversations ────────────────────────────

export async function getActiveConversations(userId: string): Promise<SextingConversation[]> {
  const { data, error } = await supabase
    .from('sexting_conversations')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'escalated'])
    .order('last_message_at', { ascending: false });

  if (error) {
    console.error('[sexting] getActiveConversations error:', error);
    return [];
  }
  return (data || []).map((r) => mapConv(r as Record<string, unknown>));
}

// ── Update conversation stats ───────────────────────────

export async function updateConversationStats(
  conversationId: string,
  revenueDelta: number = 0
): Promise<void> {
  // Increment message count and optionally add revenue
  const { data: current } = await supabase
    .from('sexting_conversations')
    .select('total_messages, revenue_cents')
    .eq('id', conversationId)
    .single();

  if (!current) return;

  await supabase
    .from('sexting_conversations')
    .update({
      total_messages: (current.total_messages as number) + 1,
      revenue_cents: (current.revenue_cents as number) + revenueDelta,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
}

// ── Escalate conversation ───────────────────────────────

export async function escalateConversation(conversationId: string): Promise<void> {
  await supabase
    .from('sexting_conversations')
    .update({ status: 'escalated' })
    .eq('id', conversationId);
}

// ── Close conversation ──────────────────────────────────

export async function closeConversation(conversationId: string): Promise<void> {
  await supabase
    .from('sexting_conversations')
    .update({ status: 'closed' })
    .eq('id', conversationId);
}

// ── Get conversation count by status ────────────────────

export async function getConversationCounts(userId: string): Promise<{
  active: number;
  escalated: number;
  total: number;
}> {
  const { data, error } = await supabase
    .from('sexting_conversations')
    .select('status')
    .eq('user_id', userId);

  if (error || !data) return { active: 0, escalated: 0, total: 0 };

  const active = data.filter((r) => r.status === 'active').length;
  const escalated = data.filter((r) => r.status === 'escalated').length;

  return { active, escalated, total: data.length };
}
