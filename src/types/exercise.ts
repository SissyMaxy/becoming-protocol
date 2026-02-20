/**
 * Exercise Tracking Types
 *
 * Guided workout sessions, streak tracking, body measurements,
 * and gym gate progression.
 */

// ============================================
// EXERCISE BLOCK (single exercise in a template)
// ============================================

export interface ExerciseBlock {
  name: string;
  sets: number;
  reps: number;              // for rep-based; ignored if durationSeconds is set
  durationSeconds?: number;  // for timer-based exercises (stretches, holds)
  restSeconds: number;       // rest between sets
  cues: string[];            // coaching cues shown during exercise
  isPerSide?: boolean;       // true = reps are per side
  deviceLevel?: number;      // 0-5 conceptual (multiply by 4 for Lovense 0-20)
  devicePulseOnRep?: boolean; // pulse device on each rep tap
}

// ============================================
// WORKOUT TEMPLATE
// ============================================

export type WorkoutTemplateType =
  | 'glute_power'
  | 'hip_shelf'
  | 'circuit'
  | 'mvw'
  | 'gym_glute'
  | 'gym_shelf'
  | 'waist_sculpt'
  | 'flexibility'
  | 'glute_endurance'
  | 'band_burn';

export type WorkoutLocation = 'home' | 'gym';

export interface WorkoutTemplate {
  id: string;
  name: string;
  type: WorkoutTemplateType;
  location: WorkoutLocation;
  estimatedMinutes: number;
  warmup: ExerciseBlock[];
  main: ExerciseBlock[];
  cooldown: ExerciseBlock[];
  gymGateRequired: boolean;
  domainLevelMin: ExerciseDomainLevel;
  completionAffirmations: string[];
}

// ============================================
// SESSION STATE (local during workout)
// ============================================

export type WorkoutPhase = 'warmup' | 'main' | 'cooldown';

export interface WorkoutSessionState {
  sessionId: string;
  template: WorkoutTemplate;
  phase: WorkoutPhase;
  exerciseIndex: number;
  setIndex: number;
  repsThisSet: number;
  isResting: boolean;
  restTimeRemaining: number;
  deviceEnabled: boolean;
  totalReps: number;
  totalSets: number;
  startedAt: number; // Date.now()
  isPaused: boolean;
}

// ============================================
// EXERCISE STREAK
// ============================================

export interface ExerciseStreakData {
  currentStreakWeeks: number;
  sessionsThisWeek: number;
  weekStart: string;
  totalSessions: number;
  totalMvwSessions: number;
  totalFullSessions: number;
  totalGymSessions: number;
  longestStreakWeeks: number;
  gymGateUnlocked: boolean;
  gymGateUnlockedAt: string | null;
  lastSessionAt: string | null;
}

// ============================================
// BODY MEASUREMENT
// ============================================

export interface BodyMeasurement {
  id: string;
  hipsInches: number | null;
  waistInches: number | null;
  hipWaistRatio: number | null;
  thighLeftInches: number | null;
  thighRightInches: number | null;
  shouldersInches: number | null;
  weightLbs: number | null;
  notes: string | null;
  measuredAt: string;
}

// ============================================
// SESSION COMPLETION
// ============================================

export type SessionType = 'full' | 'mvw' | 'gym';

export interface ExerciseCompleted {
  name: string;
  sets: number;
  reps: number;
  weightLbs?: number;
}

export interface SessionCompletionResult {
  totalReps: number;
  totalSets: number;
  durationSeconds: number;
  pointsAwarded: number;
  newStreakWeeks: number;
  sessionsThisWeek: number;
  affirmation: string;
}

// ============================================
// DOMAIN PROGRESSION
// ============================================

export type ExerciseDomainLevel = 1 | 2 | 3 | 4 | 5;

export const DOMAIN_LEVEL_NAMES: Record<ExerciseDomainLevel, string> = {
  1: 'Activation',
  2: 'Foundation',
  3: 'Building',
  4: 'Shaping',
  5: 'Her Body',
};

export const DOMAIN_LEVEL_DESCRIPTIONS: Record<ExerciseDomainLevel, string> = {
  1: 'Learning the movements. Building the habit.',
  2: 'Adding resistance bands. Consistent 3 sessions/week.',
  3: 'Dumbbells enter the picture. Progressive overload begins.',
  4: 'Approaching gym readiness. Full programming unlocked.',
  5: 'Gym regular. Advanced techniques. She built this body.',
};

export const DOMAIN_LEVEL_THRESHOLDS: Record<ExerciseDomainLevel, number> = {
  1: 12,
  2: 18,
  3: 24,
  4: 30,
  5: Infinity,
};

export interface ExerciseDomainConfig {
  id: string;
  userId: string;
  domainLevel: ExerciseDomainLevel;
  tasksCompletedThisLevel: number;
  targetSessionsPerWeek: number;
  preferredWorkoutDays: string[];
  equipmentOwned: string[];
  noveltyRotationIndex: number;
}

export interface ExerciseProgression {
  id: string;
  exerciseName: string;
  weightLbs: number | null;
  bandLevel: string | null;
  notes: string | null;
  recordedAt: string;
}

// ============================================
// EQUIPMENT TIERS
// ============================================

export type EquipmentTier = 'bodyweight' | 'bands' | 'dumbbells' | 'barbell' | 'gym';

export const EQUIPMENT_BY_LEVEL: Record<ExerciseDomainLevel, EquipmentTier[]> = {
  1: ['bodyweight'],
  2: ['bodyweight', 'bands'],
  3: ['bodyweight', 'bands', 'dumbbells'],
  4: ['bodyweight', 'bands', 'dumbbells', 'barbell'],
  5: ['bodyweight', 'bands', 'dumbbells', 'barbell', 'gym'],
};
