// ============================================
// Cam Live Session Management
// Granular lifecycle: scheduled → preparing → live → ended
// Uses migration 070 columns for timestamps and live metrics
// ============================================

import { supabase } from '../supabase';
import type {
  CamSession,
  DbCamSession,
  CamStatus,
  HandlerAction,
  TipGoal,
} from '../../types/cam';
import { mapDbToCamSession } from '../../types/cam';

// ============================================
// Prep Phase
// ============================================

export async function startPrep(
  sessionId: string,
  prescription?: {
    prescribedMakeup?: string;
    prescribedSetup?: string;
    denialDay?: number;
    tipGoals?: TipGoal[];
  }
): Promise<CamSession | null> {
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {
    status: 'preparing' as CamStatus,
    prep_started_at: now,
    updated_at: now,
  };

  if (prescription) {
    if (prescription.prescribedMakeup) updates.prescribed_makeup = prescription.prescribedMakeup;
    if (prescription.prescribedSetup) updates.prescribed_setup = prescription.prescribedSetup;
    if (prescription.denialDay != null) updates.denial_day = prescription.denialDay;
    if (prescription.tipGoals) updates.tip_goals = prescription.tipGoals;
  }

  const { data } = await supabase
    .from('cam_sessions')
    .update(updates)
    .eq('id', sessionId)
    .select()
    .single();

  if (!data) return null;
  return mapDbToCamSession(data as DbCamSession);
}

// ============================================
// Go Live
// ============================================

export async function goLive(
  sessionId: string,
  streamUrl?: string
): Promise<CamSession | null> {
  const now = new Date().toISOString();

  const { data } = await supabase
    .from('cam_sessions')
    .update({
      status: 'live' as CamStatus,
      live_started_at: now,
      started_at: now, // Also set legacy started_at
      stream_url: streamUrl || null,
      is_recording: true,
      updated_at: now,
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (!data) return null;
  return mapDbToCamSession(data as DbCamSession);
}

// ============================================
// End Session
// ============================================

export async function endLive(
  sessionId: string,
  recordingUrl?: string
): Promise<CamSession | null> {
  const now = new Date().toISOString();

  // First get current session for duration calc
  const { data: current } = await supabase
    .from('cam_sessions')
    .select('live_started_at')
    .eq('id', sessionId)
    .single();

  let durationSeconds: number | undefined;
  if (current?.live_started_at) {
    durationSeconds = Math.round(
      (new Date(now).getTime() - new Date(current.live_started_at).getTime()) / 1000
    );
  }

  const { data } = await supabase
    .from('cam_sessions')
    .update({
      status: 'ended' as CamStatus,
      live_ended_at: now,
      ended_at: now,
      is_recording: false,
      recording_url: recordingUrl || null,
      recording_duration_seconds: durationSeconds || null,
      actual_duration_minutes: durationSeconds ? Math.round(durationSeconds / 60) : null,
      updated_at: now,
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (!data) return null;
  return mapDbToCamSession(data as DbCamSession);
}

// ============================================
// Live Metrics Updates
// ============================================

export async function incrementEdgeCount(sessionId: string): Promise<void> {
  const { data: session } = await supabase
    .from('cam_sessions')
    .select('edge_count')
    .eq('id', sessionId)
    .single();

  if (!session) return;

  await supabase
    .from('cam_sessions')
    .update({
      edge_count: (session.edge_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

export async function logHandlerAction(
  sessionId: string,
  action: string,
  details: string
): Promise<void> {
  const { data: session } = await supabase
    .from('cam_sessions')
    .select('handler_actions')
    .eq('id', sessionId)
    .single();

  if (!session) return;

  const actions = (session.handler_actions as HandlerAction[]) || [];
  actions.push({
    timestamp: new Date().toISOString(),
    action,
    details,
  });

  await supabase
    .from('cam_sessions')
    .update({
      handler_actions: actions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

// ============================================
// Session Elapsed Time
// ============================================

export function getSessionElapsedSeconds(session: CamSession): number {
  if (!session.liveStartedAt) return 0;
  const end = session.liveEndedAt || new Date().toISOString();
  return Math.round(
    (new Date(end).getTime() - new Date(session.liveStartedAt).getTime()) / 1000
  );
}

export function getSessionElapsedMinutes(session: CamSession): number {
  return Math.round(getSessionElapsedSeconds(session) / 60);
}

// ============================================
// Active Session Query
// ============================================

export async function getActiveLiveSession(userId: string): Promise<CamSession | null> {
  const { data } = await supabase
    .from('cam_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['preparing', 'live'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;
  return mapDbToCamSession(data as DbCamSession);
}
