/**
 * Corruption Library
 *
 * Handler-internal system for tracking progressive boundary erosion.
 * NEVER surfaces data to the user — only consumed by Handler context
 * and AI prompt builders.
 */

import { supabase } from './supabase';
import {
  ALL_CORRUPTION_DOMAINS,
  computeCompositeScore,
  type CorruptionDomain,
  type CorruptionEventType,
  type CorruptionLevels,
  type CorruptionSnapshot,
  type CorruptionState,
  type CorruptionEvent,
  type AdvancementCriteria,
} from '../types/corruption';

// ============================================
// INITIALIZATION
// ============================================

/** Initialize corruption state for a new user (all domains at level 0) */
export async function initializeCorruption(userId: string): Promise<void> {
  const rows = ALL_CORRUPTION_DOMAINS.map(domain => ({
    user_id: userId,
    domain,
    current_level: 0,
    advancement_score: 0,
    advancement_threshold: 100,
    is_suspended: false,
  }));

  await supabase.from('corruption_state').upsert(rows, { onConflict: 'user_id,domain' });
}

// ============================================
// SNAPSHOT
// ============================================

/** Get current corruption snapshot for a user */
export async function getCorruptionSnapshot(userId: string): Promise<CorruptionSnapshot> {
  const { data } = await supabase
    .from('corruption_state')
    .select('*')
    .eq('user_id', userId);

  const states: CorruptionState[] = (data || []).map(row => ({
    domain: row.domain as CorruptionDomain,
    current_level: row.current_level,
    level_entered_at: row.level_entered_at,
    advancement_score: Number(row.advancement_score),
    advancement_threshold: Number(row.advancement_threshold),
    is_suspended: row.is_suspended,
    suspension_reason: row.suspension_reason ?? undefined,
    resume_after: row.resume_after ?? undefined,
    suspension_type: row.suspension_type ?? undefined,
  }));

  const levels: CorruptionLevels = {
    privacy: 0, gina: 0, financial: 0, autonomy: 0,
    identity_language: 0, therapist: 0, content: 0,
  };

  const days_at_current_levels: Record<CorruptionDomain, number> = {
    privacy: 0, gina: 0, financial: 0, autonomy: 0,
    identity_language: 0, therapist: 0, content: 0,
  };

  let all_suspended = states.length > 0;
  let suspension_reason: string | undefined;

  for (const s of states) {
    levels[s.domain] = s.current_level;
    days_at_current_levels[s.domain] = Math.floor(
      (Date.now() - new Date(s.level_entered_at).getTime()) / 86400000
    );
    if (!s.is_suspended) all_suspended = false;
    if (s.is_suspended && s.suspension_reason) suspension_reason = s.suspension_reason;
  }

  // If no states exist yet, nothing is suspended
  if (states.length === 0) all_suspended = false;

  return {
    levels,
    states,
    all_suspended,
    suspension_reason,
    composite_score: computeCompositeScore(levels),
    days_at_current_levels,
  };
}

// ============================================
// EVENT LOGGING
// ============================================

/** Log a corruption event */
export async function logCorruptionEvent(
  userId: string,
  domain: CorruptionDomain,
  eventType: CorruptionEventType,
  level: number,
  details?: Record<string, unknown>,
  handlerIntent?: string,
  userFacingCopy?: string,
): Promise<void> {
  await supabase.from('corruption_events').insert({
    user_id: userId,
    domain,
    event_type: eventType,
    corruption_level_at_event: level,
    details: details ?? null,
    handler_intent: handlerIntent ?? null,
    user_facing_copy: userFacingCopy ?? null,
  });
}

// ============================================
// SUSPENSION / RESUMPTION
// ============================================

