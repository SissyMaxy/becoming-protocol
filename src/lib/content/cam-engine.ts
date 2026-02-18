// ============================================
// Cam Engine
// Session management, prescription logic, tip-to-device
// ============================================

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type {
  CamSession,
  DbCamSession,
  CamRevenueEvent,
  DbCamRevenueEvent,
  CamPrescription,
  TipLevel,
  HandlerCamDirective,
  CamStatus,
} from '../../types/cam';
import { mapDbToCamSession, mapDbToCamRevenueEvent } from '../../types/cam';

// ============================================
// Default Tip-to-Device Mapping
// ============================================

export const DEFAULT_TIP_LEVELS: TipLevel[] = [
  { min: 1, max: 9, pattern: 'pulse_low', intensity: [3, 5], seconds: 5, label: 'Tickle' },
  { min: 10, max: 24, pattern: 'pulse_medium', intensity: [6, 10], seconds: 10, label: 'Buzz' },
  { min: 25, max: 49, pattern: 'wave_medium', intensity: [8, 14], seconds: 15, label: 'Wave' },
  { min: 50, max: 99, pattern: 'edge_build', intensity: [10, 16], seconds: 30, label: 'Surge' },
  { min: 100, max: null, pattern: 'edge_hold', intensity: [14, 20], seconds: 60, label: 'Overload' },
];

// ============================================
// Session CRUD
// ============================================

export async function createCamSession(
  userId: string,
  prescription: CamPrescription
): Promise<CamSession | null> {
  const { data, error } = await supabase
    .from('cam_sessions')
    .insert({
      user_id: userId,
      handler_prescribed: true,
      prescription_context: prescription.narrativeFraming,
      minimum_duration_minutes: prescription.minimumDuration,
      maximum_duration_minutes: prescription.maximumDuration,
      target_tip_goal_cents: prescription.targetTipGoal,
      platform: prescription.platform,
      room_type: prescription.roomType,
      tip_to_device_enabled: true,
      tip_levels: DEFAULT_TIP_LEVELS,
      handler_device_control: prescription.handlerControlled,
      allowed_activities: prescription.allowedActivities,
      required_activities: prescription.requiredActivities,
      outfit_directive: prescription.outfitDirective,
      voice_directive: prescription.voiceRequired ? 'Feminine voice required throughout' : undefined,
      edging_required: prescription.edgingRequired,
      denial_enforced: prescription.denialEnforced,
      feminine_voice_required: prescription.voiceRequired,
      fan_directive_suggestions: false, // Handler controls initially
      narrative_framing: prescription.narrativeFraming,
      pre_session_post: prescription.preSessionPost,
      status: 'scheduled',
    })
    .select()
    .single();

  if (error || !data) return null;
  return mapDbToCamSession(data as DbCamSession);
}

