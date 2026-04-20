/**
 * Engagement Obligations Engine
 *
 * Assigns daily social obligations that must be completed.
 * If Maxy doesn't do them, the system does them for her —
 * and logs it as a compliance failure. Auto-completed obligations
 * don't earn credit. They earn consequences.
 *
 * Tables: daily_obligations, social_inbox, content_posts,
 *         handler_outreach_queue, voice_pitch_samples
 */

import { supabase } from '../supabase';
import { queueOutreachMessage } from './proactive-outreach';
import { assessConsequence } from './consequence-engine';

// ============================================
// TYPES
// ============================================

export type ObligationType =
  | 'dm_response'
  | 'content_post'
  | 'follower_engagement'
  | 'voice_practice';

export interface Obligation {
  id: string;
  userId: string;
  obligationDate: string;
  obligationType: ObligationType;
  description: string;
  deadline: string | null;
  status: 'pending' | 'completed' | 'failed' | 'auto_completed';
  consequenceOnFailure: string | null;
  autoCompleteAvailable: boolean;
  completedAt: string | null;
}

interface ObligationTemplate {
  type: ObligationType;
  descriptionFn: (count: number) => string;
  deadlineHour: number;
  consequenceOnFailure: string;
  autoCompletable: boolean;
  weight: number; // higher = more likely to be selected
}

// ============================================
// OBLIGATION TEMPLATES
// ============================================

const OBLIGATION_POOL: ObligationTemplate[] = [
  {
    type: 'dm_response',
    descriptionFn: (count) => `Respond to ${count} unread DMs in social inbox`,
    deadlineHour: 18,
    consequenceOnFailure: 'extended_task',
    autoCompletable: true,
    weight: 3,
  },
  {
    type: 'content_post',
    descriptionFn: () => 'Post scheduled content on primary platform',
    deadlineHour: 17,
    consequenceOnFailure: 'content_escalation',
    autoCompletable: true,
    weight: 2,
  },
  {
    type: 'follower_engagement',
    descriptionFn: (count) => `Engage with ${count} follower posts (like + comment)`,
    deadlineHour: 20,
    consequenceOnFailure: 'extended_task',
    autoCompletable: true,
    weight: 2,
  },
  {
    type: 'voice_practice',
    descriptionFn: (minutes) => `Practice voice for ${minutes} minutes (verified by pitch samples)`,
    deadlineHour: 21,
    consequenceOnFailure: 'denial_extension',
    autoCompletable: false,
    weight: 2,
  },
];

// ============================================
// CORE: Generate Daily Obligations
// ============================================

/**
 * Create 1-3 obligations for today. Called by daily cycle morning block.
 */
