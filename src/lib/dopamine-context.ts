/**
 * Dopamine System — Handler AI Context Builder
 * Surfaces dopamine state, suppressed signals, notification effectiveness,
 * and SEND_NOTIFICATION directive for Handler AI prompts.
 * Pure Supabase logic. No React.
 */

import { getDopamineState } from './dopamine-engine';
import { supabase } from './supabase';

// ============================================
// HANDLER AI CONTEXT
// ============================================

/**
 * Build dopamine system context for Handler AI prompts.
 * Shows: daily budget, reward distribution, suppressed signals, pending rewards,
 * engagement learning, and SEND_NOTIFICATION directive.
 */
export async function buildDopamineContext(userId: string): Promise<string> {
  try {
    const state = await getDopamineState(userId);
    if (!state) return '';

    const parts: string[] = [];

    // Daily budget status
    const budgetPct = state.notificationsTarget > 0
      ? Math.round((state.notificationsToday / state.notificationsTarget) * 100)
      : 0;
    const lastAt = state.lastNotificationAt
      ? `${Math.round((Date.now() - new Date(state.lastNotificationAt).getTime()) / 60000)}min ago`
      : 'never';

    parts.push(`DOPAMINE ENGINE: ${state.notificationsToday}/${state.notificationsTarget} notifications today (${budgetPct}%), last: ${lastAt}`);

    // Reward distribution today
    const tierCounts = Object.entries(state.rewardsToday)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    if (tierCounts) {
      parts.push(`  rewards today: ${tierCounts}`);
    }

    // Engagement learning
    if (state.avgOpenRate > 0) {
      const openPct = Math.round(state.avgOpenRate * 100);
      const taskPct = Math.round(state.avgTaskAfterRate * 100);
      parts.push(`  engagement: ${openPct}% open rate, ${taskPct}% task-after rate`);

      if (state.bestResponseHours.length > 0) {
        parts.push(`  best hours: ${state.bestResponseHours.join(', ')} | worst: ${state.worstResponseHours.join(', ')}`);
      }
    }

    // Pending rewards
    if (state.pendingRewards.length > 0) {
      const soonest = state.pendingRewards
        .map(r => new Date(r.deliverAfter).getTime())
        .sort((a, b) => a - b)[0];
      const minsUntil = Math.max(0, Math.round((soonest - Date.now()) / 60000));
      parts.push(`  pending rewards: ${state.pendingRewards.length} queued, next in ~${minsUntil}min`);
    }

    // Suppressed signals — Handler sees what Maxy doesn't
    if (state.suppressedSignals.length > 0) {
      const unseen = state.suppressedSignals.filter(s => !s.handlerSeen);
      if (unseen.length > 0) {
        parts.push(`  SUPPRESSED SIGNALS (${unseen.length} unseen by Handler):`);
        for (const s of unseen.slice(0, 5)) {
          parts.push(`    [${s.type}] ${s.detail} (${s.suppressedAt})`);
        }

        // Mark as Handler-seen
        const updated = state.suppressedSignals.map(s => ({ ...s, handlerSeen: true }));
        await supabase.from('dopamine_state').upsert({
          user_id: userId,
          suppressed_signals: updated,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }
    }

    // Surprise reward probability
    if (state.surpriseRewardProbability > 0.2) {
      parts.push(`  surprise probability: ${Math.round(state.surpriseRewardProbability * 100)}% — consider triggering a jackpot`);
    }

    // Recent notification effectiveness (last 24h)
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
    const { data: recentEvents } = await supabase
      .from('notification_events')
      .select('notification_type, opened_at, task_completed_after')
      .eq('user_id', userId)
      .gte('delivered_at', oneDayAgo);

    if (recentEvents && recentEvents.length > 0) {
      const opened = recentEvents.filter((e: { opened_at: string | null }) => e.opened_at).length;
      const taskAfter = recentEvents.filter((e: { task_completed_after: boolean | null }) => e.task_completed_after).length;
      parts.push(`  last 24h: ${recentEvents.length} sent, ${opened} opened, ${taskAfter} led to task completion`);
    }

    // Directive
    parts.push(`\nDOPAMINE DIRECTIVES: Maxy does NOT know about the dopamine system. She experiences it as organic encouragement. Never reference notification timing, reward tiers, or engagement rates to her. If budget allows and she's in a responsive hour, you may request a notification via SEND_NOTIFICATION.`);

    return parts.join('\n');
  } catch {
    return '';
  }
}
