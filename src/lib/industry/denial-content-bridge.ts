/**
 * Denial-Content Bridge — Sprint 3
 * Wires the denial engine (606 lines) into the content/industry system.
 * Maps denial day → content strategy, cycle shoot templates, shoot prescriptions.
 */

import { supabase } from '../supabase';
import { getDenialState } from '../denial-engine';
import type {
  DenialDayContentMap,
  DenialCycleShoot,
  ShootPrescription,
  ShootType,
  ShootDifficulty,
  PollType,
  ShotListEntry,
  DbDenialDayContentMap,
  DbDenialCycleShoot,
} from '../../types/industry';

// ============================================
// Types
// ============================================

interface UserContext {
  energy: number;          // 1-10
  ginaHome: boolean;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  contentLevel: string;    // 'sfw' | 'implied' | 'explicit'
  isLocked: boolean;
  currentArousal: number;  // 0-5
}

interface PrescriptionResult {
  prescription: ShootPrescription;
  pollCreated: boolean;
  pollId: string | null;
  isPeakDay: boolean;
}

// Peak arousal windows by time of day
const PEAK_WINDOWS: Record<string, { start: number; end: number }> = {
  morning: { start: 7, end: 9 },
  afternoon: { start: 13, end: 15 },
  evening: { start: 20, end: 23 },
  night: { start: 22, end: 24 },
};

// Denial badge color by day range
const DENIAL_BADGE_COLORS: Record<string, string> = {
  '1': '#3B82F6',   // blue — fresh
  '2': '#3B82F6',   // blue — easy
  '3': '#F59E0B',   // amber — feeling it
  '4': '#F59E0B',   // amber — desperate edge
  '5': '#EC4899',   // pink — PEAK
  '6': '#A855F7',   // purple — broken/surrendered
  '7': '#A855F7',   // purple — transcendent
};

function getDenialBadgeColor(denialDay: number): string {
  if (denialDay <= 0) return '#6B7280'; // gray — no denial
  const clamped = Math.min(denialDay, 7);
  return DENIAL_BADGE_COLORS[String(clamped)] ?? '#A855F7';
}

// ============================================
// 1. getContentStrategyForDenialDay
// ============================================

/**
 * Reads denial_day_content_map to return recommended shoot types,
 * mood, audience hooks, engagement strategy, and handler notes.
 * Falls back to day 7 config for days > 7 (extended denial).
 */
export async function getContentStrategyForDenialDay(
  denialDay: number,
): Promise<DenialDayContentMap | null> {
  // Clamp to 1-7 range; extended denial uses day 7 strategy
  const lookupDay = Math.max(1, Math.min(denialDay, 7));

  const { data, error } = await supabase
    .from('denial_day_content_map')
    .select('*')
    .eq('denial_day', lookupDay)
    .single();

  if (error || !data) {
    console.error('Failed to get content strategy for denial day:', error);
    return null;
  }

  const row = data as DbDenialDayContentMap;
  return {
    id: row.id,
    denialDay: row.denial_day,
    mood: row.mood,
    contentTypes: row.content_types ?? [],
    audienceHooks: row.audience_hooks ?? [],
    engagementStrategy: row.engagement_strategy,
    shootDifficulty: row.shoot_difficulty as ShootDifficulty | null,
    redditSubs: row.reddit_subs ?? [],
    handlerNotes: row.handler_notes,
    optimalShootTypes: (row.optimal_shoot_types ?? []) as ShootType[],
    createdAt: row.created_at,
  };
}

// ============================================
// 2. getDenialCycleShoot
// ============================================

/**
 * Returns the pre-seeded shoot template for this denial day.
 * Falls back to day 7 template for extended denial.
 */
export async function getDenialCycleShootTemplate(
  denialDay: number,
): Promise<DenialCycleShoot | null> {
  const lookupDay = Math.max(1, Math.min(denialDay, 7));

  const { data, error } = await supabase
    .from('denial_cycle_shoots')
    .select('*')
    .eq('denial_day', lookupDay)
    .single();

  if (error || !data) {
    console.error('Failed to get cycle shoot template:', error);
    return null;
  }

  const row = data as DbDenialCycleShoot;
  return {
    id: row.id,
    denialDay: row.denial_day,
    title: row.title,
    shootType: row.shoot_type as ShootType,
    durationMinutes: row.duration_minutes,
    mood: row.mood,
    setup: row.setup,
    outfit: row.outfit,
    shotCount: row.shot_count,
    shotDescriptions: row.shot_descriptions ?? [],
    platforms: row.platforms as DenialCycleShoot['platforms'],
    captionTemplate: row.caption_template,
    pollType: row.poll_type as PollType | null,
    handlerNote: row.handler_note,
    createdAt: row.created_at,
  };
}

