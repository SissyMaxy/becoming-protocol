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
import { buildGoonEngineContext } from './conditioning/goon-engine';
import { buildArousalMaintenanceContext } from './conditioning/arousal-maintenance';
import { buildExposureContext } from './conditioning/progressive-exposure';
import { buildConsumptionContext } from './conditioning/consumption-mandates';
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
  goonEngine: string;
  arousalMaintenance: string;
  progressiveExposure: string;
  consumptionMandates: string;
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
// MAIN CONTEXT BUILDERS
// ============================================

/**
 * Full systems context — for morning briefing and daily plan.
 * All systems, maximum data density.
 */
export async function buildFullSystemsContext(userId: string): Promise<string> {
  const [gina, content, voice, cam, sleep, exercise, hypno, sessionTelemetry, sexting, marketplace, passiveVoice, denialContent, industry, weekendPostRelease, feminization, evidenceConfrontation, shootEscalation, contentIntelligence, contentCalendar, overnightSummary, dopamine, whoop, commitments, prediction, conditioning, hrt, shame, revenue, davidElim, social, memory, conditioningEngine, impactTracking, irreversibility, narrativeArc, autoPoster, socialInbox, voicePitch, autoPurchase, femPrescription, exerciseRx, postReleaseBridge, serviceAdvancement, ambushScheduler, voiceEvolution, corruptionActivation, camHandlerControl, failureRecovery, communityMirror, handlerDirectives, journal, skillTree, contentOptimization, denialMapping, languageDrift, sleepPhaseTargeting, photoTimeline, correlationEngine, commitmentLadder, ginaMicroExposure, socialIntelligence, accountability, proactiveOutreach, conversationAgenda, predictiveEngine, protocolManager, handlerReflection, emotionalModel, personalityEvolution, libraryGrowth, sessionChaining, autonomousCycle, consequenceEng, obligationsCtx, variableRatio, femMandates, outfitCtrl, goonEng, arousalMaint, progressiveExp, consumptionMand] = await Promise.allSettled([
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
    buildGoonEngineContext(userId),
    buildArousalMaintenanceContext(userId),
    buildExposureContext(userId),
    buildConsumptionContext(userId),
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
    goonEng.status === 'fulfilled' ? goonEng.value : '',
    arousalMaint.status === 'fulfilled' ? arousalMaint.value : '',
    progressiveExp.status === 'fulfilled' ? progressiveExp.value : '',
    consumptionMand.status === 'fulfilled' ? consumptionMand.value : '',
  ].filter(Boolean);

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
