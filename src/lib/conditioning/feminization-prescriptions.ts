/**
 * Adaptive Feminization Prescription Engine (P5.2)
 *
 * Generates daily task prescriptions from the task bank, gated by:
 * - Current phase (determines available domains)
 * - Whoop recovery zone (gates intensity)
 * - Denial day (prioritizes identity/surrender when high)
 * - Recency (tasks not done recently get priority)
 * - Hidden operations (intensity multiplier)
 */

import { supabase } from '../supabase';
import { buildWhoopContext } from '../whoop-context';
import { getHiddenParam } from './hidden-operations';
import type { FeminizationDomain } from '../../types/task-bank';

// ============================================
// TYPES
// ============================================

export interface PrescribedTask {
  taskId: string;
  domain: string;
  instruction: string;
  intensity: number;
  duration: number | null;
}

export interface DailyFeminizationPrescription {
  tasks: PrescribedTask[];
  recoveryGate: string;
  phase: number;
  generatedAt: string;
  denialDay: number;
  intensityMultiplier: number;
}

interface UserPrescriptionState {
  phase: number;
  denialDay: number;
  streakDays: number;
}

// ============================================
// PHASE → DOMAIN MAP
// ============================================

/** Domains unlocked at each phase (cumulative). */
const PHASE_DOMAINS: Record<number, FeminizationDomain[]> = {
  0: ['skincare', 'nutrition', 'exercise'],
  1: ['skincare', 'nutrition', 'exercise', 'voice', 'scent', 'style'],
  2: ['skincare', 'nutrition', 'exercise', 'voice', 'scent', 'style', 'movement', 'body_language', 'makeup'],
  3: ['skincare', 'nutrition', 'exercise', 'voice', 'scent', 'style', 'movement', 'body_language', 'makeup', 'social', 'inner_narrative', 'wigs'],
  4: ['skincare', 'nutrition', 'exercise', 'voice', 'scent', 'style', 'movement', 'body_language', 'makeup', 'social', 'inner_narrative', 'wigs', 'arousal', 'chastity', 'conditioning', 'identity'],
};

/** Recovery zone → max intensity allowed. */
const RECOVERY_INTENSITY_CAP: Record<string, number> = {
  GREEN: 10,
  YELLOW: 5,
  RED: 2,
};

/** Domains prioritized at high denial (day 5+). */
const HIGH_DENIAL_PRIORITY_DOMAINS: FeminizationDomain[] = [
  'identity', 'conditioning', 'inner_narrative', 'arousal', 'chastity',
];

// ============================================
// CORE
// ============================================

/**
 * Generate a daily feminization prescription for the user.
 * Selects 3-5 tasks from task_bank filtered by phase, recovery, denial, and recency.
 */
