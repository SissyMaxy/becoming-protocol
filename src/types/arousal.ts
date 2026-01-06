// Arousal State Management & Intimate Exploration Types

// ============================================
// STATE TYPES
// ============================================

export type ArousalState =
  | 'baseline'
  | 'building'
  | 'sweet_spot'
  | 'overload'
  | 'post_release'
  | 'recovery';

export type PhysicalSign =
  | 'leaking'
  | 'aching'
  | 'sensitive'
  | 'throbbing'
  | 'desperate'
  | 'calm'
  | 'numb';

export interface ArousalStateEntry {
  id: string;
  userId: string;
  date: string;
  state: ArousalState;
  arousalLevel: number;
  feminizationReceptivity: number;
  achingIntensity: number;
  edgeCount: number;
  physicalSigns: PhysicalSign[];
  notes?: string;
  loggedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbArousalStateEntry {
  id: string;
  user_id: string;
  date: string;
  state: string;
  arousal_level: number;
  feminization_receptivity: number;
  aching_intensity: number;
  edge_count: number;
  physical_signs: string[];
  notes: string | null;
  logged_at: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// ORGASM TYPES
// ============================================

export type ReleaseType =
  | 'full'
  | 'ruined'
  | 'prostate'
  | 'sissygasm'
  | 'edge_only'
  | 'wet_dream'
  | 'accident';

export type ReleaseContext =
  | 'solo'
  | 'with_partner'
  | 'during_content'
  | 'during_practice'
  | 'sleep';

export interface OrgasmEntry {
  id: string;
  userId: string;
  occurredAt: string;
  releaseType: ReleaseType;
  context: ReleaseContext;
  planned: boolean;
  stateBefore?: ArousalState;
  daysSinceLast?: number;
  intensity?: number;
  satisfaction?: number;
  regretLevel?: number;
  trigger?: string;
  notes?: string;
  partnerInitiated: boolean;
  partnerControlled: boolean;
  partnerAware: boolean;
  createdAt: string;
}

export interface DbOrgasmEntry {
  id: string;
  user_id: string;
  occurred_at: string;
  release_type: string;
  context: string;
  planned: boolean;
  state_before: string | null;
  days_since_last: number | null;
  intensity: number | null;
  satisfaction: number | null;
  regret_level: number | null;
  trigger: string | null;
  notes: string | null;
  partner_initiated: boolean;
  partner_controlled: boolean;
  partner_aware: boolean;
  created_at: string;
}

// ============================================
// STREAK TYPES
// ============================================

export type StreakEndReason =
  | 'full_release'
  | 'ruined'
  | 'accident'
  | 'wet_dream'
  | 'planned_release'
  | 'ongoing';

export interface DenialStreak {
  id: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  endedBy?: StreakEndReason;
  endingOrgasmId?: string;
  daysCompleted?: number;
  edgesDuring: number;
  prostateOrgasmsDuring: number;
  sweetSpotDays: number;
  isPersonalRecord: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbDenialStreak {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  ended_by: string | null;
  ending_orgasm_id: string | null;
  days_completed: number | null;
  edges_during: number;
  prostate_orgasms_during: number;
  sweet_spot_days: number;
  is_personal_record: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// METRICS TYPES
// ============================================

export interface ArousalMetrics {
  userId: string;
  currentStreakDays: number;
  currentState: ArousalState;
  daysInCurrentState: number;
  averageCycleLength: number;
  averageSweetSpotEntryDay: number;
  averageOverloadDay: number;
  sweetSpotPercentage: number;
  postReleasePercentage: number;
  optimalMinDays: number;
  optimalMaxDays: number;
  slipRate: number;
  averageDaysToSlip: number;
  highRiskContexts: string[];
  longestStreak: number;
  longestSweetSpotStreak: number;
  arousalPracticeCorrelation: number;
  lastComputedAt: string;
}

export interface DbArousalMetrics {
  id: string;
  user_id: string;
  current_streak_days: number;
  current_state: string | null;
  days_in_current_state: number;
  average_cycle_length: number | null;
  average_sweet_spot_entry_day: number | null;
  average_overload_day: number | null;
  sweet_spot_percentage: number | null;
  post_release_percentage: number | null;
  optimal_min_days: number | null;
  optimal_max_days: number | null;
  slip_rate: number | null;
  average_days_to_slip: number | null;
  high_risk_contexts: string[];
  longest_streak: number;
  longest_sweet_spot_streak: number;
  arousal_practice_correlation: number | null;
  last_computed_at: string;
}

// ============================================
// RECOMMENDATION TYPES
// ============================================

export type PracticeIntensity = 'minimum' | 'light' | 'normal' | 'increased' | 'maximum';
export type ContentDepth = 'maintenance' | 'light' | 'moderate' | 'deep' | 'deepest';
export type BreakthroughAvailability = 'not_recommended' | 'wait' | 'available' | 'encouraged' | 'optimal';

export interface StateRecommendation {
  state: ArousalState;
  practiceIntensity: PracticeIntensity;
  contentDepth: ContentDepth;
  breakthroughAttempts: BreakthroughAvailability;
  primaryMessage: string;
  suggestions: string[];
  warnings: string[];
}

// ============================================
// SEED TYPES
// ============================================

export type SeedCategory =
  | 'power_dynamics'
  | 'feminization_intimate'
  | 'sensation_physical'
  | 'psychological_verbal'
  | 'new_activities'
  | 'service_devotion'
  | 'denial_control'
  | 'body_exploration'
  | 'roleplay'
  | 'other';

export type SeedPhase =
  | 'identified'
  | 'distant_mention'
  | 'positive_assoc'
  | 'adjacent_exp'
  | 'soft_offer'
  | 'first_attempt'
  | 'establishing'
  | 'established'
  | 'abandoned'
  | 'paused';

export type Reception = 'positive' | 'neutral' | 'hesitant' | 'negative' | 'unknown';

export interface PhaseHistoryEntry {
  phase: SeedPhase;
  date: string;
  notes?: string;
}

export interface IntimateSeed {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: SeedCategory;
  intensityLevel: number;
  currentPhase: SeedPhase;
  phaseHistory: PhaseHistoryEntry[];
  lastReception?: Reception;
  receptionNotes?: string;
  bestTimingContext?: string;
  avoidContexts?: string;
  prerequisites: string[];
  enables: string[];
  relatedBreakthroughs: string[];
  seedScripts: Record<string, string>;
  source: 'user' | 'system' | 'ai_suggested';
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface DbIntimateSeed {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string;
  intensity_level: number;
  current_phase: string;
  phase_history: PhaseHistoryEntry[];
  last_reception: string | null;
  reception_notes: string | null;
  best_timing_context: string | null;
  avoid_contexts: string | null;
  prerequisites: string[];
  enables: string[];
  related_breakthroughs: string[];
  seed_scripts: Record<string, string>;
  source: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export type SeedActionType =
  | 'mention'
  | 'tested_waters'
  | 'soft_offer'
  | 'attempted'
  | 'succeeded'
  | 'partial'
  | 'rejected'
  | 'postponed'
  | 'she_initiated'
  | 'she_expanded'
  | 'abandoned'
  | 'note';

export interface SeedAction {
  id: string;
  userId: string;
  seedId: string;
  actionType: SeedActionType;
  occurredAt: string;
  arousalState?: ArousalState;
  partnerMood?: string;
  context?: string;
  whatHappened?: string;
  herReaction?: string;
  yourFeeling?: string;
  whatWorked?: string;
  whatDidnt?: string;
  nextStep?: string;
  phaseChangeTo?: SeedPhase;
  createdAt: string;
}

export interface DbSeedAction {
  id: string;
  user_id: string;
  seed_id: string;
  action_type: string;
  occurred_at: string;
  arousal_state: string | null;
  partner_mood: string | null;
  context: string | null;
  what_happened: string | null;
  her_reaction: string | null;
  your_feeling: string | null;
  what_worked: string | null;
  what_didnt: string | null;
  next_step: string | null;
  phase_change_to: string | null;
  created_at: string;
}

// ============================================
// KINK INVENTORY TYPES
// ============================================

export type KinkStatus =
  | 'established'
  | 'active'
  | 'curious'
  | 'with_partner'
  | 'partner_potential'
  | 'private_only'
  | 'uncertain'
  | 'soft_limit'
  | 'hard_limit';

export interface KinkInventoryItem {
  id: string;
  userId: string;
  name: string;
  description?: string;
  category: string;
  status: KinkStatus;
  interestLevel: number;
  experienceLevel: number;
  partnerLikelihood: number;
  feminizationConnection?: string;
  relatedSeeds: string[];
  fantasyNotes?: string;
  experienceNotes?: string;
  partnerNotes?: string;
  shareWithPartner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DbKinkInventoryItem {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  interest_level: number;
  experience_level: number;
  partner_likelihood: number;
  feminization_connection: string | null;
  related_seeds: string[];
  fantasy_notes: string | null;
  experience_notes: string | null;
  partner_notes: string | null;
  share_with_partner: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// AI SUGGESTION TYPES
// ============================================

export type SuggestionType =
  | 'new_seed'
  | 'advance_seed'
  | 'timing'
  | 'script'
  | 'connection'
  | 'warning'
  | 'celebration';

export type SuggestionStatus =
  | 'pending'
  | 'viewed'
  | 'accepted'
  | 'rejected'
  | 'completed'
  | 'expired';

export interface AISuggestion {
  id: string;
  userId: string;
  suggestionType: SuggestionType;
  title: string;
  content: string;
  basedOn: Record<string, unknown>;
  relatedSeedId?: string;
  relatedKinkIds: string[];
  optimalArousalStates: ArousalState[];
  priority: number;
  validUntil?: string;
  bestTiming?: string;
  status: SuggestionStatus;
  userResponse?: string;
  createdAt: string;
}

export interface DbAISuggestion {
  id: string;
  user_id: string;
  suggestion_type: string;
  title: string;
  content: string;
  based_on: Record<string, unknown>;
  related_seed_id: string | null;
  related_kink_ids: string[];
  optimal_arousal_states: string[];
  priority: number;
  valid_until: string | null;
  best_timing: string | null;
  status: string;
  user_response: string | null;
  created_at: string;
}

// ============================================
// JOURNAL TYPES
// ============================================

export type JournalTiming = 'during' | 'after' | 'reflecting';
export type ActivityType = 'content' | 'solo' | 'with_partner' | 'fantasy' | 'reflection';

export interface ActionItem {
  action: string;
  seedId?: string;
  timeline?: string;
}

export interface IntimateJournalEntry {
  id: string;
  userId: string;
  entryDate: string;
  arousalState?: ArousalState;
  arousalLevel?: number;
  duringOrAfter: JournalTiming;
  activityType?: ActivityType;
  activityDescription?: string;
  whatGotYouMost?: string;
  whatItMeans?: string;
  connectionToFeminization?: string;
  connectionToPartner?: string;
  shamePresent: boolean;
  shameNotes?: string;
  shameUseful?: boolean;
  actionItems: ActionItem[];
  tags: string[];
  createdAt: string;
}

export interface DbIntimateJournalEntry {
  id: string;
  user_id: string;
  entry_date: string;
  arousal_state: string | null;
  arousal_level: number | null;
  during_or_after: string;
  activity_type: string | null;
  activity_description: string | null;
  what_got_you_most: string | null;
  what_it_means: string | null;
  connection_to_feminization: string | null;
  connection_to_partner: string | null;
  shame_present: boolean;
  shame_notes: string | null;
  shame_useful: boolean | null;
  action_items: ActionItem[];
  tags: string[];
  created_at: string;
}

// ============================================
// INPUT TYPES
// ============================================

export interface ArousalCheckInInput {
  state: ArousalState;
  arousalLevel: number;
  feminizationReceptivity: number;
  achingIntensity: number;
  edgeCount: number;
  physicalSigns: PhysicalSign[];
  notes?: string;
}

export interface OrgasmLogInput {
  releaseType: ReleaseType;
  context: ReleaseContext;
  planned: boolean;
  intensity?: number;
  satisfaction?: number;
  regretLevel?: number;
  trigger?: string;
  notes?: string;
  partnerInitiated?: boolean;
  partnerControlled?: boolean;
  partnerAware?: boolean;
}

export interface SeedInput {
  title: string;
  description?: string;
  category: SeedCategory;
  intensityLevel: number;
  bestTimingContext?: string;
  avoidContexts?: string;
  prerequisites?: string[];
  enables?: string[];
}

export interface SeedActionInput {
  actionType: SeedActionType;
  arousalState?: ArousalState;
  partnerMood?: string;
  context?: string;
  whatHappened?: string;
  herReaction?: string;
  yourFeeling?: string;
  whatWorked?: string;
  whatDidnt?: string;
  nextStep?: string;
  phaseChangeTo?: SeedPhase;
}

// ============================================
// CONSTANTS
// ============================================

export const AROUSAL_STATE_CONFIG: Record<ArousalState, {
  label: string;
  emoji: string;
  color: string;
  description: string;
}> = {
  baseline: {
    label: 'Baseline',
    emoji: '😐',
    color: 'gray',
    description: 'Neutral state, normal practice',
  },
  building: {
    label: 'Building',
    emoji: '📈',
    color: 'blue',
    description: 'Arousal increasing, receptivity growing',
  },
  sweet_spot: {
    label: 'Sweet Spot',
    emoji: '🔥',
    color: 'purple',
    description: 'Maximum receptivity - protect this state',
  },
  overload: {
    label: 'Overload',
    emoji: '⚠️',
    color: 'red',
    description: 'High risk of slip - decide: release or cool-down',
  },
  post_release: {
    label: 'Post-Release',
    emoji: '😴',
    color: 'gray',
    description: 'Low receptivity - light practice only',
  },
  recovery: {
    label: 'Recovery',
    emoji: '🌱',
    color: 'green',
    description: 'Rebuilding toward sweet spot',
  },
};

export const RELEASE_TYPE_CONFIG: Record<ReleaseType, {
  label: string;
  emoji: string;
  resetsStreak: boolean;
}> = {
  full: { label: 'Full Release', emoji: '💦', resetsStreak: true },
  ruined: { label: 'Ruined', emoji: '😖', resetsStreak: true },
  prostate: { label: 'Prostate', emoji: '✨', resetsStreak: false },
  sissygasm: { label: 'Sissygasm', emoji: '🌟', resetsStreak: false },
  edge_only: { label: 'Edge Only', emoji: '🔄', resetsStreak: false },
  wet_dream: { label: 'Wet Dream', emoji: '😴', resetsStreak: true },
  accident: { label: 'Accident', emoji: '😬', resetsStreak: true },
};

export const SEED_PHASE_CONFIG: Record<SeedPhase, {
  label: string;
  order: number;
  description: string;
}> = {
  identified: { label: 'Identified', order: 0, description: 'Desire recognized' },
  distant_mention: { label: 'Distant Mention', order: 1, description: 'Mentioned in passing' },
  positive_assoc: { label: 'Positive Association', order: 2, description: 'Connected to positive context' },
  adjacent_exp: { label: 'Adjacent Experience', order: 3, description: 'Related activity tried' },
  soft_offer: { label: 'Soft Offer', order: 4, description: 'Gently proposed' },
  first_attempt: { label: 'First Attempt', order: 5, description: 'Actually tried' },
  establishing: { label: 'Establishing', order: 6, description: 'Becoming regular' },
  established: { label: 'Established', order: 7, description: 'Part of repertoire' },
  abandoned: { label: 'Abandoned', order: -1, description: 'Not pursuing' },
  paused: { label: 'Paused', order: -1, description: 'On hold' },
};

export const SEED_CATEGORY_CONFIG: Record<SeedCategory, {
  label: string;
  emoji: string;
}> = {
  power_dynamics: { label: 'Power Dynamics', emoji: '👑' },
  feminization_intimate: { label: 'Feminization', emoji: '💄' },
  sensation_physical: { label: 'Sensation', emoji: '✨' },
  psychological_verbal: { label: 'Psychological', emoji: '🧠' },
  new_activities: { label: 'New Activities', emoji: '🆕' },
  service_devotion: { label: 'Service', emoji: '🙏' },
  denial_control: { label: 'Denial/Control', emoji: '🔒' },
  body_exploration: { label: 'Body Exploration', emoji: '👀' },
  roleplay: { label: 'Roleplay', emoji: '🎭' },
  other: { label: 'Other', emoji: '📌' },
};

export const PHYSICAL_SIGN_CONFIG: Record<PhysicalSign, { label: string; emoji: string }> = {
  leaking: { label: 'Leaking', emoji: '💧' },
  aching: { label: 'Aching', emoji: '💢' },
  sensitive: { label: 'Sensitive', emoji: '✨' },
  throbbing: { label: 'Throbbing', emoji: '💓' },
  desperate: { label: 'Desperate', emoji: '😫' },
  calm: { label: 'Calm', emoji: '😌' },
  numb: { label: 'Numb', emoji: '😐' },
};
