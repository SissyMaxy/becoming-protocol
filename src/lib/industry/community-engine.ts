/**
 * Community Engine — Sprint 5
 * Reddit comments, Twitter engagement generation.
 * The Handler builds Maxy's social presence autonomously.
 * Genuine, supportive, strategic engagement across communities.
 */

import { supabase } from '../supabase';
import {
  buildVoicePrompt,
  getDenialVoiceModifier,
  type VoicePlatform,
} from './voice-bible';
import type {
  CommunityTarget,
  DbCommunityTarget,
  HandlerAutonomousAction,
} from '../../types/industry';

// ============================================
// Types
// ============================================

interface EngagementPlan {
  communityId: string;
  platform: string;
  actionsPlanned: PlannedAction[];
}

interface PlannedAction {
  type: 'comment' | 'like' | 'reply' | 'follow' | 'retweet';
  target: string; // URL or username
  voicePrompt: string;
  intent: string;
  denialReference: boolean;
}

// ============================================
// Community Management
// ============================================

/**
 * Get active communities for a specific platform.
 */
export async function getActiveCommunities(
  userId: string,
  platform?: string,
): Promise<CommunityTarget[]> {
  let query = supabase
    .from('community_targets')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (platform) {
    query = query.eq('platform', platform);
  }

  const { data, error } = await query.order('created_at', { ascending: true });

  if (error || !data) return [];

  return (data as DbCommunityTarget[]).map(row => ({
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    communityId: row.community_id,
    communityName: row.community_name,
    engagementStrategy: row.engagement_strategy,
    postingFrequency: row.posting_frequency,
    voiceConfig: row.voice_config ?? {},
    contentTypesAllowed: row.content_types_allowed,
    rulesSummary: row.rules_summary,
    followersAttributed: row.followers_attributed,
    karmaEarned: row.karma_earned,
    totalPosts: row.total_posts,
    totalComments: row.total_comments,
    lastPostAt: row.last_post_at,
    lastEngagementAt: row.last_engagement_at,
    status: row.status as CommunityTarget['status'],
    createdAt: row.created_at,
  }));
}

/**
 * Build a daily engagement plan for all active communities.
 */
export async function buildDailyEngagementPlan(
  userId: string,
  denialDay: number,
): Promise<EngagementPlan[]> {
  const communities = await getActiveCommunities(userId);
  const plans: EngagementPlan[] = [];
  const denialMod = getDenialVoiceModifier(denialDay);

  for (const community of communities) {
    const actions: PlannedAction[] = [];
    const isSupport =
      community.communityId === 'r/asktransgender' ||
      community.communityId === 'r/TransDIY';

    // Comment-based communities
    if (
      community.engagementStrategy?.includes('comment') ||
      community.postingFrequency === 'comment_only'
    ) {
      const commentCount = isSupport ? 1 : getCommentCount(community.postingFrequency);
      const voiceType: VoicePlatform = isSupport ? 'community_comment' : 'community_comment';
      const voicePrompt = buildVoicePrompt(voiceType);

      for (let i = 0; i < commentCount; i++) {
        actions.push({
          type: 'comment',
          target: community.communityId,
          voicePrompt: `${voicePrompt}\n\nDenial modifier: ${denialMod}\nCommunity: ${community.communityName}\nRules: ${community.rulesSummary ?? 'Standard'}\nStrategy: ${community.engagementStrategy}`,
          intent: isSupport
            ? 'Genuine community participation. Profile visibility. No promo.'
            : `Name recognition in ${community.communityName}. Profile clicks → follows.`,
          denialReference: !isSupport && denialDay >= 3,
        });
      }
    }

    // Twitter engagement communities
    if (community.platform === 'twitter') {
      const voicePrompt = buildVoicePrompt('twitter');

      // Likes (passive engagement)
      actions.push({
        type: 'like',
        target: community.communityId,
        voicePrompt: '',
        intent: `Visibility in ${community.communityId} timeline.`,
        denialReference: false,
      });

      // Replies
      if (community.engagementStrategy?.includes('engage')) {
        actions.push({
          type: 'reply',
          target: community.communityId,
          voicePrompt: `${voicePrompt}\n\nDenial modifier: ${denialMod}`,
          intent: 'Build timeline presence. Engage with community.',
          denialReference: denialDay >= 3,
        });
      }

      // Follow new accounts
      actions.push({
        type: 'follow',
        target: community.communityId,
        voicePrompt: '',
        intent: 'Grow network. Follow-back leads to mutual engagement.',
        denialReference: false,
      });
    }

    if (actions.length > 0) {
      plans.push({
        communityId: community.communityId,
        platform: community.platform,
        actionsPlanned: actions,
      });
    }
  }

  return plans;
}

// ============================================
// Reddit Engagement
// ============================================

/**
 * Generate Reddit comment text for a community.
 * Uses AI when available, falls back to templates.
 */
export async function generateRedditComment(
  _userId: string,
  community: CommunityTarget,
  denialDay: number,
  targetPostContext?: string,
): Promise<{ text: string; intent: string } | null> {
  const voicePrompt = buildVoicePrompt('community_comment');
  const denialMod = getDenialVoiceModifier(denialDay);
  const isSupport =
    community.communityId === 'r/asktransgender' ||
    community.communityId === 'r/TransDIY';

  try {
    const { data, error } = await supabase.functions.invoke('handler-coach', {
      body: {
        request_type: 'community_comment',
        context: {
          voice: voicePrompt,
          denial_day: denialDay,
          denial_modifier: denialMod,
          community: community.communityName,
          rules: community.rulesSummary,
          strategy: community.engagementStrategy,
          target_post: targetPostContext,
          is_support_sub: isSupport,
          include_denial_reference: !isSupport && denialDay >= 3,
          output_format: 'Return JSON: { comment: string, intent: string }',
        },
      },
    });

    if (error) throw error;

    const message = data?.message ?? '';
    const jsonMatch = message.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        text: parsed.comment ?? '',
        intent: parsed.intent ?? 'Community engagement.',
      };
    }
  } catch (err) {
    console.error('Reddit comment generation failed, using template:', err);
  }

  // Fallback templates
  return getTemplateComment(community, denialDay, isSupport);
}

