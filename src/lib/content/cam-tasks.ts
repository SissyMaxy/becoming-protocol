// ============================================
// Cam Task Integration
// Maps cam prescriptions to task templates
// Handles cam-specific task lifecycle
// ============================================

import { supabase } from '../supabase';
import type { CamPrescription, CamSession } from '../../types/cam';

// ============================================
// Cam Task Template Codes
// ============================================

export const CAM_TASK_CODES = {
  PRE_CAM_PREP: 'CAM1',
  VOICE_WARMUP: 'CAM1V',
  HANDLER_DIRECTED: 'CAM2',
  FIRST_CAM: 'CAM3',
  OBEDIENCE_CAM: 'CAM4',
  DENIAL_CAM: 'CAM5',
  BROADCAST_EDGE: 'CAM6',
  SESSION_RECAP: 'CONT1',
  DENIAL_CHECKIN: 'CONT2',
  OUTFIT_TRYON: 'CONT3',
  BODY_MEASUREMENT: 'CONT4',
} as const;

// ============================================
// Prescription → Task Mapping
// ============================================

/**
 * Given a cam prescription, return the sequence of task template codes
 * that should be assigned for this session.
 */
export function getTasksForPrescription(
  prescription: CamPrescription,
  context: {
    isFirstCam: boolean;
    voiceLevel: number;
    denialDay: number;
  }
): string[] {
  const tasks: string[] = [];

  // Always start with prep
  tasks.push(CAM_TASK_CODES.PRE_CAM_PREP);

  // Voice warmup if voice is required and user has voice training
  if (prescription.voiceRequired && context.voiceLevel >= 2) {
    tasks.push(CAM_TASK_CODES.VOICE_WARMUP);
  }

  // Main session task based on type
  if (context.isFirstCam) {
    tasks.push(CAM_TASK_CODES.FIRST_CAM);
  } else if (prescription.requiredActivities.includes('edge_session') || prescription.edgingRequired) {
    if (context.denialDay >= 5) {
      tasks.push(CAM_TASK_CODES.DENIAL_CAM);
    } else {
      tasks.push(CAM_TASK_CODES.BROADCAST_EDGE);
    }
  } else if (prescription.requiredActivities.includes('obedience')) {
    tasks.push(CAM_TASK_CODES.OBEDIENCE_CAM);
  } else {
    tasks.push(CAM_TASK_CODES.HANDLER_DIRECTED);
  }

  // Always end with recap
  tasks.push(CAM_TASK_CODES.SESSION_RECAP);

  return tasks;
}

// ============================================
// Post-Session Content Tasks
// ============================================

/**
 * Generate follow-up content tasks after a cam session ends.
 */
export function getPostSessionTasks(
  _session: CamSession,
  context: {
    denialDay: number;
    hasActiveFanPoll: boolean;
  }
): string[] {
  const tasks: string[] = [];

  // Recap is always needed
  tasks.push(CAM_TASK_CODES.SESSION_RECAP);

  // Denial check-in if in denial arc
  if (context.denialDay >= 3) {
    tasks.push(CAM_TASK_CODES.DENIAL_CHECKIN);
  }

  return tasks;
}

// ============================================
// Cam Session Count
// ============================================

/**
 * Check if user has completed any cam sessions (for first-cam milestone).
 */
export async function hasCompletedAnyCam(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('cam_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'ended')
    .limit(1);

  return (data || []).length > 0;
}

/**
 * Get cam session count for progress tracking.
 */
export async function getCamSessionCount(userId: string): Promise<number> {
  const { data } = await supabase
    .from('cam_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'ended');

  return (data || []).length;
}
