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
import { getSkillDomains, getTasksForLevel } from '../skills/skill-tree-engine';
import type { SkillDomain } from '../skills/skill-tree-engine';
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
 * Per-domain skip rate over the last N days. Domains the user consistently
 * ignores get penalized in scoring; persistently-ignored domains get a
 * cooldown (excluded entirely for a few days).
 *
 * This is the engagement-feedback loop the engine was missing — without it,
 * the same voice drills/content locks kept getting prescribed regardless of
 * whether she ever did them. The "Handler is dumb" feeling.
 */
export interface DomainSkipRate {
  domain: string;
  total: number;
  skipped: number;
  completed: number;
  skipRate: number; // 0..1
}

export async function fetchDomainSkipRates(
  userId: string,
  days = 7
): Promise<Record<string, DomainSkipRate>> {
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('feminization_prescriptions')
    .select('domain, status')
    .eq('user_id', userId)
    .gte('prescribed_date', since);

  if (error || !data) return {};

  const rates: Record<string, DomainSkipRate> = {};
  for (const row of data) {
    const d = row.domain as string;
    if (!rates[d]) rates[d] = { domain: d, total: 0, skipped: 0, completed: 0, skipRate: 0 };
    rates[d].total += 1;
    if (row.status === 'skipped') rates[d].skipped += 1;
    else if (row.status === 'completed') rates[d].completed += 1;
  }
  for (const d of Object.keys(rates)) {
    rates[d].skipRate = rates[d].total > 0 ? rates[d].skipped / rates[d].total : 0;
  }
  return rates;
}

/**
 * Score adjustment for a domain based on skip rate. Returns negative for
 * high-skip domains (push them down the priority list) and excludes
 * entirely if the user has skipped almost every prescription.
 */
export function skipRatePenalty(rate: DomainSkipRate | undefined): { delta: number; exclude: boolean } {
  if (!rate || rate.total < 3) return { delta: 0, exclude: false }; // not enough signal
  if (rate.skipRate >= 0.85) return { delta: -100, exclude: true }; // 7-day cooldown
  if (rate.skipRate >= 0.7) return { delta: -45, exclude: false };
  if (rate.skipRate >= 0.5) return { delta: -25, exclude: false };
  if (rate.skipRate >= 0.3) return { delta: -10, exclude: false };
  if (rate.skipRate <= 0.1 && rate.completed >= 3) return { delta: +8, exclude: false }; // reward streak
  return { delta: 0, exclude: false };
}

/**
 * Generate a daily feminization prescription for the user.
 * Selects 3-5 tasks from task_bank filtered by phase, recovery, denial,
 * recency, AND engagement (skip-rate penalty per domain).
 */
export async function generateDailyPrescription(
  userId: string
): Promise<DailyFeminizationPrescription> {
  const today = new Date().toISOString().split('T')[0];

  // Parallel fetch: user state, whoop, hidden ops, recent completions, skip rates
  const [stateResult, whoopResult, intensityResult, recentResult, skipResult] = await Promise.allSettled([
    fetchUserState(userId),
    buildWhoopContext(userId),
    getHiddenParam(userId, 'conditioning_intensity_multiplier'),
    fetchRecentTaskIds(userId, 14), // last 14 days
    fetchDomainSkipRates(userId, 7),
  ]);

  const state: UserPrescriptionState = stateResult.status === 'fulfilled'
    ? stateResult.value
    : { phase: 0, denialDay: 0, streakDays: 0 };

  const whoop = whoopResult.status === 'fulfilled' ? whoopResult.value : null;
  const intensityMultiplier = intensityResult.status === 'fulfilled' ? intensityResult.value : 1.0;
  const recentTaskIds = recentResult.status === 'fulfilled' ? recentResult.value : [];
  const skipRates: Record<string, DomainSkipRate> = skipResult.status === 'fulfilled' ? skipResult.value : {};

  // Gate: skip-rate fetch happened. If a future refactor removes this, the
  // assertion below trips loudly rather than silently regressing the
  // adaptive behavior. Memory rule: bug fix requires generation-site gate.
  if (skipResult.status !== 'fulfilled') {
    console.warn('[fem-prescription] skip rate fetch failed — adaptive scoring skipped this cycle');
  }

  // Determine recovery gate
  const recoveryZone = whoop?.recoveryZone ?? 'YELLOW';
  const maxIntensity = RECOVERY_INTENSITY_CAP[recoveryZone] ?? 5;

  // Determine available domains for current phase
  const effectivePhase = Math.min(state.phase, 4);
  let availableDomains = PHASE_DOMAINS[effectivePhase] ?? PHASE_DOMAINS[0];

  // Skip-rate cooldown: drop domains the user has skipped > 85% of recent
  // prescriptions. They get a 7-day breather from being assigned at all.
  const cooldownDomains = new Set<string>();
  for (const [d, r] of Object.entries(skipRates)) {
    if (skipRatePenalty(r).exclude) cooldownDomains.add(d);
  }
  if (cooldownDomains.size > 0) {
    availableDomains = availableDomains.filter(d => !cooldownDomains.has(d));
    console.log('[fem-prescription] cooldown domains', Array.from(cooldownDomains));
    // If we cooled down ALL phase domains, fall back to phase 0 essentials so
    // the user still gets SOMETHING. Better one task she'll skip than zero.
    if (availableDomains.length === 0) {
      availableDomains = PHASE_DOMAINS[0];
    }
  }

  // Determine how many tasks to prescribe (3-5). Reduce when skip rate is
  // high overall — pushing 5 tasks at someone ignoring 4 of them is
  // counter-productive. Better to land 2 well than fail 5 loudly.
  let taskCount = 4;
  if (recoveryZone === 'RED') taskCount = 3;
  if (recoveryZone === 'GREEN' && state.denialDay >= 3) taskCount = 5;
  const overallSkipRate = computeOverallSkipRate(skipRates);
  if (overallSkipRate >= 0.6) taskCount = Math.max(2, taskCount - 2);
  else if (overallSkipRate >= 0.4) taskCount = Math.max(3, taskCount - 1);

  // Query candidate tasks — skill-tree-gated when available, fallback to flat pool
  const candidates = await fetchSkillTreeGatedTasks(userId, availableDomains, maxIntensity);

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

    // ── ENGAGEMENT FEEDBACK ────────────────────────────────────────
    // The reason this engine exists. Domains the user consistently
    // ignores lose priority. Domains she follows through on get a small
    // boost. Without this, the engine prescribes voice drills she
    // hasn't done in 30 days because some other rule said "voice has
    // recency gap → boost." That's the bug.
    const skipAdj = skipRatePenalty(skipRates[task.domain]);
    score += skipAdj.delta;

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

  // Persist today's prescription with engagement metadata so we can audit
  // what got deprioritized and why.
  await persistPrescription(userId, today, tasks, recoveryZone, state.phase, {
    cooldownDomains: Array.from(cooldownDomains),
    skipRatesSnapshot: skipRates,
    overallSkipRate,
  });

  return {
    tasks,
    recoveryGate: recoveryZone,
    phase: state.phase,
    generatedAt: new Date().toISOString(),
    denialDay: state.denialDay,
    intensityMultiplier,
  };
}

