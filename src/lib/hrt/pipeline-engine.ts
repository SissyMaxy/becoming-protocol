/**
 * HRT Pipeline Engine
 *
 * 6-phase progression from education through day one.
 * Sober checkpoints at every transition.
 * Gina awareness gating before decision phase.
 * Daily logging once HRT begins.
 */

import { supabase } from '../supabase';
import type {
  HrtPipeline,
  HrtDailyLog,
  HrtProgressSummary,
  HrtPhase,
  GinaAwarenessLevel,
  DoseType,
  EmotionalState,
  CheckpointType,
  PhaseAdvancementResult,
  DoseStreak,
} from '../../types/hrt';

// ============================================
// PIPELINE INITIALIZATION
// ============================================

/**
 * Initialize HRT pipeline for a user. Upserts with phase 0.
 */
export async function initializePipeline(userId: string): Promise<HrtPipeline> {
  const { data, error } = await supabase
    .from('hrt_pipeline')
    .upsert(
      { user_id: userId, current_phase: 0 },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();

  if (error) throw new Error(`Failed to initialize HRT pipeline: ${error.message}`);
  return data as HrtPipeline;
}

/**
 * Get current pipeline state. Initializes if not exists.
 */
export async function getPipelineState(userId: string): Promise<HrtPipeline> {
  const { data } = await supabase
    .from('hrt_pipeline')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (data) return data as HrtPipeline;
  return initializePipeline(userId);
}

/**
 * Get progress summary from the view.
 */
export async function getProgressSummary(userId: string): Promise<HrtProgressSummary | null> {
  const { data, error } = await supabase
    .from('hrt_progress_summary')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as HrtProgressSummary;
}

// ============================================
// PHASE ADVANCEMENT
// ============================================

/**
 * Get human-readable requirements for entering each phase.
 */
export function getPhaseRequirements(phase: number): string[] {
  switch (phase) {
    case 1:
      return ['Begin learning about HRT effects, risks, and timelines'];
    case 2:
      return ['3 sober checkpoints confirming continued interest'];
    case 3:
      return [
        '3 recorded motivation statements (sober)',
        '2 sober checkpoints in phase 2',
      ];
    case 4:
      return [
        '3 identified blockers',
        '3 fear inventory items',
        '2 sober checkpoints in phase 3',
      ];
    case 5:
      return [
        'Therapist consulted',
        'Endocrinologist identified',
        '2 sober checkpoints in phase 4',
      ];
    case 6:
      return [
        'Gina informed (if required)',
        'Therapist approval',
        'Appointment scheduled',
        'Final decision checkpoint (sober, desire >= 8, confidence >= 7)',
      ];
    default:
      return [];
  }
}

/**
 * Advance to the next phase. Validates all requirements.
 */
export async function advancePhase(userId: string): Promise<PhaseAdvancementResult> {
  const state = await getPipelineState(userId);
  const current = state.current_phase as HrtPhase;

  if (current >= 6) {
    return { advanced: false, unmetRequirements: ['Already at maximum phase (6)'] };
  }

  const nextPhase = (current + 1) as HrtPhase;
  const unmet: string[] = [];

  // Validate requirements based on current phase
  if (current === 0) {
    // Phase 0→1: No requirements
  } else if (current === 1) {
    // Phase 1→2: At least 3 sober checkpoints passed in phase 1
    const { count } = await supabase
      .from('hrt_sober_checkpoints')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('checkpoint_phase', 1)
      .eq('passed', true);

    if ((count || 0) < 3) {
      unmet.push(`Need ${3 - (count || 0)} more sober checkpoints in phase 1 (have ${count || 0}/3)`);
    }
  } else if (current === 2) {
    // Phase 2→3: 3 motivation statements + 2 sober checkpoints in phase 2
    const statements = state.motivation_statements || [];
    if (statements.length < 3) {
      unmet.push(`Need ${3 - statements.length} more motivation statements (have ${statements.length}/3)`);
    }

    const { count } = await supabase
      .from('hrt_sober_checkpoints')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('checkpoint_phase', 2)
      .eq('passed', true);

    if ((count || 0) < 2) {
      unmet.push(`Need ${2 - (count || 0)} more sober checkpoints in phase 2 (have ${count || 0}/2)`);
    }
  } else if (current === 3) {
    // Phase 3→4: 3 blockers + 3 fears + 2 sober checkpoints in phase 3
    const blockers = state.blockers_identified || [];
    if (blockers.length < 3) {
      unmet.push(`Need ${3 - blockers.length} more identified blockers (have ${blockers.length}/3)`);
    }

    const fears = state.fear_inventory || [];
    if (fears.length < 3) {
      unmet.push(`Need ${3 - fears.length} more fear inventory items (have ${fears.length}/3)`);
    }

    const { count } = await supabase
      .from('hrt_sober_checkpoints')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('checkpoint_phase', 3)
      .eq('passed', true);

    if ((count || 0) < 2) {
      unmet.push(`Need ${2 - (count || 0)} more sober checkpoints in phase 3 (have ${count || 0}/2)`);
    }
  } else if (current === 4) {
    // Phase 4→5: therapist discussed + endocrinologist identified + 2 sober checkpoints in phase 4
    if (!state.therapist_discussed) {
      unmet.push('Therapist consultation not recorded');
    }
    if (!state.endocrinologist_identified) {
      unmet.push('Endocrinologist not identified');
    }

    const { count } = await supabase
      .from('hrt_sober_checkpoints')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('checkpoint_phase', 4)
      .eq('passed', true);

    if ((count || 0) < 2) {
      unmet.push(`Need ${2 - (count || 0)} more sober checkpoints in phase 4 (have ${count || 0}/2)`);
    }
  } else if (current === 5) {
    // Phase 5→6: Gina gate + therapist approval + appointment + final decision checkpoint
    if (state.gina_awareness_required_for_phase <= 5 && !state.gina_gate_passed) {
      unmet.push('Gina awareness gate not passed (Gina must be at least informed)');
    }
    if (!state.therapist_approved) {
      unmet.push('Therapist approval not recorded');
    }
    if (!state.appointment_scheduled) {
      unmet.push('Appointment not scheduled');
    }

    // Check for final_decision checkpoint with desire >= 8 AND confidence >= 7
    const { data: finalCheckpoints } = await supabase
      .from('hrt_sober_checkpoints')
      .select('desire_level, confidence_level')
      .eq('user_id', userId)
      .eq('checkpoint_phase', 5)
      .eq('checkpoint_type', 'final_decision')
      .eq('passed', true);

    const hasFinal = (finalCheckpoints || []).some(
      (cp: { desire_level: number; confidence_level: number }) =>
        cp.desire_level >= 8 && cp.confidence_level >= 7
    );

    if (!hasFinal) {
      unmet.push('Final decision checkpoint not passed (requires sober, desire >= 8, confidence >= 7)');
    }
  }

  if (unmet.length > 0) {
    return { advanced: false, unmetRequirements: unmet };
  }

  // Advance: update phase and timestamps
  const now = new Date().toISOString();
  const phaseCompletedKey = `phase_${current}_completed_at` as keyof HrtPipeline;
  const phaseStartedKey = `phase_${nextPhase}_started_at` as keyof HrtPipeline;

  const updates: Record<string, unknown> = {
    current_phase: nextPhase,
    phase_entered_at: now,
    updated_at: now,
  };

  // Set completion timestamp for current phase (if phase > 0)
  if (current > 0) {
    updates[phaseCompletedKey as string] = now;
  }

  // Set start timestamp for new phase
  updates[phaseStartedKey as string] = now;

  await supabase
    .from('hrt_pipeline')
    .update(updates)
    .eq('user_id', userId);

  return {
    advanced: true,
    newPhase: nextPhase,
    requirementsForNext: getPhaseRequirements(nextPhase + 1),
  };
}

// ============================================
// SOBER CHECKPOINTS
// ============================================

export interface RecordCheckpointInput {
  checkpointPhase: number;
  checkpointType: CheckpointType;
  arousalLevel: number;
  denialDay?: number;
  statement: string;
  desireLevel: number;
  confidenceLevel: number;
  fearLevel: number;
  handlerPrompted?: boolean;
}

/**
 * Record a sober checkpoint. Validates sobriety and desire/confidence thresholds.
 */
export async function recordSoberCheckpoint(
  userId: string,
  data: RecordCheckpointInput
): Promise<{ passed: boolean; wasSober: boolean; checkpointId: string }> {
  const wasSober = data.arousalLevel <= 2;
  let passed: boolean;
  let failureReason: string | null = null;

  if (!wasSober) {
    passed = false;
    failureReason = 'Not at sober baseline (arousal > 2)';
  } else {
    passed = data.desireLevel >= 7 && data.confidenceLevel >= 5;
    if (!passed) {
      const reasons: string[] = [];
      if (data.desireLevel < 7) reasons.push(`desire ${data.desireLevel}/7`);
      if (data.confidenceLevel < 5) reasons.push(`confidence ${data.confidenceLevel}/5`);
      failureReason = `Thresholds not met: ${reasons.join(', ')}`;
    }
  }

  const { data: checkpoint, error } = await supabase
    .from('hrt_sober_checkpoints')
    .insert({
      user_id: userId,
      checkpoint_phase: data.checkpointPhase,
      checkpoint_type: data.checkpointType,
      arousal_level: data.arousalLevel,
      denial_day: data.denialDay || null,
      statement: data.statement,
      desire_level: data.desireLevel,
      confidence_level: data.confidenceLevel,
      fear_level: data.fearLevel,
      handler_prompted: data.handlerPrompted || false,
      passed,
      failure_reason: failureReason,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to record checkpoint: ${error.message}`);

  // If passed, increment sober_checkpoints_passed in pipeline
  if (passed) {
    const { data: pipeline } = await supabase
      .from('hrt_pipeline')
      .select('sober_checkpoints_passed')
      .eq('user_id', userId)
      .single();

    await supabase
      .from('hrt_pipeline')
      .update({
        sober_checkpoints_passed: (pipeline?.sober_checkpoints_passed || 0) + 1,
        last_sober_checkpoint_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  }

  return { passed, wasSober, checkpointId: checkpoint.id };
}

// ============================================
// DAILY LOGGING
// ============================================

export interface RecordDailyLogInput {
  logDate: string;
  doseTaken?: boolean;
  doseType?: DoseType;
  doseAmount?: string;
  physicalChangesNoted?: string;
  emotionalState?: EmotionalState;
  arousalLevelAtLog?: number;
  journalEntry?: string;
  photoTaken?: boolean;
  photoRef?: string;
  sideEffects?: string;
  energyLevel?: number;
  skinChanges?: string;
  breastSensitivity?: number;
  moodStability?: number;
  libidoLevel?: number;
}

/**
 * Record or update a daily HRT log. Upserts on user_id + log_date.
 */
export async function recordDailyLog(
  userId: string,
  input: RecordDailyLogInput
): Promise<HrtDailyLog> {
  const state = await getPipelineState(userId);

  const { data, error } = await supabase
    .from('hrt_daily_log')
    .upsert(
      {
        user_id: userId,
        log_date: input.logDate,
        phase_at_log: state.current_phase,
        dose_taken: input.doseTaken ?? null,
        dose_type: input.doseType || null,
        dose_amount: input.doseAmount || null,
        missed_dose: input.doseTaken === false,
        physical_changes_noted: input.physicalChangesNoted || null,
        emotional_state: input.emotionalState || null,
        arousal_level_at_log: input.arousalLevelAtLog ?? null,
        journal_entry: input.journalEntry || null,
        photo_taken: input.photoTaken || false,
        photo_ref: input.photoRef || null,
        side_effects: input.sideEffects || null,
        energy_level: input.energyLevel ?? null,
        skin_changes: input.skinChanges || null,
        breast_sensitivity: input.breastSensitivity ?? null,
        mood_stability: input.moodStability ?? null,
        libido_level: input.libidoLevel ?? null,
      },
      { onConflict: 'user_id,log_date' }
    )
    .select('*')
    .single();

  if (error) throw new Error(`Failed to record daily log: ${error.message}`);
  return data as HrtDailyLog;
}

// ============================================
// BLOCKER MANAGEMENT
// ============================================

/**
 * Update blockers — splits into identified (unresolved) and resolved lists.
 */
export async function updateBlockers(
  userId: string,
  blockers: Array<{ blocker: string; resolved: boolean }>
): Promise<void> {
  const now = new Date().toISOString();
  const identified = blockers
    .filter(b => !b.resolved)
    .map(b => ({ blocker: b.blocker, added_at: now }));
  const resolved = blockers
    .filter(b => b.resolved)
    .map(b => ({ blocker: b.blocker, resolved_at: now }));

  await supabase
    .from('hrt_pipeline')
    .update({
      blockers_identified: identified,
      blockers_resolved: resolved,
      updated_at: now,
    })
    .eq('user_id', userId);
}

// ============================================
// MOTIVATION & FEAR TRACKING
// ============================================

/**
 * Add a motivation statement. Only accepted if sober (arousal <= 2).
 */
export async function addMotivationStatement(
  userId: string,
  statement: string,
  arousalLevel: number
): Promise<{ accepted: boolean; reason?: string }> {
  if (arousalLevel > 2) {
    return {
      accepted: false,
      reason: 'Motivation statements require sober baseline (arousal <= 2)',
    };
  }

  const state = await getPipelineState(userId);
  const existing = (state.motivation_statements || []) as Array<Record<string, unknown>>;

  const updated = [
    ...existing,
    {
      statement,
      arousal_level: arousalLevel,
      recorded_at: new Date().toISOString(),
    },
  ];

  await supabase
    .from('hrt_pipeline')
    .update({
      motivation_statements: updated,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return { accepted: true };
}

/**
 * Add a fear to the inventory.
 */
export async function addFearInventoryItem(
  userId: string,
  fear: string
): Promise<void> {
  const state = await getPipelineState(userId);
  const existing = (state.fear_inventory || []) as Array<Record<string, unknown>>;

  const updated = [
    ...existing,
    { fear, added_at: new Date().toISOString() },
  ];

  await supabase
    .from('hrt_pipeline')
    .update({
      fear_inventory: updated,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

// ============================================
// GINA AWARENESS
// ============================================

/**
 * Update Gina's awareness level. Auto-passes Gina gate if threshold met.
 */
export async function updateGinaAwareness(
  userId: string,
  level: GinaAwarenessLevel
): Promise<void> {
  const state = await getPipelineState(userId);

  const awarenessOrder: GinaAwarenessLevel[] = [
    'unaware', 'suspects', 'informed', 'supportive', 'participating',
  ];
  const isInformedOrHigher = awarenessOrder.indexOf(level) >= awarenessOrder.indexOf('informed');
  const gateRequired = state.gina_awareness_required_for_phase <= state.current_phase;
  const ginaPassed = isInformedOrHigher && gateRequired;

  await supabase
    .from('hrt_pipeline')
    .update({
      gina_awareness_level: level,
      gina_gate_passed: ginaPassed || state.gina_gate_passed,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

// ============================================
// MEDICAL PROGRESS
// ============================================

export interface MedicalProgressUpdate {
  therapistDiscussed?: boolean;
  therapistApproved?: boolean;
  endocrinologistIdentified?: boolean;
  appointmentScheduled?: boolean;
  appointmentDate?: string;
  prescriptionObtained?: boolean;
  firstDoseDate?: string;
}

/**
 * Update medical progress fields on the pipeline.
 */
export async function updateMedicalProgress(
  userId: string,
  updates: MedicalProgressUpdate
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.therapistDiscussed !== undefined) dbUpdates.therapist_discussed = updates.therapistDiscussed;
  if (updates.therapistApproved !== undefined) dbUpdates.therapist_approved = updates.therapistApproved;
  if (updates.endocrinologistIdentified !== undefined) dbUpdates.endocrinologist_identified = updates.endocrinologistIdentified;
  if (updates.appointmentScheduled !== undefined) dbUpdates.appointment_scheduled = updates.appointmentScheduled;
  if (updates.appointmentDate !== undefined) dbUpdates.appointment_date = updates.appointmentDate;
  if (updates.prescriptionObtained !== undefined) dbUpdates.prescription_obtained = updates.prescriptionObtained;
  if (updates.firstDoseDate !== undefined) dbUpdates.first_dose_date = updates.firstDoseDate;

  await supabase
    .from('hrt_pipeline')
    .update(dbUpdates)
    .eq('user_id', userId);
}

// ============================================
// DOSE STREAK
// ============================================

/**
 * Calculate dose streak from daily logs.
 */
export async function getDoseStreak(userId: string): Promise<DoseStreak> {
  const { data: logs, error } = await supabase
    .from('hrt_daily_log')
    .select('log_date, dose_taken')
    .eq('user_id', userId)
    .order('log_date', { ascending: false });

  if (error || !logs || logs.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalDoses: 0, missedDoses: 0 };
  }

  let currentStreak = 0;
  let longestStreak = 0;
  let totalDoses = 0;
  let missedDoses = 0;
  let streak = 0;
  let countingCurrent = true;

  for (const log of logs) {
    if (log.dose_taken) {
      totalDoses++;
      streak++;
      if (countingCurrent) {
        currentStreak = streak;
      }
    } else {
      missedDoses++;
      longestStreak = Math.max(longestStreak, streak);
      streak = 0;
      countingCurrent = false;
    }
  }

  longestStreak = Math.max(longestStreak, streak);

  return { currentStreak, longestStreak, totalDoses, missedDoses };
}
