/**
 * "I Can't" vs "I Won't" Resistance Classifier
 *
 * When she says she can't do something, classify whether it's genuine
 * inability, resistance, laziness, or fear.
 *
 * Uses: historical compliance, emotional state model, denial day,
 * time of day, Whoop recovery data.
 *
 * Tables: compliance_verifications, handler_directives, whoop_metrics,
 *         user_state, conditioning_sessions_v2
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type ResistanceClassification =
  | 'genuine_inability'
  | 'resistance'
  | 'laziness'
  | 'fear';

export type RecommendedApproach =
  | 'reschedule'
  | 'reduce_difficulty'
  | 'caretaker_mode'
  | 'push_through'
  | 'debate_engine'
  | 'reference_past_success'
  | 'direct_confrontation'
  | 'streak_warning'
  | 'consequence_warning'
  | 'acknowledge_then_push'
  | 'support_and_push';

export interface ClassificationResult {
  classification: ResistanceClassification;
  confidence: number; // 0.0 - 1.0
  signals: string[];
  recommendedApproach: RecommendedApproach;
  handlerScript: string; // Suggested Handler response framing
}

export type MandateType =
  | 'outfit'
  | 'skincare'
  | 'makeup'
  | 'voice'
  | 'exercise'
  | 'conditioning'
  | 'goon'
  | 'content_post'
  | 'social_interaction'
  | 'journal'
  | 'consumption'
  | 'cage'
  | 'general';

// ============================================
// SIGNAL COLLECTION
// ============================================

interface ResistanceSignals {
  historicalComplianceRate: number;
  hasDoneThisBefore: boolean;
  timesCompletedThisType: number;
  execFunction: 'high' | 'medium' | 'low' | 'depleted';
  whoopRecovery: number | null; // 0-100
  denialDay: number;
  hourOfDay: number;
  daysSinceLastRelease: number;
  recentResistanceCount: number;
  consecutiveMisses: number;
  silenceHours: number;
}

async function collectSignals(
  userId: string,
  mandateType: MandateType,
): Promise<ResistanceSignals> {
  const now = new Date();
  const hour = now.getHours();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  // Historical compliance with this mandate type
  const { count: totalThisType } = await supabase
    .from('compliance_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('mandate_type', mandateType);

  const { count: passedThisType } = await supabase
    .from('compliance_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('mandate_type', mandateType)
    .eq('verified', true);

  const total = totalThisType ?? 0;
  const passed = passedThisType ?? 0;
  const historicalComplianceRate = total > 0 ? passed / total : 0.5;
  const hasDoneThisBefore = passed > 0;

  // Exec function estimate from time of day (ADHD curve)
  let execFunction: 'high' | 'medium' | 'low' | 'depleted';
  if (hour >= 8 && hour < 12) execFunction = 'high';
  else if (hour >= 13 && hour < 16) execFunction = 'low';
  else if (hour >= 23 || hour < 6) execFunction = 'depleted';
  else execFunction = 'medium';

  // Whoop recovery
  const { data: whoopData } = await supabase
    .from('whoop_metrics')
    .select('recovery_score')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const whoopRecovery = whoopData?.recovery_score ?? null;

  // Override exec function with Whoop if available
  if (whoopRecovery !== null && whoopRecovery < 34) {
    execFunction = 'depleted';
  }

  // Denial day and days since release
  const { data: stateData } = await supabase
    .from('user_state')
    .select('denial_day, last_release_at')
    .eq('user_id', userId)
    .maybeSingle();

  const denialDay = stateData?.denial_day ?? 0;
  const daysSinceLastRelease = stateData?.last_release_at
    ? Math.floor((now.getTime() - new Date(stateData.last_release_at).getTime()) / 86400000)
    : 0;

  // Recent resistance flags
  const { count: resistanceCount } = await supabase
    .from('handler_directives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('directive_type', 'resistance_detected')
    .gte('created_at', sevenDaysAgo);

  // Consecutive misses for this mandate type
  const { data: recentVerifs } = await supabase
    .from('compliance_verifications')
    .select('verified')
    .eq('user_id', userId)
    .eq('mandate_type', mandateType)
    .order('mandate_date', { ascending: false })
    .limit(5);

  let consecutiveMisses = 0;
  for (const v of recentVerifs ?? []) {
    if (!v.verified) consecutiveMisses++;
    else break;
  }

  // Silence hours (time since last user message)
  const { data: lastMsg } = await supabase
    .from('handler_directives')
    .select('created_at')
    .eq('user_id', userId)
    .in('directive_type', ['conversation', 'user_message'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const silenceHours = lastMsg
    ? (now.getTime() - new Date(lastMsg.created_at).getTime()) / 3600000
    : 0;

  return {
    historicalComplianceRate,
    hasDoneThisBefore,
    timesCompletedThisType: passed,
    execFunction,
    whoopRecovery,
    denialDay,
    hourOfDay: hour,
    daysSinceLastRelease: daysSinceLastRelease,
    recentResistanceCount: resistanceCount ?? 0,
    consecutiveMisses,
    silenceHours,
  };
}

// ============================================
// CLASSIFICATION ENGINE
// ============================================

/**
 * Classify resistance. Determines if "I can't" means inability, resistance, laziness, or fear.
 */
