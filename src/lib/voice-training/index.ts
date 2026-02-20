/**
 * Voice Training — Barrel Exports
 *
 * Deep protocol integration for voice feminization:
 * pitch detection, structured drills, avoidance detection, own-voice conditioning.
 */

export {
  createPitchDetector,
  logPitch,
  getPitchHistory,
  classifyPitch,
  getPitchFeedback,
} from './pitch';
export type { PitchDetector } from './pitch';

export {
  getDrillsForLevel,
  getDrillById,
  getTodayDrills,
  logDrill,
  getTodayDrillLogs,
  getRecentDrillLogs,
  getVoiceTrainingProgress,
  VOICE_LEVELS,
  LEVEL_THRESHOLDS,
} from './drills';

export {
  checkVoiceAvoidance,
  getVoiceAvoidanceDays,
} from './avoidance';

export {
  saveRecording,
  getRecordings,
  getBaseline,
  getLatestRecording,
  getConditioningRecordings,
  deleteRecording,
  getRecordingCount,
} from './recordings';
