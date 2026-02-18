/**
 * Service Analytics
 *
 * Comprehensive analytics for service progression and encounters.
 * Tracks patterns, comfort growth, and provides actionable insights.
 */

import { supabase } from './supabase';
import type {
  ServiceStage,
  ServiceEncounter,
  ServiceProgression,
  EncounterType,
} from '../types/escalation';

// ============================================
// TYPES
// ============================================

export interface ServiceAnalytics {
  overview: ServiceOverview;
  stageProgress: StageProgressAnalysis;
  encounterAnalysis: EncounterAnalysis;
  comfortGrowth: ComfortGrowthAnalysis;
  activityPatterns: ActivityPatterns;
  trends: ServiceTrends;
  recommendations: ServiceRecommendation[];
}

export interface ServiceOverview {
  currentStage: ServiceStage;
  stageNumber: number; // 1-7
  totalEncounters: number;
  ginaAwareEncounters: number;
  ginaDirectedEncounters: number;
  daysSinceStageAdvance: number;
  activitiesLoggedThisStage: number;
  currentComfortLevel: number;
  currentArousalAssociation: number;
  timeInProtocol: number; // days since first progression
}

export interface StageProgressAnalysis {
  stagesCompleted: number;
  totalStages: number;
  progressPercentage: number;
  averageDaysPerStage: number;
  stageHistory: StageHistoryEntry[];
  currentStageReadiness: StageReadiness;
}

export interface StageHistoryEntry {
  stage: ServiceStage;
  enteredAt: string;
  daysInStage: number;
  activitiesCompleted: number;
  exitComfortLevel?: number;
  exitArousalAssociation?: number;
}

export interface StageReadiness {
  isReady: boolean;
  comfortThreshold: number;
  arousalThreshold: number;
  minimumActivities: number;
  currentComfort: number;
  currentArousal: number;
  currentActivities: number;
  blockers: string[];
  recommendation: string;
}

export interface EncounterAnalysis {
  totalEncounters: number;
  encountersByType: Record<EncounterType, number>;
  encountersByMonth: MonthlyEncounters[];
  averageArousalLevel: number;
  ginaInvolvement: {
    aware: number;
    directed: number;
    percentage: number;
  };
  topActivities: ActivityCount[];
  psychologicalImpacts: ImpactCount[];
  escalationEffects: EffectCount[];
}

export interface MonthlyEncounters {
  month: string;
  count: number;
  byType: Record<EncounterType, number>;
}

export interface ActivityCount {
  activity: string;
  count: number;
}

export interface ImpactCount {
  impact: string;
  count: number;
}

export interface EffectCount {
  effect: string;
  count: number;
}

export interface ComfortGrowthAnalysis {
  startingComfort: number;
  currentComfort: number;
  growthRate: number; // % improvement
  comfortOverTime: ComfortDataPoint[];
  arousalCorrelation: number; // -1 to 1
  comfortByEncounterType: Record<EncounterType, number>;
  breakthroughMoments: BreakthroughMoment[];
}

export interface ComfortDataPoint {
  date: string;
  comfort: number;
  arousalAssociation: number;
  stage: ServiceStage;
}

export interface BreakthroughMoment {
  date: string;
  description: string;
  comfortJump: number;
  triggerActivity?: string;
}

export interface ActivityPatterns {
  mostFrequentActivities: ActivityCount[];
  activitiesByStage: Record<ServiceStage, string[]>;
  activityProgression: string[]; // ordered by first occurrence
  newActivitiesThisMonth: string[];
  activityVelocity: number; // new activities per month
}

export interface ServiceTrends {
  encounterFrequency: 'increasing' | 'stable' | 'decreasing';
  comfortTrend: 'improving' | 'stable' | 'declining';
  ginaInvolvementTrend: 'increasing' | 'stable' | 'decreasing';
  stageVelocity: 'accelerating' | 'steady' | 'slowing';
  weeklyActivityAverage: number;
  monthlyEncounterAverage: number;
}

export interface ServiceRecommendation {
  type: 'stage' | 'comfort' | 'activity' | 'gina' | 'encounter' | 'mindset';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionable?: string;
}

