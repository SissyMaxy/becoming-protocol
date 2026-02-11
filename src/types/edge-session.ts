// Edge Session Types
// Comprehensive types for the Edge Session UI system

import type { EdgeCommitment } from './lovense';
import type { UserAnchor, AnchorType } from './rewards';

// ============================================
// SESSION FLOW PHASES
// ============================================

export type EdgeSessionPhase =
  | 'entry'           // Initial setup, anchor check, pre-survey
  | 'warmup'          // Gradual arousal build
  | 'building'        // Active intensity increase
  | 'plateau'         // Sustained mid-intensity
  | 'edge'            // Peak intensity, edge moments
  | 'recovery'        // Cool down between edges
  | 'auction'         // Commitment/bid phase
  | 'completion'      // Session ending flow
  | 'abandoned';      // Session was stopped early

export type SessionEntryStep =
  | 'anchor_check'    // Confirm sensory anchors active
  | 'pre_survey'      // Pre-arousal level, mindset
  | 'mode_select'     // Choose session type
  | 'ready';          // Final confirmation

export type CompletionStep =
  | 'cooldown'        // Gentle wind-down phase
  | 'post_survey'     // Post-session feedback
  | 'summary'         // Session stats display
  | 'commitments'     // Review commitments made
  | 'rewards';        // Points/achievements earned

// ============================================
// SESSION TYPES
// ============================================

export type EdgeSessionType =
  | 'anchoring'       // Focus on conditioning anchors
  | 'edge_training'   // Edge count focused
  | 'denial'          // Denial/tease focused
  | 'goon'            // Extended trance session
  | 'reward';         // Earned reward session with climax option

export type SessionGoal =
  | 'edge_count'      // Target number of edges
  | 'duration'        // Target time
  | 'denial_practice' // Tease and denial
  | 'anchor_conditioning' // Strengthen anchor associations
  | 'open_ended';     // No specific goal

export type SessionEndReason =
  | 'goal_reached'    // Hit target edges/duration
  | 'user_ended'      // User chose to end
  | 'cooldown'        // Automatic cooldown triggered
  | 'climax'          // Reward session climax
  | 'abandoned'       // Session abandoned
  | 'timeout';        // Max session time reached

// ============================================
// SESSION STATE
// ============================================

export interface EdgeSessionState {
  id: string;
  userId: string;
  sessionType: EdgeSessionType;
  phase: EdgeSessionPhase;

  // Entry state
  entryStep: SessionEntryStep;
  activeAnchors: string[]; // Anchor IDs
  preArousalLevel: number; // 1-10
  preMindset?: string;

  // Active session state
  startedAt?: string;
  phaseStartedAt?: string;
  currentIntensity: number; // 0-20
  targetIntensity: number;
  edgeCount: number;
  peakIntensity: number;

  // Goal tracking
  goal: SessionGoal;
  goalTarget?: number; // Edge count or minutes
  goalProgress: number;

  // Pattern state
  currentPatternId?: string;
  currentPatternName?: string;
  patternStartedAt?: string;
  autoPatternMode: boolean;

  // Auction state
  auctionActive: boolean;
  currentAuctionBid?: AuctionBid;
  bidsAccepted: AuctionBid[];

  // Commitments
  commitmentsMade: EdgeCommitment[];

  // Completion state
  completionStep?: CompletionStep;
  postArousalLevel?: number;
  experienceRating?: number;
  postNotes?: string;

  // Session stats
  totalDurationSec: number;
  timeInPhases: Record<EdgeSessionPhase, number>;
  patternsUsed: string[];

  // Status
  endedAt?: string;
  endReason?: SessionEndReason;
  pointsAwarded: number;
  status: 'setup' | 'active' | 'paused' | 'completing' | 'completed' | 'abandoned';
}

// ============================================
// AUCTION SYSTEM
// ============================================

export type AuctionBidCategory =
  | 'appearance'      // Wear/do something feminine
  | 'behavior'        // Act in feminine way
  | 'mindset'         // Mental/affirmation commitment
  | 'practice'        // Skill practice commitment
  | 'denial'          // Denial extension
  | 'exposure';       // Public feminization

export type AuctionBidLevel =
  | 'easy'            // Simple, low-stakes
  | 'moderate'        // Meaningful effort
  | 'challenging'     // Significant commitment
  | 'intense';        // Major challenge

