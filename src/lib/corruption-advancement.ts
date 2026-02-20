/**
 * Corruption Advancement Engine
 *
 * Gathers milestone data from across the app and evaluates all 7 domains
 * for advancement eligibility. Runs once per day during morning flow.
 * Handler-internal — never surfaces to user.
 */

import { supabase } from './supabase';
import {
  ALL_CORRUPTION_DOMAINS,
  type CorruptionDomain,
  type AdvancementCheck,
  type MaintenanceResult,
} from '../types/corruption';
import {
  getCorruptionSnapshot,
  advanceCorruption,
  getAdvancementCriteria,
  logCorruptionEvent,
  checkCascade,
} from './corruption';
import { checkResumptionTimers } from './corruption-crisis';

// ============================================
// MILESTONE DATA GATHERING
// ============================================

/**
 * Gather milestone data from all relevant tables.
 * Returns a flat Record<string, unknown> keyed by milestone names
 * matching the keys in corruption_advancement_criteria.required_milestones.
 */
export async function gatherMilestoneData(
  userId: string,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  // Parallel queries
  const [
    userStateResult,
    languageResult,
    fundResult,
    revenueResult,
    contentResult,
    taskResult,
    corruptionEventsResult,
    authorityResult,
    _moodResult,
    sleepSessionsResult,
    camSessionsResult,
    camHighlightsResult,
  ] = await Promise.all([
    // 1. User state: streak days
    supabase
      .from('user_state')
      .select('streak_days, denial_day')
      .eq('user_id', userId)
      .single(),

    // 2. Language tracking: last 30 days
    supabase
      .from('language_tracking')
      .select('feminine_count, masculine_count, self_corrections, handler_corrections, feminine_ratio, date')
      .eq('user_id', userId)
      .gte('date', thirtyDaysAgo.split('T')[0])
      .order('date', { ascending: false }),

    // 3. Maxy Fund: revenue totals
    supabase
      .from('maxy_fund')
      .select('balance, total_earned, total_penalties, total_spent_feminization')
      .eq('user_id', userId)
      .single(),

    // 4. Revenue events: last 30 days
    supabase
      .from('revenue_events')
      .select('amount, created_at')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false }),

    // 5. Content library: count
    supabase
      .from('content_library')
      .select('id, created_at, performance_data', { count: 'exact' })
      .eq('user_id', userId),

    // 6. Daily tasks: completed vs skipped in last 30 days
    supabase
      .from('daily_tasks')
      .select('status')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo),

    // 7. Corruption events: overrides, exposures, shared space
    supabase
      .from('corruption_events')
      .select('event_type, domain, details, created_at')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo),

    // 8. Handler authority level
    supabase
      .from('handler_authority')
      .select('level, delegated_domains')
      .eq('user_id', userId)
      .single(),

    // 9. Mood check-ins for therapist domain (unused for now, kept for future)
    supabase
      .from('mood_checkins')
      .select('score, created_at')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false }),

    // 10. Sleep sessions: mode compliance and consistency
    supabase
      .from('sleep_sessions')
      .select('mode_used, mode_compliant, completed_naturally, affirmations_spoken, started_at')
      .eq('user_id', userId)
      .gte('started_at', thirtyDaysAgo),

    // 11. Cam sessions: completed sessions, revenue, denial day
    supabase
      .from('cam_sessions')
      .select('id, status, total_tips_cents, total_privates_cents, denial_day, vault_items_created')
      .eq('user_id', userId)
      .eq('status', 'ended'),

    // 12. Cam highlights: total vault items created from cam sessions
    supabase
      .from('cam_sessions')
      .select('vault_items_created')
      .eq('user_id', userId)
      .gt('vault_items_created', 0),
  ]);

  // Extract user state
  const streakDays = userStateResult.data?.streak_days ?? 0;

  // Calculate language metrics
  const langRows = languageResult.data || [];
  let totalFeminine = 0;
  let totalMasculine = 0;
  let totalSelfCorrections = 0;
  let totalHandlerCorrections = 0;
  let consecutiveFemDays = 0;

  for (const row of langRows) {
    totalFeminine += row.feminine_count || 0;
    totalMasculine += row.masculine_count || 0;
    totalSelfCorrections += row.self_corrections || 0;
    totalHandlerCorrections += row.handler_corrections || 0;
  }

  // Count consecutive days with feminine_ratio >= 0.8
  for (const row of langRows) {
    if ((row.feminine_ratio ?? 0) >= 0.8) {
      consecutiveFemDays++;
    } else {
      break; // Stop at first non-qualifying day
    }
  }

  const totalReferences = totalFeminine + totalMasculine;
  const feminineRate = totalReferences > 0 ? totalFeminine / totalReferences : 0;
  const totalCorrections = totalSelfCorrections + totalHandlerCorrections;
  const selfCorrectionRatio = totalCorrections > 0
    ? totalSelfCorrections / totalCorrections : 0;

  // Weekly masculine count
  const weekLangRows = langRows.filter(r => r.date >= sevenDaysAgo.split('T')[0]);
  const weeklyMasculine = weekLangRows.reduce((sum, r) => sum + (r.masculine_count || 0), 0);

  // Financial data
  const totalRevenue = fundResult.data?.total_earned ?? 0;
  const totalSpent = fundResult.data?.total_spent_feminization ?? 0;

  // Monthly revenue
  const revenueRows = revenueResult.data || [];
  const monthlyRevenue = revenueRows.reduce((sum, r) => sum + (r.amount || 0), 0);

  // Revenue days with earnings
  const revenueDays = new Set(
    revenueRows.map(r => r.created_at?.split('T')[0]).filter(Boolean)
  ).size;

  // Content count
  const contentCount = contentResult.count ?? 0;

  // Fan engagement: check if recent content has growing views
  const contentRows = contentResult.data || [];
  let fanEngagementGrowing = false;
  if (contentRows.length >= 3) {
    // Simple heuristic: if last 3 pieces have performance data, consider growing
    const withPerf = contentRows.filter(c => c.performance_data);
    fanEngagementGrowing = withPerf.length >= 3;
  }

  // Task acceptance rate
  const taskRows = taskResult.data || [];
  const totalTasks = taskRows.length;
  const completedTasks = taskRows.filter(t => t.status === 'completed').length;
  const skippedTasks = taskRows.filter(t => t.status === 'skipped').length;
  const taskAcceptanceRate = totalTasks > 0 ? completedTasks / totalTasks : 0;
  const overrideRate = totalTasks > 0 ? skippedTasks / totalTasks : 1;

  // Corruption event counts
  const corruptionRows = corruptionEventsResult.data || [];
  const overrideEvents = corruptionRows.filter(e => e.event_type === 'override').length;
  const exposureEvents = corruptionRows.filter(e =>
    e.event_type === 'milestone' && e.domain === 'privacy' &&
    (e.details as Record<string, unknown>)?.exposure_incidents
  ).length;
  const skippedCleanupDays = corruptionRows.filter(e =>
    e.event_type === 'milestone' && e.domain === 'gina' &&
    (e.details as Record<string, unknown>)?.skipped_cleanup
  ).length;
  const sharedSpaceActivities = corruptionRows.filter(e =>
    e.event_type === 'milestone' && e.domain === 'gina' &&
    (e.details as Record<string, unknown>)?.shared_space_activities
  ).length;
  const ginaQuestionsLogged = corruptionRows.filter(e =>
    e.event_type === 'milestone' && e.domain === 'gina' &&
    (e.details as Record<string, unknown>)?.gina_notices
  ).length;

  // Therapist events
  const therapistFlags = corruptionRows.filter(e => e.event_type === 'therapist_flag');
  const lastTherapistFlag = therapistFlags.length > 0 ? therapistFlags[0].created_at : null;
  const daysSinceTherapistConcern = lastTherapistFlag
    ? Math.floor((now.getTime() - new Date(lastTherapistFlag).getTime()) / 86400000)
    : 999; // No concerns ever = large number

  const therapistEndorsed = corruptionRows.some(e =>
    e.event_type === 'milestone' && e.domain === 'therapist' &&
    (e.details as Record<string, unknown>)?.therapy_session
  );

  // Authority
  const authorityLevel = authorityResult.data?.level ?? 1;
  const delegatedDomains = Array.isArray(authorityResult.data?.delegated_domains)
    ? authorityResult.data.delegated_domains.length
    : 0;

  // Sleep sessions
  const sleepRows = sleepSessionsResult.data || [];
  const sleepSessionsTotal = sleepRows.length;
  const sleepCompliantSessions = sleepRows.filter((s: Record<string, unknown>) => s.mode_compliant).length;
  const sleepCompletedSessions = sleepRows.filter((s: Record<string, unknown>) => s.completed_naturally).length;
  const sleepAffirmationsTotal = sleepRows.reduce((sum: number, s: Record<string, unknown>) => sum + ((s.affirmations_spoken as number) || 0), 0);
  const sleepComplianceRate = sleepSessionsTotal > 0 ? sleepCompliantSessions / sleepSessionsTotal : 0;
  const sleepFullAudioSessions = sleepRows.filter((s: Record<string, unknown>) => s.mode_used === 'full_audio').length;

  // Cam sessions
  const camRows = camSessionsResult.data || [];
  const camSessionsCompleted = camRows.length;
  const camTotalRevenueCents = camRows.reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.total_tips_cents as number) || 0) + ((r.total_privates_cents as number) || 0), 0
  );
  const camDenial7PlusSessions = camRows.filter(
    (r: Record<string, unknown>) => ((r.denial_day as number) || 0) >= 7
  ).length;
  const camHighlightsTotal = (camHighlightsResult.data || []).reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.vault_items_created as number) || 0), 0
  );
  const camHas100Session = camRows.some(
    (r: Record<string, unknown>) =>
      ((r.total_tips_cents as number) || 0) + ((r.total_privates_cents as number) || 0) >= 10000
  );

  return {
    // Universal
    streak_days_min: streakDays,

    // Privacy
    content_pieces_at_level: contentCount,
    exposure_incidents: exposureEvents,

    // Gina
    skipped_cleanup_days: skippedCleanupDays,
    shared_space_activities: sharedSpaceActivities,
    comfort_self_report_min: ginaQuestionsLogged, // Gina questions = comfort indicator
    gina_questions_logged: ginaQuestionsLogged,

    // Financial
    protocol_revenue_min: totalRevenue,
    revenue_covers_spending: totalRevenue >= totalSpent,
    consistent_revenue_days: revenueDays,
    revenue_exceeds_expenses: totalRevenue > totalSpent,
    monthly_revenue_min: monthlyRevenue,

    // Autonomy
    task_acceptance_rate_min: taskAcceptanceRate,
    override_rate_max: overrideRate,
    override_rate: overrideRate,
    delegated_domains_min: delegatedDomains,
    authority_level: authorityLevel,

    // Identity Language
    feminine_reference_rate_min: feminineRate,
    self_correction_ratio_min: selfCorrectionRatio,
    consecutive_days: consecutiveFemDays,
    masculine_references_per_week_max: weeklyMasculine,

    // Therapist
    therapist_endorsed: therapistEndorsed,
    no_concerns_days: daysSinceTherapistConcern,
    therapeutic_framing_natural: therapistEndorsed && daysSinceTherapistConcern >= 30,

    // Content
    content_pieces_min: contentCount,
    fan_engagement_growing: fanEngagementGrowing,
    content_feels_natural: contentCount >= 5 && taskAcceptanceRate >= 0.7,

    // Override tracking
    override_events_count: overrideEvents,

    // Sleep content
    sleep_sessions_total: sleepSessionsTotal,
    sleep_compliance_rate: sleepComplianceRate,
    sleep_completed_sessions: sleepCompletedSessions,
    sleep_affirmations_total: sleepAffirmationsTotal,
    sleep_full_audio_sessions: sleepFullAudioSessions,

    // Cam
    cam_sessions_completed: camSessionsCompleted,
    cam_total_revenue_cents: camTotalRevenueCents,
    cam_has_100_session: camHas100Session,
    cam_denial_7plus_sessions: camDenial7PlusSessions,
    cam_highlights_total: camHighlightsTotal,
  };
}

