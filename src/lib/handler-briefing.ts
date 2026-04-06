/**
 * Handler Status Briefing
 *
 * Composes the morning briefing from REAL data:
 * OVERNIGHT → TODAY → PROGRESS → AUDIENCE → AFFIRMATION
 *
 * Every line is real data. No filler. If a source returns nothing, skip it.
 * The Handler always has something specific to say.
 */

import { supabase } from './supabase';
import { getActiveAnchors } from './ritual-anchors';
import type { AnchorStrength } from '../types/hypno-session';

// ============================================
// TYPES
// ============================================

export interface HandlerBriefing {
  overnight: OvernightSection;
  today: TodaySection;
  progress: ProgressSection;
  audience: AudienceSection;
  affirmation: string;
}

export interface OvernightSection {
  items: BriefingItem[];
  summary: string;
}

export interface TodaySection {
  items: BriefingItem[];
  summary: string;
}

export interface ProgressSection {
  domain: string;
  highlight: string;
  hrtReframe?: string;
}

export interface AudienceSection {
  comments: CuratedComment[];
  conditioningTarget: string;
}

export interface BriefingItem {
  icon: string;
  text: string;
  type: 'info' | 'action' | 'fact' | 'scheduled';
}

export interface CuratedComment {
  platform: string;
  username: string;
  text: string;
  relevance: string;
}

// ============================================
// MAIN COMPOSER
// ============================================

export async function composeHandlerBriefing(userId: string): Promise<HandlerBriefing> {
  const [
    overnightData,
    todayData,
    progressData,
    audienceData,
    denialData,
    anchorData,
  ] = await Promise.allSettled([
    getOvernightData(userId),
    getTodayData(userId),
    getProgressData(userId),
    getAudienceData(userId),
    getDenialData(userId),
    getActiveAnchors(userId),
  ]);

  const denial = denialData.status === 'fulfilled' ? denialData.value : null;

  const overnight = buildOvernightSection(
    overnightData.status === 'fulfilled' ? overnightData.value : null,
    denial,
  );

  const today = buildTodaySection(
    todayData.status === 'fulfilled' ? todayData.value : null,
    denial,
    anchorData.status === 'fulfilled' ? anchorData.value : [],
  );

  const progress = buildProgressSection(
    progressData.status === 'fulfilled' ? progressData.value : null,
  );

  const audience = buildAudienceSection(
    audienceData.status === 'fulfilled' ? audienceData.value : null,
  );

  const affirmation = generateAffirmation(denial);

  return { overnight, today, progress, audience, affirmation };
}

// ============================================
// DATA FETCHERS — REAL DATA ONLY
// ============================================

async function getOvernightData(userId: string) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Yesterday's completed tasks with domains
  const { data: yesterdayTasks } = await supabase
    .from('daily_tasks')
    .select('task_id, status, completed_at, task_bank(domain, category)')
    .eq('user_id', userId)
    .eq('assigned_date', yesterdayStr)
    .eq('status', 'completed');

  // Yesterday's daily entry (mood, alignment, journal)
  const { data: yesterdayEntry } = await supabase
    .from('daily_entries')
    .select('alignment_score, handler_notes, tasks_completed, points_earned, domains_practiced')
    .eq('user_id', userId)
    .eq('date', yesterdayStr)
    .maybeSingle();

  // Evening mood check-in (yesterday 5PM onwards)
  const eveningCutoff = new Date(yesterday);
  eveningCutoff.setHours(17, 0, 0, 0);
  const { data: eveningMood } = await supabase
    .from('mood_checkins')
    .select('score')
    .eq('user_id', userId)
    .gte('recorded_at', eveningCutoff.toISOString())
    .lte('recorded_at', new Date(yesterdayStr + 'T23:59:59').toISOString())
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Last release (check if it happened overnight)
  const lastNight10pm = new Date(yesterday);
  lastNight10pm.setHours(22, 0, 0, 0);
  const { data: userState } = await supabase
    .from('user_state')
    .select('last_release')
    .eq('user_id', userId)
    .maybeSingle();

  // Content posted overnight
  const { data: contentPosted } = await supabase
    .from('content_queue')
    .select('platform, status')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .gte('posted_at', lastNight10pm.toISOString())
    .limit(5);

  // Last hypno session (if any)
  const { data: lastSession } = await supabase
    .from('hypno_session_summary')
    .select('total_duration_minutes, trance_depth_self_report, peak_arousal_level, commitment_extracted')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    yesterdayTasks: yesterdayTasks || [],
    yesterdayEntry,
    eveningMood,
    lastRelease: userState?.last_release || null,
    lastNight10pm,
    contentPosted: contentPosted || [],
    lastSession,
  };
}