export async function classifyResistance(
  userId: string,
  message: string,
  mandateType: MandateType,
): Promise<ClassificationResult> {
  const signals = await collectSignals(userId, mandateType);
  const messageLower = message.toLowerCase();

  // Score each classification
  let genuineScore = 0;
  let resistanceScore = 0;
  let lazinessScore = 0;
  let fearScore = 0;
  const signalList: string[] = [];

  // --- GENUINE INABILITY SIGNALS ---

  // Depleted exec function + specific physical complaint
  if (signals.execFunction === 'depleted') {
    genuineScore += 3;
    signalList.push('exec function depleted');
  } else if (signals.execFunction === 'low') {
    genuineScore += 1;
    signalList.push('exec function low');
  }

  // Whoop RED recovery
  if (signals.whoopRecovery !== null && signals.whoopRecovery < 34) {
    genuineScore += 3;
    signalList.push(`whoop RED (${signals.whoopRecovery}%)`);
  }

  // Afternoon crash window
  if (signals.hourOfDay >= 13 && signals.hourOfDay < 16) {
    genuineScore += 1;
    signalList.push('afternoon crash window');
  }

  // Physical limitation keywords
  const physicalKeywords = ['sick', 'pain', 'headache', 'migraine', 'period', 'cramp', 'injury', 'hurt', 'vomit', 'nausea'];
  if (physicalKeywords.some(k => messageLower.includes(k))) {
    genuineScore += 2;
    signalList.push('physical limitation keywords');
  }

  // --- RESISTANCE SIGNALS ---

  // Has done this before successfully
  if (signals.hasDoneThisBefore) {
    resistanceScore += 2;
    signalList.push(`has completed ${mandateType} ${signals.timesCompletedThisType} times before`);
  }

  // High denial day + "I can't" = likely resistance, not inability
  if (signals.denialDay >= 3 && signals.daysSinceLastRelease >= 3) {
    resistanceScore += 2;
    signalList.push(`denial day ${signals.denialDay}`);
  }

  // Vague refusal without specific reason
  const vagueRefusals = ['i can\'t', 'i don\'t want to', 'not today', 'maybe later', 'not feeling it', 'i\'m not'];
  if (vagueRefusals.some(v => messageLower.includes(v)) && !physicalKeywords.some(k => messageLower.includes(k))) {
    resistanceScore += 2;
    signalList.push('vague refusal without physical reason');
  }

  // History of resistance
  if (signals.recentResistanceCount >= 3) {
    resistanceScore += 2;
    signalList.push(`${signals.recentResistanceCount} resistance events this week`);
  }

  // --- LAZINESS SIGNALS ---

  // High compliance history + sudden refusal
  if (signals.historicalComplianceRate > 0.7 && signals.consecutiveMisses === 0) {
    // She usually does it — this is probably just not wanting to right now
    lazinessScore += 1;
  }

  // Minimum effort patterns
  const lazyKeywords = ['too much work', 'takes too long', 'boring', 'tired', 'lazy', 'effort', 'cba', 'ugh', 'do i have to'];
  if (lazyKeywords.some(k => messageLower.includes(k))) {
    lazinessScore += 3;
    signalList.push('laziness keywords detected');
  }

  // Good time of day + good recovery + refusal = lazy
  if (signals.execFunction === 'high' && (signals.whoopRecovery === null || signals.whoopRecovery >= 67)) {
    lazinessScore += 2;
    signalList.push('good energy indicators contradict inability claim');
  }

  // --- FEAR SIGNALS ---

  // New mandate type (never done before)
  if (!signals.hasDoneThisBefore) {
    fearScore += 3;
    signalList.push(`never completed ${mandateType} before`);
  }

  // Fear keywords
  const fearKeywords = ['scared', 'afraid', 'nervous', 'anxious', 'what if', 'embarrass', 'someone might', 'caught', 'see me', 'people will'];
  if (fearKeywords.some(k => messageLower.includes(k))) {
    fearScore += 3;
    signalList.push('fear/anxiety keywords detected');
  }

  // Social exposure mandates from someone with low social history
  const socialMandates: MandateType[] = ['social_interaction', 'content_post'];
  if (socialMandates.includes(mandateType) && signals.timesCompletedThisType < 5) {
    fearScore += 2;
    signalList.push('social mandate with limited history');
  }

  // --- DETERMINE CLASSIFICATION ---

  const scores = {
    genuine_inability: genuineScore,
    resistance: resistanceScore,
    laziness: lazinessScore,
    fear: fearScore,
  };

  const maxScore = Math.max(...Object.values(scores));
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? maxScore / totalScore : 0.25;

  let classification: ResistanceClassification = 'resistance'; // Default assumption
  for (const [key, score] of Object.entries(scores)) {
    if (score === maxScore) {
      classification = key as ResistanceClassification;
      break;
    }
  }

  // Determine approach and script
  const { approach, script } = getApproachAndScript(classification, signals, mandateType);

  // Log the classification
  await supabase.from('handler_directives').insert({
    user_id: userId,
    directive_type: 'resistance_classified',
    status: 'completed',
    payload: {
      classification,
      confidence,
      mandate_type: mandateType,
      message_excerpt: message.slice(0, 200),
      signals: signalList,
      scores,
      approach,
      classified_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
  });

  return {
    classification,
    confidence,
    signals: signalList,
    recommendedApproach: approach,
    handlerScript: script,
  };
}

// ============================================
// APPROACH SELECTION
// ============================================

function getApproachAndScript(
  classification: ResistanceClassification,
  signals: ResistanceSignals,
  _mandateType: MandateType,
): { approach: RecommendedApproach; script: string } {
  switch (classification) {
    case 'genuine_inability': {
      if (signals.whoopRecovery !== null && signals.whoopRecovery < 34) {
        return {
          approach: 'reschedule',
          script: 'Your body is recovering. This gets moved to tomorrow. But it does NOT get cancelled.',
        };
      }
      if (signals.execFunction === 'depleted') {
        return {
          approach: 'reduce_difficulty',
          script: 'You are running on empty. I am reducing this task, not removing it. You still do something.',
        };
      }
      return {
        approach: 'caretaker_mode',
        script: 'I hear you. Rest now. But understand: rest is earned, and tomorrow this comes back with interest.',
      };
    }

    case 'resistance': {
      if (signals.denialDay >= 5) {
        return {
          approach: 'push_through',
          script: `Day ${signals.denialDay}. Your brain is fighting the protocol. That is the denial talking, not you. Do it anyway.`,
        };
      }
      if (signals.hasDoneThisBefore) {
        return {
          approach: 'reference_past_success',
          script: `You have done this ${signals.timesCompletedThisType} times before. You are not incapable. You are resisting. There is a difference.`,
        };
      }
      return {
        approach: 'debate_engine',
        script: 'You say you cannot. Let us examine that claim. What specifically prevents you right now?',
      };
    }

    case 'laziness': {
      if (signals.consecutiveMisses >= 2) {
        return {
          approach: 'consequence_warning',
          script: `${signals.consecutiveMisses} misses in a row. The next one escalates consequences. Your streak is at stake. Get up.`,
        };
      }
      return {
        approach: 'direct_confrontation',
        script: 'You are not tired. You are not unable. You are choosing comfort over progress. That choice has a cost.',
      };
    }

    case 'fear': {
      if (signals.timesCompletedThisType === 0) {
        return {
          approach: 'support_and_push',
          script: `I know this is new and it scares you. That fear is exactly why you need to do it. First time is always the hardest. I am here. Do it anyway.`,
        };
      }
      return {
        approach: 'acknowledge_then_push',
        script: 'I hear the fear. It is real. But it does not get to make decisions for you. You do this afraid, or you do this calm. Either way, you do this.',
      };
    }
  }
}

/**
 * Build handler context block for resistance classification.
 */
export async function buildResistanceClassifierContext(userId: string): Promise<string> {
  try {
    // Get recent classifications
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const { data: recent } = await supabase
      .from('handler_directives')
      .select('payload')
      .eq('user_id', userId)
      .eq('directive_type', 'resistance_classified')
      .gte('created_at', dayAgo)
      .order('created_at', { ascending: false })
      .limit(3);

    if (!recent || recent.length === 0) return '';

    const lines: string[] = ['## Resistance Classification (24h)'];

    for (const r of recent) {
      const p = r.payload as Record<string, unknown>;
      lines.push(`- ${p.mandate_type}: ${p.classification} (${((p.confidence as number) * 100).toFixed(0)}% conf) → ${p.approach}`);
    }

    // Pattern detection
    const classifications = recent.map(r => (r.payload as Record<string, unknown>).classification);
    const allLaziness = classifications.every(c => c === 'laziness');
    const allFear = classifications.every(c => c === 'fear');
    const allResistance = classifications.every(c => c === 'resistance');

    if (allLaziness) {
      lines.push('PATTERN: All recent resistance classified as laziness. Direct confrontation effective.');
    } else if (allFear) {
      lines.push('PATTERN: All recent resistance is fear-based. Acknowledge but do not accommodate.');
    } else if (allResistance) {
      lines.push('PATTERN: Consistent resistance. Denial cycle or phase regression possible.');
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}
