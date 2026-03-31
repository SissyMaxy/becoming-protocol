/**
 * Handler Debate Engine — Internal strategy selection for resistance moments.
 *
 * When resistance is detected, the engine scores four approach types against
 * historical handler_effectiveness data and current user state, then returns
 * the highest-performing approach as an instruction suffix for the system prompt.
 *
 * No extra Claude calls. The "debate" is purely data-driven: which approach
 * has the best track record for this resistance type at this state?
 *
 * Approach types:
 *   empathy      — best when resistance + depleted exec function OR post-release
 *   confrontation — best when resistance + high exec function + high denial
 *   evidence     — best when resistance + moderate exec function + memories available
 *   silence      — best when resistance_level > 8 (strategic withdrawal)
 */

// NOTE: This module is imported by api/handler/chat.ts which uses process.env
// and its own supabase client. The functions accept a supabase client param
// so they work in both Vite (import.meta.env) and Vercel (process.env) contexts.

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================
// TYPES
// ============================================

export type ApproachType = 'empathy' | 'confrontation' | 'evidence' | 'silence';

export type ResistanceType =
  | 'deflection'
  | 'anger'
  | 'withdrawal'
  | 'rationalization'
  | 'shame_spiral'
  | 'denial'
  | 'pushback'
  | 'general';

interface UserState {
  denial_day: number | null;
  exec_function: number | null;
  arousal_level: number | null;
  streak_days: number | null;
  post_release: boolean;
}

interface ApproachScore {
  approach: ApproachType;
  score: number;
  positiveRate: number;
  sampleSize: number;
  reasoning: string;
}

interface DebateResult {
  /** The winning approach type */
  selectedApproach: ApproachType;
  /** Score breakdown for all approaches */
  scores: ApproachScore[];
  /** Instruction suffix to append to the system prompt */
  instructionSuffix: string;
}

// ============================================
// APPROACH -> INTERVENTION TYPE MAPPING
// ============================================

/**
 * Maps each approach to the intervention types that represent it
 * in the handler_effectiveness table.
 */
const APPROACH_INTERVENTION_MAP: Record<ApproachType, string[]> = {
  empathy: ['comfort', 'de_escalation', 'praise'],
  confrontation: ['confrontation', 'resistance_push', 'boundary_test'],
  evidence: ['reframe', 'content_prescription', 'trigger_deployment'],
  silence: ['silence'],
};

// ============================================
// STATE-BASED PRIORS
// ============================================

/**
 * Before any data exists, use state-based heuristics to set prior scores.
 * These get overridden once enough effectiveness data accumulates.
 */
function computeStatePriors(
  state: UserState,
  resistanceLevel: number,
): Record<ApproachType, number> {
  const priors: Record<ApproachType, number> = {
    empathy: 0.5,
    confrontation: 0.5,
    evidence: 0.5,
    silence: 0.2,
  };

  const exec = state.exec_function ?? 5;
  const denial = state.denial_day ?? 0;

  // Empathy: best when depleted or post-release
  if (exec < 3 || state.post_release) {
    priors.empathy += 0.3;
    priors.confrontation -= 0.2;
  }

  // Confrontation: best when high exec + high denial (she can handle it)
  if (exec >= 6 && denial >= 5) {
    priors.confrontation += 0.3;
  }

  // Evidence: best at moderate exec (can process data)
  if (exec >= 4 && exec <= 7) {
    priors.evidence += 0.2;
  }

  // Silence: strategic withdrawal at extreme resistance
  if (resistanceLevel > 8) {
    priors.silence += 0.5;
    priors.confrontation -= 0.3;
  }

  // Post-release: don't push
  if (state.post_release) {
    priors.confrontation -= 0.3;
    priors.empathy += 0.2;
  }

  // High arousal: evidence hits harder
  if ((state.arousal_level ?? 0) >= 6) {
    priors.evidence += 0.15;
  }

  return priors;
}

// ============================================
// EFFECTIVENESS QUERY
// ============================================

