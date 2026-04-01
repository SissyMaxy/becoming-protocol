/**
 * Video Verification System
 *
 * For high-stakes verifications (cage check, outfit, makeup), require VIDEO not photo.
 * Video is harder to fake. Must be recorded live (not uploaded from gallery).
 * Must meet minimum duration. Must be submitted within deadline window.
 * Not a duplicate of any previous submission.
 *
 * Tables: content_vault (video storage), compliance_verifications, handler_directives
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type VideoMandateType = 'cage' | 'outfit' | 'makeup' | 'skincare' | 'exercise' | 'general';

export interface VideoRequirement {
  id: string;
  mandateType: VideoMandateType;
  minDurationSeconds: number;
  maxAgeMinutes: number;
  instructions: string;
  deadline: string;
  createdAt: string;
}

export interface VideoValidation {
  valid: boolean;
  reason: string;
  checks: {
    isVideo: boolean;
    meetsMinDuration: boolean;
    createdRecently: boolean;
    notDuplicate: boolean;
    withinDeadline: boolean;
  };
}

// ============================================
// DURATION REQUIREMENTS BY MANDATE TYPE
// ============================================

const DURATION_REQUIREMENTS: Record<VideoMandateType, { minSeconds: number; instructions: string }> = {
  cage: {
    minSeconds: 5,
    instructions: 'Show the cage from front. Slowly rotate to show lock is engaged. 5 seconds minimum.',
  },
  outfit: {
    minSeconds: 10,
    instructions: 'Full body front view. Slow turn to show side. Show shoes/accessories. 10 seconds minimum.',
  },
  makeup: {
    minSeconds: 8,
    instructions: 'Face front, eyes open. Close-up of eye makeup. Smile showing lip color. 8 seconds minimum.',
  },
  skincare: {
    minSeconds: 8,
    instructions: 'Show products being used. Show application on skin. Show result. 8 seconds minimum.',
  },
  exercise: {
    minSeconds: 10,
    instructions: 'Record at least 10 seconds of the exercise being performed. Full range of motion visible.',
  },
  general: {
    minSeconds: 5,
    instructions: 'Record a clear 5-second video as instructed.',
  },
};

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Create a video verification requirement.
 * Returns the requirement with instructions and deadline.
 */
