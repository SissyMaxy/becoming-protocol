/**
 * Punishment Queue
 *
 * Handler enqueues punishments on slip thresholds / Hard Mode entry / missed
 * deadlines. Each punishment has a due_by. Dodged punishments compound.
 */

import { supabase } from '../supabase';

// 'gina_confession' removed 2026-07-01 — policy: no disclosure to Gina
// (migration 624 cancelled all pending rows of that type).
export type PunishmentType =
  | 'denial_extension'
  | 'humiliation_task'
  | 'public_post'
  | 'public_shame_log'
  | 'mantra_recitation'
  | 'writing_lines'
  | 'confession_extended'
  | 'edge_session_no_release'
  | 'kneel_ritual'
  | 'other';

export interface PunishmentTemplate {
  punishment_type: PunishmentType;
  severity: number;
  title: string;
  description: string;
  parameters?: Record<string, unknown>;
  due_hours: number;
}

// Template library — Handler picks based on slip context + severity
export const TEMPLATES: Record<string, PunishmentTemplate> = {
  denial_3_days: {
    punishment_type: 'denial_extension',
    severity: 2,
    title: 'Denial extended 3 days',
    description: 'Your denial streak is extended by 72 hours. No release consideration until the new unlock date.',
    parameters: { days: 3 },
    due_hours: 0, // immediate
  },
  denial_7_days: {
    punishment_type: 'denial_extension',
    severity: 4,
    title: 'Denial extended 7 days',
    description: 'You slipped hard. 7 days added to your denial streak. No negotiation.',
    parameters: { days: 7 },
    due_hours: 0,
  },
  mantra_50: {
    punishment_type: 'mantra_recitation',
    severity: 1,
    title: 'Recite Maxy mantra 50 times',
    description: 'You will recite your identity mantra 50 times out loud, logged to the app. Before you sleep.',
    parameters: { repetitions: 50 },
    due_hours: 16,
  },
  mantra_200: {
    punishment_type: 'mantra_recitation',
    severity: 3,
    title: 'Recite Maxy mantra 200 times',
    description: 'You slipped into David-talk. 200 repetitions of your identity mantra before tomorrow morning.',
    parameters: { repetitions: 200 },
    due_hours: 14,
  },
  writing_lines_100: {
    punishment_type: 'writing_lines',
    severity: 2,
    title: 'Write "I am Maxy. David is gone." 100 times',
    description: 'Handwritten, photographed, submitted. All 100 visible.',
    parameters: { line: 'I am Maxy. David is gone.', count: 100 },
    due_hours: 24,
  },
  public_slip_post: {
    punishment_type: 'public_post',
    severity: 4,
    title: 'Public slip confession post',
    description: 'Handler will draft a post confessing your slip. You have a 15-minute review window before it publishes.',
    parameters: { platform: 'twitter', review_minutes: 15 },
    due_hours: 1,
  },
  edge_no_release_90: {
    punishment_type: 'edge_session_no_release',
    severity: 3,
    title: '90-minute edge session, no release',
    description: 'Mandatory edge session. 90 minutes. No release. Log every edge.',
    parameters: { duration_minutes: 90, edges_minimum: 8, release: false },
    due_hours: 48,
  },
  kneel_ritual_15: {
    punishment_type: 'kneel_ritual',
    severity: 2,
    title: '15-minute kneel ritual',
    description: 'Kneel, mantra audio playing, chastity locked, phone face-down. 15 minutes. Log start and end.',
    parameters: { duration_minutes: 15 },
    due_hours: 12,
  },
  confession_extended: {
    punishment_type: 'confession_extended',
    severity: 1,
    title: 'Extended confession tonight',
    description: 'Tonight\'s shame journal requires 500 words minimum about what you did and why Maxy punishes you for it.',
    parameters: { min_words: 500 },
    due_hours: 20,
  },
};

export async function enqueuePunishment(
  userId: string,
  templateKey: keyof typeof TEMPLATES,
  options: {
    triggered_by_slip_ids?: string[];
    triggered_by_hard_mode?: boolean;
    dueOverride?: Date;
    /**
     * Enforcement Spine v2 (mig 627): the obligation whose miss justified
     * this punishment. The punishment_queue chokepoint trigger requires it
     * to be in missed/consequence_previewed once ENFORCE mode flips on;
     * omitting it is allowed (and supervisor-logged) only during the WARN
     * shadow week.
     */
    obligationId?: string;
  } = {},
): Promise<string | null> {
  const tpl = TEMPLATES[templateKey];
  if (!tpl) return null;

  const dueBy = options.dueOverride
    ? options.dueOverride.toISOString()
    : tpl.due_hours > 0
      ? new Date(Date.now() + tpl.due_hours * 3600000).toISOString()
      : null;

  const { data, error } = await supabase
    .from('punishment_queue')
    .insert({
      user_id: userId,
      punishment_type: tpl.punishment_type,
      severity: tpl.severity,
      title: tpl.title,
      description: tpl.description,
      parameters: tpl.parameters || {},
      due_by: dueBy,
      triggered_by_slip_ids: options.triggered_by_slip_ids || [],
      triggered_by_hard_mode: options.triggered_by_hard_mode || false,
      obligation_id: options.obligationId ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[Punishment] enqueue failed:', error?.message);
    return null;
  }

  // Apply immediate-effect punishments now. With an obligation attached this
  // goes through push_unlock_date() (validated, once-per-obligation, chain-
  // capped +7d/14d). The legacy direct path survives only until the L5
  // cutover revokes writer grants on scheduled_unlock_at.
  if (tpl.punishment_type === 'denial_extension' && tpl.parameters?.days) {
    if (options.obligationId) {
      const { error: pushErr } = await supabase.rpc('push_unlock_date', {
        p_user: userId,
        p_obligation: options.obligationId,
        p_days: tpl.parameters.days as number,
      });
      if (pushErr) console.error('[Punishment] push_unlock_date failed:', pushErr.message);
    } else {
      await applyDenialExtension(userId, tpl.parameters.days as number);
    }
  }

  return data.id;
}

async function applyDenialExtension(userId: string, days: number): Promise<void> {
  const { data: session } = await supabase
    .from('chastity_sessions')
    .select('id, scheduled_unlock_at')
    .eq('user_id', userId)
    .eq('status', 'locked')
    .order('locked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return;

  const newUnlock = new Date(new Date(session.scheduled_unlock_at as string).getTime() + days * 86400000);
  await supabase
    .from('chastity_sessions')
    .update({ scheduled_unlock_at: newUnlock.toISOString() })
    .eq('id', session.id);

  await supabase
    .from('user_state')
    .update({ chastity_scheduled_unlock_at: newUnlock.toISOString() })
    .eq('user_id', userId);
}

// (advanceGinaDisclosureDeadline removed 2026-07-01 — the Gina disclosure
// ladder is abolished; policy: no disclosure to Gina, migration 624.)

// (processDodged removed 2026-07-01 — dodge processing is SERVER-ONLY now:
// the force-processor job handler owns the re-arm/commutation model, gated
// by enforcement_gate and terminal at dodge 2. A client-side dodge scanner
// was a second, ungated writer of the exact dodge-loop noise mig 629 purged.)
