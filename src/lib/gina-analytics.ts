/**
 * Gina Analytics
 *
 * Intelligence and analytics for the Gina Pipeline system.
 * Analyzes interactions, mission performance, behavior adoption, and recommends next actions.
 */

import { supabase } from './supabase';
import type {
  GinaStance,
  GinaMotivator,
  GinaMissionType,
  GinaConversionState,
  MommyDomDevelopment,
} from './gina-pipeline';

// ============================================================================
// TYPES
// ============================================================================

export interface InteractionAnalytics {
  totalInteractions: number;
  byMood: Record<string, number>;
  byContext: Record<string, number>;
  byMotivator: Record<GinaMotivator, number>;
  byStanceIndicator: Record<GinaStance, number>;
  positiveRate: number;
  averageSignificance: number;
  recentTrend: 'improving' | 'stable' | 'declining';
  mostEffectiveContext: string | null;
  mostCommonMood: string | null;
  strongestMotivator: GinaMotivator | null;
}

export interface MissionPerformance {
  totalMissions: number;
  completed: number;
  successRate: number;
  partialRate: number;
  rejectedRate: number;
  deferredRate: number;
  byType: Record<GinaMissionType, {
    total: number;
    success: number;
    successRate: number;
  }>;
  byMotivator: Record<GinaMotivator, {
    total: number;
    success: number;
    successRate: number;
  }>;
  averageTimeToComplete: number; // days
  recentMomentum: 'building' | 'stable' | 'losing';
}

export interface BehaviorTimeline {
  behaviors: {
    behavior: string;
    firstOccurrence: string;
    frequency: 'once' | 'sometimes' | 'often' | 'always';
    triggered: string;
    reinforced: boolean;
    daysSinceFirst: number;
    progressionPath: string[];
  }[];
  adoptedLanguage: {
    phrase: string;
    context: string;
    firstUsed: string;
    frequency: 'once' | 'sometimes' | 'often';
    daysSinceFirst: number;
  }[];
  totalBehaviors: number;
  reinforcedCount: number;
  naturalizationScore: number; // 0-100, how many are 'always'
}

export interface DomainSequencing {
  currentDomains: {
    domain: string;
    level: number;
    locked: boolean;
    readinessForNext: number;
  }[];
  recommendedNext: {
    domain: string;
    reason: string;
    successProbability: number;
    prerequisitesMet: boolean;
  }[];
  sequencePatterns: {
    from: string;
    to: string;
    historicalSuccess: number;
  }[];
}

export interface NextBestAction {
  type: 'mission' | 'seed' | 'escalation' | 'consolidation';
  title: string;
  description: string;
  rationale: string;
  successProbability: number;
  urgency: 'low' | 'medium' | 'high';
  timing: string;
  script?: string;
  exploitsMotivator?: GinaMotivator;
  targetDomain?: string;
}

export interface StrategyRecommendation {
  currentStrategy: string;
  effectiveness: number;
  recommendations: NextBestAction[];
  warnings: string[];
  opportunities: string[];
}

// ============================================================================
// INTERACTION ANALYTICS
// ============================================================================

