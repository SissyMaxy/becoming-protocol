/**
 * Novelty Engine
 *
 * Prevents habituation death. Breaks patterns before they become wallpaper.
 * Injects pattern interrupts, mystery tasks, tone shifts, and wildcard days.
 */

import { supabase } from '../supabase';
import { HandlerParameters } from '../handler-parameters';

export interface NoveltyDecision {
  inject: boolean;
  type: string;
  reason: string;
}

/**
 * Check if a novelty injection should fire.
 * Called during daily plan generation.
 */
export async function shouldInjectNovelty(
  userId: string,
  params: HandlerParameters,
): Promise<NoveltyDecision | null> {
  // Get last novelty event
  const { data: lastEvent } = await supabase
    .from('novelty_events')
    .select('novelty_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const daysSinceLastNovelty = lastEvent
    ? (Date.now() - new Date(lastEvent.created_at).getTime()) / (1000 * 60 * 60 * 24)
    : 999;

  const interval = await params.get<{ min: number; max: number }>(
    'novelty.pattern_interrupt_interval_days', { min: 14, max: 21 }
  );

  // Check engagement decay
  const decaying = await isEngagementDecaying(userId);

  // Inject if: enough time has passed OR engagement is decaying
  if (daysSinceLastNovelty >= interval.min || decaying) {
    const type = await selectNoveltyType(userId);
    const reason = decaying
      ? 'Engagement declining — pattern interrupt triggered'
      : `${Math.round(daysSinceLastNovelty)} days since last novelty event`;

    return { inject: true, type, reason };
  }

  return null;
}

/**
 * Select a novelty type that hasn't been used recently.
 */
async function selectNoveltyType(userId: string): Promise<string> {
  const { data: recent } = await supabase
    .from('novelty_events')
    .select('novelty_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentTypes = (recent || []).map(r => r.novelty_type);

  const allTypes = [
    'pattern_interrupt',
    'mystery_task',
    'tone_shift',
    'wildcard_day',
    'novel_task_type',
    'schedule_disruption',
    'cross_domain_surprise',
  ];

  const unused = allTypes.filter(t => !recentTypes.includes(t));
  const pool = unused.length > 0 ? unused : allTypes;

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Check if completion rates are declining (20% drop week-over-week).
 */
async function isEngagementDecaying(userId: string): Promise<boolean> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const { count: recentCount } = await supabase
    .from('task_completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', sevenDaysAgo.toISOString());

  const { count: previousCount } = await supabase
    .from('task_completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', fourteenDaysAgo.toISOString())
    .lt('created_at', sevenDaysAgo.toISOString());

  if (!previousCount || previousCount === 0) return false;
  return (recentCount || 0) < previousCount * 0.8;
}

/**
 * Log a novelty event after injection.
 */
export async function logNoveltyEvent(
  userId: string,
  type: string,
  description: string,
): Promise<void> {
  await supabase.from('novelty_events').insert({
    user_id: userId,
    novelty_type: type,
    description,
  });
}