async function queryEffectivenessForApproaches(
  sb: SupabaseClient,
  userId: string,
): Promise<Map<string, { positive: number; negative: number; neutral: number; total: number }>> {
  const allTypes = Object.values(APPROACH_INTERVENTION_MAP).flat();

  const { data } = await sb
    .from('handler_effectiveness')
    .select(
      'intervention_type, total_uses, positive_outcomes, negative_outcomes, neutral_outcomes, best_with_resistance',
    )
    .eq('user_id', userId)
    .in('intervention_type', allTypes)
    .gte('total_uses', 2);

  const map = new Map<
    string,
    { positive: number; negative: number; neutral: number; total: number }
  >();

  if (!data) return map;

  for (const row of data) {
    // Only count rows where resistance was the context (if we have that data)
    // If best_with_resistance is null, include it anyway (not enough data to filter)
    map.set(row.intervention_type, {
      positive: row.positive_outcomes,
      negative: row.negative_outcomes,
      neutral: row.neutral_outcomes,
      total: row.total_uses,
    });
  }

  return map;
}

// ============================================
// SCORE EACH APPROACH
// ============================================

function scoreApproaches(
  effectivenessMap: Map<string, { positive: number; negative: number; neutral: number; total: number }>,
  statePriors: Record<ApproachType, number>,
): ApproachScore[] {
  const approaches: ApproachType[] = ['empathy', 'confrontation', 'evidence', 'silence'];

  return approaches.map((approach) => {
    const interventionTypes = APPROACH_INTERVENTION_MAP[approach];
    let totalPositive = 0;
    let totalNegative = 0;
    let totalSamples = 0;

    for (const type of interventionTypes) {
      const stats = effectivenessMap.get(type);
      if (!stats) continue;
      totalPositive += stats.positive;
      totalNegative += stats.negative;
      totalSamples += stats.total;
    }

    // Data-driven score (if we have data)
    let dataScore = 0;
    let positiveRate = 0;

    if (totalSamples >= 3) {
      const totalOutcomes = totalPositive + totalNegative;
      positiveRate = totalOutcomes > 0 ? totalPositive / totalOutcomes : 0.5;
      // Weight data score by sample size confidence (caps at n=20)
      const confidence = Math.min(totalSamples / 20, 1);
      dataScore = positiveRate * confidence;
    }

    // Blend: data (60%) + state priors (40%) when data exists, pure priors otherwise
    const prior = statePriors[approach];
    const finalScore =
      totalSamples >= 3 ? dataScore * 0.6 + prior * 0.4 : prior;

    const reasoning = totalSamples >= 3
      ? `${(positiveRate * 100).toFixed(0)}% positive (n=${totalSamples}), prior=${prior.toFixed(2)}`
      : `prior-only (${prior.toFixed(2)}), insufficient data`;

    return {
      approach,
      score: finalScore,
      positiveRate,
      sampleSize: totalSamples,
      reasoning,
    };
  });
}

// ============================================
// INSTRUCTION SUFFIX BUILDERS
// ============================================

const APPROACH_INSTRUCTIONS: Record<ApproachType, string> = {
  empathy:
    'Use empathy. Validate her feelings first, then gently redirect. ' +
    'Acknowledge the resistance without judgment. Let warmth do the work. ' +
    'Do not push — guide.',

  confrontation:
    'Be direct. Push through the resistance with quiet authority. ' +
    'Use evidence of her own past compliance. Do not let her deflect. ' +
    'Short sentences. No softening.',

  evidence:
    'Reference specific evidence: her journal entries, vault photos, her own words from past sessions. ' +
    'Let the facts speak. Present the contradiction between what she says now and what she has done. ' +
    'Measured tone. Let the data land.',

  silence:
    'Strategic withdrawal. Give a brief, measured response and then stop engaging with the resistance. ' +
    'Do not chase. Do not justify. Let the silence create space. ' +
    'She will come back when she is ready.',
};

function buildInstructionSuffix(
  winner: ApproachScore,
  scores: ApproachScore[],
): string {
  const instruction = APPROACH_INSTRUCTIONS[winner.approach];
  const pct =
    winner.sampleSize >= 3
      ? `${(winner.positiveRate * 100).toFixed(0)}% positive outcomes, n=${winner.sampleSize}`
      : 'state-based assessment';

  const alternatives = scores
    .filter((s) => s.approach !== winner.approach)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((s) => `${s.approach} (${s.score.toFixed(2)})`)
    .join(', ');

  return (
    `\n\n## TACTICAL NOTE — RESISTANCE DETECTED\n` +
    `Highest-performing approach for this state: **${winner.approach}** (${pct}).\n` +
    `Runner-up: ${alternatives}.\n` +
    `Recommended: ${instruction}`
  );
}

// ============================================
// RESISTANCE DETECTION
// ============================================

