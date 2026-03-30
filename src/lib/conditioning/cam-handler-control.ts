/**
 * Cam Session Handler Live Control
 *
 * P8.1: Real-time Handler guidance during live cam sessions.
 * Template-based (no Claude call) for low-latency live directives.
 * Maps tips to Lovense device commands, generates streamer guidance,
 * and builds Handler context for active sessions.
 */

import { supabase } from '../supabase';
import { getActiveLiveSession, getSessionElapsedMinutes } from '../cam/session';
import { getSessionTipTotal } from '../cam/tips';

// ============================================
// TYPES
// ============================================

export interface CamSessionContext {
  viewerCount: number;
  lastTipAmount: number;
  lastTipSender: string;
  minutesLive: number;
  currentDeviceIntensity: number;
  chatMessages: string[];
}

export interface DeviceCommand {
  intensity: number;
  durationSec: number;
  pattern?: string;
}

export interface TipProcessResult {
  deviceCommand: DeviceCommand;
  guidance: string;
}

export interface CamHandlerContext {
  isLive: boolean;
  viewerCount: number;
  tipsTotal: number;
  tipCount: number;
  deviceStatus: string;
  minutesLive: number;
  sessionId?: string;
}

// ============================================
// GUIDANCE TEMPLATES
// ============================================

const ROTATION_MESSAGES = [
  'You look incredible. Let them see you enjoy it.',
  'Change angle. Show them something new.',
  'Eye contact with the camera. Hold it.',
  'Touch yourself like you mean it. Slow.',
  'Tell them what denial day you\'re on. They love that.',
  'Read the chat. Respond to someone by name.',
  'Arch your back. Let them hear you.',
  'Whisper something. Make them lean in.',
];

let rotationIndex = 0;

/**
 * Generate Handler text guidance for the streamer.
 * Template-based for speed -- no Claude call.
 */
export function generateCamGuidance(
  _userId: string,
  ctx: CamSessionContext
): string {
  // High tip -- acknowledge and escalate
  if (ctx.lastTipAmount > 10) {
    return `Thank ${ctx.lastTipSender}. Show them what they paid for. Device going up.`;
  }

  // Medium tip -- name acknowledgment
  if (ctx.lastTipAmount > 5) {
    return `${ctx.lastTipSender} tipped. Acknowledge them by name.`;
  }

  // Viewer count dropping
  if (ctx.viewerCount > 0 && ctx.viewerCount < 5 && ctx.minutesLive > 5) {
    return 'You\'re losing them. Change position. Tease something.';
  }

  // Tip drought (5+ minutes implied by lastTipAmount being 0 or low)
  if (ctx.lastTipAmount === 0 && ctx.minutesLive > 5 && ctx.minutesLive % 5 < 1) {
    return 'Time to ask for what you want. Be direct.';
  }

  // Default rotation every ~3 minutes
  if (ctx.minutesLive > 0 && ctx.minutesLive % 3 < 1) {
    const message = ROTATION_MESSAGES[rotationIndex % ROTATION_MESSAGES.length];
    rotationIndex++;
    return message;
  }

  return '';
}

// ============================================
// TIP-TO-DEVICE MAPPING
// ============================================

/**
 * Maps tip dollar amount to Lovense device command parameters.
 */
export function mapTipToDevice(tipAmount: number): DeviceCommand {
  if (tipAmount >= 20) {
    return { intensity: 18, durationSec: 45, pattern: 'edge_tease' };
  }
  if (tipAmount >= 11) {
    return { intensity: 15, durationSec: 30 };
  }
  if (tipAmount >= 6) {
    return { intensity: 12, durationSec: 20 };
  }
  if (tipAmount >= 3) {
    return { intensity: 8, durationSec: 15 };
  }
  // $1-2
  return { intensity: 5, durationSec: 10 };
}

// ============================================
// TIP PROCESSING
// ============================================

/**
 * Full tip handler: maps to device, sends Lovense command (fire-and-forget),
 * generates acknowledgment guidance, logs to cam_tips table.
 */
