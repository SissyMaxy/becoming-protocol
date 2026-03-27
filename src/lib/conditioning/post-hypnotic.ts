/**
 * Post-Hypnotic Suggestion Tracking
 *
 * Records delivery of post-hypnotic suggestions during sessions,
 * monitors for activation events, and tracks compliance.
 */

import { supabase } from '../supabase';

interface PostHypnoticEntry {
  id: string;
  user_id: string;
  script_id: string;
  session_id: string;
  context: string;
  suggestion: string;
  activation_time: string;
  activation_expected_at: string;
  activation_detected: boolean | null;
  detection_method: string | null;
  created_at: string;
}

/**
 * Record delivery of a post-hypnotic suggestion during a session.
 */
export async function recordDelivery(
  userId: string,
  scriptId: string,
  sessionId: string,
  context: string,
  suggestion: string,
  activationTime: string,
  expectedAt: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('post_hypnotic_tracking')
      .insert({
        user_id: userId,
        script_id: scriptId,
        session_id: sessionId,
        context,
        suggestion,
        activation_time: activationTime,
        activation_expected_at: expectedAt,
        activation_detected: null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[post-hypnotic] recordDelivery error:', error.message);
      return null;
    }

    return data?.id ?? null;
  } catch (err) {
    console.error('[post-hypnotic] recordDelivery exception:', err);
    return null;
  }
}

/**
 * Find entries where activation_expected_at has passed but activation_detected is null.
 * These are suggestions that should have activated but haven't been confirmed.
 */
export async function checkActivations(userId: string): Promise<PostHypnoticEntry[]> {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('post_hypnotic_tracking')
      .select('*')
      .eq('user_id', userId)
      .is('activation_detected', null)
      .lt('activation_expected_at', now)
      .order('activation_expected_at', { ascending: true });

    if (error) {
      console.error('[post-hypnotic] checkActivations error:', error.message);
      return [];
    }

    return (data ?? []) as PostHypnoticEntry[];
  } catch (err) {
    console.error('[post-hypnotic] checkActivations exception:', err);
    return [];
  }
}

/**
 * Record that a post-hypnotic suggestion was activated.
 */
export async function recordActivation(
  trackingId: string,
  method: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('post_hypnotic_tracking')
      .update({
        activation_detected: true,
        detection_method: method,
      })
      .eq('id', trackingId);

    if (error) {
      console.error('[post-hypnotic] recordActivation error:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[post-hypnotic] recordActivation exception:', err);
    return false;
  }
}

/**
 * Fetch all pending post-hypnotic suggestions (not yet activated).
 */
export async function getPendingPostHypnotics(userId: string): Promise<PostHypnoticEntry[]> {
  try {
    const { data, error } = await supabase
      .from('post_hypnotic_tracking')
      .select('*')
      .eq('user_id', userId)
      .or('activation_detected.is.null,activation_detected.eq.false')
      .order('activation_expected_at', { ascending: true });

    if (error) {
      console.error('[post-hypnotic] getPendingPostHypnotics error:', error.message);
      return [];
    }

    return (data ?? []) as PostHypnoticEntry[];
  } catch (err) {
    console.error('[post-hypnotic] getPendingPostHypnotics exception:', err);
    return [];
  }
}
