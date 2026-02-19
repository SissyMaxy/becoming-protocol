/**
 * Reddit Karma Strategy — Sprint 5
 * Phase 0 karma farming: build comment karma before content posting.
 * Handler comments on posts across target subs for visibility.
 * Target: 200+ comment karma before posting content.
 */

import { supabase } from '../supabase';
import {
  buildVoicePrompt,
  getDenialVoiceModifier,
} from './voice-bible';

// ============================================
// Types
// ============================================

interface KarmaTarget {
  subreddit: string;
  type: 'comment_karma' | 'content_posting';
  priority: number; // 1-5
  commentsPerDay: number;
  notes: string;
}

interface KarmaStatus {
  estimatedKarma: number;
  totalCommentsMade: number;
  commentsToday: number;
  isReadyForContent: boolean;
  karmaTarget: number;
  daysSinceStart: number;
}

interface CommentSuggestion {
  subreddit: string;
  commentType: 'supportive' | 'experience_sharing' | 'question' | 'encouragement';
  voicePrompt: string;
  denialReference: boolean;
}

// ============================================
// Karma Targets
// ============================================

const KARMA_TARGET = 200;

const COMMENT_KARMA_TARGETS: KarmaTarget[] = [
  {
    subreddit: 'r/chastity',
    type: 'comment_karma',
    priority: 5,
    commentsPerDay: 2,
    notes: 'Active, supportive community. Core niche. Comment on lock-up posts, milestone posts.',
  },
  {
    subreddit: 'r/chastitytraining',
    type: 'comment_karma',
    priority: 4,
    commentsPerDay: 1,
    notes: 'Discussion-oriented. Share experiences. Advice-sharing earns karma.',
  },
  {
    subreddit: 'r/asktransgender',
    type: 'comment_karma',
    priority: 3,
    commentsPerDay: 1,
    notes: 'High traffic. Helpful answers earn karma. NO self-promotion. Genuine support only.',
  },
  {
    subreddit: 'r/TransDIY',
    type: 'comment_karma',
    priority: 3,
    commentsPerDay: 1,
    notes: 'Share experiences. Ask genuine questions. Profile visibility is the only goal.',
  },
  {
    subreddit: 'r/FemBoys',
    type: 'comment_karma',
    priority: 2,
    commentsPerDay: 1,
    notes: 'Active community. Supportive comments on posts.',
  },
];

const FIRST_CONTENT_SUBS: KarmaTarget[] = [
  {
    subreddit: 'r/sissies',
    type: 'content_posting',
    priority: 5,
    commentsPerDay: 0,
    notes: 'Low barrier, active, welcoming to new posters. Start here.',
  },
  {
    subreddit: 'r/chastity',
    type: 'content_posting',
    priority: 5,
    commentsPerDay: 0,
    notes: 'Already has comment history here from karma phase.',
  },
  {
    subreddit: 'r/LockedAndCaged',
    type: 'content_posting',
    priority: 4,
    commentsPerDay: 0,
    notes: 'Niche, supportive. Cage content always welcome.',
  },
];

// ============================================
// Core Functions
// ============================================

/**
 * Get current karma farming status.
 */
export async function getKarmaStatus(userId: string): Promise<KarmaStatus> {
  const today = new Date().toISOString().split('T')[0];

  // Count total karma-building comments
  const { count: totalComments } = await supabase
    .from('handler_autonomous_actions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', 'subreddit_comment')
    .eq('platform', 'reddit');

  // Count today's comments
  const { count: todayComments } = await supabase
    .from('handler_autonomous_actions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', 'subreddit_comment')
    .eq('platform', 'reddit')
    .gte('created_at', `${today}T00:00:00`);

  // Get first comment date for days since start
  const { data: firstComment } = await supabase
    .from('handler_autonomous_actions')
    .select('created_at')
    .eq('user_id', userId)
    .eq('action_type', 'subreddit_comment')
    .eq('platform', 'reddit')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const total = totalComments ?? 0;
  // Rough estimate: ~2-4 karma per genuine comment
  const estimatedKarma = Math.round(total * 3);
  const daysSinceStart = firstComment
    ? Math.floor(
        (Date.now() - new Date(firstComment.created_at).getTime()) / (24 * 60 * 60 * 1000),
      )
    : 0;

  return {
    estimatedKarma,
    totalCommentsMade: total,
    commentsToday: todayComments ?? 0,
    isReadyForContent: estimatedKarma >= KARMA_TARGET,
    karmaTarget: KARMA_TARGET,
    daysSinceStart,
  };
}