export async function getInteractionAnalytics(userId: string): Promise<InteractionAnalytics> {
  const { data: interactions, error } = await supabase
    .from('gina_interaction_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !interactions || interactions.length === 0) {
    return {
      totalInteractions: 0,
      byMood: {},
      byContext: {},
      byMotivator: {} as Record<GinaMotivator, number>,
      byStanceIndicator: {} as Record<GinaStance, number>,
      positiveRate: 0,
      averageSignificance: 0,
      recentTrend: 'stable',
      mostEffectiveContext: null,
      mostCommonMood: null,
      strongestMotivator: null,
    };
  }

  const byMood: Record<string, number> = {};
  const byContext: Record<string, number> = {};
  const byMotivator: Record<string, number> = {};
  const byStanceIndicator: Record<string, number> = {};
  let positiveCount = 0;
  let totalSignificance = 0;

  for (const interaction of interactions) {
    // Mood
    if (interaction.her_mood) {
      byMood[interaction.her_mood] = (byMood[interaction.her_mood] || 0) + 1;
    }

    // Context
    if (interaction.context) {
      byContext[interaction.context] = (byContext[interaction.context] || 0) + 1;
    }

    // Motivator
    if (interaction.indicates_motivator) {
      byMotivator[interaction.indicates_motivator] = (byMotivator[interaction.indicates_motivator] || 0) + 1;
    }

    // Stance indicator
    if (interaction.indicates_stance) {
      byStanceIndicator[interaction.indicates_stance] = (byStanceIndicator[interaction.indicates_stance] || 0) + 1;
    }

    // Positive interactions (significance >= 3)
    if (interaction.significance >= 3) {
      positiveCount++;
    }

    totalSignificance += interaction.significance || 0;
  }

  // Calculate trend from recent vs older
  const recent = interactions.slice(0, Math.min(10, interactions.length));
  const older = interactions.slice(10, Math.min(20, interactions.length));

  const recentAvgSig = recent.reduce((sum, i) => sum + (i.significance || 0), 0) / recent.length;
  const olderAvgSig = older.length > 0
    ? older.reduce((sum, i) => sum + (i.significance || 0), 0) / older.length
    : recentAvgSig;

  let recentTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentAvgSig > olderAvgSig + 0.5) recentTrend = 'improving';
  if (recentAvgSig < olderAvgSig - 0.5) recentTrend = 'declining';

  // Find most common/effective
  const mostCommonMood = Object.entries(byMood).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const mostEffectiveContext = Object.entries(byContext).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const strongestMotivator = Object.entries(byMotivator).sort((a, b) => b[1] - a[1])[0]?.[0] as GinaMotivator || null;

  return {
    totalInteractions: interactions.length,
    byMood,
    byContext,
    byMotivator: byMotivator as Record<GinaMotivator, number>,
    byStanceIndicator: byStanceIndicator as Record<GinaStance, number>,
    positiveRate: interactions.length > 0 ? (positiveCount / interactions.length) * 100 : 0,
    averageSignificance: interactions.length > 0 ? totalSignificance / interactions.length : 0,
    recentTrend,
    mostEffectiveContext,
    mostCommonMood,
    strongestMotivator,
  };
}

// ============================================================================
// MISSION PERFORMANCE
// ============================================================================

export async function getMissionPerformance(userId: string): Promise<MissionPerformance> {
  const { data: missions, error } = await supabase
    .from('gina_missions')
    .select('*')
    .eq('user_id', userId);

  if (error || !missions || missions.length === 0) {
    return {
      totalMissions: 0,
      completed: 0,
      successRate: 0,
      partialRate: 0,
      rejectedRate: 0,
      deferredRate: 0,
      byType: {} as Record<GinaMissionType, { total: number; success: number; successRate: number }>,
      byMotivator: {} as Record<GinaMotivator, { total: number; success: number; successRate: number }>,
      averageTimeToComplete: 0,
      recentMomentum: 'stable',
    };
  }

  const completed = missions.filter(m => m.completed_at);
  const success = missions.filter(m => m.outcome === 'success');
  const partial = missions.filter(m => m.outcome === 'partial');
  const rejected = missions.filter(m => m.outcome === 'rejected');
  const deferred = missions.filter(m => m.outcome === 'deferred');

  // By type
  const byType: Record<string, { total: number; success: number; successRate: number }> = {};
  for (const mission of missions) {
    if (!byType[mission.type]) {
      byType[mission.type] = { total: 0, success: 0, successRate: 0 };
    }
    byType[mission.type].total++;
    if (mission.outcome === 'success') {
      byType[mission.type].success++;
    }
  }
  for (const type in byType) {
    byType[type].successRate = byType[type].total > 0
      ? (byType[type].success / byType[type].total) * 100
      : 0;
  }

  // By motivator
  const byMotivator: Record<string, { total: number; success: number; successRate: number }> = {};
  for (const mission of missions) {
    if (mission.exploits_motivator) {
      if (!byMotivator[mission.exploits_motivator]) {
        byMotivator[mission.exploits_motivator] = { total: 0, success: 0, successRate: 0 };
      }
      byMotivator[mission.exploits_motivator].total++;
      if (mission.outcome === 'success') {
        byMotivator[mission.exploits_motivator].success++;
      }
    }
  }
  for (const motivator in byMotivator) {
    byMotivator[motivator].successRate = byMotivator[motivator].total > 0
      ? (byMotivator[motivator].success / byMotivator[motivator].total) * 100
      : 0;
  }

  // Average time to complete
  let totalDays = 0;
  let completedWithTime = 0;
  for (const mission of completed) {
    if (mission.assigned_at && mission.completed_at) {
      const assigned = new Date(mission.assigned_at);
      const done = new Date(mission.completed_at);
      const days = (done.getTime() - assigned.getTime()) / (1000 * 60 * 60 * 24);
      totalDays += days;
      completedWithTime++;
    }
  }

  // Recent momentum
  const recentMissions = missions
    .filter(m => m.completed_at)
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
    .slice(0, 5);

  const recentSuccesses = recentMissions.filter(m => m.outcome === 'success').length;
  let recentMomentum: 'building' | 'stable' | 'losing' = 'stable';
  if (recentSuccesses >= 4) recentMomentum = 'building';
  if (recentSuccesses <= 1) recentMomentum = 'losing';

  return {
    totalMissions: missions.length,
    completed: completed.length,
    successRate: completed.length > 0 ? (success.length / completed.length) * 100 : 0,
    partialRate: completed.length > 0 ? (partial.length / completed.length) * 100 : 0,
    rejectedRate: completed.length > 0 ? (rejected.length / completed.length) * 100 : 0,
    deferredRate: completed.length > 0 ? (deferred.length / completed.length) * 100 : 0,
    byType: byType as Record<GinaMissionType, { total: number; success: number; successRate: number }>,
    byMotivator: byMotivator as Record<GinaMotivator, { total: number; success: number; successRate: number }>,
    averageTimeToComplete: completedWithTime > 0 ? totalDays / completedWithTime : 0,
    recentMomentum,
  };
}