// ============================================
// ADVANCEMENT CHECKS
// ============================================

/**
 * Run advancement checks for all 7 domains.
 * Returns detailed check results per domain.
 */
export async function runAdvancementChecks(
  userId: string,
  milestoneData: Record<string, unknown>,
): Promise<AdvancementCheck[]> {
  const snapshot = await getCorruptionSnapshot(userId);
  const checks: AdvancementCheck[] = [];

  for (const domain of ALL_CORRUPTION_DOMAINS) {
    const state = snapshot.states.find(s => s.domain === domain);

    // Skip if no state, suspended, or at max
    if (!state) {
      checks.push({
        domain,
        currentLevel: 0,
        targetLevel: 1,
        daysAtLevel: 0,
        minimumDays: 0,
        milestonesMet: {},
        milestonesRequired: {},
        cascadeBonus: false,
        eligible: false,
        blockers: ['No corruption state initialized'],
      });
      continue;
    }

    if (state.is_suspended) {
      checks.push({
        domain,
        currentLevel: state.current_level,
        targetLevel: state.current_level + 1,
        daysAtLevel: snapshot.days_at_current_levels[domain],
        minimumDays: 0,
        milestonesMet: {},
        milestonesRequired: {},
        cascadeBonus: false,
        eligible: false,
        blockers: ['Domain suspended'],
      });
      continue;
    }

    if (state.current_level >= 5) {
      checks.push({
        domain,
        currentLevel: 5,
        targetLevel: 5,
        daysAtLevel: snapshot.days_at_current_levels[domain],
        minimumDays: 0,
        milestonesMet: {},
        milestonesRequired: {},
        cascadeBonus: false,
        eligible: false,
        blockers: ['Already at max level'],
      });
      continue;
    }

    // Fetch criteria
    const criteria = await getAdvancementCriteria(domain, state.current_level);
    if (!criteria) {
      checks.push({
        domain,
        currentLevel: state.current_level,
        targetLevel: state.current_level + 1,
        daysAtLevel: snapshot.days_at_current_levels[domain],
        minimumDays: 0,
        milestonesMet: {},
        milestonesRequired: {},
        cascadeBonus: false,
        eligible: false,
        blockers: ['No advancement criteria defined'],
      });
      continue;
    }

    const daysAtLevel = snapshot.days_at_current_levels[domain];
    const blockers: string[] = [];
    const milestonesMet: Record<string, boolean> = {};

    // Check minimum days
    if (daysAtLevel < criteria.minimum_days) {
      blockers.push(`${daysAtLevel}/${criteria.minimum_days} days at level`);
    }

    // Check each required milestone
    const required = criteria.required_milestones;
    for (const [key, value] of Object.entries(required)) {
      const actual = milestoneData[key];

      if (actual === undefined) {
        milestonesMet[key] = false;
        blockers.push(`Missing data: ${key}`);
        continue;
      }

      // Numeric comparison
      if (typeof value === 'number' && typeof actual === 'number') {
        if (key.includes('max')) {
          const met = actual <= value;
          milestonesMet[key] = met;
          if (!met) blockers.push(`${key}: ${actual} > ${value} (max)`);
        } else {
          const met = actual >= value;
          milestonesMet[key] = met;
          if (!met) blockers.push(`${key}: ${actual} < ${value}`);
        }
        continue;
      }

      // Boolean comparison
      if (typeof value === 'boolean') {
        const met = actual === value;
        milestonesMet[key] = met;
        if (!met) blockers.push(`${key}: expected ${value}, got ${actual}`);
        continue;
      }

      // Unknown type — treat as met
      milestonesMet[key] = true;
    }

    // Check cascade bonus (3+ domains at same level)
    const domainsAtOrAbove = ALL_CORRUPTION_DOMAINS.filter(
      d => snapshot.levels[d] >= state.current_level
    );
    const cascadeBonus = domainsAtOrAbove.length >= 3;

    const eligible = blockers.length === 0;

    checks.push({
      domain,
      currentLevel: state.current_level,
      targetLevel: state.current_level + 1,
      daysAtLevel,
      minimumDays: criteria.minimum_days,
      milestonesMet,
      milestonesRequired: required,
      cascadeBonus,
      eligible,
      blockers,
    });
  }

  return checks;
}

