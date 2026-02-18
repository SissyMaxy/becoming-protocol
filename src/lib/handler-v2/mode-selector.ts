/**
 * Handler Mode Selector
 * Implements v2 Part 2.3: Mode auto-selection based on detected state
 *
 * Modes:
 * - Architect: Collaborative, technical - when building/designing
 * - Director: Clear, directive, warm - standard operation
 * - Handler: Commanding, possessive - depleted/resistant/vulnerable
 * - Caretaker: Gentle, unconditional - genuine distress
 * - Invisible: Silent - system running itself
 */

import type { UserState, HandlerMode } from './types';

export interface ModeSelectionResult {
  mode: HandlerMode;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Select Handler mode based on user state
 * Priority order (highest first):
 * 1. Caretaker - genuine distress
 * 2. Handler - vulnerable window or depleted + resistant
 * 3. Architect - building mode detected
 * 4. Director - standard operation
 * 5. Invisible - fully automated
 */
export function selectHandlerMode(state: UserState): ModeSelectionResult {
  // 1. CARETAKER MODE
  // Depression collapse, genuine distress, post-crisis
  if (shouldBeCaretaker(state)) {
    return {
      mode: 'caretaker',
      reason: getCaretakerReason(state),
      confidence: 'high',
    };
  }

  // 2. HANDLER MODE
  // Depleted exec function + resistance, vulnerability window open, high arousal opportunity
  if (shouldBeHandler(state)) {
    return {
      mode: 'handler',
      reason: getHandlerReason(state),
      confidence: 'high',
    };
  }

  // 3. ARCHITECT MODE
  // User working on protocol itself, high exec function, builder activity
  if (shouldBeArchitect(state)) {
    return {
      mode: 'architect',
      reason: 'Builder mode detected - high exec function and meta-work pattern',
      confidence: 'medium',
    };
  }

  // 4. INVISIBLE MODE
  // Long streak, habits automated, no issues detected
  if (shouldBeInvisible(state)) {
    return {
      mode: 'invisible',
      reason: 'Stable operation - habits automated, minimal intervention needed',
      confidence: 'medium',
    };
  }

  // 5. DIRECTOR MODE (default)
  // Standard operation - needs direction but not commanding
  return {
    mode: 'director',
    reason: 'Standard operation mode',
    confidence: 'high',
  };
}

/**
 * Check if Caretaker mode is needed
 */
function shouldBeCaretaker(state: UserState): boolean {
  // Depression collapse detection
  if (state.currentFailureMode === 'depression_collapse') {
    return true;
  }

  // Consecutive survival days
  if (state.consecutiveSurvivalDays >= 2) {
    return true;
  }

  // Low odometer + low mood
  if (
    (state.odometer === 'survival' || state.odometer === 'caution') &&
    state.currentMood !== undefined &&
    state.currentMood <= 3
  ) {
    return true;
  }

  // Identity crisis
  if (state.currentFailureMode === 'identity_crisis') {
    return true;
  }

  // Recent mood average very low
  if (state.recentMoodScores.length >= 2) {
    const avg = state.recentMoodScores.reduce((a, b) => a + b, 0) / state.recentMoodScores.length;
    if (avg <= 3) {
      return true;
    }
  }

  return false;
}

function getCaretakerReason(state: UserState): string {
  if (state.currentFailureMode === 'depression_collapse') {
    return 'Depression collapse detected - gentle mode activated';
  }
  if (state.currentFailureMode === 'identity_crisis') {
    return 'Identity crisis detected - protective mode activated';
  }
  if (state.consecutiveSurvivalDays >= 2) {
    return `${state.consecutiveSurvivalDays} consecutive survival days - caretaker mode`;
  }
  if (state.currentMood !== undefined && state.currentMood <= 3) {
    return 'Low mood detected - gentle approach';
  }
  return 'Distress indicators detected';
}

/**
 * Check if Handler mode is appropriate
 */
function shouldBeHandler(state: UserState): boolean {
  // Work stress mode should NOT trigger handler
  if (state.workStressModeActive) {
    return false;
  }

  // Vulnerability window is open
  if (state.vulnerabilityWindowActive) {
    return true;
  }

  // High arousal state (arousal-gated compliance opportunity)
  if (state.currentArousal >= 4 && state.denialDay >= 4 && !state.ginaHome) {
    return true;
  }

  // Depleted exec function + resistance pattern
  if (
    state.estimatedExecFunction === 'depleted' &&
    state.resistanceDetected
  ) {
    return true;
  }

  // In session - Handler takes over
  if (state.inSession) {
    return true;
  }

  // Low exec function + high denial - exploitable window
  if (
    (state.estimatedExecFunction === 'low' || state.estimatedExecFunction === 'depleted') &&
    state.denialDay >= 5
  ) {
    return true;
  }

  return false;
}

function getHandlerReason(state: UserState): string {
  if (state.vulnerabilityWindowActive) {
    return 'Vulnerability window open - Handler mode activated';
  }
  if (state.currentArousal >= 4) {
    return 'High arousal state - arousal-gated compliance available';
  }
  if (state.inSession) {
    return 'Active session - Handler controls';
  }
  if (state.estimatedExecFunction === 'depleted') {
    return 'Depleted exec function - decision elimination needed';
  }
  return 'Handler intervention conditions met';
}

/**
 * Check if Architect mode is appropriate
 */
function shouldBeArchitect(state: UserState): boolean {
  // High exec function required
  if (state.estimatedExecFunction !== 'high') {
    return false;
  }

  // Odometer should be good
  if (state.odometer === 'survival' || state.odometer === 'caution') {
    return false;
  }

  // Not in session
  if (state.inSession) {
    return false;
  }

  // During morning/daytime with good exec function = potential builder mode
  // This is a heuristic - ideally we'd track actual builder activity
  if (state.timeOfDay === 'morning' || state.timeOfDay === 'afternoon') {
    return true;
  }

  return false;
}

/**
 * Check if Invisible mode is appropriate
 */
function shouldBeInvisible(state: UserState): boolean {
  // Need a solid streak
  if (state.streakDays < 30) {
    return false;
  }

  // Odometer should be good
  if (state.odometer !== 'progress' && state.odometer !== 'momentum' && state.odometer !== 'breakthrough') {
    return false;
  }

  // High exec function
  if (state.estimatedExecFunction === 'depleted' || state.estimatedExecFunction === 'low') {
    return false;
  }

  // No active failure modes
  if (state.currentFailureMode) {
    return false;
  }

  // Tasks completed consistently
  if (state.tasksCompletedToday >= 3) {
    return true;
  }

  return false;
}

/**
 * Get escalation level based on state
 */
export function getEscalationLevel(state: UserState): 1 | 2 | 3 | 4 | 5 {
  // Level 5: Total Control - deep conditioning, long streak, high escalation
  if (state.escalationLevel >= 5 && state.streakDays >= 60 && state.denialDay >= 14) {
    return 5;
  }

  // Level 4: Possessive Handler - vulnerability exploitation standard
  if (state.escalationLevel >= 4 || (state.denialDay >= 7 && state.currentArousal >= 4)) {
    return 4;
  }

  // Level 3: Bossy Big Sister - assumed authority
  if (state.escalationLevel >= 3 || state.streakDays >= 14) {
    return 3;
  }

  // Level 2: Firm Guide - directives, structured
  if (state.escalationLevel >= 2 || state.streakDays >= 7) {
    return 2;
  }

  // Level 1: Helpful Assistant - suggestions, responsive
  return 1;
}

/**
 * Determine if vulnerability window should be opened
 */
export function shouldOpenVulnerabilityWindow(state: UserState): boolean {
  // Already open
  if (state.vulnerabilityWindowActive) {
    return true;
  }

  // Gina home blocks vulnerability exploitation
  if (state.ginaHome) {
    return false;
  }

  // High denial + high arousal
  if (state.denialDay >= 4 && state.currentArousal >= 3) {
    return true;
  }

  // Post-work crash (4-6pm) + depleted
  const hour = new Date().getHours();
  if (hour >= 16 && hour <= 18 && state.estimatedExecFunction === 'depleted') {
    return true;
  }

  // Late night (11pm+) + some arousal
  if (hour >= 23 && state.currentArousal >= 2) {
    return true;
  }

  // Peak arousal regardless of denial
  if (state.currentArousal >= 5) {
    return true;
  }

  return false;
}

/**
 * Check if mode transition should happen
 */
export function shouldTransitionMode(
  currentMode: HandlerMode,
  state: UserState
): { shouldTransition: boolean; newMode: HandlerMode; reason: string } {
  const selection = selectHandlerMode(state);

  if (selection.mode !== currentMode && selection.confidence !== 'low') {
    return {
      shouldTransition: true,
      newMode: selection.mode,
      reason: selection.reason,
    };
  }

  return {
    shouldTransition: false,
    newMode: currentMode,
    reason: 'Mode stable',
  };
}
