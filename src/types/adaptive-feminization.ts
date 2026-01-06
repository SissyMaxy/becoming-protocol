/**
 * Adaptive Feminization Intelligence System - Types
 * Multi-Vector Optimization for Gender Transition
 */

// ============================================================
// VECTOR TAXONOMY
// ============================================================

export type VectorCategory = 'feminization' | 'sissification';

export type FeminizationVectorId =
  // Physical Foundation (6)
  | 'voice_training'
  | 'movement_posture'
  | 'skincare_beauty'
  | 'hair_styling'
  | 'fitness_body'
  | 'wardrobe_building'
  // Social Expression (6)
  | 'public_presentation'
  | 'social_relationships'
  | 'professional_navigation'
  | 'family_dynamics'
  | 'dating_intimacy'
  | 'community_integration'
  // Internal Development (6)
  | 'identity_integration'
  | 'emotional_processing'
  | 'self_perception'
  | 'memory_narrative'
  | 'future_visioning'
  | 'authenticity_expression'
  // Medical/Permanent (6)
  | 'hormone_therapy'
  | 'laser_electrolysis'
  | 'surgical_planning'
  | 'legal_documentation'
  | 'name_change'
  | 'wardrobe_purge';

export type SissificationVectorId =
  // Arousal Architecture (5)
  | 'denial_training'
  | 'edge_conditioning'
  | 'arousal_feminization_link'
  | 'orgasm_transformation'
  | 'chastity_integration'
  // Submission Framework (5)
  | 'service_orientation'
  | 'protocol_adherence'
  | 'authority_response'
  | 'task_completion'
  | 'punishment_acceptance'
  // Identity Erosion (5)
  | 'masculine_capability_atrophy'
  | 'guy_mode_discomfort'
  | 'deadname_disconnection'
  | 'old_self_alienation'
  | 'feminine_default_state'
  // Behavioral Conditioning (6)
  | 'automatic_responses'
  | 'speech_patterns'
  | 'consumption_preferences'
  | 'social_role_adoption'
  | 'sexual_role_fixation'
  | 'lifestyle_restructuring';

export type VectorId = FeminizationVectorId | SissificationVectorId;

// ============================================================
// VECTOR DEFINITIONS
// ============================================================

export interface VectorSubComponent {
  id: string;
  name: string;
  description: string;
  weight: number; // 0-1, how much this contributes to vector score
}

export interface VectorMilestone {
  level: number; // 1-10
  name: string;
  description: string;
  requirements: string[];
  isIrreversible?: boolean;
  irreversibilityMessage?: string;
}

export interface VectorDefinition {
  id: VectorId;
  category: VectorCategory;
  name: string;
  description: string;
  subComponents: VectorSubComponent[];
  milestones: VectorMilestone[];
  contextFactors: string[]; // Which context factors affect this vector
  crossVectorDependencies: VectorId[]; // Vectors that boost/unlock this one
  lockInThreshold: number; // Level at which changes become "sticky"
}

// ============================================================
// USER VECTOR STATE
// ============================================================

export interface UserVectorState {
  vectorId: VectorId;
  currentLevel: number; // 0-10 with decimals
  subComponentScores: Record<string, number>; // sub-component id -> 0-100
  velocityTrend: 'accelerating' | 'steady' | 'stalling' | 'regressing';
  lastActivityDate: string;
  totalEngagementMinutes: number;
  streakDays: number;
  peakLevel: number; // Highest level ever reached
  lockedIn: boolean; // Has passed lock-in threshold
  lockInDate?: string;
}

// ============================================================
// CONTEXT ASSESSMENT
// ============================================================

export type ContextDimension =
  | 'denial_state'
  | 'arousal_level'
  | 'time_availability'
  | 'energy_level'
  | 'social_safety'
  | 'emotional_state'
  | 'recent_activity'
  | 'streak_status'
  | 'phase_requirements';