/** Suspend all corruption (crisis mode) */
export async function suspendAllCorruption(userId: string, reason: string): Promise<void> {
  await supabase
    .from('corruption_state')
    .update({
      is_suspended: true,
      suspension_reason: reason,
      suspended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  // Log suspension event for each domain
  const snapshot = await getCorruptionSnapshot(userId);
  for (const s of snapshot.states) {
    await logCorruptionEvent(userId, s.domain, 'suspension', s.current_level, { reason });
  }
}

/** Resume corruption after crisis (levels preserved, advancement timers reset) */
export async function resumeCorruption(userId: string): Promise<void> {
  const now = new Date().toISOString();

  await supabase
    .from('corruption_state')
    .update({
      is_suspended: false,
      suspension_reason: null,
      suspended_at: null,
      // Reset advancement score — timer restarts, but level is preserved
      advancement_score: 0,
      level_entered_at: now,
      updated_at: now,
    })
    .eq('user_id', userId);

  // Log resumption event for each domain
  const snapshot = await getCorruptionSnapshot(userId);
  for (const s of snapshot.states) {
    await logCorruptionEvent(userId, s.domain, 'resumption', s.current_level);
  }
}

// ============================================
// ADVANCEMENT
// ============================================

/** Check advancement eligibility for a domain */
export async function checkAdvancement(
  userId: string,
  domain: CorruptionDomain,
  milestoneData: Record<string, unknown>,
): Promise<{ eligible: boolean; reason?: string }> {
  // Get current state
  const { data: stateRow } = await supabase
    .from('corruption_state')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .single();

  if (!stateRow) return { eligible: false, reason: 'No corruption state found' };
  if (stateRow.is_suspended) return { eligible: false, reason: 'Corruption suspended' };
  if (stateRow.current_level >= 5) return { eligible: false, reason: 'Already at max level' };

  // Get advancement criteria
  const { data: criteria } = await supabase
    .from('corruption_advancement_criteria')
    .select('*')
    .eq('domain', domain)
    .eq('from_level', stateRow.current_level)
    .eq('to_level', stateRow.current_level + 1)
    .single();

  if (!criteria) return { eligible: false, reason: 'No advancement criteria defined' };

  // Check minimum days at current level
  const daysAtLevel = Math.floor(
    (Date.now() - new Date(stateRow.level_entered_at).getTime()) / 86400000
  );
  if (daysAtLevel < criteria.minimum_days) {
    return {
      eligible: false,
      reason: `Only ${daysAtLevel}/${criteria.minimum_days} days at current level`,
    };
  }

  // Check required milestones
  const required = criteria.required_milestones as Record<string, unknown>;
  for (const [key, value] of Object.entries(required)) {
    const actual = milestoneData[key];
    if (actual === undefined) {
      return { eligible: false, reason: `Missing milestone: ${key}` };
    }

    // Numeric comparison
    if (typeof value === 'number' && typeof actual === 'number') {
      if (key.includes('max')) {
        if (actual > value) return { eligible: false, reason: `${key}: ${actual} > ${value}` };
      } else {
        if (actual < value) return { eligible: false, reason: `${key}: ${actual} < ${value}` };
      }
    }

    // Boolean comparison
    if (typeof value === 'boolean' && actual !== value) {
      return { eligible: false, reason: `${key}: expected ${value}, got ${actual}` };
    }
  }

  return { eligible: true };
}

/** Advance a domain's corruption level */
export async function advanceCorruption(
  userId: string,
  domain: CorruptionDomain,
): Promise<{ new_level: number }> {
  const { data: stateRow } = await supabase
    .from('corruption_state')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .single();

  if (!stateRow || stateRow.current_level >= 5) {
    return { new_level: stateRow?.current_level ?? 0 };
  }

  const newLevel = stateRow.current_level + 1;
  const now = new Date().toISOString();

  await supabase
    .from('corruption_state')
    .update({
      current_level: newLevel,
      level_entered_at: now,
      advancement_score: 0,
      updated_at: now,
    })
    .eq('user_id', userId)
    .eq('domain', domain);

  await logCorruptionEvent(userId, domain, 'advancement', newLevel, {
    from_level: stateRow.current_level,
    to_level: newLevel,
  });

  // Check for cascade acceleration after advancement
  await checkCascade(userId);

  return { new_level: newLevel };
}

/** Increment advancement score for a domain */
export async function incrementAdvancementScore(
  userId: string,
  domain: CorruptionDomain,
  points: number,
): Promise<void> {
  const { data: stateRow } = await supabase
    .from('corruption_state')
    .select('advancement_score, advancement_threshold')
    .eq('user_id', userId)
    .eq('domain', domain)
    .single();

  if (!stateRow) return;

  const newScore = Number(stateRow.advancement_score) + points;

  await supabase
    .from('corruption_state')
    .update({
      advancement_score: newScore,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('domain', domain);
}

// ============================================
// CASCADE
// ============================================

/** Check cascade acceleration: 3+ domains at level N → remaining cascade-eligible domains get bonus */
export async function checkCascade(userId: string): Promise<CorruptionDomain[]> {
  const snapshot = await getCorruptionSnapshot(userId);
  const cascadedDomains: CorruptionDomain[] = [];

  // Get cascade eligibility from criteria
  const { data: criteria } = await supabase
    .from('corruption_advancement_criteria')
    .select('domain, cascade_eligible')
    .eq('cascade_eligible', true);

  const cascadeEligible = new Set(
    (criteria || []).map(c => c.domain as CorruptionDomain)
  );

  // For each level 1-5, check if 3+ domains have reached that level
  for (let level = 1; level <= 5; level++) {
    const domainsAtOrAbove = ALL_CORRUPTION_DOMAINS.filter(
      d => snapshot.levels[d] >= level
    );

    if (domainsAtOrAbove.length >= 3) {
      // Find cascade-eligible domains below this level
      const candidates = ALL_CORRUPTION_DOMAINS.filter(
        d =>
          snapshot.levels[d] < level &&
          cascadeEligible.has(d) &&
          !snapshot.states.find(s => s.domain === d)?.is_suspended
      );

      for (const domain of candidates) {
        // Give bonus advancement points (20% of threshold)
        const state = snapshot.states.find(s => s.domain === domain);
        if (state) {
          const bonus = Math.round(state.advancement_threshold * 0.2);
          await incrementAdvancementScore(userId, domain, bonus);
          await logCorruptionEvent(userId, domain, 'cascade', snapshot.levels[domain], {
            cascade_level: level,
            domains_triggering: domainsAtOrAbove,
            bonus_points: bonus,
          });
          cascadedDomains.push(domain);
        }
      }
    }
  }

  return cascadedDomains;
}

// ============================================
// QUERY HELPERS
// ============================================

/** Get recent corruption events for a domain */
export async function getRecentEvents(
  userId: string,
  domain: CorruptionDomain,
  limit: number = 20,
): Promise<CorruptionEvent[]> {
  const { data } = await supabase
    .from('corruption_events')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).map(row => ({
    id: row.id,
    domain: row.domain as CorruptionDomain,
    event_type: row.event_type as CorruptionEventType,
    corruption_level_at_event: row.corruption_level_at_event,
    details: row.details ?? undefined,
    handler_intent: row.handler_intent ?? undefined,
    user_facing_copy: row.user_facing_copy ?? undefined,
    created_at: row.created_at,
  }));
}

/** Get advancement criteria for a specific transition */
export async function getAdvancementCriteria(
  domain: CorruptionDomain,
  fromLevel: number,
): Promise<AdvancementCriteria | null> {
  const { data } = await supabase
    .from('corruption_advancement_criteria')
    .select('*')
    .eq('domain', domain)
    .eq('from_level', fromLevel)
    .eq('to_level', fromLevel + 1)
    .single();

  if (!data) return null;

  return {
    domain: data.domain as CorruptionDomain,
    from_level: data.from_level,
    to_level: data.to_level,
    minimum_days: data.minimum_days,
    required_milestones: data.required_milestones as Record<string, unknown>,
    cascade_eligible: data.cascade_eligible,
  };
}
