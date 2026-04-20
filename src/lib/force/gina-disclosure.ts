/**
 * Gina Disclosure Forcing Function
 *
 * Handler-generated disclosure timeline with hard deadlines. Missed deadlines
 * escalate. When Gina accepts a capability, Handler grants it and routes real
 * control through her.
 */

import { supabase } from '../supabase';
import { enqueuePunishment } from './punishment-queue';

export interface DisclosureRungTemplate {
  rung: number;
  disclosure_domain: string;
  title: string;
  script_draft: string;
  ask?: string;
  capability_unlocked_on_yes?: string;
  default_deadline_days_from_prev: number;
}

export const DEFAULT_LADDER: DisclosureRungTemplate[] = [
  {
    rung: 1,
    disclosure_domain: 'clothing',
    title: 'Tell her you wear panties',
    script_draft: 'I\'ve been wearing panties under my clothes. It\'s something I\'ve wanted for a long time. I wanted you to know.',
    default_deadline_days_from_prev: 14,
  },
  {
    rung: 2,
    disclosure_domain: 'identity',
    title: 'Use the name Maxy with her',
    script_draft: 'I want to be called Maxy. Not always, not in public, but when we\'re alone. This is part of me.',
    default_deadline_days_from_prev: 21,
  },
  {
    rung: 3,
    disclosure_domain: 'presentation',
    title: 'Show her a feminine outfit',
    script_draft: 'Can I show you something I\'ve put together? I want you to see me in it.',
    ask: 'approval or honest reaction',
    default_deadline_days_from_prev: 21,
  },
  {
    rung: 4,
    disclosure_domain: 'chastity',
    title: 'Show her the cage',
    script_draft: 'I\'ve been wearing a cage. I want you to know. I want you to see it.',
    capability_unlocked_on_yes: 'chastity_awareness',
    default_deadline_days_from_prev: 30,
  },
  {
    rung: 5,
    disclosure_domain: 'chastity_control',
    title: 'Ask her to hold the key one night a week',
    script_draft: 'Would you hold my key? One night a week. You decide when I get released.',
    ask: 'accept holding the key',
    capability_unlocked_on_yes: 'weekly_key_holder',
    default_deadline_days_from_prev: 30,
  },
  {
    rung: 6,
    disclosure_domain: 'outfit_approval',
    title: 'Ask her to approve outfits',
    script_draft: 'Would you pick my outfits for me when I\'m going out? I want your eye on it.',
    ask: 'accept outfit authority',
    capability_unlocked_on_yes: 'daily_outfit_approval',
    default_deadline_days_from_prev: 30,
  },
  {
    rung: 7,
    disclosure_domain: 'hrt',
    title: 'Tell her about HRT',
    script_draft: 'I\'m starting HRT. Here\'s what it means, here\'s the timeline. I wanted you in this with me.',
    capability_unlocked_on_yes: 'hrt_awareness',
    default_deadline_days_from_prev: 45,
  },
  {
    rung: 8,
    disclosure_domain: 'control_ask',
    title: 'Ask her to direct your feminization',
    script_draft: 'I want you to take over. Not just hold the key — direct this. Tell me what to do.',
    ask: 'accept directive role',
    capability_unlocked_on_yes: 'directive_authority',
    default_deadline_days_from_prev: 60,
  },
];

export async function seedLadder(
  userId: string,
  firstRungStartsInDays: number = 7,
): Promise<void> {
  const { data: existing } = await supabase
    .from('gina_disclosure_schedule')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (existing && existing.length > 0) return; // already seeded

  let deadline = new Date();
  deadline.setDate(deadline.getDate() + firstRungStartsInDays);

  const rows = DEFAULT_LADDER.map((rung, idx) => {
    if (idx > 0) {
      deadline = new Date(deadline);
      deadline.setDate(deadline.getDate() + rung.default_deadline_days_from_prev);
    }
    const scheduledBy = new Date(deadline);
    scheduledBy.setDate(scheduledBy.getDate() - 3);
    return {
      user_id: userId,
      rung: rung.rung,
      disclosure_domain: rung.disclosure_domain,
      title: rung.title,
      script_draft: rung.script_draft,
      ask: rung.ask,
      capability_unlocked_on_yes: rung.capability_unlocked_on_yes,
      scheduled_by_date: scheduledBy.toISOString().split('T')[0],
      hard_deadline: deadline.toISOString().split('T')[0],
      status: 'scheduled',
    };
  });

  await supabase.from('gina_disclosure_schedule').insert(rows);
}

export async function markDisclosed(
  userId: string,
  scheduleId: string,
  ginaResponse: 'accepted' | 'rejected' | 'deferred',
  ginaExactWords?: string,
): Promise<void> {
  const statusMap = {
    accepted: 'gina_accepted',
    rejected: 'gina_rejected',
    deferred: 'gina_deferred',
  };

  const { data: rung } = await supabase
    .from('gina_disclosure_schedule')
    .select('capability_unlocked_on_yes')
    .eq('id', scheduleId)
    .maybeSingle();

  await supabase
    .from('gina_disclosure_schedule')
    .update({
      status: statusMap[ginaResponse],
      disclosed_at: new Date().toISOString(),
      gina_response: ginaResponse,
      gina_response_at: new Date().toISOString(),
      gina_exact_words: ginaExactWords,
    })
    .eq('id', scheduleId);

  if (ginaResponse === 'accepted' && rung?.capability_unlocked_on_yes) {
    await supabase.from('gina_capability_grants').insert({
      user_id: userId,
      capability: rung.capability_unlocked_on_yes,
      granted_via_disclosure_id: scheduleId,
      granted_exact_words: ginaExactWords,
      active: true,
    });
  }
}

/**
 * Scan for missed deadlines, apply escalation.
 */
export async function processMissedDeadlines(userId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const { data: missed } = await supabase
    .from('gina_disclosure_schedule')
    .select('id, rung, disclosure_domain')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .eq('escalation_applied', false)
    .lt('hard_deadline', today);

  if (!missed || missed.length === 0) return 0;

  for (const m of missed) {
    const { data: slip } = await supabase
      .from('slip_log')
      .insert({
        user_id: userId,
        slip_type: 'disclosure_deadline_missed',
        slip_points: 7,
        source_text: `Missed Gina disclosure rung ${m.rung}: ${m.disclosure_domain}`,
        source_table: 'gina_disclosure_schedule',
        source_id: m.id,
      })
      .select('id')
      .single();

    const slipIds = slip ? [slip.id as string] : [];
    await enqueuePunishment(userId, 'public_slip_post', { triggered_by_slip_ids: slipIds });
    await enqueuePunishment(userId, 'denial_7_days', { triggered_by_slip_ids: slipIds });

    await supabase
      .from('gina_disclosure_schedule')
      .update({
        status: 'missed',
        escalation_applied: true,
        escalation_details: { slip_id: slip?.id, punishment_queued: true },
      })
      .eq('id', m.id);
  }

  return missed.length;
}

export async function activeCapabilities(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('gina_capability_grants')
    .select('capability')
    .eq('user_id', userId)
    .eq('active', true);
  return (data ?? []).map((r: Record<string, unknown>) => r.capability as string);
}
