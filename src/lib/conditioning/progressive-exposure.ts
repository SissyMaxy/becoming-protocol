/**
 * Progressive Exposure Engine
 *
 * Systematically pushes Maxy into more visible, more public, more
 * irreversible feminization. Exposure is mandated, not suggested.
 * The ladder climbs. Non-completion fires the consequence engine.
 *
 * Tables: exposure_mandates, exposure_history, skill_levels,
 *         turning_out_progression, handler_interventions,
 *         handler_outreach_queue
 */

import { supabase } from '../supabase';
import { assessConsequence } from './consequence-engine';
import { queueOutreachMessage } from './proactive-outreach';

// ============================================
// TYPES
// ============================================

export type ExposureFrequency = 'daily' | '3x_weekly' | 'weekly' | 'biweekly' | 'monthly' | 'ongoing';
export type ExposureVerification = 'self_report' | 'photo' | 'audio' | 'auto_detect' | 'ongoing';

export interface ExposureMandate {
  level: number;
  task: string;
  verification: ExposureVerification;
  frequency: ExposureFrequency;
}

export interface ExposurePrescription {
  id: string;
  userId: string;
  level: number;
  task: string;
  verification: ExposureVerification;
  frequency: ExposureFrequency;
  dueDate: string;
  completed: boolean;
  completedAt: string | null;
}

export interface ExposureProgress {
  currentLevel: number;
  completionsAtLevel: number;
  complianceRate: number;
  readyToAdvance: boolean;
  totalCompletions: number;
  nextMandate: ExposureMandate | null;
}

// ============================================
// EXPOSURE LADDER
// ============================================

const EXPOSURE_LADDER: Record<number, ExposureMandate> = {
  1: { level: 1, task: 'Post a text update as Maxy on any platform', verification: 'self_report', frequency: 'daily' },
  2: { level: 2, task: 'Post a photo (no face) as Maxy', verification: 'self_report', frequency: '3x_weekly' },
  3: { level: 3, task: 'Post a photo (face visible) as Maxy', verification: 'self_report', frequency: 'weekly' },
  4: { level: 4, task: 'Respond to 3 DMs as Maxy', verification: 'auto_detect', frequency: 'daily' },
  5: { level: 5, task: 'Record and post a voice clip', verification: 'audio', frequency: 'weekly' },
  6: { level: 6, task: 'Video call with someone as Maxy', verification: 'self_report', frequency: 'biweekly' },
  7: { level: 7, task: 'Go to a public place presenting feminine', verification: 'photo', frequency: 'weekly' },
  8: { level: 8, task: 'Attend a social event as Maxy', verification: 'self_report', frequency: 'monthly' },
  9: { level: 9, task: 'Meet someone from online in person', verification: 'self_report', frequency: 'monthly' },
  10: { level: 10, task: 'Regular real-world social life as Maxy', verification: 'ongoing', frequency: 'ongoing' },
};

// ============================================
// FREQUENCY → DAYS BETWEEN
// ============================================

const FREQUENCY_DAYS: Record<ExposureFrequency, number> = {
  daily: 1,
  '3x_weekly': 2,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  ongoing: 7,
};

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get current exposure level from social_presentation skill + turning_out_progression.
 */
