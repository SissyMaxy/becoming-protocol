/**
 * Edge Capture System — Sprint 6 Item 29
 * Flag moments during edge sessions for content capture.
 * When Maxy edges, the Handler can mark timestamps
 * for later extraction into the content vault.
 */

import { supabase } from '../supabase';
import { addToVault } from '../content-pipeline/vault';

// ============================================
// Types
// ============================================

export interface CaptureFlag {
  id: string;
  sessionId: string;
  timestampSeconds: number;
  flagType: 'edge_peak' | 'reaction' | 'verbal' | 'body_response' | 'denial_moment' | 'manual';
  description: string | null;
  mediaUrl: string | null;
  vaultId: string | null;
  processed: boolean;
  createdAt: string;
}

interface DbCaptureFlag {
  id: string;
  session_id: string;
  timestamp_seconds: number;
  flag_type: string;
  description: string | null;
  media_url: string | null;
  vault_id: string | null;
  processed: boolean;
  created_at: string;
}

export interface CaptureSessionSummary {
  sessionId: string;
  totalFlags: number;
  processedFlags: number;
  vaultedFlags: number;
  flagsByType: Record<string, number>;
}

// ============================================
// Core Functions
// ============================================

/**
 * Flag a moment during an edge session for content capture.
 * Can be triggered by user tap, Handler auto-detect, or timer.
 */
export async function flagCaptureMoment(
  userId: string,
  sessionId: string,
  timestampSeconds: number,
  flagType: CaptureFlag['flagType'],
  description?: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('edge_capture_flags')
    .insert({
      user_id: userId,
      session_id: sessionId,
      timestamp_seconds: timestampSeconds,
      flag_type: flagType,
      description: description ?? null,
    })
    .select('id')
    .single();

  if (error) {
    // Table may not exist yet — store in session metadata instead
    console.error('Edge capture flag failed:', error);
    return null;
  }

  return data?.id ?? null;
}

/**
 * Auto-flag edge peaks based on session events.
 * Called by edge training system when an edge is recorded.
 */
export async function autoFlagEdgePeak(
  userId: string,
  sessionId: string,
  edgeCount: number,
  timestampSeconds: number,
): Promise<string | null> {
  const description = `Edge #${edgeCount} — automatic capture flag`;
  return flagCaptureMoment(userId, sessionId, timestampSeconds, 'edge_peak', description);
}

/**
 * Process a capture flag — extract media and add to vault.
 * Called after session ends when media is available.
 */
export async function processCaptureFlag(
  userId: string,
  flagId: string,
  mediaUrl: string,
  mediaType: 'image' | 'video',
): Promise<string | null> {
  // Add to content vault
  const vaultId = await addToVault(userId, {
    media_url: mediaUrl,
    media_type: mediaType,
    source_type: 'edge_capture',
    capture_context: `edge_session_flag:${flagId}`,
    description: 'Edge session capture — flagged moment',
  });

  if (!vaultId) return null;

  // Update flag with vault reference
  await supabase
    .from('edge_capture_flags')
    .update({
      media_url: mediaUrl,
      vault_id: vaultId,
      processed: true,
    })
    .eq('id', flagId);

  return vaultId;
}

/**
 * Get all capture flags for a session.
 */
export async function getSessionCaptureFlags(
  userId: string,
  sessionId: string,
): Promise<CaptureFlag[]> {
  const { data, error } = await supabase
    .from('edge_capture_flags')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('timestamp_seconds', { ascending: true });

  if (error || !data) return [];
  return data.map(mapCaptureFlag);
}

/**
 * Get unprocessed capture flags across all sessions.
 */
export async function getUnprocessedFlags(
  userId: string,
  limit = 20,
): Promise<CaptureFlag[]> {
  const { data, error } = await supabase
    .from('edge_capture_flags')
    .select('*')
    .eq('user_id', userId)
    .eq('processed', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapCaptureFlag);
}

/**
 * Build capture summary for a session.
 */
export async function getCaptureSessionSummary(
  userId: string,
  sessionId: string,
): Promise<CaptureSessionSummary> {
  const flags = await getSessionCaptureFlags(userId, sessionId);

  const flagsByType: Record<string, number> = {};
  let processedFlags = 0;
  let vaultedFlags = 0;

  for (const flag of flags) {
    flagsByType[flag.flagType] = (flagsByType[flag.flagType] ?? 0) + 1;
    if (flag.processed) processedFlags++;
    if (flag.vaultId) vaultedFlags++;
  }

  return {
    sessionId,
    totalFlags: flags.length,
    processedFlags,
    vaultedFlags,
    flagsByType,
  };
}

/**
 * Build context string for Handler AI prompts.
 */
export async function buildEdgeCaptureContext(userId: string): Promise<string> {
  try {
    const unprocessed = await getUnprocessedFlags(userId, 5);
    if (unprocessed.length === 0) return '';

    return `EDGE CAPTURES: ${unprocessed.length} unprocessed flags awaiting media extraction`;
  } catch {
    return '';
  }
}

// ============================================
// Mapper
// ============================================

function mapCaptureFlag(row: DbCaptureFlag): CaptureFlag {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestampSeconds: row.timestamp_seconds,
    flagType: row.flag_type as CaptureFlag['flagType'],
    description: row.description,
    mediaUrl: row.media_url,
    vaultId: row.vault_id,
    processed: row.processed,
    createdAt: row.created_at,
  };
}