/**
 * Generate Twitter engagement text (reply, quote tweet).
 */
export async function generateTwitterReply(
  _userId: string,
  denialDay: number,
  targetTweetContext?: string,
): Promise<{ text: string; intent: string } | null> {
  const voicePrompt = buildVoicePrompt('twitter');
  const denialMod = getDenialVoiceModifier(denialDay);

  try {
    const { data, error } = await supabase.functions.invoke('handler-coach', {
      body: {
        request_type: 'twitter_reply',
        context: {
          voice: voicePrompt,
          denial_day: denialDay,
          denial_modifier: denialMod,
          target_tweet: targetTweetContext,
          output_format: 'Return JSON: { reply: string, intent: string }',
        },
      },
    });

    if (error) throw error;

    const message = data?.message ?? '';
    const jsonMatch = message.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        text: parsed.reply ?? '',
        intent: parsed.intent ?? 'Twitter engagement.',
      };
    }
  } catch {
    // Fallback
  }

  return {
    text: denialDay >= 3
      ? `this is so relatable rn 😩 day ${denialDay} locked and everything hits different`
      : 'this is so good 💕',
    intent: 'Template Twitter reply. Visibility.',
  };
}

// ============================================
// Action Logging
// ============================================

/**
 * Log a community engagement action.
 */
export async function logEngagementAction(
  userId: string,
  action: {
    actionType: string;
    platform: string;
    communityId: string;
    contentText?: string;
    targetUrl?: string;
    targetUsername?: string;
    handlerIntent: string;
  },
): Promise<void> {
  await supabase.from('handler_autonomous_actions').insert({
    user_id: userId,
    action_type: action.actionType,
    platform: action.platform,
    community_id: action.communityId,
    content_text: action.contentText,
    target_url: action.targetUrl,
    target_username: action.targetUsername,
    handler_intent: action.handlerIntent,
    engagement_received: {},
  });

  // Update community engagement timestamp
  await supabase
    .from('community_targets')
    .update({ last_engagement_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('community_id', action.communityId);
}

/**
 * Get today's autonomous action count by type.
 */
export async function getTodayActionCount(
  userId: string,
  actionType?: string,
): Promise<number> {
  const today = new Date().toISOString().split('T')[0];

  let query = supabase
    .from('handler_autonomous_actions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', `${today}T00:00:00`);

  if (actionType) {
    query = query.eq('action_type', actionType);
  }

  const { count } = await query;
  return count ?? 0;
}

/**
 * Get recent autonomous actions for the morning briefing.
 */
export async function getRecentAutonomousActions(
  userId: string,
  hoursBack = 24,
): Promise<HandlerAutonomousAction[]> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('handler_autonomous_actions')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map(row => ({
    id: row.id,
    userId: row.user_id,
    actionType: row.action_type,
    platform: row.platform,
    target: row.target ?? null,
    contentText: row.content_text,
    handlerIntent: row.handler_intent,
    result: row.result ?? {},
    createdAt: row.created_at,
  }));
}

/**
 * Build community engagement context for Handler AI.
 */
export async function buildCommunityContext(userId: string): Promise<string> {
  try {
    const [communities, todayCount] = await Promise.allSettled([
      getActiveCommunities(userId),
      getTodayActionCount(userId),
    ]);

    const comms = communities.status === 'fulfilled' ? communities.value : [];
    const today = todayCount.status === 'fulfilled' ? todayCount.value : 0;

    if (comms.length === 0) return '';

    const redditCount = comms.filter(c => c.platform === 'reddit').length;
    const twitterCount = comms.filter(c => c.platform === 'twitter').length;
    const totalComments = comms.reduce((sum, c) => sum + (c.totalComments ?? 0), 0);
    const totalPosts = comms.reduce((sum, c) => sum + (c.totalPosts ?? 0), 0);

    return `COMMUNITIES: ${comms.length} active (reddit: ${redditCount}, twitter: ${twitterCount}), ${totalPosts} posts, ${totalComments} comments total, ${today} actions today`;
  } catch {
    return '';
  }
}

// ============================================
// Helpers
// ============================================

function getCommentCount(frequency: string | null): number {
  switch (frequency) {
    case 'daily':
      return 2;
    case '3_per_week':
      return 1;
    case '2_per_week':
      return 1;
    case 'weekly':
      return 1;
    case 'comment_only':
      return 1;
    default:
      return 1;
  }
}

function getTemplateComment(
  community: CommunityTarget,
  denialDay: number,
  isSupport: boolean,
): { text: string; intent: string } {
  if (isSupport) {
    return {
      text: "This resonates a lot. Thank you for sharing your experience — it helps knowing I'm not the only one working through this.",
      intent: 'Genuine support comment. Profile visibility.',
    };
  }

  if (community.communityId.includes('chastity')) {
    return {
      text:
        denialDay >= 3
          ? `Congrats! I'm on day ${denialDay} and everything you described about the headspace shift is exactly what's happening to me too.`
          : 'This is great! Congratulations on the milestone 💕',
      intent: `Engagement in ${community.communityName}. Denial reference builds curiosity.`,
    };
  }

  return {
    text: 'Love this! You look amazing 💕',
    intent: `Basic engagement in ${community.communityName}. Profile clicks.`,
  };
}
