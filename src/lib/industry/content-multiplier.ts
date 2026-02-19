/**
 * Content Multiplier — 1 shoot → 8+ posts over 7 days
 * Maps photos to platforms, generates captions, schedules distribution.
 */

import { supabase } from '../supabase';
import type {
  ShootPrescription,
  ContentMultiplicationPlan,
  MultiplicationPost,
} from '../../types/industry';

// Platform classification based on content type
const PLATFORM_ROUTING: Record<string, string[]> = {
  cage_check: ['reddit:r/chastity', 'reddit:r/LockedAndCaged', 'twitter', 'onlyfans'],
  photo_set: ['onlyfans', 'reddit:r/sissies', 'reddit:r/FemBoys', 'twitter', 'fansly'],
  tease_video: ['onlyfans', 'twitter', 'fansly'],
  outfit_of_day: ['reddit:r/sissies', 'reddit:r/sissydressing', 'reddit:r/FemBoys', 'twitter'],
  edge_capture: ['onlyfans', 'reddit:r/chastity', 'reddit:r/GoonCaves'],
  progress_photo: ['onlyfans', 'reddit:r/sissies', 'twitter'],
  toy_showcase: ['onlyfans', 'fansly'],
  short_video: ['onlyfans', 'twitter', 'fansly'],
};

// Day 0 = shoot day, days 1-7 = staggered releases
interface ScheduleSlot {
  day: number;
  platform: string;
  subreddit?: string;
  contentType: 'full_set' | 'teaser' | 'text_only' | 'censored_teaser';
  mediaCount: number;
}

function buildSchedule(
  _shootType: string,
  denialDay: number,
  platforms: string[],
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];

  // Day 0: Primary platforms
  // Full set on OF
  slots.push({
    day: 0,
    platform: 'onlyfans',
    contentType: denialDay >= 5 ? 'full_set' : 'full_set',
    mediaCount: -1, // all selected
  });

  // Best single shot on primary Reddit
  const redditSubs = platforms
    .filter(p => p.startsWith('reddit:'))
    .map(p => p.replace('reddit:', ''));

  if (redditSubs.length > 0) {
    slots.push({
      day: 0,
      platform: 'reddit',
      subreddit: redditSubs[0],
      contentType: 'teaser',
      mediaCount: 1,
    });
  }

  // Censored teaser on Twitter
  slots.push({
    day: 0,
    platform: 'twitter',
    contentType: 'censored_teaser',
    mediaCount: 1,
  });

  // Days 1-3: Stagger remaining Reddit subs
  for (let i = 1; i < redditSubs.length && i <= 3; i++) {
    slots.push({
      day: i,
      platform: 'reddit',
      subreddit: redditSubs[i],
      contentType: 'teaser',
      mediaCount: 1,
    });
  }

  // Day 2: Fansly gets full set (delayed from OF)
  if (platforms.some(p => p === 'fansly' || p.includes('fansly'))) {
    slots.push({
      day: 2,
      platform: 'fansly',
      contentType: 'full_set',
      mediaCount: -1,
    });
  }

  // Day 3-4: Additional Twitter posts with different shots
  slots.push({
    day: 3,
    platform: 'twitter',
    contentType: 'teaser',
    mediaCount: 1,
  });

  // Day 5: Moltbook
  slots.push({
    day: 5,
    platform: 'moltbook',
    contentType: 'teaser',
    mediaCount: 1,
  });

  // Day 7: Throwback/callback post on Twitter
  slots.push({
    day: 7,
    platform: 'twitter',
    contentType: 'text_only',
    mediaCount: 0,
  });

  return slots;
}

// Caption generation per platform
function generateCaption(
  platform: string,
  subreddit: string | undefined,
  _shootType: string,
  denialDay: number,
  baseCaption: string,
  day: number,
): string {
  // Day 0 uses the base caption (Handler-written)
  if (day === 0 && !subreddit) return baseCaption;

  // Reddit: shorter title format
  if (platform === 'reddit' && subreddit) {
    const dayRef = denialDay > 0 ? `Day ${denialDay} locked. ` : '';
    if (subreddit.includes('chastity')) {
      return `${dayRef}${baseCaption.slice(0, 80)}${baseCaption.length > 80 ? '...' : ''} [link in bio for full set]`;
    }
    return `${dayRef}${baseCaption.slice(0, 100)}`;
  }

  // Twitter: character limit aware
  if (platform === 'twitter') {
    if (day === 7) {
      return `throwback to day ${denialDay} locked... I still think about this shoot. link in bio if you missed it.`;
    }
    const short = baseCaption.slice(0, 200);
    return denialDay > 0
      ? `${short}${short.length < baseCaption.length ? '...' : ''} link in bio.`
      : `${short}${short.length < baseCaption.length ? '...' : ''}`;
  }

  // Fansly: similar to OF but can vary
  if (platform === 'fansly') {
    return baseCaption;
  }

  return baseCaption;
}