/**
 * Get today's comment plan — which subs to comment in, how many.
 */
export async function getDailyCommentPlan(
  userId: string,
): Promise<CommentSuggestion[]> {
  const status = await getKarmaStatus(userId);
  if (status.isReadyForContent) return []; // Past karma farming phase

  const maxCommentsPerDay = 6; // Don't spam
  const remaining = maxCommentsPerDay - status.commentsToday;
  if (remaining <= 0) return [];

  const suggestions: CommentSuggestion[] = [];

  // Get denial day for voice context
  const { data: denialState } = await supabase
    .from('denial_state')
    .select('current_day')
    .eq('user_id', userId)
    .maybeSingle();

  const denialDay = denialState?.current_day ?? 0;
  const voicePrompt = buildVoicePrompt('community_comment');
  const denialMod = getDenialVoiceModifier(denialDay);

  // Distribute across targets based on priority
  for (const target of COMMENT_KARMA_TARGETS) {
    if (suggestions.length >= remaining) break;

    for (let i = 0; i < target.commentsPerDay && suggestions.length < remaining; i++) {
      const commentTypes: CommentSuggestion['commentType'][] = [
        'supportive',
        'experience_sharing',
        'encouragement',
      ];
      // Support subs don't get denial references
      const isSupport = target.subreddit === 'r/asktransgender' || target.subreddit === 'r/TransDIY';

      suggestions.push({
        subreddit: target.subreddit,
        commentType: commentTypes[i % commentTypes.length],
        voicePrompt: `${voicePrompt}\n\nDenial day modifier: ${denialMod}\nSub: ${target.subreddit}\nNotes: ${target.notes}`,
        denialReference: !isSupport && denialDay >= 3,
      });
    }
  }

  return suggestions;
}

/**
 * Record a karma-building comment.
 */
export async function recordKarmaComment(
  userId: string,
  subreddit: string,
  commentText: string,
  targetUrl: string,
  handlerIntent: string,
): Promise<void> {
  await supabase.from('handler_autonomous_actions').insert({
    user_id: userId,
    action_type: 'subreddit_comment',
    platform: 'reddit',
    community_id: subreddit,
    content_text: commentText,
    target_url: targetUrl,
    handler_intent: handlerIntent,
    engagement_received: {},
  });

  // Update community target engagement timestamp
  await supabase
    .from('community_targets')
    .update({
      last_engagement_at: new Date().toISOString(),
      // total_comments: Can't increment directly, handled by trigger or manual
    })
    .eq('user_id', userId)
    .eq('community_id', subreddit);
}

/**
 * Get subs that are ready for content posting (post-karma phase).
 */
export function getContentReadySubs(): KarmaTarget[] {
  return FIRST_CONTENT_SUBS;
}

/**
 * Build context string for Handler AI.
 */
export async function buildKarmaContext(userId: string): Promise<string> {
  try {
    const status = await getKarmaStatus(userId);
    if (status.totalCommentsMade === 0 && status.estimatedKarma === 0) return '';

    if (status.isReadyForContent) {
      return `REDDIT KARMA: ~${status.estimatedKarma} (ready for content posting), ${status.totalCommentsMade} comments made`;
    }

    return `REDDIT KARMA: ~${status.estimatedKarma}/${status.karmaTarget} target, ${status.totalCommentsMade} comments, ${status.commentsToday} today, ${status.daysSinceStart}d since start`;
  } catch {
    return '';
  }
}