// ============================================
// 3. generateShootPrescription
// ============================================

/**
 * Creates a shoot_prescriptions row using denial day context + user state.
 * Day 5+ logic: PEAK content day — schedule during peak arousal window,
 * auto-create denial_release poll, set handler_note about authentic desperation.
 */
export async function generateShootPrescription(
  userId: string,
  denialDay: number,
  userContext: UserContext,
): Promise<PrescriptionResult | null> {
  // Get both content strategy and shoot template
  const [strategy, template] = await Promise.all([
    getContentStrategyForDenialDay(denialDay),
    getDenialCycleShootTemplate(denialDay),
  ]);

  if (!template) {
    console.error('No shoot template found for denial day:', denialDay);
    return null;
  }

  const isPeakDay = denialDay >= 5;

  // Adjust based on energy
  let adjustedTemplate = { ...template };
  if (userContext.energy <= 3) {
    // Low energy: reduce shot count, shorten duration
    adjustedTemplate = {
      ...adjustedTemplate,
      shotDescriptions: adjustedTemplate.shotDescriptions.slice(0, 2),
      durationMinutes: Math.min(adjustedTemplate.durationMinutes, 5),
    };
  }

  // Build handler note
  let handlerNote = template.handlerNote ?? '';
  if (isPeakDay) {
    handlerNote = `🔥 PEAK CONTENT DAY — Day ${denialDay}. Authentic desperation drives engagement. ${handlerNote}`;
  }
  if (userContext.currentArousal >= 4) {
    handlerNote += ' Arousal is high — capture NOW.';
  }
  if (!userContext.ginaHome) {
    handlerNote += ' Not home — defer to later.';
  }

  // Calculate scheduled time
  const scheduledFor = calculateScheduledTime(
    userContext.timeOfDay,
    isPeakDay,
  );

  // Build shot list from template
  const shotList: ShotListEntry[] = adjustedTemplate.shotDescriptions.map(s => ({
    ref: s.ref,
    count: s.count,
    durationSeconds: s.durationSeconds,
    notes: s.notes,
  }));

  // Caption from template
  const captionDraft = template.captionTemplate ?? '';

  // Determine platforms
  const primaryPlatform = template.platforms.primary;
  const secondaryPlatforms = template.platforms.secondary ?? [];

  // Auto-create denial_release poll on peak days
  let pollId: string | null = null;
  let pollCreated = false;

  if (isPeakDay && (template.pollType === 'denial_release' || denialDay >= 5)) {
    const poll = await createDenialReleasePoll(userId, denialDay);
    if (poll) {
      pollId = poll.id;
      pollCreated = true;
    }
  }

  // Insert the shoot prescription
  const { data, error } = await supabase
    .from('shoot_prescriptions')
    .insert({
      user_id: userId,
      title: template.title,
      denial_day: denialDay,
      shoot_type: template.shootType,
      outfit: template.outfit ?? 'Handler\'s choice',
      setup: template.setup,
      mood: strategy?.mood ?? template.mood,
      shot_list: shotList,
      handler_note: handlerNote,
      estimated_minutes: adjustedTemplate.durationMinutes,
      denial_badge_color: getDenialBadgeColor(denialDay),
      content_level: userContext.contentLevel,
      poll_id: pollId,
      scheduled_for: scheduledFor,
      media_paths: [],
      selected_media: [],
      primary_platform: primaryPlatform,
      secondary_platforms: secondaryPlatforms,
      caption_draft: captionDraft,
      hashtags: null,
      status: 'prescribed',
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to create shoot prescription:', error);
    return null;
  }

  // Map the returned row
  const prescription: ShootPrescription = {
    id: data.id,
    userId: data.user_id,
    title: data.title,
    denialDay: data.denial_day,
    shootType: data.shoot_type as ShootType,
    outfit: data.outfit,
    setup: data.setup,
    mood: data.mood,
    shotList: data.shot_list ?? [],
    handlerNote: data.handler_note,
    estimatedMinutes: data.estimated_minutes,
    denialBadgeColor: data.denial_badge_color,
    contentLevel: data.content_level,
    pollId: data.poll_id,
    scheduledFor: data.scheduled_for,
    mediaPaths: data.media_paths ?? [],
    selectedMedia: data.selected_media ?? [],
    primaryPlatform: data.primary_platform,
    secondaryPlatforms: data.secondary_platforms ?? [],
    captionDraft: data.caption_draft,
    hashtags: data.hashtags,
    status: data.status as ShootPrescription['status'],
    skippedAt: data.skipped_at,
    skipConsequence: data.skip_consequence,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };

  return {
    prescription,
    pollCreated,
    pollId,
    isPeakDay,
  };
}

// ============================================
// Helper: Create denial release poll
// ============================================

async function createDenialReleasePoll(
  userId: string,
  denialDay: number,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('audience_polls')
    .insert({
      user_id: userId,
      question: `Day ${denialDay} locked. Should she be released?`,
      poll_type: 'denial_release',
      options: [
        { id: crypto.randomUUID(), label: 'Keep her locked 🔒', votes: 0 },
        { id: crypto.randomUUID(), label: 'Let her out (she\'ll regret asking)', votes: 0 },
        { id: crypto.randomUUID(), label: `${denialDay + 2} more days`, votes: 0 },
      ],
      platforms_posted: [],
      platform_poll_ids: {},
      handler_intent: `Audience control poll. Day ${denialDay} desperation is authentic. They\'ll vote to keep her locked — that\'s the point.`,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Failed to create denial release poll:', error);
    return null;
  }

  return { id: data.id };
}

// ============================================
// Helper: Calculate scheduled time
// ============================================

function calculateScheduledTime(
  timeOfDay: string,
  isPeakDay: boolean,
): string {
  const now = new Date();
  const scheduled = new Date(now);

  if (isPeakDay) {
    // Peak days: schedule during peak arousal window
    const window = PEAK_WINDOWS[timeOfDay] ?? PEAK_WINDOWS.evening;
    scheduled.setHours(window.start, 0, 0, 0);

    // If we've passed the start, use next window or now
    if (now.getHours() >= window.end) {
      // Use evening window if it's still upcoming
      if (timeOfDay !== 'evening' && timeOfDay !== 'night') {
        scheduled.setHours(PEAK_WINDOWS.evening.start, 0, 0, 0);
      } else {
        // Shoot now
        return now.toISOString();
      }
    }
  } else {
    // Non-peak: schedule 30 min from now (give time to prepare)
    scheduled.setMinutes(scheduled.getMinutes() + 30);
  }

  return scheduled.toISOString();
}

// ============================================
// Context builders for Handler AI
// ============================================

/**
 * Build denial-content context string for Handler AI prompts.
 * Compact, data-dense — matches handler-systems-context.ts format.
 */
export async function buildDenialContentContext(
  userId: string,
): Promise<string> {
  try {
    const denialState = await getDenialState(userId);
    if (!denialState) return '';

    const { denialDay, isLocked } = denialState;
    if (denialDay <= 0 && !isLocked) return '';

    const strategy = await getContentStrategyForDenialDay(denialDay);

    const parts: string[] = [];
    const isPeak = denialDay >= 5;

    parts.push(
      `DENIAL-CONTENT: Day ${denialDay}${isLocked ? ' 🔒' : ''}, mood: ${strategy?.mood ?? 'unknown'}, difficulty: ${strategy?.shootDifficulty ?? 'unknown'}${isPeak ? ' — PEAK CONTENT DAY' : ''}`,
    );

    if (strategy) {
      const types = strategy.optimalShootTypes.join(', ');
      parts.push(`  shoot types: ${types} | strategy: ${strategy.engagementStrategy}`);

      if (strategy.handlerNotes) {
        parts.push(`  handler: ${strategy.handlerNotes}`);
      }
    }

    // Check for today's prescriptions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: todayShoots } = await supabase
      .from('shoot_prescriptions')
      .select('id, status, shoot_type')
      .eq('user_id', userId)
      .gte('scheduled_for', today.toISOString())
      .lt('scheduled_for', tomorrow.toISOString());

    if (todayShoots && todayShoots.length > 0) {
      const statuses = todayShoots.map(s => `${s.shoot_type}:${s.status}`).join(', ');
      parts.push(`  today: ${todayShoots.length} shoots [${statuses}]`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
