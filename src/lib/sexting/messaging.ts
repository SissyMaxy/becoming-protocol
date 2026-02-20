/**
 * Sexting — Message Pipeline
 *
 * Handler-driven messaging with auto-send for high-confidence drafts.
 * Low-confidence messages get escalated for David's review.
 */

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type { SextingMessage } from '../../types/sexting';
import { updateConversationStats } from './conversations';

// ── Handle inbound message ──────────────────────────────

export async function handleInboundMessage(
  userId: string,
  fanId: string,
  platform: string,
  text: string,
  conversationId: string
): Promise<{ draft: string; confidence: number; autoSend: boolean } | null> {
  // Get fan context for AI
  const { data: fan } = await supabase
    .from('fan_profiles')
    .select('username, fan_tier, total_spent_cents, personality_model, response_preferences')
    .eq('id', fanId)
    .eq('user_id', userId)
    .single();

  if (!fan) return null;

  // Get conversation context
  const { data: conv } = await supabase
    .from('sexting_conversations')
    .select('handler_personality, escalation_threshold, auto_reply_enabled')
    .eq('id', conversationId)
    .single();

  const threshold = (conv?.escalation_threshold as number) ?? 0.7;
  const autoEnabled = (conv?.auto_reply_enabled as boolean) ?? true;

  // Record inbound message
  await supabase.from('fan_messages').insert({
    user_id: userId,
    fan_id: fanId,
    platform,
    direction: 'inbound',
    message_text: text,
    conversation_id: conversationId,
    message_type: 'text',
  });

  // AI drafts response
  const { data: aiResult } = await invokeWithAuth('handler-ai', {
    action: 'draft_sexting_reply',
    fan: {
      username: fan.username,
      tier: fan.fan_tier,
      total_spent: fan.total_spent_cents,
      personality: fan.personality_model,
      preferences: fan.response_preferences,
    },
    inbound_message: text,
    handler_personality: conv?.handler_personality || 'flirty',
  });

  const result = aiResult as Record<string, unknown> | null;
  const draft = (result?.draft as string) || 'Hey babe! 💕';
  const confidence = (result?.confidence as number) || 0.5;
  const autoSend = autoEnabled && confidence >= threshold;

  // Create outbound draft
  const approvalStatus = autoSend ? 'auto' : 'pending';

  await supabase.from('fan_messages').insert({
    user_id: userId,
    fan_id: fanId,
    platform,
    direction: 'outbound',
    message_text: text,
    handler_draft: draft,
    approval_status: approvalStatus,
    conversation_id: conversationId,
    message_type: 'text',
    auto_sent: autoSend,
    ai_confidence: confidence,
    sent_at: autoSend ? new Date().toISOString() : null,
  });

  await updateConversationStats(conversationId);

  return { draft, confidence, autoSend };
}

// ── Get conversation history ────────────────────────────

export async function getConversationHistory(
  conversationId: string,
  limit: number = 50
): Promise<SextingMessage[]> {
  const { data, error } = await supabase
    .from('fan_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) return [];
  return (data || []) as unknown as SextingMessage[];
}

// ── Send message (approve + mark sent) ──────────────────

export async function sendMessage(messageId: string): Promise<void> {
  await supabase
    .from('fan_messages')
    .update({
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    })
    .eq('id', messageId);
}

// ── Reject message ──────────────────────────────────────

export async function rejectMessage(messageId: string): Promise<void> {
  await supabase
    .from('fan_messages')
    .update({ approval_status: 'rejected' })
    .eq('id', messageId);
}

// ── Get escalated messages (below confidence threshold) ─

export async function getEscalatedMessages(userId: string): Promise<SextingMessage[]> {
  const { data, error } = await supabase
    .from('fan_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []) as unknown as SextingMessage[];
}

// ── Get auto-send stats ─────────────────────────────────

export async function getAutoSendStats(userId: string): Promise<{
  totalSent: number;
  autoSent: number;
  rate: number;
}> {
  const { data } = await supabase
    .from('fan_messages')
    .select('auto_sent')
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .in('approval_status', ['auto', 'approved']);

  if (!data) return { totalSent: 0, autoSent: 0, rate: 0 };

  const totalSent = data.length;
  const autoSent = data.filter((r) => r.auto_sent).length;
  const rate = totalSent > 0 ? autoSent / totalSent : 0;

  return { totalSent, autoSent, rate };
}