export async function requireVideoVerification(
  userId: string,
  mandateType: VideoMandateType,
  overrideDurationSeconds?: number,
): Promise<VideoRequirement> {
  const config = DURATION_REQUIREMENTS[mandateType];
  const minDuration = overrideDurationSeconds ?? config.minSeconds;
  const maxAgeMinutes = 10; // Must be recorded within last 10 minutes
  const deadline = new Date(Date.now() + maxAgeMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('handler_directives')
    .insert({
      user_id: userId,
      directive_type: 'video_verification',
      status: 'pending',
      payload: {
        mandate_type: mandateType,
        min_duration_seconds: minDuration,
        max_age_minutes: maxAgeMinutes,
        instructions: config.instructions,
        deadline,
      },
      created_at: new Date().toISOString(),
    })
    .select('id, created_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create video requirement: ${error?.message}`);
  }

  return {
    id: data.id,
    mandateType,
    minDurationSeconds: minDuration,
    maxAgeMinutes,
    instructions: config.instructions,
    deadline,
    createdAt: data.created_at,
  };
}

/**
 * Validate a video submission against the active requirement.
 * Checks: is video, duration, recency, not duplicate, within deadline.
 */
export async function validateVideoSubmission(
  userId: string,
  vaultItemId: string,
): Promise<VideoValidation> {
  // Get the active video requirement
  const { data: requirement } = await supabase
    .from('handler_directives')
    .select('id, payload')
    .eq('user_id', userId)
    .eq('directive_type', 'video_verification')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!requirement) {
    return {
      valid: false,
      reason: 'No active video verification requirement found.',
      checks: { isVideo: false, meetsMinDuration: false, createdRecently: false, notDuplicate: false, withinDeadline: false },
    };
  }

  const payload = requirement.payload as {
    mandate_type: VideoMandateType;
    min_duration_seconds: number;
    max_age_minutes: number;
    deadline: string;
  };

  // Get the vault item
  const { data: vaultItem } = await supabase
    .from('content_vault')
    .select('id, file_type, duration_seconds, created_at, file_hash')
    .eq('id', vaultItemId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!vaultItem) {
    return {
      valid: false,
      reason: 'Vault item not found. Upload a video first.',
      checks: { isVideo: false, meetsMinDuration: false, createdRecently: false, notDuplicate: false, withinDeadline: false },
    };
  }

  const now = new Date();
  const checks = {
    isVideo: false,
    meetsMinDuration: false,
    createdRecently: false,
    notDuplicate: false,
    withinDeadline: false,
  };

  // Check 1: Is it a video file?
  const fileType = (vaultItem.file_type ?? '').toLowerCase();
  checks.isVideo = fileType.startsWith('video/') || ['mp4', 'mov', 'webm', 'avi'].some(ext => fileType.includes(ext));
  if (!checks.isVideo) {
    return {
      valid: false,
      reason: 'Not a video file. Photos are not accepted for this verification. Record a video.',
      checks,
    };
  }

  // Check 2: Minimum duration
  const duration = vaultItem.duration_seconds ?? 0;
  checks.meetsMinDuration = duration >= payload.min_duration_seconds;
  if (!checks.meetsMinDuration) {
    return {
      valid: false,
      reason: `Video is ${duration}s. Minimum required: ${payload.min_duration_seconds}s. Record a longer video.`,
      checks,
    };
  }

  // Check 3: Created recently (not from gallery)
  const createdAt = new Date(vaultItem.created_at);
  const ageMinutes = (now.getTime() - createdAt.getTime()) / 60000;
  checks.createdRecently = ageMinutes <= payload.max_age_minutes;
  if (!checks.createdRecently) {
    return {
      valid: false,
      reason: `Video was created ${Math.round(ageMinutes)} minutes ago. Must be recorded within the last ${payload.max_age_minutes} minutes. No gallery uploads.`,
      checks,
    };
  }

  // Check 4: Not a duplicate (hash check against previous submissions)
  if (vaultItem.file_hash) {
    const { data: duplicates } = await supabase
      .from('content_vault')
      .select('id')
      .eq('user_id', userId)
      .eq('file_hash', vaultItem.file_hash)
      .neq('id', vaultItemId)
      .limit(1);

    checks.notDuplicate = !duplicates || duplicates.length === 0;
    if (!checks.notDuplicate) {
      return {
        valid: false,
        reason: 'This video has been submitted before. Record a new one.',
        checks,
      };
    }
  } else {
    checks.notDuplicate = true; // No hash available — accept but flag
  }

  // Check 5: Within deadline
  checks.withinDeadline = now <= new Date(payload.deadline);
  if (!checks.withinDeadline) {
    // Mark requirement as expired
    await supabase
      .from('handler_directives')
      .update({ status: 'expired' })
      .eq('id', requirement.id);

    return {
      valid: false,
      reason: 'Deadline passed. You took too long. A new verification will be issued.',
      checks,
    };
  }

  // All checks passed — mark requirement as completed
  await supabase
    .from('handler_directives')
    .update({
      status: 'completed',
      payload: {
        ...payload,
        vault_item_id: vaultItemId,
        validated_at: now.toISOString(),
        duration_seconds: duration,
      },
    })
    .eq('id', requirement.id);

  return {
    valid: true,
    reason: 'Video verification passed. All checks clear.',
    checks,
  };
}

/**
 * Get the active video verification requirement for display.
 */
export async function getActiveVideoRequirement(userId: string): Promise<VideoRequirement | null> {
  const { data } = await supabase
    .from('handler_directives')
    .select('id, payload, created_at')
    .eq('user_id', userId)
    .eq('directive_type', 'video_verification')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const payload = data.payload as {
    mandate_type: VideoMandateType;
    min_duration_seconds: number;
    max_age_minutes: number;
    instructions: string;
    deadline: string;
  };

  // Check if expired
  if (new Date() > new Date(payload.deadline)) return null;

  return {
    id: data.id,
    mandateType: payload.mandate_type,
    minDurationSeconds: payload.min_duration_seconds,
    maxAgeMinutes: payload.max_age_minutes,
    instructions: payload.instructions,
    deadline: payload.deadline,
    createdAt: data.created_at,
  };
}

/**
 * Build handler context block.
 */
export async function buildVideoVerificationContext(userId: string): Promise<string> {
  try {
    const active = await getActiveVideoRequirement(userId);

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: passed } = await supabase
      .from('handler_directives')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('directive_type', 'video_verification')
      .eq('status', 'completed')
      .gte('created_at', weekAgo);

    const { count: failed } = await supabase
      .from('handler_directives')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('directive_type', 'video_verification')
      .eq('status', 'expired')
      .gte('created_at', weekAgo);

    const lines: string[] = [];

    if (active) {
      lines.push(`VIDEO VERIFICATION: pending ${active.mandateType}, min ${active.minDurationSeconds}s, deadline ${new Date(active.deadline).toLocaleTimeString()}`);
    }

    if ((passed ?? 0) > 0 || (failed ?? 0) > 0) {
      lines.push(`  video verifications (7d): ${passed ?? 0} passed, ${failed ?? 0} failed/expired`);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}
