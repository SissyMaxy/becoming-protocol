/**
 * Voice Affirmation Game Types
 * Gamified voice training with speech recognition and haptic rewards
 */

// Difficulty levels (1-5)
export type VoiceGameDifficulty = 1 | 2 | 3 | 4 | 5;

// Affirmation categories
export type AffirmationCategory =
  | 'identity'        // "I am..." statements
  | 'capability'      // "I can..." statements
  | 'worthiness'      // "I deserve..." statements
  | 'transformation'  // "I am becoming..." statements
  | 'gratitude'       // "I appreciate..." statements
  | 'feminine'        // Feminization-specific
  | 'submission';     // Submission/service focused

// Game phases
export type VoiceGamePhase =
  | 'setup'           // Selecting options
  | 'countdown'       // 3-2-1 before affirmation
  | 'listening'       // Actively recording
  | 'processing'      // Analyzing speech
  | 'success'         // Affirmation matched
  | 'retry'           // Affirmation not matched
  | 'paused'          // Game paused
  | 'complete';       // Session finished

// Affirmation content
export interface Affirmation {
  id: string;
  text: string;
  category: AffirmationCategory;
  difficulty: VoiceGameDifficulty;
  variants: string[];        // Acceptable alternative phrasings
  keywords: string[];        // Required words for partial matching
  rewardIntensity: number;   // 0-20 Lovense intensity
  pointValue: number;
}

// Game session
export interface VoiceGameSession {
  id: string;
  userId: string;
  difficulty: VoiceGameDifficulty;
  categories: AffirmationCategory[];
  startedAt: string;
  completedAt: string | null;
  affirmationsAttempted: number;
  affirmationsCompleted: number;
  currentStreak: number;
  longestStreak: number;
  totalPoints: number;
  averageAccuracy: number;
  status: 'active' | 'completed' | 'abandoned';
}

// Individual attempt
export interface VoiceGameAttempt {
  id: string;
  sessionId: string;
  affirmationId: string;
  spokenText: string;
  accuracy: number;          // 0-100 match percentage
  isSuccess: boolean;
  rewardSent: boolean;
  attemptNumber: number;
  durationMs: number;
  createdAt: string;
}

// User progress tracking
export interface VoiceGameProgress {
  id: string;
  userId: string;
  totalSessions: number;
  totalAffirmations: number;
  currentStreak: number;     // Days in a row played
  longestStreak: number;
  lastPlayedAt: string | null;
  averageAccuracy: number;
  favoriteCategory: AffirmationCategory | null;
  highestDifficulty: VoiceGameDifficulty;
  totalPointsEarned: number;
  achievementsUnlocked: string[];
  createdAt: string;
  updatedAt: string;
}