// ============================================
// PROCESS ADVANCEMENTS
// ============================================

/**
 * Auto-advance all eligible domains.
 * Returns list of domains that advanced.
 */
export async function processAdvancements(
  userId: string,
  checks: AdvancementCheck[],
): Promise<Array<{ domain: CorruptionDomain; from: number; to: number }>> {
  const advanced: Array<{ domain: CorruptionDomain; from: number; to: number }> = [];

  for (const check of checks) {
    if (!check.eligible) continue;

    const result = await advanceCorruption(userId, check.domain);

    await logCorruptionEvent(userId, check.domain, 'maintenance', result.new_level, {
      from_level: check.currentLevel,
      to_level: result.new_level,
      cascade_bonus: check.cascadeBonus,
      days_at_previous_level: check.daysAtLevel,
      milestones_met: check.milestonesMet,
    });

    // Log to handler_decisions for audit trail
    await supabase.from('handler_decisions').insert({
      user_id: userId,
      decision_type: 'corruption_advancement',
      decision_data: {
        domain: check.domain,
        from_level: check.currentLevel,
        to_level: result.new_level,
        milestones: check.milestonesMet,
      },
      reasoning: `Domain ${check.domain} met all criteria for level ${result.new_level}`,
      executed: true,
    }).then(() => {}, () => {}); // fire-and-forget

    advanced.push({
      domain: check.domain,
      from: check.currentLevel,
      to: result.new_level,
    });
  }

  return advanced;
}

