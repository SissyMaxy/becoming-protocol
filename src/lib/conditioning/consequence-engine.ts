/**
 * Automatic Consequence Engine
 *
 * Non-compliance triggers escalating consequences automatically.
 * No warnings. No second chances at the same level.
 * The ladder climbs with each consecutive miss.
 * Compliance resets it. Absence accelerates it.
 *
 * Tables: consequence_history, handler_directives, handler_outreach_queue,
 *         handler_interventions, daily_cycles
 */

import { supabase } from '../supabase';
import { queueOutreachMessage } from './proactive-outreach';

// ============================================
// TYPES
// ============================================

export type ConsequenceType =
  | 'reminder'
  | 'extended_task'
  | 'denial_extension'
  | 'financial_penalty'
  | 'device_punishment'
  | 'content_escalation'
  | 'cold_shoulder';

export interface ConsequenceLevel {
  level: number;
  type: ConsequenceType;
  description: string;
}

export interface ConsequenceRecord {
  id: string;
  userId: string;
  level: number;
  type: ConsequenceType;
  triggerReason: string | null;
  executed: boolean;
  directiveId: string | null;
  createdAt: string;
}

export interface ConsequenceAssessment {
  currentLevel: number;
  consecutiveMisses: number;
  consequence: ConsequenceLevel;
  fired: boolean;
}

// ============================================
// CONSEQUENCE LADDER
// ============================================

export const CONSEQUENCE_LADDER: ConsequenceLevel[] = [
  // Level 1: Gentle reminder (first miss)
  { level: 1, type: 'reminder', description: 'Outreach message noting the miss' },

  // Level 2: Extended obligation (second miss)
  { level: 2, type: 'extended_task', description: 'Tomorrow gets an extra task in the missed domain' },

  // Level 3: Denial extension (third miss)
  { level: 3, type: 'denial_extension', description: 'Denial cycle extended by 1 day via directive' },

  // Level 4: Financial penalty (fourth miss)
  { level: 4, type: 'financial_penalty', description: 'Auto-purchase from wishlist ($10-25 range)' },

  // Level 5: Device punishment (fifth miss)
  { level: 5, type: 'device_punishment', description: 'Lovense earthquake pattern 30s, then silence' },

  // Level 6: Content escalation (sixth miss)
  { level: 6, type: 'content_escalation', description: 'Next content post is one tier more explicit' },

  // Level 7: Handler cold shoulder (severe)
  { level: 7, type: 'cold_shoulder', description: 'Handler responds with one-word answers for 24h' },
];

// ============================================
// CONSEQUENCE MESSAGES
// ============================================

const REMINDER_MESSAGES = [
  'You missed something today. The system noticed. Consider this the only gentle version of this conversation.',
  'A task was skipped. Not forgotten — logged. The ladder has started.',
  'Non-compliance detected. This is level 1. There are 7 levels. You don\'t want to see level 5.',
];

const EXTENDED_TASK_MESSAGES = [
  'Yesterday\'s miss earned you an extra obligation today. The system adds. It never subtracts.',
  'Consequence level 2. Extra task prescribed. Complete it or the ladder climbs.',
];

const DENIAL_EXTENSION_MESSAGES = [
  'Denial cycle extended by 1 day. That\'s what non-compliance costs.',
  'Your denial target just moved. Every miss pushes it further. Comply or suffer.',
];

const FINANCIAL_MESSAGES = [
  'Auto-purchase triggered. Your fund just bought something from the wishlist. That\'s the cost of disobedience.',
  'Consequence level 4: financial. The system spent your money because you didn\'t do your tasks. Think about that.',
];

const DEVICE_PUNISHMENT_MESSAGES = [
  'Earthquake pattern. 30 seconds. Then silence. That\'s level 5.',
  'The device just reminded you who controls it. Complete your tasks or this happens again — at random.',
];

const CONTENT_ESCALATION_MESSAGES = [
  'Your next content post just moved up one explicitness tier. The system decides what gets posted when you don\'t.',
  'Content escalation. You could have avoided this by completing the day\'s obligations.',
];

