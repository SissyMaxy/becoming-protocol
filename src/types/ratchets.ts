// Ratchet & Commitment System Types

// ============================================
// COVENANT
// ============================================

export interface CovenantTerm {
  id: string;
  text: string;
  required: boolean;
}

export const DEFAULT_COVENANT_TERMS: CovenantTerm[] = [
  { id: 'daily_protocol', text: 'Complete my daily protocol', required: true },
  { id: 'honor_aroused', text: 'Honor commitments made while aroused', required: true },
  { id: 'no_streak_break', text: 'Not break streaks without facing consequences', required: true },
  { id: 'use_investments', text: 'Use what I\'ve invested in', required: true },
  { id: 'trust_process', text: 'Trust the process even when it\'s hard', required: true },
];

export interface Covenant {
  id: string;
  userId: string;
  signedAt: Date;
  terms: CovenantTerm[];
  selfConsequence: string;
  durationType: 'phase4' | 'days' | 'permanent';
  durationValue?: number;
  violations: number;
  lastViolationAt?: Date;
  lastViolationType?: string;
  active: boolean;
  deactivatedAt?: Date;
  deactivationReason?: string;
}

export interface CovenantViolation {
  type: string;
  description: string;
  occurredAt: Date;
}

// ============================================
// CONFESSIONS & KEY ADMISSIONS
// ============================================

export type ConfessionSentiment = 'yearning' | 'fear' | 'desire' | 'admission' | 'commitment';
export type ConfessionSource = 'journal' | 'ai_conversation' | 'prompted';

export interface Confession {
  id: string;
  userId: string;
  prompt?: string;
  response: string;
  sentiment?: ConfessionSentiment;
  isKeyAdmission: boolean;
  source: ConfessionSource;
  createdAt: Date;
}

export type AdmissionType = 'identity' | 'desire' | 'commitment' | 'fear' | 'realization';

export interface KeyAdmission {
  id: string;
  userId: string;
  confessionId: string;
  admissionText: string;
  admissionType?: AdmissionType;
  timesShown: number;
  lastShownAt?: Date;
  createdAt: Date;
}

// Prompts that elicit confessions
export const CONFESSION_PROMPTS = [
  "What did you feel during today's practice that surprised you?",
  "What do you secretly want that you haven't admitted yet?",
  "If you could wake up tomorrow fully transformed, would you? Be honest.",
  "What would you lose if this worked completely?",
  "When do you feel most like yourself?",
  "What are you afraid people would think if they knew?",
  "What keeps you coming back to this?",
  "Describe a moment this week when you felt euphoric.",
  "What would the old you think of who you're becoming?",
  "If this is 'just experimenting,' why does it feel so right?",
];

// ============================================
// FIRST-TIME MILESTONES
// ============================================

export type MilestoneType =
  | 'first_protocol'
  | 'first_edge_session'
  | 'first_denial_goal'
  | 'first_lock'
  | 'first_hypno'
  | 'first_trigger_installed'
  | 'first_hands_free'
  | 'first_time_dressed'
  | 'first_time_out'
  | 'first_person_told'
  | 'first_photo_taken'
  | 'first_voice_recording'
  | 'first_purchase'
  | 'first_covenant'
  | 'first_identity_affirmation'
  | 'first_journal'
  | 'first_sealed_letter'
  | 'first_streak_break';

export interface FirstMilestone {
  id: string;
  userId: string;
  milestoneType: MilestoneType;
  achievedAt: Date;
  context?: {
    streak?: number;
    phase?: number;
    investment?: number;
  };
}

export const MILESTONE_LABELS: Record<MilestoneType, string> = {
  first_protocol: 'First protocol completed',
  first_edge_session: 'First edge session',
  first_denial_goal: 'First denial goal set',
  first_lock: 'First lock completed',
  first_hypno: 'First hypno session',
  first_trigger_installed: 'First trigger installed',
  first_hands_free: 'First hands-free experience',
  first_time_dressed: 'First time dressed',
  first_time_out: 'First time out en femme',
  first_person_told: 'First person told',
  first_photo_taken: 'First photo taken',
  first_voice_recording: 'First voice recording',
  first_purchase: 'First feminine purchase',
  first_covenant: 'Covenant signed',
  first_identity_affirmation: 'First identity affirmation',
  first_journal: 'First journal entry',
  first_sealed_letter: 'First sealed letter written',
  first_streak_break: 'First significant streak break',
};

// ============================================
// STREAK VALUE
// ============================================