export interface AuctionBid {
  id: string;
  category: AuctionBidCategory;
  level: AuctionBidLevel;
  description: string;
  shortLabel: string;
  rewardSeconds: number;      // Pleasure seconds if accepted
  edgeNumber: number;         // Edge at which this was offered
  offeredAt: string;
  acceptedAt?: string;
  rejectedAt?: string;
  expiresAt: string;          // Time limit to accept
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

export interface AuctionConfig {
  enabled: boolean;
  startAtEdge: number;        // First auction appears at this edge
  intervalEdges: number;      // Edges between auctions
  expirationSeconds: number;  // Time to accept bid
  autoRejectOnExpire: boolean;
  minLevel: AuctionBidLevel;  // Minimum bid level to offer
  maxPendingBids: number;     // Max pending at once
}

// Pre-defined auction bids
export interface AuctionBidTemplate {
  id: string;
  category: AuctionBidCategory;
  level: AuctionBidLevel;
  description: string;
  shortLabel: string;
  baseRewardSeconds: number;
  edgeMultiplier: number;     // Reward increases with edge count
  requirements?: {
    minEdges?: number;
    minStreak?: number;
    minLevel?: number;
  };
  isActive: boolean;
}

export interface DbAuctionBidTemplate {
  id: string;
  category: string;
  level: string;
  description: string;
  short_label: string;
  base_reward_seconds: number;
  edge_multiplier: number;
  requirements: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

// ============================================
// PATTERN SELECTION
// ============================================

export type PatternTransition =
  | 'immediate'       // Switch instantly
  | 'crossfade'       // Blend between patterns
  | 'gap';            // Brief pause then switch

export interface PatternSequence {
  id: string;
  name: string;
  description?: string;
  phases: PatternSequencePhase[];
  isLoop: boolean;
  totalDurationSec?: number;
}

export interface PatternSequencePhase {
  patternName: string;
  durationSec?: number;       // undefined = pattern's full duration
  intensity?: number;         // Override pattern intensity
  transition: PatternTransition;
  condition?: PatternCondition;
}

export interface PatternCondition {
  type: 'edge_count' | 'arousal_level' | 'duration' | 'user_input';
  threshold?: number;
  comparison?: 'gte' | 'lte' | 'eq';
}

// ============================================
// EDGE TRACKING
// ============================================

export interface EdgeEvent {
  id: string;
  sessionId: string;
  edgeNumber: number;
  timestamp: string;
  intensity: number;
  durationSec: number;        // Time at edge
  patternUsed?: string;
  commitmentMade?: EdgeCommitment;
  auctionBid?: AuctionBid;
  notes?: string;
}

export interface DbEdgeEvent {
  id: string;
  session_id: string;
  edge_number: number;
  timestamp: string;
  intensity: number;
  duration_sec: number;
  pattern_used: string | null;
  commitment_made: Record<string, unknown> | null;
  auction_bid: Record<string, unknown> | null;
  notes: string | null;
}

// ============================================
// SESSION ENTRY FLOW
// ============================================

export interface AnchorCheckState {
  anchors: UserAnchor[];
  confirmedAnchors: string[];   // IDs of anchors confirmed active
  newAnchorInput?: {
    type: AnchorType;
    name: string;
    notes?: string;
  };
}

export interface PreSurveyState {
  arousalLevel: number;         // 1-10
  mindset: SessionMindset;
  physicalState: PhysicalReadiness;
  timeAvailable: number;        // minutes
  notes?: string;
}

export type SessionMindset =
  | 'eager'           // Excited and ready
  | 'receptive'       // Open and willing
  | 'curious'         // Exploratory mood
  | 'needy'           // Desperate/aching
  | 'calm';           // Relaxed state

export type PhysicalReadiness =
  | 'fresh'           // Well-rested, energized
  | 'normal'          // Standard state
  | 'tired'           // Low energy
  | 'sensitive';      // Already stimulated

export interface ModeSelectState {
  sessionType: EdgeSessionType;
  goal: SessionGoal;
  goalTarget?: number;
  patternMode: 'auto' | 'manual' | 'ai_guided';
  intensityPreference: 'gentle' | 'moderate' | 'intense';
  auctionEnabled: boolean;
}

// ============================================
// SESSION CONTROLS
// ============================================

export interface SessionControls {
  // Intensity
  setIntensity: (level: number) => void;
  increaseIntensity: (by?: number) => void;
  decreaseIntensity: (by?: number) => void;

  // Pattern control
  playPattern: (patternName: string) => void;
  stopPattern: () => void;
  setAutoPattern: (enabled: boolean) => void;

  // Edge tracking
  recordEdge: () => void;

  // Phase control
  advancePhase: () => void;
  setPhase: (phase: EdgeSessionPhase) => void;

  // Session control
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: (reason?: SessionEndReason) => void;

