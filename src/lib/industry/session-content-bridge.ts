/**
 * Session-Content Bridge — Sprint 6 (Addendum C)
 * Captures from sessions (cam, hypno, edge) → content queue pipeline.
 * Consumption IS production. Production IS conditioning.
 */

import { supabase } from '../supabase';
import { addToVault } from '../content-pipeline/vault';

// ============================================
// Types
// ============================================

export type SessionSourceType = 'cam_session' | 'hypno_session' | 'edge_session' | 'bambi_session';

export type CaptureType =
  | 'passive'       // Camera was just on
  | 'flagged'       // User/Handler flagged a moment
  | 'active'        // Deliberate capture
  | 'reaction'      // Before/after reaction
  | 'before_after'  // Pre/post comparison
  | 'pip';          // Picture-in-picture format

export interface SessionCapture {
  id: string;
  userId: string;
  sessionId: string;
  sourceType: SessionSourceType;
  captureType: CaptureType;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio';
  timestampSeconds: number | null;
  description: string | null;
  vaultId: string | null;
  queuedForPost: boolean;
  contentQueueId: string | null;
  createdAt: string;
}

export interface BeforeAfterPair {
  before: SessionCapture | null;
  after: SessionCapture | null;
  sessionId: string;
  sourceType: SessionSourceType;
}

// ============================================
// Capture Pipeline
// ============================================

/**
 * Capture media from a session and add to vault.
 * This is the core bridge: session → vault → content queue.
 */
export async function captureFromSession(
  userId: string,
  sessionId: string,
  input: {
    sourceType: SessionSourceType;
    captureType: CaptureType;
    mediaUrl: string;
    mediaType: 'image' | 'video' | 'audio';
    timestampSeconds?: number;
    description?: string;
  },
): Promise<SessionCapture | null> {
  // Add to vault first
  const vaultId = await addToVault(userId, {
    media_url: input.mediaUrl,
    media_type: input.mediaType,
    source_type: input.sourceType,
    capture_context: `${input.sourceType}:${sessionId}:${input.captureType}`,
    description: input.description ?? `${input.sourceType} capture (${input.captureType})`,
  });

  // Record the session capture
  const { data, error } = await supabase
    .from('session_captures')
    .insert({
      user_id: userId,
      session_id: sessionId,
      source_type: input.sourceType,
      capture_type: input.captureType,
      media_url: input.mediaUrl,
      media_type: input.mediaType,
      timestamp_seconds: input.timestampSeconds ?? null,
      description: input.description ?? null,
      vault_id: vaultId,
    })
    .select()
    .single();

  if (error) {
    // Table may not exist yet — log and continue
    console.error('Session capture insert failed:', error);
    // Still return a capture object since vault was successful
    return vaultId ? {
      id: '',
      userId,
      sessionId,
      sourceType: input.sourceType,
      captureType: input.captureType,
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType,
      timestampSeconds: input.timestampSeconds ?? null,
      description: input.description ?? null,
      vaultId,
      queuedForPost: false,
      contentQueueId: null,
      createdAt: new Date().toISOString(),
    } : null;
  }

  return mapSessionCapture(data);
}

/**
 * Capture "before" state — taken before a session starts.
 */
export async function captureBeforeState(
  userId: string,
  sessionId: string,
  sourceType: SessionSourceType,
  mediaUrl: string,
  mediaType: 'image' | 'video',
): Promise<SessionCapture | null> {
  return captureFromSession(userId, sessionId, {
    sourceType,
    captureType: 'before_after',
    mediaUrl,
    mediaType,
    description: `Before state — pre-${sourceType}`,
  });
}

/**
 * Capture "after" state — taken after a session ends.
 */
export async function captureAfterState(
  userId: string,
  sessionId: string,
  sourceType: SessionSourceType,
  mediaUrl: string,
  mediaType: 'image' | 'video',
): Promise<SessionCapture | null> {
  return captureFromSession(userId, sessionId, {
    sourceType,
    captureType: 'reaction',
    mediaUrl,
    mediaType,
    description: `After state — post-${sourceType} reaction`,
  });
}

/**
 * Capture PIP (picture-in-picture) — reaction during session.
 */
export async function capturePIP(
  userId: string,
  sessionId: string,
  sourceType: SessionSourceType,
  mediaUrl: string,
  timestampSeconds: number,
): Promise<SessionCapture | null> {
  return captureFromSession(userId, sessionId, {
    sourceType,
    captureType: 'pip',
    mediaUrl,
    mediaType: 'video',
    timestampSeconds,
    description: `PIP reaction at ${timestampSeconds}s during ${sourceType}`,
  });
}

// ============================================
// Content Queue Bridge
// ============================================

/**
 * Queue a session capture for posting.
 * Moves vault item to content queue with caption.
 */