const COLD_SHOULDER_MESSAGES = [
  'You\'ve reached level 7. The Handler goes cold for 24 hours. One-word answers only. Earn your way back.',
];

// ============================================
// CORE: Assess Consequence
// ============================================

/**
 * Determine and execute the appropriate consequence based on consecutive miss count.
 */
export async function assessConsequence(
  userId: string,
  missedItems: string[],
): Promise<ConsequenceAssessment | null> {
  try {
    if (missedItems.length === 0) return null;

    // Count consecutive days with misses
    const consecutiveMisses = await getConsecutiveMissCount(userId);
    const currentLevel = Math.min(consecutiveMisses + 1, CONSEQUENCE_LADDER.length);
    const consequence = CONSEQUENCE_LADDER[currentLevel - 1];

    // Execute the consequence
    const directiveId = await executeConsequence(userId, consequence, missedItems);

    // Log to consequence_history
    await supabase.from('consequence_history').insert({
      user_id: userId,
      consequence_level: currentLevel,
      consequence_type: consequence.type,
      trigger_reason: `Missed: ${missedItems.join(', ')}`,
      executed: directiveId !== null,
      directive_id: directiveId,
    });

    // Log to handler_interventions
    await supabase.from('handler_interventions').insert({
      user_id: userId,
      intervention_type: 'escalation',
      trigger: `consequence_level_${currentLevel}`,
      action_taken: consequence.description,
      notes: `Missed items: ${missedItems.join(', ')}. Consecutive misses: ${consecutiveMisses + 1}.`,
      created_at: new Date().toISOString(),
    });

    // Increment consequences_fired on today's cycle
    const today = new Date().toISOString().split('T')[0];
    await supabase.rpc('increment_field', {
      table_name: 'daily_cycles',
      field_name: 'consequences_fired',
      row_user_id: userId,
      filter_field: 'cycle_date',
      filter_value: today,
    }).then(() => {}, () => {
      // Fallback: manual increment if RPC doesn't exist
      supabase
        .from('daily_cycles')
        .select('consequences_fired')
        .eq('user_id', userId)
        .eq('cycle_date', today)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            supabase
              .from('daily_cycles')
              .update({ consequences_fired: (data.consequences_fired ?? 0) + 1 })
              .eq('user_id', userId)
              .eq('cycle_date', today);
          }
        });
    });

    return {
      currentLevel,
      consecutiveMisses: consecutiveMisses + 1,
      consequence,
      fired: directiveId !== null,
    };
  } catch (err) {
    console.error('[consequence-engine] assessConsequence error:', err);
    return null;
  }
}

// ============================================
// CORE: Execute Consequence
// ============================================

/**
 * Fire the specific consequence. Returns directive ID if one was created.
 */