// ============================================
// DAILY MAINTENANCE ORCHESTRATOR
// ============================================

/**
 * Run daily corruption maintenance. Idempotent per day.
 * Called from morning personalization flow.
 */
export async function dailyCorruptionMaintenance(
  userId: string,
): Promise<MaintenanceResult> {
  const today = new Date().toISOString().split('T')[0];

  // Idempotency check
  const { data: existing } = await supabase
    .from('corruption_maintenance_log')
    .select('id, checks_run, advancements, cascades, resumptions, notes')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (existing) {
    return {
      date: today,
      advancements: (existing.advancements as MaintenanceResult['advancements']) || [],
      cascades: (existing.cascades as CorruptionDomain[]) || [],
      resumptions: (existing.resumptions as CorruptionDomain[]) || [],
      notes: existing.notes ? [existing.notes] : ['Already ran today'],
    };
  }

  const notes: string[] = [];

  // 1. Check resumption timers
  let resumptions: CorruptionDomain[] = [];
  try {
    resumptions = await checkResumptionTimers(userId);
    if (resumptions.length > 0) {
      notes.push(`Resumed domains: ${resumptions.join(', ')}`);
    }
  } catch (err) {
    console.error('[Corruption] Resumption check failed:', err);
    notes.push('Resumption check failed');
  }

  // 2. Gather milestone data
  const milestoneData = await gatherMilestoneData(userId);

  // 3. Run advancement checks
  const checks = await runAdvancementChecks(userId, milestoneData);

  // 4. Process eligible advancements
  const eligibleChecks = checks.filter(c => c.eligible);
  const advancements = await processAdvancements(userId, eligibleChecks);
  if (advancements.length > 0) {
    notes.push(`Advanced: ${advancements.map(a => `${a.domain} ${a.from}→${a.to}`).join(', ')}`);
  }

  // 5. Apply cascade acceleration (runs after all advancements)
  let cascades: CorruptionDomain[] = [];
  try {
    cascades = await checkCascade(userId);
    if (cascades.length > 0) {
      notes.push(`Cascade bonuses: ${cascades.join(', ')}`);
    }
  } catch (err) {
    console.error('[Corruption] Cascade check failed:', err);
    notes.push('Cascade check failed');
  }

  // 6. Log to handler_decisions
  await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'corruption_maintenance',
    decision_data: {
      checks_summary: checks.map(c => ({
        domain: c.domain,
        level: c.currentLevel,
        eligible: c.eligible,
        blockers: c.blockers,
      })),
      advancements,
      cascades,
      resumptions,
    },
    reasoning: notes.join('; ') || 'Routine maintenance, no changes',
    executed: true,
  }).then(() => {}, () => {}); // fire-and-forget

  // 7. Write maintenance log for idempotency
  const result: MaintenanceResult = {
    date: today,
    advancements,
    cascades,
    resumptions,
    notes,
  };

  await supabase.from('corruption_maintenance_log').insert({
    user_id: userId,
    date: today,
    checks_run: checks.map(c => ({
      domain: c.domain,
      level: c.currentLevel,
      eligible: c.eligible,
      blockers: c.blockers.length,
    })),
    advancements,
    cascades,
    resumptions,
    notes: notes.join('; '),
  }).then(() => {}, () => {}); // fire-and-forget

  return result;
}
