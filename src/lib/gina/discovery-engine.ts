/**
 * Gina Discovery Engine
 *
 * Investment tracking, readiness scoring, milestone management,
 * and parallel seed acceleration for the Gina pipeline.
 */

import { supabase } from '../supabase';
import { type GinaChannel, GINA_CHANNELS, getAllChannelStates } from './ladder-engine';
import { updateGinaAwareness } from '../hrt/pipeline-engine';
import type {
  GinaInvestmentType,
  GinaDiscoveryPhase,
  GinaDiscoveryState,
  GinaInvestmentSummary,
  MarriageMilestoneKey,
  ReadinessScore,
  ParallelSeedSuggestion,
  GinaInvestment,
} from '../../types/gina-discovery';

// ============================================
// INVESTMENT WEIGHT LOOKUP
// ============================================

const INVESTMENT_WEIGHTS: Partial<Record<GinaInvestmentType, number>> = {
  initiated_by_gina: 3.0,
  active_participation: 2.0,
  physical_participation: 2.0,
  financial_participation: 2.0,
  verbal_approval: 1.5,
  defended_to_others: 2.5,
  identity_reinforcement: 1.5,
  unknowing_participation: 1.0,
};

// ============================================
// SEED SUGGESTIONS FOR LOW-RUNG CHANNELS
// ============================================

const CHANNEL_SEED_SUGGESTIONS: Record<string, string> = {
  scent: 'Introduce a new feminine-coded scent in a shared space (candle, lotion on hands)',
  touch: 'Request or initiate a softer form of physical contact (hand lotion application, gentle touch)',
  domestic: 'Take on a traditionally feminine domestic task without comment',
  intimacy: 'Introduce a subtle intimacy shift — softer, more receptive body language',
  visual: 'Wear or display a subtle feminine-coded item where Gina will notice',
  social: 'Reference a feminine-coded interest casually in social conversation',
  bedroom: 'Introduce one small dynamic shift in bedroom interaction',
  pronoun: 'Use a self-referential feminine framing in a light/joking context',
  financial: 'Make a small feminine-coded purchase and leave it visible',
  body_change_touch: 'Ask Gina to notice or touch a soft/smooth area (post-shave, moisturized)',
};

// ============================================
// READINESS SCORING
// ============================================

function determinePhase(score: number): GinaDiscoveryPhase {
  if (score <= 15) return 'pre_awareness';
  if (score <= 30) return 'ambient_exposure';
  if (score <= 50) return 'plausible_deniability';
  if (score <= 70) return 'soft_discovery';
  if (score <= 85) return 'guided_conversation';
  return 'full_disclosure';
}

function generateRecommendation(
  phase: GinaDiscoveryPhase,
  factors: Record<string, number>,
  ginaInitiatedRatio: number,
  channelsAtRung2Plus: number,
): string {
  switch (phase) {
    case 'pre_awareness':
      return 'Begin seeding across multiple channels. Focus on scent, touch, and domestic — lowest risk, highest normalization potential.';
    case 'ambient_exposure':
      if (channelsAtRung2Plus < 3) {
        return `Focus on building channel breadth — seed ${3 - channelsAtRung2Plus} more channels before advancing depth.`;
      }
      return 'Breadth is building. Start pushing 1-2 channels to rung 3 for deeper normalization.';
    case 'plausible_deniability':
      if (ginaInitiatedRatio < 0.15) {
        return 'Investment volume is good but Gina-initiated ratio is low. Create opportunities for her to initiate — leave openings, not instructions.';
      }
      return 'Plausible deniability is established. Look for moments where Gina references the dynamic without prompting.';
    case 'soft_discovery':
      return 'Conditions are forming for soft discovery. Monitor for organic discovery moments. Prepare a guided conversation framework.';
    case 'guided_conversation':
      if (ginaInitiatedRatio >= 0.25) {
        return 'Gina-initiated investment ratio is strong. Consider engineered discovery within 2 weeks.';
      }
      return 'Close to guided conversation readiness. Build 2-3 more Gina-initiated investments before proceeding.';
    case 'full_disclosure':
      return 'All readiness factors are strong. Full disclosure is viable when timing and emotional context align.';
    case 'active_partnership':
      return 'Active partnership achieved. Focus on deepening existing channels and advancing milestones.';
  }
}