export async function getCamSession(sessionId: string): Promise<CamSession | null> {
  const { data } = await supabase
    .from('cam_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!data) return null;
  return mapDbToCamSession(data as DbCamSession);
}

export async function getUpcomingSessions(userId: string): Promise<CamSession[]> {
  const { data } = await supabase
    .from('cam_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['scheduled', 'preparing'])
    .order('scheduled_at', { ascending: true })
    .limit(10);

  return (data || []).map(d => mapDbToCamSession(d as DbCamSession));
}

export async function getRecentSessions(userId: string, limit = 10): Promise<CamSession[]> {
  const { data } = await supabase
    .from('cam_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['ended'])
    .order('ended_at', { ascending: false })
    .limit(limit);

  return (data || []).map(d => mapDbToCamSession(d as DbCamSession));
}

// ============================================
// Session Lifecycle
// ============================================

export async function startSession(sessionId: string): Promise<CamSession | null> {
  const { data } = await supabase
    .from('cam_sessions')
    .update({
      status: 'live' as CamStatus,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (!data) return null;
  return mapDbToCamSession(data as DbCamSession);
}

export async function endSession(
  sessionId: string,
  stats: {
    actualDurationMinutes: number;
    peakViewers?: number;
    newSubscribers?: number;
  }
): Promise<CamSession | null> {
  const { data } = await supabase
    .from('cam_sessions')
    .update({
      status: 'ended' as CamStatus,
      ended_at: new Date().toISOString(),
      actual_duration_minutes: stats.actualDurationMinutes,
      peak_viewers: stats.peakViewers,
      new_subscribers: stats.newSubscribers || 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (!data) return null;
  return mapDbToCamSession(data as DbCamSession);
}

export async function skipSession(sessionId: string): Promise<void> {
  await supabase
    .from('cam_sessions')
    .update({
      status: 'skipped' as CamStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

// ============================================
// Revenue Tracking
// ============================================

export async function recordCamRevenue(
  userId: string,
  sessionId: string,
  event: {
    eventType: CamRevenueEvent['eventType'];
    amountCents: number;
    fanIdentifier?: string;
    fanTier?: number;
    triggeredDevice?: boolean;
    devicePattern?: string;
    deviceDurationSeconds?: number;
  }
): Promise<void> {
  // Insert cam_revenue event
  await supabase.from('cam_revenue').insert({
    user_id: userId,
    session_id: sessionId,
    event_type: event.eventType,
    amount_cents: event.amountCents,
    fan_identifier: event.fanIdentifier,
    fan_tier: event.fanTier,
    triggered_device: event.triggeredDevice || false,
    device_pattern: event.devicePattern,
    device_duration_seconds: event.deviceDurationSeconds,
  });

  // Also insert into revenue_log for global tracking
  await supabase.from('revenue_log').insert({
    user_id: userId,
    source: event.eventType === 'tip' ? 'cam_tip' : event.eventType === 'private_show' ? 'cam_private' : 'cam_tip',
    platform: 'cam', // Will be updated with actual platform
    amount_cents: event.amountCents,
    cam_session_id: sessionId,
    fan_tier: event.fanTier,
  });

  // Update session totals
  if (event.eventType === 'tip') {
    // Increment tips total - use raw SQL via RPC if available, otherwise read-update
    const session = await getCamSession(sessionId);
    if (session) {
      await supabase
        .from('cam_sessions')
        .update({
          total_tips_cents: session.totalTipsCents + event.amountCents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    }
  } else if (event.eventType === 'private_show') {
    const session = await getCamSession(sessionId);
    if (session) {
      await supabase
        .from('cam_sessions')
        .update({
          total_privates_cents: session.totalPrivatesCents + event.amountCents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    }
  }
}

export async function getSessionRevenue(sessionId: string): Promise<CamRevenueEvent[]> {
  const { data } = await supabase
    .from('cam_revenue')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  return (data || []).map(d => mapDbToCamRevenueEvent(d as DbCamRevenueEvent));
}

// ============================================
// Tip-to-Device Mapping
// ============================================

export function getTipDeviceResponse(
  amountCents: number,
  customLevels?: TipLevel[]
): TipLevel | null {
  const levels = customLevels || DEFAULT_TIP_LEVELS;
  for (const level of levels) {
    if (amountCents >= level.min && (level.max === null || amountCents <= level.max)) {
      return level;
    }
  }
  return null;
}

// ============================================
// Handler Cam Prescription Logic
// ============================================

export interface CamPrescriptionInputs {
  denialDay: number;
  currentArousal: number;
  revenueCurrentMonthly: number;
  revenueMonthlyTarget: number;
  closestMilestonePercentFunded?: number;
  fanPollRequestsCam: boolean;
  fanCustomRequestsCam: boolean;
  arcNeedsCamBeat: boolean;
  consequenceDaysSinceCompliance: number;
  recentVaultSubmissions: number;
  isPrivateTime: boolean;
  privateHoursRemaining: number;
}

export function shouldPrescribeCam(inputs: CamPrescriptionInputs): CamPrescription | null {
  let score = 0;

  // Revenue signals
  if (inputs.revenueCurrentMonthly < inputs.revenueMonthlyTarget * 0.8) score += 3;
  if (inputs.closestMilestonePercentFunded && inputs.closestMilestonePercentFunded > 0.7) score += 2;

  // Fan demand
  if (inputs.fanPollRequestsCam) score += 3;
  if (inputs.fanCustomRequestsCam) score += 2;

  // Optimal state for content
  if (inputs.denialDay >= 5) score += 2;
  if (inputs.currentArousal >= 3) score += 1;

  // Arc needs cam beat
  if (inputs.arcNeedsCamBeat) score += 3;

  // Consequence pressure
  if (inputs.consequenceDaysSinceCompliance >= 2) score += 2;

  // Vault needs content
  if (inputs.recentVaultSubmissions < 3) score += 1;

  // Hard blockers
  if (!inputs.isPrivateTime) return null;
  if (inputs.privateHoursRemaining < 1) return null;

  if (score < 5) return null;

  // Generate prescription
  return {
    minimumDuration: inputs.denialDay >= 7 ? 45 : 30,
    maximumDuration: 120,
    targetTipGoal: Math.max(5000, Math.round(inputs.revenueMonthlyTarget * 0.1)),
    platform: 'fansly',
    roomType: 'public',
    requiredActivities: buildRequiredActivities(inputs),
    allowedActivities: ['chat', 'device_control', 'voice', 'outfit_change', 'edge', 'tease'],
    voiceRequired: true,
    denialEnforced: true,
    handlerControlled: true,
    edgingRequired: inputs.denialDay >= 3,
    isConsequence: inputs.consequenceDaysSinceCompliance >= 2,
    consequenceTier: inputs.consequenceDaysSinceCompliance >= 2 ? 9 : undefined,
  };
}

function buildRequiredActivities(inputs: CamPrescriptionInputs): string[] {
  const activities: string[] = ['greet_fans', 'feminine_voice'];

  if (inputs.denialDay >= 5) activities.push('denial_update');
  if (inputs.currentArousal >= 3) activities.push('edge_session');
  if (inputs.recentVaultSubmissions < 3) activities.push('content_capture');

  return activities;
}

// ============================================
// Handler Directives (During Live Session)
// ============================================

export async function getHandlerDirective(
  sessionId: string,
  context: {
    minutesElapsed: number;
    currentViewers: number;
    totalTips: number;
    tipGoal: number;
    denialDay: number;
  }
): Promise<HandlerCamDirective | null> {
  try {
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'cam_directive',
      session_id: sessionId,
      minutes_elapsed: context.minutesElapsed,
      current_viewers: context.currentViewers,
      total_tips: context.totalTips,
      tip_goal: context.tipGoal,
      denial_day: context.denialDay,
    });

    if (error) throw error;
    const result = data as Record<string, unknown> | null;
    if (result?.message) {
      return {
        message: result.message as string,
        priority: (result.priority as 'normal' | 'urgent') || 'normal',
        complianceTimeoutSeconds: result.timeout as number | undefined,
        timestamp: new Date().toISOString(),
      };
    }
  } catch {
    // Fallback to template directives
  }

  return getTemplateDirective(context);
}

function getTemplateDirective(context: {
  minutesElapsed: number;
  currentViewers: number;
  totalTips: number;
  tipGoal: number;
  denialDay: number;
}): HandlerCamDirective | null {
  const { minutesElapsed, currentViewers, totalTips, tipGoal } = context;

  // Time-based directives
  if (minutesElapsed === 5) {
    return {
      message: `${currentViewers} watching. Greet them. You're Maxy tonight.`,
      priority: 'normal',
      timestamp: new Date().toISOString(),
    };
  }

  if (minutesElapsed === 15 && totalTips < tipGoal * 0.2) {
    return {
      message: 'Tips are slow. Tell them what they\'re funding. Make it personal.',
      priority: 'normal',
      timestamp: new Date().toISOString(),
    };
  }

  if (minutesElapsed === 30) {
    return {
      message: `30 minutes. ${Math.round((totalTips / tipGoal) * 100)}% of tip goal. Keep going.`,
      priority: 'normal',
      timestamp: new Date().toISOString(),
    };
  }

  if (totalTips >= tipGoal && tipGoal > 0) {
    return {
      message: 'Tip goal hit. Good girl. You can wrap up when ready.',
      priority: 'urgent',
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

// ============================================
// Session Recording → Vault Pipeline
// ============================================

export async function linkRecordingToVault(
  sessionId: string,
  vaultItemId: string
): Promise<void> {
  await supabase
    .from('cam_sessions')
    .update({
      recording_saved: true,
      recording_vault_id: vaultItemId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

export async function addHighlightToSession(
  sessionId: string,
  vaultItemId: string
): Promise<void> {
  const session = await getCamSession(sessionId);
  if (!session) return;

  const highlights = [...(session.highlightVaultIds || []), vaultItemId];
  await supabase
    .from('cam_sessions')
    .update({
      highlight_vault_ids: highlights,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

// ============================================
// Cam Session Stats
// ============================================

export async function getCamStats(userId: string): Promise<{
  totalSessions: number;
  totalRevenueCents: number;
  avgDurationMinutes: number;
  avgTipsCents: number;
  avgViewers: number;
}> {
  const { data } = await supabase
    .from('cam_sessions')
    .select('actual_duration_minutes, total_tips_cents, total_privates_cents, peak_viewers')
    .eq('user_id', userId)
    .eq('status', 'ended');

  if (!data || data.length === 0) {
    return { totalSessions: 0, totalRevenueCents: 0, avgDurationMinutes: 0, avgTipsCents: 0, avgViewers: 0 };
  }

  const totalSessions = data.length;
  const totalRevenue = data.reduce((sum, s) => sum + (s.total_tips_cents || 0) + (s.total_privates_cents || 0), 0);
  const avgDuration = data.reduce((sum, s) => sum + (s.actual_duration_minutes || 0), 0) / totalSessions;
  const avgTips = data.reduce((sum, s) => sum + (s.total_tips_cents || 0), 0) / totalSessions;
  const avgViewers = data.reduce((sum, s) => sum + (s.peak_viewers || 0), 0) / totalSessions;

  return {
    totalSessions,
    totalRevenueCents: totalRevenue,
    avgDurationMinutes: Math.round(avgDuration),
    avgTipsCents: Math.round(avgTips),
    avgViewers: Math.round(avgViewers),
  };
}
