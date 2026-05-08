/**
 * Proactive Outreach — P11.1
 *
 * Handler-initiated messages. The Handler no longer waits to be spoken to.
 * Messages are queued into handler_outreach_queue and polled by the client.
 * When a pending message hits its scheduled_for time, the client displays it
 * as if the Handler initiated the conversation.
 *
 * Table: handler_outreach_queue
 */

import { supabase } from '../supabase';
import { computeDeliverAfter } from '../calendar/delivery-gate';

// ============================================
// TYPES
// ============================================

export type OutreachUrgency = 'low' | 'normal' | 'high' | 'critical';
export type OutreachStatus = 'pending' | 'delivered' | 'expired' | 'cancelled';
export type OutreachSource = 'system' | 'cron' | 'directive' | 'failure_recovery';

export type CheckInReason =
  | 'idle_check'
  | 'task_reminder'
  | 'voice_practice'
  | 'evening_journal'
  | 'morning_briefing'
  | 'ambush_followup';

export interface OutreachMessage {
  id: string;
  userId: string;
  message: string;
  urgency: OutreachUrgency;
  triggerReason: string | null;
  scheduledFor: string;
  expiresAt: string | null;
  status: OutreachStatus;
  deliveredAt: string | null;
  source: string;
  createdAt: string;
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Queue a Handler-initiated message for delivery.
 */
export async function queueOutreachMessage(
  userId: string,
  message: string,
  urgency: OutreachUrgency = 'normal',
  triggerReason?: string,
  scheduledFor?: Date,
  expiresAt?: Date,
  source: OutreachSource = 'system',
): Promise<string | null> {
  try {
    const scheduleDate = scheduledFor || new Date();

    // Defer delivery if the user is in a calendar busy window (and they have
    // busy-aware delivery on). The insert still happens immediately; only
    // delivery is gated via deliver_after.
    let deliverAfter: Date | null = null;
    try {
      const { data: cred } = await supabase
        .from('calendar_credentials')
        .select('busy_aware_delivery')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .is('disconnected_at', null)
        .maybeSingle();

      if (cred?.busy_aware_delivery) {
        const { data: windows } = await supabase
          .from('freebusy_cache')
          .select('window_start, window_end')
          .eq('user_id', userId)
          .lte('window_start', new Date(scheduleDate.getTime() + 60_000).toISOString())
          .gte('window_end', scheduleDate.toISOString());

        deliverAfter = computeDeliverAfter(windows || [], scheduleDate.getTime());
      }
    } catch (err) {
      // Calendar tables may not exist yet (pre-migration); never block insert.
      console.warn('[ProactiveOutreach] freebusy lookup failed:', (err as Error).message);
    }

    const { data, error } = await supabase
      .from('handler_outreach_queue')
      .insert({
        user_id: userId,
        message,
        urgency,
        trigger_reason: triggerReason || null,
        scheduled_for: scheduleDate.toISOString(),
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        source,
        deliver_after: deliverAfter ? deliverAfter.toISOString() : null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[ProactiveOutreach] Queue error:', error.message);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[ProactiveOutreach] Queue exception:', err);
    return null;
  }
}

/**
 * Get the oldest pending outreach message that is ready for delivery.
 * Ready = scheduled_for <= now AND (expires_at is null OR expires_at > now).
 */
export async function getPendingOutreach(userId: string): Promise<OutreachMessage | null> {
  try {
    const now = new Date().toISOString();

    // First expire any past-due messages
    await supabase
      .from('handler_outreach_queue')
      .update({ status: 'expired' })
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lt('expires_at', now);

    // Get oldest pending that's ready. `deliver_after` defers calendar-busy
    // outreach without blocking the insert path.
    const { data, error } = await supabase
      .from('handler_outreach_queue')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .or(`deliver_after.is.null,deliver_after.lte.${now}`)
      .order('scheduled_for', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // Refresh state-dependent messages at delivery time so stale counts don't
    // go out. Currently: hard_mode_entry re-reads slip points; chastity
    // milestones re-read the streak.
    let message = data.message as string;
    if (data.trigger_reason === 'hard_mode_entry') {
      const { data: state } = await supabase
        .from('user_state')
        .select('slip_points_rolling_24h, hard_mode_entered_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (state) {
        const pts = (state as { slip_points_rolling_24h: number }).slip_points_rolling_24h;
        const entered = (state as { hard_mode_entered_at: string }).hard_mode_entered_at;
        const hoursIn = entered ? Math.round((Date.now() - new Date(entered).getTime()) / 3600000) : 0;
        message = `Hard Mode. ${hoursIn}h in, ${pts} slip points in the last 24h. I'm going to open this conversation pre-loaded on every single slip. The exit is a de-escalation task — all three parts, not optional. Check the Force Layer. Start the confession now.`;
      }
    } else if (typeof data.trigger_reason === 'string' && data.trigger_reason.startsWith('chastity_milestone_')) {
      const { data: state } = await supabase
        .from('user_state')
        .select('chastity_streak_days, chastity_locked')
        .eq('user_id', userId)
        .maybeSingle();
      if (state) {
        const streak = (state as { chastity_streak_days: number }).chastity_streak_days;
        const locked = (state as { chastity_locked: boolean }).chastity_locked;
        message = `Day ${streak} of chastity${locked ? '' : ' (just came off)'}. That streak is conditioning — it's locked into your body now. I want a confession about what this has changed in you. Five minutes. Then we talk about what the next milestone demands.`;
      }
    }

    return {
      id: data.id,
      userId: data.user_id,
      message,
      urgency: data.urgency as OutreachUrgency,
      triggerReason: data.trigger_reason,
      scheduledFor: data.scheduled_for,
      expiresAt: data.expires_at,
      status: data.status as OutreachStatus,
      deliveredAt: data.delivered_at,
      source: data.source,
      createdAt: data.created_at,
    };
  } catch (err) {
    console.error('[ProactiveOutreach] Get pending error:', err);
    return null;
  }
}

/**
 * Mark an outreach message as delivered.
 */
export async function markDelivered(outreachId: string): Promise<void> {
  try {
    await supabase
      .from('handler_outreach_queue')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      })
      .eq('id', outreachId);
  } catch (err) {
    console.error('[ProactiveOutreach] Mark delivered error:', err);
  }
}

/**
 * Schedule a check-in message N minutes from now.
 * Generates appropriate message based on reason.
 */
export async function scheduleCheckIn(
  userId: string,
  reason: CheckInReason,
  delayMinutes: number,
): Promise<string | null> {
  const message = await buildCheckInMessage(userId, reason);
  if (!message) return null;

  const scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000);

