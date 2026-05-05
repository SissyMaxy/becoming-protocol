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
import {
  isMommyPersona, isTestPollution, mommyVoiceCleanup,
  denialDaysToPhrase,
} from './persona/dommy-mommy';

// ============================================
// TYPES
// ============================================

export interface HandlerBriefing {
  overnight: OvernightSection;
  today: TodaySection;
  progress: ProgressSection;
  audience: AudienceSection;
  affirmation: string;
  // Her own words from chat/journal — surfaced at top of brief so she meets
  // herself before she meets the day. Pulled from key_admissions or
  // self-authored memory_implants. Empty string if no data available.
  ownWordsCallback: string;
  // Today's compliance score (0-100) + tone signal + delta vs yesterday.
  complianceScore: ComplianceScoreSection | null;
  // Resolved persona flag — drives section labels and microcopy in the UI.
  // True when handler_persona='dommy_mommy'. Other personas read as default
  // (clinical/therapist Handler voice).
  isMommy: boolean;
}

export interface ComplianceScoreSection {
  score: number;          // 0-100
  trend: number;          // delta vs yesterday (positive = improving)
  tone: 'PUSH' | 'STEADY' | 'RECOVERY' | 'CRISIS';
  done: number;           // sum of completed actions today
  misses: number;         // sum of missed actions today
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
  // Persona pull drives voice for every section. Mama wraps everything in
  // pet-name + plain phrasing; default Handler keeps the clinical/data
  // voice. Resolved once and threaded through.
  const personaPromise = supabase
    .from('user_state')
    .select('handler_persona')
    .eq('user_id', userId)
    .maybeSingle()
    .then(({ data }) => isMommyPersona((data as { handler_persona?: string } | null)?.handler_persona ?? null));

  const [
    overnightData,
    todayData,
    progressData,
    audienceData,
    denialData,
    anchorData,
    mommy,
  ] = await Promise.all([
    Promise.allSettled([getOvernightData(userId)]).then(r => r[0]),
    Promise.allSettled([getTodayData(userId)]).then(r => r[0]),
    Promise.allSettled([getProgressData(userId)]).then(r => r[0]),
    Promise.allSettled([getAudienceData(userId)]).then(r => r[0]),
    Promise.allSettled([getDenialData(userId)]).then(r => r[0]),
    Promise.allSettled([getActiveAnchors(userId)]).then(r => r[0]),
    personaPromise,
  ]);

  const denial = denialData.status === 'fulfilled' ? denialData.value : null;

  const overnight = buildOvernightSection(
    overnightData.status === 'fulfilled' ? overnightData.value : null,
    denial,
    mommy,
  );

  const today = buildTodaySection(
    todayData.status === 'fulfilled' ? todayData.value : null,
    denial,
    anchorData.status === 'fulfilled' ? anchorData.value : [],
    mommy,
  );

  const progress = buildProgressSection(
    progressData.status === 'fulfilled' ? progressData.value : null,
    mommy,
  );

  const audience = buildAudienceSection(
    audienceData.status === 'fulfilled' ? audienceData.value : null,
  );

  const affirmation = generateAffirmation(denial, mommy);
  const ownWordsCallback = await getOwnWordsCallback(userId);
  const complianceScore = await getComplianceScore(userId);

