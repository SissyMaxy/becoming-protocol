// Profile Types
// Types for the 5-layer intake profile system

// ============================================
// PROFILE FOUNDATION (Layer 1)
// ============================================

export interface ProfileFoundation {
  id: string;
  userId: string;
  chosenName: string;
  pronouns: string;
  age?: number;
  location?: string;
  livingSituation?: string;
  workSituation?: string;
  privateHoursDaily?: number;
  monthlyBudget?: number;
  partnerStatus?: string;
  partnerAwarenessLevel: number;
  partnerReaction?: string;
  createdAt: string;
  updatedAt: string;
  // Extended fields for intake UI
  feminineName?: string;
  birthYear?: number;
  relationshipStatus?: string;
  partnerName?: string;
  partnerAwareness?: string;
  livingArrangement?: string;
  privacyLevel?: string;
  primaryGoal?: string;
  discoverySource?: string;
}

export interface DbProfileFoundation {
  id: string;
  user_id: string;
  chosen_name: string;
  pronouns: string;
  age: number | null;
  location: string | null;
  living_situation: string | null;
  work_situation: string | null;
  private_hours_daily: number | null;
  monthly_budget: number | null;
  partner_status: string | null;
  partner_awareness_level: number;
  partner_reaction: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// PROFILE HISTORY (Layer 2)
// ============================================

export interface ProfileHistory {
  id: string;
  userId: string;
  firstAwarenessAge?: string;
  firstAwarenessTrigger?: string;
  childhoodSignals?: string;
  interpretationAtTime?: string;
  firstCrossdressingAge?: string;
  firstCrossdressingExperience?: string;
  clothingEvolution?: string;
  itemsOwned: string[];
  previousAttempts: boolean | string;
  previousAttemptDetails?: string;
  whatStoppedBefore?: string;
  whatNeedsToChange?: string;
  dysphoriaFrequency?: string;
  dysphoriaTriggers: string[];
  euphoriaTriggers?: string;
  peakEuphoriaMoment?: string;
  createdAt: string;
  // Extended fields for intake UI
  journeyStartDate?: string;
  firstFeminineMemory?: string;
  keyMilestones?: string[];
  longestStreak?: number;
  whatBrokeStreaks?: string;
  currentFeminineLevel?: number;
  desiredFeminineLevel?: number;
  biggestAchievement?: string;
}

export interface DbProfileHistory {
  id: string;
  user_id: string;
  first_awareness_age: string | null;
  first_awareness_trigger: string | null;
  childhood_signals: string | null;
  interpretation_at_time: string | null;
  first_crossdressing_age: string | null;
  first_crossdressing_experience: string | null;
  clothing_evolution: string | null;
  items_owned: string[] | null;
  previous_attempts: boolean;
  previous_attempt_details: string | null;
  what_stopped_before: string | null;
  what_needs_to_change: string | null;
  dysphoria_frequency: string | null;
  dysphoria_triggers: string[] | null;
  euphoria_triggers: string | null;
  peak_euphoria_moment: string | null;
  created_at: string;
}

// ============================================
// PROFILE AROUSAL (Layer 3)
// ============================================

export interface FantasyThemes {
  feminization?: number;
  submission?: number;
  service?: number;
  humiliation?: number;
  objectification?: number;
  exhibitionism?: number;
  [key: string]: number | undefined;
}

export interface ProfileArousal {
  id: string;
  userId: string;
  feminizationArousalLevel?: number;
  arousalAspectsRanked: string[];
  eroticCoreOrSideEffect?: string;
  arousalPatternEvolution?: string;
  fantasyThemes: FantasyThemes;
  hypnoUsageLevel?: string;
  hypnoContentPreferences?: string;
  tranceDepth?: string;
  conditionedResponses?: string;
  hardestHittingContent?: string;
  chastityHistory?: string;
  longestDenialDays?: number;
  denialEffectOnMotivation?: string;
  edgeFrequency?: string;
  postOrgasmResponse?: string;
  shameIntensifiesArousal?: string;
  shamefulButArousing?: string;
  shameFunction?: string;
  eroticizedTransformation?: string;
  createdAt: string;
  // Extended fields for intake UI
  primaryTriggers?: string[];
  triggerIntensity?: Record<string, number>;
  fantasies?: string;
  edgingExperience?: string;
  denialDays?: number;
  chastityExperience?: string;
  hypnoResponse?: string;
  preferredContent?: string[];
  peakArousalTime?: string;
  arousalToActionLink?: string;
}

export interface DbProfileArousal {
  id: string;
  user_id: string;
  feminization_arousal_level: number | null;
  arousal_aspects_ranked: string[] | null;
  erotic_core_or_side_effect: string | null;
  arousal_pattern_evolution: string | null;
  fantasy_themes: Record<string, number> | null;
  hypno_usage_level: string | null;
  hypno_content_preferences: string | null;
  trance_depth: string | null;
  conditioned_responses: string | null;
  hardest_hitting_content: string | null;
  chastity_history: string | null;
  longest_denial_days: number | null;
  denial_effect_on_motivation: string | null;
  edge_frequency: string | null;
  post_orgasm_response: string | null;
  shame_intensifies_arousal: string | null;
  shameful_but_arousing: string | null;
  shame_function: string | null;
  eroticized_transformation: string | null;
  created_at: string;
}

// ============================================
// PROFILE PSYCHOLOGY (Layer 4)
// ============================================

export interface ProfilePsychology {
  id: string;
  userId: string;
  shameAspects?: string;
  shameSources: string[];
  shameFunctionPreference?: string;
  withoutShameHypothesis?: string;
  resistanceTriggers?: string | string[];
  resistanceSensation?: string;
  stopVoiceTriggers?: string;
  resistanceOvercomeMethods?: string;
  resistanceTimingPatterns?: string;
  authorityResponse?: string;
  complianceMotivators?: string;
  preferredVoiceFraming?: string;
  askedVsToldPreference?: number;
  pushedPastComfortResponse?: string;
  vulnerabilityMoments?: string;
  guardDropTriggers?: string;
  surrenderMomentDescription?: string;
  powerWordsPhrases?: string;
  resistanceImpossibleConditions?: string;
  validationImportance?: number;
  validationTypePreference?: string;
  praiseResponse?: string;
  criticismResponse?: string;
  createdAt: string;
  // Extended fields for intake UI
  vulnerabilities?: string[];
  whatMakesYouSubmit?: string[];
  shameResponse?: string;
  postOrgasmFeelings?: string;
  fearOfExposure?: number;
  needForValidation?: number;
  obedienceLevel?: number;
  internalConflict?: string;
  whatBreaksResistance?: string;
}

export interface DbProfilePsychology {
  id: string;
  user_id: string;
  shame_aspects: string | null;
  shame_sources: string[] | null;
  shame_function_preference: string | null;
  without_shame_hypothesis: string | null;
  resistance_triggers: string | null;
  resistance_sensation: string | null;
  stop_voice_triggers: string | null;
  resistance_overcome_methods: string | null;
  resistance_timing_patterns: string | null;
  authority_response: string | null;
  compliance_motivators: string | null;
  preferred_voice_framing: string | null;
  asked_vs_told_preference: number | null;
  pushed_past_comfort_response: string | null;
  vulnerability_moments: string | null;
  guard_drop_triggers: string | null;
  surrender_moment_description: string | null;
  power_words_phrases: string | null;
  resistance_impossible_conditions: string | null;
  validation_importance: number | null;
  validation_type_preference: string | null;
  praise_response: string | null;
  criticism_response: string | null;
  created_at: string;
}

// ============================================
// PROFILE DEPTH (Layer 5)
// ============================================

export interface ProfileDepth {
  id: string;
  userId: string;
  darkestFantasy?: string;
  whyNeverTold?: string;
  writingItFeels?: string;
  wantButFearWanting?: string;
  fullAdmissionConsequence?: string;
  fearOfGettingWanted?: string;
  completeTransformationVision?: string;
  dailyLifeVision?: string;
  othersPerceptionVision?: string;
  internalFeelingVision?: string;
  completeSurrenderVision?: string;
  whatToLetGo?: string;
  surrenderGains?: string;
  takeoverDesire?: string;
  transformationFears?: string;
  worstCaseScenario?: string;
  cantStopMeaning?: string;
  fearAsBarrierOrAppeal?: string;
  secretSelfDescription?: string;
  secretSelfVisibleConsequence?: string;
  hidingPleasureOrNecessity?: string;
  createdAt: string;
  // Extended fields for intake UI
  deepestFantasy?: string;
  ultimateDestination?: string[];
  secretDesires?: string;
  whatScares?: string;
  hardLimits?: string[];
  softLimits?: string[];
  willingToExplore?: string;
  pointOfNoReturn?: string;
  ifNoConsequences?: string;
  consentToEscalation?: boolean;
}

export interface DbProfileDepth {
  id: string;
  user_id: string;
  darkest_fantasy: string | null;
  why_never_told: string | null;
  writing_it_feels: string | null;
  want_but_fear_wanting: string | null;
  full_admission_consequence: string | null;
  fear_of_getting_wanted: string | null;
  complete_transformation_vision: string | null;
  daily_life_vision: string | null;
  others_perception_vision: string | null;
  internal_feeling_vision: string | null;
  complete_surrender_vision: string | null;
  what_to_let_go: string | null;
  surrender_gains: string | null;
  takeover_desire: string | null;
  transformation_fears: string | null;
  worst_case_scenario: string | null;
  cant_stop_meaning: string | null;
  fear_as_barrier_or_appeal: string | null;
  secret_self_description: string | null;
  secret_self_visible_consequence: string | null;
  hiding_pleasure_or_necessity: string | null;
  created_at: string;
}

// ============================================
// INTAKE LAYER TYPE
// ============================================

export type IntakeLayer = 'foundation' | 'history' | 'arousal' | 'psychology' | 'depth';

export const INTAKE_LAYERS: IntakeLayer[] = ['foundation', 'history', 'arousal', 'psychology', 'depth'];

export const LAYER_NUMBERS: Record<IntakeLayer, number> = {
  foundation: 1,
  history: 2,
  arousal: 3,
  psychology: 4,
  depth: 5,
};

// ============================================
// INTAKE PROGRESS
// ============================================

export interface IntakeProgress {
  id: string;
  userId: string;
  layerCompleted: number;
  questionsAnswered: number;
  disclosureScore: number;
  startedAt: string;
  lastUpdated: string;
  completedLayers?: IntakeLayer[];
}

export interface DbIntakeProgress {
  id: string;
  user_id: string;
  layer_completed: number;
  questions_answered: number;
  disclosure_score: number;
  started_at: string;
  last_updated: string;
}

// ============================================
// COMPLETE PROFILE
// ============================================

export interface FullProfile {
  foundation?: ProfileFoundation;
  history?: ProfileHistory;
  arousal?: ProfileArousal;
  psychology?: ProfilePsychology;
  depth?: ProfileDepth;
  intakeProgress?: IntakeProgress;
}

// ============================================
// MAPPERS
// ============================================

export function mapDbToProfileFoundation(db: DbProfileFoundation): ProfileFoundation {
  return {
    id: db.id,
    userId: db.user_id,
    chosenName: db.chosen_name,
    pronouns: db.pronouns,
    age: db.age || undefined,
    location: db.location || undefined,
    livingSituation: db.living_situation || undefined,
    workSituation: db.work_situation || undefined,
    privateHoursDaily: db.private_hours_daily || undefined,
    monthlyBudget: db.monthly_budget || undefined,
    partnerStatus: db.partner_status || undefined,
    partnerAwarenessLevel: db.partner_awareness_level,
    partnerReaction: db.partner_reaction || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function mapDbToIntakeProgress(db: DbIntakeProgress): IntakeProgress {
  return {
    id: db.id,
    userId: db.user_id,
    layerCompleted: db.layer_completed,
    questionsAnswered: db.questions_answered,
    disclosureScore: db.disclosure_score,
    startedAt: db.started_at,
    lastUpdated: db.last_updated,
  };
}