export async function generateDailyPrescription(
  userId: string
): Promise<DailyFeminizationPrescription> {
  const today = new Date().toISOString().split('T')[0];

  // Parallel fetch: user state, whoop, hidden ops, recent completions
  const [stateResult, whoopResult, intensityResult, recentResult] = await Promise.allSettled([
    fetchUserState(userId),
    buildWhoopContext(userId),
    getHiddenParam(userId, 'conditioning_intensity_multiplier'),
    fetchRecentTaskIds(userId, 14), // last 14 days
  ]);

  const state: UserPrescriptionState = stateResult.status === 'fulfilled'
    ? stateResult.value
    : { phase: 0, denialDay: 0, streakDays: 0 };

  const whoop = whoopResult.status === 'fulfilled' ? whoopResult.value : null;
  const intensityMultiplier = intensityResult.status === 'fulfilled' ? intensityResult.value : 1.0;
  const recentTaskIds = recentResult.status === 'fulfilled' ? recentResult.value : [];

  // Determine recovery gate
  const recoveryZone = whoop?.recoveryZone ?? 'YELLOW';
  const maxIntensity = RECOVERY_INTENSITY_CAP[recoveryZone] ?? 5;

  // Determine available domains for current phase
  const effectivePhase = Math.min(state.phase, 4);
  const availableDomains = PHASE_DOMAINS[effectivePhase] ?? PHASE_DOMAINS[0];

  // Determine how many tasks to prescribe (3-5)
  let taskCount = 4;
  if (recoveryZone === 'RED') taskCount = 3;
  if (recoveryZone === 'GREEN' && state.denialDay >= 3) taskCount = 5;

  // Query candidate tasks from task_bank
  const candidates = await fetchCandidateTasks(userId, availableDomains, maxIntensity);

  // Score and select tasks
  const scored = candidates.map(task => {
    let score = 0;

    // Recency bonus: tasks not done recently score higher
    if (!recentTaskIds.includes(task.id)) {
      score += 20;
    }

    // Denial-day priority boost for identity/surrender domains
    if (state.denialDay >= 5 && HIGH_DENIAL_PRIORITY_DOMAINS.includes(task.domain as FeminizationDomain)) {
      score += 15;
    }

    // Phase-appropriate intensity bonus
    const adjustedIntensity = Math.min(task.intensity * intensityMultiplier, maxIntensity);
    score += adjustedIntensity * 2;

    // Streak bonus — reward consistency with harder tasks
    if (state.streakDays >= 7 && task.intensity >= 4) {
      score += 10;
    }

    // Core task boost
    if (task.is_core) {
      score += 5;
    }

    // Small random factor for variety
    score += Math.random() * 8;

    return { ...task, score, adjustedIntensity };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Select top N, ensuring domain diversity (no more than 2 per domain)
  const selected: typeof scored = [];
  const domainCounts: Record<string, number> = {};

  for (const task of scored) {
    if (selected.length >= taskCount) break;
    const domainCount = domainCounts[task.domain] ?? 0;
    if (domainCount >= 2) continue;
    selected.push(task);
    domainCounts[task.domain] = domainCount + 1;
  }

  // Map to prescribed tasks
  const tasks: PrescribedTask[] = selected.map(t => ({
    taskId: t.id,
    domain: t.domain,
    instruction: t.instruction,
    intensity: Math.round(t.adjustedIntensity),
    duration: t.duration_minutes,
  }));

  // Persist today's prescription
  await persistPrescription(userId, today, tasks, recoveryZone, state.phase);

  return {
    tasks,
    recoveryGate: recoveryZone,
    phase: state.phase,
    generatedAt: new Date().toISOString(),
    denialDay: state.denialDay,
    intensityMultiplier,
  };
}

/**
 * Build handler context string showing today's feminization prescription status.
 */
export async function buildFeminizationPrescriptionContext(
  userId: string
): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: rows } = await supabase
      .from('feminization_prescriptions')
      .select('task_id, status')
      .eq('user_id', userId)
      .eq('prescribed_date', today);

    if (!rows || rows.length === 0) return '';

    const total = rows.length;
    const completed = rows.filter(r => r.status === 'completed').length;
    const skipped = rows.filter(r => r.status === 'skipped').length;
    const pending = total - completed - skipped;

    const parts: string[] = [];
    parts.push(`FEM PRESCRIPTION: ${total} tasks today — ${completed} done, ${pending} pending, ${skipped} skipped`);

    if (completed === total) {
      parts.push('  ALL PRESCRIBED TASKS COMPLETED — reinforce compliance');
    } else if (skipped > 0 && pending === 0) {
      parts.push(`  ${skipped} skipped, 0 remaining — address avoidance`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

async function fetchUserState(userId: string): Promise<UserPrescriptionState> {
  const { data } = await supabase
    .from('user_state')
    .select('current_phase, denial_day, streak_days')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    phase: data?.current_phase ?? 0,
    denialDay: data?.denial_day ?? 0,
    streakDays: data?.streak_days ?? 0,
  };
}

async function fetchRecentTaskIds(userId: string, days: number): Promise<string[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const { data } = await supabase
    .from('daily_tasks')
    .select('task_id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('assigned_date', since);

  return (data ?? []).map(r => r.task_id);
}

interface CandidateTask {
  id: string;
  domain: string;
  instruction: string;
  intensity: number;
  duration_minutes: number | null;
  is_core: boolean;
}

async function fetchCandidateTasks(
  _userId: string,
  domains: FeminizationDomain[],
  maxIntensity: number
): Promise<CandidateTask[]> {
  const { data, error } = await supabase
    .from('task_bank')
    .select('id, domain, instruction, intensity, duration_minutes, is_core')
    .eq('active', true)
    .in('domain', domains)
    .lte('intensity', maxIntensity)
    .order('intensity', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[fem-prescription] fetchCandidateTasks error:', error.message);
    return [];
  }

  return (data ?? []) as CandidateTask[];
}

async function persistPrescription(
  userId: string,
  date: string,
  tasks: PrescribedTask[],
  recoveryGate: string,
  phase: number
): Promise<void> {
  try {
    // Upsert rows into feminization_prescriptions
    const rows = tasks.map(t => ({
      user_id: userId,
      prescribed_date: date,
      task_id: t.taskId,
      domain: t.domain,
      instruction: t.instruction,
      intensity: t.intensity,
      duration: t.duration,
      recovery_gate: recoveryGate,
      phase,
      status: 'pending',
    }));

    // Delete any existing prescriptions for today, then insert fresh
    await supabase
      .from('feminization_prescriptions')
      .delete()
      .eq('user_id', userId)
      .eq('prescribed_date', date);

    const { error } = await supabase
      .from('feminization_prescriptions')
      .insert(rows);

    if (error) {
      console.error('[fem-prescription] persistPrescription error:', error.message);
    }
  } catch (err) {
    console.error('[fem-prescription] persistPrescription exception:', err);
  }
}