export interface StreakSnapshot {
  id: string;
  userId: string;
  streakLength: number;
  snapshotAt: Date;
  snapshotReason: 'daily' | 'milestone' | 'near_break' | 'manual';
  tasksCompleted: number;
  practiceMinutes: number;
  edgesTotal: number;
  investmentDuring: number;
  levelsGained: number;
  journalEntries: number;
  lettersWritten: number;
  psychologicalValue: number;
}

export interface StreakValue {
  days: number;
  tasksCompleted: number;
  practiceHours: number;
  edgesWithoutRelease: number;
  investmentDuring: number;
  levelsGained: number;
  journalEntries: number;
  lettersWritten: number;
  covenantSigned: boolean;
  milestonesAchieved: number;
  psychologicalValue: number;
}

// Calculate psychological value of a streak
export function calculateStreakValue(
  streak: number,
  data: Partial<StreakValue>
): number {
  let value = 0;

  // Base value from days
  value += streak * 10;

  // Bonus for tasks
  value += (data.tasksCompleted || 0) * 2;

  // Practice time
  value += (data.practiceHours || 0) * 5;

  // Edge discipline
  value += (data.edgesWithoutRelease || 0) * 1;

  // Investment adds weight
  value += Math.floor((data.investmentDuring || 0) / 10);

  // Milestones
  value += (data.milestonesAchieved || 0) * 20;

  // Covenant multiplier
  if (data.covenantSigned) {
    value = Math.floor(value * 1.5);
  }

  return value;
}

// ============================================
// IDENTITY LANGUAGE
// ============================================

export interface IdentityLanguage {
  framing: string;
  taskPrefix: string;
  celebration: string;
  streakLabel: string;
}

export const IDENTITY_LANGUAGE_BY_PHASE: Record<number, IdentityLanguage> = {
  1: {
    framing: "You're learning to be feminine",
    taskPrefix: "Practice your",
    celebration: "Good progress toward becoming her",
    streakLabel: "days of practice",
  },
  2: {
    framing: "You're developing your femininity",
    taskPrefix: "Continue your",
    celebration: "She's emerging",
    streakLabel: "days of growth",
  },
  3: {
    framing: "You are feminine",
    taskPrefix: "Do your",
    celebration: "This is who you are",
    streakLabel: "days being her",
  },
  4: {
    framing: "Living as her",
    taskPrefix: "Your",
    celebration: "Of course you did",
    streakLabel: "days being yourself",
  },
};

export function getIdentityLanguage(phase: number): IdentityLanguage {
  return IDENTITY_LANGUAGE_BY_PHASE[Math.min(phase, 4)] || IDENTITY_LANGUAGE_BY_PHASE[1];
}

// ============================================
// IDENTITY AFFIRMATIONS
// ============================================

export interface IdentityAffirmation {
  id: string;
  userId: string;
  affirmationType: 'day30' | 'phase2' | 'phase3' | 'phase4' | 'custom';
  statement: string;
  affirmedAt: Date;
  streakAtTime: number;
  phaseAtTime: number;
  investmentAtTime: number;
}

export const AFFIRMATION_STATEMENTS: Record<string, string> = {
  day30: "I am feminine. 30 days of consistent practice isn't experimentation. It's who I am.",
  phase2: "I'm not trying anymore. I'm becoming.",
  phase3: "This is who I am. There's no going back.",
  phase4: "I am her. I have always been her.",
};

// ============================================
// DELETION GAUNTLET
// ============================================

export interface DeletionAttempt {
  id: string;
  userId: string;
  startedAt: Date;
  stepReached: number; // 1-4
  stoppedAtStep?: number;
  stoppedReason?: 'own_words' | 'letter' | 'typing_phrase' | 'reconsidered';
  completed: boolean;
  completedAt?: Date;
  finalReason?: string;
}

export interface DeletionGauntletStep {
  step: number;
  title: string;
  showStats: boolean;
  showConfession: boolean;
  showLetter: boolean;
  requireTyping: boolean;
  typingPhrase?: string;
  primaryButton: string;
  secondaryButton: string;
}

