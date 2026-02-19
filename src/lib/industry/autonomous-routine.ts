/**
 * Autonomous Routine — Sprint 5
 * THE ORCHESTRATOR: handlerDailyAutonomousRoutine()
 * Runs every day whether Maxy creates content or not.
 * The Handler operates Maxy's entire social presence independently.
 *
 * This is what makes Becoming Protocol different. The Handler doesn't
 * wait for Maxy to create content before marketing it. The Handler
 * builds Maxy's social existence FIRST.
 */

import { supabase } from '../supabase';
import {
  generateRedditComment,
  generateTwitterReply,
  logEngagementAction,
  getActiveCommunities,
  getTodayActionCount,
} from './community-engine';
import {
  generateDailyTextContent,
  queueTextPosts,
} from './text-content-generator';
import {
  shouldDoOutreach,
  getOutreachReady,
  generateOutreachDm,
  recordCreatorInteraction,
  recordCreatorDm,
  getCreatorRelationships,
} from './creator-outreach';
import { selectPollType, createGeneratedPoll } from './poll-generator';
import { getConsecutiveSkipCount } from './skip-escalation';
import { getDailyCommentPlan, recordKarmaComment, getKarmaStatus } from './reddit-karma';
import { getRecycleCandidates, createRecycledPost } from './content-recycler';
import { autonomousMoltbookPost } from './moltbook-client';
// getDenialVoiceModifier available from './voice-bible' if needed

// ============================================
// Types
// ============================================

export interface AutonomousRoutineResult {
  timestamp: string;
  denialDay: number;
  actionsCompleted: RoutineAction[];
  actionsFailed: RoutineAction[];
  summary: RoutineSummary;
}

interface RoutineAction {
  step: string;
  type: string;
  platform: string;
  detail: string;
  success: boolean;
  error?: string;
}

interface RoutineSummary {
  redditComments: number;
  twitterEngagements: number;
  textPostsQueued: number;
  pollsCreated: number;
  dmsSent: number;
  followsMade: number;
  moltbookPosts: number;
  recycledPosts: number;
  totalActions: number;
}

// ============================================
// THE ORCHESTRATOR
// ============================================

/**
 * The Handler's daily autonomous routine.
 * Executes WITHOUT any David/Maxy input.
 * Call from a cron job, edge function, or manual trigger.
 */