/**
 * Generate a multiplication plan from a completed shoot.
 * Creates content_queue entries for each scheduled post.
 */
export async function generateMultiplicationPlan(
  userId: string,
  shoot: ShootPrescription,
  selectedMediaPaths: string[],
): Promise<ContentMultiplicationPlan | null> {
  const platforms = PLATFORM_ROUTING[shoot.shootType] ?? ['onlyfans', 'twitter'];
  const schedule = buildSchedule(
    shoot.shootType,
    shoot.denialDay ?? 0,
    platforms,
  );

  const baseCaption = shoot.captionDraft || '';
  const posts: MultiplicationPost[] = schedule.map(slot => ({
    platform: slot.subreddit ? `reddit:${slot.subreddit}` : slot.platform,
    contentType: slot.contentType,
    scheduledDay: slot.day,
    caption: generateCaption(
      slot.platform,
      slot.subreddit,
      shoot.shootType,
      shoot.denialDay ?? 0,
      baseCaption,
      slot.day,
    ),
    mediaSelection: slot.mediaCount === -1
      ? selectedMediaPaths
      : slot.mediaCount === 0
        ? []
        : selectedMediaPaths.slice(0, slot.mediaCount),
    status: 'planned',
  }));

  // Insert multiplication plan
  const { data: plan, error: planError } = await supabase
    .from('content_multiplication_plans')
    .insert({
      user_id: userId,
      source_shoot_id: shoot.id,
      total_posts_planned: posts.length,
      posts,
    })
    .select()
    .single();

  if (planError || !plan) {
    console.error('Failed to create multiplication plan:', planError);
    return null;
  }

  // Create content_queue entries for each post
  const now = new Date();
  const queueEntries = posts.map(post => {
    const scheduledDate = new Date(now);
    scheduledDate.setDate(scheduledDate.getDate() + post.scheduledDay);
    // Spread within day: OF at 10am, Reddit at 2pm, Twitter at 6pm
    const platformHour = post.platform.includes('onlyfans') ? 10
      : post.platform.includes('reddit') ? 14
      : post.platform.includes('twitter') ? 18
      : 12;
    scheduledDate.setHours(platformHour, 0, 0, 0);

    return {
      user_id: userId,
      source_shoot_id: shoot.id,
      multiplication_plan_id: plan.id,
      platform: post.platform.split(':')[0], // strip subreddit
      content_type: post.contentType,
      media_paths: post.mediaSelection,
      caption: post.caption,
      hashtags: [],
      denial_day_badge: shoot.denialDay,
      scheduled_for: scheduledDate.toISOString(),
      status: 'queued',
    };
  });

  const { error: queueError } = await supabase
    .from('content_queue')
    .insert(queueEntries);

  if (queueError) {
    console.error('Failed to create content queue entries:', queueError);
  }

  // Map to app type
  const mapped: ContentMultiplicationPlan = {
    id: plan.id,
    userId: plan.user_id,
    sourceShootId: plan.source_shoot_id,
    totalPostsPlanned: plan.total_posts_planned,
    posts: plan.posts ?? [],
    createdAt: plan.created_at,
  };

  return mapped;
}

/**
 * Get the multiplication plan for a shoot.
 */
export async function getMultiplicationPlan(
  userId: string,
  shootId: string,
): Promise<ContentMultiplicationPlan | null> {
  const { data, error } = await supabase
    .from('content_multiplication_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('source_shoot_id', shootId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    sourceShootId: data.source_shoot_id,
    totalPostsPlanned: data.total_posts_planned,
    posts: data.posts ?? [],
    createdAt: data.created_at,
  };
}