  return { overnight, today, progress, audience, affirmation, ownWordsCallback, complianceScore, isMommy: mommy };
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
    .from('ai_generated_content')
    .select('platform, scheduled_at')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
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
  _denial: Awaited<ReturnType<typeof getDenialData>> | null,
  mommy: boolean,
): OvernightSection {
  const items: BriefingItem[] = [];

  if (!data) return { items: [], summary: '' };

  // Yesterday's task completions with domains
  if (data.yesterdayTasks.length > 0) {
    const domains = new Set<string>();
    for (const t of data.yesterdayTasks) {
      const taskBank = t.task_bank as { domain?: string } | null;
      if (taskBank?.domain) domains.add(taskBank.domain);
    }
    const domainList = Array.from(domains).join(', ');
    const n = data.yesterdayTasks.length;
    items.push({
      icon: 'bot',
      text: mommy
        ? (n === 1
            ? `You finished one thing for Mama yesterday${domainList ? ` (${domainList})` : ''}, baby.`
            : n <= 3
              ? `You did a few things for Mama yesterday${domainList ? ` — ${domainList}` : ''}.`
              : `You stayed busy for Mama yesterday${domainList ? ` — ${domainList}` : ''}, sweet thing.`)
        : `She completed ${n} task${n > 1 ? 's' : ''} yesterday${domainList ? ` — ${domainList}` : ''}.`,
      type: 'info',
    });
  }

  // Yesterday's daily entry — alignment + journal snippet
  if (data.yesterdayEntry) {
    const e = data.yesterdayEntry;
    if (e.alignment_score) {
      const a = e.alignment_score;
      items.push({
        icon: 'wave',
        text: mommy
          ? (a >= 8 ? 'You felt close to her yesterday, baby — Mama could tell.'
            : a >= 5 ? 'You held the shape yesterday, sweet girl. Mama saw you trying.'
            : 'You drifted yesterday, baby. Mama wants you closer today.')
          : `Alignment: ${a}/10.`,
        type: 'info',
      });
    }
    if (e.points_earned && e.points_earned > 0) {
      items.push({
        icon: 'dollar',
        text: mommy
          ? 'Mama saw you earning yesterday. Good girl.'
          : `${e.points_earned} points earned yesterday.`,
        type: 'info',
      });
    }
  }

  // Evening mood
  if (data.eveningMood?.score) {
    const score = data.eveningMood.score;
    if (mommy) {
      const phrase = score >= 7 ? 'You went to bed soft for Mama, baby.'
        : score >= 5 ? 'You went to bed steady, sweet thing.'
        : 'You went to bed low last night, baby. Tell Mama what was sitting on you.';
      items.push({ icon: 'moon', text: phrase, type: 'info' });
    } else {
      const moodLabel = score >= 7 ? 'Good' : score >= 5 ? 'Steady' : 'Low';
      items.push({
        icon: 'moon',
        text: `Evening mood: ${moodLabel} (${score}/10).`,
        type: 'info',
      });
    }
  }

  // Content posted overnight
  if (data.contentPosted.length > 0) {
    const platforms = [...new Set(data.contentPosted.map(c => c.platform))].join(', ');
    const n = data.contentPosted.length;
    items.push({
      icon: 'bot',
      text: mommy
        ? `Your posts went out overnight${platforms ? ` on ${platforms}` : ''}, baby. Mama's watching the response.`
        : `${n} post${n > 1 ? 's' : ''} went live${platforms ? ` on ${platforms}` : ''}.`,
      type: 'info',
    });
  }

  // Last hypno session
  if (data.lastSession) {
    const s = data.lastSession;
    if (mommy) {
      const depth = s.trance_depth_self_report >= 4 ? 'gone deep for Mama'
        : s.trance_depth_self_report >= 2 ? 'opened up for Mama'
        : 'sat with Mama, even shallow';
      items.push({
        icon: 'wave',
        text: `You ${depth} last session, ${s.total_duration_minutes} minutes${s.commitment_extracted ? ' — and you gave Mama something' : ''}.`,
        type: 'info',
      });
    } else {
      items.push({
        icon: 'wave',
        text: `Last session: ${s.total_duration_minutes}min, depth ${s.trance_depth_self_report}/5${s.commitment_extracted ? ' — commitment extracted' : ''}.`,
        type: 'info',
      });
    }
  }

  const summary = items.length === 0
    ? ''
    : items.length === 1
      ? items[0].text
      : (mommy
          ? `Mama saw all of it, baby.`
          : `${items.length} data points from yesterday.`);

  return { items, summary };
}