  // Auction
  offerAuction: () => void;
  acceptBid: (bidId: string) => void;
  rejectBid: (bidId: string) => void;
}

// ============================================
// COMPLETION FLOW
// ============================================

export interface SessionSummary {
  sessionId: string;
  sessionType: EdgeSessionType;
  totalDuration: number;        // seconds
  edgeCount: number;
  peakIntensity: number;
  patternsUsed: string[];
  commitmentsMade: EdgeCommitment[];
  bidsAccepted: AuctionBid[];
  anchorsUsed: string[];

  // Calculated stats
  averageIntensity: number;
  timeAtEdge: number;           // seconds
  edgesPerMinute: number;

  // Rewards
  basePoints: number;
  streakMultiplier: number;
  bonusPoints: number;
  totalPoints: number;

  // Achievements unlocked this session
  newAchievements: string[];
}

export interface PostSurveyInput {
  postArousalLevel: number;     // 1-10
  experienceRating: number;     // 1-5
  anchorEffectiveness?: number; // 1-5
  whatWorked?: string;
  whatToImprove?: string;
  privateNotes?: string;
}

// ============================================
// AI GUIDANCE
// ============================================

export type AIGuidanceMode =
  | 'off'             // No AI guidance
  | 'suggestions'     // AI suggests, user controls
  | 'guided'          // AI leads with user override
  | 'full_control';   // AI controls (with limits)

export interface AIGuidanceState {
  mode: AIGuidanceMode;
  currentSuggestion?: string;
  suggestedPattern?: string;
  suggestedIntensity?: number;
  voiceEnabled: boolean;
  affirmationsEnabled: boolean;
  lastAffirmation?: string;
  lastAffirmationAt?: string;
}

export interface AIGuidanceConfig {
  mode: AIGuidanceMode;
  voiceEnabled: boolean;
  affirmationsEnabled: boolean;
  affirmationFrequency: number; // seconds
  suggestCommitments: boolean;
  adaptToArousal: boolean;
  maxIntensity: number;
  edgeDetection: boolean;
}

// ============================================
// DATABASE TYPES
// ============================================

export interface DbEdgeSession {
  id: string;
  user_id: string;
  session_type: string;
  goal: string;
  goal_target: number | null;

  // Entry data
  active_anchors: string[] | null;
  pre_arousal_level: number | null;
  pre_mindset: string | null;

  // Session data
  started_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  total_duration_sec: number;
  edge_count: number;
  peak_intensity: number;
  patterns_used: string[] | null;

  // Auction data
  bids_accepted: Record<string, unknown>[] | null;
  commitments_made: Record<string, unknown>[] | null;

  // Post-session
  post_arousal_level: number | null;
  experience_rating: number | null;
  anchor_effectiveness: number | null;
  post_notes: string | null;

  // Rewards
  points_awarded: number;