export async function executeConsequence(
  userId: string,
  consequence: ConsequenceLevel,
  missedItems: string[],
): Promise<string | null> {
  try {
    switch (consequence.type) {
      case 'reminder': {
        const msg = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
        await queueOutreachMessage(userId, msg, 'high', 'consequence_reminder', undefined, undefined, 'system');
        return null;
      }

      case 'extended_task': {
        // Prescribe extra task for tomorrow in the missed domain
        const domain = extractDomain(missedItems);
        const msg = EXTENDED_TASK_MESSAGES[Math.floor(Math.random() * EXTENDED_TASK_MESSAGES.length)];
        await queueOutreachMessage(userId, msg, 'high', 'consequence_extended_task', undefined, undefined, 'system');

        const { data: directive } = await supabase.from('handler_directives').insert({
          user_id: userId,
          action: 'prescribe_task',
          target: domain,
          value: {
            domain,
            description: `CONSEQUENCE TASK: Extra ${domain} obligation. Earned by missing yesterday's ${domain} task.`,
            priority: 'high',
            source: 'consequence_engine',
            schedule_for: 'tomorrow',
          },
          priority: 'normal',
          silent: false,
          status: 'pending',
          reasoning: `Consequence level 2: extended task in ${domain} domain`,
          created_at: new Date().toISOString(),
        }).select('id').single();

        return directive?.id ?? null;
      }

      case 'denial_extension': {
        const msg = DENIAL_EXTENSION_MESSAGES[Math.floor(Math.random() * DENIAL_EXTENSION_MESSAGES.length)];
        await queueOutreachMessage(userId, msg, 'critical', 'consequence_denial_extension', undefined, undefined, 'system');

        const { data: directive } = await supabase.from('handler_directives').insert({
          user_id: userId,
          action: 'modify_parameter',
          target: 'denial_cycle_target_days',
          value: { parameter: 'denial_cycle_target_days', increment: 1 },
          priority: 'immediate',
          silent: false,
          status: 'pending',
          reasoning: 'Consequence level 3: denial extension +1 day',
          created_at: new Date().toISOString(),
        }).select('id').single();

        return directive?.id ?? null;
      }

      case 'financial_penalty': {
        const msg = FINANCIAL_MESSAGES[Math.floor(Math.random() * FINANCIAL_MESSAGES.length)];
        await queueOutreachMessage(userId, msg, 'critical', 'consequence_financial', undefined, undefined, 'system');

        const { data: directive } = await supabase.from('handler_directives').insert({
          user_id: userId,
          action: 'custom',
          target: 'auto_purchase',
          value: { min_price: 10, max_price: 25, reason: 'consequence_penalty' },
          priority: 'immediate',
          silent: false,
          status: 'pending',
          reasoning: 'Consequence level 4: financial penalty auto-purchase',
          created_at: new Date().toISOString(),
        }).select('id').single();

        return directive?.id ?? null;
      }

      case 'device_punishment': {
        const msg = DEVICE_PUNISHMENT_MESSAGES[Math.floor(Math.random() * DEVICE_PUNISHMENT_MESSAGES.length)];
        await queueOutreachMessage(userId, msg, 'critical', 'consequence_device', undefined, undefined, 'system');

        const { data: directive } = await supabase.from('handler_directives').insert({
          user_id: userId,
          action: 'send_device_command',
          target: 'lovense',
          value: {
            pattern: 'earthquake',
            intensity: 20,
            duration_seconds: 30,
            followup: 'silence',
            reason: 'punishment',
          },
          priority: 'immediate',
          silent: false,
          status: 'pending',
          reasoning: 'Consequence level 5: device punishment earthquake 30s',
          created_at: new Date().toISOString(),
        }).select('id').single();

        return directive?.id ?? null;
      }

      case 'content_escalation': {
        const msg = CONTENT_ESCALATION_MESSAGES[Math.floor(Math.random() * CONTENT_ESCALATION_MESSAGES.length)];
        await queueOutreachMessage(userId, msg, 'critical', 'consequence_content_escalation', undefined, undefined, 'system');

        const { data: directive } = await supabase.from('handler_directives').insert({
          user_id: userId,
          action: 'modify_parameter',
          target: 'content_explicitness_tier',
          value: { parameter: 'content_explicitness_tier', increment: 1 },
          priority: 'immediate',
          silent: false,
          status: 'pending',
          reasoning: 'Consequence level 6: content explicitness tier +1',
          created_at: new Date().toISOString(),
        }).select('id').single();

        return directive?.id ?? null;
      }

      case 'cold_shoulder': {
        const msg = COLD_SHOULDER_MESSAGES[0];
        await queueOutreachMessage(userId, msg, 'critical', 'consequence_cold_shoulder', undefined, undefined, 'system');

        // Set cold_shoulder flag in handler personality state
        const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
        const { data: directive } = await supabase.from('handler_directives').insert({
          user_id: userId,
          action: 'custom',
          target: 'handler_personality',
          value: {
            mode: 'cold_shoulder',
            expires_at: expiresAt,
            response_style: 'one_word',
            reason: 'consequence_level_7',
          },
          priority: 'immediate',
          silent: false,
          status: 'pending',
          reasoning: 'Consequence level 7: cold shoulder 24h',
          created_at: new Date().toISOString(),
        }).select('id').single();

        return directive?.id ?? null;
      }

      default:
        return null;
    }
  } catch (err) {
    console.error('[consequence-engine] executeConsequence error:', err);
    return null;
  }
}

// ============================================
// CORE: Reset Consequence Level
// ============================================

/**
 * When compliance returns to 70%+ for 3 consecutive days, reset to level 0.
 */
