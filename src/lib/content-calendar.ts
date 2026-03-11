/**
 * Content Calendar Engine
 * Weekly content plan generator. Adapts based on strategy data, denial cycle, skip patterns.
 * The plan is Handler-internal. Maxy never sees it.
 * Pure Supabase logic. No React.
 */

import { supabase } from './supabase';
import { getContentStrategy } from './content-intelligence';
import { getActiveTarget } from './feminization-target-engine';
import { isWeekendMode } from './weekend-engine';

// ============================================
// TYPES
// ============================================

interface DayPlan {
  shoot: string | null;
  type: string;
  platform: string;
  post_time: number;
  notes: string;
  status: 'pending' | 'done' | 'skipped';
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Effort tiers (for future adaptive energy-based prescription)
// const LOW_EFFORT = ['cage_check', 'text_only'];
// const MED_EFFORT = ['quick_shoot', 'audio_clip', 'outfit_of_day'];
// const HIGH_EFFORT = ['photo_set', 'short_video', 'tease_video'];

// ============================================
// PLAN GENERATION
// ============================================

/**
 * Generate a 7-day content plan based on strategy data.
 * Conservative with insufficient data — falls back to sensible defaults.
 */
export async function generateWeeklyContentPlan(userId: string): Promise<Record<string, DayPlan>> {
  const [strategy, target, weekendActive] = await Promise.allSettled([
    getContentStrategy(userId),
    getActiveTarget(userId),
    isWeekendMode(userId),
  ]);

  const strat = strategy.status === 'fulfilled' ? strategy.value : null;
  const femTarget = target.status === 'fulfilled' ? target.value : null;
  const isWeekend = weekendActive.status === 'fulfilled' ? weekendActive.value : false;

  // Determine best platforms (from strategy or defaults)
  const platforms = strat?.recommendedPlatformMix
    ? Object.entries(strat.recommendedPlatformMix)
        .sort(([, a], [, b]) => b - a)
        .map(([p]) => p)
    : ['twitter', 'reddit', 'onlyfans'];

  const primaryPlatform = platforms[0] || 'twitter';
  const secondaryPlatform = platforms[1] || 'reddit';

  // Determine best posting time (from strategy or default 21:00)
  const defaultTime = strat?.timingPerformance?.best_hours?.[0] ?? 21;

  // Determine best shoot types (from strategy or defaults)
  const skipPatterns = strat?.skipPatterns ?? {};
  const completionFriendly = Object.entries(skipPatterns)
    .filter(([, v]) => (v as { skip_rate: number; total: number }).skip_rate < 0.3 && (v as { total: number }).total >= 3)
    .map(([type]) => type);

  const preferredShoot = completionFriendly.length > 0
    ? completionFriendly[0]
    : 'cage_check';

  const secondaryShoot = completionFriendly.length > 1
    ? completionFriendly[1]
    : 'quick_shoot';

  // Feminization domain note
  const domainNote = femTarget
    ? `Align with feminization target: ${femTarget.targetDomain}`
    : '';

  // Build plan
  const plan: Record<string, DayPlan> = {};

  // Monday: easy start
  plan['monday'] = {
    shoot: preferredShoot,
    type: 'shoot',
    platform: primaryPlatform,
    post_time: defaultTime,
    notes: `Low-barrier start. ${domainNote}`.trim(),
    status: 'pending',
  };

  // Tuesday: text-only or recycle
  plan['tuesday'] = {
    shoot: null,
    type: 'text_only',
    platform: secondaryPlatform,
    post_time: defaultTime,
    notes: 'Handler-generated journey post. No shoot needed.',
    status: 'pending',
  };

  // Wednesday: mid-week shoot
  plan['wednesday'] = {
    shoot: secondaryShoot,
    type: 'shoot',
    platform: platforms[2] || primaryPlatform,
    post_time: defaultTime,
    notes: `Mid-week content. ${domainNote}`.trim(),
    status: 'pending',
  };

  // Thursday: audio/voice if trending, otherwise light
  const voiceTrending = strat?.contentTypePerformance?.['audio_clip']?.avg_engagement
    && strat.contentTypePerformance['audio_clip'].avg_engagement > 0.05;

  plan['thursday'] = {
    shoot: voiceTrending ? 'audio_clip' : null,
    type: voiceTrending ? 'shoot' : 'recycle',
    platform: primaryPlatform,
    post_time: strat?.timingPerformance?.best_hours?.[1] ?? 10,
    notes: voiceTrending ? 'Voice content — morning engagement window.' : 'Recycle top performer from vault.',
    status: 'pending',
  };

  // Friday: pre-weekend, likely high denial day
  plan['friday'] = {
    shoot: preferredShoot,
    type: 'shoot',
    platform: secondaryPlatform,
    post_time: 22,
    notes: 'Pre-weekend. If denial day 5+, push for premium content.',
    status: 'pending',
  };

  // Saturday: light or off (Gina is home)
  plan['saturday'] = {
    shoot: null,
    type: isWeekend ? 'text_only' : 'recycle',
    platform: primaryPlatform,
    post_time: defaultTime,
    notes: isWeekend ? 'Weekend mode. Text only — Gina is home.' : 'Recycle from vault.',
    status: 'pending',
  };

  // Sunday: recovery
  plan['sunday'] = {
    shoot: null,
    type: 'text_only',
    platform: primaryPlatform,
    post_time: defaultTime,
    notes: 'Recovery day. Handler posts text. No shoot prescribed.',
    status: 'pending',
  };

  // Store plan
  await supabase
    .from('content_strategy_state')
    .upsert(
      {
        user_id: userId,
        weekly_plan: plan,
        plan_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  return plan;
}

// ============================================
// PLAN ADJUSTMENT
// ============================================

/**
 * Update a day's status in the current plan.
 * Called when a planned shoot is completed, skipped, or adjusted.
 */
export async function updatePlanDayStatus(
  userId: string,
  dayOfWeek: number,
  status: 'done' | 'skipped',
): Promise<void> {
  const { data } = await supabase
    .from('content_strategy_state')
    .select('weekly_plan')
    .eq('user_id', userId)
    .single();

  if (!data?.weekly_plan) return;

  const plan = data.weekly_plan as Record<string, DayPlan>;
  const dayName = DAY_NAMES[dayOfWeek];
  if (!plan[dayName]) return;

  plan[dayName].status = status;

  await supabase
    .from('content_strategy_state')
    .update({ weekly_plan: plan, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

/**
 * Check if the current plan needs regeneration (older than 7 days).
 */
export async function shouldRegeneratePlan(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('content_strategy_state')
    .select('plan_generated_at')
    .eq('user_id', userId)
    .single();

  if (!data?.plan_generated_at) return true;

  const daysSince = (Date.now() - new Date(data.plan_generated_at).getTime()) / 86400000;
  return daysSince >= 7;
}