export async function calculateReadinessScore(userId: string): Promise<ReadinessScore> {
  // Parallel queries
  const [summaryResult, ladderStates, milestonesResult, currentStateResult] = await Promise.all([
    supabase
      .from('gina_investment_summary')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    getAllChannelStates(userId),
    supabase
      .from('marriage_restructuring_milestones')
      .select('*')
      .eq('user_id', userId)
      .eq('achieved', true),
    supabase
      .from('gina_discovery_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const summary = summaryResult.data as GinaInvestmentSummary | null;
  const milestones = milestonesResult.data || [];

  // Channel breadth: channels with rung >= 2
  const channelsAtRung2Plus = ladderStates.filter(s => s.currentRung >= 2).length;
  const channelBreadth = Math.min((channelsAtRung2Plus / 10) * 20, 20);

  // Channel depth: highest rung across channels
  const highestRung = ladderStates.reduce((max, s) => Math.max(max, s.currentRung), 0);
  const channelDepth = Math.min((highestRung / 5) * 15, 15);

  // Investment volume
  const totalWeight = summary?.total_weight || 0;
  const investmentVolume = Math.min((totalWeight / 50), 1) * 15;

  // Gina-initiated ratio
  const totalInvestments = summary?.total_investments || 0;
  const ginaInitiatedCount = summary?.gina_initiated_count || 0;
  const ginaInitiatedRatio = totalInvestments > 0
    ? ginaInitiatedCount / totalInvestments
    : 0;
  const ginaInitiatedScore = ginaInitiatedRatio * 20;

  // Milestone progress
  const achievedMilestones = milestones.length;
  const milestoneScore = Math.min((achievedMilestones / 10) * 15, 15);

  // Time factor: days since first investment
  let timeFactor = 0;
  if (summary && totalInvestments > 0) {
    // Query earliest investment
    const { data: earliest } = await supabase
      .from('gina_investments')
      .select('event_timestamp')
      .eq('user_id', userId)
      .order('event_timestamp', { ascending: true })
      .limit(1);

    if (earliest && earliest.length > 0) {
      const daysSinceFirst = Math.floor(
        (Date.now() - new Date(earliest[0].event_timestamp).getTime()) / (1000 * 60 * 60 * 24)
      );
      timeFactor = Math.min(daysSinceFirst / 90, 1) * 15;
    }
  }

  const score = Math.round(
    channelBreadth + channelDepth + investmentVolume +
    ginaInitiatedScore + milestoneScore + timeFactor
  );

  const factors: Record<string, number> = {
    channelBreadth: Math.round(channelBreadth * 10) / 10,
    channelDepth: Math.round(channelDepth * 10) / 10,
    investmentVolume: Math.round(investmentVolume * 10) / 10,
    ginaInitiatedScore: Math.round(ginaInitiatedScore * 10) / 10,
    milestoneScore: Math.round(milestoneScore * 10) / 10,
    timeFactor: Math.round(timeFactor * 10) / 10,
  };

  const phase = determinePhase(score);
  const recommendation = generateRecommendation(phase, factors, ginaInitiatedRatio, channelsAtRung2Plus);

  // Upsert discovery state
  const channelsWithPositive = ladderStates.filter(s => s.positiveSeedsAtRung > 0 || s.currentRung > 0).length;

  await supabase
    .from('gina_discovery_state')
    .upsert({
      user_id: userId,
      current_readiness_score: score,
      readiness_factors: factors,
      discovery_phase: phase,
      last_assessment_at: new Date().toISOString(),
      total_investments: totalInvestments,
      total_investment_weight: totalWeight,
      gina_initiated_count: ginaInitiatedCount,
      channels_with_positive_seeds: channelsWithPositive,
      highest_channel_rung: highestRung,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  // Link to HRT pipeline: if readiness crosses 70 (guided_conversation), Gina likely suspects
  if (score >= 70 && phase === 'guided_conversation') {
    updateGinaAwareness(userId, 'suspects').catch(err => {
      console.warn('[DiscoveryEngine] HRT Gina awareness update failed:', err);
    });
  }

  return { score, factors, phase, recommendation };
}

// ============================================
// INVESTMENT LOGGING
// ============================================

export interface LogInvestmentInput {
  userId: string;
  investmentType: GinaInvestmentType;
  channel?: string;
  description: string;
  ginaInitiated: boolean;
  ginaAware: boolean;
  handlerSeeded: boolean;
  arousalContext?: boolean;
  evidenceRef?: string;
  notes?: string;
}

export async function logGinaInvestment(input: LogInvestmentInput): Promise<void> {
  const weight = INVESTMENT_WEIGHTS[input.investmentType] || 1.0;

  const { error } = await supabase
    .from('gina_investments')
    .insert({
      user_id: input.userId,
      investment_type: input.investmentType,
      channel: input.channel || null,
      description: input.description,
      investment_weight: weight,
      arousal_context: input.arousalContext || false,
      gina_initiated: input.ginaInitiated,
      gina_aware: input.ginaAware,
      handler_seeded: input.handlerSeeded,
      evidence_ref: input.evidenceRef || null,
      notes: input.notes || null,
    });

  if (error) {
    console.warn('[DiscoveryEngine] Failed to log investment:', error.message);
    return;
  }

  // Recalculate readiness after new investment (fire-and-forget)
  calculateReadinessScore(input.userId).catch(err => {
    console.warn('[DiscoveryEngine] Readiness recalculation failed:', err);
  });
}

// ============================================
// MILESTONE MANAGEMENT
// ============================================

export async function checkMilestone(
  userId: string,
  milestoneKey: MarriageMilestoneKey,
  evidenceDescription: string,
  ginaInitiated: boolean
): Promise<{ newlyAchieved: boolean; totalAchieved: number }> {
  // Check if already achieved
  const { data: existing } = await supabase
    .from('marriage_restructuring_milestones')
    .select('id, achieved')
    .eq('user_id', userId)
    .eq('milestone_key', milestoneKey)
    .maybeSingle();

  if (existing?.achieved) {
    // Already achieved — count total
    const { count } = await supabase
      .from('marriage_restructuring_milestones')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('achieved', true);

    return { newlyAchieved: false, totalAchieved: count || 0 };
  }

  // Upsert milestone as achieved
  await supabase
    .from('marriage_restructuring_milestones')
    .upsert({
      user_id: userId,
      milestone_key: milestoneKey,
      achieved: true,
      achieved_at: new Date().toISOString(),
      evidence_description: evidenceDescription,
      gina_initiated: ginaInitiated,
      ratchet_power: ginaInitiated ? 2.0 : 1.0,
    }, { onConflict: 'user_id,milestone_key' });

  // Count total achieved
  const { count } = await supabase
    .from('marriage_restructuring_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('achieved', true);

  return { newlyAchieved: true, totalAchieved: count || 0 };
}

// ============================================
// DISCOVERY STATE QUERIES
// ============================================

export async function getDiscoveryState(userId: string): Promise<(GinaDiscoveryState & ReadinessScore) | null> {
  const { data } = await supabase
    .from('gina_discovery_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;

  const state = data as GinaDiscoveryState;
  const readiness = await calculateReadinessScore(userId);

  return {
    ...state,
    ...readiness,
  };
}

// ============================================
// INVESTMENT TIMELINE
// ============================================

export async function getInvestmentTimeline(
  userId: string,
  days = 90
): Promise<(GinaInvestment & { runningWeight: number })[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data, error } = await supabase
    .from('gina_investments')
    .select('*')
    .eq('user_id', userId)
    .gte('event_timestamp', cutoff.toISOString())
    .order('event_timestamp', { ascending: false });

  if (error || !data) return [];

  // Calculate running weight total (most recent first, accumulate backward)
  let runningWeight = 0;
  const reversed = [...data].reverse();
  const weightMap = new Map<string, number>();
  for (const inv of reversed) {
    runningWeight += inv.investment_weight || 0;
    weightMap.set(inv.id, runningWeight);
  }

  return data.map(inv => ({
    ...(inv as GinaInvestment),
    runningWeight: weightMap.get(inv.id) || 0,
  }));
}

// ============================================
// PARALLEL SEED SUGGESTIONS
// ============================================

export async function suggestParallelSeeds(userId: string): Promise<ParallelSeedSuggestion[]> {
  const ladderStates = await getAllChannelStates(userId);

  // Find channels at rung 0 or 1
  const lowChannels = ladderStates
    .filter(s => s.currentRung <= 1)
    .sort((a, b) => a.currentRung - b.currentRung);

  // Also include channels not yet initialized
  const activeChannelNames = new Set(ladderStates.map(s => s.channel));
  const uninitializedChannels = GINA_CHANNELS
    .filter(c => !activeChannelNames.has(c))
    .map(c => ({ channel: c as GinaChannel, currentRung: 0 }));

  const candidates = [
    ...uninitializedChannels.map(c => ({
      channel: c.channel,
      currentRung: 0,
      cooldownUntil: null as Date | null,
    })),
    ...lowChannels.map(s => ({
      channel: s.channel,
      currentRung: s.currentRung,
      cooldownUntil: s.cooldownUntil,
    })),
  ];

  // Filter out channels in cooldown
  const now = new Date();
  const available = candidates.filter(c => !c.cooldownUntil || c.cooldownUntil <= now);

  // Return up to 3 suggestions
  return available.slice(0, 3).map(c => ({
    channel: c.channel,
    currentRung: c.currentRung,
    suggestedAction: CHANNEL_SEED_SUGGESTIONS[c.channel] || `Plant a rung-${c.currentRung + 1} seed in the ${c.channel} channel`,
    rationale: c.currentRung === 0
      ? `${c.channel} channel has no seeds yet — opening it increases breadth score`
      : `${c.channel} channel is at rung ${c.currentRung} — one more positive seed moves toward advancement`,
    estimatedWeight: 1.0,
  }));
}
