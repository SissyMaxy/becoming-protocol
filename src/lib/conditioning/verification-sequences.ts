/**
 * Multi-Step Verification Sequences
 *
 * Instead of one photo, require a rapid sequence that makes faking impractical.
 * 3-step sequences with time windows per step. All must complete in under 3 minutes.
 * Rapid pace + specific instructions + changing angles = recycled photos impossible.
 *
 * Tables: handler_directives
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type SequenceMandateType = 'outfit' | 'makeup' | 'cage' | 'skincare' | 'general';

export interface SequenceStep {
  stepNumber: number;
  instruction: string;
  timeWindowSeconds: number;
  requiresVideo: boolean;
}

export interface VerificationSequence {
  id: string;
  mandateType: SequenceMandateType;
  steps: SequenceStep[];
  currentStep: number;
  totalTimeLimit: number; // seconds
  startedAt: string;
  deadline: string;
  stepDeadlines: string[];
  completedSteps: number[];
}

export interface SequenceStepResult {
  accepted: boolean;
  reason: string;
  nextStep: SequenceStep | null;
  sequenceComplete: boolean;
  timeRemaining: number;
}

// ============================================
// SEQUENCE TEMPLATES BY MANDATE TYPE
// ============================================

const SEQUENCE_TEMPLATES: Record<SequenceMandateType, SequenceStep[]> = {
  outfit: [
    { stepNumber: 1, instruction: 'Full body photo from the front. Stand straight, arms at sides.', timeWindowSeconds: 60, requiresVideo: false },
    { stepNumber: 2, instruction: 'Turn to your right side. Same position, profile view.', timeWindowSeconds: 60, requiresVideo: false },
    { stepNumber: 3, instruction: 'Close-up of shoes/heels AND one accessory (jewelry, bag, etc).', timeWindowSeconds: 60, requiresVideo: false },
  ],
  makeup: [
    { stepNumber: 1, instruction: 'Face straight on. Neutral expression. Good lighting.', timeWindowSeconds: 60, requiresVideo: false },
    { stepNumber: 2, instruction: 'Eyes closed. Show eye shadow and liner. Close-up.', timeWindowSeconds: 60, requiresVideo: false },
    { stepNumber: 3, instruction: 'Smile. Show lip color and teeth. Camera at face level.', timeWindowSeconds: 60, requiresVideo: false },
  ],
  cage: [
    // Cage uses video — harder to fake, shows lock engagement
    { stepNumber: 1, instruction: 'Record 5-second video showing cage from front, then rotate to show lock.', timeWindowSeconds: 90, requiresVideo: true },
    { stepNumber: 2, instruction: 'Photo showing the lock mechanism close-up. Key not visible.', timeWindowSeconds: 60, requiresVideo: false },
    { stepNumber: 3, instruction: 'Photo from the side showing secure fit.', timeWindowSeconds: 60, requiresVideo: false },
  ],
  skincare: [
    { stepNumber: 1, instruction: 'Photo of products laid out. All labels visible.', timeWindowSeconds: 60, requiresVideo: false },
    { stepNumber: 2, instruction: 'Photo or 5s video of application in progress. Product on fingers/face.', timeWindowSeconds: 60, requiresVideo: false },
    { stepNumber: 3, instruction: 'Close-up of face after application. Skin should be visibly moisturized.', timeWindowSeconds: 60, requiresVideo: false },
  ],
  general: [
    { stepNumber: 1, instruction: 'Front view as instructed.', timeWindowSeconds: 60, requiresVideo: false },
    { stepNumber: 2, instruction: 'Side view.', timeWindowSeconds: 60, requiresVideo: false },
    { stepNumber: 3, instruction: 'Detail shot of the specific element requested.', timeWindowSeconds: 60, requiresVideo: false },
  ],
};

const TOTAL_TIME_LIMIT = 180; // 3 minutes for entire sequence

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Create a multi-step verification sequence.
 * Returns the sequence with first step instructions.
 */
