// ============================================
// Hypno-Content Bridge Types
// Handler-curated library + capture-integrated sessions
// ============================================

// ============================================
// Union Types (match DB CHECK constraints)
// ============================================

export type HypnoLibraryCategory =
  | 'feminization'
  | 'sissy_training'
  | 'submission'
  | 'body_acceptance'
  | 'arousal_denial'
  | 'identity'
  | 'voice'
  | 'behavior'
  | 'relaxation'
  | 'sleep';

export type HypnoMediaType = 'audio' | 'video' | 'text';

export type HypnoCaptureType = 'passive' | 'flagged' | 'active';

export type HypnoSessionType =
  | 'conditioning'
  | 'sleep'
  | 'edge_adjacent'
  | 'compliance_bypass'
  | 'passive_capture';

export type HypnoCaptureMode = 'passive' | 'flagged' | 'active' | 'none';

export type HypnoBypassReason =
  | 'low_energy'
  | 'shoot_skipped'
  | 'cage_check_only'
  | 'audio_only'
  | 'text_only';

export type HypnoPostSessionState =
  | 'energized'
  | 'compliant'
  | 'foggy'
  | 'aroused'
  | 'peaceful'
  | 'disoriented'
  | 'resistant';

// ============================================
// Library Item
// ============================================

export interface HypnoLibraryItem {
  id: string;
  userId: string;
  title: string;
  sourceUrl?: string;
  filePath?: string;
  mediaType: HypnoMediaType;
  contentCategory: HypnoLibraryCategory;
  intensity: 1 | 2 | 3 | 4 | 5;
  conditioningTargets: string[];
  minDenialDay: number;
  minProtocolLevel: number;
  requiresCage: boolean;
  captureValue: number;
  captureType?: HypnoCaptureType;
  timesUsed: number;
  lastUsedAt?: string;
  handlerNotes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DbHypnoLibraryItem {
  id: string;
  user_id: string;
  title: string;
  source_url: string | null;
  file_path: string | null;
  media_type: string;
  content_category: string;
  intensity: number;
  conditioning_targets: string[] | null;
  min_denial_day: number;
  min_protocol_level: number;
  requires_cage: boolean;
  capture_value: number;
  capture_type: string | null;
  times_used: number;
  last_used_at: string | null;
  handler_notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// Session Capture Entry (JSONB element)
// ============================================

export interface HypnoCaptureEntry {
  vault_id: string;
  timestamp_seconds: number;
  capture_type: HypnoCaptureType;
  description?: string;
}

// ============================================
// Session Record (named to avoid collision with orchestrator's HypnoSession)
// ============================================

export interface HypnoSessionRecord {
  id: string;
  userId: string;
  libraryItemId?: string;
  contentIds: string[];
  sessionType: HypnoSessionType;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  completed: boolean;
  tranceDepth?: number;
  denialDayAtStart?: number;
  arousalAtStart?: number;
  postSessionState?: HypnoPostSessionState;
  captureMode?: HypnoCaptureMode;
  captures: HypnoCaptureEntry[];
  vaultIds: string[];
  bypassReason?: HypnoBypassReason;
  originalPrescriptionType?: string;
  bambiSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbHypnoSessionRecord {
  id: string;
  user_id: string;
  library_item_id: string | null;
  content_ids: string[] | null;
  session_type: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  completed: boolean;
  trance_depth: number | null;
  denial_day_at_start: number | null;
  arousal_at_start: number | null;
  post_session_state: string | null;
  capture_mode: string | null;
  captures: unknown;
  vault_ids: string[] | null;
  bypass_reason: string | null;
  original_prescription_type: string | null;
  bambi_session_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Session Summary (from view)
// ============================================

export interface HypnoSessionSummary {
  userId: string;
  totalSessions: number;
  bypassSessions: number;
  completedSessions: number;
  sessionsLast30Days: number;
  avgTranceDepth: number;
  sessionsWithCaptures: number;
  totalCaptures: number;
}

// ============================================
// Compliance Bypass Types
// ============================================

export type ComplianceBypassLevel =
  | 'full_shoot'
  | 'quick_shoot'
  | 'cage_check'
  | 'hypno_with_capture'
  | 'audio_only'
  | 'text_only';

export interface BypassPrescription {
  level: ComplianceBypassLevel;
  sessionType: HypnoSessionType;
  captureMode: HypnoCaptureMode;
  bypassReason: HypnoBypassReason;
  instruction: string;
  taskCode: string;
}

// ============================================
// Library Stats (for Handler context)
// ============================================

export interface HypnoLibraryStats {
  totalItems: number;
  byCategory: Partial<Record<HypnoLibraryCategory, number>>;
  avgCaptureValue: number;
  lastAddedAt?: string;
}

// ============================================
// Mappers
// ============================================

export function mapDbToHypnoLibraryItem(db: DbHypnoLibraryItem): HypnoLibraryItem {
  return {
    id: db.id,
    userId: db.user_id,
    title: db.title,
    sourceUrl: db.source_url || undefined,
    filePath: db.file_path || undefined,
    mediaType: db.media_type as HypnoMediaType,
    contentCategory: db.content_category as HypnoLibraryCategory,
    intensity: db.intensity as 1 | 2 | 3 | 4 | 5,
    conditioningTargets: db.conditioning_targets || [],
    minDenialDay: db.min_denial_day,
    minProtocolLevel: db.min_protocol_level,
    requiresCage: db.requires_cage,
    captureValue: db.capture_value,
    captureType: (db.capture_type as HypnoCaptureType) || undefined,
    timesUsed: db.times_used,
    lastUsedAt: db.last_used_at || undefined,
    handlerNotes: db.handler_notes || undefined,
    isActive: db.is_active,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function mapDbToHypnoSessionRecord(db: DbHypnoSessionRecord): HypnoSessionRecord {
  return {
    id: db.id,
    userId: db.user_id,
    libraryItemId: db.library_item_id || undefined,
    contentIds: db.content_ids || [],
    sessionType: db.session_type as HypnoSessionType,
    startedAt: db.started_at,
    endedAt: db.ended_at || undefined,
    durationSeconds: db.duration_seconds || undefined,
    completed: db.completed,
    tranceDepth: db.trance_depth ?? undefined,
    denialDayAtStart: db.denial_day_at_start ?? undefined,
    arousalAtStart: db.arousal_at_start ?? undefined,
    postSessionState: (db.post_session_state as HypnoPostSessionState) || undefined,
    captureMode: (db.capture_mode as HypnoCaptureMode) || undefined,
    captures: (db.captures as HypnoCaptureEntry[]) || [],
    vaultIds: db.vault_ids || [],
    bypassReason: (db.bypass_reason as HypnoBypassReason) || undefined,
    originalPrescriptionType: db.original_prescription_type || undefined,
    bambiSessionId: db.bambi_session_id || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}