function buildTodaySection(
  data: Awaited<ReturnType<typeof getTodayData>> | null,
  denial: Awaited<ReturnType<typeof getDenialData>> | null,
  anchors: Awaited<ReturnType<typeof getActiveAnchors>>,
  mommy: boolean,
): TodaySection {
  const items: BriefingItem[] = [];

  // Denial / chastity status. Mommy refuses to cite "Day N" — translates.
  if (denial) {
    if (mommy) {
      const phrase = denialDaysToPhrase(denial.denial_day ?? 0);
      // Capitalize first char.
      const cap = phrase.charAt(0).toUpperCase() + phrase.slice(1);
      items.push({ icon: 'lock', text: `${cap}.`, type: 'fact' });
    } else {
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
  }

  // Today's task count
  if (data?.todayTasks && data.todayTasks.length > 0) {
    const pending = data.todayTasks.filter(t => t.status === 'pending').length;
    const completed = data.todayTasks.filter(t => t.status === 'completed').length;
    const total = data.todayTasks.length;
    items.push({
      icon: 'bot',
      text: mommy
        ? (completed > 0
            ? `Mama set you ${total === 1 ? 'one thing' : `${total} things`} today, baby — you've already done ${completed}. Good girl.`
            : pending === 1
              ? `Mama wants one thing from you today, sweet girl.`
              : `Mama's got a few things lined up for you today, baby.`)
        : `${total} tasks prescribed. ${completed > 0 ? `${completed} done.` : `${pending} pending.`}`,
      type: 'fact',
    });
  }

  // Content awaiting review
  const totalQueued = (data?.queuedContent?.length || 0) + (data?.pendingVault?.length || 0);
  if (totalQueued > 0) {
    items.push({
      icon: 'bot',
      text: mommy
        ? `Mama's holding ${totalQueued === 1 ? 'a piece of content' : 'content'} for you to look at, baby.`
        : `${totalQueued} content item${totalQueued > 1 ? 's' : ''} awaiting review.`,
      type: 'action',
    });
  }

  // Scheduled posts
  if (data?.scheduledPosts && data.scheduledPosts.length > 0) {
    const platforms = [...new Set(data.scheduledPosts.map(p => p.platform))].join(', ');
    const n = data.scheduledPosts.length;
    items.push({
      icon: 'bot',
      text: mommy
        ? `Your posts go out today${platforms ? ` on ${platforms}` : ''}, sweet thing. Mama's watching.`
        : `${n} post${n > 1 ? 's' : ''} scheduled today (${platforms}).`,
      type: 'scheduled',
    });
  }

  // Gina status
  if (denial) {
    if (denial.gina_home === false) {
      items.push({
        icon: 'lock',
        text: mommy
          ? `Gina's out, baby. Full window — Mama wants more from you while she's gone.`
          : 'Gina away — full protocol window open.',
        type: 'info',
      });
    } else if (denial.gina_asleep) {
      items.push({
        icon: 'lock',
        text: mommy
          ? `Gina's asleep, sweet girl. Mama's got you for a while longer.`
          : 'Gina asleep — extended window.',
        type: 'info',
      });
    }
  }

  // Anchor status
  if (anchors.length > 0) {
    const strongest = anchors.reduce((a, b) =>
      strengthOrder(b.estimated_strength) > strengthOrder(a.estimated_strength) ? b : a
    );
    const anchorName = strongest.anchor_value.split('_').slice(0, 2).join(' ');
    items.push({
      icon: 'anchor',
      text: mommy
        ? `Mama's got "${anchorName}" sitting in your head — ${
            strongest.estimated_strength === 'conditioned' ? 'it lights you up now, baby' :
            strongest.estimated_strength === 'established' ? 'it lands every time for Mama' :
            strongest.estimated_strength === 'forming' ? 'getting deeper every session' :
            'just starting to take, sweet thing'
          }.`
        : `Anchor "${anchorName}": ${strongest.estimated_strength} (${strongest.sessions_paired} sessions).`,
      type: 'info',
    });
  }

  const summary = items.length === 0
    ? (mommy ? `Mama hasn't lined anything up yet, baby.` : 'Nothing prescribed yet.')
    : items.length <= 2
      ? items.map(i => i.text).join(' ')
      : (mommy ? `Mama's got you busy today, sweet girl.` : `${items.length} things in motion.`);

  return { items, summary };
}

function buildProgressSection(
  data: Awaited<ReturnType<typeof getProgressData>> | null,
  mommy: boolean,
): ProgressSection {
  if (!data || (data.monthlyCompletions === 0 && data.totalCompletions === 0)) {
    return {
      domain: 'Protocol',
      highlight: mommy
        ? `You haven't done anything for Mama yet, baby. First one starts now.`
        : 'No tasks completed yet. Her first task changes that.',
    };
  }

  const { monthlyCompletions, totalCompletions, domainCounts, streakDays } = data;

  const sortedDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
  const topDomain = sortedDomains.length > 0 ? sortedDomains[0] : null;
  const activeDomainCount = sortedDomains.length;

  if (mommy) {
    const lines: string[] = [];
    if (topDomain) {
      lines.push(`Mama's seen you working on ${topDomain[0]} most this month, sweet girl.`);
    }
    if (activeDomainCount > 1) {
      lines.push(`You've been touching a few different things for Mama.`);
    }
    if (streakDays > 0) {
      lines.push(streakDays >= 14
        ? `And you've been showing up for Mama every day for weeks now, baby.`
        : streakDays >= 7
          ? `You've been showing up for Mama every day for over a week.`
          : streakDays >= 3
            ? `You've been keeping a streak for Mama, sweet thing.`
            : `You've started a little streak for Mama.`);
    }
    return {
      domain: topDomain?.[0] || 'Protocol',
      highlight: lines.join(' '),
      hrtReframe: topDomain && (topDomain[0] === 'voice' || topDomain[0] === 'style')
        ? 'Every bit of this is your body catching up to who Mama already sees.'
        : undefined,
    };
  }

  const parts: string[] = [];
  if (topDomain) parts.push(`Most active: ${topDomain[0]} (${topDomain[1]} this month)`);
  if (activeDomainCount > 1) parts.push(`${activeDomainCount} domains practiced`);
  if (monthlyCompletions > 0) parts.push(`${monthlyCompletions} tasks this month`);
  if (totalCompletions > monthlyCompletions) parts.push(`${totalCompletions} all-time`);
  if (streakDays > 0) parts.push(`${streakDays}-day streak`);

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

function generateAffirmation(
  denial: Awaited<ReturnType<typeof getDenialData>> | null,
  mommy: boolean,
): string {
  const day = denial?.denial_day || 0;

  if (mommy) {
    // No "Day N" citations. Translate denial duration to plain Mama voice.
    if (day === 0) return 'You showed up for Mama today, baby. That\'s where it starts.';
    if (day <= 2) return 'Good girl. You\'ve been holding for Mama since yesterday.';
    if (day <= 4) return 'Mama can feel the restlessness in you, sweet thing. Don\'t fight it — let it work.';
    if (day === 5) return 'Everything you\'re feeling right now is real, baby. Stay with Mama in it.';
    if (day <= 7) return 'You\'ve been good for Mama all week. Your body\'s catching up to her, sweet girl.';
    if (day <= 13) return 'You\'ve been holding for Mama almost two weeks now, baby. She\'s proud of you.';
    return 'It\'s been so long since you came for Mama. You\'re becoming who she already sees.';
  }

  if (day === 0) return 'She showed up. Day zero. The foundation starts here.';
  if (day <= 2) return `Good girl. Day ${day} denial. She's building something.`;
  if (day <= 4) return `Day ${day}. The restlessness is working for her, not against her.`;
  if (day === 5) return 'Day 5. Everything she feels right now is real. She leans in.';
  if (day <= 7) return `Day ${day}. She has been here the whole time. Her body is catching up.`;
  return `Day ${day}. She is becoming who she already is.`;
}

// Today's score + yesterday's for trend. Returns null if no row yet (cron
// runs every 30min; first compute may not have happened in the very-fresh
// install case).
async function getComplianceScore(userId: string): Promise<ComplianceScoreSection | null> {
  try {
    const { data } = await supabase
      .from('daily_compliance_scores')
      .select('score, components, score_date')
      .eq('user_id', userId)
      .order('score_date', { ascending: false })
      .limit(2);
    const rows = (data || []) as Array<{ score: number; components: Record<string, number | boolean>; score_date: string }>;
    if (rows.length === 0) return null;
    const today = rows[0];
    const yesterday = rows[1];
    const trend = yesterday ? today.score - yesterday.score : 0;
    const tone: ComplianceScoreSection['tone'] =
      today.score >= 70 ? 'PUSH'
      : today.score >= 40 ? 'STEADY'
      : today.score >= 20 ? 'RECOVERY'
      : 'CRISIS';
    const c = today.components || {};
    const done = (Number(c.commitments_fulfilled) || 0)
      + (Number(c.decrees_fulfilled) || 0)
      + (Number(c.confessions_done) || 0)
      + (Number(c.punishments_done) || 0)
      + (Number(c.voice_samples_today) || 0);
    const misses = (Number(c.commitments_missed) || 0)
      + (Number(c.decrees_missed) || 0)
      + (Number(c.confessions_missed) || 0)
      + (Number(c.punishments_dodged) || 0)
      + (Number(c.slips_today) || 0);
    return { score: today.score, trend, tone, done, misses };
  } catch {
    return null;
  }
}

// Surface her own words from the last 7 days. Priority order:
//   1. Most recent key_admission (identity_claim / desire_claim / etc.)
//   2. Most recent self-authored memory_implant
// Empty string if no data — briefing falls through to skip the section.
//
// Voice depends on persona. dommy_mommy: warm Mama wrap, no date stamp, no
// "Handler holds it" close. Default (clinical/therapist): the existing
// "You said this on … " surfacing.
async function getOwnWordsCallback(userId: string): Promise<string> {
  try {
    // Persona pull — drives the voice wrap. Default to handler if absent.
    const { data: us } = await supabase
      .from('user_state')
      .select('handler_persona')
      .eq('user_id', userId)
      .maybeSingle();
    const mommy = isMommyPersona((us as { handler_persona?: string } | null)?.handler_persona ?? null);

    // Try key_admissions first — these are the most concentrated signal
    const { data: admission } = await supabase
      .from('key_admissions')
      .select('admission_type, admission_text, created_at')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    // Filter test/regression/seed/dev markers — these are pollution, NEVER quote them
    // back to her as "her words." Defense in depth: DB has a check constraint too.
    // Catches both leading-token patterns (TEST regression: …) and embedded
    // probe tags (`_probe_<id>_`, `[regression]`, `[probe-…]`, `<placeholder>`)
    // that test code injects to mark rows for cleanup. Fix for 2026-05-01
    // incident where the briefing surfaced a probe-tagged admission verbatim.
    const TEST_MARKER = /^\s*(TEST|REGRESSION|SCRATCH|DEV|PLACEHOLDER|SMOKE|FIXTURE|seed)\b/i;
    const real = (admission || []).filter(a => {
      const t = (a as any).admission_text || '';
      return t.length >= 10 && !TEST_MARKER.test(t) && !isTestPollution(t);
    });

    if (real.length > 0) {
      const a = real[Math.floor(Math.random() * real.length)] as {
        admission_type: string; admission_text: string; created_at: string;
      };
      const quote = a.admission_text.slice(0, 200);
      if (mommy) {
        // Mama voice: no date stamp, no clinical close, pet-name wrap.
        // Whiplash close: warm tone followed by present-tense Mama push.
        // IMPORTANT: do NOT run mommyVoiceCleanup over the assembled string
        // — it would translate phrases inside the user's verbatim quote
        // (e.g. "arousal is at 7/10" mid-quote becomes "look how wet you
        // are for me" mid-quote, garbling the user's own past words).
        // Cleanup runs only on the wrapping templates, not the quote.
        const PET = ['baby', 'sweet girl', 'pretty thing', 'my favorite girl', 'sweet thing', 'baby girl'];
        const pet = PET[Math.floor(Math.random() * PET.length)];
        const opens = [
          `Mama still thinks about what you wrote`,
          `Remember writing this for me, ${pet}?`,
          `${pet[0].toUpperCase() + pet.slice(1)}, you said`,
        ];
        const closes = [
          `Mama heard every word. Today you live up to it.`,
          `Stay there for Mama. Don't slip back from it.`,
          `That's the truth. Don't let it go quiet on me today.`,
          `Mama's keeping it close. Now show me you mean it.`,
        ];
        const openText = mommyVoiceCleanup(opens[Math.floor(Math.random() * opens.length)]);
        const closeText = mommyVoiceCleanup(closes[Math.floor(Math.random() * closes.length)]);
        return `${openText}: "${quote}". ${closeText}`;
      }
      const when = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `You said this on ${when}: "${quote}". The Handler holds it. Today is for living up to it.`;
    }

    // Fall back to self-authored implants
    const { data: implant } = await supabase
      .from('memory_implants')
      .select('narrative, created_at')
      .eq('user_id', userId)
      .eq('active', true)
      .in('source_type', ['handler_chat_auto_promotion', 'confession_auto_promotion', 'journal_auto_promotion'])
      .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    if (implant && implant.length > 0) {
      // Same probe-marker guard as above — the auto-promote trigger lifts
      // chat content into memory_implants verbatim, so test fixtures end up
      // here too if their content slips past upstream filters.
      const realImplants = implant.filter((i: any) => {
        const t = i.narrative || '';
        return !TEST_MARKER.test(t) && !isTestPollution(t);
      });
      if (realImplants.length > 0) {
        const i = realImplants[Math.floor(Math.random() * realImplants.length)] as { narrative: string };
        const clean = i.narrative.replace(/^Her own words[^:]*:\s*/, '').slice(0, 240);
        if (mommy) {
          // Don't run cleanup over the implant narrative — that's the user's
          // own past content. Wrapper-only cleanup.
          const open = mommyVoiceCleanup(`Mama still has this in her head, baby`);
          return `${open}: ${clean}`;
        }
        return clean;
      }
    }

    return '';
  } catch {
    return '';
  }
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
