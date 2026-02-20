// ============================================
// Cam Announcements — Pre-Session & Go-Live Notifications
// ============================================

import { supabase } from '../supabase';
import type { CamSession, CamPrescription, CamSessionSummary } from '../../types/cam';

// ============================================
// Announcement Types
// ============================================

export interface CamAnnouncement {
  type: 'prep_reminder' | 'go_live' | 'tip_goal_reached' | 'session_ending' | 'session_ended';
  title: string;
  body: string;
  urgency: 'low' | 'medium' | 'high';
  sessionId: string;
  timestamp: string;
}

// ============================================
// Prep Reminders
// ============================================

export function buildPrepReminder(session: CamSession): CamAnnouncement {
  const makeupNote = session.prescribedMakeup
    ? ` Makeup: ${session.prescribedMakeup}.`
    : '';
  const setupNote = session.prescribedSetup
    ? ` Setup: ${session.prescribedSetup}.`
    : '';

  return {
    type: 'prep_reminder',
    title: 'Session Prep Time',
    body: `Time to prepare for your cam session.${makeupNote}${setupNote} Get into position.`,
    urgency: 'high',
    sessionId: session.id,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// Go-Live Announcement
// ============================================

export function buildGoLiveAnnouncement(session: CamSession): CamAnnouncement {
  const goalNote = session.tipGoals.length > 0
    ? ` First goal: ${session.tipGoals[0].label} (${session.tipGoals[0].targetTokens} tokens).`
    : '';

  return {
    type: 'go_live',
    title: 'You\'re Live',
    body: `Stream is active. Minimum ${session.minimumDurationMinutes} minutes.${goalNote} Stay in character.`,
    urgency: 'high',
    sessionId: session.id,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// Tip Goal Reached
// ============================================

export function buildTipGoalAnnouncement(
  sessionId: string,
  goalLabel: string,
  reward?: string
): CamAnnouncement {
  return {
    type: 'tip_goal_reached',
    title: 'Tip Goal Reached!',
    body: reward
      ? `"${goalLabel}" reached. Reward: ${reward}`
      : `"${goalLabel}" reached. Tell your viewers.`,
    urgency: 'medium',
    sessionId,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// Session Ending / Ended
// ============================================

export function buildSessionEndingAnnouncement(
  session: CamSession,
  minutesRemaining: number
): CamAnnouncement {
  return {
    type: 'session_ending',
    title: `${minutesRemaining}m Remaining`,
    body: 'Start your wind-down. Thank viewers. Mention next session.',
    urgency: 'medium',
    sessionId: session.id,
    timestamp: new Date().toISOString(),
  };
}

export function buildSessionEndedAnnouncement(
  session: CamSession,
  totalTokens: number,
  tipCount: number
): CamAnnouncement {
  return {
    type: 'session_ended',
    title: 'Session Complete',
    body: `${tipCount} tips, ${totalTokens} tokens total. Good girl.`,
    urgency: 'low',
    sessionId: session.id,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// Pre-Session Social Post Builder
// ============================================

export function buildPreSessionPost(
  prescription: CamPrescription,
  chosenName: string
): string {
  const lines: string[] = [];
  lines.push(`${chosenName} is going live soon 💕`);

  if (prescription.sessionType === 'goal_show') {
    lines.push('Tip goals are set — help me reach them~');
  } else if (prescription.sessionType === 'edge_show') {
    lines.push('Things might get intense tonight 😳');
  } else if (prescription.sessionType === 'interactive') {
    lines.push('Come hang out and have fun with me~');
  }

  if (prescription.platform) {
    lines.push(`Catch me on ${prescription.platform}`);
  }

  return lines.join('\n');
}

// ============================================
// Content Distribution Integration
// ============================================

const DISTRIBUTION_PLATFORMS = ['twitter', 'moltbook', 'reddit', 'fansly'] as const;

/**
 * Schedule go-live announcements as content_distribution entries.
 * Creates 2hr-before, 30min-before, and at-go-live posts.
 */
export async function scheduleGoLiveDistributions(
  userId: string,
  sessionId: string,
  scheduledAt: string,
  prescription: CamPrescription
): Promise<void> {
  const scheduledTime = new Date(scheduledAt);
  const twoHoursBefore = new Date(scheduledTime.getTime() - 2 * 60 * 60 * 1000);
  const thirtyMinBefore = new Date(scheduledTime.getTime() - 30 * 60 * 1000);

  const chosenName = 'Maxy'; // Could be dynamic from profile
  const prePost = buildPreSessionPost(prescription, chosenName);

  const distributions = [
    {
      caption: prePost,
      scheduled_at: twoHoursBefore.toISOString(),
      post_status: 'scheduled',
    },
    {
      caption: `Going live in 30 minutes~ ${prescription.denialEnforced ? 'Denial day energy tonight.' : 'Come say hi!'}`,
      scheduled_at: thirtyMinBefore.toISOString(),
      post_status: 'scheduled',
    },
    {
      caption: `Live now 🔴 ${prescription.platform || ''}`,
      scheduled_at: scheduledAt,
      post_status: 'scheduled',
    },
  ];

  for (const dist of distributions) {
    for (const platform of DISTRIBUTION_PLATFORMS) {
      await supabase.from('content_distribution').insert({
        user_id: userId,
        vault_item_id: null,
        platform,
        caption: dist.caption,
        scheduled_at: dist.scheduled_at,
        post_status: dist.post_status,
        handler_strategy: `cam_announcement:${sessionId}`,
      });
    }
  }
}

/**
 * Create content distribution entries for the post-session summary.
 */
export async function postSessionSummaryDistribution(
  userId: string,
  sessionId: string,
  summary: CamSessionSummary
): Promise<void> {
  const topTipperNote = summary.topTipper
    ? ` Thank you ${summary.topTipper.username} 💕`
    : '';

  const captions: Record<string, string> = {
    twitter: `Tonight's session: ${summary.edgeCount} edges, ${summary.durationMinutes} minutes.${topTipperNote} ✨`,
    moltbook: `Session recap: ${summary.durationMinutes}min stream. ${summary.edgeCount} edges, ${summary.totalTokens} tokens.${topTipperNote}`,
    reddit: `Session recap: ${summary.durationMinutes}min, ${summary.totalTokens} tokens, ${summary.edgeCount} edges. ${summary.highlightCount} highlights being extracted for content.${topTipperNote}`,
    fansly: `Thank you for an amazing ${summary.durationMinutes} minute session! ${summary.tipCount} tips, ${summary.totalTokens} tokens.${topTipperNote} Clips coming soon from tonight's highlights~ 🎬`,
  };

  for (const platform of DISTRIBUTION_PLATFORMS) {
    await supabase.from('content_distribution').insert({
      user_id: userId,
      vault_item_id: null,
      platform,
      caption: captions[platform] || captions.twitter,
      scheduled_at: new Date().toISOString(),
      post_status: 'scheduled',
      handler_strategy: `cam_summary:${sessionId}`,
    });
  }
}
