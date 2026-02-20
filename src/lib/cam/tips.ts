// ============================================
// Cam Tips — Per-Tip Logging & Device Response
// Real-time tip processing with cam_tips table
// ============================================

import { supabase } from '../supabase';
import type {
  CamTip,
  DbCamTip,
  TipLevel,
  TipGoal,
} from '../../types/cam';
import { mapDbToCamTip } from '../../types/cam';

// ============================================
// Edge2 Spec Tip Levels (with device channels)
// ============================================

export const TIP_LEVELS: TipLevel[] = [
  { min: 1, max: 9, pattern: 'pulse_low', intensity: [3, 5], seconds: 5, label: 'Tickle', edge2Channel: 'v1' },
  { min: 10, max: 24, pattern: 'pulse_medium', intensity: [6, 10], seconds: 10, label: 'Buzz', edge2Channel: 'v1' },
  { min: 25, max: 49, pattern: 'wave_medium', intensity: [8, 14], seconds: 15, label: 'Wave', edge2Channel: 'v1:v2' },
  { min: 50, max: 99, pattern: 'edge_build', intensity: [10, 16], seconds: 30, label: 'Surge', edge2Channel: 'v1:v2' },
  { min: 100, max: 199, pattern: 'edge_hold', intensity: [14, 20], seconds: 60, label: 'Overload', edge2Channel: 'v1:v2' },
  { min: 200, max: null, pattern: 'edge_max', intensity: [18, 20], seconds: 90, label: 'Meltdown', edge2Channel: 'v1:v2' },
];

// ============================================
// Tip Processing
// ============================================

export function matchTipLevel(tokenAmount: number, customLevels?: TipLevel[]): TipLevel | null {
  const levels = customLevels || TIP_LEVELS;
  for (const level of levels) {
    if (tokenAmount >= level.min && (level.max === null || tokenAmount <= level.max)) {
      return level;
    }
  }
  return null;
}

export interface ProcessedTip {
  tip: CamTip;
  level: TipLevel | null;
  shouldTriggerDevice: boolean;
}

export async function processTip(
  userId: string,
  sessionId: string,
  tipData: {
    tipperUsername?: string;
    tipperPlatform?: string;
    tokenAmount: number;
    tipAmountUsd?: number;
    sessionTimestampSeconds?: number;
  },
  customLevels?: TipLevel[]
): Promise<ProcessedTip> {
  const level = matchTipLevel(tipData.tokenAmount, customLevels);

  const { data, error } = await supabase
    .from('cam_tips')
    .insert({
      user_id: userId,
      cam_session_id: sessionId,
      tipper_username: tipData.tipperUsername || null,
      tipper_platform: tipData.tipperPlatform || null,
      token_amount: tipData.tokenAmount,
      tip_amount_usd: tipData.tipAmountUsd || null,
      pattern_triggered: level?.pattern || null,
      device_response_sent: !!level,
      session_timestamp_seconds: tipData.sessionTimestampSeconds || null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to record tip: ${error?.message || 'unknown'}`);
  }

  // Update session tip_count
  await supabase.rpc('increment_field', {
    table_name: 'cam_sessions',
    field_name: 'tip_count',
    row_id: sessionId,
  }).then(undefined, () => {
    // Fallback: read-update if RPC not available
    return supabase
      .from('cam_sessions')
      .select('tip_count')
      .eq('id', sessionId)
      .single()
      .then(({ data: session }) => {
        if (session) {
          return supabase
            .from('cam_sessions')
            .update({
              tip_count: (session.tip_count || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId);
        }
      });
  });

  return {
    tip: mapDbToCamTip(data as DbCamTip),
    level,
    shouldTriggerDevice: !!level,
  };
}

// ============================================
// Tip Queries
// ============================================

export async function getSessionTips(sessionId: string): Promise<CamTip[]> {
  const { data } = await supabase
    .from('cam_tips')
    .select('*')
    .eq('cam_session_id', sessionId)
    .order('created_at', { ascending: true });

  return (data || []).map(d => mapDbToCamTip(d as DbCamTip));
}

export async function getSessionTipTotal(sessionId: string): Promise<{
  totalTokens: number;
  totalUsd: number;
  tipCount: number;
}> {
  const { data } = await supabase
    .from('cam_tips')
    .select('token_amount, tip_amount_usd')
    .eq('cam_session_id', sessionId);

  if (!data || data.length === 0) {
    return { totalTokens: 0, totalUsd: 0, tipCount: 0 };
  }

  return {
    totalTokens: data.reduce((sum, t) => sum + (t.token_amount || 0), 0),
    totalUsd: data.reduce((sum, t) => sum + (t.tip_amount_usd || 0), 0),
    tipCount: data.length,
  };
}

// ============================================
// Tip Goal Tracking
// ============================================

export function checkTipGoals(
  currentTotalTokens: number,
  goals: TipGoal[]
): Array<TipGoal & { justReached: boolean }> {
  return goals.map(goal => {
    const wasReached = goal.reached;
    const nowReached = currentTotalTokens >= goal.targetTokens;
    return {
      ...goal,
      currentTokens: currentTotalTokens,
      reached: nowReached,
      justReached: !wasReached && nowReached,
    };
  });
}
