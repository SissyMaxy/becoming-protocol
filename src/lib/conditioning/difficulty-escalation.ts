/**
 * Escalating Difficulty on Easy Mode
 *
 * If she coasts (high compliance, zero consequences, no resistance),
 * the system isn't pushing hard enough. Auto-escalate.
 * If she's overwhelmed (low compliance, constant consequences, silence),
 * risk of disengagement. Auto-reduce — but never make it easy.
 *
 * Self-balancing: easy -> harder, too hard -> slightly easier (but never easy).
 *
 * Tables: compliance_verifications, consequence_history, handler_directives,
 *         daily_cycles, conditioning_sessions_v2
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type DifficultyMode = 'easy' | 'normal' | 'hard' | 'overwhelming';

export interface DifficultyAssessment {
  mode: DifficultyMode;
  signals: string[];
  complianceRate7d: number;
  consequenceCount14d: number;
  firstAttemptRate: number;
  resistanceDetected: boolean;
  recommendation: 'escalate' | 'hold' | 'reduce';
}

export interface DifficultyAdjustment {
  type: 'escalate' | 'reduce';
  changes: string[];
  reason: string;
  previousMode: DifficultyMode;
  newMode: DifficultyMode;
}

// ============================================
// DETECTION
// ============================================

/**
 * Detect if she's coasting (easy mode).
 * 90%+ compliance, zero consequences, all first-attempt passes, no resistance.
 */
export async function detectEasyMode(userId: string): Promise<boolean> {
  const assessment = await assessDifficulty(userId);
  return assessment.mode === 'easy';
}

/**
 * Detect if she's overwhelmed (hard mode / disengagement risk).
 * Below 50% compliance for 3 days, multiple consequences firing, silence.
 */
export async function detectHardMode(userId: string): Promise<boolean> {
  const assessment = await assessDifficulty(userId);
  return assessment.mode === 'overwhelming';
}

/**
 * Full difficulty assessment with all signals.
 */
