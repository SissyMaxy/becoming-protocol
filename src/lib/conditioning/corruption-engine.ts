/**
 * Corruption Activation Engine
 *
 * Evaluates corruption advancement from conditioning, trance, compliance,
 * and identity data. Wires the corruption system to active Handler-driven
 * progression signals rather than just daily milestone checks.
 *
 * Handler-internal — never surfaces to user.
 */

import { supabase } from '../supabase';
import {
  getCorruptionSnapshot,
  incrementAdvancementScore,
  logCorruptionEvent,
  advanceCorruption,
  getAdvancementCriteria,
} from '../corruption';
import type {
  CorruptionDomain,
} from '../../types/corruption';

// ============================================
// TYPES
// ============================================

export interface CorruptionEvaluation {
  rawScore: number;        // 0-100 computed from inputs
  currentComposite: number; // 0-100 from domain levels
  delta: number;           // difference
  factors: CorruptionFactor[];
  recommendedAdvancements: CorruptionDomain[];
}

export interface CorruptionFactor {
  name: string;
  weight: number;
  value: number;       // 0-1 normalized
  rawValue: number;    // original value
  contribution: number; // weight * value
}

export interface CorruptionMilestoneStatus {
  domain: CorruptionDomain;
  currentLevel: number;
  nextLevel: number | null;
  daysAtLevel: number;
  minimumDays: number;
  reached: boolean;
  description: string;
}

export interface CorruptionContext {
  score: number;
  recentAdvancement: string | null;
  milestonesReached: string[];
  nextMilestone: string | null;
  factors: string;
}

// ============================================
// FACTOR WEIGHTS
// ============================================

const WEIGHTS = {
  conditioningSessions: 0.20,
  tranceDepth: 0.20,
  triggerResponsiveness: 0.12,
  complianceRate: 0.12,
  identityMilestones: 0.10,
  contentPermanence: 0.08,
  denialStreak: 0.08,
  sleepConditioning: 0.05,
  camSessions: 0.05,
} as const;

// ============================================
// EVALUATE CORRUPTION ADVANCEMENT
// ============================================

/**
 * Query multiple data sources and compute a corruption progression score.
 * Returns detailed factor breakdown and recommendations.
 */