// ============================================
// MAIN ANALYTICS FUNCTION
// ============================================

const SERVICE_STAGE_LIST: ServiceStage[] = [
  'fantasy',
  'content_consumption',
  'online_interaction',
  'first_encounter',
  'regular_service',
  'organized_availability',
  'gina_directed',
];

export async function getServiceAnalytics(userId: string): Promise<ServiceAnalytics | null> {
  // Fetch progressions
  const { data: progressions, error: progError } = await supabase
    .from('service_progression')
    .select('*')
    .eq('user_id', userId)
    .order('entered_at', { ascending: true });

  if (progError) {
    console.error('Failed to fetch progressions:', progError);
    return null;
  }

  // Fetch encounters
  const { data: encounters, error: encError } = await supabase
    .from('service_encounters')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (encError) {
    console.error('Failed to fetch encounters:', encError);
    return null;
  }

  const mappedProgressions: ServiceProgression[] = (progressions || []).map(p => ({
    id: p.id,
    userId: p.user_id,
    stage: p.stage as ServiceStage,
    enteredAt: p.entered_at,
    activities: p.activities || [],
    comfortLevel: p.comfort_level,
    arousalAssociation: p.arousal_association,
    notes: p.notes,
  }));

  const mappedEncounters: ServiceEncounter[] = (encounters || []).map(e => ({
    id: e.id,
    userId: e.user_id,
    encounterType: e.encounter_type as EncounterType,
    date: e.date,
    description: e.description,
    ginaAware: e.gina_aware,
    ginaDirected: e.gina_directed,
    activities: e.activities || [],
    psychologicalImpact: e.psychological_impact,
    escalationEffect: e.escalation_effect,
    arousalLevel: e.arousal_level,
  }));

  if (mappedProgressions.length === 0) {
    return createEmptyServiceAnalytics();
  }

  const currentProgression = mappedProgressions[mappedProgressions.length - 1];
  const overview = calculateOverview(mappedProgressions, mappedEncounters, currentProgression);
  const stageProgress = calculateStageProgress(mappedProgressions);
  const encounterAnalysis = calculateEncounterAnalysis(mappedEncounters);
  const comfortGrowth = calculateComfortGrowth(mappedProgressions, mappedEncounters);
  const activityPatterns = calculateActivityPatterns(mappedProgressions, mappedEncounters);
  const trends = calculateTrends(mappedProgressions, mappedEncounters);
  const recommendations = generateRecommendations(
    overview,
    stageProgress,
    encounterAnalysis,
    comfortGrowth,
    trends
  );

  return {
    overview,
    stageProgress,
    encounterAnalysis,
    comfortGrowth,
    activityPatterns,
    trends,
    recommendations,
  };
}

// ============================================
// OVERVIEW
// ============================================

function calculateOverview(
  progressions: ServiceProgression[],
  encounters: ServiceEncounter[],
  current: ServiceProgression
): ServiceOverview {
  const stageNumber = SERVICE_STAGE_LIST.indexOf(current.stage) + 1;
  const ginaAware = encounters.filter(e => e.ginaAware).length;
  const ginaDirected = encounters.filter(e => e.ginaDirected).length;

  const now = new Date();
  const stageEntered = new Date(current.enteredAt);
  const daysSinceAdvance = Math.floor((now.getTime() - stageEntered.getTime()) / (1000 * 60 * 60 * 24));

  const firstProgression = progressions[0];
  const protocolStart = new Date(firstProgression.enteredAt);
  const timeInProtocol = Math.floor((now.getTime() - protocolStart.getTime()) / (1000 * 60 * 60 * 24));

  return {
    currentStage: current.stage,
    stageNumber,
    totalEncounters: encounters.length,
    ginaAwareEncounters: ginaAware,
    ginaDirectedEncounters: ginaDirected,
    daysSinceStageAdvance: daysSinceAdvance,
    activitiesLoggedThisStage: current.activities.length,
    currentComfortLevel: current.comfortLevel || 1,
    currentArousalAssociation: current.arousalAssociation || 1,
    timeInProtocol,
  };
}

// ============================================
// STAGE PROGRESS
// ============================================