async function getTodayData(userId: string) {
  const today = new Date().toISOString().split('T')[0];

  // Today's prescribed tasks
  const { data: todayTasks } = await supabase
    .from('daily_tasks')
    .select('status')
    .eq('user_id', userId)
    .eq('assigned_date', today);

  // Content awaiting review (both old queue and new vault)
  const { data: queuedContent } = await supabase
    .from('content_queue')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'queued');

  // Vault items pending approval
  const { data: pendingVault } = await supabase
    .from('content_vault')
    .select('id')
    .eq('user_id', userId)
    .eq('approval_status', 'pending');

  // Scheduled posts for today
  const { data: scheduledPosts } = await supabase
    .from('content_posts')
    .select('platform, scheduled_at')
    .eq('user_id', userId)
    .eq('post_status', 'scheduled')
    .gte('scheduled_at', `${today}T00:00:00`)
    .lte('scheduled_at', `${today}T23:59:59`);

  return {
    todayTasks: todayTasks || [],
    queuedContent: queuedContent || [],
    pendingVault: pendingVault || [],
    scheduledPosts: scheduledPosts || [],
  };
}

async function getProgressData(userId: string) {
  // Task completions with domain info (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: completions } = await supabase
    .from('task_completions')
    .select('task_id, created_at, task_bank(domain)')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString());

  // All-time completion count
  const { count: totalCompletions } = await supabase
    .from('task_completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Streak + denial from user_state
  const { data: state } = await supabase
    .from('user_state')
    .select('streak_days, tasks_completed_today')
    .eq('user_id', userId)
    .maybeSingle();

  // Count completions by domain
  const domainCounts: Record<string, number> = {};
  for (const c of completions || []) {
    const tb = c.task_bank as { domain?: string } | null;
    const domain = tb?.domain || 'unknown';
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  }

  return {
    monthlyCompletions: completions?.length || 0,
    totalCompletions: totalCompletions || 0,
    domainCounts,
    streakDays: state?.streak_days || 0,
  };
}