export async function evaluateCorruptionAdvancement(
  userId: string,
): Promise<CorruptionEvaluation> {
  const [
    snapshot,
    sessionsResult,
    tranceResult,
    triggerResult,
    tasksResult,
    userStateResult,
    contentResult,
    sleepResult,
    camResult,
    languageResult,
  ] = await Promise.allSettled([
    getCorruptionSnapshot(userId),
    // Conditioning sessions completed (last 90 days)
    supabase
      .from('conditioning_sessions_v2')
      .select('id, session_type, trance_depth_avg, status', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('started_at', new Date(Date.now() - 90 * 86400000).toISOString()),
    // Trance progression records
    supabase
      .from('trance_progression')
      .select('peak_depth, sustained_depth_minutes, trigger_tests')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(30),
    // Post-hypnotic trigger tracking
    supabase
      .from('post_hypnotic_tracking')
      .select('activation_confirmed, activation_expected_at, delivered_at')
      .eq('user_id', userId)
      .eq('activation_confirmed', true),
    // Daily tasks for compliance
    supabase
      .from('daily_tasks')
      .select('status')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    // User state for denial streak
    supabase
      .from('user_state')
      .select('streak_days, denial_day')
      .eq('user_id', userId)
      .maybeSingle(),
    // Content library for permanence
    supabase
      .from('content_library')
      .select('id', { count: 'exact' })
      .eq('user_id', userId),
    // Sleep sessions
    supabase
      .from('sleep_sessions')
      .select('mode_compliant, completed_naturally, affirmations_spoken')
      .eq('user_id', userId)
      .gte('started_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    // Cam sessions
    supabase
      .from('cam_sessions')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'ended'),
    // Language tracking
    supabase
      .from('language_tracking')
      .select('feminine_ratio')
      .eq('user_id', userId)
      .gte('date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
      .order('date', { ascending: false }),
  ]);

  const currentSnapshot = sessionsResult.status === 'fulfilled'
    ? (snapshot.status === 'fulfilled' ? snapshot.value : null)
    : null;

  const factors: CorruptionFactor[] = [];

  // 1. Conditioning sessions (0-50+ sessions mapped to 0-1)
  const sessionCount = sessionsResult.status === 'fulfilled'
    ? (sessionsResult.value.count ?? 0)
    : 0;
  const sessionScore = Math.min(1, sessionCount / 50);
  factors.push({
    name: 'conditioning_sessions',
    weight: WEIGHTS.conditioningSessions,
    value: sessionScore,
    rawValue: sessionCount,
    contribution: WEIGHTS.conditioningSessions * sessionScore,
  });

  // 2. Trance depth (avg peak_depth, 0-10 mapped to 0-1)
  const tranceRows = tranceResult.status === 'fulfilled'
    ? (tranceResult.value.data ?? [])
    : [];
  const avgTranceDepth = tranceRows.length > 0
    ? tranceRows.reduce((sum: number, r: Record<string, unknown>) =>
        sum + ((r.peak_depth as number) ?? 0), 0) / tranceRows.length
    : 0;
  const tranceScore = Math.min(1, avgTranceDepth / 10);
  factors.push({
    name: 'trance_depth',
    weight: WEIGHTS.tranceDepth,
    value: tranceScore,
    rawValue: avgTranceDepth,
    contribution: WEIGHTS.tranceDepth * tranceScore,
  });

  // 3. Trigger responsiveness (confirmed activations / total delivered)
  const triggerRows = triggerResult.status === 'fulfilled'
    ? (triggerResult.value.data ?? [])
    : [];
  const triggerCount = triggerRows.length;
  const triggerScore = Math.min(1, triggerCount / 20);
  factors.push({
    name: 'trigger_responsiveness',
    weight: WEIGHTS.triggerResponsiveness,
    value: triggerScore,
    rawValue: triggerCount,
    contribution: WEIGHTS.triggerResponsiveness * triggerScore,
  });

  // 4. Compliance rate (completed / total tasks)
  const taskRows = tasksResult.status === 'fulfilled'
    ? (tasksResult.value.data ?? [])
    : [];
  const totalTasks = taskRows.length;
  const completedTasks = taskRows.filter(
    (t: Record<string, unknown>) => t.status === 'completed',
  ).length;
  const complianceRate = totalTasks > 0 ? completedTasks / totalTasks : 0;
  factors.push({
    name: 'compliance_rate',
    weight: WEIGHTS.complianceRate,
    value: complianceRate,
    rawValue: complianceRate,
    contribution: WEIGHTS.complianceRate * complianceRate,
  });

  // 5. Identity milestones (feminine ratio + name adoption)
  const langRows = languageResult.status === 'fulfilled'
    ? (languageResult.value.data ?? [])
    : [];
  const avgFemRatio = langRows.length > 0
    ? langRows.reduce((sum: number, r: Record<string, unknown>) =>
        sum + ((r.feminine_ratio as number) ?? 0), 0) / langRows.length
    : 0;
  factors.push({
    name: 'identity_milestones',
    weight: WEIGHTS.identityMilestones,
    value: avgFemRatio,
    rawValue: avgFemRatio,
    contribution: WEIGHTS.identityMilestones * avgFemRatio,
  });

  // 6. Content permanence (public content pieces, 0-30 mapped to 0-1)
  const contentCount = contentResult.status === 'fulfilled'
    ? (contentResult.value.count ?? 0)
    : 0;
  const contentScore = Math.min(1, contentCount / 30);
  factors.push({
    name: 'content_permanence',
    weight: WEIGHTS.contentPermanence,
    value: contentScore,
    rawValue: contentCount,
    contribution: WEIGHTS.contentPermanence * contentScore,
  });

  // 7. Denial streak
  const denialDay = userStateResult.status === 'fulfilled'
    ? ((userStateResult.value.data as Record<string, unknown> | null)?.denial_day as number ?? 0)
    : 0;
  const denialScore = Math.min(1, denialDay / 30);
  factors.push({
    name: 'denial_streak',
    weight: WEIGHTS.denialStreak,
    value: denialScore,
    rawValue: denialDay,
    contribution: WEIGHTS.denialStreak * denialScore,
  });

  // 8. Sleep conditioning (compliant sessions / total, last 30d)
  const sleepRows = sleepResult.status === 'fulfilled'
    ? (sleepResult.value.data ?? [])
    : [];
  const sleepCompliant = sleepRows.filter(
    (s: Record<string, unknown>) => s.mode_compliant,
  ).length;
  const sleepRate = sleepRows.length > 0 ? sleepCompliant / sleepRows.length : 0;
  factors.push({
    name: 'sleep_conditioning',
    weight: WEIGHTS.sleepConditioning,
    value: sleepRate,
    rawValue: sleepCompliant,
    contribution: WEIGHTS.sleepConditioning * sleepRate,
  });

  // 9. Cam sessions (0-20 mapped to 0-1)
  const camCount = camResult.status === 'fulfilled'
    ? (camResult.value.count ?? 0)
    : 0;
  const camScore = Math.min(1, camCount / 20);
  factors.push({
    name: 'cam_sessions',
    weight: WEIGHTS.camSessions,
    value: camScore,
    rawValue: camCount,
    contribution: WEIGHTS.camSessions * camScore,
  });

  // Compute raw score (0-100)
  const rawScore = Math.round(
    factors.reduce((sum, f) => sum + f.contribution, 0) * 100,
  );

  const currentComposite = currentSnapshot?.composite_score ?? 0;

  // Determine which domains could advance
  const recommendedAdvancements: CorruptionDomain[] = [];
  if (currentSnapshot && rawScore > currentComposite + 5) {
    for (const state of currentSnapshot.states) {
      if (state.is_suspended || state.current_level >= 5) continue;
      const days = currentSnapshot.days_at_current_levels[state.domain];
      const criteria = await getAdvancementCriteria(state.domain, state.current_level);
      if (criteria && days >= criteria.minimum_days) {
        recommendedAdvancements.push(state.domain);
      }
    }
  }

  return {
    rawScore,
    currentComposite,
    delta: rawScore - currentComposite,
    factors,
    recommendedAdvancements,
  };
}

// ============================================
// ADVANCE CORRUPTION
// ============================================

/**
 * Update corruption state, log events, check milestone triggers.
 * Distributes advancement points across relevant domains based on the
 * evaluation factors.
 */
export async function advanceCorruptionFromEvaluation(
  userId: string,
  evaluation: CorruptionEvaluation,
): Promise<Array<{ domain: CorruptionDomain; from: number; to: number }>> {
  const advanced: Array<{ domain: CorruptionDomain; from: number; to: number }> = [];

  if (evaluation.delta <= 0) return advanced;

  // Distribute points to domains that are ready
  const snapshot = await getCorruptionSnapshot(userId);

  // Map factors to domains for targeted point distribution
  const domainFactorMap: Partial<Record<CorruptionDomain, string[]>> = {
    identity_language: ['identity_milestones', 'compliance_rate'],
    autonomy: ['compliance_rate', 'trigger_responsiveness'],
    content: ['content_permanence', 'cam_sessions'],
    privacy: ['content_permanence'],
    gina: ['sleep_conditioning'],
    financial: ['cam_sessions', 'content_permanence'],
    therapist: ['compliance_rate'],
  };

  for (const state of snapshot.states) {
    if (state.is_suspended || state.current_level >= 5) continue;

    const relevantFactors = domainFactorMap[state.domain] ?? [];
    const domainContribution = evaluation.factors
      .filter(f => relevantFactors.includes(f.name))
      .reduce((sum, f) => sum + f.contribution, 0);

    // Add conditioning/trance contribution to all domains (they're the heaviest weights)
    const conditioningContribution = evaluation.factors
      .filter(f => f.name === 'conditioning_sessions' || f.name === 'trance_depth')
      .reduce((sum, f) => sum + f.contribution, 0);

    const totalContribution = domainContribution + conditioningContribution * 0.3;
    const points = Math.round(totalContribution * 20); // Scale to advancement points

    if (points > 0) {
      await incrementAdvancementScore(userId, state.domain, points);

      await logCorruptionEvent(userId, state.domain, 'advancement', state.current_level, {
        source: 'corruption_engine',
        points_added: points,
        raw_score: evaluation.rawScore,
        factors: evaluation.factors.map(f => ({ name: f.name, value: f.value })),
      });
    }

    // Check if this domain should advance
    if (evaluation.recommendedAdvancements.includes(state.domain)) {
      const result = await advanceCorruption(userId, state.domain);
      if (result.new_level > state.current_level) {
        advanced.push({
          domain: state.domain,
          from: state.current_level,
          to: result.new_level,
        });
      }
    }
  }

  return advanced;
}

// ============================================
// GET CORRUPTION MILESTONES
// ============================================

/**
 * List all milestones — reached and upcoming — across all domains.
 */
export async function getCorruptionMilestones(
  userId: string,
): Promise<CorruptionMilestoneStatus[]> {
  const snapshot = await getCorruptionSnapshot(userId);
  const milestones: CorruptionMilestoneStatus[] = [];

  const LEVEL_DESCRIPTIONS: Record<number, string> = {
    0: 'Uninitiated',
    1: 'Exposed',
    2: 'Accepting',
    3: 'Dependent',
    4: 'Embedded',
    5: 'Irreversible',
  };

  for (const state of snapshot.states) {
    const criteria = state.current_level < 5
      ? await getAdvancementCriteria(state.domain, state.current_level)
      : null;

    milestones.push({
      domain: state.domain,
      currentLevel: state.current_level,
      nextLevel: state.current_level < 5 ? state.current_level + 1 : null,
      daysAtLevel: snapshot.days_at_current_levels[state.domain],
      minimumDays: criteria?.minimum_days ?? 0,
      reached: state.current_level > 0,
      description: LEVEL_DESCRIPTIONS[state.current_level] ?? 'Unknown',
    });
  }

  return milestones;
}

// ============================================
// BUILD CORRUPTION CONTEXT (for Handler AI)
// ============================================

/**
 * Build a compact context block showing corruption state for Handler prompts.
 */
export async function buildCorruptionActivationContext(
  userId: string,
): Promise<string> {
  try {
    const [snapshot, evaluation, milestones, recentEventsResult] =
      await Promise.allSettled([
        getCorruptionSnapshot(userId),
        evaluateCorruptionAdvancement(userId),
        getCorruptionMilestones(userId),
        supabase
          .from('corruption_events')
          .select('domain, event_type, corruption_level_at_event, created_at')
          .eq('user_id', userId)
          .eq('event_type', 'advancement')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

    const snap = snapshot.status === 'fulfilled' ? snapshot.value : null;
    const eval_ = evaluation.status === 'fulfilled' ? evaluation.value : null;
    const miles = milestones.status === 'fulfilled' ? milestones.value : [];
    const recentEvents = recentEventsResult.status === 'fulfilled'
      ? (recentEventsResult.value.data ?? [])
      : [];

    if (!snap) return '';

    const parts: string[] = [];

    // Score summary
    parts.push(
      `CORRUPTION ENGINE: composite ${snap.composite_score}/100` +
      (eval_ ? `, eval ${eval_.rawScore}/100, delta ${eval_.delta > 0 ? '+' : ''}${eval_.delta}` : '') +
      (snap.all_suspended ? ' [SUSPENDED]' : ''),
    );

    // Domain levels (compact)
    const levelStrs = snap.states.map(
      s => `${s.domain}:L${s.current_level}${s.is_suspended ? '*' : ''}`,
    );
    parts.push(`  levels: ${levelStrs.join(', ')}`);

    // Top factors driving corruption
    if (eval_ && eval_.factors.length > 0) {
      const top3 = [...eval_.factors]
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 3);
      const factorStrs = top3.map(
        f => `${f.name}=${(f.value * 100).toFixed(0)}%`,
      );
      parts.push(`  top factors: ${factorStrs.join(', ')}`);
    }

    // Recent advancements
    if (recentEvents.length > 0) {
      const last = recentEvents[0];
      const daysAgo = Math.floor(
        (Date.now() - new Date(last.created_at).getTime()) / 86400000,
      );
      parts.push(
        `  last advancement: ${last.domain} to L${last.corruption_level_at_event} (${daysAgo}d ago)`,
      );
    }

    // Next milestones
    const upcoming = miles
      .filter(m => m.nextLevel !== null && !snap.all_suspended)
      .sort((a, b) => {
        // Closest to meeting minimum days first
        const aRemaining = Math.max(0, a.minimumDays - a.daysAtLevel);
        const bRemaining = Math.max(0, b.minimumDays - b.daysAtLevel);
        return aRemaining - bRemaining;
      })
      .slice(0, 2);

    if (upcoming.length > 0) {
      const nextStrs = upcoming.map(m => {
        const daysLeft = Math.max(0, m.minimumDays - m.daysAtLevel);
        return `${m.domain} L${m.currentLevel}->L${m.nextLevel}` +
          (daysLeft > 0 ? ` (${daysLeft}d min)` : ' (eligible)');
      });
      parts.push(`  next: ${nextStrs.join(', ')}`);
    }

    // Recommendations
    if (eval_ && eval_.recommendedAdvancements.length > 0) {
      parts.push(`  READY TO ADVANCE: ${eval_.recommendedAdvancements.join(', ')}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