function computeOverallSkipRate(rates: Record<string, DomainSkipRate>): number {
  let total = 0;
  let skipped = 0;
  for (const r of Object.values(rates)) {
    total += r.total;
    skipped += r.skipped;
  }
  return total > 0 ? skipped / total : 0;
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

/**
 * Fetch tasks gated by skill tree levels. Picks from domains with longest gap
 * since last practice, respecting current level intensity caps.
 * Falls back to flat pool if skill tree is empty.
 */
async function fetchSkillTreeGatedTasks(
  _userId: string,
  availableDomains: FeminizationDomain[],
  maxIntensity: number
): Promise<CandidateTask[]> {
  try {
    const skillDomains = await getSkillDomains(_userId);

    if (skillDomains.length === 0) {
      // Fallback to flat pool
      return fetchCandidateTasks(_userId, availableDomains, maxIntensity);
    }

    // Sort by longest gap since last practice (most neglected first)
    const sorted = [...skillDomains]
      .filter(d => availableDomains.includes(d.domain as FeminizationDomain))
      .sort((a, b) => {
        const aTime = a.last_practice_at ? new Date(a.last_practice_at).getTime() : 0;
        const bTime = b.last_practice_at ? new Date(b.last_practice_at).getTime() : 0;
        return aTime - bTime;
      });

    // Fetch level-gated tasks from top 5 most neglected skill domains
    const priorityDomains = sorted.slice(0, 5);
    const allTasks: CandidateTask[] = [];

    const taskPromises = priorityDomains.map(async (sd) => {
      const levelTasks = await getTasksForLevel(_userId, sd.domain as SkillDomain);
      return levelTasks
        .filter(t => t.intensity <= maxIntensity)
        .map(t => ({
          id: t.id,
          domain: t.domain,
          instruction: t.instruction,
          intensity: t.intensity,
          duration_minutes: t.duration_minutes,
          is_core: false, // level-gated tasks don't use is_core flag
        }));
    });

    const results = await Promise.allSettled(taskPromises);
    for (const r of results) {
      if (r.status === 'fulfilled') {
        allTasks.push(...r.value);
      }
    }

    // If skill tree didn't yield enough, supplement with flat pool
    if (allTasks.length < 20) {
      const flatPool = await fetchCandidateTasks(_userId, availableDomains, maxIntensity);
      // Add flat pool tasks that aren't already in skill tree results
      const existingIds = new Set(allTasks.map(t => t.id));
      for (const t of flatPool) {
        if (!existingIds.has(t.id)) {
          allTasks.push(t);
        }
      }
    }

    return allTasks;
  } catch {
    // Full fallback on any error
    return fetchCandidateTasks(_userId, availableDomains, maxIntensity);
  }
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
  phase: number,
  engagement?: {
    cooldownDomains: string[];
    skipRatesSnapshot: Record<string, DomainSkipRate>;
    overallSkipRate: number;
  }
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
      // Engagement metadata — what the engine knew about her recent
      // engagement when it picked these tasks. Lets a future audit show
      // "voice had skip_rate 0.9, was on cooldown" rather than guessing.
      engagement_meta: engagement ?? null,
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
      // engagement_meta column may not exist yet — fall back to insert
      // without it so the prescription still ships. Migration adds the
      // column; if it hasn't been applied we just lose the audit trail
      // for one cycle.
      if (/engagement_meta/.test(error.message)) {
        const { error: e2 } = await supabase
          .from('feminization_prescriptions')
          .insert(rows.map(r => {
            const { engagement_meta: _, ...rest } = r as Record<string, unknown>;
            return rest;
          }));
        if (e2) console.error('[fem-prescription] persistPrescription fallback error:', e2.message);
      } else {
        console.error('[fem-prescription] persistPrescription error:', error.message);
      }
    }
  } catch (err) {
    console.error('[fem-prescription] persistPrescription exception:', err);
  }
}