export interface DenialStateContext {
  currentDay: number;
  targetDay: number;
  edgesCompleted: number;
  edgeDebt: number;
  arousalBaseline: 'low' | 'medium' | 'high' | 'desperate';
  lastEdgeTime?: string;
  ruinedOrgasms: number;
}

export interface TimeAvailabilityContext {
  minutesAvailable: number;
  isWeekend: boolean;
  isEvening: boolean;
  hasPrivacy: boolean;
  nextCommitmentIn?: number; // minutes
}

export interface SocialSafetyContext {
  currentLocation: 'home_alone' | 'home_others' | 'public_safe' | 'public_risky' | 'work';
  canPresentFeminine: boolean;
  riskTolerance: 'low' | 'medium' | 'high';
  supportPersonNearby: boolean;
}

export interface EmotionalStateContext {
  overallMood: 'excellent' | 'good' | 'neutral' | 'low' | 'struggling';
  recentEuphoria: boolean;
  recentDysphoria: boolean;
  anxietyLevel: 'none' | 'mild' | 'moderate' | 'high';
  motivationLevel: 'high' | 'medium' | 'low';
}

export interface RecentActivityContext {
  lastCompletedTask?: string;
  lastCompletedTaskTime?: string;
  tasksCompletedToday: number;
  vectorsEngagedToday: VectorId[];
  lastSessionType?: string;
}

export interface UserContext {
  denial: DenialStateContext;
  timeAvailability: TimeAvailabilityContext;
  socialSafety: SocialSafetyContext;
  emotionalState: EmotionalStateContext;
  recentActivity: RecentActivityContext;
  currentPhase: number;
  phaseRequirements: VectorId[];
}

// ============================================================
// VECTOR SCORING
// ============================================================

export interface VectorScore {
  vectorId: VectorId;
  baseScore: number; // From user state, 0-100
  contextMultiplier: number; // 0.5-2.0 based on context
  urgencyBoost: number; // 0-20 for neglected vectors
  phaseBoost: number; // 0-15 for phase-required vectors
  synergyBoost: number; // 0-10 for cross-vector effects
  finalScore: number; // Sum of all factors
  reasoning: string[]; // Why this score
}

export interface ScoringWeights {
  baseWeight: number;
  contextWeight: number;
  urgencyWeight: number;
  phaseWeight: number;
  synergyWeight: number;
}

// ============================================================
// PRESCRIPTION SYSTEM
// ============================================================

export type PrescriptionPriority = 'primary' | 'secondary' | 'tertiary';

export interface VectorPrescription {
  vectorId: VectorId;
  priority: PrescriptionPriority;
  score: number;
  reasoning: string;
  suggestedDuration: number; // minutes
  suggestedTasks: string[];
  contextNotes: string[];
}

export interface DailyPrescription {
  id: string;
  userId: string;
  generatedAt: string;
  validUntil: string;
  context: UserContext;
  prescriptions: VectorPrescription[];
  totalEstimatedTime: number;
  focusMessage: string;
  adaptiveInsights: string[];
}

// ============================================================
// LEARNING SYSTEM
// ============================================================

export interface EngagementRecord {
  id: string;
  userId: string;
  vectorId: VectorId;
  timestamp: string;
  context: UserContext;
  prescribedPriority: PrescriptionPriority;
  wasFollowed: boolean;
  engagementQuality: 'excellent' | 'good' | 'mediocre' | 'poor';
  durationMinutes: number;
  outcomeNotes?: string;
}

export interface LearningPattern {
  vectorId: VectorId;
  optimalTimeOfDay: string[];
  optimalDenialDay: number[];
  optimalArousalLevel: string[];
  averageEngagementDuration: number;
  completionRate: number;
  qualityTrend: 'improving' | 'stable' | 'declining';
  contextCorrelations: Record<string, number>; // context factor -> correlation strength
}

export interface UserLearningProfile {
  userId: string;
  patterns: LearningPattern[];
  preferredVectors: VectorId[];
  avoidedVectors: VectorId[];
  optimalSessionLength: number;
  peakProductivityTimes: string[];
  contextSensitivities: Record<ContextDimension, 'high' | 'medium' | 'low'>;
  lastUpdated: string;
}