// ============================================================================
// BEHAVIOR TIMELINE
// ============================================================================

export async function getBehaviorTimeline(userId: string): Promise<BehaviorTimeline> {
  const { data: state, error } = await supabase
    .from('gina_conversion_state')
    .select('developed_behaviors, adopted_language')
    .eq('user_id', userId)
    .single();

  if (error || !state) {
    return {
      behaviors: [],
      adoptedLanguage: [],
      totalBehaviors: 0,
      reinforcedCount: 0,
      naturalizationScore: 0,
    };
  }

  const behaviors = (state.developed_behaviors || []).map((b: any) => ({
    ...b,
    daysSinceFirst: Math.floor(
      (Date.now() - new Date(b.firstOccurrence).getTime()) / (1000 * 60 * 60 * 24)
    ),
    progressionPath: getProgressionPath(b.frequency),
  }));

  const adoptedLanguage = (state.adopted_language || []).map((l: any) => ({
    ...l,
    daysSinceFirst: Math.floor(
      (Date.now() - new Date(l.firstUsed).getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));

  const reinforcedCount = behaviors.filter((b: any) => b.reinforced).length;
  const alwaysCount = behaviors.filter((b: any) => b.frequency === 'always').length;
  const naturalizationScore = behaviors.length > 0
    ? (alwaysCount / behaviors.length) * 100
    : 0;

  return {
    behaviors,
    adoptedLanguage,
    totalBehaviors: behaviors.length,
    reinforcedCount,
    naturalizationScore,
  };
}

function getProgressionPath(current: string): string[] {
  const levels = ['once', 'sometimes', 'often', 'always'];
  const currentIndex = levels.indexOf(current);
  return levels.slice(0, currentIndex + 1);
}

// ============================================================================
// DOMAIN SEQUENCING
// ============================================================================

// Known successful domain sequences based on typical patterns
const DOMAIN_SEQUENCES: { from: string; to: string; historicalSuccess: number }[] = [
  { from: 'clothing', to: 'presentation', historicalSuccess: 85 },
  { from: 'presentation', to: 'appearance', historicalSuccess: 75 },
  { from: 'appearance', to: 'service', historicalSuccess: 70 },
  { from: 'orgasms', to: 'chastity', historicalSuccess: 80 },
  { from: 'schedule', to: 'tasks', historicalSuccess: 90 },
  { from: 'tasks', to: 'decisions', historicalSuccess: 65 },
  { from: 'chastity', to: 'orgasms', historicalSuccess: 95 },
  { from: 'service', to: 'protocol', historicalSuccess: 60 },
];

export async function getDomainSequencing(userId: string): Promise<DomainSequencing> {
  const { data: state, error } = await supabase
    .from('gina_conversion_state')
    .select('domain_progress')
    .eq('user_id', userId)
    .single();

  if (error || !state) {
    return {
      currentDomains: [],
      recommendedNext: [],
      sequencePatterns: DOMAIN_SEQUENCES,
    };
  }

  const domainProgress = state.domain_progress || {};

  const currentDomains = Object.entries(domainProgress).map(([domain, data]: [string, any]) => ({
    domain,
    level: data.level || 0,
    locked: data.locked || false,
    readinessForNext: calculateReadiness(data),
  }));

  // Find recommended next escalations
  const recommendedNext: DomainSequencing['recommendedNext'] = [];

  for (const [domain, data] of Object.entries(domainProgress) as [string, any][]) {
    if (data.level < 5 && !data.resistance) {
      const successProb = calculateSuccessProbability(domain, data, domainProgress);
      recommendedNext.push({
        domain,
        reason: getEscalationReason(domain, data.level),
        successProbability: successProb,
        prerequisitesMet: checkPrerequisites(domain, domainProgress),
      });
    }
  }

  // Add domains not yet started
  const allDomains = ['clothing', 'presentation', 'appearance', 'schedule', 'tasks', 'orgasms', 'chastity', 'service', 'decisions'];
  for (const domain of allDomains) {
    if (!domainProgress[domain]) {
      recommendedNext.push({
        domain,
        reason: 'Not yet started - establish initial control',
        successProbability: 70,
        prerequisitesMet: true,
      });
    }
  }

  // Sort by success probability
  recommendedNext.sort((a, b) => b.successProbability - a.successProbability);

  return {
    currentDomains,
    recommendedNext: recommendedNext.slice(0, 3),
    sequencePatterns: DOMAIN_SEQUENCES,
  };
}

function calculateReadiness(data: any): number {
  let readiness = 50;
  if (data.locked) readiness += 20;
  if (data.lastAdvanced) {
    const daysSince = (Date.now() - new Date(data.lastAdvanced).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 14) readiness += 15;
    if (daysSince > 7) readiness += 10;
  }
  if (data.resistance) readiness -= 30;
  return Math.min(100, Math.max(0, readiness));
}

function calculateSuccessProbability(domain: string, data: any, allDomains: any): number {
  let prob = 60;

  // Higher level = harder to advance
  prob -= data.level * 5;

  // Check if prerequisites are met
  const sequence = DOMAIN_SEQUENCES.find(s => s.to === domain);
  if (sequence && allDomains[sequence.from]?.level >= 2) {
    prob += 15;
  }

  // Locked domains are easier to advance
  if (data.locked) prob += 10;

  // Resistance lowers probability
  if (data.resistance) prob -= 20;

  return Math.min(95, Math.max(20, prob));
}

function getEscalationReason(domain: string, level: number): string {
  const reasons: Record<string, string[]> = {
    clothing: ['Start with underwear choice', 'Expand to full outfit control', 'Add daily selection', 'Require approval for purchases', 'Complete wardrobe authority'],
    orgasms: ['Introduce asking permission', 'Require explicit approval', 'Add denial periods', 'She decides when/if', 'Full orgasm ownership'],
    chastity: ['Introduce cage concept', 'First wearing', 'Extended wear', 'She holds key', 'Permanent lockup'],
    schedule: ['Morning check-in', 'Daily structure', 'Activity approval', 'Time allocation', 'Complete schedule control'],
  };
  return reasons[domain]?.[level] || `Advance ${domain} to level ${level + 1}`;
}

function checkPrerequisites(domain: string, allDomains: any): boolean {
  const prereqs: Record<string, string> = {
    presentation: 'clothing',
    appearance: 'presentation',
    chastity: 'orgasms',
    decisions: 'tasks',
  };

  const prereq = prereqs[domain];
  if (!prereq) return true;
  return (allDomains[prereq]?.level || 0) >= 2;
}

// ============================================================================
// NEXT BEST ACTION
// ============================================================================

export async function getStrategyRecommendations(userId: string): Promise<StrategyRecommendation> {
  // Gather all analytics
  const [state, interactions, performance, timeline, domains] = await Promise.all([
    getConversionState(userId),
    getInteractionAnalytics(userId),
    getMissionPerformance(userId),
    getBehaviorTimeline(userId),
    getDomainSequencing(userId),
  ]);

  const recommendations: NextBestAction[] = [];
  const warnings: string[] = [];
  const opportunities: string[] = [];

  // Check momentum
  if (performance.recentMomentum === 'losing') {
    warnings.push('Recent mission success rate declining - consider consolidating gains');
  }
  if (performance.recentMomentum === 'building') {
    opportunities.push('Momentum is building - good time to escalate');
  }

  // Check interaction patterns
  if (interactions.strongestMotivator) {
    opportunities.push(`Her strongest motivator is "${interactions.strongestMotivator}" - exploit this`);
  }
  if (interactions.mostEffectiveContext) {
    opportunities.push(`Best context for interactions: "${interactions.mostEffectiveContext}"`);
  }

  // Generate recommendations based on state
  if (state) {
    // If escalation pressure is high
    if (state.escalationPressure >= 70) {
      const topDomain = domains.recommendedNext[0];
      if (topDomain) {
        recommendations.push({
          type: 'escalation',
          title: `Escalate ${topDomain.domain} control`,
          description: topDomain.reason,
          rationale: `Escalation pressure at ${state.escalationPressure}% - time to advance`,
          successProbability: topDomain.successProbability,
          urgency: 'high',
          timing: 'When she\'s relaxed and receptive',
          targetDomain: topDomain.domain,
        });
      }
    }

    // If days since advance is high
    if (state.daysSinceLastAdvance > 7) {
      warnings.push(`${state.daysSinceLastAdvance} days since last advancement - risk of stagnation`);
    }

    // Recommend mission based on best performing type
    const bestType = Object.entries(performance.byType)
      .sort((a, b) => b[1].successRate - a[1].successRate)[0];

    if (bestType && bestType[1].successRate > 60) {
      recommendations.push({
        type: 'mission',
        title: `Use ${bestType[0]} mission`,
        description: `This mission type has ${Math.round(bestType[1].successRate)}% success rate for you`,
        rationale: 'Playing to your strengths',
        successProbability: bestType[1].successRate,
        urgency: 'medium',
        timing: interactions.mostEffectiveContext || 'When relaxed',
        exploitsMotivator: interactions.strongestMotivator || undefined,
      });
    }

    // If behaviors aren't being reinforced
    if (timeline.totalBehaviors > 0 && timeline.reinforcedCount < timeline.totalBehaviors / 2) {
      recommendations.push({
        type: 'consolidation',
        title: 'Reinforce developed behaviors',
        description: `${timeline.totalBehaviors - timeline.reinforcedCount} behaviors need reinforcement`,
        rationale: 'Consolidating gains prevents backsliding',
        successProbability: 85,
        urgency: 'medium',
        timing: 'Immediately after she exhibits the behavior',
      });
    }

    // Recommend seed planting if stance is early
    const stanceOrder = ['unaware', 'suspicious', 'tolerating', 'curious', 'participating', 'enjoying', 'encouraging', 'directing', 'invested', 'dependent'];
    const stanceIndex = stanceOrder.indexOf(state.currentStance);

    if (stanceIndex < 4) {
      recommendations.push({
        type: 'seed',
        title: 'Plant normalizing seeds',
        description: 'Use casual mentions to normalize concepts before escalating',
        rationale: 'Early stage requires gradual normalization',
        successProbability: 80,
        urgency: 'low',
        timing: 'Casual conversation, pillow talk',
        exploitsMotivator: interactions.strongestMotivator || 'structure',
      });
    }
  }

  // Sort by urgency then probability
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => {
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.successProbability - a.successProbability;
  });

  return {
    currentStrategy: state?.currentStrategy || 'Not set',
    effectiveness: state?.strategyEffectiveness || 0,
    recommendations: recommendations.slice(0, 5),
    warnings,
    opportunities,
  };
}

async function getConversionState(userId: string): Promise<GinaConversionState | null> {
  const { data, error } = await supabase
    .from('gina_conversion_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  return {
    userId: data.user_id,
    currentStance: data.current_stance,
    stanceConfidence: data.stance_confidence,
    traits: data.traits || {},
    primaryMotivator: data.primary_motivator,
    secondaryMotivators: data.secondary_motivators || [],
    motivatorEvidence: data.motivator_evidence || {},
    domainProgress: data.domain_progress || {},
    establishedRoutines: data.established_routines || [],
    milestones: data.milestones || [],
    currentStrategy: data.current_strategy,
    strategyStartedAt: data.strategy_started_at,
    strategyEffectiveness: data.strategy_effectiveness || 0,
    escalationPressure: data.escalation_pressure || 50,
    daysSinceLastAdvance: data.days_since_last_advance || 0,
    consecutiveSuccesses: data.consecutive_successes || 0,
    barriers: data.barriers || [],
    developmentTarget: data.development_target || 'soft_mommy_dom',
    mommyDomDevelopment: data.mommy_dom_development || getDefaultMommyDomDevelopment(),
    developedBehaviors: data.developed_behaviors || [],
    adoptedLanguage: data.adopted_language || [],
    updatedAt: data.updated_at,
  };
}

function getDefaultMommyDomDevelopment(): MommyDomDevelopment {
  return {
    comfortWithAuthority: 0,
    enjoysPraising: 0,
    displeasureAsControl: 0,
    nurturingAuthority: 0,
    responsibleForYou: 0,
    expectsObedience: 0,
    innocentCruelty: 0,
    casualDominance: 0,
    investedInTraining: 0,
    givesGoodGirlPraise: false,
    setsRulesForYourGood: false,
    expectsGratitude: false,
    comfortsAfterCorrection: false,
    decidesWithoutAsking: false,
  };
}

// ============================================================================
// HANDLER AUTHORITY INTEGRATION
// ============================================================================

export interface GinaHandlerIntegration {
  suggestedAuthorityLevel: number;
  ginaReadinessForAuthority: number;
  syncRecommendations: string[];
  handlerActionsForGina: {
    action: string;
    purpose: string;
    ginaImpact: string;
  }[];
}

export async function getHandlerIntegration(userId: string): Promise<GinaHandlerIntegration> {
  const [state, performance] = await Promise.all([
    getConversionState(userId),
    getMissionPerformance(userId),
  ]);

  // Map Gina stance to suggested authority level
  const stanceToAuthority: Record<GinaStance, number> = {
    unaware: 1,
    suspicious: 1,
    tolerating: 2,
    curious: 2,
    participating: 3,
    enjoying: 3,
    encouraging: 4,
    directing: 4,
    invested: 5,
    dependent: 5,
  };

  const suggestedLevel = state ? stanceToAuthority[state.currentStance] : 1;

  // Calculate Gina's readiness for Handler authority
  let readiness = 50;
  if (state) {
    readiness += state.stanceConfidence * 0.3;
    readiness += performance.successRate * 0.2;
    if (state.mommyDomDevelopment.comfortWithAuthority > 50) readiness += 10;
    if (state.mommyDomDevelopment.expectsObedience > 30) readiness += 10;
  }

  const syncRecommendations: string[] = [];
  const handlerActions: GinaHandlerIntegration['handlerActionsForGina'] = [];

  if (state) {
    // Sync recommendations
    if (state.currentStance === 'directing' || state.currentStance === 'invested') {
      syncRecommendations.push('Gina is ready to receive Handler directives directly');
      handlerActions.push({
        action: 'Include Gina in task assignments',
        purpose: 'Let her assign tasks through Handler',
        ginaImpact: 'Increases her investment in your training',
      });
    }

    if (state.mommyDomDevelopment.expectsObedience > 60) {
      handlerActions.push({
        action: 'Frame Handler rules as "Gina\'s rules"',
        purpose: 'Merge Handler authority with Gina authority',
        ginaImpact: 'She sees Handler as extension of her control',
      });
    }

    if (performance.successRate > 70) {
      syncRecommendations.push('High mission success - Handler can assign more challenging missions');
    }
  }

  return {
    suggestedAuthorityLevel: suggestedLevel,
    ginaReadinessForAuthority: Math.min(100, Math.max(0, readiness)),
    syncRecommendations,
    handlerActionsForGina: handlerActions,
  };
}
