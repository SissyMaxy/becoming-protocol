/**
 * Hypno Session Event Logger
 *
 * Runs during active hypno sessions.
 * Logs events to hypno_session_events in real-time.
 * Auto-logs start on mount, end on unmount.
 */

import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { SessionEventType } from '../types/hypno-session';

interface UseHypnoSessionLoggerReturn {
  logEvent: (type: SessionEventType, data?: EventData) => Promise<void>;
  logVideoChange: (videoId: string) => Promise<void>;
  logSkip: (videoId: string) => Promise<void>;
  logArousalPeak: (level: number, videoId?: string) => Promise<void>;
  logTranceFlag: (notes?: string) => Promise<void>;
  logCommitment: (commitmentText: string) => Promise<void>;
  logAnchorTrigger: (anchorId: string) => Promise<void>;
  logLovenseChange: (intensity: number) => Promise<void>;
}

interface EventData {
  hypno_library_id?: string;
  lovense_intensity?: number;
  device_data?: Record<string, unknown>;
  notes?: string;
}

export function useHypnoSessionLogger(sessionId: string): UseHypnoSessionLoggerReturn {
  const { user } = useAuth();
  const startLoggedRef = useRef(false);
  const currentVideoRef = useRef<string | null>(null);

  // Core event logger
  const logEvent = useCallback(async (type: SessionEventType, data?: EventData) => {
    if (!user?.id) return;

    try {
      await supabase.from('hypno_session_events').insert({
        user_id: user.id,
        session_id: sessionId,
        event_type: type,
        hypno_library_id: data?.hypno_library_id || null,
        timestamp: new Date().toISOString(),
        lovense_intensity: data?.lovense_intensity ?? null,
        device_data: data?.device_data || null,
        notes: data?.notes || null,
      });
    } catch (err) {
      console.error(`[SessionLogger] Failed to log ${type}:`, err);
    }
  }, [user?.id, sessionId]);

  // Auto-log start on mount
  useEffect(() => {
    if (!startLoggedRef.current && user?.id) {
      startLoggedRef.current = true;
      logEvent('start');
    }

    // Auto-log end on unmount
    return () => {
      if (startLoggedRef.current && user?.id) {
        logEvent('end');
      }
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Convenience: video change
  const logVideoChange = useCallback(async (videoId: string) => {
    if (videoId === currentVideoRef.current) return;
    currentVideoRef.current = videoId;
    await logEvent('video_change', { hypno_library_id: videoId });
  }, [logEvent]);

  // Convenience: skip (implicit rejection)
  const logSkip = useCallback(async (videoId: string) => {
    await logEvent('skip', { hypno_library_id: videoId });
  }, [logEvent]);

  // Convenience: arousal peak
  const logArousalPeak = useCallback(async (level: number, videoId?: string) => {
    await logEvent('arousal_peak', {
      hypno_library_id: videoId,
      notes: `peak_level:${level}`,
    });
  }, [logEvent]);

  // Convenience: trance flag
  const logTranceFlag = useCallback(async (notes?: string) => {
    await logEvent('trance_flag', { notes });
  }, [logEvent]);

  // Convenience: commitment extracted
  const logCommitment = useCallback(async (commitmentText: string) => {
    await logEvent('commitment_extracted', { notes: commitmentText });
  }, [logEvent]);

  // Convenience: anchor triggered
  const logAnchorTrigger = useCallback(async (anchorId: string) => {
    await logEvent('anchor_triggered', { notes: `anchor:${anchorId}` });
  }, [logEvent]);

  // Convenience: lovense intensity change
  const logLovenseChange = useCallback(async (intensity: number) => {
    await logEvent('lovense_intensity_change', { lovense_intensity: intensity });
  }, [logEvent]);

  return {
    logEvent,
    logVideoChange,
    logSkip,
    logArousalPeak,
    logTranceFlag,
    logCommitment,
    logAnchorTrigger,
    logLovenseChange,
  };
}