  // Status
  status: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// CONSTANTS
// ============================================

export const SESSION_TYPE_CONFIG: Record<EdgeSessionType, {
  label: string;
  description: string;
  icon: string;
  defaultGoal: SessionGoal;
  defaultPattern: string;
  gatedByAnchoring: boolean;
}> = {
  anchoring: {
    label: 'Anchoring Session',
    description: 'Strengthen conditioning associations with sensory anchors',
    icon: 'Anchor',
    defaultGoal: 'anchor_conditioning',
    defaultPattern: 'anchor_good_girl',
    gatedByAnchoring: false,
  },
  edge_training: {
    label: 'Edge Training',
    description: 'Build edge count and control skills',
    icon: 'TrendingUp',
    defaultGoal: 'edge_count',
    defaultPattern: 'building_wave',
    gatedByAnchoring: false,
  },
  denial: {
    label: 'Denial Practice',
    description: 'Tease and denial focused session',
    icon: 'Lock',
    defaultGoal: 'denial_practice',
    defaultPattern: 'tease_cruel',
    gatedByAnchoring: false,
  },
  goon: {
    label: 'Goon Session',
    description: 'Extended trance-inducing session',
    icon: 'Moon',
    defaultGoal: 'duration',
    defaultPattern: 'goon_hypnotic',
    gatedByAnchoring: false,
  },
  reward: {
    label: 'Reward Session',
    description: 'Earned reward with climax option',
    icon: 'Gift',
    defaultGoal: 'open_ended',
    defaultPattern: 'reward_climax_build',
    gatedByAnchoring: true,
  },
};

// STRENGTHENED: Higher minimums, more demanding targets
export const SESSION_GOAL_CONFIG: Record<SessionGoal, {
  label: string;
  description: string;
  hasTarget: boolean;
  targetLabel?: string;
  targetUnit?: string;
  suggestedTargets?: number[];
  minimumTarget?: number; // STRENGTHENED: Minimum required
}> = {
  edge_count: {
    label: 'Edge Count',
    description: 'Reach a target number of edges',
    hasTarget: true,
    targetLabel: 'Target edges',
    targetUnit: 'edges',
    suggestedTargets: [5, 8, 12, 15, 20], // STRENGTHENED: Higher targets (was 3, 5, 8, 10, 15)
    minimumTarget: 5, // STRENGTHENED: Minimum 5 edges per session
  },
  duration: {
    label: 'Duration',
    description: 'Session for a target time',
    hasTarget: true,
    targetLabel: 'Target duration',
    targetUnit: 'minutes',
    suggestedTargets: [30, 45, 60, 90, 120], // STRENGTHENED: Longer sessions (was 15, 30, 45, 60, 90)
    minimumTarget: 30, // STRENGTHENED: Minimum 30 minutes per session
  },
  denial_practice: {
    label: 'Denial Practice',
    description: 'Focus on tease and denial without release',
    hasTarget: false,
  },
  anchor_conditioning: {
    label: 'Anchor Conditioning',
    description: 'Strengthen sensory anchor associations',
    hasTarget: false,
  },
  open_ended: {
    label: 'Open Ended',
    description: 'No specific goal, go with the flow',
    hasTarget: false,
  },
};

export const PHASE_CONFIG: Record<EdgeSessionPhase, {
  label: string;
  description: string;
  color: string;
  suggestedDuration?: number; // seconds
  nextPhases: EdgeSessionPhase[];
}> = {
  entry: {
    label: 'Entry',
    description: 'Setting up your session',
    color: 'gray',
    nextPhases: ['warmup'],
  },
  warmup: {
    label: 'Warmup',
    description: 'Gentle arousal building',
    color: 'blue',
    suggestedDuration: 120,
    nextPhases: ['building'],
  },
  building: {
    label: 'Building',
    description: 'Increasing intensity',
    color: 'indigo',
    nextPhases: ['plateau', 'edge'],
  },
  plateau: {
    label: 'Plateau',
    description: 'Sustained mid-intensity',
    color: 'purple',
    nextPhases: ['edge', 'building'],
  },
  edge: {
    label: 'Edge',
    description: 'Peak intensity moments',
    color: 'pink',
    suggestedDuration: 30,
    nextPhases: ['recovery', 'completion'],
  },
  recovery: {
    label: 'Recovery',
    description: 'Cool down between edges',
    color: 'cyan',
    suggestedDuration: 60,
    nextPhases: ['building', 'auction', 'completion'],
  },
  auction: {
    label: 'Auction',
    description: 'Commitment opportunity',
    color: 'amber',
    nextPhases: ['building', 'completion'],
  },
  completion: {
    label: 'Completion',
    description: 'Ending your session',
    color: 'green',
    nextPhases: [],
  },
  abandoned: {
    label: 'Abandoned',
    description: 'Session ended early',
    color: 'gray',
    nextPhases: [],
  },
};

// STRENGTHENED: Lower base rewards - must commit more for pleasure
export const AUCTION_BID_LEVEL_CONFIG: Record<AuctionBidLevel, {
  label: string;
  baseRewardSeconds: number;
  color: string;
}> = {
  easy: {
    label: 'Easy',
    baseRewardSeconds: 5, // REDUCED from 10 - less reward for easy bids
    color: 'green',
  },
  moderate: {
    label: 'Moderate',
    baseRewardSeconds: 12, // REDUCED from 20
    color: 'blue',
  },
  challenging: {
    label: 'Challenging',
    baseRewardSeconds: 25, // REDUCED from 40
    color: 'purple',
  },
  intense: {
    label: 'Intense',
    baseRewardSeconds: 45, // REDUCED from 60 - must really commit
    color: 'pink',
  },
};

// STRENGTHENED: Default auction config - starts earlier, more frequent
export const DEFAULT_AUCTION_CONFIG: AuctionConfig = {
  enabled: true,
  startAtEdge: 2,           // STRENGTHENED: Start at edge 2 (was typically 3+)
  intervalEdges: 1,         // STRENGTHENED: Auction every edge (was 2+)
  expirationSeconds: 20,    // STRENGTHENED: Less time to decide (was 30+)
  autoRejectOnExpire: true,
  minLevel: 'moderate',     // STRENGTHENED: No easy bids - minimum moderate
  maxPendingBids: 3,
};

export const AUCTION_BID_CATEGORY_CONFIG: Record<AuctionBidCategory, {
  label: string;
  icon: string;
  examples: string[];
}> = {
  appearance: {
    label: 'Appearance',
    icon: 'Sparkles',
    examples: ['Wear panties tomorrow', 'Paint toenails', 'Shave legs'],
  },
  behavior: {
    label: 'Behavior',
    icon: 'Activity',
    examples: ['Practice feminine walk', 'Sit with legs crossed', 'Use feminine gestures'],
  },
  mindset: {
    label: 'Mindset',
    icon: 'Brain',
    examples: ['Repeat affirmation 10 times', 'Meditate on femininity', 'Journal about identity'],
  },
  practice: {
    label: 'Practice',
    icon: 'Target',
    examples: ['Voice practice 15 min', 'Posture exercises', 'Makeup tutorial'],
  },
  denial: {
    label: 'Denial',
    icon: 'Lock',
    examples: ['Extend denial 1 day', 'No touching until tomorrow', 'Edge only for 24 hours'],
  },
  exposure: {
    label: 'Exposure',
    icon: 'Eye',
    examples: ['Feminine gesture in public', 'Paint one nail visible', 'Wear subtle feminine accessory'],
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getRecommendedPatterns(
  phase: EdgeSessionPhase,
  sessionType: EdgeSessionType
): string[] {
  const phasePatterns: Record<EdgeSessionPhase, string[]> = {
    entry: [],
    warmup: ['warmup_gentle', 'warmup_tease', 'warmup_rapid'],
    building: ['building_steady', 'building_wave', 'building_pulse'],
    plateau: ['plateau_sustained', 'plateau_breathing', 'plateau_rolling'],
    edge: ['edge_sharp', 'edge_crest', 'edge_pulse', 'edge_sustained'],
    recovery: ['recovery_gentle', 'recovery_tease'],
    auction: ['plateau_sustained'],
    completion: ['denial_end_graceful', 'denial_end_proud', 'reward_afterglow'],
    abandoned: ['recovery_quick'],
  };

  // Add session-type specific patterns
  if (sessionType === 'goon') {
    return [...phasePatterns[phase], 'goon_hypnotic', 'goon_breath', 'goon_ocean'];
  }
  if (sessionType === 'denial') {
    return [...phasePatterns[phase], 'tease_almost', 'tease_ghost', 'tease_cruel'];
  }
  if (sessionType === 'reward' && phase === 'completion') {
    return ['reward_climax_build', 'reward_peak', 'reward_afterglow'];
  }

  return phasePatterns[phase];
}

export function calculateSessionPoints(summary: SessionSummary): number {
  let points = 0;

  // Base points for session completion
  points += 50;

  // Points per edge
  points += summary.edgeCount * 10;

  // Duration bonus (1 point per minute over 15 min)
  const minutesOver15 = Math.max(0, (summary.totalDuration / 60) - 15);
  points += Math.floor(minutesOver15);

  // Commitment bonus
  points += summary.commitmentsMade.length * 15;

  // Bid accepted bonus
  points += summary.bidsAccepted.length * 20;

  // Apply streak multiplier
  points = Math.floor(points * summary.streakMultiplier);

  return points;
}

export function getPhaseForArousal(arousalLevel: number): EdgeSessionPhase {
  if (arousalLevel <= 3) return 'warmup';
  if (arousalLevel <= 5) return 'building';
  if (arousalLevel <= 7) return 'plateau';
  if (arousalLevel <= 9) return 'edge';
  return 'edge';
}

export function mapDbEdgeSessionToSession(db: DbEdgeSession): Partial<EdgeSessionState> {
  return {
    id: db.id,
    userId: db.user_id,
    sessionType: db.session_type as EdgeSessionType,
    goal: db.goal as SessionGoal,
    goalTarget: db.goal_target || undefined,
    activeAnchors: db.active_anchors || [],
    preArousalLevel: db.pre_arousal_level || 1,
    preMindset: db.pre_mindset || undefined,
    startedAt: db.started_at || undefined,
    endedAt: db.ended_at || undefined,
    endReason: db.end_reason as SessionEndReason | undefined,
    totalDurationSec: db.total_duration_sec,
    edgeCount: db.edge_count,
    peakIntensity: db.peak_intensity,
    patternsUsed: db.patterns_used || [],
    bidsAccepted: (db.bids_accepted as unknown as AuctionBid[]) || [],
    commitmentsMade: (db.commitments_made as unknown as EdgeCommitment[]) || [],
    postArousalLevel: db.post_arousal_level || undefined,
    experienceRating: db.experience_rating || undefined,
    pointsAwarded: db.points_awarded,
    status: db.status as EdgeSessionState['status'],
  };
}