export async function queueCaptureForPosting(
  userId: string,
  captureId: string,
  platform: string,
  caption: string,
  scheduledFor?: string,
): Promise<string | null> {
  // Get the capture
  const { data: capture } = await supabase
    .from('session_captures')
    .select('*')
    .eq('user_id', userId)
    .eq('id', captureId)
    .single();

  if (!capture) return null;

  // Add to content queue
  const { data: queued, error } = await supabase
    .from('content_queue')
    .insert({
      user_id: userId,
      platform,
      content_type: `session_${capture.source_type}`,
      media_paths: [capture.media_url],
      caption,
      scheduled_for: scheduledFor ?? null,
      status: 'queued',
      is_text_only: false,
      handler_intent: `Session capture content from ${capture.source_type}`,
    })
    .select('id')
    .single();

  if (error || !queued) return null;

  // Update capture with queue reference
  await supabase
    .from('session_captures')
    .update({
      queued_for_post: true,
      content_queue_id: queued.id,
    })
    .eq('id', captureId);

  return queued.id;
}

// ============================================
// Query Functions
// ============================================

/**
 * Get captures for a session.
 */
export async function getSessionCaptures(
  userId: string,
  sessionId: string,
): Promise<SessionCapture[]> {
  const { data, error } = await supabase
    .from('session_captures')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('timestamp_seconds', { ascending: true });

  if (error || !data) return [];
  return data.map(mapSessionCapture);
}

/**
 * Get unqueued captures (ready for content).
 */
export async function getUnqueuedCaptures(
  userId: string,
  limit = 20,
): Promise<SessionCapture[]> {
  const { data, error } = await supabase
    .from('session_captures')
    .select('*')
    .eq('user_id', userId)
    .eq('queued_for_post', false)
    .not('vault_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapSessionCapture);
}

/**
 * Get before/after pairs for a session.
 */
export async function getBeforeAfterPair(
  userId: string,
  sessionId: string,
): Promise<BeforeAfterPair> {
  const captures = await getSessionCaptures(userId, sessionId);

  const before = captures.find(c => c.captureType === 'before_after') ?? null;
  const after = captures.find(c => c.captureType === 'reaction') ?? null;

  return {
    before,
    after,
    sessionId,
    sourceType: captures[0]?.sourceType ?? 'edge_session',
  };
}

/**
 * Get capture stats for Handler context.
 */
export async function getCaptureStats(userId: string): Promise<{
  totalCaptures: number;
  unqueuedCaptures: number;
  capturesByType: Record<string, number>;
  capturesBySource: Record<string, number>;
}> {
  const { data } = await supabase
    .from('session_captures')
    .select('capture_type, source_type, queued_for_post')
    .eq('user_id', userId);

  if (!data) return { totalCaptures: 0, unqueuedCaptures: 0, capturesByType: {}, capturesBySource: {} };

  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let unqueued = 0;

  for (const row of data) {
    byType[row.capture_type] = (byType[row.capture_type] ?? 0) + 1;
    bySource[row.source_type] = (bySource[row.source_type] ?? 0) + 1;
    if (!row.queued_for_post) unqueued++;
  }

  return {
    totalCaptures: data.length,
    unqueuedCaptures: unqueued,
    capturesByType: byType,
    capturesBySource: bySource,
  };
}

/**
 * Build context for Handler AI prompts.
 */
export async function buildSessionCaptureContext(userId: string): Promise<string> {
  try {
    const stats = await getCaptureStats(userId);
    if (stats.totalCaptures === 0) return '';

    const parts = [`SESSION CAPTURES: ${stats.totalCaptures} total, ${stats.unqueuedCaptures} unqueued`];
    const sources = Object.entries(stats.capturesBySource)
      .map(([k, v]) => `${k.replace('_session', '')}: ${v}`)
      .join(', ');
    if (sources) parts.push(`  sources: ${sources}`);

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// Mapper
// ============================================

interface DbSessionCapture {
  id: string;
  user_id: string;
  session_id: string;
  source_type: string;
  capture_type: string;
  media_url: string;
  media_type: string;
  timestamp_seconds: number | null;
  description: string | null;
  vault_id: string | null;
  queued_for_post: boolean;
  content_queue_id: string | null;
  created_at: string;
}

function mapSessionCapture(row: DbSessionCapture): SessionCapture {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    sourceType: row.source_type as SessionSourceType,
    captureType: row.capture_type as CaptureType,
    mediaUrl: row.media_url,
    mediaType: row.media_type as 'image' | 'video' | 'audio',
    timestampSeconds: row.timestamp_seconds,
    description: row.description,
    vaultId: row.vault_id,
    queuedForPost: row.queued_for_post,
    contentQueueId: row.content_queue_id,
    createdAt: row.created_at,
  };
}
