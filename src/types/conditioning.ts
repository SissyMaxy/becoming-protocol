/**
 * Conditioning Engine Types
 * Tables: content_curriculum, generated_scripts, conditioning_sessions_v2,
 *         trance_progression, post_hypnotic_tracking, scent_conditioning, hidden_operations
 */

// ============================================
// UNION / ENUM TYPES
// ============================================

export type CurriculumMediaType =
  | 'audio'
  | 'video'
  | 'audio_video'
  | 'text'
  | 'custom_handler';

export type CurriculumCategory =
  | 'identity'
  | 'feminization'
  | 'surrender'
  | 'chastity'
  | 'desire_installation'
  | 'dumbification'
  | 'compliance'
  | 'trigger_installation'
  | 'amnesia'
  | 'resistance_reduction'
  | 'sleep_induction'
  | 'morning_ritual'
  | 'ambient'
  | 'trance_deepening'
  | 'shame_inversion'
  | 'arousal_binding';

export type ConditioningSessionType =
  | 'trance'
  | 'goon'
  | 'edge'
  | 'combined'
  | 'sleep'
  | 'background'
  | 'morning'
  | 'micro_drop';

export type AssociationStrength =
  | 'none'
  | 'weak'
  | 'forming'
  | 'established'
  | 'strong';

// ============================================
// DB ROW TYPES (snake_case — match Supabase)
// ============================================

