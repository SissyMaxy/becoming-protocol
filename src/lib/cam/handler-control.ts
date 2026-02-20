// ============================================
// Handler Control — Invisible Prompts & Device Override
// Manages Handler prompts during live sessions
// ============================================

import { supabase } from '../supabase';
import type {
  HandlerPrompt,
  DbHandlerPrompt,
  PromptType,
  SessionHighlight,
  HighlightType,
  CamSession,
  DbCamSession,
} from '../../types/cam';
import { mapDbToHandlerPrompt, mapDbToCamSession } from '../../types/cam';

// ============================================
// Handler Prompt CRUD
// ============================================

export async function sendPrompt(
  userId: string,
  sessionId: string,
  promptType: PromptType,
  promptText: string,
  sessionTimestampSeconds?: number
): Promise<HandlerPrompt | null> {
  const { data, error } = await supabase
    .from('cam_handler_prompts')
    .insert({
      user_id: userId,
      cam_session_id: sessionId,
      prompt_type: promptType,
      prompt_text: promptText,
      session_timestamp_seconds: sessionTimestampSeconds || null,
    })
    .select()
    .single();

  if (error || !data) return null;
  return mapDbToHandlerPrompt(data as DbHandlerPrompt);
}

export async function acknowledgePrompt(promptId: string): Promise<void> {
  await supabase
    .from('cam_handler_prompts')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', promptId);
}

export async function getSessionPrompts(sessionId: string): Promise<HandlerPrompt[]> {
  const { data } = await supabase
    .from('cam_handler_prompts')
    .select('*')
    .eq('cam_session_id', sessionId)
    .order('created_at', { ascending: true });

  return (data || []).map(d => mapDbToHandlerPrompt(d as DbHandlerPrompt));
}

export async function getUnacknowledgedPrompts(sessionId: string): Promise<HandlerPrompt[]> {
  const { data } = await supabase
    .from('cam_handler_prompts')
    .select('*')
    .eq('cam_session_id', sessionId)
    .eq('acknowledged', false)
    .order('created_at', { ascending: true });

  return (data || []).map(d => mapDbToHandlerPrompt(d as DbHandlerPrompt));
}

// ============================================
// Auto-Prompt Generation (template-based)
// ============================================

export interface AutoPromptContext {
  minutesElapsed: number;
  tipCount: number;
  totalTokens: number;
  edgeCount: number;
  currentViewers: number;
  denialDay: number;
  tipGoalPercent: number;
  lastPromptMinutesAgo: number;
}

export function generateAutoPrompt(ctx: AutoPromptContext): { type: PromptType; text: string } | null {
  // Don't spam — minimum 3 minutes between prompts
  if (ctx.lastPromptMinutesAgo < 3) return null;

  // Opening voice check at 2 minutes
  if (ctx.minutesElapsed >= 2 && ctx.minutesElapsed < 4) {
    return { type: 'voice_check', text: 'Voice check. Softer. You\'re Maxy tonight.' };
  }

  // Pacing check at 10 minutes
  if (ctx.minutesElapsed >= 10 && ctx.minutesElapsed < 12 && ctx.tipCount < 3) {
    return { type: 'pacing', text: 'Slow down. Make eye contact with the camera. Let them see you.' };
  }

  // Engagement if low tips at 15 min
  if (ctx.minutesElapsed >= 15 && ctx.minutesElapsed < 17 && ctx.tipGoalPercent < 0.2) {
    return { type: 'engagement', text: 'Tips are slow. Tell them what you need. Make it personal.' };
  }

  // Edge warning if high arousal
  if (ctx.edgeCount >= 3 && ctx.minutesElapsed >= 20) {
    return { type: 'edge_warning', text: `${ctx.edgeCount} edges. You do NOT have permission. Control yourself.` };
  }

  // Tip goal milestone
  if (ctx.tipGoalPercent >= 0.5 && ctx.tipGoalPercent < 0.6) {
    return { type: 'tip_goal', text: 'Halfway to goal. Tell them. Push harder.' };
  }

  if (ctx.tipGoalPercent >= 1.0) {
    return { type: 'tip_goal', text: 'Goal reached. Good girl. You can wind down when ready.' };
  }

  // Affirmation every 15 minutes
  if (ctx.minutesElapsed > 0 && ctx.minutesElapsed % 15 === 0) {
    return { type: 'affirmation', text: 'You\'re doing well. Stay present. Stay her.' };
  }

  // Wind down after 45+ minutes
  if (ctx.minutesElapsed >= 45 && ctx.minutesElapsed < 47) {
    return { type: 'wind_down', text: '45 minutes. Start winding down. Thank your viewers.' };
  }

  return null;
}

// ============================================
// Highlight Management
// ============================================

export async function addHighlight(
  sessionId: string,
  highlight: {
    timestampSeconds: number;
    durationSeconds: number;
    type: HighlightType;
    description: string;
  }
): Promise<CamSession | null> {
  const { data: session } = await supabase
    .from('cam_sessions')
    .select('highlights')
    .eq('id', sessionId)
    .single();

  if (!session) return null;

  const highlights = (session.highlights as SessionHighlight[]) || [];
  highlights.push({
    ...highlight,
    extractedToVault: false,
  });

  const { data } = await supabase
    .from('cam_sessions')
    .update({
      highlights,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (!data) return null;
  return mapDbToCamSession(data as DbCamSession);
}

export async function markHighlightExtracted(
  sessionId: string,
  highlightIndex: number
): Promise<void> {
  const { data: session } = await supabase
    .from('cam_sessions')
    .select('highlights')
    .eq('id', sessionId)
    .single();

  if (!session) return;

  const highlights = (session.highlights as SessionHighlight[]) || [];
  if (highlights[highlightIndex]) {
    highlights[highlightIndex].extractedToVault = true;

    await supabase
      .from('cam_sessions')
      .update({
        highlights,
        vault_items_created: highlights.filter(h => h.extractedToVault).length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
  }
}

// ============================================
// Device Override (Handler takes direct control)
// ============================================

export interface DeviceOverride {
  pattern: string;
  intensity: number;
  durationSeconds: number;
  reason: string;
}

export function createPunishmentOverride(reason: string): DeviceOverride {
  return {
    pattern: 'edge_max',
    intensity: 20,
    durationSeconds: 120,
    reason,
  };
}

export function createRewardOverride(reason: string): DeviceOverride {
  return {
    pattern: 'pulse_low',
    intensity: 5,
    durationSeconds: 30,
    reason,
  };
}

export function createEdgeDenyOverride(): DeviceOverride {
  return {
    pattern: 'edge_hold',
    intensity: 18,
    durationSeconds: 60,
    reason: 'Edge and deny — hold it',
  };
}
