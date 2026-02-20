/**
 * Voice Training Types
 * Structured drills, pitch tracking, own-voice conditioning, avoidance detection.
 * Layers on top of the voice-game types (028).
 */

// Drill types from the structured CSV spec
export type DrillType =
  | 'warmup'
  | 'resonance'
  | 'pitch'
  | 'reading'
  | 'recording'
  | 'sustained'
  | 'real_world'
  | 'intonation'
  | 'breathing'
  | 'listening';

// Context for pitch measurements
export type PitchContext = 'baseline' | 'drill' | 'freeform' | 'micro_task' | 'session';

// Context for voice recordings
export type RecordingContext = 'drill' | 'affirmation' | 'freeform' | 'baseline';

// ── Domain types ────────────────────────────────────

export interface VoiceDrill {
  id: string;
  title: string;
  instruction: string;
  level: number;
  drillType: DrillType;
  targetHzMin: number | null;
  targetHzMax: number | null;
  durationSeconds: number;
  equipmentNeeded: string | null;
  sortOrder: number;
}

export interface DrillLog {
  id: string;
  userId: string;
  drillId: string | null;
  completedAt: string;
  durationSeconds: number | null;
  pitchAvgHz: number | null;
  pitchMinHz: number | null;
  pitchMaxHz: number | null;
  qualityRating: number | null;
  notes: string | null;
}

export interface PitchLog {
  id: string;
  userId: string;
  context: PitchContext;
  pitchHz: number;
  durationSeconds: number;
  drillLogId: string | null;
  recordedAt: string;
}

export interface VoiceRecording {
  id: string;
  userId: string;
  recordingUrl: string;
  durationSeconds: number;
  context: RecordingContext;
  pitchAvgHz: number | null;
  transcript: string | null;
  isBaseline: boolean;
  levelAtRecording: number | null;
  createdAt: string;
}

// ── Extended progress (pitch tracking columns) ─────

export interface VoiceTrainingProgress {
  baselinePitchHz: number | null;
  currentPitchHz: number | null;
  targetPitchHz: number;
  pitchShiftHz: number;
  drillStreak: number;
  drillStreakLongest: number;
  lastDrillAt: string | null;
  totalDrills: number;
  totalDrillMinutes: number;
  voiceLevel: number;
  daysSinceLastPractice: number;
}

// ── Stats for UI display ────────────────────────────

export interface VoiceTrainingStats {
  // Pitch
  baselineHz: number | null;
  currentHz: number | null;
  targetHz: number;
  shiftHz: number;
  pitchHistory: Array<{ date: string; avgHz: number }>;

  // Drills
  drillStreak: number;
  longestDrillStreak: number;
  totalDrills: number;
  totalMinutes: number;
  todayDrills: number;
  todayMinutes: number;

  // Level
  voiceLevel: number;
  levelName: string;
  nextLevelDrillsNeeded: number;

  // Avoidance
  daysSinceLastPractice: number;
  isAvoiding: boolean; // 3+ days without practice
}

// ── Handler context injection ───────────────────────

export interface VoiceHandlerContext {
  voiceLevel: number;
  drillStreak: number;
  daysSinceLastPractice: number;
  isAvoiding: boolean;
  baselineHz: number | null;
  currentHz: number | null;
  pitchShiftHz: number;
  totalDrillMinutes: number;
}

// ── DB row types ────────────────────────────────────

export interface DbVoiceDrill {
  id: string;
  title: string;
  instruction: string;
  level: number;
  drill_type: string;
  target_hz_min: number | null;
  target_hz_max: number | null;
  duration_seconds: number;
  equipment_needed: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface DbDrillLog {
  id: string;
  user_id: string;
  drill_id: string | null;
  completed_at: string;
  duration_seconds: number | null;
  pitch_avg_hz: number | null;
  pitch_min_hz: number | null;
  pitch_max_hz: number | null;
  quality_rating: number | null;
  notes: string | null;
  created_at: string;
}

export interface DbPitchLog {
  id: string;
  user_id: string;
  context: string;
  pitch_hz: number;
  duration_seconds: number;
  drill_log_id: string | null;
  recorded_at: string;
}

export interface DbVoiceRecording {
  id: string;
  user_id: string;
  recording_url: string;
  duration_seconds: number;
  context: string;
  pitch_avg_hz: number | null;
  transcript: string | null;
  is_baseline: boolean;
  level_at_recording: number | null;
  created_at: string;
}

// ── Mappers ─────────────────────────────────────────

export function mapDbDrill(db: DbVoiceDrill): VoiceDrill {
  return {
    id: db.id,
    title: db.title,
    instruction: db.instruction,
    level: db.level,
    drillType: db.drill_type as DrillType,
    targetHzMin: db.target_hz_min,
    targetHzMax: db.target_hz_max,
    durationSeconds: db.duration_seconds,
    equipmentNeeded: db.equipment_needed,
    sortOrder: db.sort_order,
  };
}

export function mapDbDrillLog(db: DbDrillLog): DrillLog {
  return {
    id: db.id,
    userId: db.user_id,
    drillId: db.drill_id,
    completedAt: db.completed_at,
    durationSeconds: db.duration_seconds,
    pitchAvgHz: db.pitch_avg_hz,
    pitchMinHz: db.pitch_min_hz,
    pitchMaxHz: db.pitch_max_hz,
    qualityRating: db.quality_rating,
    notes: db.notes,
  };
}

export function mapDbPitchLog(db: DbPitchLog): PitchLog {
  return {
    id: db.id,
    userId: db.user_id,
    context: db.context as PitchContext,
    pitchHz: db.pitch_hz,
    durationSeconds: db.duration_seconds,
    drillLogId: db.drill_log_id,
    recordedAt: db.recorded_at,
  };
}

export function mapDbRecording(db: DbVoiceRecording): VoiceRecording {
  return {
    id: db.id,
    userId: db.user_id,
    recordingUrl: db.recording_url,
    durationSeconds: db.duration_seconds,
    context: db.context as RecordingContext,
    pitchAvgHz: db.pitch_avg_hz,
    transcript: db.transcript,
    isBaseline: db.is_baseline,
    levelAtRecording: db.level_at_recording,
    createdAt: db.created_at,
  };
}
