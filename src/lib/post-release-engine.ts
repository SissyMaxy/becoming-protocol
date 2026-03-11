/**
 * Post-Release Engine
 * Lockout enforcement, shame capture, deletion intercept, morning reframe.
 * Pure Supabase CRUD + logic. No React.
 */

import { supabase } from './supabase';
import type {
  PostReleaseProtocol,
  DbPostReleaseProtocol,
  ShameEntry,
} from '../types/post-release';
import { mapDbToPostReleaseProtocol } from '../types/post-release';
import { updateReleasePattern } from './weekend-engine';
import { queueDelayedReward } from './dopamine-engine';

// ============================================
// LOCKOUT DURATIONS
// ============================================

const STANDARD_LOCKOUT_MS = 2 * 60 * 60 * 1000;      // 2 hours
const HIGH_REGRET_LOCKOUT_MS = 72 * 60 * 60 * 1000;   // 72 hours
const REGRET_THRESHOLD = 7;

// ============================================
// START PROTOCOL
// ============================================

export async function startProtocol(
  userId: string,
  releaseType: string,
  regretLevel: number,
  intensity?: number
): Promise<PostReleaseProtocol | null> {
  const isHighRegret = regretLevel >= REGRET_THRESHOLD;
  const lockoutMs = isHighRegret ? HIGH_REGRET_LOCKOUT_MS : STANDARD_LOCKOUT_MS;
  const lockoutTier = isHighRegret ? 'high_regret' : 'standard';
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lockoutMs);

  const { data, error } = await supabase
    .from('post_release_protocol')
    .insert({
      user_id: userId,
      release_type: releaseType,
      regret_level: regretLevel,
      intensity: intensity ?? null,
      lockout_started_at: now.toISOString(),
      lockout_expires_at: expiresAt.toISOString(),
      lockout_tier: lockoutTier,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[PostRelease] Failed to start protocol:', error.message);
    return null;
  }

  // Fire-and-forget: update weekend release pattern intelligence
  updateReleasePattern(userId).catch(() => {});

  return mapDbToPostReleaseProtocol(data as DbPostReleaseProtocol);
}

// ============================================
// GET ACTIVE PROTOCOL
// ============================================

export async function getActiveProtocol(
  userId: string
): Promise<PostReleaseProtocol | null> {
  const { data, error } = await supabase
    .from('post_release_protocol')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('lockout_started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const protocol = mapDbToPostReleaseProtocol(data as DbPostReleaseProtocol);

  // Auto-expire if past lockout
  if (new Date(protocol.lockoutExpiresAt) < new Date()) {
    await supabase
      .from('post_release_protocol')
      .update({
        status: 'expired',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', protocol.id);
    return null;
  }

  return protocol;
}

// ============================================
// CONTENT LOCK CHECK
// ============================================

export async function isContentLocked(userId: string): Promise<boolean> {
  const protocol = await getActiveProtocol(userId);
  return protocol !== null;
}

// ============================================
// SHAME CAPTURE
// ============================================

export async function captureShameEntry(
  userId: string,
  protocolId: string,
  text: string
): Promise<void> {
  // Read-then-write for JSONB array append
  const { data } = await supabase
    .from('post_release_protocol')
    .select('shame_entries, lockout_started_at')
    .eq('id', protocolId)
    .eq('user_id', userId)
    .single();

  if (!data) return;

  const existing: ShameEntry[] = (data.shame_entries as ShameEntry[]) || [];
  const minutesPost = Math.floor(
    (Date.now() - new Date(data.lockout_started_at).getTime()) / 60000
  );

  const entry: ShameEntry = {
    text,
    capturedAt: new Date().toISOString(),
    minutesPostRelease: minutesPost,
  };

  await supabase
    .from('post_release_protocol')
    .update({
      shame_entries: [...existing, entry],
      updated_at: new Date().toISOString(),
    })
    .eq('id', protocolId)
    .eq('user_id', userId);
}

// ============================================
// REFLECTION
// ============================================

export async function saveReflection(
  userId: string,
  protocolId: string,
  text: string
): Promise<void> {
  await supabase
    .from('post_release_protocol')
    .update({
      reflection_text: text,
      reflection_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', protocolId)
    .eq('user_id', userId);
}

// ============================================
// PRE-COMMITMENT
// ============================================

export async function recordPreCommitment(
  userId: string,
  text: string,
  arousalLevel: number
): Promise<void> {
  // Attach to the most recent active protocol, or store standalone
  const { data } = await supabase
    .from('post_release_protocol')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('lockout_started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    await supabase
      .from('post_release_protocol')
      .update({
        pre_commitment_text: text,
        pre_commitment_captured_at: new Date().toISOString(),
        pre_commitment_arousal: arousalLevel,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .eq('user_id', userId);
  }

  // Dopamine: delayed reward after pre-commitment (10-30 min)
  queueDelayedReward(
    userId,
    'pre_commitment',
    'Locked',
    "Locked. She'll need this later.",
    20,
    { hapticPattern: 'notification_medium', ginaSafe: false },
  ).catch(() => {});
}

// ============================================
// DELETION INTERCEPT
// ============================================

export interface DeletionInterceptResult {
  blocked: boolean;
  message: string;
  attemptNumber: number;
}

export async function interceptDeletion(
  userId: string
): Promise<DeletionInterceptResult | null> {
  const protocol = await getActiveProtocol(userId);
  if (!protocol) return null;

  const newCount = protocol.deletionAttempts + 1;

  await supabase
    .from('post_release_protocol')
    .update({
      deletion_attempts: newCount,
      last_deletion_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', protocol.id)
    .eq('user_id', userId);

  // Escalating Handler messages
  let message: string;
  if (newCount === 1) {
    message = "Content locked. Post-release decisions aren't real decisions.";
  } else if (newCount === 2 && protocol.preCommitmentText) {
    const ts = protocol.preCommitmentCapturedAt
      ? new Date(protocol.preCommitmentCapturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : 'earlier';
    const arousal = protocol.preCommitmentArousal
      ? `, at arousal ${protocol.preCommitmentArousal}`
      : '';
    message = `At ${ts}${arousal}, you wrote: "${protocol.preCommitmentText}". That was real. This impulse isn't.`;
  } else {
    message = "She was brave. He's trying to erase her.";
  }

  return {
    blocked: true,
    message,
    attemptNumber: newCount,
  };
}

// ============================================
// COMPLETE PROTOCOL
// ============================================

export async function completeProtocol(
  userId: string,
  protocolId: string
): Promise<void> {
  await supabase
    .from('post_release_protocol')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', protocolId)
    .eq('user_id', userId);
}

// ============================================
// MORNING REFRAME
// ============================================

export async function getLastCompletedProtocol(
  userId: string
): Promise<PostReleaseProtocol | null> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('post_release_protocol')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['completed', 'expired'])
    .eq('morning_reframe_shown', false)
    .gte('completed_at', oneDayAgo)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapDbToPostReleaseProtocol(data as DbPostReleaseProtocol);
}

export async function markMorningReframeShown(
  userId: string,
  protocolId: string
): Promise<void> {
  await supabase
    .from('post_release_protocol')
    .update({
      morning_reframe_shown: true,
      morning_reframe_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', protocolId)
    .eq('user_id', userId);
}