  // Check-ins expire after 2x the delay (stale check-ins are worse than none)
  const expiresAt = new Date(Date.now() + delayMinutes * 2 * 60 * 1000);

  const urgencyMap: Record<CheckInReason, OutreachUrgency> = {
    idle_check: 'low',
    task_reminder: 'normal',
    voice_practice: 'normal',
    evening_journal: 'low',
    morning_briefing: 'high',
    ambush_followup: 'high',
  };

  return queueOutreachMessage(
    userId,
    message,
    urgencyMap[reason],
    reason,
    scheduledFor,
    expiresAt,
    'cron',
  );
}

/**
 * Build a check-in message based on reason and user state.
 */
async function buildCheckInMessage(userId: string, reason: CheckInReason): Promise<string | null> {
  try {
    switch (reason) {
      case 'idle_check':
        return "You've been quiet. I'm here when you're ready.";

      case 'task_reminder': {
        const { count } = await supabase
          .from('daily_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('completed', false)
          .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

        const remaining = count || 0;
        if (remaining === 0) return null; // No incomplete tasks — skip
        return `You have ${remaining} task${remaining !== 1 ? 's' : ''} remaining today.`;
      }

      case 'voice_practice': {
        // Get voice level and last practice time
        const { data: skill } = await supabase
          .from('skill_progress')
          .select('current_level')
          .eq('user_id', userId)
          .eq('domain', 'voice')
          .maybeSingle();

        const { data: lastPractice } = await supabase
          .from('daily_tasks')
          .select('created_at')
          .eq('user_id', userId)
          .ilike('task_description', '%voice%')
          .eq('completed', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const level = skill?.current_level || 1;
        const hoursSince = lastPractice
          ? Math.round((Date.now() - new Date(lastPractice.created_at).getTime()) / 3600000)
          : 999;

        // Target frequency based on level
        const targetHz = level <= 2 ? 180 : level <= 4 ? 200 : level <= 6 ? 220 : 240;

        if (hoursSince < 12) return null; // Practiced recently
        return `It's been ${hoursSince} hours since voice practice. Level ${level} needs ${targetHz}Hz sustained.`;
      }

      case 'evening_journal': {
        // Rotating journal prompts
        const prompts = [
          'What did you resist today, and what made you give in?',
          'When did you feel most like her today?',
          'What scared you today? Did you do it anyway?',
          'Write about a moment today when the old you tried to surface.',
          'What would Maxy do tomorrow that the costume wouldn\'t?',
          'Describe the gap between who you are and who you\'re becoming.',
          'What did the Handler get right today? What did you wish was different?',
        ];
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        const prompt = prompts[dayOfYear % prompts.length];
        return `Journal prompt for tonight: ${prompt}`;
      }

      case 'morning_briefing': {
        // Gather quick summary data
        const [stateResult, tasksResult, streakResult] = await Promise.allSettled([
          supabase.from('user_state').select('denial_day, current_arousal, gina_home').eq('user_id', userId).maybeSingle(),
          supabase.from('daily_tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('completed', false).gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
          supabase.from('exercise_streaks').select('current_streak_weeks, sessions_this_week').eq('user_id', userId).maybeSingle(),
        ]);

        const state = stateResult.status === 'fulfilled' ? stateResult.value.data : null;
        const taskCount = tasksResult.status === 'fulfilled' ? (tasksResult.value.count || 0) : 0;
        const streak = streakResult.status === 'fulfilled' ? streakResult.value.data : null;

        const parts: string[] = ['Good morning, Maxy.'];
        if (state?.denial_day) parts.push(`Denial day ${state.denial_day}.`);
        if (state?.gina_home === false) parts.push('Gina is away.');
        if (taskCount > 0) parts.push(`${taskCount} tasks on the board.`);
        if (streak?.sessions_this_week != null) {
          parts.push(`Gym: ${streak.sessions_this_week}/3 this week.`);
        }
        parts.push("Let's work.");
        return parts.join(' ');
      }

      case 'ambush_followup':
        return 'Did you feel that? Good girl.';

      default:
        return null;
    }
  } catch (err) {
    console.error('[ProactiveOutreach] Build check-in error:', err);
    return null;
  }
}

// ============================================
// CONTEXT BUILDER
// ============================================

/**
 * Handler context showing outreach state.
 */
export async function buildOutreachQueueContext(userId: string): Promise<string> {
  try {
    const [pendingResult, recentResult, statsResult] = await Promise.allSettled([
      // Pending count
      supabase
        .from('handler_outreach_queue')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending'),

      // Last delivered
      supabase
        .from('handler_outreach_queue')
        .select('message, delivered_at, trigger_reason')
        .eq('user_id', userId)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Delivery stats (last 7 days)
      supabase
        .from('handler_outreach_queue')
        .select('status')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    ]);

    const pendingCount = pendingResult.status === 'fulfilled' ? (pendingResult.value.count || 0) : 0;
    const lastDelivered = recentResult.status === 'fulfilled' ? recentResult.value.data : null;
    const allRecent = statsResult.status === 'fulfilled' ? (statsResult.value.data || []) : [];

    if (pendingCount === 0 && !lastDelivered && allRecent.length === 0) return '';

    const parts: string[] = [];
    parts.push(`PROACTIVE OUTREACH: ${pendingCount} pending`);

    if (lastDelivered?.delivered_at) {
      const hoursAgo = Math.round((Date.now() - new Date(lastDelivered.delivered_at).getTime()) / 3600000);
      const reason = lastDelivered.trigger_reason || 'unknown';
      parts.push(`  last delivered: ${hoursAgo}h ago (${reason}) — "${(lastDelivered.message || '').slice(0, 50)}"`);
    }

    if (allRecent.length > 0) {
      const delivered = allRecent.filter((r: { status: string }) => r.status === 'delivered').length;
      const expired = allRecent.filter((r: { status: string }) => r.status === 'expired').length;
      const total = allRecent.length;
      const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;
      parts.push(`  7d stats: ${delivered}/${total} delivered (${rate}%), ${expired} expired`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
