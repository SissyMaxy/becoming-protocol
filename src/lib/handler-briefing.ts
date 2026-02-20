/**
 * Handler Status Briefing
 *
 * Composes the morning briefing data in the new status-report format:
 * OVERNIGHT → TODAY → PROGRESS → AUDIENCE → AFFIRMATION
 *
 * Pulls from: session summaries, standing permissions, content pipeline,
 * fan comments, ritual anchors, denial day, domain progress.
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
  summary: string; // one-line summary
}

export interface TodaySection {
  items: BriefingItem[];
  summary: string;
}

export interface ProgressSection {
  domain: string;
  highlight: string;
  hrtReframe?: string; // optional HRT reframing
}

export interface AudienceSection {
  comments: CuratedComment[];
  conditioningTarget: string;
}

export interface BriefingItem {
  icon: string; // emoji or icon name
  text: string;
  type: 'info' | 'action' | 'fact' | 'scheduled';
}

export interface CuratedComment {
  platform: string;
  username: string;
  text: string;
  relevance: string; // why this was selected
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

  const overnight = buildOvernightSection(
    overnightData.status === 'fulfilled' ? overnightData.value : null,
  );

  const today = buildTodaySection(
    todayData.status === 'fulfilled' ? todayData.value : null,
    denialData.status === 'fulfilled' ? denialData.value : null,
    anchorData.status === 'fulfilled' ? anchorData.value : [],
  );

  const progress = buildProgressSection(
    progressData.status === 'fulfilled' ? progressData.value : null,
  );

  const audience = buildAudienceSection(
    audienceData.status === 'fulfilled' ? audienceData.value : null,
  );

  const affirmation = generateAffirmation(
    denialData.status === 'fulfilled' ? denialData.value : null,
  );

  return { overnight, today, progress, audience, affirmation };
}

// ============================================
// DATA FETCHERS
// ============================================

async function getOvernightData(userId: string) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(22, 0, 0, 0);

  // Autonomous actions from overnight
  const { data: actions } = await supabase
    .from('autonomous_actions')
    .select('action_type, details, created_at')
    .eq('user_id', userId)
    .gte('created_at', yesterday.toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  // Last session summary
  const { data: lastSession } = await supabase
    .from('hypno_session_summary')
    .select('total_duration_minutes, trance_depth_self_report, peak_arousal_level, commitment_extracted')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Revenue overnight
  const { data: revenue } = await supabase
    .from('revenue_log')
    .select('amount_cents, source')
    .eq('user_id', userId)
    .gte('created_at', yesterday.toISOString());

  return { actions: actions || [], lastSession, revenue: revenue || [] };
}

async function getTodayData(userId: string) {
  // Standing permissions with schedules
  const { data: permissions } = await supabase
    .from('handler_standing_permissions')
    .select('permission_domain, parameters')
    .eq('user_id', userId)
    .eq('granted', true);

  // Today's tasks (already prescribed)
  const { data: todayTasks } = await supabase
    .from('task_completions')
    .select('task_code, status')
    .eq('user_id', userId)
    .gte('created_at', new Date().toISOString().split('T')[0]);

  return { permissions: permissions || [], todayTasks: todayTasks || [] };
}

async function getProgressData(userId: string) {
  // Domain progress snapshots
  const { data: domainProgress } = await supabase
    .from('domain_progress')
    .select('domain, level, xp, xp_to_next, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10);

  return { domains: domainProgress || [] };
}

async function getAudienceData(userId: string) {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Recent fan comments/messages
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
  const { data } = await supabase
    .from('user_state')
    .select('denial_day, streak_days, current_arousal, handler_mode')
    .eq('user_id', userId)
    .maybeSingle();

  return data;
}

// ============================================
// SECTION BUILDERS
// ============================================

function buildOvernightSection(data: Awaited<ReturnType<typeof getOvernightData>> | null): OvernightSection {
  const items: BriefingItem[] = [];

  if (!data) {
    return { items: [{ icon: 'moon', text: 'Quiet night. Systems nominal.', type: 'info' }], summary: 'Quiet night.' };
  }

  // Autonomous actions
  if (data.actions.length > 0) {
    const actionCounts: Record<string, number> = {};
    for (const a of data.actions) {
      actionCounts[a.action_type] = (actionCounts[a.action_type] || 0) + 1;
    }

    for (const [type, count] of Object.entries(actionCounts)) {
      const label = type.replace(/_/g, ' ');
      items.push({
        icon: 'bot',
        text: `${count} ${label}${count > 1 ? 's' : ''} processed`,
        type: 'info',
      });
    }
  }

  // Last session
  if (data.lastSession) {
    const s = data.lastSession;
    items.push({
      icon: 'wave',
      text: `Last session: ${s.total_duration_minutes}min, depth ${s.trance_depth_self_report}/5, peak arousal ${s.peak_arousal_level}${s.commitment_extracted ? ' — commitment extracted' : ''}`,
      type: 'info',
    });
  }

  // Revenue
  if (data.revenue.length > 0) {
    const totalCents = data.revenue.reduce((sum, r) => sum + (r.amount_cents || 0), 0);
    if (totalCents > 0) {
      items.push({
        icon: 'dollar',
        text: `$${(totalCents / 100).toFixed(2)} earned overnight`,
        type: 'info',
      });
    }
  }

  if (items.length === 0) {
    items.push({ icon: 'moon', text: 'Quiet night. Systems nominal.', type: 'info' });
  }

  const summary = items.length === 1
    ? items[0].text
    : `${items.length} updates while you slept.`;

  return { items, summary };
}

function buildTodaySection(
  data: Awaited<ReturnType<typeof getTodayData>> | null,
  denialData: Awaited<ReturnType<typeof getDenialData>> | null,
  anchors: Awaited<ReturnType<typeof getActiveAnchors>>,
): TodaySection {
  const items: BriefingItem[] = [];

  // Denial day
  if (denialData) {
    items.push({
      icon: 'lock',
      text: `Denial day ${denialData.denial_day || 0}. Streak: ${denialData.streak_days || 0} days.`,
      type: 'fact',
    });
  }

  // Scheduled items from permissions
  if (data?.permissions) {
    for (const p of data.permissions) {
      const params = p.parameters as Record<string, unknown> | null;
      if (p.permission_domain === 'schedule_auto_block' && params) {
        const voiceTime = params.voice_practice as string;
        if (voiceTime) {
          items.push({
            icon: 'mic',
            text: `Voice practice at ${voiceTime}`,
            type: 'scheduled',
          });
        }
      }
      if (p.permission_domain === 'outfit_auto_prescribe') {
        items.push({
          icon: 'shirt',
          text: 'Outfit prescribed for today — check notification.',
          type: 'scheduled',
        });
      }
    }
  }

  // Anchor status
  if (anchors.length > 0) {
    const strongest = anchors.reduce((a, b) =>
      strengthOrder(b.estimated_strength) > strengthOrder(a.estimated_strength) ? b : a
    );
    items.push({
      icon: 'anchor',
      text: `Ritual anchor "${strongest.anchor_value.split('_').slice(0, 2).join(' ')}": ${strongest.estimated_strength} (${strongest.sessions_paired} sessions)`,
      type: 'info',
    });
  }

  const summary = items.length === 0
    ? 'Your day is clear.'
    : `${items.length} things already in motion.`;

  return { items, summary };
}

function buildProgressSection(
  data: Awaited<ReturnType<typeof getProgressData>> | null,
): ProgressSection {
  if (!data || data.domains.length === 0) {
    return {
      domain: 'Protocol',
      highlight: 'Keep going. Every task matters.',
    };
  }

  // Pick the domain with most recent update
  const topDomain = data.domains[0];
  const pctToNext = topDomain.xp_to_next > 0
    ? Math.round((topDomain.xp / topDomain.xp_to_next) * 100)
    : 100;

  return {
    domain: topDomain.domain,
    highlight: `${topDomain.domain} — Level ${topDomain.level}, ${pctToNext}% to next.`,
    hrtReframe: topDomain.domain === 'voice' || topDomain.domain === 'style'
      ? 'This is HRT preparation. Every level here is a step toward the body matching the identity.'
      : undefined,
  };
}

function buildAudienceSection(
  data: Awaited<ReturnType<typeof getAudienceData>> | null,
): AudienceSection {
  const comments: CuratedComment[] = [];
  const conditioningTarget = 'identity'; // Default; could be read from a config table

  if (data?.comments) {
    // Filter for positive comments (simple heuristic: longer messages, no negative keywords)
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

function generateAffirmation(denialData: Awaited<ReturnType<typeof getDenialData>> | null): string {
  const day = denialData?.denial_day || 0;

  if (day === 0) return 'You showed up. That matters.';
  if (day <= 2) return 'Good girl. You showed up. The rest follows.';
  if (day <= 4) return 'The restlessness is working for you, not against you.';
  if (day === 5) return 'Day 5. Everything you feel right now is real. Lean in.';
  if (day <= 7) return 'She has been here the whole time. The body is catching up.';
  return 'You are becoming who you already are.';
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