export async function getExposureLevel(userId: string): Promise<number> {
  const [skillRes, progressionRes] = await Promise.all([
    supabase
      .from('skill_levels')
      .select('current_level')
      .eq('user_id', userId)
      .eq('domain', 'social_presentation')
      .maybeSingle(),
    supabase
      .from('turning_out_progression')
      .select('current_stage')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const skillLevel = skillRes.data?.current_level ?? 1;
  const turningOutStage = progressionRes.data?.current_stage ?? 0;

  // Exposure level is the higher of skill level and turning out stage
  return Math.max(1, Math.min(10, Math.max(skillLevel, turningOutStage)));
}

/**
 * Prescribe an exposure task based on current level + compliance rate.
 * Auto-advances when compliance is high enough.
 */
export async function prescribeExposure(userId: string): Promise<ExposurePrescription> {
  const level = await getExposureLevel(userId);
  const mandate = EXPOSURE_LADDER[level] ?? EXPOSURE_LADDER[1]!;

  // Check if there's a pending mandate
  const { data: pending } = await supabase
    .from('exposure_mandates')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pending) {
    return mapDbToExposure(pending);
  }

  // Calculate due date based on frequency
  const daysUntilDue = FREQUENCY_DAYS[mandate.frequency] ?? 7;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + daysUntilDue);
  dueDate.setHours(23, 59, 0, 0);

  // Create new mandate
  const { data: inserted } = await supabase
    .from('exposure_mandates')
    .insert({
      user_id: userId,
      level: mandate.level,
      task: mandate.task,
      verification: mandate.verification,
      frequency: mandate.frequency,
      due_date: dueDate.toISOString(),
      completed: false,
    })
    .select('*')
    .single();

  // Queue outreach
  await queueOutreachMessage(
    userId,
    `New exposure mandate: "${mandate.task}" — due by ${dueDate.toLocaleDateString()}. Level ${level}. This is not optional.`,
    'high',
    `exposure_mandate:L${level}`,
    undefined,
    undefined,
    'system',
  );

  return inserted ? mapDbToExposure(inserted) : {
    id: `exposure_${Date.now()}`,
    userId,
    level: mandate.level,
    task: mandate.task,
    verification: mandate.verification,
    frequency: mandate.frequency,
    dueDate: dueDate.toISOString(),
    completed: false,
    completedAt: null,
  };
}

/**
 * Complete an exposure mandate. Records completion + checks for advancement.
 */
export async function completeExposure(
  userId: string,
  mandateId: string,
  evidence?: string,
): Promise<{ completed: boolean; advanced: boolean; newLevel: number }> {
  const now = new Date().toISOString();

  await supabase
    .from('exposure_mandates')
    .update({
      completed: true,
      completed_at: now,
      evidence,
    })
    .eq('id', mandateId)
    .eq('user_id', userId);

  // Record in history
  const { data: mandate } = await supabase
    .from('exposure_mandates')
    .select('level, task')
    .eq('id', mandateId)
    .maybeSingle();

  if (mandate) {
    await supabase.from('exposure_history').insert({
      user_id: userId,
      level: mandate.level,
      task: mandate.task,
      completed_at: now,
      evidence,
    });
  }

  // Check for auto-advancement
  const advancement = await checkAdvancement(userId);

  return {
    completed: true,
    advanced: advancement.advanced,
    newLevel: advancement.newLevel,
  };
}

/**
 * Check if the user should advance to the next exposure level.
 * Requires 3+ completions at current level AND >80% compliance.
 */
async function checkAdvancement(userId: string): Promise<{ advanced: boolean; newLevel: number }> {
  const currentLevel = await getExposureLevel(userId);
  if (currentLevel >= 10) return { advanced: false, newLevel: 10 };

  // Count completions at current level
  const { data: completions } = await supabase
    .from('exposure_history')
    .select('id')
    .eq('user_id', userId)
    .eq('level', currentLevel);

  const completionCount = completions?.length ?? 0;

  // Count total mandates at this level (completed + missed)
  const { data: allMandates } = await supabase
    .from('exposure_mandates')
    .select('id, completed')
    .eq('user_id', userId)
    .eq('level', currentLevel);

  const totalMandates = allMandates?.length ?? 0;
  const completedMandates = allMandates?.filter((m) => m.completed).length ?? 0;
  const complianceRate = totalMandates > 0 ? completedMandates / totalMandates : 0;

  if (completionCount >= 3 && complianceRate > 0.8) {
    const newLevel = Math.min(10, currentLevel + 1);

    // Log advancement
    await supabase.from('handler_interventions').insert({
      user_id: userId,
      intervention_type: 'exposure_advancement',
      details: {
        previous_level: currentLevel,
        new_level: newLevel,
        completions_at_level: completionCount,
        compliance_rate: complianceRate,
      },
    });

    // Update skill level if needed
    await supabase
      .from('skill_levels')
      .update({ current_level: newLevel })
      .eq('user_id', userId)
      .eq('domain', 'social_presentation')
      .lt('current_level', newLevel);

    // Outreach for advancement
    await queueOutreachMessage(
      userId,
      `Exposure level advanced to L${newLevel}: "${EXPOSURE_LADDER[newLevel]?.task ?? 'Next level'}". The ladder only goes up.`,
      'high',
      `exposure_advance:L${newLevel}`,
      undefined,
      undefined,
      'system',
    );

    return { advanced: true, newLevel };
  }

  return { advanced: false, newLevel: currentLevel };
}