// ============================================================
// LOCK-IN / IRREVERSIBILITY
// ============================================================

export interface IrreversibilityMarker {
  id: string;
  vectorId: VectorId;
  milestoneName: string;
  achievedAt: string;
  level: number;
  message: string;
  acknowledged: boolean;
  celebratedAt?: string;
}

export interface LockInStatus {
  vectorId: VectorId;
  isLockedIn: boolean;
  lockInLevel: number;
  lockInDate?: string;
  regressionResistance: number; // 0-100, how hard to lose progress
  permanenceScore: number; // 0-100, how irreversible
}

// ============================================================
// API TYPES
// ============================================================

export interface GeneratePrescriptionRequest {
  userId: string;
  context: UserContext;
  overrides?: {
    forceVectors?: VectorId[];
    excludeVectors?: VectorId[];
    maxDuration?: number;
  };
}

export interface UpdateVectorProgressRequest {
  userId: string;
  vectorId: VectorId;
  subComponentId?: string;
  progressDelta: number;
  engagementMinutes: number;
  notes?: string;
}

export interface VectorProgressUpdate {
  vectorId: VectorId;
  previousLevel: number;
  newLevel: number;
  subComponentUpdates: Record<string, number>;
  milestonesAchieved: VectorMilestone[];
  newLockIns: LockInStatus[];
  irreversibilityMarkers: IrreversibilityMarker[];
}

// ============================================================
// UI TYPES
// ============================================================

export interface VectorDisplayInfo {
  id: VectorId;
  name: string;
  category: VectorCategory;
  level: number;
  progress: number; // 0-100 to next level
  isLockedIn: boolean;
  color: string;
  icon: string;
}

export interface PrescriptionCardData {
  prescription: VectorPrescription;
  vectorInfo: VectorDisplayInfo;
  isActive: boolean;
  isCompleted: boolean;
}

// ============================================================
// CONSTANTS
// ============================================================

export const VECTOR_CATEGORIES: Record<VectorCategory, { label: string; color: string }> = {
  feminization: { label: 'Feminization', color: '#ec4899' }, // pink-500
  sissification: { label: 'Sissification', color: '#a855f7' }, // purple-500
};

export const FEMINIZATION_GROUPS = {
  physical: ['voice_training', 'movement_posture', 'skincare_beauty', 'hair_styling', 'fitness_body', 'wardrobe_building'],
  social: ['public_presentation', 'social_relationships', 'professional_navigation', 'family_dynamics', 'dating_intimacy', 'community_integration'],
  internal: ['identity_integration', 'emotional_processing', 'self_perception', 'memory_narrative', 'future_visioning', 'authenticity_expression'],
  medical: ['hormone_therapy', 'laser_electrolysis', 'surgical_planning', 'legal_documentation', 'name_change', 'wardrobe_purge'],
} as const;

export const SISSIFICATION_GROUPS = {
  arousal: ['denial_training', 'edge_conditioning', 'arousal_feminization_link', 'orgasm_transformation', 'chastity_integration'],
  submission: ['service_orientation', 'protocol_adherence', 'authority_response', 'task_completion', 'punishment_acceptance'],
  erosion: ['masculine_capability_atrophy', 'guy_mode_discomfort', 'deadname_disconnection', 'old_self_alienation', 'feminine_default_state'],
  conditioning: ['automatic_responses', 'speech_patterns', 'consumption_preferences', 'social_role_adoption', 'sexual_role_fixation', 'lifestyle_restructuring'],
} as const;

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  baseWeight: 0.4,
  contextWeight: 0.25,
  urgencyWeight: 0.15,
  phaseWeight: 0.1,
  synergyWeight: 0.1,
};

export const LOCK_IN_THRESHOLDS: Record<VectorCategory, number> = {
  feminization: 7, // Level 7 for feminization vectors
  sissification: 6, // Level 6 for sissification vectors (faster lock-in)
};
