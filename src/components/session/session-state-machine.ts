/**
 * Session State Machine — Pure functions for session state transitions.
 * No React dependencies. Testable in isolation.
 */

import type {
  ImmersiveSessionState,
  SessionConfig,
  EdgeRecord,
  CompletionType,
  PostMood,
  AffirmationPool,
  AuctionOption,
} from './session-types';
import { AFFIRMATION_POOLS, AUCTION_TRIGGER_EDGES, AUCTION_OPTIONS } from './session-types';

// ============================================
// INITIALIZATION
// ============================================

export function createInitialState(id: string, config: SessionConfig): ImmersiveSessionState {
  return {
    id,
    config,
    phase: 'prep',
    startedAt: null,
    edges: [],
    edgeCount: 0,
    recoveryEndTime: null,
    isRecovering: false,
    currentAffirmation: getRandomAffirmation('building'),
    showStopConfirm: false,
    prepTimeRemaining: 30,
    activeAuction: null,
    auctionResults: [],
    commitments: [],
    postMood: null,
    postNotes: '',
    completionType: null,
    pointsAwarded: 0,
    status: 'prep',
  };
}

// ============================================
// PREP PHASE
// ============================================

export function tickPrep(state: ImmersiveSessionState): ImmersiveSessionState {
  const remaining = state.prepTimeRemaining - 1;
  return { ...state, prepTimeRemaining: remaining };
}

export function startActivePhase(state: ImmersiveSessionState): ImmersiveSessionState {
  return {
    ...state,
    phase: 'active',
    status: 'active',
    startedAt: new Date().toISOString(),
    currentAffirmation: getRandomAffirmation('building'),
  };
}

// ============================================
// EDGE TRACKING
// ============================================

export function recordEdge(state: ImmersiveSessionState, elapsedSec: number): ImmersiveSessionState {
  const edgeNumber = state.edgeCount + 1;
  const lastEdge = state.edges[state.edges.length - 1];
  const timeSinceLastEdge = lastEdge
    ? elapsedSec - lastEdge.timeFromSessionStart
    : elapsedSec;

  const recoveryDuration = getRandomRecoveryDuration();
  const edge: EdgeRecord = {
    edgeNumber,
    timestamp: new Date().toISOString(),
    timeFromSessionStart: elapsedSec,
    timeSinceLastEdge,
    recoveryDurationSec: recoveryDuration / 1000,
  };

  const newState: ImmersiveSessionState = {
    ...state,
    edges: [...state.edges, edge],
    edgeCount: edgeNumber,
    isRecovering: true,
    recoveryEndTime: Date.now() + recoveryDuration,
    currentAffirmation: getRandomAffirmation('edge'),
  };

  // Check if target reached
  if (edgeNumber >= state.config.targetEdges) {
    return {
      ...newState,
      isRecovering: false,
      recoveryEndTime: null,
      phase: 'cooldown',
      status: 'cooldown',
      currentAffirmation: 'Last one. You held beautifully.',
    };
  }

  return newState;
}

export function endRecovery(state: ImmersiveSessionState): ImmersiveSessionState {
  return {
    ...state,
    isRecovering: false,
    recoveryEndTime: null,
    currentAffirmation: getRandomAffirmation('building'),
  };
}

// ============================================
// COOLDOWN → POST
// ============================================

export function endCooldown(state: ImmersiveSessionState): ImmersiveSessionState {
  return {
    ...state,
    phase: 'post',
  };
}

// ============================================
// STOP / CANCEL FLOW
// ============================================

export function requestStop(state: ImmersiveSessionState): ImmersiveSessionState {
  return { ...state, showStopConfirm: true };
}

export function cancelStop(state: ImmersiveSessionState): ImmersiveSessionState {
  return { ...state, showStopConfirm: false };
}

export function confirmStop(state: ImmersiveSessionState): ImmersiveSessionState {
  return {
    ...state,
    showStopConfirm: false,
    phase: 'post',
    isRecovering: false,
    recoveryEndTime: null,
  };
}

export function emergencyStop(state: ImmersiveSessionState): ImmersiveSessionState {
  return {
    ...state,
    showStopConfirm: false,
    phase: 'completion',
    status: 'completed',
    completionType: 'emergency_stop',
    isRecovering: false,
    recoveryEndTime: null,
    pointsAwarded: 0, // No consequences
  };
}

// ============================================
// POST-SESSION CAPTURE
// ============================================

export function setPostMood(state: ImmersiveSessionState, mood: PostMood): ImmersiveSessionState {
  return { ...state, postMood: mood };
}

export function setPostNotes(state: ImmersiveSessionState, notes: string): ImmersiveSessionState {
  return { ...state, postNotes: notes };
}

export function advanceToCompletion(state: ImmersiveSessionState): ImmersiveSessionState {
  return { ...state, phase: 'completion' };
}

// ============================================
// COMPLETION FLOW
// ============================================