function calculateStageProgress(progressions: ServiceProgression[]): StageProgressAnalysis {
  const totalStages = SERVICE_STAGE_LIST.length;
  const stagesCompleted = Math.max(0, progressions.length - 1); // Current stage not "completed"

  const stageHistory: StageHistoryEntry[] = [];
  let totalDaysInStages = 0;

  for (let i = 0; i < progressions.length; i++) {
    const prog = progressions[i];
    const nextProg = progressions[i + 1];

    const enteredDate = new Date(prog.enteredAt);
    const exitDate = nextProg ? new Date(nextProg.enteredAt) : new Date();
    const daysInStage = Math.floor((exitDate.getTime() - enteredDate.getTime()) / (1000 * 60 * 60 * 24));

    if (nextProg) {
      totalDaysInStages += daysInStage;
    }

    stageHistory.push({
      stage: prog.stage,
      enteredAt: prog.enteredAt,
      daysInStage,
      activitiesCompleted: prog.activities.length,
      exitComfortLevel: nextProg ? prog.comfortLevel : undefined,
      exitArousalAssociation: nextProg ? prog.arousalAssociation : undefined,
    });
  }

  const averageDaysPerStage = stagesCompleted > 0
    ? Math.round(totalDaysInStages / stagesCompleted)
    : 0;

  const current = progressions[progressions.length - 1];
  const currentStageReadiness = calculateStageReadiness(current);

  return {
    stagesCompleted,
    totalStages,
    progressPercentage: Math.round((stagesCompleted / totalStages) * 100),
    averageDaysPerStage,
    stageHistory,
    currentStageReadiness,
  };
}

function calculateStageReadiness(current: ServiceProgression): StageReadiness {
  // Stage-specific thresholds
  const thresholds: Record<ServiceStage, { comfort: number; arousal: number; activities: number }> = {
    fantasy: { comfort: 5, arousal: 4, activities: 3 },
    content_consumption: { comfort: 6, arousal: 5, activities: 5 },
    online_interaction: { comfort: 6, arousal: 6, activities: 5 },
    first_encounter: { comfort: 7, arousal: 7, activities: 3 },
    regular_service: { comfort: 7, arousal: 8, activities: 5 },
    organized_availability: { comfort: 8, arousal: 8, activities: 5 },
    gina_directed: { comfort: 9, arousal: 9, activities: 5 }, // Final stage, high bar
  };

  const req = thresholds[current.stage];
  const comfort = current.comfortLevel || 1;
  const arousal = current.arousalAssociation || 1;
  const activities = current.activities.length;

  const blockers: string[] = [];
  if (comfort < req.comfort) {
    blockers.push(`Comfort level needs to reach ${req.comfort} (currently ${comfort})`);
  }
  if (arousal < req.arousal) {
    blockers.push(`Arousal association needs to reach ${req.arousal} (currently ${arousal})`);
  }
  if (activities < req.activities) {
    blockers.push(`Log at least ${req.activities} activities (currently ${activities})`);
  }

  const isReady = blockers.length === 0;

  let recommendation = '';
  if (isReady) {
    const currentIndex = SERVICE_STAGE_LIST.indexOf(current.stage);
    if (currentIndex < SERVICE_STAGE_LIST.length - 1) {
      recommendation = `Ready to advance to ${SERVICE_STAGE_LIST[currentIndex + 1].replace(/_/g, ' ')}`;
    } else {
      recommendation = 'You have reached the highest stage!';
    }
  } else {
    recommendation = blockers[0]; // Most important blocker first
  }

  return {
    isReady,
    comfortThreshold: req.comfort,
    arousalThreshold: req.arousal,
    minimumActivities: req.activities,
    currentComfort: comfort,
    currentArousal: arousal,
    currentActivities: activities,
    blockers,
    recommendation,
  };
}

// ============================================
// ENCOUNTER ANALYSIS
// ============================================

