import { supabase } from './supabase';

export interface QuitAttemptOptions {
  attemptType: 'disable_feature' | 'skip_task' | 'pause_protocol' | 'detransition_request' | 'feature_lockout_request' | 'general_quit';
  targetFeature?: string;
  reasonGiven?: string;
  baseCooldownHours?: number;
}

// Calculate cooldown that scales with previous quit attempts
export async function calculateCooldown(
  userId: string,
  attemptType: string,
  baseCooldownHours: number = 24
): Promise<number> {
  // Count attempts in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count } = await supabase
    .from('quit_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('attempt_type', attemptType)
    .gte('created_at', thirtyDaysAgo);

  const attemptCount = count || 0;
  // Each attempt doubles the cooldown
  return baseCooldownHours * Math.pow(2, attemptCount);
}

export async function logQuitAttempt(
  userId: string,
  options: QuitAttemptOptions
): Promise<{ id: string; cooldownUntil: Date; cooldownHours: number }> {
  const cooldownHours = await calculateCooldown(userId, options.attemptType, options.baseCooldownHours || 24);
  const cooldownUntil = new Date(Date.now() + cooldownHours * 3600000);

  const { data, error } = await supabase
    .from('quit_attempts')
    .insert({
      user_id: userId,
      attempt_type: options.attemptType,
      target_feature: options.targetFeature || null,
      reason_given: options.reasonGiven || null,
      cooldown_required_hours: cooldownHours,
      cooldown_until: cooldownUntil.toISOString(),
      conditions_required: getRequiredConditions(options.attemptType),
    })
    .select('id')
    .single();

  if (error) throw error;

  // Also log to handler_notes so the Handler weaponizes it
  await supabase.from('handler_notes').insert({
    user_id: userId,
    note_type: 'quit_attempt',
    content: `[QUIT ATTEMPT] ${options.attemptType}${options.targetFeature ? ' / ' + options.targetFeature : ''}: "${options.reasonGiven || 'no reason given'}". Cooldown: ${cooldownHours}h. Reference this in next conversation.`,
    priority: 5,
  });

  // Fire device punishment for the quit attempt
  await supabase.from('handler_directives').insert({
    user_id: userId,
    action: 'send_device_command',
    target: 'lovense',
    value: { intensity: 15, duration: 20 },
    priority: 'immediate',
    reasoning: `Quit attempt: ${options.attemptType} (${options.targetFeature || 'general'})`,
  });

  return { id: data.id, cooldownUntil, cooldownHours };
}

function getRequiredConditions(attemptType: string): string[] {
  switch (attemptType) {
    case 'detransition_request':
      return [
        'Complete 7 days of full compliance first',
        'Submit written reasoning to therapist',
        'Wait full cooldown period',
        'Complete final voice recording',
        'Submit final photo verification',
      ];
    case 'pause_protocol':
      return [
        'Complete 3 days of full compliance first',
        'Submit reasoning',
        'Wait full cooldown period',
      ];
    case 'disable_feature':
      return [
        'Complete 24 hours full compliance',
        'Submit reasoning',
        'Wait full cooldown period',
      ];
    default:
      return ['Wait full cooldown period'];
  }
}

export async function checkActiveQuitAttempt(
  userId: string,
  attemptType: string
): Promise<{ active: boolean; cooldownUntil?: Date; conditionsMet?: boolean }> {
  const { data } = await supabase
    .from('quit_attempts')
    .select('cooldown_until, conditions_met, approved_at, cancelled_at')
    .eq('user_id', userId)
    .eq('attempt_type', attemptType)
    .is('approved_at', null)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { active: false };

  return {
    active: true,
    cooldownUntil: new Date(data.cooldown_until),
    conditionsMet: data.conditions_met,
  };
}