/**
 * Process overdue exposure mandates. Fire consequences for missed ones.
 */
export async function processOverdueExposures(userId: string): Promise<number> {
  const now = new Date().toISOString();

  const { data: overdue } = await supabase
    .from('exposure_mandates')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .eq('consequence_fired', false)
    .lt('due_date', now);

  if (!overdue || overdue.length === 0) return 0;

  let fired = 0;
  for (const mandate of overdue) {
    await assessConsequence(userId, [`exposure_miss:L${mandate.level}`]);

    await queueOutreachMessage(
      userId,
      `You missed your exposure mandate: "${mandate.task}". Level ${mandate.level}. The consequence is recorded. A new mandate is coming — this time with higher stakes.`,
      'high',
      `exposure_miss:${mandate.id}`,
      undefined,
      undefined,
      'system',
    );

    await supabase
      .from('exposure_mandates')
      .update({ consequence_fired: true })
      .eq('id', mandate.id);

    fired++;
  }

  return fired;
}

/**
 * Get full exposure progress for a user.
 */
export async function getExposureProgress(userId: string): Promise<ExposureProgress> {
  const currentLevel = await getExposureLevel(userId);

  const { data: atLevel } = await supabase
    .from('exposure_history')
    .select('id')
    .eq('user_id', userId)
    .eq('level', currentLevel);

  const { data: allHistory } = await supabase
    .from('exposure_history')
    .select('id')
    .eq('user_id', userId);

  const { data: allMandates } = await supabase
    .from('exposure_mandates')
    .select('id, completed')
    .eq('user_id', userId)
    .eq('level', currentLevel);

  const totalMandates = allMandates?.length ?? 0;
  const completedMandates = allMandates?.filter((m) => m.completed).length ?? 0;
  const complianceRate = totalMandates > 0 ? completedMandates / totalMandates : 0;
  const completionsAtLevel = atLevel?.length ?? 0;

  return {
    currentLevel,
    completionsAtLevel,
    complianceRate,
    readyToAdvance: completionsAtLevel >= 3 && complianceRate > 0.8,
    totalCompletions: allHistory?.length ?? 0,
    nextMandate: currentLevel < 10 ? EXPOSURE_LADDER[currentLevel + 1] ?? null : null,
  };
}

/**
 * Build handler context for exposure level.
 */
export async function buildExposureContext(userId: string): Promise<string> {
  try {
    const progress = await getExposureProgress(userId);
    const currentMandate = EXPOSURE_LADDER[progress.currentLevel];

    const lines: string[] = ['## Progressive Exposure'];
    lines.push(`LEVEL: ${progress.currentLevel}/10 | COMPLETIONS: ${progress.completionsAtLevel}/3 needed | COMPLIANCE: ${(progress.complianceRate * 100).toFixed(0)}%`);

    if (currentMandate) {
      lines.push(`CURRENT: "${currentMandate.task}" (${currentMandate.frequency})`);
    }

    if (progress.readyToAdvance) {
      lines.push(`READY TO ADVANCE to L${progress.currentLevel + 1}: "${progress.nextMandate?.task ?? 'next'}"`);
    }

    // Pending mandate
    const { data: pending } = await supabase
      .from('exposure_mandates')
      .select('task, due_date, completed')
      .eq('user_id', userId)
      .eq('completed', false)
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pending) {
      const dueDate = new Date(pending.due_date).toLocaleDateString();
      lines.push(`PENDING: "${pending.task}" — due ${dueDate}`);
    }

    lines.push(`TOTAL LIFETIME COMPLETIONS: ${progress.totalCompletions}`);

    return lines.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

function mapDbToExposure(row: Record<string, unknown>): ExposurePrescription {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    level: row.level as number,
    task: row.task as string,
    verification: row.verification as ExposureVerification,
    frequency: row.frequency as ExposureFrequency,
    dueDate: row.due_date as string,
    completed: row.completed as boolean,
    completedAt: (row.completed_at as string) ?? null,
  };
}
