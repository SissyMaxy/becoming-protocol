/**
 * Corruption Crisis Suspension Module
 *
 * Handles odometer-triggered suspensions, timed resumption,
 * therapist concerns, and direct level manipulation.
 * Handler-internal — never surfaces to user.
 */

import { supabase } from './supabase';
import {
  type CorruptionDomain,
} from '../types/corruption';
import {
  suspendAllCorruption,
  logCorruptionEvent,
  getCorruptionSnapshot,
} from './corruption';

// ============================================
// ODOMETER CHANGE HANDLER
// ============================================

/**
 * Handle odometer state transitions for corruption suspension.
 * Call whenever the odometer value changes.
 */
export async function handleOdometerChange(
  userId: string,
  newOdometer: string,
  previousOdometer: string,
): Promise<void> {
  // Entering crisis: suspend all corruption
  if (newOdometer === 'survival' && previousOdometer !== 'survival') {
    await suspendAllCorruption(userId, 'Crisis: survival mode entered');

    // Mark as crisis-type suspension
    await supabase
      .from('corruption_state')
      .update({
        suspension_type: 'crisis',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('is_suspended', true);

    // Log crisis-specific events
    const snapshot = await getCorruptionSnapshot(userId);
    for (const s of snapshot.states) {
      await logCorruptionEvent(userId, s.domain, 'crisis_suspend', s.current_level, {
        trigger: 'odometer_survival',
        previous_odometer: previousOdometer,
      });
    }
  }

  // Exiting crisis: schedule delayed resumption (7-day cooling period)
  if (previousOdometer === 'survival' && newOdometer !== 'survival') {
    await scheduleCorruptionResumption(userId, 7);
  }
}

// ============================================
// TIMED RESUMPTION
// ============================================

/**
 * Schedule corruption resumption after a delay.
 * Sets resume_after timestamp on all crisis-suspended domains.
 */
export async function scheduleCorruptionResumption(
  userId: string,
  days: number,
): Promise<void> {
  const resumeAfter = new Date(Date.now() + days * 86400000).toISOString();

  await supabase
    .from('corruption_state')
    .update({
      resume_after: resumeAfter,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_suspended', true)
    .eq('suspension_type', 'crisis');

  // Log scheduling
  const snapshot = await getCorruptionSnapshot(userId);
  for (const s of snapshot.states) {
    if (s.is_suspended && s.suspension_type === 'crisis') {
      await logCorruptionEvent(userId, s.domain, 'timed_resume', s.current_level, {
        scheduled_resume: resumeAfter,
        delay_days: days,
      });
    }
  }
}

/**
 * Check and process any domains whose resumption timer has expired.
 * Called during daily maintenance.
 */
export async function checkResumptionTimers(
  userId: string,
): Promise<CorruptionDomain[]> {
  const now = new Date().toISOString();

  // Find domains ready to resume
  const { data: readyDomains } = await supabase
    .from('corruption_state')
    .select('domain, current_level')
    .eq('user_id', userId)
    .eq('is_suspended', true)
    .not('resume_after', 'is', null)
    .lte('resume_after', now);

  if (!readyDomains || readyDomains.length === 0) return [];

  const resumed: CorruptionDomain[] = [];
  const resumeTime = new Date().toISOString();

  for (const row of readyDomains) {
    const domain = row.domain as CorruptionDomain;

    // Resume this domain: clear suspension, reset advancement timer
    await supabase
      .from('corruption_state')
      .update({
        is_suspended: false,
        suspension_reason: null,
        suspended_at: null,
        resume_after: null,
        suspension_type: null,
        advancement_score: 0,
        level_entered_at: resumeTime,
        updated_at: resumeTime,
      })
      .eq('user_id', userId)
      .eq('domain', domain);

    await logCorruptionEvent(userId, domain, 'timed_resume', row.current_level, {
      type: 'auto_resume',
      level_preserved: row.current_level,
    });

    resumed.push(domain);
  }

  return resumed;
}

// ============================================
// THERAPIST CONCERN HANDLING
// ============================================

/**
 * Handle a therapist concern report.
 * Freezes therapist domain, resets progress on content and financial.
 */
export async function handleTherapistConcern(
  userId: string,
  concern: string,
): Promise<void> {
  const now = new Date().toISOString();

  // Freeze therapist domain
  await supabase
    .from('corruption_state')
    .update({
      is_suspended: true,
      suspension_type: 'therapist',
      suspension_reason: concern,
      suspended_at: now,
      updated_at: now,
    })
    .eq('user_id', userId)
    .eq('domain', 'therapist');

  // Log therapist flag
  const snapshot = await getCorruptionSnapshot(userId);
  await logCorruptionEvent(userId, 'therapist', 'therapist_flag', snapshot.levels.therapist, {
    concern,
  });

  // Reset advancement progress on content and financial (not level, just score)
  for (const domain of ['content', 'financial'] as CorruptionDomain[]) {
    await supabase
      .from('corruption_state')
      .update({
        advancement_score: 0,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('domain', domain);

    await logCorruptionEvent(userId, domain, 'therapist_rollback', snapshot.levels[domain], {
      reason: 'Therapist concern — progress reset',
      concern,
    });
  }

  // Log to handler_decisions for audit
  await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'therapist_concern',
    decision_data: {
      concern,
      therapist_level: snapshot.levels.therapist,
      content_level: snapshot.levels.content,
      financial_level: snapshot.levels.financial,
    },
    reasoning: `Therapist concern reported: "${concern}". Froze therapist domain, reset content/financial progress.`,
    executed: true,
  }).then(() => {}, () => {}); // fire-and-forget
}

// ============================================
// DIRECT LEVEL MANIPULATION
// ============================================

/**
 * Set a domain's corruption level directly.
 * Used for therapist rollback and administrative overrides.
 */
export async function setCorruptionLevel(
  userId: string,
  domain: CorruptionDomain,
  level: number,
): Promise<void> {
  const clampedLevel = Math.max(0, Math.min(5, level));
  const now = new Date().toISOString();

  const { data: current } = await supabase
    .from('corruption_state')
    .select('current_level')
    .eq('user_id', userId)
    .eq('domain', domain)
    .single();

  await supabase
    .from('corruption_state')
    .update({
      current_level: clampedLevel,
      level_entered_at: now,
      advancement_score: 0,
      updated_at: now,
    })
    .eq('user_id', userId)
    .eq('domain', domain);

  await logCorruptionEvent(userId, domain, 'advancement', clampedLevel, {
    type: 'manual_set',
    from_level: current?.current_level ?? 0,
    to_level: clampedLevel,
  });
}

/**
 * Reset the advancement timer for a domain without changing its level.
 * Useful after resolving concerns.
 */
export async function resetAdvancementTimer(
  userId: string,
  domain: CorruptionDomain,
): Promise<void> {
  const now = new Date().toISOString();

  await supabase
    .from('corruption_state')
    .update({
      level_entered_at: now,
      advancement_score: 0,
      updated_at: now,
    })
    .eq('user_id', userId)
    .eq('domain', domain);
}