function calculateEncounterAnalysis(encounters: ServiceEncounter[]): EncounterAnalysis {
  const encountersByType: Record<EncounterType, number> = {
    online: 0,
    anonymous: 0,
    regular: 0,
    directed: 0,
  };

  const activityCounts: Record<string, number> = {};
  const impactCounts: Record<string, number> = {};
  const effectCounts: Record<string, number> = {};
  let totalArousal = 0;
  let arousalCount = 0;

  for (const enc of encounters) {
    encountersByType[enc.encounterType]++;

    for (const act of enc.activities) {
      activityCounts[act] = (activityCounts[act] || 0) + 1;
    }

    if (enc.psychologicalImpact) {
      impactCounts[enc.psychologicalImpact] = (impactCounts[enc.psychologicalImpact] || 0) + 1;
    }

    if (enc.escalationEffect) {
      effectCounts[enc.escalationEffect] = (effectCounts[enc.escalationEffect] || 0) + 1;
    }

    if (enc.arousalLevel) {
      totalArousal += enc.arousalLevel;
      arousalCount++;
    }
  }

  // Group by month
  const monthlyMap: Record<string, { count: number; byType: Record<EncounterType, number> }> = {};
  for (const enc of encounters) {
    const month = enc.date.substring(0, 7); // YYYY-MM
    if (!monthlyMap[month]) {
      monthlyMap[month] = { count: 0, byType: { online: 0, anonymous: 0, regular: 0, directed: 0 } };
    }
    monthlyMap[month].count++;
    monthlyMap[month].byType[enc.encounterType]++;
  }

  const encountersByMonth: MonthlyEncounters[] = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  const ginaAware = encounters.filter(e => e.ginaAware).length;
  const ginaDirected = encounters.filter(e => e.ginaDirected).length;

  const topActivities = Object.entries(activityCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([activity, count]) => ({ activity, count }));

  const psychologicalImpacts = Object.entries(impactCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([impact, count]) => ({ impact, count }));

  const escalationEffects = Object.entries(effectCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([effect, count]) => ({ effect, count }));

  return {
    totalEncounters: encounters.length,
    encountersByType,
    encountersByMonth,
    averageArousalLevel: arousalCount > 0 ? Math.round((totalArousal / arousalCount) * 10) / 10 : 0,
    ginaInvolvement: {
      aware: ginaAware,
      directed: ginaDirected,
      percentage: encounters.length > 0
        ? Math.round((ginaAware / encounters.length) * 100)
        : 0,
    },
    topActivities,
    psychologicalImpacts,
    escalationEffects,
  };
}

// ============================================
// COMFORT GROWTH
// ============================================

function calculateComfortGrowth(
  progressions: ServiceProgression[],
  encounters: ServiceEncounter[]
): ComfortGrowthAnalysis {
  const startingComfort = progressions[0]?.comfortLevel || 1;
  const currentComfort = progressions[progressions.length - 1]?.comfortLevel || 1;
  const growthRate = startingComfort > 0
    ? Math.round(((currentComfort - startingComfort) / startingComfort) * 100)
    : 0;

  const comfortOverTime: ComfortDataPoint[] = progressions.map(p => ({
    date: p.enteredAt.split('T')[0],
    comfort: p.comfortLevel || 1,
    arousalAssociation: p.arousalAssociation || 1,
    stage: p.stage,
  }));

  // Calculate arousal correlation
  const arousalCorrelation = calculateCorrelation(
    progressions.map(p => p.comfortLevel || 1),
    progressions.map(p => p.arousalAssociation || 1)
  );

  // Comfort by encounter type
  const typeComfort: Record<EncounterType, { total: number; count: number }> = {
    online: { total: 0, count: 0 },
    anonymous: { total: 0, count: 0 },
    regular: { total: 0, count: 0 },
    directed: { total: 0, count: 0 },
  };

  for (const enc of encounters) {
    if (enc.arousalLevel) {
      typeComfort[enc.encounterType].total += enc.arousalLevel;
      typeComfort[enc.encounterType].count++;
    }
  }

  const comfortByEncounterType: Record<EncounterType, number> = {
    online: typeComfort.online.count > 0 ? typeComfort.online.total / typeComfort.online.count : 0,
    anonymous: typeComfort.anonymous.count > 0 ? typeComfort.anonymous.total / typeComfort.anonymous.count : 0,
    regular: typeComfort.regular.count > 0 ? typeComfort.regular.total / typeComfort.regular.count : 0,
    directed: typeComfort.directed.count > 0 ? typeComfort.directed.total / typeComfort.directed.count : 0,
  };

  // Find breakthrough moments (comfort jumps of 2+ points)
  const breakthroughMoments: BreakthroughMoment[] = [];
  for (let i = 1; i < progressions.length; i++) {
    const prev = progressions[i - 1].comfortLevel || 1;
    const curr = progressions[i].comfortLevel || 1;
    const jump = curr - prev;

    if (jump >= 2) {
      breakthroughMoments.push({
        date: progressions[i].enteredAt.split('T')[0],
        description: `Comfort jumped from ${prev} to ${curr} entering ${progressions[i].stage}`,
        comfortJump: jump,
        triggerActivity: progressions[i - 1].activities[progressions[i - 1].activities.length - 1],
      });
    }
  }

  return {
    startingComfort,
    currentComfort,
    growthRate,
    comfortOverTime,
    arousalCorrelation: Math.round(arousalCorrelation * 100) / 100,
    comfortByEncounterType,
    breakthroughMoments,
  };
}