export interface DbContentCurriculum {
  id: string;
  user_id: string;
  title: string;
  creator: string | null;
  series: string | null;
  media_type: CurriculumMediaType;
  source_url: string | null;
  audio_storage_url: string | null;
  category: CurriculumCategory;
  intensity: number;
  tier: number;
  fantasy_level: number | null;
  duration_minutes: number | null;
  best_denial_range: number[] | null;
  best_time: string[] | null;
  session_contexts: string[];
  binaural_frequency: string | null;
  binaural_mixed: boolean;
  trigger_phrases: string[] | null;
  times_prescribed: number;
  times_completed: number;
  avg_trance_depth: number | null;
  avg_arousal_during: number | null;
  effectiveness_score: number | null;
  generation_prompt: string | null;
  script_text: string | null;
  memories_used: string[] | null;
  conditioning_phase: number | null;
  conditioning_target: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbGeneratedScript {
  id: string;
  user_id: string;
  script_text: string;
  conditioning_phase: number;
  conditioning_target: string;
  memories_used: Record<string, unknown> | null;
  generation_prompt: string | null;
  audio_url: string | null;
  audio_duration_seconds: number | null;
  voice_id: string | null;
  binaural_frequency: string | null;
  binaural_mixed: boolean;
  scent_anchor: string | null;
  post_hypnotic_scripts: PostHypnoticScript[] | null;
  subliminal_words: string[] | null;
  curriculum_id: string | null;
  created_at: string;
}

export interface DbConditioningSessionV2 {
  id: string;
  user_id: string;
  session_type: ConditioningSessionType;
  content_ids: string[] | null;
  content_sequence: ContentSequenceEntry[] | null;
  avg_hr: number | null;
  min_hr: number | null;
  max_hr: number | null;
  avg_hrv: number | null;
  trance_depth_estimated: number | null;
  arousal_level_estimated: number | null;
  phases: SessionPhase[] | null;
  scent_anchor_active: boolean;
  scent_type: string | null;
  device_active: boolean;
  device_patterns: DevicePattern[] | null;
  post_hypnotic_scripts: PostHypnoticScript[] | null;
  duration_minutes: number | null;
  completed: boolean;
  confession_extracted: boolean;
  commitment_extracted: boolean;
  adaptations: SessionAdaptation[] | null;
  started_at: string;
  ended_at: string | null;
}

export interface DbTranceProgression {
  id: string;
  user_id: string;
  session_id: string | null;
  induction_time_seconds: number | null;
  peak_depth: number | null;
  sustained_depth_minutes: number | null;
  trigger_tests: TriggerTest[] | null;
  recorded_at: string;
}

export interface DbPostHypnoticTracking {
  id: string;
  user_id: string;
  script_id: string | null;
  session_id: string | null;
  context: string;
  suggestion: string;
  activation_time: string | null;
  delivered_at: string | null;
  activation_expected_at: string | null;
  activation_detected: boolean | null;
  detection_method: string | null;
  created_at: string;
}

export interface DbScentConditioning {
  id: string;
  user_id: string;
  scent_name: string;
  scent_product: string | null;
  sessions_paired: number;
  association_strength: AssociationStrength;
  covert_deployments: number;
  last_covert_deployment: string | null;
  covert_effectiveness_notes: string | null;
  updated_at: string;
}

export interface DbHiddenOperation {
  id: string;
  user_id: string;
  parameter: string;
  current_value: number;
  base_value: number;
  increment_rate: number | null;
  increment_interval: string | null;
  last_incremented_at: string | null;
}

// ============================================
// JSONB SUB-TYPES
// ============================================

export interface PostHypnoticScript {
  suggestion: string;
  context: string;
  activationTime?: string;
  reinforcementCount?: number;
}

export interface ContentSequenceEntry {
  contentId: string;
  order: number;
  startedAt?: string;
  completedAt?: string;
  tranceDepthAtStart?: number;
  tranceDepthAtEnd?: number;
}

export interface SessionPhase {
  name: string;
  startMinute: number;
  endMinute: number;
  targetDepth?: number;
  actualDepth?: number;
  notes?: string;
}

export interface DevicePattern {
  pattern: string;
  intensity: number;
  durationSeconds: number;
  trigger?: string;
}

export interface SessionAdaptation {
  timestamp: string;
  reason: string;
  action: string;
  effect?: string;
}

export interface TriggerTest {
  trigger: string;
  delivered: boolean;
  responseObserved: boolean;
  responseStrength?: number;
  notes?: string;
}

// ============================================
// APP TYPES (camelCase)
// ============================================

export interface ContentCurriculumItem {
  id: string;
  userId: string;
  title: string;
  creator: string | null;
  series: string | null;
  mediaType: CurriculumMediaType;
  sourceUrl: string | null;
  audioStorageUrl: string | null;
  category: CurriculumCategory;
  intensity: number;
  tier: number;
  fantasyLevel: number | null;
  durationMinutes: number | null;
  bestDenialRange: number[] | null;
  bestTime: string[] | null;
  sessionContexts: string[];
  binauralFrequency: string | null;
  binauralMixed: boolean;
  triggerPhrases: string[] | null;
  timesPrescribed: number;
  timesCompleted: number;
  avgTranceDepth: number | null;
  avgArousalDuring: number | null;
  effectivenessScore: number | null;
  generationPrompt: string | null;
  scriptText: string | null;
  memoriesUsed: string[] | null;
  conditioningPhase: number | null;
  conditioningTarget: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedScript {
  id: string;
  userId: string;
  scriptText: string;
  conditioningPhase: number;
  conditioningTarget: string;
  memoriesUsed: Record<string, unknown> | null;
  generationPrompt: string | null;
  audioUrl: string | null;
  audioDurationSeconds: number | null;
  voiceId: string | null;
  binauralFrequency: string | null;
  binauralMixed: boolean;
  scentAnchor: string | null;
  postHypnoticScripts: PostHypnoticScript[] | null;
  subliminalWords: string[] | null;
  curriculumId: string | null;
  createdAt: string;
}

export interface ConditioningSessionV2 {
  id: string;
  userId: string;
  sessionType: ConditioningSessionType;
  contentIds: string[] | null;
  contentSequence: ContentSequenceEntry[] | null;
  avgHr: number | null;
  minHr: number | null;
  maxHr: number | null;
  avgHrv: number | null;
  tranceDepthEstimated: number | null;
  arousalLevelEstimated: number | null;
  phases: SessionPhase[] | null;
  scentAnchorActive: boolean;
  scentType: string | null;
  deviceActive: boolean;
  devicePatterns: DevicePattern[] | null;
  postHypnoticScripts: PostHypnoticScript[] | null;
  durationMinutes: number | null;
  completed: boolean;
  confessionExtracted: boolean;
  commitmentExtracted: boolean;
  adaptations: SessionAdaptation[] | null;
  startedAt: string;
  endedAt: string | null;
}

export interface TranceProgressionEntry {
  id: string;
  userId: string;
  sessionId: string | null;
  inductionTimeSeconds: number | null;
  peakDepth: number | null;
  sustainedDepthMinutes: number | null;
  triggerTests: TriggerTest[] | null;
  recordedAt: string;
}

export interface PostHypnoticEntry {
  id: string;
  userId: string;
  scriptId: string | null;
  sessionId: string | null;
  context: string;
  suggestion: string;
  activationTime: string | null;
  deliveredAt: string | null;
  activationExpectedAt: string | null;
  activationDetected: boolean | null;
  detectionMethod: string | null;
  createdAt: string;
}

export interface ScentConditioningEntry {
  id: string;
  userId: string;
  scentName: string;
  scentProduct: string | null;
  sessionsPaired: number;
  associationStrength: AssociationStrength;
  covertDeployments: number;
  lastCovertDeployment: string | null;
  covertEffectivenessNotes: string | null;
  updatedAt: string;
}

export interface HiddenOperation {
  id: string;
  userId: string;
  parameter: string;
  currentValue: number;
  baseValue: number;
  incrementRate: number | null;
  incrementInterval: string | null;
  lastIncrementedAt: string | null;
}

// ============================================
// PRESCRIPTION & QUERY TYPES
// ============================================

export interface SessionPrescription {
  sessionType: ConditioningSessionType;
  playlist: ContentCurriculumItem[];
  devicePattern: DevicePattern | null;
  duration: number;
  scentAnchor: string | null;
  postHypnoticEnabled: boolean;
}

export interface ContentCriteria {
  category?: CurriculumCategory | CurriculumCategory[];
  mediaType?: CurriculumMediaType | CurriculumMediaType[];
  minIntensity?: number;
  maxIntensity?: number;
  tier?: number | number[];
  maxFantasyLevel?: number;
  maxDurationMinutes?: number;
  sessionContext?: string;
  hasBinaural?: boolean;
  minEffectiveness?: number;
  conditioningPhase?: number;
  conditioningTarget?: string;
}

// ============================================
// HANDLER CONTEXT INTEGRATION
// ============================================

export interface ConditioningContext {
  currentPhase: number;
  totalSessions: number;
  recentSessions: ConditioningSessionV2[];
  avgTranceDepth: number;
  avgInductionTime: number;
  peakDepthAchieved: number;
  activePostHypnotics: PostHypnoticEntry[];
  scentAnchors: ScentConditioningEntry[];
  hiddenOps: HiddenOperation[];
  curriculumStats: {
    totalItems: number;
    completedItems: number;
    avgEffectiveness: number;
    topCategories: { category: CurriculumCategory; count: number; avgScore: number }[];
  };
  tranceProgression: {
    inductionTrend: 'improving' | 'stable' | 'regressing';
    depthTrend: 'deepening' | 'stable' | 'shallowing';
    lastFiveSessions: TranceProgressionEntry[];
  };
}
