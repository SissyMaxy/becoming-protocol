// Pending-outbound helpers. When the auto-poster hits a question it can't
// answer from grounded state, it queues a handler_attention item. The user
// answers in the Handler chat. The Handler writes the user's exact words to
// pending_outbound. Next Sniffies (or platform) tick: the engine looks at
// pending_outbound BEFORE generating a reply — if a pending row exists for
// that chat, it sends that row verbatim instead of calling Claude.
//
// No Claude rewrite. Maxy's words pass through.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PendingOutbound {
  id: string;
  contact_id: string | null;
  platform: string;
  target_handle: string;
  body: string;
  reason: string | null;
  attention_id: string | null;
}

/**
 * Look up the oldest pending outbound for a specific (platform, handle).
 * Returns null if none. The chat engine calls this before generating.
 */
export async function consumePendingForChat(
  sb: SupabaseClient,
  userId: string,
  platform: string,
  targetHandle: string,
): Promise<PendingOutbound | null> {
  const handle = (targetHandle || '').toLowerCase();
  const { data } = await sb
    .from('pending_outbound')
    .select('id, contact_id, platform, target_handle, body, reason, attention_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('platform', platform)
    .eq('target_handle', handle)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data || null;
}

/**
 * Mark a pending outbound as sent. Called after the platform engine
 * successfully delivers the message.
 */
export async function markPendingSent(
  sb: SupabaseClient,
  id: string,
): Promise<void> {
  await sb.from('pending_outbound')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id);
}

/**
 * Mark a pending outbound as failed. Called if send raised.
 */
export async function markPendingFailed(
  sb: SupabaseClient,
  id: string,
  error: string,
): Promise<void> {
  await sb.from('pending_outbound')
    .update({ status: 'failed', error: error.slice(0, 500) })
    .eq('id', id);
}
