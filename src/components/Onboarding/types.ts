// User profile types for onboarding

export type AgeRange = '18-24' | '25-34' | '35-44' | '45-54' | '55+';
export type JourneyStage = 'exploring' | 'decided' | 'started' | 'established';
export type LivingSituation = 'alone' | 'with_partner' | 'with_family' | 'with_roommates' | 'other';
export type OutLevel = 'not_out' | 'few_people' | 'mostly_out' | 'fully_out';
export type PartnerSupport = 'very_supportive' | 'supportive' | 'neutral' | 'unsupportive' | 'doesnt_know';
export type PreferredIntensity = 'gentle' | 'normal' | 'challenging';
export type VoiceFocusLevel = 'not_now' | 'gentle' | 'moderate' | 'intensive';
export type SocialComfort = 'very_anxious' | 'nervous' | 'comfortable' | 'confident';

export interface DysphoriaTrigger {
  area: string;
  intensity: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}

export interface EuphoriaTrigger {
  activity: string;
  intensity: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}

export interface Fear {
  fear: string;
  intensity: 1 | 2 | 3 | 4 | 5;
}

export interface UserProfile {
  // Basic info
  preferredName?: string;
  pronouns?: string;
  ageRange?: AgeRange;

  // Journey context
  journeyStage?: JourneyStage;
  monthsOnJourney: number;
  livingSituation?: LivingSituation;
  outLevel?: OutLevel;

  // Partner info
  hasPartner: boolean;
  partnerName?: string;
  partnerSupportive?: PartnerSupport;
  partnerNotes?: string;

  // Time Ratchets - psychological anchors
  goddessName?: string;           // Name to use for partner/goddess
  servingSince?: string;          // Date started serving (anniversary)
  eggCrackedDate?: string;        // Date of egg crack / realization
  protocolStartDate?: string;     // Auto-set on first entry

  // Dysphoria map
  dysphoriaTriggers: DysphoriaTrigger[];
  dysphoriaWorstTimes?: string;
  dysphoriaCoping?: string;

  // Euphoria map
  euphoriaTriggers: EuphoriaTrigger[];
  euphoriaBestMoments?: string;
  euphoriaSeeks?: string;

  // Fears & resistance
  fears: Fear[];
  biggestFear?: string;
  resistancePatterns?: string;

  // Goals & vision
  shortTermGoals?: string;
  longTermVision?: string;
  nonNegotiables?: string;

  // Onboarding inventory
  inventorySkipped?: boolean;
  inventoryTotalEstimated?: number;

  // Preferences
  preferredIntensity: PreferredIntensity;
  voiceFocusLevel?: VoiceFocusLevel;
  socialComfort?: SocialComfort;

  // Schedule/lifestyle
  morningAvailable: boolean;
  eveningAvailable: boolean;
  workFromHome: boolean;
  busyDays: string[];
}

// Sealed letter types
export type LetterType = 'welcome' | 'milestone' | 'struggle' | 'celebration' | 'future_self' | 'partner' | 'secret';
export type UnlockType = 'days' | 'streak' | 'phase' | 'domain_level' | 'alignment_avg' | 'pattern' | 'random' | 'date';

export interface UnlockCondition {
  type: UnlockType;
  value: number | string | object;
}

export interface SealedLetter {
  id: string;
  title: string;
  letterType: LetterType;
  content: string;
  unlockType: UnlockType;
  unlockValue: object;
  unlockHint?: string;
}

// Default profile
export const defaultProfile: Partial<UserProfile> = {
  monthsOnJourney: 0,
  hasPartner: false,
  dysphoriaTriggers: [],
  euphoriaTriggers: [],
  fears: [],
  preferredIntensity: 'normal',
  morningAvailable: true,
  eveningAvailable: true,
  workFromHome: false,
  busyDays: []
};