// User settings
export interface VoiceGameSettings {
  id: string;
  userId: string;
  defaultDifficulty: VoiceGameDifficulty;
  preferredCategories: AffirmationCategory[];
  hapticRewardsEnabled: boolean;
  hapticIntensityMultiplier: number; // 0.5-2.0
  voiceRecognitionLanguage: string;
  showSubtitles: boolean;
  affirmationsPerSession: number;
  autoAdvanceOnSuccess: boolean;
  retryLimit: number;
  streakProtectionEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Achievement
export interface VoiceGameAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  conditionType: string;
  conditionValue: Record<string, unknown>;
  points: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

// Match result from voice recognition
export interface VoiceMatchResult {
  accuracy: number;           // 0-100
  isMatch: boolean;
  matchedKeywords: string[];
  missingKeywords: string[];
  confidenceScore: number;
}

// Difficulty configuration
export interface DifficultyConfig {
  matchThreshold: number;     // 0-100 required accuracy
  retryLimit: number;
  timeLimit: number | null;   // seconds or null for unlimited
  pointMultiplier: number;
}

export const DIFFICULTY_CONFIG: Record<VoiceGameDifficulty, DifficultyConfig> = {
  1: { matchThreshold: 60, retryLimit: 5, timeLimit: null, pointMultiplier: 1.0 },
  2: { matchThreshold: 70, retryLimit: 4, timeLimit: null, pointMultiplier: 1.25 },
  3: { matchThreshold: 80, retryLimit: 3, timeLimit: 30, pointMultiplier: 1.5 },
  4: { matchThreshold: 85, retryLimit: 2, timeLimit: 20, pointMultiplier: 1.75 },
  5: { matchThreshold: 90, retryLimit: 1, timeLimit: 15, pointMultiplier: 2.0 },
};

// Category display info
export const CATEGORY_INFO: Record<AffirmationCategory, { label: string; color: string; icon: string }> = {
  identity: { label: 'Identity', color: '#3b82f6', icon: 'user' },
  capability: { label: 'Capability', color: '#22c55e', icon: 'zap' },
  worthiness: { label: 'Worthiness', color: '#f59e0b', icon: 'heart' },
  transformation: { label: 'Transformation', color: '#8b5cf6', icon: 'refresh-cw' },
  gratitude: { label: 'Gratitude', color: '#ec4899', icon: 'sparkles' },
  feminine: { label: 'Feminine', color: '#f472b6', icon: 'flower' },
  submission: { label: 'Submission', color: '#6366f1', icon: 'hand' },
};

// Database row types (snake_case for Supabase)
export interface DbVoiceAffirmation {
  id: string;
  text: string;
  category: string;
  difficulty: number;
  variants: string[];
  keywords: string[];
  reward_intensity: number;
  point_value: number;
  is_active: boolean;
  created_at: string;
}

export interface DbVoiceGameSession {
  id: string;
  user_id: string;
  difficulty: number;
  categories: string[];
  started_at: string;
  completed_at: string | null;
  affirmations_attempted: number;
  affirmations_completed: number;
  current_streak: number;
  longest_streak: number;
  total_points: number;
  average_accuracy: number;
  status: string;
}

export interface DbVoiceGameAttempt {
  id: string;
  session_id: string;
  affirmation_id: string;
  spoken_text: string;
  accuracy: number;
  is_success: boolean;
  reward_sent: boolean;
  attempt_number: number;
  duration_ms: number;
  created_at: string;
}

export interface DbVoiceGameProgress {
  id: string;
  user_id: string;
  total_sessions: number;
  total_affirmations: number;
  current_streak: number;
  longest_streak: number;
  last_played_at: string | null;
  average_accuracy: number;
  favorite_category: string | null;
  highest_difficulty: number;
  total_points_earned: number;
  achievements_unlocked: string[];
  created_at: string;
  updated_at: string;
}

export interface DbVoiceGameSettings {
  id: string;
  user_id: string;
  default_difficulty: number;
  preferred_categories: string[];
  haptic_rewards_enabled: boolean;
  haptic_intensity_multiplier: number;
  voice_recognition_language: string;
  show_subtitles: boolean;
  affirmations_per_session: number;
  auto_advance_on_success: boolean;
  retry_limit: number;
  streak_protection_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Mappers from DB to domain types
export function mapDbAffirmation(db: DbVoiceAffirmation): Affirmation {
  return {
    id: db.id,
    text: db.text,
    category: db.category as AffirmationCategory,
    difficulty: db.difficulty as VoiceGameDifficulty,
    variants: db.variants || [],
    keywords: db.keywords || [],
    rewardIntensity: db.reward_intensity,
    pointValue: db.point_value,
  };
}

export function mapDbSession(db: DbVoiceGameSession): VoiceGameSession {
  return {
    id: db.id,
    userId: db.user_id,
    difficulty: db.difficulty as VoiceGameDifficulty,
    categories: db.categories as AffirmationCategory[],
    startedAt: db.started_at,
    completedAt: db.completed_at,
    affirmationsAttempted: db.affirmations_attempted,
    affirmationsCompleted: db.affirmations_completed,
    currentStreak: db.current_streak,
    longestStreak: db.longest_streak,
    totalPoints: db.total_points,
    averageAccuracy: db.average_accuracy,
    status: db.status as VoiceGameSession['status'],
  };
}

export function mapDbProgress(db: DbVoiceGameProgress): VoiceGameProgress {
  return {
    id: db.id,
    userId: db.user_id,
    totalSessions: db.total_sessions,
    totalAffirmations: db.total_affirmations,
    currentStreak: db.current_streak,
    longestStreak: db.longest_streak,
    lastPlayedAt: db.last_played_at,
    averageAccuracy: db.average_accuracy,
    favoriteCategory: db.favorite_category as AffirmationCategory | null,
    highestDifficulty: db.highest_difficulty as VoiceGameDifficulty,
    totalPointsEarned: db.total_points_earned,
    achievementsUnlocked: db.achievements_unlocked || [],
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function mapDbSettings(db: DbVoiceGameSettings): VoiceGameSettings {
  return {
    id: db.id,
    userId: db.user_id,
    defaultDifficulty: db.default_difficulty as VoiceGameDifficulty,
    preferredCategories: db.preferred_categories as AffirmationCategory[],
    hapticRewardsEnabled: db.haptic_rewards_enabled,
    hapticIntensityMultiplier: db.haptic_intensity_multiplier,
    voiceRecognitionLanguage: db.voice_recognition_language,
    showSubtitles: db.show_subtitles,
    affirmationsPerSession: db.affirmations_per_session,
    autoAdvanceOnSuccess: db.auto_advance_on_success,
    retryLimit: db.retry_limit,
    streakProtectionEnabled: db.streak_protection_enabled,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}
