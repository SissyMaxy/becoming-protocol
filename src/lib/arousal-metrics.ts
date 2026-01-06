// Arousal Metrics Computation

import { supabase } from './supabase';
import type {
  ArousalState,
  ArousalMetrics,
  ArousalStateEntry,
  OrgasmEntry,
  DenialStreak,
  DbArousalStateEntry,
  DbOrgasmEntry,
  DbDenialStreak,
  DbArousalMetrics,
} from '../types/arousal';

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

// ============================================
// MAPPERS
// ============================================

function mapDbToArousalState(db: DbArousalStateEntry): ArousalStateEntry {
  return {
    id: db.id,
    userId: db.user_id,
    date: db.date,
    state: db.state as ArousalState,
    arousalLevel: db.arousal_level,
    feminizationReceptivity: db.feminization_receptivity,
    achingIntensity: db.aching_intensity,
    edgeCount: db.edge_count,
    physicalSigns: db.physical_signs as ArousalStateEntry['physicalSigns'],
    notes: db.notes || undefined,
    loggedAt: db.logged_at,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function mapDbToOrgasm(db: DbOrgasmEntry): OrgasmEntry {
  return {
    id: db.id,
    userId: db.user_id,
    occurredAt: db.occurred_at,
    releaseType: db.release_type as OrgasmEntry['releaseType'],
    context: db.context as OrgasmEntry['context'],
    planned: db.planned,
    stateBefore: db.state_before as ArousalState | undefined,
    daysSinceLast: db.days_since_last || undefined,
    intensity: db.intensity || undefined,
    satisfaction: db.satisfaction || undefined,
    regretLevel: db.regret_level || undefined,
    trigger: db.trigger || undefined,
    notes: db.notes || undefined,
    partnerInitiated: db.partner_initiated,
    partnerControlled: db.partner_controlled,
    partnerAware: db.partner_aware,
    createdAt: db.created_at,
  };
}

function mapDbToStreak(db: DbDenialStreak): DenialStreak {
  return {
    id: db.id,
    userId: db.user_id,
    startedAt: db.started_at,
    endedAt: db.ended_at || undefined,
    endedBy: db.ended_by as DenialStreak['endedBy'],
    endingOrgasmId: db.ending_orgasm_id || undefined,
    daysCompleted: db.days_completed || undefined,
    edgesDuring: db.edges_during,
    prostateOrgasmsDuring: db.prostate_orgasms_during,
    sweetSpotDays: db.sweet_spot_days,
    isPersonalRecord: db.is_personal_record,
    notes: db.notes || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

// ============================================
// METRICS COMPUTATION
// ============================================

/**
 * Compute all arousal metrics for a user
 */
export async function computeArousalMetrics(userId: string): Promise<ArousalMetrics> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Fetch data in parallel
  const [statesResult, orgasmsResult, currentStreakResult, longestStreakResult] = await Promise.all([
    supabase
      .from('arousal_states')
      .select('*')
      .eq('user_id', userId)
      .gte('date', ninetyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false }),

    supabase
      .from('orgasm_log')
      .select('*')
      .eq('user_id', userId)
      .gte('occurred_at', ninetyDaysAgo.toISOString())
      .order('occurred_at', { ascending: false }),

    supabase
      .from('denial_streaks')
      .select('*')
      .eq('user_id', userId)
      .is('ended_at', null)
      .limit(1),

    supabase
      .from('denial_streaks')
      .select('days_completed')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('days_completed', { ascending: false })
      .limit(1),
  ]);

  const states = (statesResult.data || []) as DbArousalStateEntry[];
  const orgasms = (orgasmsResult.data || []) as DbOrgasmEntry[];
  const currentStreakData = currentStreakResult.data?.[0] as DbDenialStreak | undefined;
  const longestStreakData = longestStreakResult.data?.[0];

  // Current state and streak
  const currentState = (states[0]?.state || 'baseline') as ArousalState;
  const currentStreakDays = currentStreakData
    ? Math.floor((Date.now() - new Date(currentStreakData.started_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Calculate cycle lengths
  const cycleLengths = calculateCycleLengths(orgasms);
  const averageCycleLength = cycleLengths.length > 0
    ? cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length
    : 7;

  // Sweet spot analysis
  const sweetSpotEntryDays = analyzeSweetSpotEntry(states);
  const averageSweetSpotEntryDay = sweetSpotEntryDays.length > 0
    ? sweetSpotEntryDays.reduce((a, b) => a + b, 0) / sweetSpotEntryDays.length
    : 3;

  // Last 30 days analysis
  const thirtyDays = states.slice(0, 30);
  const sweetSpotPercentage = thirtyDays.length > 0
    ? (thirtyDays.filter(s => s.state === 'sweet_spot').length / thirtyDays.length) * 100
    : 0;
  const postReleasePercentage = thirtyDays.length > 0
    ? (thirtyDays.filter(s => s.state === 'post_release').length / thirtyDays.length) * 100
    : 0;

  // Optimal range
  const optimalMinDays = Math.max(3, Math.floor(averageSweetSpotEntryDay));
  const optimalMaxDays = Math.min(14, Math.floor(averageCycleLength * 1.5));

  // Slip rate calculation
  const slipRate = calculateSlipRate(orgasms);

  // Days in current state
  const daysInCurrentState = calculateDaysInState(states, currentState);

  // Longest streak
  const longestStreak = longestStreakData?.days_completed || currentStreakDays;

  const metrics: ArousalMetrics = {
    userId,
    currentStreakDays,
    currentState,
    daysInCurrentState,
    averageCycleLength,
    averageSweetSpotEntryDay,
    averageOverloadDay: optimalMaxDays,
    sweetSpotPercentage,
    postReleasePercentage,
    optimalMinDays,
    optimalMaxDays,
    slipRate,
    averageDaysToSlip: averageCycleLength * 0.8,
    highRiskContexts: identifyHighRiskContexts(orgasms),
    longestStreak,
    longestSweetSpotStreak: 0, // Would need more complex calculation
    arousalPracticeCorrelation: 0.7, // Placeholder - would need practice data
    lastComputedAt: new Date().toISOString(),
  };

  // Cache the metrics
  await cacheMetrics(userId, metrics);

  return metrics;
}

/**
 * Get cached metrics or compute fresh
 */
export async function getCachedOrComputeMetrics(userId: string): Promise<ArousalMetrics> {
  // Always fetch current streak to calculate live streak days
  const { data: streakRows } = await supabase
    .from('denial_streaks')
    .select('started_at')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1);

  const currentStreakData = streakRows?.[0];

  const liveStreakDays = currentStreakData
    ? Math.floor((Date.now() - new Date(currentStreakData.started_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const { data: cached } = await supabase
    .from('arousal_metrics')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (cached) {
    const cachedTime = new Date(cached.last_computed_at).getTime();
    const hourAgo = Date.now() - (60 * 60 * 1000);

    // Return cached if less than an hour old, but with live streak days
    if (cachedTime > hourAgo) {
      const metrics = mapDbToMetrics(cached as DbArousalMetrics);
      metrics.currentStreakDays = liveStreakDays;
      return metrics;
    }
  }

  return computeArousalMetrics(userId);
}

function mapDbToMetrics(db: DbArousalMetrics): ArousalMetrics {
  return {
    userId: db.user_id,
    currentStreakDays: db.current_streak_days,
    currentState: (db.current_state || 'baseline') as ArousalState,
    daysInCurrentState: db.days_in_current_state,
    averageCycleLength: db.average_cycle_length || 7,
    averageSweetSpotEntryDay: db.average_sweet_spot_entry_day || 3,
    averageOverloadDay: db.average_overload_day || 10,
    sweetSpotPercentage: db.sweet_spot_percentage || 0,
    postReleasePercentage: db.post_release_percentage || 0,
    optimalMinDays: db.optimal_min_days || 3,
    optimalMaxDays: db.optimal_max_days || 10,
    slipRate: db.slip_rate || 0,
    averageDaysToSlip: db.average_days_to_slip || 7,
    highRiskContexts: db.high_risk_contexts || [],
    longestStreak: db.longest_streak,
    longestSweetSpotStreak: db.longest_sweet_spot_streak,
    arousalPracticeCorrelation: db.arousal_practice_correlation || 0,
    lastComputedAt: db.last_computed_at,
  };
}

async function cacheMetrics(userId: string, metrics: ArousalMetrics): Promise<void> {
  await supabase.from('arousal_metrics').upsert({
    user_id: userId,
    current_streak_days: metrics.currentStreakDays,
    current_state: metrics.currentState,
    days_in_current_state: metrics.daysInCurrentState,
    average_cycle_length: metrics.averageCycleLength,
    average_sweet_spot_entry_day: metrics.averageSweetSpotEntryDay,
    average_overload_day: metrics.averageOverloadDay,
    sweet_spot_percentage: metrics.sweetSpotPercentage,
    post_release_percentage: metrics.postReleasePercentage,
    optimal_min_days: metrics.optimalMinDays,
    optimal_max_days: metrics.optimalMaxDays,
    slip_rate: metrics.slipRate,
    average_days_to_slip: metrics.averageDaysToSlip,
    high_risk_contexts: metrics.highRiskContexts,
    longest_streak: metrics.longestStreak,
    longest_sweet_spot_streak: metrics.longestSweetSpotStreak,
    arousal_practice_correlation: metrics.arousalPracticeCorrelation,
    last_computed_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

// ============================================
// ANALYSIS HELPERS
// ============================================

function calculateCycleLengths(orgasms: DbOrgasmEntry[]): number[] {
  // Only count full resets (not prostate/sissygasm)
  const resetOrgasms = orgasms.filter(o =>
    ['full', 'ruined', 'accident', 'wet_dream'].includes(o.release_type)
  );

  if (resetOrgasms.length < 2) return [];

  const lengths: number[] = [];
  for (let i = 1; i < resetOrgasms.length; i++) {
    const daysDiff = Math.floor(
      (new Date(resetOrgasms[i - 1].occurred_at).getTime() -
        new Date(resetOrgasms[i].occurred_at).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysDiff > 0 && daysDiff < 60) {
      lengths.push(daysDiff);
    }
  }

  return lengths;
}

function analyzeSweetSpotEntry(states: DbArousalStateEntry[]): number[] {
  const entryDays: number[] = [];
  let lastReleaseDate: string | null = null;

  // Walk through states in chronological order
  const chronological = [...states].reverse();

  for (const state of chronological) {
    if (state.state === 'post_release') {
      lastReleaseDate = state.date;
    } else if (state.state === 'sweet_spot' && lastReleaseDate) {
      const days = Math.floor(
        (new Date(state.date).getTime() - new Date(lastReleaseDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      if (days > 0 && days < 14) {
        entryDays.push(days);
      }
    }
  }

  return entryDays;
}

function calculateDaysInState(states: DbArousalStateEntry[], currentState: string): number {
  let days = 0;
  for (const state of states) {
    if (state.state === currentState) {
      days++;
    } else {
      break;
    }
  }
  return days;
}

function calculateSlipRate(orgasms: DbOrgasmEntry[]): number {
  const accidentCount = orgasms.filter(o => o.release_type === 'accident').length;
  const totalCount = orgasms.filter(o =>
    ['full', 'ruined', 'accident', 'wet_dream'].includes(o.release_type)
  ).length;

  if (totalCount === 0) return 0;
  return (accidentCount / totalCount) * 100;
}

function identifyHighRiskContexts(orgasms: DbOrgasmEntry[]): string[] {
  const contextCounts: Record<string, number> = {};
  const accidentOrgasms = orgasms.filter(o => o.release_type === 'accident');

  for (const o of accidentOrgasms) {
    contextCounts[o.context] = (contextCounts[o.context] || 0) + 1;
  }

  // Return contexts with 2+ accidents
  return Object.entries(contextCounts)
    .filter(([_, count]) => count >= 2)
    .map(([context]) => context);
}

// ============================================
// STATE TRACKING
// ============================================

/**
 * Get today's arousal state entry
 */
export async function getTodayArousalState(): Promise<ArousalStateEntry | null> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('arousal_states')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  return mapDbToArousalState(data[0] as DbArousalStateEntry);
}

/**
 * Get recent arousal states (last N days)
 */
export async function getRecentArousalStates(days = 30): Promise<ArousalStateEntry[]> {
  const userId = await getAuthUserId();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('arousal_states')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false });

  if (error) {
    console.error('Failed to get arousal states:', error);
    return [];
  }

  return (data as DbArousalStateEntry[]).map(mapDbToArousalState);
}

/**
 * Get current active streak
 */
export async function getCurrentStreak(): Promise<DenialStreak | null> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('denial_streaks')
    .select('*')
    .eq('user_id', userId)
    .is('ended_at', null)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  return mapDbToStreak(data[0] as DbDenialStreak);
}

/**
 * Get recent orgasm entries
 */
export async function getRecentOrgasms(limit = 20): Promise<OrgasmEntry[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('orgasm_log')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get orgasms:', error);
    return [];
  }

  return (data as DbOrgasmEntry[]).map(mapDbToOrgasm);
}

/**
 * Get streak history
 */
export async function getStreakHistory(limit = 10): Promise<DenialStreak[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('denial_streaks')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get streaks:', error);
    return [];
  }

  return (data as DbDenialStreak[]).map(mapDbToStreak);
}
