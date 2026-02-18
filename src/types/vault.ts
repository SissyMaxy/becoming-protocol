// ============================================
// Content Vault Types
// ============================================

export type VaultTier = 'public_ready' | 'private' | 'restricted' | 'cam_recording' | 'cam_highlight';
export type MediaType = 'image' | 'video' | 'audio';
export type SourceType = 'task' | 'session' | 'cam' | 'spontaneous';
export type SubmissionState = 'calm' | 'aroused' | 'post_session' | 'during_cam';
export type ExposurePhase = 'pre_hrt' | 'early_hrt' | 'mid_hrt' | 'post_coming_out';
export type ContentUsage = 'public_post' | 'consequence' | 'fan_reward' | 'ppv' | 'cam_highlight';

export interface VaultItem {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: MediaType;
  thumbnailUrl?: string;
  description?: string;
  sourceType: SourceType;
  sourceTaskId?: string;
  sourceSessionId?: string;
  sourceCamSessionId?: string;
  captureContext?: string;
  arousalLevelAtCapture?: number;
  submittedAt: string;
  submissionState?: SubmissionState;
  vaultTier: VaultTier;
  vulnerabilityScore?: number;
  exposurePhaseMinimum?: ExposurePhase;
  handlerClassificationReason?: string;
  timesUsed: number;
  lastUsedAt?: string;
  usedAs: ContentUsage[];
  anonymityVerified: boolean;
  privacyScanResult?: PrivacyScanResult;
  exifStripped: boolean;
  createdAt: string;
}

export interface DbVaultItem {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  thumbnail_url: string | null;
  description: string | null;
  source_type: string;
  source_task_id: string | null;
  source_session_id: string | null;
  source_cam_session_id: string | null;
  capture_context: string | null;
  arousal_level_at_capture: number | null;
  submitted_at: string;
  submission_state: string | null;
  vault_tier: string;
  vulnerability_score: number | null;
  exposure_phase_minimum: string | null;
  handler_classification_reason: string | null;
  times_used: number;
  last_used_at: string | null;
  used_as: string[] | null;
  anonymity_verified: boolean;
  privacy_scan_result: Record<string, unknown> | null;
  exif_stripped: boolean;
  created_at: string;
}

// ============================================
// Privacy & Scan Types
// ============================================

export interface PrivacyScanResult {
  safe: boolean;
  warnings: string[];
  blocked: boolean;
  scannedAt: string;
}

export interface PrivacyScanInput {
  caption?: string;
  mediaFile?: File;
  mediaUrl?: string;
}

// ============================================
// Submission Flow Types
// ============================================

export interface CaptureData {
  mediaFile: File;
  captureContext: string;
  arousalLevel: number;
  sourceType: SourceType;
  sourceTaskId?: string;
  sourceSessionId?: string;
  sourceCamSessionId?: string;
}

export interface SubmissionReviewData {
  mediaPreviewUrl: string;
  mediaType: MediaType;
  privacyScan: PrivacyScanResult;
  handlerNote: string;
  captureContext: string;
  arousalLevel: number;
}

export type SubmissionDecision = 'submit' | 'veto';

export interface SubmissionClassification {
  vaultTier: VaultTier;
  vulnerabilityScore: number;
  plannedUsage: string;
  anonymityVerified: boolean;
  exposurePhaseMinimum?: ExposurePhase;
}

export interface SubmissionResult {
  success: boolean;
  vaultItemId?: string;
  error?: string;
}

// ============================================
// Consequence Types
// ============================================

export type ConsequenceEventType = 'warning' | 'escalation' | 'content_posted' | 'deescalation' | 'compliance_reset';

export interface ConsequenceState {
  id: string;
  userId: string;
  currentTier: number;
  daysNoncompliant: number;
  lastEscalationAt?: string;
  lastComplianceAt?: string;
  vetoCountThisWeek: number;
  submissionCountThisWeek: number;
  activeWarnings: Array<{ message: string; createdAt: string }>;
  activeDeadlines: Array<{ deadline: string; consequence: string }>;
  escalationHistory: Array<{ tier: number; date: string; reason: string }>;
  updatedAt: string;
}

export interface DbConsequenceState {
  id: string;
  user_id: string;
  current_tier: number;
  days_noncompliant: number;
  last_escalation_at: string | null;
  last_compliance_at: string | null;
  veto_count_this_week: number;
  submission_count_this_week: number;
  active_warnings: unknown;
  active_deadlines: unknown;
  escalation_history: unknown;
  updated_at: string;
}

export interface ConsequenceEvent {
  id: string;
  userId: string;
  tier: number;
  eventType: ConsequenceEventType;
  description?: string;
  vaultContentId?: string;
  contentPosted: boolean;
  platformPostedTo?: string;
  daysNoncompliant?: number;
  tasksSkipped?: number;
  handlerMessage?: string;
  createdAt: string;
}

// ============================================
// Veto Log Types
// ============================================

export interface VetoLogEntry {
  id: string;
  userId: string;
  sourceType: SourceType;
  sourceTaskId?: string;
  sourceSessionId?: string;
  captureContext?: string;
  arousalLevelAtCapture?: number;
  mediaType?: MediaType;
  reason?: string;
  createdAt: string;
}

// ============================================
// Mappers
// ============================================

export function mapDbToVaultItem(db: DbVaultItem): VaultItem {
  return {
    id: db.id,
    userId: db.user_id,
    mediaUrl: db.media_url,
    mediaType: db.media_type as MediaType,
    thumbnailUrl: db.thumbnail_url || undefined,
    description: db.description || undefined,
    sourceType: db.source_type as SourceType,
    sourceTaskId: db.source_task_id || undefined,
    sourceSessionId: db.source_session_id || undefined,
    sourceCamSessionId: db.source_cam_session_id || undefined,
    captureContext: db.capture_context || undefined,
    arousalLevelAtCapture: db.arousal_level_at_capture || undefined,
    submittedAt: db.submitted_at,
    submissionState: (db.submission_state as SubmissionState) || undefined,
    vaultTier: db.vault_tier as VaultTier,
    vulnerabilityScore: db.vulnerability_score || undefined,
    exposurePhaseMinimum: (db.exposure_phase_minimum as ExposurePhase) || undefined,
    handlerClassificationReason: db.handler_classification_reason || undefined,
    timesUsed: db.times_used,
    lastUsedAt: db.last_used_at || undefined,
    usedAs: (db.used_as as ContentUsage[]) || [],
    anonymityVerified: db.anonymity_verified,
    privacyScanResult: db.privacy_scan_result as unknown as PrivacyScanResult | undefined,
    exifStripped: db.exif_stripped,
    createdAt: db.created_at,
  };
}

export function mapDbToConsequenceState(db: DbConsequenceState): ConsequenceState {
  return {
    id: db.id,
    userId: db.user_id,
    currentTier: db.current_tier,
    daysNoncompliant: db.days_noncompliant,
    lastEscalationAt: db.last_escalation_at || undefined,
    lastComplianceAt: db.last_compliance_at || undefined,
    vetoCountThisWeek: db.veto_count_this_week,
    submissionCountThisWeek: db.submission_count_this_week,
    activeWarnings: (db.active_warnings as ConsequenceState['activeWarnings']) || [],
    activeDeadlines: (db.active_deadlines as ConsequenceState['activeDeadlines']) || [],
    escalationHistory: (db.escalation_history as ConsequenceState['escalationHistory']) || [],
    updatedAt: db.updated_at,
  };
}
