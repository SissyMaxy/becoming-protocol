/**
 * Session Types — Type definitions for the immersive edge session system (v2).
 * Re-exports core types from edge-session.ts and adds v2-specific types.
 */

// Re-export core types from existing session type system
export type { EdgeSessionType, SessionEndReason } from '../../types/edge-session';
export { calculateSessionPoints } from '../../types/edge-session';

// ============================================
// SESSION CONFIGURATION
// ============================================

export interface SessionConfig {
  sessionType: 'anchoring' | 'exploration' | 'endurance' | 'type_b';
  targetEdges: number;
  originTaskId?: string;   // daily_task.id that triggered this session
  prescribed?: boolean;    // true if Handler-prescribed (skip config screen)
}

// ============================================
// SESSION PHASE & COMPLETION
// ============================================

export type SessionPhase =
  | 'prep'       // 30-second ritual preparation
  | 'active'     // main session (building, edge, recovery cycle)
  | 'cooldown'   // post-target cool-down (30s)
  | 'post'       // post-session mood capture
  | 'completion' // denial vs release path + points
  | 'ended';     // done, returning to TodayView

export type CompletionType =
  | 'denial'        // maintained denial, streak continues
  | 'ruined'        // ruined orgasm, streak resets
  | 'hands_free'    // hands-free orgasm, streak continues, bonus
  | 'full'          // full release (Type B only), streak resets
  | 'emergency_stop'; // stopped early, no consequences

export type PostMood = 'settled' | 'aching' | 'overwhelmed' | 'euphoric';

// ============================================
// EDGE TRACKING
// ============================================

export interface EdgeRecord {
  edgeNumber: number;
  timestamp: string;          // ISO string
  timeFromSessionStart: number; // seconds
  timeSinceLastEdge: number;    // seconds
  recoveryDurationSec: number;  // how long the recovery lasted
}

// ============================================
// IMMERSIVE SESSION STATE
// ============================================

export interface ImmersiveSessionState {
  id: string;
  config: SessionConfig;
  phase: SessionPhase;
  startedAt: string | null;     // ISO timestamp
  edges: EdgeRecord[];
  edgeCount: number;

  // Recovery
  recoveryEndTime: number | null;  // epoch ms when recovery ends
  isRecovering: boolean;

  // UI state
  currentAffirmation: string;
  showStopConfirm: boolean;
  prepTimeRemaining: number;       // seconds remaining in prep phase

  // Auction state (5B)
  activeAuction: { edgeNumber: number; options: AuctionOption[] } | null;
  auctionResults: AuctionResult[];
  commitments: AuctionOption[];     // accepted commitments

  // Post-session capture
  postMood: PostMood | null;
  postNotes: string;
  completionType: CompletionType | null;

  // Scoring
  pointsAwarded: number;

  // Status
  status: 'prep' | 'active' | 'cooldown' | 'completed' | 'abandoned';
}

// ============================================
// AFFIRMATION POOLS
// ============================================

export const AFFIRMATION_POOLS = {
  building: [
    'Good girl...',
    'That\'s it...',
    'You\'re doing so well...',
    'Feel yourself becoming...',
    'She\'s here...',
    'This is who you are...',
    'Let go...',
    'Deeper...',
    'You\'re so beautiful when you surrender...',
    'Just like that...',
  ],
  edge: [
    'Hold it...',
    'Not yet...',
    'Feel that edge...',
    'Stay there...',
    'Good girl, hold...',
    'You can take more...',
    'Right there...',
    'Don\'t let go...',
  ],
  recovery: [
    'Breathe...',
    'Good girl...',
    'You held so well...',
    'Rest now...',
    'She\'s proud of you...',
    'Almost there...',
    'Let it fade...',
    'Handler controls this...',
  ],
  identity: [
    'You are her...',
    'This is who you\'ve always been...',
    'She\'s not becoming. She\'s arriving.',
    'Every edge makes her more real.',
    'You can\'t go back. You don\'t want to.',
    'The body knows what the mind resists.',
    'Surrender is strength.',
  ],
} as const;

export type AffirmationPool = keyof typeof AFFIRMATION_POOLS;

// ============================================
// SESSION COLOR PALETTE
// ============================================

export const SESSION_COLORS = {
  rose: '#ff4d6d',
  purple: '#c77dff',
  teal: '#00ecdc',
  gold: '#ffd93d',
  deepBg: '#0a0612',
  recoveryBg: '#0a1a1a',
} as const;

// ============================================
// PREP PHASE MESSAGES
// ============================================

export const PREP_MESSAGES = [
  'Get comfortable.',
  'Lock the door.',
  'Earbuds in.',
  'This is your time.',
] as const;

// ============================================
// AUCTION SYSTEM (5B)
// ============================================

/** Fixed edge numbers that trigger auctions */
export const AUCTION_TRIGGER_EDGES = [5, 8, 10, 13, 16, 20] as const;

