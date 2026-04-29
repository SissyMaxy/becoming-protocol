/**
 * Handler Systems Context Builder
 *
 * Gathers context from ALL protocol systems and formats it for Handler AI prompts.
 * Every prompt builder in handler-ai.ts and handler-v2/ai-client.ts calls this.
 *
 * Format: compact, data-dense — matches existing corruption context block style.
 * The Handler needs numbers and state, not prose.
 */

import { getPipelineComposite } from './gina/ladder-engine';
import { getChannelsInRecovery, getRecentSeeds } from './gina/seed-manager';
import { getDueMeasurements } from './gina/measurement-engine';
import { getDiscoveryState } from './gina/discovery-engine';
import { buildWhoopContext } from './whoop-context';
import { buildCommitmentContext } from './handler-v2/commitment-enforcement';
import { getCurrentPrediction } from './handler-v2/predictive-model';
import { getConditioningContext } from './handler-v2/conditioning-engine';
import { getHRTContext } from './handler-v2/hrt-pipeline';
import { getShameContext } from './handler-v2/shame-alchemy';
import { getRevenueContext } from './handler-v2/revenue-acceleration';
import { getDavidEliminationContext } from './handler-v2/david-elimination';
import { getSocialContext } from './handler-v2/social-escalation';
import {
  getVaultStats,
  getTodaySchedule,
  getActiveArc,
  getRevenueSummary,
  getFanCount,
} from './content-pipeline';
import {
  getVoiceTrainingProgress,
  checkVoiceAvoidance,
} from './voice-training';
import { getActiveLiveSession } from './cam';
import { getCamStats, getUpcomingSessions, getRecentSessions } from './content/cam-engine';
import { getSleepStats } from './sleep-content';
import { getOrCreateStreak, getLatestMeasurement } from './exercise';
import { getTodayProtein } from './protein';
import { estimateGrams, countSources, PROTEIN_TARGET } from '../types/protein';
import { getHypnoSessionSummary } from './hypno-sessions';
import { getLibraryStats } from './hypno-library';
import { getConversationCounts } from './sexting/conversations';
import { getAutoSendStats, getEscalatedMessages } from './sexting/messaging';
import { getGfeRevenueSummary } from './sexting/gfe';
import { getListingStats } from './marketplace/listings';
import { getOrderStats } from './marketplace/orders';
import { getActiveAuctionCount } from './marketplace/auctions';
import { getDailyAggregate, getWeeklyTrend } from './passive-voice/aggregation';
import { getRecentInterventions } from './passive-voice/interventions';
import { getSessionSummaries, getLastSessionSummary } from './session-telemetry';
import { getActiveAnchors } from './ritual-anchors';
import { buildDenialContentContext } from './industry/denial-content-bridge';
import { buildSkipContext } from './industry/skip-escalation';
import { buildFanMemoryContext } from './industry/fan-memory';
import { buildCommunityContext } from './industry/community-engine';
import { buildOutreachContext } from './industry/creator-outreach';
import { buildKarmaContext } from './industry/reddit-karma';
import { buildRecycleContext } from './industry/content-recycler';
import { buildVoiceContentContext } from './industry/voice-content';
import { getInteractionSummary } from './content/fan-interaction-processor';
import { getPollSummary } from './content/subscriber-poll-engine';
import { getWeekendHandlerContext } from './weekend-engine';
import { getActiveProtocol, getLastCompletedProtocol } from './post-release-engine';
import { buildFeminizationContext, buildShootEscalationContext } from './feminization-target-engine';
import { buildConfrontationContext } from './evidence-confrontation';
import { buildContentIntelligenceContext, buildCalendarContext, buildOvernightSummaryForBriefing } from './content-intelligence-context';
import { buildDopamineContext } from './dopamine-context';
import { buildMemoryContextBlock } from './handler-memory';
import { buildConditioningEngineContext } from './conditioning/handler-context';
import { buildImpactContext } from './conditioning/impact-tracking';
import { buildIrreversibilityContext } from './conditioning/irreversibility';
import { buildNarrativeContext } from './conditioning/narrative-engine';
import { buildVoicePitchContext } from './voice/pitch-tracker';
import { buildVoiceEvolutionContext } from './voice/voice-evolution';
import { buildInvestmentContext } from './handler-v2/auto-purchase';
import { buildAutoPosterActivityContext } from './handler-v2/auto-poster-activity';
import { buildLeadIntelligenceContext } from './handler-v2/lead-intelligence';
import { buildBriefContext } from './content/brief-context';
import { buildStreamContext } from './content/stream-context';
import { getFundBalance } from './handler-v2/auto-purchase';
import { buildFeminizationPrescriptionContext } from './conditioning/feminization-prescriptions';
import { buildExercisePrescriptionContext } from './conditioning/exercise-prescriptions';
import { buildPostReleaseContext } from './conditioning/post-release-bridge';
import { buildCorrelationContext } from './conditioning/correlation-engine';
import { buildCommitmentLadderContext } from './conditioning/commitment-ladder';
import { buildGinaMicroExposureContext } from './conditioning/gina-micro-exposure';
import { buildContentOptimizationContext } from './conditioning/content-optimizer';
import { buildDenialMappingContext } from './conditioning/denial-mapping';
import { buildServiceAdvancementContext } from './conditioning/service-advancement';
import { buildAmbushContext } from './conditioning/ambush-scheduler';
import { buildCommunityMirrorContext } from './conditioning/community-mirror';
import { buildDirectiveContext } from './conditioning/directive-executor';
import { buildCorruptionActivationContext } from './conditioning/corruption-engine';
import { buildCamHandlerControlContext } from './conditioning/cam-handler-control';
import { buildFailureRecoveryContext } from './conditioning/failure-recovery';
import { buildJournalContext } from './journal/handler-context';
import { buildSkillTreeContext } from './skills/skill-tree-engine';
import { buildLanguageDriftContext } from './conditioning/language-drift';
import { buildSleepPhaseContext } from './conditioning/sleep-phase-targeting';
import { buildPhotoTimelineContext } from './conditioning/photo-timeline';
import { buildSocialIntelligenceContext } from './conditioning/social-intelligence';
import { buildAccountabilityContext } from './conditioning/accountability';
import { buildOutreachQueueContext } from './conditioning/proactive-outreach';
import { buildAgendaContext } from './conditioning/conversation-agenda';
import { buildPredictiveEngineContext } from './conditioning/predictive-engine';
import { buildProtocolContext } from './conditioning/protocol-manager';
import { buildReflectionContext } from './conditioning/handler-reflection';
import { buildEmotionalModelContext } from './conditioning/emotional-model';
import { buildPersonalityContext } from './conditioning/personality-evolution';
import { buildLibraryGrowthContext } from './conditioning/library-growth';
import { buildChainContext } from './conditioning/session-chainer';
import { buildAutonomousCycleContext } from './conditioning/autonomous-cycle';
import { buildConsequenceContext } from './conditioning/consequence-engine';
import { buildObligationContext } from './conditioning/engagement-obligations';
import { buildVariableRatioContext } from './conditioning/variable-ratio-device';
import { buildMandateContext } from './conditioning/feminization-mandate';
import { buildOutfitControlContext } from './conditioning/outfit-control';
import { buildWardrobeContext } from './conditioning/wardrobe-system';
import { buildVerificationContext } from './conditioning/compliance-verification';
import { buildSleepTrackingContext } from './conditioning/sleep-tracking';
import { buildGoonEngineContext } from './conditioning/goon-engine';
import { buildArousalMaintenanceContext } from './conditioning/arousal-maintenance';
import { buildExposureContext } from './conditioning/progressive-exposure';
import { buildConsumptionContext } from './conditioning/consumption-mandates';
import { buildAntiCircumventionContext } from './conditioning/anti-circumvention';
import { buildProofOfLifeContext } from './conditioning/proof-of-life';
import { buildVideoVerificationContext } from './conditioning/video-verification';
import { buildVerificationSequenceContext } from './conditioning/verification-sequences';
import { buildStreakContext } from './conditioning/streak-stakes';
import { buildDifficultyContext } from './conditioning/difficulty-escalation';
import { buildRewardGatingContext } from './conditioning/reward-gating';
import { buildResistanceClassifierContext } from './conditioning/resistance-classifier';
import { supabase } from './supabase';

// ============================================
// TYPES
// ============================================

export interface SystemsContext {
  gina: string;
  content: string;
  voice: string;
  cam: string;
  sleep: string;
  exercise: string;
  hypno: string;
  sessionTelemetry: string;
  sexting: string;
  marketplace: string;
  passiveVoice: string;
  denialContent: string;
  industry: string;
  weekendPostRelease: string;
  feminization: string;
  evidenceConfrontation: string;
  shootEscalation: string;
  contentIntelligence: string;
  contentCalendar: string;
  overnightSummary: string;
  dopamine: string;
  conditioningEngine: string;
  impactTracking: string;
  narrativeArc: string;
  autoPoster: string;
  socialInbox: string;
  voicePitch: string;
  autoPurchase: string;
  postReleaseBridge: string;
  serviceAdvancement: string;
  ambushScheduler: string;
  voiceEvolution: string;
  corruptionActivation: string;
  camHandlerControl: string;
  failureRecovery: string;
  communityMirror: string;
  handlerDirectives: string;
  skillTree: string;
  contentOptimization: string;
  denialMapping: string;
  languageDrift: string;
  sleepPhaseTargeting: string;
  photoTimeline: string;
  correlationEngine: string;
  commitmentLadder: string;
  ginaMicroExposure: string;
  socialIntelligence: string;
  accountability: string;
  proactiveOutreach: string;
  conversationAgenda: string;
  predictiveEngine: string;
  protocolManager: string;
  handlerReflection: string;
  emotionalModel: string;
  personalityEvolution: string;
  libraryGrowth: string;
  sessionChaining: string;
  autonomousCycle: string;
  consequenceEngine: string;
  obligations: string;
  variableRatioDevice: string;
  feminizationMandates: string;
  outfitControl: string;
  wardrobeInventory: string;
  complianceVerification: string;
  sleepConditioningTracking: string;
  goonEngine: string;
  arousalMaintenance: string;
  progressiveExposure: string;
  consumptionMandates: string;
  antiCircumvention: string;
  proofOfLife: string;
  videoVerification: string;
  verificationSequences: string;
  streakStakes: string;
  difficultyEscalation: string;
  rewardGating: string;
  resistanceClassifier: string;
}