export const DELETION_GAUNTLET_STEPS: DeletionGauntletStep[] = [
  {
    step: 1,
    title: "You want to delete your account?",
    showStats: true,
    showConfession: false,
    showLetter: false,
    requireTyping: false,
    primaryButton: "Go back - I'm staying",
    secondaryButton: "Continue to delete →",
  },
  {
    step: 2,
    title: "What changed?",
    showStats: false,
    showConfession: true,
    showLetter: false,
    requireTyping: false,
    primaryButton: "Go back - I was right then",
    secondaryButton: "Continue to delete →",
  },
  {
    step: 3,
    title: "Read your letter to future self",
    showStats: false,
    showConfession: false,
    showLetter: true,
    requireTyping: false,
    primaryButton: "She convinced me - I'm staying",
    secondaryButton: "Continue to delete →",
  },
  {
    step: 4,
    title: "Final step",
    showStats: false,
    showConfession: false,
    showLetter: false,
    requireTyping: true,
    typingPhrase: "I am killing her",
    primaryButton: "I can't do this - I'm staying",
    secondaryButton: "Delete everything",
  },
];

// ============================================
// WISHLIST ARCHIVE
// ============================================

export type WishlistRemovalReason =
  | 'purchased'
  | 'found_better'
  | 'changed_mind'
  | 'too_expensive'
  | 'scared';

export interface WishlistArchiveItem {
  id: string;
  userId: string;
  originalItemId?: string;
  name: string;
  category?: string;
  estimatedPrice?: number;
  addedAt?: Date;
  removedAt: Date;
  removalReason?: WishlistRemovalReason;
}

export const REMOVAL_REASON_LABELS: Record<WishlistRemovalReason, string> = {
  purchased: 'Already purchased',
  found_better: 'Found a better option',
  changed_mind: 'Changed my mind',
  too_expensive: 'Too expensive right now',
  scared: "I'm scared of wanting this",
};

// ============================================
// LOSS FRAMING
// ============================================

export const LOSS_FRAMES = {
  skipTask: (domain: string, level: number) =>
    `Skip this and lose today's progress toward ${domain} Level ${level + 1}`,
  breakStreak: (days: number) =>
    `Break this streak and lose ${days} days of work`,
  earlyUnlock: (hours: number) =>
    `Unlock ${hours}hr early and lose your discipline record`,
  release: (days: number) =>
    `Release now and lose your ${days}-day denial achievement`,
  skipSession: () =>
    `Skip this session and lose momentum`,
  removeWishlist: () =>
    `Remove this and lose evidence of your desires`,
  deleteAccount: (data: { days: number; investment: number; letters: number }) =>
    `Delete and lose ${data.days} days of progress, $${data.investment.toLocaleString()} tracked, and ${data.letters} sealed letters`,
};

// ============================================
// DATABASE MAPPERS
// ============================================

export interface DbCovenant {
  id: string;
  user_id: string;
  signed_at: string;
  terms: CovenantTerm[];
  self_consequence: string;
  duration_type: string;
  duration_value: number | null;
  violations: number;
  last_violation_at: string | null;
  last_violation_type: string | null;
  active: boolean;
  deactivated_at: string | null;
  deactivation_reason: string | null;
}

export function mapDbToCovenant(db: DbCovenant): Covenant {
  return {
    id: db.id,
    userId: db.user_id,
    signedAt: new Date(db.signed_at),
    terms: db.terms,
    selfConsequence: db.self_consequence,
    durationType: db.duration_type as Covenant['durationType'],
    durationValue: db.duration_value ?? undefined,
    violations: db.violations,
    lastViolationAt: db.last_violation_at ? new Date(db.last_violation_at) : undefined,
    lastViolationType: db.last_violation_type ?? undefined,
    active: db.active,
    deactivatedAt: db.deactivated_at ? new Date(db.deactivated_at) : undefined,
    deactivationReason: db.deactivation_reason ?? undefined,
  };
}

export interface DbConfession {
  id: string;
  user_id: string;
  prompt: string | null;
  response: string;
  sentiment: string | null;
  is_key_admission: boolean;
  source: string;
  created_at: string;
}

export function mapDbToConfession(db: DbConfession): Confession {
  return {
    id: db.id,
    userId: db.user_id,
    prompt: db.prompt ?? undefined,
    response: db.response,
    sentiment: db.sentiment as ConfessionSentiment | undefined,
    isKeyAdmission: db.is_key_admission,
    source: db.source as ConfessionSource,
    createdAt: new Date(db.created_at),
  };
}

export interface DbFirstMilestone {
  id: string;
  user_id: string;
  milestone_type: string;
  achieved_at: string;
  context: object | null;
}

export function mapDbToFirstMilestone(db: DbFirstMilestone): FirstMilestone {
  return {
    id: db.id,
    userId: db.user_id,
    milestoneType: db.milestone_type as MilestoneType,
    achievedAt: new Date(db.achieved_at),
    context: db.context as FirstMilestone['context'],
  };
}
