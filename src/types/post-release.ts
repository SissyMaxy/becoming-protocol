/**
 * Post-Release Protocol types
 * Lockout, shame capture, deletion intercept, morning reframe.
 */

export type LockoutTier = 'standard' | 'high_regret';
export type ProtocolStatus = 'active' | 'completed' | 'expired';

export interface ShameEntry {
  text: string;
  capturedAt: string;
  minutesPostRelease: number;
}

// ============================================
// APP TYPE (camelCase)
// ============================================

export interface PostReleaseProtocol {
  id: string;
  userId: string;
  releaseType: string;
  regretLevel: number;
  intensity?: number;
  lockoutStartedAt: string;
  lockoutExpiresAt: string;
  lockoutTier: LockoutTier;
  preCommitmentText?: string;
  preCommitmentCapturedAt?: string;
  preCommitmentArousal?: number;
  shameEntries: ShameEntry[];
  reflectionText?: string;
  reflectionCompletedAt?: string;
  deletionAttempts: number;
  lastDeletionAttemptAt?: string;
  morningReframeShown: boolean;
  morningReframeAt?: string;
  status: ProtocolStatus;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// DB TYPE (snake_case)
// ============================================

export interface DbPostReleaseProtocol {
  id: string;
  user_id: string;
  release_type: string;
  regret_level: number;
  intensity: number | null;
  lockout_started_at: string;
  lockout_expires_at: string;
  lockout_tier: string;
  pre_commitment_text: string | null;
  pre_commitment_captured_at: string | null;
  pre_commitment_arousal: number | null;
  shame_entries: ShameEntry[];
  reflection_text: string | null;
  reflection_completed_at: string | null;
  deletion_attempts: number;
  last_deletion_attempt_at: string | null;
  morning_reframe_shown: boolean;
  morning_reframe_at: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// MAPPER
// ============================================

export function mapDbToPostReleaseProtocol(db: DbPostReleaseProtocol): PostReleaseProtocol {
  return {
    id: db.id,
    userId: db.user_id,
    releaseType: db.release_type,
    regretLevel: db.regret_level,
    intensity: db.intensity || undefined,
    lockoutStartedAt: db.lockout_started_at,
    lockoutExpiresAt: db.lockout_expires_at,
    lockoutTier: db.lockout_tier as LockoutTier,
    preCommitmentText: db.pre_commitment_text || undefined,
    preCommitmentCapturedAt: db.pre_commitment_captured_at || undefined,
    preCommitmentArousal: db.pre_commitment_arousal || undefined,
    shameEntries: db.shame_entries || [],
    reflectionText: db.reflection_text || undefined,
    reflectionCompletedAt: db.reflection_completed_at || undefined,
    deletionAttempts: db.deletion_attempts,
    lastDeletionAttemptAt: db.last_deletion_attempt_at || undefined,
    morningReframeShown: db.morning_reframe_shown,
    morningReframeAt: db.morning_reframe_at || undefined,
    status: db.status as ProtocolStatus,
    completedAt: db.completed_at || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}
