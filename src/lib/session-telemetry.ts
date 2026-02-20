/**
 * Session Telemetry — Summary Builder
 *
 * Builds hypno_session_summary from logged events + user input.
 * Called after the post-session check-in.
 */

import { supabase } from './supabase';
import type { PostSessionCheckIn } from '../types/hypno-session';

/**
 * Build and save session summary from events + check-in data.
 * Auto-populates from events: videos_played, videos_skipped,
 * peak_arousal, duration, ritual_anchors_active.
 * User provides: trance_depth (1-5) and optional mood text.
 */
export async function buildSessionSummary(
  userId: string,
  sessionId: string,
  denialDay: number,
  checkIn: PostSessionCheckIn,
  playlistId?: string,
): Promise<void> {
  // Fetch all events for this session
  const { data: events } = await supabase
    .from('hypno_session_events')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('timestamp', { ascending: true });

  if (!events || events.length === 0) return;

  // Extract start/end timestamps
  const startEvent = events.find(e => e.event_type === 'start');
  const endEvent = [...events].reverse().find((e: { event_type: string }) => e.event_type === 'end');
  const startedAt = startEvent?.timestamp || events[0].timestamp;
  const endedAt = endEvent?.timestamp || events[events.length - 1].timestamp;

  // Calculate duration
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  // Collect videos played and skipped
  const videosPlayed: string[] = [];
  const videosSkipped: string[] = [];
  for (const e of events) {
    if (e.event_type === 'video_change' && e.hypno_library_id) {
      if (!videosPlayed.includes(e.hypno_library_id)) {
        videosPlayed.push(e.hypno_library_id);
      }
    }
    if (e.event_type === 'skip' && e.hypno_library_id) {
      if (!videosSkipped.includes(e.hypno_library_id)) {
        videosSkipped.push(e.hypno_library_id);
      }
    }
  }

  // Find peak arousal
  const arousalEvents = events.filter(e => e.event_type === 'arousal_peak');
  let peakArousalLevel = 0;
  let peakArousalVideo: string | null = null;
  let peakArousalTimestamp: string | null = null;
  for (const e of arousalEvents) {
    const level = parseInt(e.notes?.replace('peak_level:', '') || '0');
    if (level > peakArousalLevel) {
      peakArousalLevel = level;
      peakArousalVideo = e.hypno_library_id || null;
      peakArousalTimestamp = e.timestamp;
    }
  }

  // Collect active ritual anchors
  const anchorIds: string[] = [];
  for (const e of events) {
    if (e.event_type === 'anchor_triggered' && e.notes) {
      const id = e.notes.replace('anchor:', '');
      if (!anchorIds.includes(id)) {
        anchorIds.push(id);
      }
    }
  }

  // Check for commitment extraction
  const commitmentEvent = events.find(e => e.event_type === 'commitment_extracted');
  const commitmentExtracted = !!commitmentEvent;
  const commitmentText = commitmentEvent?.notes || null;

  // Insert summary
  await supabase.from('hypno_session_summary').insert({
    user_id: userId,
    session_id: sessionId,
    started_at: startedAt,
    ended_at: endedAt,
    total_duration_minutes: durationMinutes,
    denial_day_at_session: denialDay,
    videos_played: videosPlayed,
    videos_skipped: videosSkipped,
    peak_arousal_level: peakArousalLevel,
    peak_arousal_video: peakArousalVideo,
    peak_arousal_timestamp: peakArousalTimestamp,
    trance_depth_self_report: checkIn.trance_depth,
    post_session_mood: checkIn.mood || null,
    commitment_extracted: commitmentExtracted,
    commitment_text: commitmentText,
    content_captured: false,
    capture_clip_count: 0,
    ritual_anchors_active: anchorIds,
    playlist_id: playlistId || null,
  });
}

/**
 * Get the most recent session summary for a user.
 */
export async function getLastSessionSummary(userId: string) {
  const { data } = await supabase
    .from('hypno_session_summary')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  return data;
}

/**
 * Get session summaries for a date range.
 */
export async function getSessionSummaries(
  userId: string,
  since: string,
  limit = 10,
) {
  const { data } = await supabase
    .from('hypno_session_summary')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(limit);

  return data || [];
}