export async function createVerificationSequence(
  userId: string,
  mandateType: SequenceMandateType,
): Promise<VerificationSequence> {
  // Cancel any existing pending sequences
  await supabase
    .from('handler_directives')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('directive_type', 'verification_sequence')
    .eq('status', 'pending');

  const steps = SEQUENCE_TEMPLATES[mandateType];
  const now = new Date();
  const deadline = new Date(now.getTime() + TOTAL_TIME_LIMIT * 1000).toISOString();

  // Calculate step deadlines
  const stepDeadlines: string[] = [];
  let accumulatedTime = 0;
  for (const step of steps) {
    accumulatedTime += step.timeWindowSeconds;
    stepDeadlines.push(
      new Date(now.getTime() + accumulatedTime * 1000).toISOString(),
    );
  }

  const { data, error } = await supabase
    .from('handler_directives')
    .insert({
      user_id: userId,
      directive_type: 'verification_sequence',
      status: 'pending',
      payload: {
        mandate_type: mandateType,
        steps,
        current_step: 1,
        completed_steps: [],
        step_deadlines: stepDeadlines,
        total_time_limit: TOTAL_TIME_LIMIT,
        started_at: now.toISOString(),
        deadline,
      },
      created_at: now.toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create verification sequence: ${error?.message}`);
  }

  return {
    id: data.id,
    mandateType,
    steps,
    currentStep: 1,
    totalTimeLimit: TOTAL_TIME_LIMIT,
    startedAt: now.toISOString(),
    deadline,
    stepDeadlines,
    completedSteps: [],
  };
}

/**
 * Submit a step completion for a verification sequence.
 * Validates timing and advances to next step.
 */
export async function submitSequenceStep(
  userId: string,
  sequenceId: string,
  stepNumber: number,
  vaultItemId: string,
): Promise<SequenceStepResult> {
  const { data } = await supabase
    .from('handler_directives')
    .select('id, payload')
    .eq('id', sequenceId)
    .eq('user_id', userId)
    .eq('directive_type', 'verification_sequence')
    .eq('status', 'pending')
    .maybeSingle();

  if (!data) {
    return {
      accepted: false,
      reason: 'No active verification sequence found. It may have expired.',
      nextStep: null,
      sequenceComplete: false,
      timeRemaining: 0,
    };
  }

  const payload = data.payload as {
    mandate_type: SequenceMandateType;
    steps: SequenceStep[];
    current_step: number;
    completed_steps: number[];
    step_deadlines: string[];
    total_time_limit: number;
    started_at: string;
    deadline: string;
  };

  const now = new Date();

  // Check total deadline
  if (now > new Date(payload.deadline)) {
    await supabase
      .from('handler_directives')
      .update({ status: 'expired' })
      .eq('id', sequenceId);

    return {
      accepted: false,
      reason: 'Total sequence time limit exceeded. 3 minutes is the maximum. Start over.',
      nextStep: null,
      sequenceComplete: false,
      timeRemaining: 0,
    };
  }

  // Check correct step order
  if (stepNumber !== payload.current_step) {
    return {
      accepted: false,
      reason: `Wrong step. You are on step ${payload.current_step}. Submit step ${payload.current_step} first.`,
      nextStep: payload.steps[payload.current_step - 1],
      sequenceComplete: false,
      timeRemaining: Math.max(0, (new Date(payload.deadline).getTime() - now.getTime()) / 1000),
    };
  }

  // Check step deadline
  const stepDeadline = new Date(payload.step_deadlines[stepNumber - 1]);
  if (now > stepDeadline) {
    await supabase
      .from('handler_directives')
      .update({ status: 'expired' })
      .eq('id', sequenceId);

    return {
      accepted: false,
      reason: `Step ${stepNumber} deadline passed. You had ${payload.steps[stepNumber - 1].timeWindowSeconds} seconds. Too slow.`,
      nextStep: null,
      sequenceComplete: false,
      timeRemaining: 0,
    };
  }

  // Step accepted — update sequence
  const completedSteps = [...payload.completed_steps, stepNumber];
  const nextStepNumber = stepNumber + 1;
  const sequenceComplete = nextStepNumber > payload.steps.length;

  // Recalculate remaining step deadlines from NOW (each step gets its full window from submission)
  const newStepDeadlines = [...payload.step_deadlines];
  if (!sequenceComplete) {
    // Next step deadline = now + next step's time window
    for (let i = nextStepNumber - 1; i < payload.steps.length; i++) {
      const prevEnd = i === nextStepNumber - 1
        ? now
        : new Date(newStepDeadlines[i - 1]);
      newStepDeadlines[i] = new Date(
        prevEnd.getTime() + payload.steps[i].timeWindowSeconds * 1000,
      ).toISOString();
    }
  }

  await supabase
    .from('handler_directives')
    .update({
      status: sequenceComplete ? 'completed' : 'pending',
      payload: {
        ...payload,
        current_step: sequenceComplete ? stepNumber : nextStepNumber,
        completed_steps: completedSteps,
        step_deadlines: newStepDeadlines,
        [`step_${stepNumber}_vault_id`]: vaultItemId,
        [`step_${stepNumber}_submitted_at`]: now.toISOString(),
        ...(sequenceComplete ? { completed_at: now.toISOString() } : {}),
      },
    })
    .eq('id', sequenceId);

  const timeRemaining = Math.max(0, (new Date(payload.deadline).getTime() - now.getTime()) / 1000);

  return {
    accepted: true,
    reason: sequenceComplete
      ? 'All steps complete. Verification sequence passed.'
      : `Step ${stepNumber} accepted. Move to step ${nextStepNumber} now.`,
    nextStep: sequenceComplete ? null : payload.steps[nextStepNumber - 1],
    sequenceComplete,
    timeRemaining,
  };
}

/**
 * Check the status of a verification sequence.
 */
export async function checkSequenceComplete(
  userId: string,
  sequenceId: string,
): Promise<{ complete: boolean; stepsCompleted: number; totalSteps: number; expired: boolean }> {
  const { data } = await supabase
    .from('handler_directives')
    .select('status, payload')
    .eq('id', sequenceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    return { complete: false, stepsCompleted: 0, totalSteps: 3, expired: true };
  }

  const payload = data.payload as {
    steps: SequenceStep[];
    completed_steps: number[];
  };

  return {
    complete: data.status === 'completed',
    stepsCompleted: payload.completed_steps.length,
    totalSteps: payload.steps.length,
    expired: data.status === 'expired',
  };
}

/**
 * Get the active verification sequence for UI display.
 */
export async function getActiveSequence(userId: string): Promise<VerificationSequence | null> {
  const { data } = await supabase
    .from('handler_directives')
    .select('id, payload')
    .eq('user_id', userId)
    .eq('directive_type', 'verification_sequence')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const payload = data.payload as {
    mandate_type: SequenceMandateType;
    steps: SequenceStep[];
    current_step: number;
    completed_steps: number[];
    step_deadlines: string[];
    total_time_limit: number;
    started_at: string;
    deadline: string;
  };

  // Check if expired
  if (new Date() > new Date(payload.deadline)) return null;

  return {
    id: data.id,
    mandateType: payload.mandate_type,
    steps: payload.steps,
    currentStep: payload.current_step,
    totalTimeLimit: payload.total_time_limit,
    startedAt: payload.started_at,
    deadline: payload.deadline,
    stepDeadlines: payload.step_deadlines,
    completedSteps: payload.completed_steps,
  };
}

/**
 * Build handler context block.
 */
export async function buildVerificationSequenceContext(userId: string): Promise<string> {
  try {
    const active = await getActiveSequence(userId);
    if (!active) return '';

    const timeLeft = Math.max(0, (new Date(active.deadline).getTime() - Date.now()) / 1000);
    return `VERIFICATION SEQUENCE: ${active.mandateType}, step ${active.currentStep}/${active.steps.length}, ${Math.round(timeLeft)}s remaining | instruction: "${active.steps[active.currentStep - 1].instruction}"`;
  } catch {
    return '';
  }
}
