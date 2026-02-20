/**
 * Voice Training — Recordings
 *
 * Own-voice recording management for conditioning playback.
 * Records during drills, stores baselines, provides playback during arousal sessions.
 */

import { supabase } from '../supabase';
import type {
  VoiceRecording,
  RecordingContext,
  DbVoiceRecording,
} from '../../types/voice-training';
import { mapDbRecording } from '../../types/voice-training';

// ── Save a recording ────────────────────────────────

export async function saveRecording(
  userId: string,
  recording: {
    recordingUrl: string;
    durationSeconds: number;
    context: RecordingContext;
    pitchAvgHz?: number;
    transcript?: string;
    isBaseline?: boolean;
    levelAtRecording?: number;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('voice_recordings')
    .insert({
      user_id: userId,
      recording_url: recording.recordingUrl,
      duration_seconds: recording.durationSeconds,
      context: recording.context,
      pitch_avg_hz: recording.pitchAvgHz || null,
      transcript: recording.transcript || null,
      is_baseline: recording.isBaseline || false,
      level_at_recording: recording.levelAtRecording || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[recordings] saveRecording error:', error);
    return null;
  }

  return data.id;
}

// ── Get recordings ──────────────────────────────────

export async function getRecordings(
  userId: string,
  limit: number = 20
): Promise<VoiceRecording[]> {
  const { data, error } = await supabase
    .from('voice_recordings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[recordings] getRecordings error:', error);
    return [];
  }

  return (data as DbVoiceRecording[]).map(mapDbRecording);
}

export async function getBaseline(userId: string): Promise<VoiceRecording | null> {
  const { data, error } = await supabase
    .from('voice_recordings')
    .select('*')
    .eq('user_id', userId)
    .eq('is_baseline', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapDbRecording(data as DbVoiceRecording);
}

export async function getLatestRecording(userId: string): Promise<VoiceRecording | null> {
  const { data, error } = await supabase
    .from('voice_recordings')
    .select('*')
    .eq('user_id', userId)
    .eq('is_baseline', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapDbRecording(data as DbVoiceRecording);
}

/**
 * Get recordings suitable for own-voice conditioning during arousal sessions.
 * Returns the best recordings at current level: highest pitch, most recent.
 */
export async function getConditioningRecordings(
  userId: string,
  limit: number = 5
): Promise<VoiceRecording[]> {
  const { data, error } = await supabase
    .from('voice_recordings')
    .select('*')
    .eq('user_id', userId)
    .eq('is_baseline', false)
    .not('pitch_avg_hz', 'is', null)
    .order('pitch_avg_hz', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[recordings] getConditioningRecordings error:', error);
    return [];
  }

  return (data as DbVoiceRecording[]).map(mapDbRecording);
}

// ── Delete a recording ──────────────────────────────

export async function deleteRecording(userId: string, recordingId: string): Promise<boolean> {
  const { error } = await supabase
    .from('voice_recordings')
    .delete()
    .eq('id', recordingId)
    .eq('user_id', userId);

  if (error) {
    console.error('[recordings] deleteRecording error:', error);
    return false;
  }

  return true;
}

// ── Recording count ─────────────────────────────────

export async function getRecordingCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('voice_recordings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return 0;
  return count || 0;
}
