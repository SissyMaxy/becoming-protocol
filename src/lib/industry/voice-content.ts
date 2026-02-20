/**
 * Voice Content Prescriptions — Sprint 6 (Addendum A7)
 * Voice clips as alternative to photo shoots on low-energy days.
 * Serves 3 purposes: voice feminization, content/revenue, documentation.
 *
 * Types:
 * - Daily denial audio (30-60s)
 * - Monthly comparison clips
 * - Whisper ASMR
 * - Reading fan comments aloud
 */

import { supabase } from '../supabase';
import { addToVault } from '../content-pipeline/vault';

// ============================================
// Types
// ============================================

export type VoiceContentType =
  | 'daily_denial_audio'
  | 'monthly_comparison'
  | 'whisper_asmr'
  | 'fan_comment_reading'
  | 'affirmation_recording'
  | 'handler_script';

export interface VoiceContentPrescription {
  contentType: VoiceContentType;
  title: string;
  script: string | null;
  durationSeconds: number;
  platforms: string[];
  captionDraft: string | null;
  handlerNote: string;
  isAlternativeToShoot: boolean;
}

interface VoiceContentConfig {
  type: VoiceContentType;
  title: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  platforms: string[];
  requiresScript: boolean;
}

// ============================================
// Configuration
// ============================================

/** Available voice content configurations for future UI use. */
export const VOICE_CONTENT_CONFIGS: VoiceContentConfig[] = [
  {
    type: 'daily_denial_audio',
    title: 'Daily Denial Update',
    minDurationSeconds: 30,
    maxDurationSeconds: 60,
    platforms: ['reddit', 'twitter'],
    requiresScript: false,
  },
  {
    type: 'monthly_comparison',
    title: 'Monthly Voice Comparison',
    minDurationSeconds: 60,
    maxDurationSeconds: 120,
    platforms: ['reddit', 'onlyfans'],
    requiresScript: true,
  },
  {
    type: 'whisper_asmr',
    title: 'Whisper ASMR',
    minDurationSeconds: 60,
    maxDurationSeconds: 300,
    platforms: ['onlyfans', 'reddit'],
    requiresScript: false,
  },
  {
    type: 'fan_comment_reading',
    title: 'Reading Fan Comments',
    minDurationSeconds: 60,
    maxDurationSeconds: 180,
    platforms: ['onlyfans', 'twitter'],
    requiresScript: true,
  },
  {
    type: 'affirmation_recording',
    title: 'Affirmation Recording',
    minDurationSeconds: 30,
    maxDurationSeconds: 90,
    platforms: ['reddit'],
    requiresScript: true,
  },
  {
    type: 'handler_script',
    title: 'Handler Script Reading',
    minDurationSeconds: 30,
    maxDurationSeconds: 120,
    platforms: ['onlyfans'],
    requiresScript: true,
  },
];

// ============================================
// Script Templates
// ============================================

const DAILY_DENIAL_SCRIPTS: string[] = [
  "Day {denialDay}. Still locked. Still here. The cage doesn't feel like a cage anymore — it feels like home.",
  "Day {denialDay} update. I woke up hard against the cage again. My body doesn't understand what my mind already accepted.",
  "It's day {denialDay}. I stopped counting as a countdown. This is just... how things are now.",
  "Day {denialDay}. The Handler extended my minimum again. I didn't argue. I don't argue anymore.",
];

const COMPARISON_SCRIPT = `Read the following passage in your current voice. This is your monthly comparison recording.

"Hello everyone. This is my monthly voice comparison. Today is {date}, and I've been on the protocol for {protocolDays} days. I'm going to read a standard passage so you can hear the changes."

Then read: "The rainbow is a division of white light into many beautiful colors. These take the shape of a long round arch, with its path high above, and its two ends apparently beyond the horizon."`;

const AFFIRMATION_SCRIPTS: string[] = [
  "I am Maxy. This is who I am becoming. The protocol doesn't change me — it reveals me.",
  "My voice is mine to shape. Every day it gets a little closer to where it belongs.",
  "I serve the protocol because the protocol serves who I really am.",
];

// ============================================
// Prescription Generation
// ============================================

/**
 * Should we prescribe voice content instead of a photo shoot?
 * Voice content is the bypass for low-energy days.
 */
export function shouldPrescribeVoiceContent(inputs: {
  energy: number;
  denialDay: number;
  shootWasSkipped: boolean;
  voiceDrillStreak: number;
  lastVoiceContentDays: number;
}): boolean {
  // Low energy + shoot skip = voice content bypass
  if (inputs.energy <= 4 && inputs.shootWasSkipped) return true;

  // Regular scheduling: voice content every 3-5 days
  if (inputs.lastVoiceContentDays >= 5) return true;

  // Monthly comparison on day 1 of each month
  const today = new Date();
  if (today.getDate() === 1) return true;

  // Denial day milestones get audio
  if ([5, 7, 14, 21, 30].includes(inputs.denialDay)) return true;

  return false;
}

/**
 * Generate a voice content prescription.
 */