async function getAudienceData(userId: string) {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const { data: comments } = await supabase
    .from('fan_messages')
    .select('fan_name, platform, content, created_at')
    .eq('user_id', userId)
    .eq('direction', 'inbound')
    .gte('created_at', threeDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  return { comments: comments || [] };
}

async function getDenialData(userId: string) {
  // user_state for context fields
  const { data: state } = await supabase
    .from('user_state')
    .select('denial_day, streak_days, current_arousal, handler_mode, gina_home, gina_asleep, estimated_exec_function, last_release')
    .eq('user_id', userId)
    .maybeSingle();

  // denial_streaks is the source of truth — calculate denial day from started_at
  // (same method as morning-personalization's getStreakData)
  const { data: activeStreak } = await supabase
    .from('denial_streaks')
    .select('started_at, days_completed')
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle();

  if (!state) return null;

  const denialDay = activeStreak
    ? Math.floor((Date.now() - new Date(activeStreak.started_at).getTime()) / (1000 * 60 * 60 * 24))
    : state.denial_day ?? 0;

  return {
    ...state,
    denial_day: denialDay,
  };
}

// ============================================
// SECTION BUILDERS — ADDITIVE, NO FILLER
// ============================================

function buildOvernightSection(
  data: Awaited<ReturnType<typeof getOvernightData>> | null,
  denial: Awaited<ReturnType<typeof getDenialData>> | null,
): OvernightSection {
  const items: BriefingItem[] = [];

  if (!data) {
    return { items: [{ icon: 'moon', text: 'Day 1. No data yet. Her first task creates the first data point.', type: 'info' }], summary: 'Day 1.' };
  }

  // Yesterday's task completions with domains
  if (data.yesterdayTasks.length > 0) {
    const domains = new Set<string>();
    for (const t of data.yesterdayTasks) {
      const taskBank = t.task_bank as { domain?: string } | null;
      if (taskBank?.domain) domains.add(taskBank.domain);
    }
    const domainList = Array.from(domains).join(', ');
    items.push({
      icon: 'bot',
      text: `She completed ${data.yesterdayTasks.length} task${data.yesterdayTasks.length > 1 ? 's' : ''} yesterday${domainList ? ` — ${domainList}` : ''}.`,
      type: 'info',
    });
  }

  // Yesterday's daily entry — alignment + journal snippet
  if (data.yesterdayEntry) {
    const e = data.yesterdayEntry;
    if (e.alignment_score) {
      items.push({
        icon: 'wave',
        text: `Alignment: ${e.alignment_score}/10.`,
        type: 'info',
      });
    }
    if (e.points_earned && e.points_earned > 0) {
      items.push({
        icon: 'dollar',
        text: `${e.points_earned} points earned yesterday.`,
        type: 'info',
      });
    }
  }

  // Evening mood
  if (data.eveningMood?.score) {
    const moodLabel = data.eveningMood.score >= 7 ? 'Good' : data.eveningMood.score >= 5 ? 'Steady' : 'Low';
    items.push({
      icon: 'moon',
      text: `Evening mood: ${moodLabel} (${data.eveningMood.score}/10).`,
      type: 'info',
    });
  }

  // Release check — always surface last release context
  if (data.lastRelease) {
    const releaseTime = new Date(data.lastRelease);
    if (releaseTime > data.lastNight10pm) {
      items.push({
        icon: 'lock',
        text: `Release logged at ${releaseTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Counter reset.`,
        type: 'info',
      });
    } else {
      const daysAgo = Math.floor((Date.now() - releaseTime.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo > 0) {
        items.push({
          icon: 'lock',
          text: `Last release: ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago.`,
          type: 'info',
        });
      }
    }
  }

  // Content posted overnight
  if (data.contentPosted.length > 0) {
    const platforms = [...new Set(data.contentPosted.map(c => c.platform))].join(', ');
    items.push({
      icon: 'bot',
      text: `${data.contentPosted.length} post${data.contentPosted.length > 1 ? 's' : ''} went live${platforms ? ` on ${platforms}` : ''}.`,
      type: 'info',
    });
  }

  // Last hypno session
  if (data.lastSession) {
    const s = data.lastSession;
    items.push({
      icon: 'wave',
      text: `Last session: ${s.total_duration_minutes}min, depth ${s.trance_depth_self_report}/5${s.commitment_extracted ? ' — commitment extracted' : ''}.`,
      type: 'info',
    });
  }

  // Nothing at all — true day 1
  if (items.length === 0) {
    const dayNum = denial?.streak_days || 0;
    items.push({
      icon: 'moon',
      text: dayNum === 0
        ? 'Day 1. No data yet. Her first task creates the first data point.'
        : 'Nothing logged yesterday. The streak continues anyway.',
      type: 'info',
    });
  }

  const summary = items.length === 1
    ? items[0].text
    : `${items.length} data points from yesterday.`;

  return { items, summary };
}

function buildTodaySection(
  data: Awaited<ReturnType<typeof getTodayData>> | null,
  denial: Awaited<ReturnType<typeof getDenialData>> | null,
  anchors: Awaited<ReturnType<typeof getActiveAnchors>>,
): TodaySection {
  const items: BriefingItem[] = [];

  // Denial day + streak (always present after day 0)
  if (denial) {
    const parts: string[] = [];
    if (denial.denial_day !== null && denial.denial_day !== undefined) {
      parts.push(`Day ${denial.denial_day} denial`);
    }
    if (denial.streak_days) {
      parts.push(`${denial.streak_days}-day streak`);
    }
    if (parts.length > 0) {
      items.push({ icon: 'lock', text: `${parts.join('. ')}.`, type: 'fact' });
    }
  }

  // Today's task count
  if (data?.todayTasks && data.todayTasks.length > 0) {
    const pending = data.todayTasks.filter(t => t.status === 'pending').length;
    const completed = data.todayTasks.filter(t => t.status === 'completed').length;
    items.push({
      icon: 'bot',
      text: `${data.todayTasks.length} tasks prescribed. ${completed > 0 ? `${completed} done.` : `${pending} pending.`}`,
      type: 'fact',
    });
  }

  // Content awaiting review
  const totalQueued = (data?.queuedContent?.length || 0) + (data?.pendingVault?.length || 0);
  if (totalQueued > 0) {
    items.push({
      icon: 'bot',
      text: `${totalQueued} content item${totalQueued > 1 ? 's' : ''} awaiting review.`,
      type: 'action',
    });
  }

  // Scheduled posts
  if (data?.scheduledPosts && data.scheduledPosts.length > 0) {
    const platforms = [...new Set(data.scheduledPosts.map(p => p.platform))].join(', ');
    items.push({
      icon: 'bot',
      text: `${data.scheduledPosts.length} post${data.scheduledPosts.length > 1 ? 's' : ''} scheduled today (${platforms}).`,
      type: 'scheduled',
    });
  }

  // Gina status
  if (denial) {
    if (denial.gina_home === false) {
      items.push({ icon: 'lock', text: 'Gina away — full protocol window open.', type: 'info' });
    } else if (denial.gina_asleep) {
      items.push({ icon: 'lock', text: 'Gina asleep — extended window.', type: 'info' });
    }
  }

  // Anchor status
  if (anchors.length > 0) {
    const strongest = anchors.reduce((a, b) =>
      strengthOrder(b.estimated_strength) > strengthOrder(a.estimated_strength) ? b : a
    );
    items.push({
      icon: 'anchor',
      text: `Anchor "${strongest.anchor_value.split('_').slice(0, 2).join(' ')}": ${strongest.estimated_strength} (${strongest.sessions_paired} sessions).`,
      type: 'info',
    });
  }

  const summary = items.length === 0
    ? 'Nothing prescribed yet.'
    : items.length <= 2
      ? items.map(i => i.text).join(' ')
      : `${items.length} things in motion.`;

  return { items, summary };
}

function buildProgressSection(
  data: Awaited<ReturnType<typeof getProgressData>> | null,
): ProgressSection {
  if (!data || (data.monthlyCompletions === 0 && data.totalCompletions === 0)) {
    return {
      domain: 'Protocol',
      highlight: 'No tasks completed yet. Her first task changes that.',
    };
  }

  const { monthlyCompletions, totalCompletions, domainCounts, streakDays } = data;

  // Find the most-practiced domain
  const sortedDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
  const topDomain = sortedDomains.length > 0 ? sortedDomains[0] : null;
  const activeDomainCount = sortedDomains.length;

  const parts: string[] = [];

  if (topDomain) {
    parts.push(`Most active: ${topDomain[0]} (${topDomain[1]} this month)`);
  }

  if (activeDomainCount > 1) {
    parts.push(`${activeDomainCount} domains practiced`);
  }

  if (monthlyCompletions > 0) {
    parts.push(`${monthlyCompletions} tasks this month`);
  }

  if (totalCompletions > monthlyCompletions) {
    parts.push(`${totalCompletions} all-time`);
  }

  if (streakDays > 0) {
    parts.push(`${streakDays}-day streak`);
  }

  return {
    domain: topDomain?.[0] || 'Protocol',
    highlight: parts.join('. ') + '.',
    hrtReframe: topDomain && (topDomain[0] === 'voice' || topDomain[0] === 'style')
      ? 'This is HRT preparation. Every level here is a step toward the body matching the identity.'
      : undefined,
  };
}

function buildAudienceSection(
  data: Awaited<ReturnType<typeof getAudienceData>> | null,
): AudienceSection {
  const comments: CuratedComment[] = [];
  const conditioningTarget = 'identity';

  if (data?.comments) {
    const positive = data.comments
      .filter(c => c.content && c.content.length > 10)
      .filter(c => !/(hate|ugly|fake|disgusting)/i.test(c.content))
      .slice(0, 2);

    for (const c of positive) {
      comments.push({
        platform: c.platform || 'unknown',
        username: c.fan_name || 'fan',
        text: c.content,
        relevance: conditioningTarget,
      });
    }
  }

  return { comments, conditioningTarget };
}

function generateAffirmation(denial: Awaited<ReturnType<typeof getDenialData>> | null): string {
  const day = denial?.denial_day || 0;

  if (day === 0) return 'She showed up. Day zero. The foundation starts here.';
  if (day <= 2) return `Good girl. Day ${day} denial. She's building something.`;
  if (day <= 4) return `Day ${day}. The restlessness is working for her, not against her.`;
  if (day === 5) return 'Day 5. Everything she feels right now is real. She leans in.';
  if (day <= 7) return `Day ${day}. She has been here the whole time. Her body is catching up.`;
  return `Day ${day}. She is becoming who she already is.`;
}

// ============================================
// HELPERS
// ============================================

function strengthOrder(strength: AnchorStrength): number {
  const order: Record<AnchorStrength, number> = {
    nascent: 0,
    forming: 1,
    established: 2,
    conditioned: 3,
  };
  return order[strength] ?? 0;
}