function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator !== 0 ? numerator / denominator : 0;
}

// ============================================
// ACTIVITY PATTERNS
// ============================================

function calculateActivityPatterns(
  progressions: ServiceProgression[],
  encounters: ServiceEncounter[]
): ActivityPatterns {
  // Collect all activities
  const allActivities: Array<{ activity: string; date: string }> = [];

  for (const prog of progressions) {
    for (const act of prog.activities) {
      allActivities.push({ activity: act, date: prog.enteredAt });
    }
  }

  for (const enc of encounters) {
    for (const act of enc.activities) {
      allActivities.push({ activity: act, date: enc.date });
    }
  }

  // Count activities
  const activityCounts: Record<string, number> = {};
  for (const { activity } of allActivities) {
    activityCounts[activity] = (activityCounts[activity] || 0) + 1;
  }

  const mostFrequentActivities = Object.entries(activityCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([activity, count]) => ({ activity, count }));

  // Activities by stage
  const activitiesByStage: Record<ServiceStage, string[]> = {
    fantasy: [],
    content_consumption: [],
    online_interaction: [],
    first_encounter: [],
    regular_service: [],
    organized_availability: [],
    gina_directed: [],
  };

  for (const prog of progressions) {
    const unique = new Set([...activitiesByStage[prog.stage], ...prog.activities]);
    activitiesByStage[prog.stage] = Array.from(unique);
  }

  // Activity progression (first occurrence order)
  const activityFirstSeen: Record<string, string> = {};
  for (const { activity, date } of allActivities) {
    if (!activityFirstSeen[activity] || date < activityFirstSeen[activity]) {
      activityFirstSeen[activity] = date;
    }
  }

  const activityProgression = Object.entries(activityFirstSeen)
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([activity]) => activity);

  // New activities this month
  const thisMonth = new Date().toISOString().substring(0, 7);
  const newActivitiesThisMonth = Object.entries(activityFirstSeen)
    .filter(([, date]) => date.startsWith(thisMonth))
    .map(([activity]) => activity);

  // Activity velocity (new activities per month)
  const monthsActive = new Set(
    Object.values(activityFirstSeen).map(d => d.substring(0, 7))
  ).size;
  const activityVelocity = monthsActive > 0
    ? Math.round((activityProgression.length / monthsActive) * 10) / 10
    : 0;

  return {
    mostFrequentActivities,
    activitiesByStage,
    activityProgression,
    newActivitiesThisMonth,
    activityVelocity,
  };
}

// ============================================
// TRENDS
// ============================================

