// Arousal session management

import { supabase } from './supabase';
import { addPoints, getOrCreateRewardState } from './rewards';
import type {
  ArousalSession,
  DbArousalSession,
  SessionType,
  SessionStartInput,
  SessionCompleteInput,
  SessionGateStatus,
} from '../types/rewards';
import { SESSION_REQUIREMENTS, POINT_VALUES } from '../types/rewards';

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

// ============================================
// MAPPERS
// ============================================

function mapDbToSession(db: DbArousalSession): ArousalSession {
  return {
    id: db.id,
    userId: db.user_id,
    sessionType: db.session_type as SessionType,
    preArousalLevel: db.pre_arousal_level || undefined,
    activeAnchors: db.active_anchors || [],
    preNotes: db.pre_notes || undefined,
    contentId: db.content_id || undefined,
    contentStartedAt: db.content_started_at || undefined,
    contentDurationSeconds: db.content_duration_seconds || undefined,
    postArousalLevel: db.post_arousal_level || undefined,
    experienceQuality: db.experience_quality || undefined,
    anchorEffectiveness: db.anchor_effectiveness || undefined,
    postNotes: db.post_notes || undefined,
    startedAt: db.started_at,
    completedAt: db.completed_at || undefined,
    pointsAwarded: db.points_awarded,
    status: db.status as ArousalSession['status'],
  };
}

// ============================================
// SESSION GATE
// ============================================

/**
 * Get the current session gate status
 * Shows how many anchoring sessions needed to unlock reward session
 */
export async function getSessionGateStatus(): Promise<SessionGateStatus> {
  const userId = await getAuthUserId();

  // Ensure state exists and check for week reset
  await getOrCreateRewardState();

  const { data: state, error } = await supabase
    .from('user_reward_state')
    .select('anchoring_sessions_this_week, reward_sessions_this_week, week_start_date')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Failed to get session gate status:', error);
    throw error;
  }

  const anchoring = state.anchoring_sessions_this_week || 0;
  const rewardUsed = state.reward_sessions_this_week || 0;

  // Calculate how many reward sessions earned (1 per 3 anchoring)
  const rewardEarned = Math.floor(anchoring / SESSION_REQUIREMENTS.anchoringPerWeek);

  // Calculate week reset time
  const weekStart = state.week_start_date
    ? new Date(state.week_start_date)
    : new Date();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return {
    anchoringSessionsThisWeek: anchoring,
    requiredAnchoring: SESSION_REQUIREMENTS.anchoringPerWeek,
    rewardSessionsEarned: rewardEarned,
    rewardSessionsUsed: rewardUsed,
    canStartRewardSession: rewardUsed < rewardEarned,
    weekResetsAt: weekEnd.toISOString(),
  };
}

// ============================================
// SESSION CRUD
// ============================================

/**
 * Start a new session
 * Validates reward session eligibility
 */