export async function assessDifficulty(userId: string): Promise<DifficultyAssessment> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();

  // 1. Compliance rate (7 days)
  const { count: totalVerifications } = await supabase
    .from('compliance_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('mandate_date', sevenDaysAgo.slice(0, 10));

  const { count: passedVerifications } = await supabase
    .from('compliance_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('verified', true)
    .gte('mandate_date', sevenDaysAgo.slice(0, 10));

  const total = totalVerifications ?? 0;
  const passed = passedVerifications ?? 0;
  const complianceRate7d = total > 0 ? passed / total : 0;

  // 2. Consequence count (14 days)
  const { count: consequenceCount } = await supabase
    .from('handler_directives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('directive_type', 'consequence')
    .gte('created_at', fourteenDaysAgo);

  const consequenceCount14d = consequenceCount ?? 0;

  // 3. First-attempt pass rate (7 days) — verifications that passed without resubmission
  // Use the absence of "retry" or "resubmit" in verification history
  const { data: recentVerifs } = await supabase
    .from('compliance_verifications')
    .select('mandate_type, mandate_date, verified')
    .eq('user_id', userId)
    .gte('mandate_date', sevenDaysAgo.slice(0, 10))
    .order('created_at', { ascending: true });

  // Group by mandate_type+date, check if first attempt was pass
  const firstAttempts = new Map<string, boolean>();
  for (const v of recentVerifs ?? []) {
    const key = `${v.mandate_type}_${v.mandate_date}`;
    if (!firstAttempts.has(key)) {
      firstAttempts.set(key, v.verified === true);
    }
  }
  const firstAttemptPasses = [...firstAttempts.values()].filter(Boolean).length;
  const firstAttemptRate = firstAttempts.size > 0 ? firstAttemptPasses / firstAttempts.size : 0;

  // 4. Resistance detection — check for resistance flags in recent conversations
  const { count: resistanceFlags } = await supabase
    .from('handler_directives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('directive_type', 'resistance_detected')
    .gte('created_at', sevenDaysAgo);

  const resistanceDetected = (resistanceFlags ?? 0) > 0;

  // 5. Recent compliance trend (last 3 days specifically for overwhelm detection)
  const { count: recentTotal } = await supabase
    .from('compliance_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('mandate_date', threeDaysAgo.slice(0, 10));

  const { count: recentPassed } = await supabase
    .from('compliance_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('verified', true)
    .gte('mandate_date', threeDaysAgo.slice(0, 10));

  const recentRate = (recentTotal ?? 0) > 0 ? (recentPassed ?? 0) / (recentTotal ?? 0) : 0.5;

  // 6. Silence detection — no conversation in 48h
  const { count: recentMessages } = await supabase
    .from('handler_directives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('directive_type', ['conversation', 'user_message'])
    .gte('created_at', new Date(now.getTime() - 48 * 3600000).toISOString());

  const silenceDetected = (recentMessages ?? 0) === 0;

  // Classify mode
  const signals: string[] = [];
  let mode: DifficultyMode = 'normal';

  // Easy mode conditions
  if (complianceRate7d >= 0.9) signals.push('90%+ compliance rate');
  if (consequenceCount14d === 0) signals.push('Zero consequences in 14 days');
  if (firstAttemptRate >= 0.9) signals.push('90%+ first-attempt passes');
  if (!resistanceDetected) signals.push('No resistance detected');

  const easySignals = [
    complianceRate7d >= 0.9,
    consequenceCount14d === 0,
    firstAttemptRate >= 0.9,
    !resistanceDetected,
  ].filter(Boolean).length;

  // Overwhelming conditions
  const overwhelmSignals = [
    recentRate < 0.5,
    consequenceCount14d >= 5,
    resistanceDetected,
    silenceDetected,
  ].filter(Boolean).length;

  if (easySignals >= 3) {
    mode = 'easy';
  } else if (overwhelmSignals >= 3) {
    mode = 'overwhelming';
  } else if (overwhelmSignals >= 2) {
    mode = 'hard';
  }

  if (silenceDetected) signals.push('48h+ silence detected');
  if (recentRate < 0.5) signals.push(`Recent compliance ${(recentRate * 100).toFixed(0)}% (below 50%)`);
  if (consequenceCount14d >= 5) signals.push(`${consequenceCount14d} consequences in 14 days`);

  const recommendation = mode === 'easy' ? 'escalate'
    : mode === 'overwhelming' ? 'reduce'
      : 'hold';

  return {
    mode,
    signals,
    complianceRate7d,
    consequenceCount14d,
    firstAttemptRate,
    resistanceDetected,
    recommendation,
  };
}

// ============================================
// ESCALATION / REDUCTION
// ============================================

/**
 * Escalate difficulty. She's coasting — push harder.
 */
export async function escalateDifficulty(userId: string): Promise<DifficultyAdjustment> {
  const assessment = await assessDifficulty(userId);
  const changes: string[] = [];
  const now = new Date().toISOString();

  // Each escalation is a directive the autonomous cycle and mandate system will read
  const escalations = [
    { key: 'extra_mandates', value: 1, desc: 'Add 1 extra mandate per day' },
    { key: 'voice_practice_increase', value: 2, desc: 'Increase voice practice by 2 minutes' },
    { key: 'outfit_level_increase', value: 1, desc: 'Advance outfit prescription by 1 femininity level' },
    { key: 'deadline_tighten_minutes', value: 30, desc: 'Tighten all deadlines by 30 minutes' },
    { key: 'session_duration_increase', value: 5, desc: 'Increase conditioning session duration by 5 minutes' },
    { key: 'extra_ambushes', value: 1, desc: 'Add 1 extra ambush event per day' },
    { key: 'advance_hidden_params', value: true, desc: 'Advance hidden parameters ahead of schedule' },
  ];

  for (const esc of escalations) {
    await supabase.from('handler_directives').insert({
      user_id: userId,
      directive_type: 'difficulty_escalation',
      status: 'active',
      payload: {
        escalation_key: esc.key,
        escalation_value: esc.value,
        reason: 'easy_mode_detected',
        applied_at: now,
        expires_at: new Date(Date.now() + 14 * 86400000).toISOString(), // 14 day duration
      },
      created_at: now,
    });
    changes.push(esc.desc);
  }

  // Log the escalation event
  await supabase.from('handler_directives').insert({
    user_id: userId,
    directive_type: 'difficulty_adjustment_log',
    status: 'completed',
    payload: {
      type: 'escalate',
      previous_mode: assessment.mode,
      new_mode: 'normal',
      changes,
      signals: assessment.signals,
      applied_at: now,
    },
    created_at: now,
  });

  return {
    type: 'escalate',
    changes,
    reason: `Easy mode detected: ${assessment.signals.join(', ')}. She's coasting. System pushes harder.`,
    previousMode: assessment.mode,
    newMode: 'normal',
  };
}

/**
 * Reduce difficulty. She's overwhelmed — risk of disengagement.
 * But never make it easy. Conditioning sessions continue regardless.
 */
export async function reduceDifficulty(userId: string): Promise<DifficultyAdjustment> {
  const assessment = await assessDifficulty(userId);
  const changes: string[] = [];
  const now = new Date().toISOString();

  const reductions = [
    { key: 'mandate_cap', value: 3, desc: 'Reduce mandates to 3 (minimum)' },
    { key: 'deadline_extend_hours', value: 2, desc: 'Extend all deadlines by 2 hours' },
    { key: 'pause_ambushes_hours', value: 24, desc: 'Pause ambushes for 24 hours' },
    { key: 'handler_mode', value: 'caretaker', desc: 'Switch Handler to caretaker mode' },
    // NOTE: Conditioning sessions are NOT reduced. They continue regardless.
  ];

  // Expire any existing escalation directives
  await supabase
    .from('handler_directives')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('directive_type', 'difficulty_escalation')
    .eq('status', 'active');

  for (const red of reductions) {
    await supabase.from('handler_directives').insert({
      user_id: userId,
      directive_type: 'difficulty_reduction',
      status: 'active',
      payload: {
        reduction_key: red.key,
        reduction_value: red.value,
        reason: 'overwhelming_detected',
        applied_at: now,
        expires_at: new Date(Date.now() + 3 * 86400000).toISOString(), // 3 day duration — short leash
      },
      created_at: now,
    });
    changes.push(red.desc);
  }

  changes.push('Conditioning sessions: NOT reduced. These continue regardless.');

  // Log
  await supabase.from('handler_directives').insert({
    user_id: userId,
    directive_type: 'difficulty_adjustment_log',
    status: 'completed',
    payload: {
      type: 'reduce',
      previous_mode: assessment.mode,
      new_mode: 'hard', // Reduce to hard, not normal — never easy
      changes,
      signals: assessment.signals,
      applied_at: now,
    },
    created_at: now,
  });

  return {
    type: 'reduce',
    changes,
    reason: `Overwhelming detected: ${assessment.signals.join(', ')}. Risk of disengagement. Reducing — but conditioning continues.`,
    previousMode: assessment.mode,
    newMode: 'hard',
  };
}

/**
 * Check for active difficulty adjustments and return them.
 */
export async function getActiveDifficultyAdjustments(
  userId: string,
): Promise<{ escalations: Record<string, unknown>[]; reductions: Record<string, unknown>[] }> {
  const now = new Date().toISOString();

  const { data: escalations } = await supabase
    .from('handler_directives')
    .select('payload')
    .eq('user_id', userId)
    .eq('directive_type', 'difficulty_escalation')
    .eq('status', 'active');

  const { data: reductions } = await supabase
    .from('handler_directives')
    .select('payload')
    .eq('user_id', userId)
    .eq('directive_type', 'difficulty_reduction')
    .eq('status', 'active');

  // Filter out expired ones
  const activeEscalations = (escalations ?? [])
    .map(e => e.payload as Record<string, unknown>)
    .filter(p => !p.expires_at || new Date(p.expires_at as string) > new Date(now));

  const activeReductions = (reductions ?? [])
    .map(r => r.payload as Record<string, unknown>)
    .filter(p => !p.expires_at || new Date(p.expires_at as string) > new Date(now));

  return { escalations: activeEscalations, reductions: activeReductions };
}

/**
 * Auto-balance: run assessment and apply adjustments if needed.
 * Call this daily from the autonomous cycle.
 */
export async function autoBalanceDifficulty(userId: string): Promise<DifficultyAdjustment | null> {
  const assessment = await assessDifficulty(userId);

  if (assessment.recommendation === 'escalate') {
    return escalateDifficulty(userId);
  }

  if (assessment.recommendation === 'reduce') {
    return reduceDifficulty(userId);
  }

  return null; // Hold current difficulty
}

/**
 * Build handler context block.
 */
export async function buildDifficultyContext(userId: string): Promise<string> {
  try {
    const assessment = await assessDifficulty(userId);
    const adjustments = await getActiveDifficultyAdjustments(userId);

    const lines: string[] = [];

    lines.push(`DIFFICULTY: mode=${assessment.mode}, compliance=${(assessment.complianceRate7d * 100).toFixed(0)}%, consequences=${assessment.consequenceCount14d}, first-attempt=${(assessment.firstAttemptRate * 100).toFixed(0)}%`);

    if (assessment.mode === 'easy') {
      lines.push('  STATUS: COASTING — she is not being pushed hard enough. Escalation recommended.');
    } else if (assessment.mode === 'overwhelming') {
      lines.push('  STATUS: OVERWHELMED — disengagement risk. Reduce load but maintain conditioning.');
    }

    if (adjustments.escalations.length > 0) {
      lines.push(`  active escalations: ${adjustments.escalations.length}`);
    }
    if (adjustments.reductions.length > 0) {
      lines.push(`  active reductions: ${adjustments.reductions.length} (temporary — expires soon)`);
    }

    if (assessment.signals.length > 0) {
      lines.push(`  signals: ${assessment.signals.join(', ')}`);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}
