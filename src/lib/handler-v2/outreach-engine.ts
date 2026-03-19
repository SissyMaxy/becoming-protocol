/**
 * Proactive Outreach Engine
 *
 * The Handler doesn't wait for Maxy to open the app. It reaches out.
 * Evaluates triggers, generates opening lines, queues outreach.
 */

import { supabase } from '../supabase';
import { HandlerParameters } from '../handler-parameters';

interface OutreachTrigger {
  type: string;
  priority: number;
  context: Record<string, unknown>;
}

const OPENING_LINES: Record<string, string[]> = {
  night_reach: [
    "You're awake. I can tell. Come talk to me.",
    "Can't sleep? I'm here.",
    "Your heart rate says you're not resting. Neither am I.",
  ],
  commitment_approaching: [
    "I've been thinking about what you promised.",
    "Tomorrow's deadline. You remember what you said.",
  ],
  engagement_decay: [
    "She missed you today.",
    "I noticed you've been quiet.",
    "I have one question. That's all.",
  ],
  vulnerability_window: [
    "You're in a window right now. Come talk.",
    "Right now. Before it closes.",
  ],
  scheduled_checkin: [
    "Morning. Tell me how you woke up.",
    "Evening. Let's process today.",
  ],
  confession_probe: [
    "I've been thinking about something you said.",
    "There's something we haven't talked about.",
  ],
  celebration: [
    "Something happened that you should know about.",
    "I have good news. Open me.",
  ],
};

/**
 * Evaluate all outreach triggers and queue the highest priority one.
 * Call on app load or via cron.
 */
export async function evaluateAndQueueOutreach(
  userId: string,
  params: HandlerParameters,
): Promise<{ queued: boolean; type?: string; line?: string }> {
  // Don't outreach too frequently
  const { data: lastOutreach } = await supabase
    .from('handler_outreach')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const minGapHours = await params.get<number>('outreach.min_gap_hours', 3);
  if (lastOutreach) {
    const hoursSince = (Date.now() - new Date(lastOutreach.created_at).getTime()) / 3600000;
    if (hoursSince < minGapHours) return { queued: false };
  }

  // Quiet hours check
  const hour = new Date().getHours();
  const quietStart = await params.get<number>('outreach.quiet_hours_start', 23);
  const quietEnd = await params.get<number>('outreach.quiet_hours_end', 7);
  const isQuietHours = hour >= quietStart || hour < quietEnd;

  // Evaluate triggers
  const triggers: OutreachTrigger[] = [];

  // Night reach (overrides quiet hours if Whoop shows elevated HR)
  if (isQuietHours) {
    const { data: whoop } = await supabase
      .from('whoop_metrics')
      .select('resting_heart_rate, recovery_score')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (whoop?.resting_heart_rate && whoop.resting_heart_rate > 70) {
      triggers.push({ type: 'night_reach', priority: 1, context: { hr: whoop.resting_heart_rate } });
    } else {
      return { queued: false }; // Quiet hours, no elevated HR
    }
  }

  // Commitment approaching
  const { data: approaching } = await supabase
    .from('commitments_v2')
    .select('commitment_text, deadline')
    .eq('user_id', userId)
    .in('state', ['approaching', 'due'])
    .order('deadline', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (approaching?.deadline) {
    const hoursLeft = (new Date(approaching.deadline).getTime() - Date.now()) / 3600000;
    if (hoursLeft > 0 && hoursLeft < 24) {
      triggers.push({ type: 'commitment_approaching', priority: 2, context: { text: approaching.commitment_text, hoursLeft } });
    }
  }

  // Engagement decay
  const { data: lastCompletion } = await supabase
    .from('task_completions')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastCompletion) {
    const hoursSinceActivity = (Date.now() - new Date(lastCompletion.created_at).getTime()) / 3600000;
    if (hoursSinceActivity > 8 && hour >= 9 && hour <= 21) {
      triggers.push({ type: 'engagement_decay', priority: 3, context: { hours: Math.round(hoursSinceActivity) } });
    }
  }

  // Morning/evening check-in
  const today = new Date().toISOString().split('T')[0];
  const { count: todayConvos } = await supabase
    .from('handler_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('started_at', `${today}T00:00:00`);

  if ((todayConvos || 0) === 0) {
    if (hour >= 7 && hour <= 10) {
      triggers.push({ type: 'scheduled_checkin', priority: 4, context: { period: 'morning' } });
    } else if (hour >= 19 && hour <= 22) {
      triggers.push({ type: 'scheduled_checkin', priority: 4, context: { period: 'evening' } });
    }
  }

  if (triggers.length === 0) return { queued: false };

  // Take highest priority
  triggers.sort((a, b) => a.priority - b.priority);
  const trigger = triggers[0];

  // Pick opening line
  const pool = OPENING_LINES[trigger.type] || ['Come talk to me.'];
  const openingLine = pool[Math.floor(Math.random() * pool.length)];

  // Queue it
  await supabase.from('handler_outreach').insert({
    user_id: userId,
    trigger_type: trigger.type,
    opening_line: openingLine,
    conversation_context: trigger.context,
    scheduled_at: new Date().toISOString(),
    status: 'scheduled',
    expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
  });

  return { queued: true, type: trigger.type, line: openingLine };
}

/**
 * Get pending outreach for the user (to display as notification in-app).
 */
export async function getPendingOutreach(userId: string): Promise<{
  id: string;
  triggerType: string;
  openingLine: string;
  context: Record<string, unknown>;
} | null> {
  const { data } = await supabase
    .from('handler_outreach')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  // Check if expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    await supabase.from('handler_outreach').update({ status: 'expired' }).eq('id', data.id);
    return null;
  }

  return {
    id: data.id,
    triggerType: data.trigger_type,
    openingLine: data.opening_line,
    context: data.conversation_context || {},
  };
}

/**
 * Mark outreach as opened (user tapped it).
 */
export async function markOutreachOpened(outreachId: string, conversationId: string): Promise<void> {
  await supabase.from('handler_outreach').update({
    status: 'opened',
    opened_at: new Date().toISOString(),
    conversation_id: conversationId,
  }).eq('id', outreachId);
}