export function setCompletionType(
  state: ImmersiveSessionState,
  type: CompletionType,
  elapsedSec: number
): ImmersiveSessionState {
  const points = computePoints(state.edgeCount, elapsedSec, type);
  return {
    ...state,
    completionType: type,
    pointsAwarded: points,
    status: 'completed',
  };
}

export function finalizeSession(state: ImmersiveSessionState): ImmersiveSessionState {
  return { ...state, phase: 'ended' };
}

// ============================================
// MANUAL BREATHE (voluntary recovery)
// ============================================

export function triggerManualRecovery(state: ImmersiveSessionState): ImmersiveSessionState {
  if (state.isRecovering || state.phase !== 'active') return state;
  return {
    ...state,
    isRecovering: true,
    recoveryEndTime: Date.now() + getRandomRecoveryDuration(),
    currentAffirmation: getRandomAffirmation('recovery'),
  };
}

// ============================================
// POINTS CALCULATION
// ============================================

export function computePoints(
  edgeCount: number,
  durationSec: number,
  completionType: CompletionType
): number {
  let points = 50; // base

  // Per-edge bonus
  points += edgeCount * 10;

  // Duration bonus (1 point per minute over 10 min)
  const minutesOver10 = Math.max(0, (durationSec / 60) - 10);
  points += Math.floor(minutesOver10);

  // Completion type modifiers
  switch (completionType) {
    case 'denial':
      points += 25; // denial bonus
      break;
    case 'hands_free':
      points += 50; // hands-free bonus
      break;
    case 'ruined':
      points = Math.floor(points * 0.5); // halved
      break;
    case 'full':
      points = Math.floor(points * 0.75);
      break;
    case 'emergency_stop':
      points = 0;
      break;
  }

  return points;
}

// ============================================
// AUCTION SYSTEM
// ============================================

/** Check if the current edge count should trigger an auction */
export function shouldTriggerAuction(edgeCount: number, pastAuctionEdges: number[]): boolean {
  return (
    (AUCTION_TRIGGER_EDGES as readonly number[]).includes(edgeCount) &&
    !pastAuctionEdges.includes(edgeCount)
  );
}

/** Start an auction — pauses the session and presents options */
export function startAuction(state: ImmersiveSessionState, edgeNumber: number): ImmersiveSessionState {
  const options = AUCTION_OPTIONS[edgeNumber];
  if (!options) return state;
  return {
    ...state,
    activeAuction: { edgeNumber, options },
  };
}

/** Resolve an auction with the selected option */
export function resolveAuction(
  state: ImmersiveSessionState,
  selectedOption: AuctionOption
): ImmersiveSessionState {
  if (!state.activeAuction) return state;

  const result = {
    edgeNumber: state.activeAuction.edgeNumber,
    selectedOption,
    timestamp: new Date().toISOString(),
  };

  // Handle "end session now" choice
  const isEndSession = selectedOption.commitmentValue === '0' && selectedOption.commitmentType === 'edges';

  // Handle "add more edges" choices
  let newTarget = state.config.targetEdges;
  if (selectedOption.commitmentType === 'edges' && selectedOption.commitmentValue.startsWith('+')) {
    const addEdges = parseInt(selectedOption.commitmentValue.slice(1), 10);
    if (!isNaN(addEdges)) {
      newTarget = state.config.targetEdges + addEdges;
    }
  }

  const newState: ImmersiveSessionState = {
    ...state,
    activeAuction: null,
    auctionResults: [...state.auctionResults, result],
    commitments: isEndSession
      ? state.commitments
      : [...state.commitments, selectedOption],
    config: { ...state.config, targetEdges: newTarget },
  };

  // If user chose to end session, go to cooldown
  if (isEndSession) {
    return {
      ...newState,
      phase: 'cooldown',
      status: 'cooldown',
      isRecovering: false,
      recoveryEndTime: null,
      currentAffirmation: 'You chose to stop. Good girl.',
    };
  }

  return newState;
}

// ============================================
// HELPERS
// ============================================

/** Random recovery duration between 20-45 seconds (in milliseconds) */
export function getRandomRecoveryDuration(): number {
  return 20000 + Math.random() * 25000;
}

/** Pick a random affirmation from the specified pool */
export function getRandomAffirmation(pool: AffirmationPool): string {
  const items = AFFIRMATION_POOLS[pool];
  return items[Math.floor(Math.random() * items.length)];
}

/** Pick a random affirmation from a weighted mix of pools based on progress */
export function getAffirmationForProgress(edgeCount: number, targetEdges: number): string {
  const progress = edgeCount / targetEdges;
  if (progress < 0.3) return getRandomAffirmation('building');
  if (progress < 0.7) {
    // Mix of building and identity
    return Math.random() < 0.6
      ? getRandomAffirmation('building')
      : getRandomAffirmation('identity');
  }
  // Late session: more identity reinforcement
  return Math.random() < 0.4
    ? getRandomAffirmation('building')
    : getRandomAffirmation('identity');
}