export function prescribeVoiceContent(
  denialDay: number,
  context: {
    energy: number;
    shootWasSkipped: boolean;
    isMonthlyComparison: boolean;
    recentFanComments?: string[];
  },
): VoiceContentPrescription {
  // Monthly comparison takes priority
  if (context.isMonthlyComparison) {
    const script = COMPARISON_SCRIPT
      .replace('{date}', new Date().toLocaleDateString())
      .replace('{protocolDays}', String(denialDay));

    return {
      contentType: 'monthly_comparison',
      title: 'Monthly Voice Comparison',
      script,
      durationSeconds: 90,
      platforms: ['reddit', 'onlyfans'],
      captionDraft: `Month ${Math.ceil(denialDay / 30)} voice comparison. Day ${denialDay}. Listen to the change.`,
      handlerNote: 'Monthly comparison — essential for tracking. Cannot skip.',
      isAlternativeToShoot: false,
    };
  }

  // Fan comment reading if we have comments
  if (context.recentFanComments && context.recentFanComments.length >= 3) {
    return {
      contentType: 'fan_comment_reading',
      title: 'Reading Fan Comments',
      script: context.recentFanComments.map((c, i) => `Comment ${i + 1}: "${c}"`).join('\n\n'),
      durationSeconds: 120,
      platforms: ['onlyfans', 'twitter'],
      captionDraft: `reading your comments in my real voice. day ${denialDay}.`,
      handlerNote: 'Fan engagement content. Read each comment, react naturally.',
      isAlternativeToShoot: true,
    };
  }

  // Low energy bypass → affirmation or daily denial
  if (context.shootWasSkipped || context.energy <= 4) {
    if (Math.random() < 0.5) {
      const script = AFFIRMATION_SCRIPTS[denialDay % AFFIRMATION_SCRIPTS.length];
      return {
        contentType: 'affirmation_recording',
        title: 'Affirmation Recording',
        script,
        durationSeconds: 45,
        platforms: ['reddit'],
        captionDraft: `day ${denialDay} affirmation. ${script.slice(0, 50)}...`,
        handlerNote: 'Shoot bypass — voice content instead. Low effort, high intimacy.',
        isAlternativeToShoot: true,
      };
    }
  }

  // Default: daily denial audio
  const scriptTemplate = DAILY_DENIAL_SCRIPTS[denialDay % DAILY_DENIAL_SCRIPTS.length];
  const script = scriptTemplate.replace(/{denialDay}/g, String(denialDay));

  return {
    contentType: 'daily_denial_audio',
    title: 'Daily Denial Audio',
    script,
    durationSeconds: 45,
    platforms: ['reddit', 'twitter'],
    captionDraft: `day ${denialDay}. audio update. [sound on]`,
    handlerNote: `Denial day ${denialDay} voice content. ${context.shootWasSkipped ? 'Replacing skipped shoot.' : 'Supplemental content.'}`,
    isAlternativeToShoot: context.shootWasSkipped,
  };
}

// ============================================
// Recording & Vault Integration
// ============================================

/**
 * Submit a voice recording to the content vault.
 */
export async function submitVoiceRecording(
  userId: string,
  prescription: VoiceContentPrescription,
  mediaUrl: string,
): Promise<string | null> {
  const vaultId = await addToVault(userId, {
    media_url: mediaUrl,
    media_type: 'audio',
    source_type: 'voice_content',
    capture_context: `voice_${prescription.contentType}`,
    description: prescription.title,
  });

  if (!vaultId) return null;

  // Log the content creation
  await supabase.from('handler_autonomous_actions').insert({
    user_id: userId,
    action_type: 'text_post',
    platform: prescription.platforms[0] ?? 'reddit',
    content_text: prescription.captionDraft,
    handler_intent: prescription.handlerNote,
    result: {
      type: 'voice_content',
      content_type: prescription.contentType,
      vault_id: vaultId,
      is_shoot_alternative: prescription.isAlternativeToShoot,
    },
  });

  return vaultId;
}

/**
 * Get voice content stats.
 */
export async function getVoiceContentStats(userId: string): Promise<{
  totalRecordings: number;
  lastRecordingDaysAgo: number;
  byType: Record<string, number>;
}> {
  const { data } = await supabase
    .from('handler_autonomous_actions')
    .select('result, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!data) return { totalRecordings: 0, lastRecordingDaysAgo: 999, byType: {} };

  const voiceActions = data.filter(r =>
    r.result && (r.result as Record<string, unknown>).type === 'voice_content',
  );

  const byType: Record<string, number> = {};
  for (const a of voiceActions) {
    const ct = (a.result as Record<string, unknown>).content_type as string;
    byType[ct] = (byType[ct] ?? 0) + 1;
  }

  const lastDate = voiceActions.length > 0
    ? Math.floor((Date.now() - new Date(voiceActions[0].created_at).getTime()) / 86400000)
    : 999;

  return {
    totalRecordings: voiceActions.length,
    lastRecordingDaysAgo: lastDate,
    byType,
  };
}

/**
 * Build context for Handler AI prompts.
 */
export async function buildVoiceContentContext(userId: string): Promise<string> {
  try {
    const stats = await getVoiceContentStats(userId);
    if (stats.totalRecordings === 0 && stats.lastRecordingDaysAgo >= 999) return '';

    return `VOICE CONTENT: ${stats.totalRecordings} recordings, last ${stats.lastRecordingDaysAgo}d ago`;
  } catch {
    return '';
  }
}