function calculateTrends(
  progressions: ServiceProgression[],
  encounters: ServiceEncounter[]
): ServiceTrends {
  // Encounter frequency trend
  const recentEncounters = encounters.filter(e => {
    const date = new Date(e.date);
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return date >= monthAgo;
  });

  const olderEncounters = encounters.filter(e => {
    const date = new Date(e.date);
    const monthAgo = new Date();
    const twoMonthsAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    return date >= twoMonthsAgo && date < monthAgo;
  });

  const encounterFrequency: 'increasing' | 'stable' | 'decreasing' =
    recentEncounters.length > olderEncounters.length * 1.2 ? 'increasing' :
    recentEncounters.length < olderEncounters.length * 0.8 ? 'decreasing' : 'stable';

  // Comfort trend
  const comfortLevels = progressions.map(p => p.comfortLevel || 1);
  const recentComfort = comfortLevels.slice(-3);
  const olderComfort = comfortLevels.slice(-6, -3);
  const comfortTrend: 'improving' | 'stable' | 'declining' = calculateTrendDirection(recentComfort, olderComfort);

  // Gina involvement trend
  const recentGina = recentEncounters.filter(e => e.ginaAware).length;
  const olderGina = olderEncounters.filter(e => e.ginaAware).length;
  const ginaInvolvementTrend: 'increasing' | 'stable' | 'decreasing' =
    recentGina > olderGina * 1.2 ? 'increasing' :
    recentGina < olderGina * 0.8 ? 'decreasing' : 'stable';

  // Stage velocity
  if (progressions.length < 3) {
    var stageVelocity: 'accelerating' | 'steady' | 'slowing' = 'steady';
  } else {
    const recentStageGap = calculateDaysBetween(
      progressions[progressions.length - 2].enteredAt,
      progressions[progressions.length - 1].enteredAt
    );
    const olderStageGap = progressions.length >= 3 ? calculateDaysBetween(
      progressions[progressions.length - 3].enteredAt,
      progressions[progressions.length - 2].enteredAt
    ) : recentStageGap;

    stageVelocity = recentStageGap < olderStageGap * 0.8 ? 'accelerating' :
      recentStageGap > olderStageGap * 1.2 ? 'slowing' : 'steady';
  }

  // Weekly activity average
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const recentActivities = encounters
    .filter(e => new Date(e.date) >= fourWeeksAgo)
    .reduce((sum, e) => sum + e.activities.length, 0);
  const weeklyActivityAverage = Math.round((recentActivities / 4) * 10) / 10;

  // Monthly encounter average
  const totalMonths = Math.max(1, Math.ceil(
    (now.getTime() - new Date(encounters[0]?.date || now).getTime()) / (30 * 24 * 60 * 60 * 1000)
  ));
  const monthlyEncounterAverage = Math.round((encounters.length / totalMonths) * 10) / 10;

  return {
    encounterFrequency,
    comfortTrend,
    ginaInvolvementTrend,
    stageVelocity,
    weeklyActivityAverage,
    monthlyEncounterAverage,
  };
}

function calculateTrendDirection(recent: number[], older: number[]): 'improving' | 'stable' | 'declining' {
  if (recent.length === 0 || older.length === 0) return 'stable';

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  if (recentAvg > olderAvg * 1.1) return 'improving';
  if (recentAvg < olderAvg * 0.9) return 'declining';
  return 'stable';
}

function calculateDaysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.abs((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================
// RECOMMENDATIONS
// ============================================

function generateRecommendations(
  overview: ServiceOverview,
  stageProgress: StageProgressAnalysis,
  encounterAnalysis: EncounterAnalysis,
  comfortGrowth: ComfortGrowthAnalysis,
  trends: ServiceTrends
): ServiceRecommendation[] {
  const recommendations: ServiceRecommendation[] = [];

  // Stage advancement
  if (stageProgress.currentStageReadiness.isReady && overview.stageNumber < 7) {
    recommendations.push({
      type: 'stage',
      title: 'Ready for Next Stage',
      description: stageProgress.currentStageReadiness.recommendation,
      priority: 'high',
      actionable: 'Consider advancing when you feel ready',
    });
  } else if (!stageProgress.currentStageReadiness.isReady) {
    const blocker = stageProgress.currentStageReadiness.blockers[0];
    if (blocker) {
      recommendations.push({
        type: 'stage',
        title: 'Stage Progress Needed',
        description: blocker,
        priority: 'medium',
      });
    }
  }

  // Comfort growth
  if (trends.comfortTrend === 'declining') {
    recommendations.push({
      type: 'comfort',
      title: 'Comfort Level Declining',
      description: 'Your comfort level has decreased recently. Consider revisiting earlier activities to rebuild confidence.',
      priority: 'high',
    });
  }

  // Low comfort
  if (overview.currentComfortLevel < 4) {
    recommendations.push({
      type: 'comfort',
      title: 'Build Comfort Foundation',
      description: 'Focus on activities that feel safe and enjoyable to build a stronger comfort base.',
      priority: 'medium',
    });
  }

  // Gina involvement
  if (overview.stageNumber >= 4 && encounterAnalysis.ginaInvolvement.percentage < 30) {
    recommendations.push({
      type: 'gina',
      title: 'Increase Gina Awareness',
      description: 'At your stage, involving Gina in encounters deepens the service dynamic.',
      priority: 'medium',
      actionable: 'Log Gina awareness for your next encounter',
    });
  }

  // Encounter frequency
  if (trends.encounterFrequency === 'decreasing') {
    recommendations.push({
      type: 'encounter',
      title: 'Maintain Encounter Momentum',
      description: 'Your encounter frequency has decreased. Regular practice maintains progress.',
      priority: 'medium',
    });
  }

  // Activity variety
  if (encounterAnalysis.topActivities.length < 5) {
    recommendations.push({
      type: 'activity',
      title: 'Expand Activity Range',
      description: 'Try new activities to broaden your service experience.',
      priority: 'low',
    });
  }

  // Arousal-comfort correlation
  if (comfortGrowth.arousalCorrelation > 0.7) {
    recommendations.push({
      type: 'mindset',
      title: 'Strong Arousal-Comfort Link',
      description: 'Your comfort grows with arousal. Use this to push boundaries during high arousal states.',
      priority: 'low',
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations.slice(0, 5);
}

// ============================================
// EMPTY STATE
// ============================================

function createEmptyServiceAnalytics(): ServiceAnalytics {
  return {
    overview: {
      currentStage: 'fantasy',
      stageNumber: 1,
      totalEncounters: 0,
      ginaAwareEncounters: 0,
      ginaDirectedEncounters: 0,
      daysSinceStageAdvance: 0,
      activitiesLoggedThisStage: 0,
      currentComfortLevel: 1,
      currentArousalAssociation: 1,
      timeInProtocol: 0,
    },
    stageProgress: {
      stagesCompleted: 0,
      totalStages: 7,
      progressPercentage: 0,
      averageDaysPerStage: 0,
      stageHistory: [],
      currentStageReadiness: {
        isReady: false,
        comfortThreshold: 5,
        arousalThreshold: 4,
        minimumActivities: 3,
        currentComfort: 1,
        currentArousal: 1,
        currentActivities: 0,
        blockers: ['No service progression initialized'],
        recommendation: 'Start by initializing your service journey',
      },
    },
    encounterAnalysis: {
      totalEncounters: 0,
      encountersByType: { online: 0, anonymous: 0, regular: 0, directed: 0 },
      encountersByMonth: [],
      averageArousalLevel: 0,
      ginaInvolvement: { aware: 0, directed: 0, percentage: 0 },
      topActivities: [],
      psychologicalImpacts: [],
      escalationEffects: [],
    },
    comfortGrowth: {
      startingComfort: 1,
      currentComfort: 1,
      growthRate: 0,
      comfortOverTime: [],
      arousalCorrelation: 0,
      comfortByEncounterType: { online: 0, anonymous: 0, regular: 0, directed: 0 },
      breakthroughMoments: [],
    },
    activityPatterns: {
      mostFrequentActivities: [],
      activitiesByStage: {
        fantasy: [],
        content_consumption: [],
        online_interaction: [],
        first_encounter: [],
        regular_service: [],
        organized_availability: [],
        gina_directed: [],
      },
      activityProgression: [],
      newActivitiesThisMonth: [],
      activityVelocity: 0,
    },
    trends: {
      encounterFrequency: 'stable',
      comfortTrend: 'stable',
      ginaInvolvementTrend: 'stable',
      stageVelocity: 'steady',
      weeklyActivityAverage: 0,
      monthlyEncounterAverage: 0,
    },
    recommendations: [{
      type: 'stage',
      title: 'Begin Your Service Journey',
      description: 'Initialize your service progression to start tracking.',
      priority: 'high',
      actionable: 'Visit the Service section to get started',
    }],
  };
}