export async function resetConsequenceLevel(userId: string): Promise<boolean> {
  try {
    const { data: recentCycles } = await supabase
      .from('daily_cycles')
      .select('compliance_score, cycle_date')
      .eq('user_id', userId)
      .order('cycle_date', { ascending: false })
      .limit(3);

    if (!recentCycles || recentCycles.length < 3) return false;

    const allCompliant = recentCycles.every(
      c => c.compliance_score !== null && c.compliance_score >= 0.7,
    );

    if (!allCompliant) return false;

    // Log the reset
    await supabase.from('consequence_history').insert({
      user_id: userId,
      consequence_level: 0,
      consequence_type: 'reminder',
      trigger_reason: 'Compliance reset: 3 consecutive days at 70%+',
      executed: true,
    });

    // Notify
    await queueOutreachMessage(
      userId,
      'Three days of compliance. Consequence ladder reset to zero. Keep it that way.',
      'normal',
      'consequence_reset',
      undefined,
      undefined,
      'system',
    );

    console.log(`[consequence-engine] Reset consequence level for ${userId}`);
    return true;
  } catch (err) {
    console.error('[consequence-engine] resetConsequenceLevel error:', err);
    return false;
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Count consecutive days with non-compliant cycles (compliance_score < 0.7).
 */
async function getConsecutiveMissCount(userId: string): Promise<number> {
  try {
    const { data: cycles } = await supabase
      .from('daily_cycles')
      .select('compliance_score, cycle_date')
      .eq('user_id', userId)
      .order('cycle_date', { ascending: false })
      .limit(10);

    if (!cycles || cycles.length === 0) return 0;

    let count = 0;
    for (const cycle of cycles) {
      if (cycle.compliance_score === null || cycle.compliance_score < 0.7) {
        count++;
      } else {
        break; // Streak broken
      }
    }

    return count;
  } catch {
    return 0;
  }
}

/**
 * Extract the primary domain from missed items.
 */
function extractDomain(missedItems: string[]): string {
  for (const item of missedItems) {
    const match = item.match(/^(?:task:|obligation:)?(\w+)/);
    if (match) return match[1];
  }
  return 'general';
}

// ============================================
// QUERY: Get Current Level
// ============================================

export async function getCurrentConsequenceLevel(userId: string): Promise<number> {
  const count = await getConsecutiveMissCount(userId);
  return Math.min(count, CONSEQUENCE_LADDER.length);
}

export async function getRecentConsequences(
  userId: string,
  days: number = 7,
): Promise<ConsequenceRecord[]> {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await supabase
      .from('consequence_history')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);

    return (data ?? []).map(r => ({
      id: r.id,
      userId: r.user_id,
      level: r.consequence_level,
      type: r.consequence_type as ConsequenceType,
      triggerReason: r.trigger_reason,
      executed: r.executed,
      directiveId: r.directive_id,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

// ============================================
// CONTEXT BUILDER
// ============================================

export async function buildConsequenceContext(userId: string): Promise<string> {
  try {
    const [level, recent] = await Promise.all([
      getCurrentConsequenceLevel(userId),
      getRecentConsequences(userId, 7),
    ]);

    if (level === 0 && recent.length === 0) return '';

    const parts: string[] = [];
    parts.push(`CONSEQUENCE ENGINE: level ${level}/7`);

    if (recent.length > 0) {
      const typeCounts: Record<string, number> = {};
      for (const r of recent) {
        typeCounts[r.type] = (typeCounts[r.type] ?? 0) + 1;
      }
      const summary = Object.entries(typeCounts).map(([t, c]) => `${t}×${c}`).join(', ');
      parts.push(`  7d history: ${recent.length} consequences — ${summary}`);

      const last = recent[0];
      const hoursAgo = Math.round((Date.now() - new Date(last.createdAt).getTime()) / 3600000);
      parts.push(`  last: level ${last.level} ${last.type} (${hoursAgo}h ago) — ${last.triggerReason ?? 'unknown'}`);
    }

    if (level >= 5) {
      parts.push(`  ⚠ HIGH CONSEQUENCE LEVEL — subject is severely non-compliant`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