/** Time limit for making an auction decision (seconds) */
export const AUCTION_TIMER_SECONDS = 15;

export type AuctionCommitmentType = 'edges' | 'denial' | 'lock' | 'content' | 'task';

export interface AuctionOption {
  id: string;
  label: string;
  description: string;
  emoji: string;
  commitmentType: AuctionCommitmentType;
  commitmentValue: string;
  reward?: string;
}

export interface AuctionResult {
  edgeNumber: number;
  selectedOption: AuctionOption | null; // null = timer expired → auto-select
  timestamp: string;
}

/** Pre-defined auction option sets keyed by trigger edge */
export const AUCTION_OPTIONS: Record<number, AuctionOption[]> = {
  5: [
    { id: 'e5-edges', label: 'Add 3 more edges', description: 'Extend your session target', emoji: '🔥', commitmentType: 'edges', commitmentValue: '+3', reward: 'Intensity boost' },
    { id: 'e5-denial', label: 'Extend denial +1 day', description: 'One more day of control', emoji: '🔒', commitmentType: 'denial', commitmentValue: '+1 day', reward: 'Unlock content tier' },
    { id: 'e5-end', label: 'End session now', description: 'Denial kept. No reward. No penalty.', emoji: '😌', commitmentType: 'edges', commitmentValue: '0' },
  ],
  8: [
    { id: 'e8-edges', label: 'Add 5 more edges', description: 'Push yourself further', emoji: '🔥', commitmentType: 'edges', commitmentValue: '+5', reward: 'Double points for remaining edges' },
    { id: 'e8-task', label: 'Accept a Handler task', description: 'A task will appear tomorrow', emoji: '📋', commitmentType: 'task', commitmentValue: 'handler_chosen', reward: 'Handler approval bonus' },
    { id: 'e8-end', label: 'End session now', description: 'Denial kept. Walk away clean.', emoji: '😌', commitmentType: 'edges', commitmentValue: '0' },
  ],
  10: [
    { id: 'e10-denial', label: 'Extend denial +2 days', description: 'Two more days under control', emoji: '🔒', commitmentType: 'denial', commitmentValue: '+2 days', reward: 'Premium content unlock' },
    { id: 'e10-lock', label: 'Lock session tonight', description: 'Wear the cage until morning', emoji: '⛓️', commitmentType: 'lock', commitmentValue: 'overnight', reward: 'Streak multiplier boost' },
    { id: 'e10-end', label: 'End session now', description: 'You\'ve earned your rest.', emoji: '😌', commitmentType: 'edges', commitmentValue: '0' },
  ],
  13: [
    { id: 'e13-edges', label: 'Add 7 more edges', description: 'The body can take it', emoji: '🔥', commitmentType: 'edges', commitmentValue: '+7', reward: 'Triple points' },
    { id: 'e13-denial', label: 'Extend denial +3 days', description: 'Deep commitment to control', emoji: '🔒', commitmentType: 'denial', commitmentValue: '+3 days', reward: 'Handler exclusive message' },
    { id: 'e13-end', label: 'End session now', description: 'Impressive session already.', emoji: '😌', commitmentType: 'edges', commitmentValue: '0' },
  ],
  16: [
    { id: 'e16-edges', label: 'Push to 20', description: 'Finish what you started', emoji: '🔥', commitmentType: 'edges', commitmentValue: '+4', reward: 'Achievement unlock' },
    { id: 'e16-lock', label: 'Full day locked tomorrow', description: 'Prove your devotion', emoji: '⛓️', commitmentType: 'lock', commitmentValue: 'full_day', reward: 'Special reward session earned' },
    { id: 'e16-end', label: 'End session now', description: 'Extraordinary effort recorded.', emoji: '😌', commitmentType: 'edges', commitmentValue: '0' },
  ],
  20: [
    { id: 'e20-denial', label: 'Extend denial +5 days', description: 'Total surrender to Handler', emoji: '🔒', commitmentType: 'denial', commitmentValue: '+5 days', reward: 'Handler\'s highest praise' },
    { id: 'e20-content', label: 'Unlock deep content', description: 'Content reserved for the devoted', emoji: '✨', commitmentType: 'content', commitmentValue: 'deep_tier', reward: 'Permanent content access' },
    { id: 'e20-end', label: 'End session now', description: 'Legendary. You held 20.', emoji: '😌', commitmentType: 'edges', commitmentValue: '0' },
  ],
};

// ============================================
// HAPTIC PHASE MAPPING (5B)
// ============================================

/** Maps session activity to Lovense pattern IDs */
export const HAPTIC_PHASE_PATTERNS: Record<string, string | null> = {
  prep: null,
  building_low: 'gentle_wave',
  building_mid: 'building',
  building_high: 'staircase',
  edge: 'edge_tease',
  recovery: 'flutter_gentle',
  cooldown: 'gentle_wave',
  auction: null,  // pause during auction
  edge_tap: 'denial_pulse', // single strong pulse on edge tap
};