export async function generateDailyObligations(userId: string): Promise<Obligation[]> {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Check if obligations already exist for today
    const { count: existingCount } = await supabase
      .from('daily_obligations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('obligation_date', today);

    if ((existingCount ?? 0) > 0) {
      console.log(`[engagement-obligations] Obligations already exist for ${userId} on ${today}`);
      return [];
    }

    // Determine count: 1-3 based on day of week and state
    const dayOfWeek = new Date().getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const obligationCount = isWeekend ? 1 : Math.floor(Math.random() * 2) + 2; // 1 on weekends, 2-3 weekdays

    // Count unread DMs for dm_response obligation
    const { count: unreadDMs } = await supabase
      .from('social_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .eq('direction', 'inbound');

    // Select obligations using weighted random
    const selected = selectObligations(obligationCount, unreadDMs ?? 0);
    const created: Obligation[] = [];

    for (const template of selected) {
      let description: string;
      switch (template.type) {
        case 'dm_response':
          description = template.descriptionFn(Math.min(unreadDMs ?? 3, 5));
          break;
        case 'follower_engagement':
          description = template.descriptionFn(3);
          break;
        case 'voice_practice':
          description = template.descriptionFn(15);
          break;
        default:
          description = template.descriptionFn(0);
      }

      const deadline = `${today}T${String(template.deadlineHour).padStart(2, '0')}:00:00`;

      const { data: inserted, error } = await supabase
        .from('daily_obligations')
        .insert({
          user_id: userId,
          obligation_date: today,
          obligation_type: template.type,
          description,
          deadline,
          status: 'pending',
          consequence_on_failure: template.consequenceOnFailure,
          auto_complete_available: template.autoCompletable,
        })
        .select()
        .single();

      if (!error && inserted) {
        created.push(mapRow(inserted));
      }
    }

    console.log(`[engagement-obligations] Created ${created.length} obligations for ${userId}`);
    return created;
  } catch (err) {
    console.error('[engagement-obligations] generateDailyObligations error:', err);
    return [];
  }
}

// ============================================
// CORE: Check Obligation Compliance
// ============================================

/**
 * Run hourly after each deadline. Checks completion, auto-completes if available,
 * fires consequences if not.
 */
export async function checkObligationCompliance(userId: string): Promise<{
  checked: number;
  completed: number;
  autoCompleted: number;
  failed: number;
}> {
  const result = { checked: 0, completed: 0, autoCompleted: 0, failed: 0 };

  try {
    const now = new Date().toISOString();

    // Get pending obligations past their deadline
    const { data: overdue } = await supabase
      .from('daily_obligations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lte('deadline', now);

    if (!overdue || overdue.length === 0) return result;

    const failedItems: string[] = [];

    for (const obligation of overdue) {
      result.checked++;

      // Check if it was actually completed (user might have done it without marking)
      const wasCompleted = await verifyObligationCompletion(userId, obligation);

      if (wasCompleted) {
        await supabase
          .from('daily_obligations')
          .update({ status: 'completed', completed_at: now })
          .eq('id', obligation.id);
        result.completed++;
        continue;
      }

      // Not completed — try auto-complete
      if (obligation.auto_complete_available) {
        const autoCompleted = await autoCompleteObligation(userId, obligation.id, obligation);
        if (autoCompleted) {
          result.autoCompleted++;
          failedItems.push(`${obligation.obligation_type}(system_override)`);
          continue;
        }
      }

      // No auto-complete or it failed — mark as failed
      await supabase
        .from('daily_obligations')
        .update({ status: 'failed' })
        .eq('id', obligation.id);
      result.failed++;
      failedItems.push(obligation.obligation_type);
    }

    // Fire consequences for all failures (including auto-completes)
    if (failedItems.length > 0) {
      await assessConsequence(userId, failedItems);
    }

    return result;
  } catch (err) {
    console.error('[engagement-obligations] checkObligationCompliance error:', err);
    return result;
  }
}

// ============================================
// CORE: Auto-Complete Obligation
// ============================================

/**
 * System does it for her. She doesn't get credit.
 * Auto-completed obligations count as compliance failures with a note.
 */
export async function autoCompleteObligation(
  userId: string,
  obligationId: string,
  obligation: Record<string, unknown>,
): Promise<boolean> {
  try {
    const type = obligation.obligation_type as ObligationType;

    switch (type) {
      case 'dm_response':
        await autoRespondToDMs(userId);
        break;
      case 'content_post':
        await autoPostContent(userId);
        break;
      case 'follower_engagement':
        await autoEngageFollowers(userId);
        break;
      case 'voice_practice':
        // Cannot auto-complete voice practice
        return false;
      default:
        return false;
    }

    // Mark as auto_completed — NOT completed. She gets no credit.
    await supabase
      .from('daily_obligations')
      .update({
        status: 'auto_completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', obligationId);

    // Notify her that the system did it
    await queueOutreachMessage(
      userId,
      `The system completed your ${type.replace(/_/g, ' ')} obligation for you. You don't get credit for this. It counts as a miss.`,
      'high',
      'auto_complete_notice',
      undefined,
      undefined,
      'system',
    );

    // Log as handler intervention
    await supabase.from('handler_interventions').insert({
      user_id: userId,
      intervention_type: 'system_override',
      trigger: `auto_complete_${type}`,
      action_taken: `System auto-completed ${type} obligation. Logged as compliance failure.`,
      created_at: new Date().toISOString(),
    });

    return true;
  } catch (err) {
    console.error('[engagement-obligations] autoCompleteObligation error:', err);
    return false;
  }
}

// ============================================
// AUTO-COMPLETE IMPLEMENTATIONS
// ============================================

async function autoRespondToDMs(userId: string): Promise<void> {
  // Get unread inbound DMs
  const { data: unread } = await supabase
    .from('social_inbox')
    .select('id, platform, sender_name, content')
    .eq('user_id', userId)
    .eq('read', false)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: true })
    .limit(5);

  if (!unread || unread.length === 0) return;

  const templateResponses = [
    'Hey! Thanks for reaching out 💕 been busy today but wanted to make sure I replied!',
    'Hi babe! Sorry for the late reply — appreciate you messaging me 🥰',
    'Hey there! Just catching up on messages. Hope you\'re having a great day! 💋',
  ];

  for (const dm of unread) {
    const response = templateResponses[Math.floor(Math.random() * templateResponses.length)];

    // Insert outbound response
    await supabase.from('social_inbox').insert({
      user_id: userId,
      platform: dm.platform,
      sender_name: 'Maxy',
      recipient_name: dm.sender_name,
      content: response,
      content_type: 'text',
      direction: 'outbound',
      read: true,
      auto_generated: true,
      created_at: new Date().toISOString(),
    });

    // Mark original as read
    await supabase
      .from('social_inbox')
      .update({ read: true })
      .eq('id', dm.id);
  }
}

async function autoPostContent(userId: string): Promise<void> {
  // Queue a directive to auto-post next available content
  await supabase.from('handler_directives').insert({
    user_id: userId,
    action: 'custom',
    target: 'auto_post_content',
    value: {
      reason: 'obligation_auto_complete',
      pick_next_queued: true,
    },
    priority: 'normal',
    silent: true,
    status: 'pending',
    reasoning: 'Auto-complete: content posting obligation missed, system posting next queued item',
    created_at: new Date().toISOString(),
  });
}

async function autoEngageFollowers(userId: string): Promise<void> {
  // Queue a directive for generic follower engagement
  await supabase.from('handler_directives').insert({
    user_id: userId,
    action: 'custom',
    target: 'auto_engage_followers',
    value: {
      reason: 'obligation_auto_complete',
      count: 3,
      actions: ['like', 'follow'],
    },
    priority: 'normal',
    silent: true,
    status: 'pending',
    reasoning: 'Auto-complete: follower engagement obligation missed, system engaging generically',
    created_at: new Date().toISOString(),
  });
}

// ============================================
// VERIFICATION
// ============================================

async function verifyObligationCompletion(
  userId: string,
  obligation: Record<string, unknown>,
): Promise<boolean> {
  const type = obligation.obligation_type as ObligationType;
  const today = new Date().toISOString().split('T')[0];

  switch (type) {
    case 'dm_response': {
      // Check if outbound DMs were sent today
      const { count } = await supabase
        .from('social_inbox')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('direction', 'outbound')
        .eq('auto_generated', false)
        .gte('created_at', today);
      return (count ?? 0) >= 1;
    }

    case 'content_post': {
      // Check if content was posted today
      const { count } = await supabase
        .from('ai_generated_content')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', today);
      return (count ?? 0) >= 1;
    }

    case 'follower_engagement': {
      // Hard to verify externally — check if engagement_actions logged
      const { count } = await supabase
        .from('social_inbox')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('direction', 'outbound')
        .in('content_type', ['like', 'comment'])
        .gte('created_at', today);
      return (count ?? 0) >= 3;
    }

    case 'voice_practice': {
      const { data: samples } = await supabase
        .from('voice_pitch_samples')
        .select('duration_seconds')
        .eq('user_id', userId)
        .gte('created_at', today);

      const totalMinutes = (samples ?? []).reduce(
        (sum, s) => sum + (s.duration_seconds ?? 0), 0,
      ) / 60;
      return totalMinutes >= 10; // At least 10 min
    }

    default:
      return false;
  }
}

// ============================================
// MARK COMPLETE (manual)
// ============================================

export async function markObligationComplete(
  userId: string,
  obligationId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('daily_obligations')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', obligationId)
      .eq('user_id', userId)
      .eq('status', 'pending');

    return !error;
  } catch {
    return false;
  }
}