export async function handlerDailyAutonomousRoutine(
  userId: string,
): Promise<AutonomousRoutineResult> {
  const actions: RoutineAction[] = [];
  const failed: RoutineAction[] = [];
  const summary: RoutineSummary = {
    redditComments: 0,
    twitterEngagements: 0,
    textPostsQueued: 0,
    pollsCreated: 0,
    dmsSent: 0,
    followsMade: 0,
    moltbookPosts: 0,
    recycledPosts: 0,
    totalActions: 0,
  };

  // Get user state
  const { data: denialState } = await supabase
    .from('denial_state')
    .select('current_day')
    .eq('user_id', userId)
    .maybeSingle();

  const denialDay = denialState?.current_day ?? 0;
  const consecutiveSkips = await getConsecutiveSkipCount(userId);
  const todayActions = await getTodayActionCount(userId);

  // Safety: don't run if already executed heavily today
  if (todayActions >= 30) {
    return {
      timestamp: new Date().toISOString(),
      denialDay,
      actionsCompleted: [],
      actionsFailed: [],
      summary,
    };
  }

  // === STEP 1: REDDIT KARMA / COMMUNITY ENGAGEMENT ===
  await executeStep(
    'reddit_engagement',
    async () => {
      const karmaStatus = await getKarmaStatus(userId);

      if (!karmaStatus.isReadyForContent) {
        // Karma farming phase: comment for visibility
        const commentPlan = await getDailyCommentPlan(userId);
        for (const suggestion of commentPlan.slice(0, 5)) {
          const comment = await generateRedditComment(
            userId,
            {
              id: '', userId, platform: 'reddit',
              communityId: suggestion.subreddit, communityName: suggestion.subreddit,
              engagementStrategy: 'comment',
              postingFrequency: 'daily', voiceConfig: {}, contentTypesAllowed: [],
              rulesSummary: null, followersAttributed: 0, karmaEarned: 0,
              totalPosts: 0, totalComments: 0,
              lastPostAt: null, lastEngagementAt: null,
              status: 'active', createdAt: '',
            },
            denialDay,
          );

          if (comment) {
            await recordKarmaComment(
              userId,
              suggestion.subreddit,
              comment.text,
              suggestion.subreddit,
              comment.intent,
            );
            summary.redditComments++;
            actions.push({
              step: 'reddit_engagement',
              type: 'comment',
              platform: 'reddit',
              detail: `${suggestion.subreddit}: ${comment.text.slice(0, 50)}...`,
              success: true,
            });
          }
        }
      } else {
        // Post-karma: community engagement on target subs
        const communities = await getActiveCommunities(userId, 'reddit');
        for (const community of communities.slice(0, 5)) {
          const comment = await generateRedditComment(userId, community, denialDay);
          if (comment) {
            await logEngagementAction(userId, {
              actionType: 'community_comment',
              platform: 'reddit',
              communityId: community.communityId,
              contentText: comment.text,
              handlerIntent: comment.intent,
            });
            summary.redditComments++;
            actions.push({
              step: 'reddit_engagement',
              type: 'comment',
              platform: 'reddit',
              detail: `${community.communityId}: ${comment.text.slice(0, 50)}...`,
              success: true,
            });
          }
        }
      }
    },
    actions,
    failed,
  );

  // === STEP 2: TWITTER ENGAGEMENT ===
  await executeStep(
    'twitter_engagement',
    async () => {
      const communities = await getActiveCommunities(userId, 'twitter');
      for (const community of communities.slice(0, 3)) {
        const reply = await generateTwitterReply(userId, denialDay);
        if (reply) {
          await logEngagementAction(userId, {
            actionType: 'engagement_reply',
            platform: 'twitter',
            communityId: community.communityId,
            contentText: reply.text,
            handlerIntent: reply.intent,
          });
          summary.twitterEngagements++;
          actions.push({
            step: 'twitter_engagement',
            type: 'reply',
            platform: 'twitter',
            detail: `${community.communityId}: ${reply.text.slice(0, 50)}...`,
            success: true,
          });
        }
      }
    },
    actions,
    failed,
  );

  // === STEP 3: TEXT-ONLY CONTENT ===
  await executeStep(
    'text_content',
    async () => {
      const now = new Date();
      const hour = now.getHours();
      const timeOfDay =
        hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;

      const posts = await generateDailyTextContent(userId, {
        denialDay,
        consecutiveSkips,
        recentMilestone: null,
        activePollQuestion: null,
        isWeekend,
        timeOfDay: timeOfDay as 'morning' | 'afternoon' | 'evening' | 'night',
      });

      const queued = await queueTextPosts(userId, posts);
      summary.textPostsQueued = queued;
      actions.push({
        step: 'text_content',
        type: 'text_posts',
        platform: 'multi',
        detail: `${queued} text posts queued`,
        success: true,
      });
    },
    actions,
    failed,
  );

  // === STEP 4: POLL MANAGEMENT ===
  await executeStep(
    'polls',
    async () => {
      const pollType = selectPollType(denialDay, consecutiveSkips);
      if (pollType) {
        const result = await createGeneratedPoll(userId, denialDay, pollType, {
          consecutiveSkips,
        });
        if (result) {
          summary.pollsCreated++;
          actions.push({
            step: 'polls',
            type: 'poll_created',
            platform: 'multi',
            detail: `${pollType} poll: ${result.poll.question}`,
            success: true,
          });
        }
      }
    },
    actions,
    failed,
  );

  // === STEP 5: CREATOR OUTREACH ===
  await executeStep(
    'outreach',
    async () => {
      if (await shouldDoOutreach(userId)) {
        const ready = await getOutreachReady(userId);
        for (const action of ready.slice(0, 2)) {
          if (action.type === 'dm') {
            const creators = await getCreatorRelationships(userId);
            const creator = creators.find(c => c.id === action.creatorId);
            if (creator) {
              const dmText = await generateOutreachDm(userId, creator);
              if (dmText) {
                await recordCreatorDm(userId, creator.id, dmText);
                summary.dmsSent++;
                actions.push({
                  step: 'outreach',
                  type: 'creator_dm',
                  platform: creator.platform,
                  detail: `DM to ${creator.username}: ${dmText.slice(0, 50)}...`,
                  success: true,
                });
              }
            }
          } else if (action.type === 'comment') {
            await recordCreatorInteraction(userId, action.creatorId, 'comment');
            actions.push({
              step: 'outreach',
              type: 'creator_comment',
              platform: action.platform,
              detail: `Commented on creator ${action.creatorId}`,
              success: true,
            });
          }
        }
      }
    },
    actions,
    failed,
  );

  // === STEP 6: MOLTBOOK POST ===
  await executeStep(
    'moltbook',
    async () => {
      const success = await autonomousMoltbookPost(userId, denialDay);
      if (success) {
        summary.moltbookPosts++;
        actions.push({
          step: 'moltbook',
          type: 'post',
          platform: 'moltbook',
          detail: 'Daily Moltbook post',
          success: true,
        });
      }
    },
    actions,
    failed,
  );

  // === STEP 7: CONTENT RECYCLING ===
  await executeStep(
    'recycling',
    async () => {
      const candidates = await getRecycleCandidates(userId, 3);
      for (const candidate of candidates) {
        // Voice modifier available via getDenialVoiceModifier(denialDay) if needed
        const newCaption = candidate.originalCaption
          ? `Throwback 🔒 ${candidate.originalCaption}`
          : `Day ${denialDay}. Throwback content. 🔒`;

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(12 + Math.floor(Math.random() * 6), 0, 0, 0);

        const postId = await createRecycledPost(
          userId,
          candidate,
          newCaption,
          tomorrow.toISOString(),
        );

        if (postId) {
          summary.recycledPosts++;
          actions.push({
            step: 'recycling',
            type: 'recycle',
            platform: 'reddit',
            detail: `Recycled to ${candidate.suggestedCommunity}`,
            success: true,
          });
        }
      }
    },
    actions,
    failed,
  );

  // === STEP 8: LOG ROUTINE EXECUTION ===
  summary.totalActions = actions.length;

  await supabase.from('handler_autonomous_actions').insert({
    user_id: userId,
    action_type: 'milestone_post',
    platform: 'system',
    content_text: `Daily routine: ${summary.totalActions} actions (${summary.redditComments} reddit, ${summary.twitterEngagements} twitter, ${summary.textPostsQueued} texts, ${summary.pollsCreated} polls, ${summary.moltbookPosts} moltbook)`,
    handler_intent: 'Daily autonomous routine execution log.',
    engagement_received: summary as unknown as Record<string, unknown>,
  });

  return {
    timestamp: new Date().toISOString(),
    denialDay,
    actionsCompleted: actions,
    actionsFailed: failed,
    summary,
  };
}

