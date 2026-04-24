/**
 * Handler attention queue — write side.
 *
 * Engines call queueAttention() whenever the Handler decides something needs
 * a judgment call from the operator. The CLI (`npm run attention`) surfaces
 * the queue for review.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AttentionKind =
  | 'outbound_suppressed'
  | 'logistics_ask'
  | 'merge_candidate'
  | 'new_paying_contact'
  | 'ghosted_paying'
  | 'catfish_suspected'
  | 'screening_request'
  | 'tribute_paid'
  | 'tribute_overdue'
  | 'live_announce_triggered'
  | 'unanswered_inbound'
  | 'stale_outbound'
  | 'custom';

export type AttentionSeverity = 'low' | 'medium' | 'high';

export interface QueueAttentionInput {
  kind: AttentionKind;
  severity?: AttentionSeverity;
  contactId?: string | null;
  platform?: string;
  summary: string;
  payload?: Record<string, unknown>;
}

export async function queueAttention(
  sb: SupabaseClient,
  userId: string,
  input: QueueAttentionInput,
): Promise<void> {
  try {
    await sb.from('handler_attention').insert({
      user_id: userId,
      contact_id: input.contactId || null,
      kind: input.kind,
      severity: input.severity || 'medium',
      platform: input.platform,
      summary: input.summary.slice(0, 500),
      payload: input.payload || {},
    });
  } catch (err) {
    // Don't let queue failures break the engine — just log.
    console.error(`[handler-attention] queue failed:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Convenience wrapper: dedup-aware queue. Only inserts if no open item of the
 * same (kind, contact_id) exists in the last `withinMinutes`. Prevents the
 * queue from flooding when the same person spams logistics asks.
 */
export async function queueAttentionDedup(
  sb: SupabaseClient,
  userId: string,
  input: QueueAttentionInput,
  withinMinutes = 60,
): Promise<boolean> {
  if (input.contactId) {
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
    const { count } = await sb.from('handler_attention')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('contact_id', input.contactId)
      .eq('kind', input.kind)
      .is('reviewed_at', null)
      .gte('created_at', cutoff);
    if ((count || 0) > 0) return false;
  }
  await queueAttention(sb, userId, input);
  return true;
}