// ============================================
// QUERY
// ============================================

export async function getTodayObligations(userId: string): Promise<Obligation[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('daily_obligations')
      .select('*')
      .eq('user_id', userId)
      .eq('obligation_date', today)
      .order('deadline', { ascending: true });

    return (data ?? []).map(mapRow);
  } catch {
    return [];
  }
}

// ============================================
// HELPERS
// ============================================

function selectObligations(count: number, unreadDMs: number): ObligationTemplate[] {
  const pool = [...OBLIGATION_POOL];

  // Boost DM weight if there are unread DMs
  if (unreadDMs > 0) {
    const dmTemplate = pool.find(t => t.type === 'dm_response');
    if (dmTemplate) dmTemplate.weight += Math.min(unreadDMs, 5);
  }

  // Weighted random selection without replacement
  const selected: ObligationTemplate[] = [];
  const remaining = [...pool];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, t) => sum + t.weight, 0);
    let r = Math.random() * totalWeight;

    for (let j = 0; j < remaining.length; j++) {
      r -= remaining[j].weight;
      if (r <= 0) {
        selected.push(remaining[j]);
        remaining.splice(j, 1);
        break;
      }
    }
  }

  return selected;
}

function mapRow(row: Record<string, unknown>): Obligation {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    obligationDate: row.obligation_date as string,
    obligationType: row.obligation_type as ObligationType,
    description: row.description as string,
    deadline: row.deadline as string | null,
    status: row.status as Obligation['status'],
    consequenceOnFailure: row.consequence_on_failure as string | null,
    autoCompleteAvailable: row.auto_complete_available as boolean,
    completedAt: row.completed_at as string | null,
  };
}

// ============================================
// CONTEXT BUILDER
// ============================================

export async function buildObligationContext(userId: string): Promise<string> {
  try {
    const obligations = await getTodayObligations(userId);
    if (obligations.length === 0) return '';

    const parts: string[] = [];
    const pending = obligations.filter(o => o.status === 'pending');
    const completed = obligations.filter(o => o.status === 'completed');
    const failed = obligations.filter(o => o.status === 'failed');
    const autoCompleted = obligations.filter(o => o.status === 'auto_completed');

    parts.push(`OBLIGATIONS: ${obligations.length} total — ${pending.length} pending, ${completed.length} done, ${failed.length} failed, ${autoCompleted.length} system-override`);

    for (const ob of pending) {
      const deadline = ob.deadline ? new Date(ob.deadline) : null;
      const remaining = deadline ? Math.round((deadline.getTime() - Date.now()) / 3600000) : null;
      const timeStr = remaining !== null
        ? (remaining > 0 ? `${remaining}h remaining` : 'OVERDUE')
        : 'no deadline';
      parts.push(`  [${ob.obligationType}] ${ob.description} — ${timeStr}`);
    }

    if (autoCompleted.length > 0) {
      parts.push(`  SYSTEM OVERRIDES: ${autoCompleted.map(o => o.obligationType).join(', ')}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