export async function processCamTip(
  userId: string,
  tipAmount: number,
  senderName: string,
  sessionId: string
): Promise<TipProcessResult> {
  const deviceCommand = mapTipToDevice(tipAmount);

  // Fire-and-forget Lovense command via edge function
  const lovensePayload: Record<string, unknown> = {
    customCommand: {
      command: 'Function' as const,
      action: `Vibrate:${deviceCommand.intensity}`,
      timeSec: deviceCommand.durationSec,
    },
    triggerType: 'cam_tip',
    triggerId: sessionId,
    intensity: deviceCommand.intensity,
  };

  if (deviceCommand.pattern) {
    lovensePayload.patternName = deviceCommand.pattern;
    delete lovensePayload.customCommand;
  }

  // Fire-and-forget -- don't await
  supabase.functions.invoke('lovense-command', {
    body: lovensePayload,
  }).catch(() => {
    // Swallow -- device failure should not break tip flow
  });

  // Log to cam_tips
  await supabase
    .from('cam_tips')
    .insert({
      user_id: userId,
      cam_session_id: sessionId,
      tipper_username: senderName,
      token_amount: Math.round(tipAmount * 20), // rough USD-to-token
      tip_amount_usd: tipAmount,
      pattern_triggered: deviceCommand.pattern || `vibrate_${deviceCommand.intensity}`,
      device_response_sent: true,
      session_timestamp_seconds: null,
    })
    .then(undefined, () => {
      // Swallow log failure
    });

  // Generate guidance
  let guidance: string;
  if (tipAmount > 10) {
    guidance = `Thank ${senderName}. Show them what they paid for. Device going up.`;
  } else if (tipAmount > 5) {
    guidance = `${senderName} tipped $${tipAmount}. Acknowledge them by name.`;
  } else {
    guidance = `${senderName} tipped. Give them a look.`;
  }

  return { deviceCommand, guidance };
}

// ============================================
// SESSION CONTEXT BUILDER
// ============================================

/**
 * Build Handler context for active cam sessions.
 */
export async function buildCamSessionContext(userId: string): Promise<CamHandlerContext> {
  try {
    const session = await getActiveLiveSession(userId);

    if (!session || session.status !== 'live') {
      return {
        isLive: false,
        viewerCount: 0,
        tipsTotal: 0,
        tipCount: 0,
        deviceStatus: 'idle',
        minutesLive: 0,
      };
    }

    const tipTotals = await getSessionTipTotal(session.id);
    const minutesLive = getSessionElapsedMinutes(session);

    // Check device status from recent commands
    const { data: recentCmd } = await supabase
      .from('lovense_commands')
      .select('intensity, success, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let deviceStatus = 'connected';
    if (recentCmd) {
      const cmdAge = Date.now() - new Date(recentCmd.created_at).getTime();
      if (!recentCmd.success) {
        deviceStatus = 'error';
      } else if (cmdAge < 60000) {
        deviceStatus = `active (intensity ${recentCmd.intensity})`;
      }
    }

    return {
      isLive: true,
      viewerCount: session.peakViewers || 0,
      tipsTotal: tipTotals.totalUsd,
      tipCount: tipTotals.tipCount,
      deviceStatus,
      minutesLive,
      sessionId: session.id,
    };
  } catch {
    return {
      isLive: false,
      viewerCount: 0,
      tipsTotal: 0,
      tipCount: 0,
      deviceStatus: 'unknown',
      minutesLive: 0,
    };
  }
}

/**
 * Handler context string for cam live control.
 * Wired into handler-systems-context.ts.
 */
export async function buildCamHandlerControlContext(userId: string): Promise<string> {
  try {
    const ctx = await buildCamSessionContext(userId);
    if (!ctx.isLive) return '';

    const parts: string[] = [];
    parts.push(`CAM LIVE CONTROL: ${ctx.minutesLive}min live, ${ctx.tipCount} tips ($${ctx.tipsTotal.toFixed(0)}), viewers: ${ctx.viewerCount}, device: ${ctx.deviceStatus}`);

    if (ctx.tipCount === 0 && ctx.minutesLive > 5) {
      parts.push('  WARNING: no tips yet -- prescribe direct ask');
    }

    if (ctx.minutesLive > 45) {
      parts.push('  WIND DOWN: 45+ minutes -- begin closing sequence');
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