// ============================================
// Morning Briefing Data
// ============================================

/**
 * Build the morning briefing text from last 24h activity.
 * Shows what the Handler did while David was sleeping.
 */
export async function buildMorningBriefingText(userId: string): Promise<string> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: actions } = await supabase
    .from('handler_autonomous_actions')
    .select('action_type, platform, community_id')
    .eq('user_id', userId)
    .gte('created_at', yesterday);

  if (!actions || actions.length === 0) {
    return 'The machine is idle. No autonomous actions in 24h.';
  }

  // Count by type
  const counts: Record<string, number> = {};
  for (const a of actions) {
    counts[a.action_type] = (counts[a.action_type] ?? 0) + 1;
  }

  const parts = ['While you were away:'];

  if (counts.community_comment || counts.subreddit_comment) {
    const total = (counts.community_comment ?? 0) + (counts.subreddit_comment ?? 0);
    parts.push(`  ${total} comments made across Reddit communities`);
  }
  if (counts.engagement_reply) {
    parts.push(`  ${counts.engagement_reply} tweets replied to`);
  }
  if (counts.follow) {
    parts.push(`  ${counts.follow} new accounts followed`);
  }
  if (counts.creator_dm) {
    parts.push(`  ${counts.creator_dm} creator DMs sent`);
  }
  if (counts.text_post) {
    parts.push(`  ${counts.text_post} text posts queued`);
  }
  if (counts.poll_posted) {
    parts.push(`  ${counts.poll_posted} polls created`);
  }
  if (counts.cross_promo) {
    parts.push(`  ${counts.cross_promo} cross-promotions`);
  }

  parts.push('');
  parts.push("Maxy's world got bigger without her lifting a finger.");

  return parts.join('\n');
}

// ============================================
// Helpers
// ============================================

async function executeStep(
  stepName: string,
  fn: () => Promise<void>,
  _actions: RoutineAction[],
  failed: RoutineAction[],
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`Autonomous routine step ${stepName} failed:`, err);
    failed.push({
      step: stepName,
      type: 'error',
      platform: 'system',
      detail: err instanceof Error ? err.message : 'Unknown error',
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