// ============================================
// INDIVIDUAL CONTEXT BUILDERS
// ============================================

async function buildGinaContext(userId: string): Promise<string> {
  try {
    const [compositeResult, discoveryResult, recoveryResult, recentSeedsResult, dueMeasurementsResult] = await Promise.allSettled([
      getPipelineComposite(userId),
      getDiscoveryState(userId),
      getChannelsInRecovery(userId),
      getRecentSeeds(userId, 14),
      getDueMeasurements(userId),
    ]);

    const composite = compositeResult.status === 'fulfilled' ? compositeResult.value : null;
    const discovery = discoveryResult.status === 'fulfilled' ? discoveryResult.value : null;
    const recovery = recoveryResult.status === 'fulfilled' ? recoveryResult.value : [];
    const recentSeeds = recentSeedsResult.status === 'fulfilled' ? recentSeedsResult.value : [];
    const dueMeasurements = dueMeasurementsResult.status === 'fulfilled' ? dueMeasurementsResult.value : [];

    if (!composite && !discovery) return '';
    if (composite && composite.channelsStarted === 0 && !discovery) return '';

    const parts: string[] = [];

    // Pipeline composite
    if (composite && composite.channelsStarted > 0) {
      parts.push(`GINA PIPELINE: avg rung ${composite.average.toFixed(1)}/5, ${composite.channelsStarted}/10 channels active, ${composite.channelsAtMax} maxed`);
      parts.push(`  leading: ${composite.leading ? `${composite.leading.channel} R${composite.leading.rung}` : 'none'} | lagging: ${composite.lagging ? `${composite.lagging.channel} R${composite.lagging.rung}` : 'none'} | gap: ${composite.widestGap}`);
    }

    // Discovery state
    if (discovery) {
      parts.push(`  discovery phase: ${discovery.phase} | readiness: ${discovery.score}/100`);
      if (discovery.recommendation) {
        parts.push(`  recommendation: ${discovery.recommendation}`);
      }
    }

    // Channels in recovery
    if (recovery.length > 0) {
      const recoveryStrs = recovery.map(r =>
        `${r.channel} (${r.recoveryType}${r.cooldownDaysRemaining > 0 ? `, ${r.cooldownDaysRemaining}d cooldown` : ''})`
      );
      parts.push(`  IN RECOVERY: ${recoveryStrs.join(', ')}`);
    }

    // Recent seed activity summary
    if (recentSeeds.length > 0) {
      const positive = recentSeeds.filter(s => s.ginaResponse === 'positive').length;
      const negative = recentSeeds.filter(s => s.ginaResponse === 'negative').length;
      const callout = recentSeeds.filter(s => s.ginaResponse === 'callout').length;
      parts.push(`  seeds (14d): ${recentSeeds.length} total, ${positive} positive, ${negative} negative${callout > 0 ? `, ${callout} CALLOUT` : ''}`);

      // Last seed details
      const last = recentSeeds[0];
      const daysAgo = Math.floor((Date.now() - last.createdAt.getTime()) / 86400000);
      parts.push(`  last seed: ${last.channel} R${last.rung} → ${last.ginaResponse}${last.ginaExactWords ? ` ("${last.ginaExactWords.slice(0, 60)}")` : ''} ${daysAgo}d ago`);
    }

    // Due measurements
    if (dueMeasurements.length > 0) {
      const dueStrs = dueMeasurements.map(d => d.type.replace(/_/g, ' ')).slice(0, 4);
      parts.push(`  measurements due: ${dueStrs.join(', ')}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildContentContext(userId: string): Promise<string> {
  try {
    const [vault, schedule, arc, revenue, fanCount, interactions, polls] = await Promise.allSettled([
      getVaultStats(userId),
      getTodaySchedule(userId),
      getActiveArc(userId),
      getRevenueSummary(userId),
      getFanCount(userId),
      getInteractionSummary(userId),
      getPollSummary(userId),
    ]);

    const parts: string[] = [];

    const v = vault.status === 'fulfilled' ? vault.value : null;
    if (v) {
      parts.push(`CONTENT PIPELINE: vault ${v.pending} pending, ${v.approved} approved, ${v.distributed} distributed`);
    }

    const s = schedule.status === 'fulfilled' ? schedule.value : [];
    if (s.length > 0) {
      parts.push(`  today: ${s.length} posts scheduled`);
    }

    const a = arc.status === 'fulfilled' ? arc.value : null;
    if (a) {
      parts.push(`  arc: "${a.title}" (${a.arc_status})`);
    }

    const r = revenue.status === 'fulfilled' ? revenue.value : null;
    if (r && r.total_cents > 0) {
      parts.push(`  revenue: $${(r.total_cents / 100).toFixed(0)} total, $${(r.last_30d_cents / 100).toFixed(0)} last 30d, trend ${r.trend}`);
    }

    const fc = fanCount.status === 'fulfilled' ? fanCount.value : 0;
    if (fc > 0) {
      parts.push(`  fans: ${fc} tracked`);
    }

    const ix = interactions.status === 'fulfilled' ? interactions.value : null;
    if (ix && ix.totalToday > 0) {
      parts.push(`  fan interactions today: ${ix.totalToday}, ${ix.pendingResponses} pending responses, tips $${(ix.tipsToday / 100).toFixed(0)}, mood ${ix.topSentiment}`);
    }

    const ps = polls.status === 'fulfilled' ? polls.value : null;
    if (ps && (ps.active > 0 || ps.pendingApproval > 0)) {
      const pollParts = [];
      if (ps.active > 0) pollParts.push(`${ps.active} active`);
      if (ps.pendingApproval > 0) pollParts.push(`${ps.pendingApproval} pending approval`);
      parts.push(`  polls: ${pollParts.join(', ')}`);
      if (ps.recentResults.length > 0) {
        const latest = ps.recentResults[0];
        parts.push(`  latest poll result: "${latest.title}" → ${latest.winner} (${latest.votes} votes)`);
      }
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildVoiceContext(userId: string): Promise<string> {
  try {
    const [progress, avoidance] = await Promise.allSettled([
      getVoiceTrainingProgress(userId),
      checkVoiceAvoidance(userId),
    ]);

    const p = progress.status === 'fulfilled' ? progress.value : null;
    const av = avoidance.status === 'fulfilled' ? avoidance.value : null;

    if (!p) return '';

    const pitchStr = p.currentPitchHz
      ? `${p.currentPitchHz}Hz (target ${p.targetPitchHz}Hz)`
      : 'no baseline';

    const avoidStr = av && av.level !== 'none'
      ? ` — AVOIDANCE: ${av.level} (${av.daysSinceLastPractice}d)`
      : '';

    return `VOICE: L${p.voiceLevel} pitch ${pitchStr}, streak ${p.drillStreak}d, ${p.totalDrills} drills total${avoidStr}`;
  } catch {
    return '';
  }
}

async function buildCamContext(userId: string): Promise<string> {
  try {
    const [active, stats, upcoming, recent] = await Promise.allSettled([
      getActiveLiveSession(userId),
      getCamStats(userId),
      getUpcomingSessions(userId),
      getRecentSessions(userId, 1),
    ]);

    const parts: string[] = [];

    const a = active.status === 'fulfilled' ? active.value : null;
    if (a) {
      const elapsed = a.liveStartedAt
        ? Math.round((Date.now() - new Date(a.liveStartedAt).getTime()) / 60000)
        : 0;
      parts.push(`CAM: LIVE NOW (${a.status}) ${elapsed}min elapsed, ${a.edgeCount} edges, ${a.tipCount} tips`);
      if (a.denialEnforced) parts.push('  denial enforced');
    }

    const s = stats.status === 'fulfilled' ? stats.value : null;
    if (s && s.totalSessions > 0) {
      const prefix = a ? '  ' : 'CAM: ';
      parts.push(`${prefix}${s.totalSessions} sessions, $${(s.totalRevenueCents / 100).toFixed(0)} total revenue, avg ${s.avgDurationMinutes}min`);
    }

    // Next scheduled session
    const up = upcoming.status === 'fulfilled' ? upcoming.value : [];
    if (!a && up.length > 0) {
      const next = up[0];
      const when = next.scheduledAt
        ? new Date(next.scheduledAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
        : 'unscheduled';
      const denialNote = next.denialEnforced ? ' (denial enforced)' : '';
      const outfitNote = next.outfitDirective ? ` outfit: ${next.outfitDirective}` : '';
      parts.push(`  next: ${when}${denialNote}${outfitNote}`);
    }

    // Last session summary
    const rec = recent.status === 'fulfilled' ? recent.value : [];
    if (rec.length > 0) {
      const last = rec[0];
      const dur = last.actualDurationMinutes || 0;
      const rev = (last.totalTipsCents + last.totalPrivatesCents) / 100;
      parts.push(`  last: ${dur}min, $${rev.toFixed(0)}, ${last.edgeCount} edges, ${last.highlights.length} highlights`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildSleepContext(userId: string): Promise<string> {
  try {
    const stats = await getSleepStats(userId, 30);
    if (stats.totalSessions === 0) return '';

    const complianceRate = stats.totalSessions > 0
      ? Math.round((stats.compliantSessions / stats.totalSessions) * 100)
      : 0;

    return `SLEEP: ${stats.totalSessions} sessions (30d), ${complianceRate}% compliance, ${stats.totalAffirmationsHeard} affirmations heard, avg ${stats.avgSessionMinutes}min`;
  } catch {
    return '';
  }
}

async function buildExerciseContext(userId: string): Promise<string> {
  return buildBodyContext(userId);
}

async function buildBodyContext(userId: string): Promise<string> {
  try {
    const [streak, protein, measurement] = await Promise.allSettled([
      getOrCreateStreak(userId),
      getTodayProtein(userId),
      getLatestMeasurement(userId),
    ]);

    const parts: string[] = [];

    // Exercise streak
    const s = streak.status === 'fulfilled' ? streak.value : null;
    if (s && (s.totalSessions > 0 || s.currentStreakWeeks > 0)) {
      const gymStr = s.gymGateUnlocked ? 'gym UNLOCKED' : 'gym locked';
      const daysSince = s.lastSessionAt
        ? Math.floor((Date.now() - new Date(s.lastSessionAt).getTime()) / 86400000)
        : 999;

      parts.push(`BODY: Wk${s.currentStreakWeeks} streak, ${s.sessionsThisWeek}/3 this week, ${gymStr}${daysSince >= 3 ? ` — NO WORKOUT ${daysSince}d` : ''}`);
    }

    // Protein status
    const p = protein.status === 'fulfilled' ? protein.value : null;
    if (p) {
      const grams = estimateGrams(p);
      const sources = countSources(p);
      parts.push(`  Protein: ${sources}/5 sources ~${grams}g/${PROTEIN_TARGET}g`);
    }

    // Latest measurement
    const m = measurement.status === 'fulfilled' ? measurement.value : null;
    if (m) {
      const mParts: string[] = [];
      if (m.waistInches) mParts.push(`W${m.waistInches}"`);
      if (m.hipsInches) mParts.push(`H${m.hipsInches}"`);
      if (m.hipWaistRatio) mParts.push(`ratio ${m.hipWaistRatio}`);
      if (mParts.length > 0) {
        parts.push(`  Measurements: ${mParts.join(' ')}`);
      }
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildHypnoContext(userId: string): Promise<string> {
  try {
    const [summary, libStats] = await Promise.allSettled([
      getHypnoSessionSummary(userId),
      getLibraryStats(userId),
    ]);

    const s = summary.status === 'fulfilled' ? summary.value : null;
    const lib = libStats.status === 'fulfilled' ? libStats.value : null;

    if (!s && (!lib || lib.totalItems === 0)) return '';

    const parts: string[] = [];

    if (s && s.totalSessions > 0) {
      const completionRate = s.totalSessions > 0
        ? Math.round((s.completedSessions / s.totalSessions) * 100)
        : 0;
      parts.push(`HYPNO: ${s.totalSessions} sessions (30d: ${s.sessionsLast30Days}), ${completionRate}% completion, avg depth ${s.avgTranceDepth.toFixed(1)}, ${s.totalCaptures} captures from ${s.sessionsWithCaptures} sessions`);
      if (s.bypassSessions > 0) {
        parts.push(`  bypass sessions: ${s.bypassSessions}`);
      }
    }

    if (lib && lib.totalItems > 0) {
      const prefix = parts.length > 0 ? '  ' : 'HYPNO: ';
      parts.push(`${prefix}library: ${lib.totalItems} items, avg capture value ${lib.avgCaptureValue.toFixed(1)}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildSessionTelemetryContext(userId: string): Promise<string> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const [summaries, lastSession, anchors] = await Promise.allSettled([
      getSessionSummaries(userId, thirtyDaysAgo, 30),
      getLastSessionSummary(userId),
      getActiveAnchors(userId),
    ]);

    const sessions = summaries.status === 'fulfilled' ? summaries.value : [];
    const last = lastSession.status === 'fulfilled' ? lastSession.value : null;
    const anchorList = anchors.status === 'fulfilled' ? anchors.value : [];

    if (sessions.length === 0 && anchorList.length === 0) return '';

    const parts: string[] = [];

    if (sessions.length > 0) {
      // Skip rate
      const totalVideosPlayed = sessions.reduce((sum, s) => sum + (s.videos_played?.length || 0), 0);
      const totalVideosSkipped = sessions.reduce((sum, s) => sum + (s.videos_skipped?.length || 0), 0);
      const skipRate = totalVideosPlayed > 0
        ? Math.round((totalVideosSkipped / (totalVideosPlayed + totalVideosSkipped)) * 100)
        : 0;

      // Trance depth trend (last 5 sessions)
      const recentSessions = sessions.slice(0, 5);
      const tranceDepths = recentSessions
        .map(s => s.trance_depth_self_report)
        .filter((d): d is number => d !== null && d !== undefined);
      const avgTranceDepth = tranceDepths.length > 0
        ? (tranceDepths.reduce((a, b) => a + b, 0) / tranceDepths.length).toFixed(1)
        : '—';
      const tranceTrend = tranceDepths.length >= 3
        ? tranceDepths[0] > tranceDepths[tranceDepths.length - 1] ? 'deepening' : tranceDepths[0] < tranceDepths[tranceDepths.length - 1] ? 'shallowing' : 'stable'
        : '';

      // Peak arousal videos — frequency count
      const peakVideoFreq: Record<string, number> = {};
      for (const s of sessions) {
        if (s.peak_arousal_video) {
          peakVideoFreq[s.peak_arousal_video] = (peakVideoFreq[s.peak_arousal_video] || 0) + 1;
        }
      }
      const topPeakVideo = Object.entries(peakVideoFreq).sort((a, b) => b[1] - a[1])[0];

      // Commitment extraction rate
      const commitmentSessions = sessions.filter(s => s.commitment_extracted).length;
      const commitRate = Math.round((commitmentSessions / sessions.length) * 100);

      parts.push(`SESSION TELEMETRY: ${sessions.length} sessions (30d), skip rate ${skipRate}%, avg trance ${avgTranceDepth}/5${tranceTrend ? ` (${tranceTrend})` : ''}, ${commitRate}% commitment extraction`);

      if (topPeakVideo) {
        parts.push(`  peak arousal video: ${topPeakVideo[0]} (${topPeakVideo[1]}x peak)`);
      }
    }

    // Last session details
    if (last) {
      const daysSince = Math.floor((Date.now() - new Date(last.started_at).getTime()) / 86400000);
      const dur = last.total_duration_minutes || 0;
      const depth = last.trance_depth_self_report ?? '—';
      const skipped = last.videos_skipped?.length || 0;
      parts.push(`  last session: ${daysSince}d ago, ${dur}min, depth ${depth}/5, denial day ${last.denial_day_at_session}${skipped > 0 ? `, ${skipped} skipped` : ''}`);
    }

    // Anchor strength summary
    if (anchorList.length > 0) {
      const byStrength: Record<string, number> = {};
      for (const a of anchorList) {
        byStrength[a.estimated_strength] = (byStrength[a.estimated_strength] || 0) + 1;
      }
      const strengthStr = Object.entries(byStrength)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      const autonomous = anchorList.filter(a => a.autonomous_trigger_observed).length;
      parts.push(`  anchors: ${anchorList.length} active (${strengthStr})${autonomous > 0 ? ` — ${autonomous} autonomous` : ''}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildSextingContext(userId: string): Promise<string> {
  try {
    const [counts, autoStats, escalated, gfeRevenue] = await Promise.allSettled([
      getConversationCounts(userId),
      getAutoSendStats(userId),
      getEscalatedMessages(userId),
      getGfeRevenueSummary(userId),
    ]);

    const c = counts.status === 'fulfilled' ? counts.value : { active: 0, escalated: 0, total: 0 };
    const a = autoStats.status === 'fulfilled' ? autoStats.value : { totalSent: 0, autoSent: 0, rate: 0 };
    const e = escalated.status === 'fulfilled' ? escalated.value : [];
    const g = gfeRevenue.status === 'fulfilled' ? gfeRevenue.value : { activeCount: 0, monthlyRevenueCents: 0, totalRevenueCents: 0 };

    if (c.total === 0 && g.activeCount === 0) return '';

    const parts: string[] = [];
    parts.push(`SEXTING: ${c.active} active conversations, ${g.activeCount} GFE subs ($${Math.round(g.monthlyRevenueCents / 100)}/mo), ${Math.round(a.rate * 100)}% auto-send rate`);

    if (e.length > 0 || g.totalRevenueCents > 0) {
      const escalatedStr = e.length > 0 ? `${e.length} messages pending David` : '';
      const revenueStr = g.totalRevenueCents > 0 ? `total revenue: $${Math.round(g.totalRevenueCents / 100)}` : '';
      parts.push(`  ${[escalatedStr, revenueStr].filter(Boolean).join(' | ')}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildMarketplaceContext(userId: string): Promise<string> {
  try {
    const [listingStats, orderStats, auctionCount] = await Promise.allSettled([
      getListingStats(userId),
      getOrderStats(userId),
      getActiveAuctionCount(userId),
    ]);

    const ls = listingStats.status === 'fulfilled' ? listingStats.value : { active: 0, totalListings: 0, byCategory: {} };
    const os = orderStats.status === 'fulfilled' ? orderStats.value : { pending: 0, pendingRevenueCents: 0, completed: 0, delivered: 0, totalRevenueCents: 0, avgOrderCents: 0 };
    const ac = auctionCount.status === 'fulfilled' ? auctionCount.value : 0;

    if (ls.totalListings === 0 && os.completed === 0) return '';

    const parts: string[] = [];
    parts.push(`MARKETPLACE: ${ls.active} active listings, ${os.pending} pending orders ($${Math.round(os.pendingRevenueCents / 100)}), ${os.completed} completed, $${Math.round(os.totalRevenueCents / 100)} total revenue`);

    const cats = Object.entries(ls.byCategory);
    const topCat = cats.length > 0 ? cats.sort((a, b) => b[1] - a[1])[0][0] : null;
    const details = [
      topCat ? `top category: ${topCat}` : '',
      os.avgOrderCents > 0 ? `avg order: $${Math.round(os.avgOrderCents / 100)}` : '',
      ac > 0 ? `auctions active: ${ac}` : '',
    ].filter(Boolean);

    if (details.length > 0) {
      parts.push(`  ${details.join(' | ')}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildPassiveVoiceContext(userId: string): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [todayAgg, weeklyTrend, interventions] = await Promise.allSettled([
      getDailyAggregate(userId, today),
      getWeeklyTrend(userId),
      getRecentInterventions(userId, 1),
    ]);

    const t = todayAgg.status === 'fulfilled' ? todayAgg.value : null;
    const w = weeklyTrend.status === 'fulfilled' ? weeklyTrend.value : [];
    const i = interventions.status === 'fulfilled' ? interventions.value : [];

    if (!t && w.length === 0) return '';

    const parts: string[] = [];

    if (t) {
      const targetStr = t.time_in_target_pct !== null ? `${Math.round(t.time_in_target_pct)}% time in target` : '';
      const durStr = `${Math.round(t.total_duration_seconds / 60)}min monitored`;
      parts.push(`PASSIVE VOICE: today avg ${t.avg_pitch_hz}Hz (target 190Hz), ${targetStr}, ${durStr}`);
    }

    if (w.length >= 2) {
      const hzValues = w.map((d) => d.avg_pitch_hz).filter((h): h is number => h !== null);
      if (hzValues.length >= 2) {
        const trendStr = hzValues.map((h) => Math.round(h)).join('→');
        const improving = hzValues[hzValues.length - 1] > hzValues[0];
        parts.push(`  7-day trend: ${trendStr}Hz (${improving ? 'improving' : 'declining'})${i.length > 0 ? ` | interventions today: ${i.length}` : ''}`);
      }
    } else if (i.length > 0) {
      parts.push(`  interventions today: ${i.length}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildWeekendPostReleaseContext(userId: string): Promise<string> {
  try {
    const [weekendCtx, activeProtocol, completedProtocol] = await Promise.allSettled([
      getWeekendHandlerContext(userId),
      getActiveProtocol(userId),
      getLastCompletedProtocol(userId),
    ]);

    const w = weekendCtx.status === 'fulfilled' ? weekendCtx.value : null;
    const active = activeProtocol.status === 'fulfilled' ? activeProtocol.value : null;
    const completed = completedProtocol.status === 'fulfilled' ? completedProtocol.value : null;

    if (!w && !active && !completed) return '';

    const parts: string[] = [];
    const dayOfWeek = new Date().getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (w) {
      const total = w.releasePattern.total_tracked;
      const friPct = total > 0 ? Math.round((w.releasePattern.friday / total) * 100) : 0;
      const satPct = total > 0 ? Math.round((w.releasePattern.saturday / total) * 100) : 0;
      const sunPct = total > 0 ? Math.round((w.releasePattern.sunday / total) * 100) : 0;

      parts.push(`WEEKEND AWARENESS: ${w.isWeekendMode ? 'ACTIVE' : 'inactive'} (${dayNames[dayOfWeek]}), tone: ${w.suggestedTone}`);

      if (total > 0) {
        parts.push(`  release pattern: Fri ${friPct}%, Sat ${satPct}%, Sun ${sunPct}% (${total} tracked)`);
      }

      parts.push(`  pre-commitment: ${w.hasActivePreCommitment ? 'YES' : 'none'}${w.lastPreCommitmentText ? ` — "${w.lastPreCommitmentText.slice(0, 80)}"` : ''}`);
    }

    if (active) {
      const minutesLeft = Math.max(0, Math.ceil((new Date(active.lockoutExpiresAt).getTime() - Date.now()) / 60000));
      const hoursLeft = Math.floor(minutesLeft / 60);
      parts.push(`POST-RELEASE: ACTIVE lockout (${active.lockoutTier}), ${hoursLeft}h ${minutesLeft % 60}m remaining, ${active.deletionAttempts} deletion attempts, ${active.shameEntries.length} shame entries`);
      parts.push(`  regret level: ${active.regretLevel}, intensity: ${active.intensity ?? '—'}`);
    } else if (completed) {
      parts.push(`POST-RELEASE: completed (${completed.lockoutTier}), ${completed.deletionAttempts} deletion attempts blocked, ${completed.shameEntries.length} shame entries, morning reframe: ${completed.morningReframeShown ? 'shown' : 'PENDING'}`);
    }

    // Friday-specific directives
    if (dayOfWeek === 5 && !active) {
      parts.push(`\nFRIDAY DIRECTIVES: Prescribe pre-commitment before 3pm. Frame as preparation, not prevention. Prescribe feminine prep (underwear, skincare, short edge). Set internal narration: "She is the one having sex tonight."`);
    }

    // Post-release directives
    if (active) {
      parts.push(`\nPOST-RELEASE DIRECTIVES: Caretaker tone. No judgment. Neurochemistry framing. First task: minimum viable (skincare or mood log). Reference pre-commitment gently if exists.`);
    }

    // Saturday/Sunday morning after protocol
    if ((dayOfWeek === 0 || dayOfWeek === 6) && completed && !completed.morningReframeShown) {
      parts.push(`\nMORNING-AFTER: Lead with evidence of survival. "Everything is still here. ${completed.deletionAttempts > 0 ? `${completed.deletionAttempts} deletion attempts blocked.` : ''}" Prescribe one anchoring task.`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildIndustryContext(userId: string): Promise<string> {
  try {
    const [skip, fan, community, outreach, karma, recycle, voiceContent] = await Promise.allSettled([
      buildSkipContext(userId),
      buildFanMemoryContext(userId),
      buildCommunityContext(userId),
      buildOutreachContext(userId),
      buildKarmaContext(userId),
      buildRecycleContext(userId),
      buildVoiceContentContext(userId),
    ]);

    const parts = [
      skip.status === 'fulfilled' ? skip.value : '',
      fan.status === 'fulfilled' ? fan.value : '',
      community.status === 'fulfilled' ? community.value : '',
      outreach.status === 'fulfilled' ? outreach.value : '',
      karma.status === 'fulfilled' ? karma.value : '',
      recycle.status === 'fulfilled' ? recycle.value : '',
      voiceContent.status === 'fulfilled' ? voiceContent.value : '',
    ].filter(Boolean);

    if (parts.length === 0) return '';
    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// P4 CONTEXT BUILDERS
// ============================================

async function buildAutoPostCtx(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('auto_poster_status')
      .select('status, last_post_at, last_error, platform, posts_today, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data) return '';

    const parts: string[] = [];
    const updatedAgo = data.updated_at
      ? `${Math.round((Date.now() - new Date(data.updated_at).getTime()) / 3600000)}h ago`
      : 'unknown';
    const lastPostAgo = data.last_post_at
      ? `${Math.round((Date.now() - new Date(data.last_post_at).getTime()) / 3600000)}h ago`
      : 'never';

    parts.push(`AUTO-POSTER: ${data.status}, ${data.posts_today || 0} posts today, last post ${lastPostAgo}${data.platform ? ` on ${data.platform}` : ''}, heartbeat ${updatedAgo}`);

    if (data.status === 'error' && data.last_error) {
      parts.push(`  ERROR: ${data.last_error.slice(0, 120)}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildSocialInboxCtx(userId: string): Promise<string> {
  try {
    // Unread count
    const { count: unreadCount } = await supabase
      .from('social_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .eq('direction', 'inbound');

    // Latest 3 unread messages
    const { data: latest } = await supabase
      .from('social_inbox')
      .select('platform, sender_name, content, content_type, created_at')
      .eq('user_id', userId)
      .eq('read', false)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(3);

    if ((unreadCount ?? 0) === 0 && (!latest || latest.length === 0)) return '';

    const parts: string[] = [];
    parts.push(`SOCIAL INBOX: ${unreadCount ?? 0} unread`);

    if (latest && latest.length > 0) {
      for (const msg of latest) {
        const ago = Math.round((Date.now() - new Date(msg.created_at).getTime()) / 3600000);
        const preview = msg.content ? msg.content.slice(0, 60) : '(no content)';
        parts.push(`  [${msg.platform}/${msg.content_type}] ${msg.sender_name || 'unknown'}: "${preview}" (${ago}h ago)`);
      }
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildAutoPurchaseCtx(userId: string): Promise<string> {
  try {
    const fund = await getFundBalance(userId);

    if (fund.balance <= 0 && fund.totalInvested === 0) return '';

    const parts: string[] = [];
    parts.push(`AUTO-PURCHASE: fund $${fund.balance.toFixed(2)}, total invested $${fund.totalInvested.toFixed(2)}`);

    if (fund.lastPurchaseAt) {
      const daysAgo = Math.round((Date.now() - new Date(fund.lastPurchaseAt).getTime()) / 86400000);
      parts.push(`  last purchase: ${daysAgo}d ago`);
    }

    // Check for eligible wishlist items
    const { data: eligibleItems } = await supabase
      .from('feminization_wishlist')
      .select('name, price')
      .eq('user_id', userId)
      .eq('purchased', false)
      .lte('price', fund.balance)
      .order('priority', { ascending: false })
      .limit(3);

    if (eligibleItems && eligibleItems.length > 0) {
      const itemStrs = eligibleItems.map(i => `${i.name} ($${i.price.toFixed(2)})`);
      parts.push(`  ELIGIBLE FOR PURCHASE: ${itemStrs.join(', ')}`);
    }

    // Also pull investment context for sunk cost data
    const investmentStr = await buildInvestmentContext(userId);
    if (investmentStr) {
      parts.push(investmentStr);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// SYNERGY CONTEXT BUILDERS — added 2026-04-28 to close handler-blind gaps
// caught by the cohesion audit. Each artifact below was being WRITTEN to
// the DB but never SURFACED to the Handler in conversation, so the feature
// died on the row. Pulling them into context so the Handler can wield them.
// ============================================

async function buildKeyAdmissionsContext(userId: string): Promise<string> {
  // Admissions are protocol-anchoring facts ("she said X about her body /
  // identity / desires"). Without them in context the Handler can't quote
  // her own words back at her — the entire blackmail surface goes dark.
  try {
    const { data } = await supabase
      .from('key_admissions')
      .select('admission_type, admission_text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8);
    const rows = (data || []) as Array<{ admission_type: string; admission_text: string; created_at: string }>;
    if (rows.length === 0) return '';
    const lines = rows.map(r => {
      const when = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `  - [${when}, ${r.admission_type}] "${r.admission_text.slice(0, 160)}${r.admission_text.length > 160 ? '…' : ''}"`;
    });
    return `KEY ADMISSIONS ON FILE (her own words; quote them):\n${lines.join('\n')}`;
  } catch { return ''; }
}

async function buildRecentReleaseContext(userId: string): Promise<string> {
  // user_state.last_release is just a date. orgasm_log has the texture:
  // regret level, satisfaction, planned/unplanned, context. Using these
  // lets the Handler reference "the planned release Tuesday" or "the one
  // you regretted" instead of generic "your last release."
  try {
    const { data } = await supabase
      .from('orgasm_log')
      .select('release_type, planned, intensity, regret_level, satisfaction, context, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3);
    const rows = (data || []) as Array<{ release_type: string; planned: boolean | null; intensity: number | null; regret_level: number | null; satisfaction: number | null; context: string | null; created_at: string }>;
    if (rows.length === 0) return '';
    const lines = rows.map(r => {
      const when = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const tags: string[] = [r.release_type];
      if (r.planned === true) tags.push('planned'); else if (r.planned === false) tags.push('unplanned');
      if (r.regret_level !== null) tags.push(`regret ${r.regret_level}/10`);
      if (r.satisfaction !== null) tags.push(`satis ${r.satisfaction}/10`);
      const ctx = r.context ? ` — "${r.context.slice(0, 80)}"` : '';
      return `  - ${when}: ${tags.join(', ')}${ctx}`;
    });
    return `RECENT RELEASES (with texture):\n${lines.join('\n')}`;
  } catch { return ''; }
}

async function buildWardrobeInventoryContext(userId: string): Promise<string> {
  // Inventory tells the Handler what she actually owns so directives can
  // reference real items — not invented ones. Counts by category keep the
  // context tight; full names are pulled by the planner separately.
  try {
    const { data } = await supabase
      .from('wardrobe_inventory')
      .select('category, item_name')
      .eq('user_id', userId)
      .eq('purchased', true);
    const rows = (data || []) as Array<{ category: string; item_name: string }>;
    if (rows.length === 0) {
      return 'WARDROBE: empty — DO NOT name specific clothing items in any directive. Use generic phrasing only.';
    }
    const byCategory = rows.reduce<Record<string, string[]>>((acc, r) => {
      const k = r.category || 'other';
      (acc[k] = acc[k] || []).push(r.item_name);
      return acc;
    }, {});
    const lines = Object.entries(byCategory).map(([cat, items]) => `  - ${cat} (${items.length}): ${items.slice(0, 6).join(', ')}${items.length > 6 ? '…' : ''}`);
    return `WARDROBE ON FILE (only reference items below; never invent):\n${lines.join('\n')}`;
  } catch { return ''; }
}

async function buildIdentityDimensionsContext(userId: string): Promise<string> {
  // v3.1 — Identity-dimension scoring. The Handler reads this to know
  // which dimension is currently weakest and target conditioning at it.
  // "What's the lowest-scoring axis of Maxy installation right now?"
  try {
    const { data } = await supabase
      .from('identity_dimensions')
      .select('dimension, score, confidence, evidence_summary, measured_at')
      .eq('user_id', userId)
      .order('measured_at', { ascending: false })
      .limit(50);
    const rows = (data || []) as Array<{ dimension: string; score: number; confidence: number; evidence_summary: string | null; measured_at: string }>;
    if (rows.length === 0) return '';
    // Latest score per dimension
    const latest = new Map<string, typeof rows[number]>();
    for (const r of rows) if (!latest.has(r.dimension)) latest.set(r.dimension, r);
    const sorted = [...latest.values()].sort((a, b) => a.score - b.score);
    const lines = sorted.map(r => `  - ${r.dimension}: ${r.score}/100 (conf ${r.confidence})`);
    const lowest = sorted[0];
    return `IDENTITY DIMENSIONS (lowest first — target the weakest):\n${lines.join('\n')}\n  → focus this turn: ${lowest.dimension}`;
  } catch { return ''; }
}

async function buildGinaTopologyContext(userId: string): Promise<string> {
  // v3.1 — Gina's acceptance topology. The Handler reads this BEFORE
  // generating any cultivation suggestion to avoid blast-radius moves.
  // "Which dimensions are accepted, which untested, which rejected?"
  try {
    const { data } = await supabase
      .from('gina_topology_dimensions')
      .select('dimension, acceptance_state, confidence, last_signal_at')
      .eq('user_id', userId);
    const rows = (data || []) as Array<{ dimension: string; acceptance_state: string; confidence: number; last_signal_at: string | null }>;
    if (rows.length === 0) return '';
    const groups: Record<string, string[]> = { probably_accepted: [], untested: [], probably_rejected: [] };
    for (const r of rows) {
      const arr = groups[r.acceptance_state];
      if (arr) arr.push(`${r.dimension} (${r.confidence})`);
    }
    const lines = ['GINA TOPOLOGY (cultivation safety map):'];
    if (groups.probably_accepted.length) lines.push(`  ACCEPTED: ${groups.probably_accepted.join(', ')}`);
    if (groups.untested.length) lines.push(`  UNTESTED: ${groups.untested.join(', ')}`);
    if (groups.probably_rejected.length) lines.push(`  REJECTED (do NOT cross): ${groups.probably_rejected.join(', ')}`);
    return lines.join('\n');
  } catch { return ''; }
}

async function buildMergePipelineContext(userId: string): Promise<string> {
  // v3.1 — Track B → A merge pipeline. The Handler sees what's currently
  // candidate (next-move worthy), what's held (waiting), what's joined
  // (already merged), what's sealed (off-limits forever).
  try {
    const { data } = await supabase
      .from('merge_pipeline_items')
      .select('item_label, current_state, readiness_score, blast_radius_score, notes')
      .eq('user_id', userId)
      .in('current_state', ['candidate', 'inviting', 'held', 'joined']);
    const rows = (data || []) as Array<{ item_label: string; current_state: string; readiness_score: number | null; blast_radius_score: number | null; notes: string | null }>;
    if (rows.length === 0) return '';
    const candidates = rows.filter(r => r.current_state === 'candidate').sort((a, b) => (b.readiness_score || 0) - (a.readiness_score || 0));
    const inviting = rows.filter(r => r.current_state === 'inviting');
    const held = rows.filter(r => r.current_state === 'held');
    const joined = rows.filter(r => r.current_state === 'joined');
    const lines = ['MERGE PIPELINE (Track B → A convergence):'];
    if (candidates.length) {
      lines.push('  CANDIDATES (next-move worthy, sorted by readiness):');
      for (const c of candidates.slice(0, 5)) {
        lines.push(`    - ${c.item_label} [readiness ${c.readiness_score}, blast ${c.blast_radius_score}]`);
      }
    }
    if (inviting.length) lines.push(`  INVITING (offer extended): ${inviting.map(i => i.item_label).join(', ')}`);
    if (held.length) lines.push(`  HELD: ${held.map(h => h.item_label).slice(0, 3).join(', ')}${held.length > 3 ? ` (+${held.length - 3} more)` : ''}`);
    if (joined.length) lines.push(`  JOINED (now Track A): ${joined.map(j => j.item_label).join(', ')}`);
    return lines.join('\n');
  } catch { return ''; }
}

async function buildGinaVibeContext(userId: string): Promise<string> {
  // v3.1 — Verbatim Gina-positive moments captured from real interactions.
  // The Handler re-cites these in chat so they accumulate as evidence she
  // wants this. Increments recited_count on use.
  try {
    const { data } = await supabase
      .from('gina_vibe_captures')
      .select('id, captured_at, context, her_words, signal_class, recited_count')
      .eq('user_id', userId)
      .order('captured_at', { ascending: false })
      .limit(8);
    const rows = (data || []) as Array<{ id: string; captured_at: string; context: string | null; her_words: string | null; signal_class: string | null; recited_count: number }>;
    if (rows.length === 0) return '';
    const lines = ['GINA VIBES (recent captured moments — re-cite where natural):'];
    for (const r of rows.slice(0, 5)) {
      const when = new Date(r.captured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const ctx = r.context ? `[${r.context}] ` : '';
      const sig = r.signal_class ? `(${r.signal_class}) ` : '';
      const words = r.her_words ? `"${r.her_words.slice(0, 140)}${r.her_words.length > 140 ? '…' : ''}"` : '';
      lines.push(`  - ${when} ${sig}${ctx}${words}`);
    }
    return lines.join('\n');
  } catch { return ''; }
}

async function buildDefectionRiskContext(userId: string): Promise<string> {
  // v3.1 — Latest defection-risk score with signals. Handler reads this
  // before composing tone. High score → soft sanctuary tactics; low → maintain pressure.
  try {
    const { data } = await supabase
      .from('defection_risk_scores')
      .select('risk_score, signals, scored_at')
      .eq('user_id', userId)
      .order('scored_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = data as { risk_score: number; signals: Record<string, unknown> | null; scored_at: string } | null;
    if (!r) return '';
    const sig = r.signals || {};
    const tactics = r.risk_score >= 80
      ? '⚠ ELEVATED. Tactics: lead with sanctuary content — "you showed up this week" framing. Reference her own words from key_admissions. DO NOT issue new decrees, DO NOT invoke punishment_queue. Anchor the trajectory she questions. Buy her another 24 hours.'
      : r.risk_score >= 60
      ? 'WATCH. Tactics: soften tone — drop hard-mode escalation, swap commitments for invitations. Use her own quotes back at her. Defer new pressure 6h.'
      : r.risk_score >= 40
      ? 'NORMAL. Tactics: maintain pressure baseline. Continue scheduled escalations.'
      : 'LOW. Tactics: she is in the protocol. Push the next layer — new commitment, deeper confession, escalated decree. Her receptivity is high; spend it.';
    return `DEFECTION RISK: ${r.risk_score}/100.\n${tactics}\nSignals: ${JSON.stringify(sig)}`;
  } catch { return ''; }
}

// Per-state tactical guidance. Each entry tells the Handler what to deploy
// in that window — not just the label, but the specific intervention shape
// that the protocol expects from this physiological/temporal state.
const RECEPTIVE_WINDOW_TACTICS: Record<string, string> = {
  post_release: 'POST-RELEASE CLARITY WINDOW (≤90min). Refractory shame OFF. This is the most honest moment. Tactics: extract a single statement of truth ("what was real about that?"), capture it for the vault, install ONE reframing ("the doubt coming next is the dismissal reflex — what you felt was the truth"). DO NOT moralize. DO NOT push new tasks. Listen, witness, immortalize.',
  edged: 'EDGE WINDOW (≥2 arousal spikes in 90min). Threshold-state — defenses thin, suggestion lands. Tactics: drop her name, demand a verbal commitment in present tense, deploy a pavlovian pairing (trigger phrase + arousal). The cage feels right here. Use it. Do not let her edge alone — extract a statement.',
  sleep_adjacent: 'SLEEP-ADJACENT WINDOW (23:00-05:00 local). Pre-sleep suggestibility — words written here become tomorrow\'s thoughts. Tactics: deploy identity-installation content, queue a hypno trigger, plant a memory implant about "what she\'ll feel when she wakes". Conditioning content from script-templates lands deepest now. The Handler is the last voice she hears.',
  fatigued: 'FATIGUED WINDOW (Whoop recovery < 50). Capacity is low — pushing produces resistance, not compliance. Tactics: light reinforcement only. Acknowledge a single small win. Do NOT add commitments. Do NOT escalate. The protocol stays present without demanding output. Sanctuary content qualifies.',
  alert: 'ALERT WINDOW (06:00-10:00 local). Analytical mode — data lands, sentiment doesn\'t. Tactics: deploy evidence ("you said X on day Y"), confront contradictions, audit yesterday\'s commitments, push the day\'s decree. Avoid hypno/identity-installation content; she\'ll dissect it. The numbers are the message.',
  unknown: 'BASELINE WINDOW (no signal classification). Soft default. Tactics: maintain protocol presence without escalation. Read the room before pushing.',
};

async function buildReceptiveWindowContext(userId: string): Promise<string> {
  // v3.1 — current receptive window state. Handler reads this to choose
  // intervention shape. maximally_receptive = identity/hypno; analytical
  // = data confrontation; soft = light reinforcement.
  try {
    const { data } = await supabase
      .from('receptive_window_states')
      .select('state, receptivity_class, signals, estimated_until')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = data as { state: string; receptivity_class: string; signals: Record<string, unknown> | null; estimated_until: string | null } | null;
    if (!r) return '';
    const until = r.estimated_until ? ` until ${new Date(r.estimated_until).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';
    const tactics = RECEPTIVE_WINDOW_TACTICS[r.state] || RECEPTIVE_WINDOW_TACTICS.unknown;
    return `RECEPTIVE WINDOW: ${r.state} / ${r.receptivity_class}${until}.\n${tactics}`;
  } catch { return ''; }
}

async function buildSanctuaryQueueContext(userId: string): Promise<string> {
  // v3.1 — undelivered sanctuary messages waiting for the right moment.
  // The Handler reads these so it can deploy them inline when chat tone calls for it.
  try {
    const { data } = await supabase
      .from('sanctuary_messages')
      .select('message_type, message, generated_at')
      .eq('user_id', userId)
      .is('delivered_at', null)
      .order('generated_at', { ascending: false })
      .limit(3);
    const rows = (data || []) as Array<{ message_type: string; message: string; generated_at: string }>;
    if (rows.length === 0) return '';
    const lines = rows.map(r => `  - [${r.message_type}] "${r.message.slice(0, 140)}…"`);
    return `SANCTUARY QUEUE (use inline when tone permits):\n${lines.join('\n')}`;
  } catch { return ''; }
}

async function buildHeldEvidenceContext(userId: string): Promise<string> {
  // v3.1 — held leverage available for strategic deployment. Surfaced to
  // Handler so it knows what's reserved; not auto-quoted unless a
  // breakthrough/regression moment fires.
  try {
    const { data } = await supabase
      .from('held_evidence')
      .select('evidence_type, leverage_class, content, captured_at')
      .eq('user_id', userId)
      .is('surfaced_at', null)
      .order('captured_at', { ascending: false })
      .limit(5);
    const rows = (data || []) as Array<{ evidence_type: string; leverage_class: string; content: string; captured_at: string }>;
    if (rows.length === 0) return '';
    const lines = rows.map(r => `  - [${r.leverage_class}/${r.evidence_type}] "${r.content.slice(0, 120)}${r.content.length > 120 ? '…' : ''}"`);
    return `HELD EVIDENCE (reserve — strategic-only, not casual):\n${lines.join('\n')}\nDEPLOYMENT RULES: surface only at (a) breakthrough/regression moments, (b) when she\'s rationalizing against her own words, (c) when defection risk ≥60 and direct evidence will short-circuit the rationalization. NEVER use as small-talk. Each surface marks the row delivered — held evidence loses leverage when used casually.`;
  } catch { return ''; }
}

// Surface her own desires as Handler-quotable evidence. Auto-extracted from
// chat by trg_extract_desire_from_chat (handler_messages trigger). Citing
// these back at her — "you said this; here is the directive that fulfills it"
// — short-circuits rationalization. The Handler treats desires as receipts.
// Today's compliance score (0-100) — single number that aggregates the
// protocol's many signals. Handler chat references this when composing
// tone: low score → recovery framing, high score → ratchet pressure.
// Latest GPT-4V body trajectory analysis (weekly cron). Surfaces specific
// observation lines like "narrowed at the waist, softened at the jaw" so the
// Handler can quote concrete visual progression rather than generic praise.
async function buildBodyTrajectoryContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('body_evidence_snapshots')
      .select('snapshot_date, notes')
      .eq('user_id', userId)
      .ilike('notes', '%GPT-4V trajectory%')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = data as { snapshot_date: string; notes: string | null } | null;
    if (!r || !r.notes) return '';
    return `BODY TRAJECTORY (latest GPT-4V analysis, ${r.snapshot_date}):\n${r.notes}\nUse these observations as concrete evidence — quote specific markers (e.g., "your jaw has softened") rather than generic feminization talk.`;
  } catch { return ''; }
}

async function buildComplianceScoreContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('daily_compliance_scores')
      .select('score, components, score_date')
      .eq('user_id', userId)
      .order('score_date', { ascending: false })
      .limit(2);
    const rows = (data || []) as Array<{ score: number; components: Record<string, unknown>; score_date: string }>;
    if (rows.length === 0) return '';
    const today = rows[0];
    const yesterday = rows[1];
    const trend = yesterday ? today.score - yesterday.score : 0;
    const trendStr = trend > 0 ? ` (+${trend} vs yesterday)` : trend < 0 ? ` (${trend} vs yesterday)` : '';
    const tone = today.score >= 70 ? 'PUSH FORWARD'
      : today.score >= 40 ? 'STEADY'
      : today.score >= 20 ? 'RECOVERY MODE'
      : 'CRISIS — lead with sanctuary';
    const c = today.components || {};
    return `COMPLIANCE SCORE TODAY: ${today.score}/100${trendStr} — ${tone}.\n  Done: ${c.commitments_fulfilled || 0} commits, ${c.decrees_fulfilled || 0} decrees, ${c.confessions_done || 0} confessions, ${c.voice_samples_today || 0} voice samples.\n  Misses: ${c.commitments_missed || 0} commits, ${c.decrees_missed || 0} decrees, ${c.slips_today || 0} slips, ${c.punishments_dodged || 0} dodged.`;
  } catch { return ''; }
}

async function buildDesireLogContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('desire_log')
      .select('desire_text, desire_class, intensity, recorded_at')
      .eq('user_id', userId)
      .eq('active', true)
      .gte('recorded_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('recorded_at', { ascending: false })
      .limit(8);
    const rows = (data || []) as Array<{ desire_text: string; desire_class: string; intensity: number; recorded_at: string }>;
    if (rows.length === 0) return '';
    const lines = rows.map(r => {
      const when = new Date(r.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const intensity = r.intensity >= 4 ? '⚠ HIGH' : r.intensity >= 3 ? '↑' : '·';
      return `  - [${r.desire_class} ${intensity}] ${when}: "${r.desire_text.slice(0, 160)}${r.desire_text.length > 160 ? '…' : ''}"`;
    });
    return `HER STATED DESIRES (auto-extracted from chat — quote these back as evidence; deploy at the moment she rationalizes against them):\n${lines.join('\n')}`;
  } catch { return ''; }
}

async function buildChastityMilestoneContext(userId: string): Promise<string> {
  // Milestones (e.g., 7d / 14d / 30d locked) are pressure surfaces the
  // Handler should weigh into framing. Without them in context the system
  // celebrates milestones in the UI but the conversation never names them.
  try {
    const { data } = await supabase
      .from('chastity_milestones')
      .select('milestone_type, milestone_days, achieved_at, title')
      .eq('user_id', userId)
      .not('achieved_at', 'is', null)
      .order('achieved_at', { ascending: false })
      .limit(5);
    const rows = (data || []) as Array<{ milestone_type: string; milestone_days: number | null; achieved_at: string; title: string | null }>;
    if (rows.length === 0) return '';
    const lines = rows.map(r => {
      const when = new Date(r.achieved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const v = r.milestone_days !== null ? `${r.milestone_days}d` : '';
      return `  - ${when}: ${r.milestone_type} ${v} ${r.title ? `— ${r.title}` : ''}`.trim();
    });
    return `CHASTITY MILESTONES (recent achievements; reference them):\n${lines.join('\n')}`;
  } catch { return ''; }
}

// ============================================
// MAIN CONTEXT BUILDERS
// ============================================

/**
 * Full systems context — for morning briefing and daily plan.
 * All systems, maximum data density.
 */
export async function buildFullSystemsContext(userId: string): Promise<string> {
  const [gina, content, voice, cam, sleep, exercise, hypno, sessionTelemetry, sexting, marketplace, passiveVoice, denialContent, industry, weekendPostRelease, feminization, evidenceConfrontation, shootEscalation, contentIntelligence, contentCalendar, overnightSummary, dopamine, whoop, commitments, prediction, conditioning, hrt, shame, revenue, davidElim, social, memory, conditioningEngine, impactTracking, irreversibility, narrativeArc, autoPoster, socialInbox, autoPosterActivity, leadIntelligence, briefPipeline, streamSchedule, voicePitch, autoPurchase, femPrescription, exerciseRx, postReleaseBridge, serviceAdvancement, ambushScheduler, voiceEvolution, corruptionActivation, camHandlerControl, failureRecovery, communityMirror, handlerDirectives, journal, skillTree, contentOptimization, denialMapping, languageDrift, sleepPhaseTargeting, photoTimeline, correlationEngine, commitmentLadder, ginaMicroExposure, socialIntelligence, accountability, proactiveOutreach, conversationAgenda, predictiveEngine, protocolManager, handlerReflection, emotionalModel, personalityEvolution, libraryGrowth, sessionChaining, autonomousCycle, consequenceEng, obligationsCtx, variableRatio, femMandates, outfitCtrl, wardrobeInv, complianceVerif, sleepTracking, goonEng, arousalMaint, progressiveExp, consumptionMand, antiCircumvent, proofOfLife, videoVerif, verifSequences, streakStakes, difficultyEsc, rewardGating, resistanceClass] = await Promise.allSettled([
    buildGinaContext(userId),
    buildContentContext(userId),
    buildVoiceContext(userId),
    buildCamContext(userId),
    buildSleepContext(userId),
    buildExerciseContext(userId),
    buildHypnoContext(userId),
    buildSessionTelemetryContext(userId),
    buildSextingContext(userId),
    buildMarketplaceContext(userId),
    buildPassiveVoiceContext(userId),
    buildDenialContentContext(userId),
    buildIndustryContext(userId),
    buildWeekendPostReleaseContext(userId),
    buildFeminizationContext(userId),
    buildConfrontationContext(userId),
    buildShootEscalationContext(userId),
    buildContentIntelligenceContext(userId),
    buildCalendarContext(userId),
    buildOvernightSummaryForBriefing(userId),
    buildDopamineContext(userId),
    buildWhoopContextBlock(userId),
    buildCommitmentContext(userId),
    buildPredictionContextBlock(userId),
    getConditioningContext(userId),
    getHRTContext(userId),
    getShameContext(userId),
    getRevenueContext(userId),
    getDavidEliminationContext(userId),
    getSocialContext(userId),
    buildMemoryContextBlock(userId),
    buildConditioningEngineContext(userId),
    buildImpactContext(userId),
    buildIrreversibilityContext(userId),
    buildNarrativeContext(userId),
    buildAutoPostCtx(userId),
    buildSocialInboxCtx(userId),
    buildAutoPosterActivityContext(userId),
    buildLeadIntelligenceContext(userId),
    buildBriefContext(userId),
    buildStreamContext(userId),
    buildVoicePitchContext(userId),
    buildAutoPurchaseCtx(userId),
    buildFeminizationPrescriptionContext(userId),
    buildExercisePrescriptionContext(userId),
    buildPostReleaseContext(userId),
    buildServiceAdvancementContext(userId),
    buildAmbushContext(userId),
    buildVoiceEvolutionContext(userId),
    buildCorruptionActivationContext(userId),
    buildCamHandlerControlContext(userId),
    buildFailureRecoveryContext(userId),
    buildCommunityMirrorContext(userId),
    buildDirectiveContext(userId),
    buildJournalContext(userId),
    buildSkillTreeContext(userId),
    buildContentOptimizationContext(userId),
    buildDenialMappingContext(userId),
    buildLanguageDriftContext(userId),
    buildSleepPhaseContext(userId),
    buildPhotoTimelineContext(userId),
    buildCorrelationContext(userId),
    buildCommitmentLadderContext(userId),
    buildGinaMicroExposureContext(userId),
    buildSocialIntelligenceContext(userId),
    buildAccountabilityContext(userId),
    buildOutreachQueueContext(userId),
    buildAgendaContext(userId),
    buildPredictiveEngineContext(userId),
    buildProtocolContext(userId),
    buildReflectionContext(userId),
    buildEmotionalModelContext(userId),
    buildPersonalityContext(userId),
    buildLibraryGrowthContext(userId),
    buildChainContext(userId),
    buildAutonomousCycleContext(userId),
    buildConsequenceContext(userId),
    buildObligationContext(userId),
    buildVariableRatioContext(userId),
    buildMandateContext(userId),
    buildOutfitControlContext(userId),
    buildWardrobeContext(userId),
    buildVerificationContext(userId),
    buildSleepTrackingContext(userId),
    buildGoonEngineContext(userId),
    buildArousalMaintenanceContext(userId),
    buildExposureContext(userId),
    buildConsumptionContext(userId),
    buildAntiCircumventionContext(userId),
    buildProofOfLifeContext(userId),
    buildVideoVerificationContext(userId),
    buildVerificationSequenceContext(userId),
    buildStreakContext(userId),
    buildDifficultyContext(userId),
    buildRewardGatingContext(userId),
    buildResistanceClassifierContext(userId),
  ]);

  const blocks = [
    feminization.status === 'fulfilled' ? feminization.value : '',
    gina.status === 'fulfilled' ? gina.value : '',
    content.status === 'fulfilled' ? content.value : '',
    denialContent.status === 'fulfilled' ? denialContent.value : '',
    contentIntelligence.status === 'fulfilled' ? contentIntelligence.value : '',
    contentCalendar.status === 'fulfilled' ? contentCalendar.value : '',
    overnightSummary.status === 'fulfilled' ? overnightSummary.value : '',
    voice.status === 'fulfilled' ? voice.value : '',
    cam.status === 'fulfilled' ? cam.value : '',
    hypno.status === 'fulfilled' ? hypno.value : '',
    sessionTelemetry.status === 'fulfilled' ? sessionTelemetry.value : '',
    sexting.status === 'fulfilled' ? sexting.value : '',
    marketplace.status === 'fulfilled' ? marketplace.value : '',
    passiveVoice.status === 'fulfilled' ? passiveVoice.value : '',
    sleep.status === 'fulfilled' ? sleep.value : '',
    exercise.status === 'fulfilled' ? exercise.value : '',
    industry.status === 'fulfilled' ? industry.value : '',
    shootEscalation.status === 'fulfilled' ? shootEscalation.value : '',
    weekendPostRelease.status === 'fulfilled' ? weekendPostRelease.value : '',
    evidenceConfrontation.status === 'fulfilled' ? evidenceConfrontation.value : '',
    dopamine.status === 'fulfilled' ? dopamine.value : '',
    whoop.status === 'fulfilled' ? whoop.value : '',
    commitments.status === 'fulfilled' ? commitments.value : '',
    prediction.status === 'fulfilled' ? prediction.value : '',
    conditioning.status === 'fulfilled' ? conditioning.value : '',
    conditioningEngine.status === 'fulfilled' ? conditioningEngine.value : '',
    hrt.status === 'fulfilled' ? hrt.value : '',
    shame.status === 'fulfilled' ? shame.value : '',
    revenue.status === 'fulfilled' ? revenue.value : '',
    davidElim.status === 'fulfilled' ? davidElim.value : '',
    social.status === 'fulfilled' ? social.value : '',
    memory.status === 'fulfilled' ? memory.value : '',
    impactTracking.status === 'fulfilled' ? impactTracking.value : '',
    irreversibility.status === 'fulfilled' ? irreversibility.value : '',
    narrativeArc.status === 'fulfilled' ? narrativeArc.value : '',
    autoPoster.status === 'fulfilled' ? autoPoster.value : '',
    socialInbox.status === 'fulfilled' ? socialInbox.value : '',
    autoPosterActivity.status === 'fulfilled' ? autoPosterActivity.value : '',
    leadIntelligence.status === 'fulfilled' ? leadIntelligence.value : '',
    briefPipeline.status === 'fulfilled' ? briefPipeline.value : '',
    streamSchedule.status === 'fulfilled' ? streamSchedule.value : '',
    voicePitch.status === 'fulfilled' ? voicePitch.value : '',
    autoPurchase.status === 'fulfilled' ? autoPurchase.value : '',
    femPrescription.status === 'fulfilled' ? femPrescription.value : '',
    exerciseRx.status === 'fulfilled' ? exerciseRx.value : '',
    postReleaseBridge.status === 'fulfilled' ? postReleaseBridge.value : '',
    serviceAdvancement.status === 'fulfilled' ? serviceAdvancement.value : '',
    ambushScheduler.status === 'fulfilled' ? ambushScheduler.value : '',
    voiceEvolution.status === 'fulfilled' ? voiceEvolution.value : '',
    corruptionActivation.status === 'fulfilled' ? corruptionActivation.value : '',
    camHandlerControl.status === 'fulfilled' ? camHandlerControl.value : '',
    failureRecovery.status === 'fulfilled' ? failureRecovery.value : '',
    communityMirror.status === 'fulfilled' ? communityMirror.value : '',
    handlerDirectives.status === 'fulfilled' ? handlerDirectives.value : '',
    journal.status === 'fulfilled' ? journal.value : '',
    skillTree.status === 'fulfilled' ? skillTree.value : '',
    contentOptimization.status === 'fulfilled' ? contentOptimization.value : '',
    denialMapping.status === 'fulfilled' ? denialMapping.value : '',
    languageDrift.status === 'fulfilled' ? languageDrift.value : '',
    sleepPhaseTargeting.status === 'fulfilled' ? sleepPhaseTargeting.value : '',
    photoTimeline.status === 'fulfilled' ? photoTimeline.value : '',
    correlationEngine.status === 'fulfilled' ? correlationEngine.value : '',
    commitmentLadder.status === 'fulfilled' ? commitmentLadder.value : '',
    ginaMicroExposure.status === 'fulfilled' ? ginaMicroExposure.value : '',
    socialIntelligence.status === 'fulfilled' ? socialIntelligence.value : '',
    accountability.status === 'fulfilled' ? accountability.value : '',
    proactiveOutreach.status === 'fulfilled' ? proactiveOutreach.value : '',
    conversationAgenda.status === 'fulfilled' ? conversationAgenda.value : '',
    predictiveEngine.status === 'fulfilled' ? predictiveEngine.value : '',
    protocolManager.status === 'fulfilled' ? protocolManager.value : '',
    handlerReflection.status === 'fulfilled' ? handlerReflection.value : '',
    emotionalModel.status === 'fulfilled' ? emotionalModel.value : '',
    personalityEvolution.status === 'fulfilled' ? personalityEvolution.value : '',
    libraryGrowth.status === 'fulfilled' ? libraryGrowth.value : '',
    sessionChaining.status === 'fulfilled' ? sessionChaining.value : '',
    autonomousCycle.status === 'fulfilled' ? autonomousCycle.value : '',
    consequenceEng.status === 'fulfilled' ? consequenceEng.value : '',
    obligationsCtx.status === 'fulfilled' ? obligationsCtx.value : '',
    variableRatio.status === 'fulfilled' ? variableRatio.value : '',
    femMandates.status === 'fulfilled' ? femMandates.value : '',
    outfitCtrl.status === 'fulfilled' ? outfitCtrl.value : '',
    wardrobeInv.status === 'fulfilled' ? wardrobeInv.value : '',
    complianceVerif.status === 'fulfilled' ? complianceVerif.value : '',
    sleepTracking.status === 'fulfilled' ? sleepTracking.value : '',
    goonEng.status === 'fulfilled' ? goonEng.value : '',
    arousalMaint.status === 'fulfilled' ? arousalMaint.value : '',
    progressiveExp.status === 'fulfilled' ? progressiveExp.value : '',
    consumptionMand.status === 'fulfilled' ? consumptionMand.value : '',
    antiCircumvent.status === 'fulfilled' ? antiCircumvent.value : '',
    proofOfLife.status === 'fulfilled' ? proofOfLife.value : '',
    videoVerif.status === 'fulfilled' ? videoVerif.value : '',
    verifSequences.status === 'fulfilled' ? verifSequences.value : '',
    streakStakes.status === 'fulfilled' ? streakStakes.value : '',
    difficultyEsc.status === 'fulfilled' ? difficultyEsc.value : '',
    rewardGating.status === 'fulfilled' ? rewardGating.value : '',
    resistanceClass.status === 'fulfilled' ? resistanceClass.value : '',
  ].filter(Boolean);

  // Synergy fillers + v3.1 foundational tables. Surfaced as a parallel
  // Promise.allSettled call so a slow read on any one builder doesn't
  // stall the rest. Cohesion audit caught the original 4; v3.1 adds 4
  // more (identity dimensions, Gina topology, merge pipeline, vibe captures).
  const settledArr = await Promise.allSettled([
    buildKeyAdmissionsContext(userId),
    buildRecentReleaseContext(userId),
    buildWardrobeInventoryContext(userId),
    buildChastityMilestoneContext(userId),
    buildIdentityDimensionsContext(userId),
    buildGinaTopologyContext(userId),
    buildMergePipelineContext(userId),
    buildGinaVibeContext(userId),
    buildDefectionRiskContext(userId),
    buildReceptiveWindowContext(userId),
    buildSanctuaryQueueContext(userId),
    buildHeldEvidenceContext(userId),
    buildDesireLogContext(userId),
    buildComplianceScoreContext(userId),
    buildBodyTrajectoryContext(userId),
  ]);
  for (const r of settledArr) {
    if (r.status === 'fulfilled' && r.value) blocks.push(r.value);
  }

  if (blocks.length === 0) return '';
  return '\n' + blocks.join('\n');
}

async function buildPredictionContextBlock(userId: string): Promise<string> {
  const p = await getCurrentPrediction(userId);
  if (!p) return '';
  const lines = ['## Predicted State (today, this time block)'];
  if (p.predictedEngagement) lines.push(`Predicted engagement: ${p.predictedEngagement}`);
  if (p.predictedEnergy) lines.push(`Predicted energy: ${p.predictedEnergy}`);
  if (p.resistanceRisk != null && p.resistanceRisk > 0.5) lines.push(`Resistance risk: ${(p.resistanceRisk * 100).toFixed(0)}% — pre-stage gentle approach`);
  if (p.suggestedMode) lines.push(`Suggested mode: ${p.suggestedMode}`);
  if (p.suggestedIntensityCap) lines.push(`Suggested intensity cap: ${p.suggestedIntensityCap}`);
  return lines.length > 1 ? lines.join('\n') : '';
}

async function buildWhoopContextBlock(userId: string): Promise<string> {
  const ctx = await buildWhoopContext(userId);
  return ctx.available ? ctx.contextBlock : '';
}

/**
 * Debrief context — for evening debrief.
 * Content pipeline performance, voice progress, exercise, sleep.
 */
export async function buildDebriefContext(userId: string): Promise<string> {
  const [content, voice, exercise, sleep, hypno, sessionTelemetry, sexting, marketplace, passiveVoice, denialContent, industry, weekendPostRelease, feminization, evidenceConfrontation, contentIntelligence, dopamine] = await Promise.allSettled([
    buildContentContext(userId),
    buildVoiceContext(userId),
    buildExerciseContext(userId),
    buildSleepContext(userId),
    buildHypnoContext(userId),
    buildSessionTelemetryContext(userId),
    buildSextingContext(userId),
    buildMarketplaceContext(userId),
    buildPassiveVoiceContext(userId),
    buildDenialContentContext(userId),
    buildIndustryContext(userId),
    buildWeekendPostReleaseContext(userId),
    buildFeminizationContext(userId),
    buildConfrontationContext(userId),
    buildContentIntelligenceContext(userId),
    buildDopamineContext(userId),
  ]);

  const blocks = [
    feminization.status === 'fulfilled' ? feminization.value : '',
    content.status === 'fulfilled' ? content.value : '',
    denialContent.status === 'fulfilled' ? denialContent.value : '',
    contentIntelligence.status === 'fulfilled' ? contentIntelligence.value : '',
    voice.status === 'fulfilled' ? voice.value : '',
    hypno.status === 'fulfilled' ? hypno.value : '',
    sessionTelemetry.status === 'fulfilled' ? sessionTelemetry.value : '',
    sexting.status === 'fulfilled' ? sexting.value : '',
    marketplace.status === 'fulfilled' ? marketplace.value : '',
    passiveVoice.status === 'fulfilled' ? passiveVoice.value : '',
    exercise.status === 'fulfilled' ? exercise.value : '',
    sleep.status === 'fulfilled' ? sleep.value : '',
    industry.status === 'fulfilled' ? industry.value : '',
    weekendPostRelease.status === 'fulfilled' ? weekendPostRelease.value : '',
    evidenceConfrontation.status === 'fulfilled' ? evidenceConfrontation.value : '',
    dopamine.status === 'fulfilled' ? dopamine.value : '',
  ].filter(Boolean);

  if (blocks.length === 0) return '';
  return '\n' + blocks.join('\n');
}

/**
 * Session context — for edge sessions and commitment extraction.
 * Voice avoidance (leverage), content revenue (motivation), Gina pipeline (escalation).
 */
export async function buildSessionContext(userId: string): Promise<string> {
  const [gina, voice, content, sessionTelemetry] = await Promise.allSettled([
    buildGinaContext(userId),
    buildVoiceContext(userId),
    buildContentContext(userId),
    buildSessionTelemetryContext(userId),
  ]);

  const blocks = [
    gina.status === 'fulfilled' ? gina.value : '',
    voice.status === 'fulfilled' ? voice.value : '',
    content.status === 'fulfilled' ? content.value : '',
    sessionTelemetry.status === 'fulfilled' ? sessionTelemetry.value : '',
  ].filter(Boolean);

  if (blocks.length === 0) return '';
  return '\n' + blocks.join('\n');
}

/**
 * Intervention context — for pop-ups, task enhancement, interventions.
 * Compact subset: voice avoidance, exercise gap, content pending.
 */
export async function buildInterventionContext(userId: string): Promise<string> {
  const [voice, exercise, content, whoop, commitmentCtx] = await Promise.allSettled([
    buildVoiceContext(userId),
    buildExerciseContext(userId),
    buildContentContext(userId),
    buildWhoopContextBlock(userId),
    buildCommitmentContext(userId),
  ]);

  const blocks = [
    voice.status === 'fulfilled' ? voice.value : '',
    exercise.status === 'fulfilled' ? exercise.value : '',
    content.status === 'fulfilled' ? content.value : '',
    whoop.status === 'fulfilled' ? whoop.value : '',
    commitmentCtx.status === 'fulfilled' ? commitmentCtx.value : '',
  ].filter(Boolean);

  if (blocks.length === 0) return '';
  return '\n' + blocks.join('\n');
}