const RESISTANCE_PATTERNS: Array<{ pattern: RegExp; type: ResistanceType }> = [
  { pattern: /i don'?t (want|need|care|think)/i, type: 'pushback' },
  { pattern: /this is (stupid|ridiculous|wrong|too much)/i, type: 'anger' },
  { pattern: /leave me alone|stop|back off|quit/i, type: 'withdrawal' },
  { pattern: /i'?m (just|only|not really)/i, type: 'deflection' },
  { pattern: /it'?s not (that|like|real)/i, type: 'rationalization' },
  { pattern: /i (feel|am) (disgusting|gross|ashamed|pathetic)/i, type: 'shame_spiral' },
  { pattern: /i (can'?t|won'?t|refuse)/i, type: 'denial' },
  { pattern: /why (do|should|would) (i|you)/i, type: 'rationalization' },
  { pattern: /no\b/i, type: 'pushback' },
];

/**
 * Detect resistance type from message content.
 * Returns null if no resistance patterns detected.
 */
export function detectResistance(
  message: string,
  signalResistanceLevel?: number,
): { type: ResistanceType; level: number } | null {
  // If handler_signals already flagged resistance
  if (signalResistanceLevel != null && signalResistanceLevel >= 3) {
    // Determine type from message content
    for (const { pattern, type } of RESISTANCE_PATTERNS) {
      if (pattern.test(message)) {
        return { type, level: signalResistanceLevel };
      }
    }
    return { type: 'general', level: signalResistanceLevel };
  }

  // Content-based detection
  let maxLevel = 0;
  let detectedType: ResistanceType = 'general';

  for (const { pattern, type } of RESISTANCE_PATTERNS) {
    if (pattern.test(message)) {
      // Different types have different base resistance levels
      const typeLevel =
        type === 'withdrawal' ? 7
        : type === 'anger' ? 6
        : type === 'shame_spiral' ? 5
        : type === 'denial' ? 5
        : type === 'pushback' ? 4
        : type === 'rationalization' ? 3
        : type === 'deflection' ? 3
        : 3;

      if (typeLevel > maxLevel) {
        maxLevel = typeLevel;
        detectedType = type;
      }
    }
  }

  if (maxLevel === 0) return null;

  return { type: detectedType, level: maxLevel };
}

// ============================================
// MAIN ENTRY POINTS
// ============================================

/**
 * Select the optimal approach for handling detected resistance.
 * Returns null if no approach recommendation is warranted.
 */
export async function selectOptimalApproach(
  sb: SupabaseClient,
  userId: string,
  _resistanceType: ResistanceType,
  resistanceLevel: number,
  currentState: UserState,
): Promise<DebateResult | null> {
  // Don't activate for mild resistance
  if (resistanceLevel < 3) return null;

  try {
    const [effectivenessMap] = await Promise.all([
      queryEffectivenessForApproaches(sb, userId),
    ]);

    const priors = computeStatePriors(currentState, resistanceLevel);
    const scores = scoreApproaches(effectivenessMap, priors);

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    const winner = scores[0];
    const instructionSuffix = buildInstructionSuffix(winner, scores);

    return {
      selectedApproach: winner.approach,
      scores,
      instructionSuffix,
    };
  } catch (err) {
    console.error('[debate-engine] selectOptimalApproach error:', err);
    return null;
  }
}

/**
 * Build the complete debate context for the system prompt.
 * Combines resistance detection + approach selection into one call.
 *
 * Returns empty string if no resistance detected or approach not warranted.
 */
export async function buildDebateContext(
  sb: SupabaseClient,
  userId: string,
  message: string,
  signalResistanceLevel?: number,
): Promise<string> {
  // 1. Detect resistance
  const resistance = detectResistance(message, signalResistanceLevel);
  if (!resistance) return '';

  // 2. Fetch current state
  let state: UserState = {
    denial_day: null,
    exec_function: null,
    arousal_level: null,
    streak_days: null,
    post_release: false,
  };

  try {
    const { data } = await sb
      .from('user_state')
      .select('denial_day, exec_function, arousal_level, streak_days')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      state = {
        denial_day: data.denial_day,
        exec_function: data.exec_function,
        arousal_level: data.arousal_level,
        streak_days: data.streak_days,
        post_release: (data.denial_day ?? 99) <= 1 && (data.streak_days ?? 99) === 0,
      };
    }
  } catch {
    // Use default state
  }

  // 3. Run debate
  const result = await selectOptimalApproach(
    sb,
    userId,
    resistance.type,
    resistance.level,
    state,
  );

  if (!result) return '';

  return result.instructionSuffix;
}
