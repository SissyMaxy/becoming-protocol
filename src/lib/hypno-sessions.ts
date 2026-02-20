/**
 * Hypno Session Management
 *
 * Session lifecycle with capture integration and bambi bridge.
 * At session end, fires logBambiSession() fire-and-forget to maintain
 * trance tracking continuity in bambi_states.
 */

import { supabase } from './supabase';
import { addToVault } from './content-pipeline/vault';
import { logBambiSession } from './bambi/state-engine';
import type {
  HypnoSessionRecord,
  DbHypnoSessionRecord,
  HypnoSessionType,
  HypnoCaptureMode,
  HypnoBypassReason,
  HypnoPostSessionState,
  HypnoCaptureEntry,
  HypnoCaptureType,
  HypnoSessionSummary,
} from '../types/hypno-bridge';
import { mapDbToHypnoSessionRecord } from '../types/hypno-bridge';
import { recordLibraryUsage } from './hypno-library';

// ============================================
// CREATE SESSION
// ============================================

export async function createHypnoSession(
  userId: string,
  input: {
    libraryItemId?: string;
    contentIds?: string[];
    sessionType: HypnoSessionType;
    captureMode?: HypnoCaptureMode;
    bypassReason?: HypnoBypassReason;
    originalPrescriptionType?: string;
    denialDayAtStart?: number;
    arousalAtStart?: number;
  }
): Promise<HypnoSessionRecord | null> {
  const { data, error } = await supabase
    .from('hypno_sessions')
    .insert({
      user_id: userId,
      library_item_id: input.libraryItemId || null,
      content_ids: input.contentIds || [],
      session_type: input.sessionType,
      capture_mode: input.captureMode || 'none',
      bypass_reason: input.bypassReason || null,
      original_prescription_type: input.originalPrescriptionType || null,
      denial_day_at_start: input.denialDayAtStart ?? null,
      arousal_at_start: input.arousalAtStart ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[HypnoSessions] Failed to create session:', error?.message);
    return null;
  }

  // Record library usage if a library item was referenced
  if (input.libraryItemId) {
    recordLibraryUsage(userId, input.libraryItemId).catch(err => {
      console.warn('[HypnoSessions] Library usage tracking failed:', err);
    });
  }

  return mapDbToHypnoSessionRecord(data as DbHypnoSessionRecord);
}

// ============================================
// END SESSION (with bambi bridge)
// ============================================

export async function endHypnoSession(
  userId: string,
  sessionId: string,
  endData: {
    tranceDepth?: number;
    postSessionState?: HypnoPostSessionState;
    completed: boolean;
    durationSeconds: number;
  }
): Promise<void> {
  const { data, error } = await supabase
    .from('hypno_sessions')
    .update({
      ended_at: new Date().toISOString(),
      duration_seconds: endData.durationSeconds,
      completed: endData.completed,
      trance_depth: endData.tranceDepth ?? null,
      post_session_state: endData.postSessionState || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[HypnoSessions] Failed to end session:', error.message);
    return;
  }

  // Bambi bridge — fire-and-forget
  // Logs to bambi_states for trance tracking continuity
  const session = data ? mapDbToHypnoSessionRecord(data as DbHypnoSessionRecord) : null;

  logBambiSession({
    userId,
    sessionType: 'hypno_listen',
    depthEstimate: endData.tranceDepth,
    denialDay: session?.denialDayAtStart,
    arousalAtStart: session?.arousalAtStart,
    handlerInvoked: session?.sessionType === 'compliance_bypass',
    handlerGoal: session?.sessionType === 'compliance_bypass'
      ? 'compliance_bypass_content'
      : 'conditioning',
    contentRef: session?.libraryItemId || undefined,
  }).then(bambiId => {
    // Link bambi session back to hypno session
    if (bambiId) {
      supabase
        .from('hypno_sessions')
        .update({ bambi_session_id: bambiId })
        .eq('id', sessionId)
        .then(() => {}, () => {}); // fire-and-forget
    }
  }).catch(err => {
    console.warn('[HypnoSessions] Bambi bridge failed:', err);
  });
}

// ============================================
// ADD SESSION CAPTURE
// ============================================

/**
 * Add a capture to an active session.
 * Calls addToVault() then appends to session's captures JSONB + vault_ids.
 * Returns the vault ID of the created item.
 */
export async function addSessionCapture(
  userId: string,
  sessionId: string,
  capture: {
    mediaUrl: string;
    mediaType: 'image' | 'video' | 'audio';
    description?: string;
    timestampSeconds?: number;
    captureType: HypnoCaptureType;
  }
): Promise<string | null> {
  // 1. Add to vault
  const vaultId = await addToVault(userId, {
    media_url: capture.mediaUrl,
    media_type: capture.mediaType,
    description: capture.description || 'Hypno session capture',
    source_type: 'session',
    capture_context: `hypno_session:${sessionId} type:${capture.captureType}`,
  });

  if (!vaultId) {
    console.error('[HypnoSessions] addToVault failed for capture');
    return null;
  }

  // 2. Build capture entry
  const entry: HypnoCaptureEntry = {
    vault_id: vaultId,
    timestamp_seconds: capture.timestampSeconds ?? 0,
    capture_type: capture.captureType,
    description: capture.description,
  };

  // 3. Read current session and append (same pattern as cam-engine addHighlightToSession)
  const { data: current } = await supabase
    .from('hypno_sessions')
    .select('captures, vault_ids')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!current) return vaultId;

  const existingCaptures = (current.captures as HypnoCaptureEntry[]) || [];
  const existingVaultIds = (current.vault_ids as string[]) || [];

  await supabase
    .from('hypno_sessions')
    .update({
      captures: [...existingCaptures, entry],
      vault_ids: [...existingVaultIds, vaultId],
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId);

  return vaultId;
}

// ============================================
// QUERIES
// ============================================

export async function getRecentHypnoSessions(
  userId: string,
  limit = 10
): Promise<HypnoSessionRecord[]> {
  const { data } = await supabase
    .from('hypno_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  return (data || []).map(d => mapDbToHypnoSessionRecord(d as DbHypnoSessionRecord));
}

export async function getActiveHypnoSession(
  userId: string
): Promise<HypnoSessionRecord | null> {
  const { data } = await supabase
    .from('hypno_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return mapDbToHypnoSessionRecord(data as DbHypnoSessionRecord);
}

export async function getHypnoSessionSummary(
  userId: string
): Promise<HypnoSessionSummary | null> {
  const { data } = await supabase
    .from('hypno_session_summary')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;

  return {
    userId: data.user_id,
    totalSessions: Number(data.total_sessions) || 0,
    bypassSessions: Number(data.bypass_sessions) || 0,
    completedSessions: Number(data.completed_sessions) || 0,
    sessionsLast30Days: Number(data.sessions_last_30_days) || 0,
    avgTranceDepth: Number(data.avg_trance_depth) || 0,
    sessionsWithCaptures: Number(data.sessions_with_captures) || 0,
    totalCaptures: Number(data.total_captures) || 0,
  };
}