export async function startSession(input: SessionStartInput): Promise<ArousalSession> {
  const userId = await getAuthUserId();

  // Validate reward session eligibility
  if (input.sessionType === 'reward') {
    const gate = await getSessionGateStatus();
    if (!gate.canStartRewardSession) {
      throw new Error(
        `Cannot start reward session. Need ${gate.requiredAnchoring - gate.anchoringSessionsThisWeek} more anchoring sessions.`
      );
    }
  }

  const { data, error } = await supabase
    .from('arousal_sessions')
    .insert({
      user_id: userId,
      session_type: input.sessionType,
      pre_arousal_level: input.preArousalLevel,
      active_anchors: input.activeAnchors,
      pre_notes: input.preNotes || null,
      status: 'in_progress',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to start session:', error);
    throw error;
  }

  return mapDbToSession(data as DbArousalSession);
}

/**
 * Get the current in-progress session (if any)
 */
export async function getCurrentSession(): Promise<ArousalSession | null> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('arousal_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1);

  if (error) {
    // Handle various "no data" errors gracefully
    console.error('Failed to get current session:', error);
    return null; // Return null instead of throwing to not break the app
  }

  if (!data || data.length === 0) return null;

  return mapDbToSession(data[0] as DbArousalSession);
}

/**
 * Update session with content playing info
 */
export async function setSessionContent(
  sessionId: string,
  contentId: string
): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('arousal_sessions')
    .update({
      content_id: contentId,
      content_started_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'in_progress');

  if (error) {
    console.error('Failed to set session content:', error);
    throw error;
  }
}

/**
 * Complete a session with post-session data
 * Awards points and updates session counters
 */
export async function completeSession(
  sessionId: string,
  input: SessionCompleteInput
): Promise<{ session: ArousalSession; pointsAwarded: number }> {
  const userId = await getAuthUserId();

  // Get the session
  const { data: session, error: sessionError } = await supabase
    .from('arousal_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (sessionError || !session) {
    console.error('Failed to get session:', sessionError);
    throw new Error('Session not found');
  }

  if (session.status !== 'in_progress') {
    throw new Error('Session is not in progress');
  }

  // Calculate points
  const basePoints = POINT_VALUES.session_complete;
  const qualityBonus = input.experienceQuality * 5; // 5-25 bonus
  const pointsAwarded = basePoints + qualityBonus;

  // Calculate content duration if content was played
  let contentDuration: number | null = null;
  if (session.content_started_at) {
    const startTime = new Date(session.content_started_at).getTime();
    contentDuration = Math.floor((Date.now() - startTime) / 1000);
  }

  // Update session
  const { error: updateError } = await supabase
    .from('arousal_sessions')
    .update({
      post_arousal_level: input.postArousalLevel,
      experience_quality: input.experienceQuality,
      anchor_effectiveness: input.anchorEffectiveness || null,
      post_notes: input.postNotes || null,
      completed_at: new Date().toISOString(),
      content_duration_seconds: contentDuration,
      points_awarded: pointsAwarded,
      status: 'completed',
    })
    .eq('id', sessionId);

  if (updateError) {
    console.error('Failed to update session:', updateError);
    throw updateError;
  }

  // Update reward state counters using RPC
  const fieldToUpdate = session.session_type === 'anchoring'
    ? 'anchoring_sessions_this_week'
    : 'reward_sessions_this_week';

  const { error: rpcError } = await supabase.rpc('increment_session_count', {
    p_user_id: userId,
    p_field: fieldToUpdate,
  });

  if (rpcError) {
    console.error('Failed to increment session count:', rpcError);
    // Don't throw - points are more important
  }

  // Award points
  await addPoints(pointsAwarded, 'session_complete', sessionId, {
    sessionType: session.session_type,
    experienceQuality: input.experienceQuality,
    arousalChange: input.postArousalLevel - session.pre_arousal_level,
  });

  // Log anchor effectiveness for each active anchor
  if (input.anchorEffectiveness && session.active_anchors?.length) {
    const arousalChange = input.postArousalLevel - session.pre_arousal_level;

    for (const anchorId of session.active_anchors) {
      await supabase.from('anchor_effectiveness_log').insert({
        user_id: userId,
        anchor_id: anchorId,
        session_id: sessionId,
        effectiveness_rating: input.anchorEffectiveness,
        arousal_change: arousalChange,
      });

      // Update anchor usage stats
      await supabase
        .from('user_anchors')
        .update({
          times_used: supabase.rpc('increment', { x: 1 }),
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', anchorId)
        .eq('user_id', userId);
    }
  }

  // Fetch updated session
  const { data: updatedSession } = await supabase
    .from('arousal_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  return {
    session: mapDbToSession(updatedSession as DbArousalSession),
    pointsAwarded,
  };
}

/**
 * Abandon a session without completing it
 */
export async function abandonSession(sessionId: string): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('arousal_sessions')
    .update({
      status: 'abandoned',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'in_progress');

  if (error) {
    console.error('Failed to abandon session:', error);
    throw error;
  }
}

// ============================================
// SESSION HISTORY
// ============================================

/**
 * Get session history
 */
export async function getSessionHistory(options?: {
  limit?: number;
  sessionType?: SessionType;
  status?: ArousalSession['status'];
}): Promise<ArousalSession[]> {
  const userId = await getAuthUserId();
  const limit = options?.limit || 50;

  let query = supabase
    .from('arousal_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (options?.sessionType) {
    query = query.eq('session_type', options.sessionType);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get session history:', error);
    throw error;
  }

  return (data as DbArousalSession[]).map(mapDbToSession);
}

/**
 * Get session stats
 */
export async function getSessionStats(): Promise<{
  totalSessions: number;
  anchoringSessions: number;
  rewardSessions: number;
  averageExperienceQuality: number;
  averageArousalIncrease: number;
  totalPointsEarned: number;
}> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('arousal_sessions')
    .select('session_type, experience_quality, pre_arousal_level, post_arousal_level, points_awarded')
    .eq('user_id', userId)
    .eq('status', 'completed');

  if (error) {
    console.error('Failed to get session stats:', error);
    throw error;
  }

  const sessions = data || [];
  const anchoringSessions = sessions.filter(s => s.session_type === 'anchoring').length;
  const rewardSessions = sessions.filter(s => s.session_type === 'reward').length;

  // Calculate averages
  const qualitySum = sessions.reduce((sum, s) => sum + (s.experience_quality || 0), 0);
  const arousalChanges = sessions
    .filter(s => s.pre_arousal_level && s.post_arousal_level)
    .map(s => s.post_arousal_level - s.pre_arousal_level);
  const arousalSum = arousalChanges.reduce((sum, c) => sum + c, 0);
  const pointsSum = sessions.reduce((sum, s) => sum + (s.points_awarded || 0), 0);

  return {
    totalSessions: sessions.length,
    anchoringSessions,
    rewardSessions,
    averageExperienceQuality: sessions.length > 0 ? qualitySum / sessions.length : 0,
    averageArousalIncrease: arousalChanges.length > 0 ? arousalSum / arousalChanges.length : 0,
    totalPointsEarned: pointsSum,
  };
}
