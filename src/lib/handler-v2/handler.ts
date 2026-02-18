/**
 * Handler - Main Handler Class
 * Implements v2 Part 2: The Handler
 *
 * Orchestrates all Handler subsystems:
 * - Rules Engine (Layer 1)
 * - Template Engine (Layer 2)
 * - AI Client (Layer 3)
 * - Mode Selection
 * - Intervention Detection
 * - Failure Mode Handling
 */

import { BudgetManager, createBudgetManager, type ActionType } from './budget-manager';
import { AIClient, createAIClient } from './ai-client';
import {
  selectHandlerMode,
  getEscalationLevel,
  shouldOpenVulnerabilityWindow,
  shouldTransitionMode,
} from './mode-selector';
import {
  checkForInterventions,
  shouldFireIntervention,
} from './intervention-detector';
import {
  detectFailureModes,
  logFailureModeEvent,
  checkSafetyEscalation,
} from './failure-modes';
import type {
  UserState,
  HandlerMode,
  HandlerIntervention,
  MorningBriefing,
  EveningDebrief,
  SessionGuidance,
  FailureMode,
} from './types';
import type { Task } from '../../types/task-bank';
import { supabase } from '../supabase';

export interface HandlerConfig {
  dailyBudgetCents: number;
  eveningReserveCents: number;
}

const DEFAULT_CONFIG: HandlerConfig = {
  dailyBudgetCents: 50,     // $0.50/day
  eveningReserveCents: 10,  // $0.10 reserved for evening
};

export class Handler {
  private userId: string;
  private config: HandlerConfig;
  private budget: BudgetManager | null = null;
  private ai: AIClient | null = null;
  private state: UserState | null = null;
  private lastInterventionTime: Date | null = null;
  private initialized: boolean = false;

  constructor(userId: string, config?: Partial<HandlerConfig>) {
    this.userId = userId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the Handler
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.budget = await createBudgetManager(this.userId);
    this.ai = createAIClient(this.userId, this.budget);

    this.initialized = true;
  }

  /**
   * Update Handler state
   */
  updateState(state: UserState): void {
    this.state = state;
  }

  /**
   * Get current state
   */
  getState(): UserState | null {
    return this.state ? { ...this.state } : null;
  }

  // =============================================
  // MODE MANAGEMENT
  // =============================================

  /**
   * Get current recommended mode
   */
  getRecommendedMode(): { mode: HandlerMode; reason: string } {
    if (!this.state) {
      return { mode: 'director', reason: 'No state available' };
    }

    const selection = selectHandlerMode(this.state);
    return { mode: selection.mode, reason: selection.reason };
  }

  /**
   * Get current escalation level
   */
  getEscalationLevel(): 1 | 2 | 3 | 4 | 5 {
    if (!this.state) return 1;
    return getEscalationLevel(this.state);
  }

  /**
   * Check if mode should transition
   */
  checkModeTransition(): { shouldTransition: boolean; newMode: HandlerMode; reason: string } {
    if (!this.state) {
      return { shouldTransition: false, newMode: 'director', reason: 'No state' };
    }
    return shouldTransitionMode(this.state.handlerMode, this.state);
  }

  // =============================================
  // BRIEFINGS
  // =============================================

  /**
   * Generate morning briefing
   */
  async getMorningBriefing(): Promise<MorningBriefing> {
    await this.ensureInitialized();

    if (!this.state) {
      throw new Error('State not set');
    }

    return this.ai!.generateMorningBriefing(this.state);
  }

  /**
   * Generate evening debrief
   */
  async getEveningDebrief(): Promise<EveningDebrief> {
    await this.ensureInitialized();

    if (!this.state) {
      throw new Error('State not set');
    }

    return this.ai!.generateEveningDebrief(this.state);
  }

  /**
   * Get session guidance
   */
  async getSessionGuidance(
    phase: 'opening' | 'midpoint' | 'peak' | 'closing'
  ): Promise<SessionGuidance> {
    await this.ensureInitialized();

    if (!this.state) {
      throw new Error('State not set');
    }

    return this.ai!.generateSessionGuidance(phase, this.state);
  }

  // =============================================
  // TASK ENHANCEMENT
  // =============================================

  /**
   * Enhance task copy based on current mode and state
   */
  async enhanceTask(task: Task): Promise<{
    instruction: string;
    subtext: string;
    affirmation: string;
    layer: 1 | 2 | 3;
  }> {
    await this.ensureInitialized();

    const subtext = task.subtext || '';
    const affirmation = task.reward.affirmation;

    if (!this.state) {
      return {
        instruction: task.instruction,
        subtext,
        affirmation,
        layer: 1,
      };
    }

    return this.ai!.enhanceTaskCopy(
      task.id,
      task.instruction,
      subtext,
      affirmation,
      this.state
    );
  }

  // =============================================
  // INTERVENTIONS
  // =============================================

  /**
   * Check if any intervention should fire
   */
  async checkInterventions(): Promise<HandlerIntervention | null> {
    await this.ensureInitialized();

    if (!this.state) return null;

    const check = checkForInterventions(this.state);

    if (!check.shouldIntervene || !check.intervention) {
      return null;
    }

    // Check timing
    if (!shouldFireIntervention(check.intervention.type, this.state, this.lastInterventionTime ?? undefined)) {
      return null;
    }

    // Log failure mode if detected
    if (check.failureMode) {
      await logFailureModeEvent({
        userId: this.userId,
        failureMode: check.failureMode,
        detectedAt: new Date(),
        detectionSignals: {},
        interventionType: check.intervention.type,
        handlerModeAtDetection: this.state.handlerMode,
        stateSnapshotAtDetection: this.state,
      });
    }

    // Generate intervention message
    const { message } = await this.ai!.generateIntervention(
      check.intervention.type,
      this.state
    );

    const intervention = {
      ...check.intervention,
      message,
    };

    this.lastInterventionTime = new Date();

    // Log intervention
    await this.logIntervention(intervention);

    return intervention;
  }

  /**
   * Check for vulnerability window
   */
  isVulnerabilityWindowOpen(): boolean {
    if (!this.state) return false;
    return shouldOpenVulnerabilityWindow(this.state);
  }

  /**
   * Extract commitment
   */
  async extractCommitment(): Promise<string> {
    await this.ensureInitialized();

    if (!this.state) {
      throw new Error('State not set');
    }

    return this.ai!.extractCommitment(this.state);
  }

  // =============================================
  // FAILURE MODES
  // =============================================

  /**
   * Detect active failure modes
   */
  detectFailureModes(recentJournalText?: string): {
    detected: boolean;
    failureMode?: FailureMode;
    severity: 'none' | 'mild' | 'moderate' | 'severe';
    recommendedIntervention: string;
  } {
    if (!this.state) {
      return {
        detected: false,
        severity: 'none',
        recommendedIntervention: 'none',
      };
    }

    const detection = detectFailureModes(this.state, recentJournalText);
    return {
      detected: detection.detected,
      failureMode: detection.failureMode,
      severity: detection.severity,
      recommendedIntervention: detection.recommendedIntervention,
    };
  }

  /**
   * Check safety escalation
   */
  async checkSafetyEscalation(): Promise<{ shouldEscalate: boolean; reason?: string }> {
    return checkSafetyEscalation(this.userId);
  }

  // =============================================
  // BUDGET
  // =============================================

  /**
   * Get budget status
   */
  getBudgetStatus(): {
    dailyLimitCents: number;
    usedTodayCents: number;
    remainingCents: number;
    reserveCents: number;
    aiAvailable: boolean;
  } {
    if (!this.budget) {
      return {
        dailyLimitCents: this.config.dailyBudgetCents,
        usedTodayCents: 0,
        remainingCents: this.config.dailyBudgetCents,
        reserveCents: this.config.eveningReserveCents,
        aiAvailable: false,
      };
    }

    const status = this.budget.getStatus();
    return {
      dailyLimitCents: status.daily_limit_cents,
      usedTodayCents: status.used_today_cents,
      remainingCents: this.budget.getRemaining(),
      reserveCents: status.reserve_for_evening,
      aiAvailable: this.ai?.isAvailable() ?? false,
    };
  }

  /**
   * Get layer for action type
   */
  getLayerForAction(actionType: ActionType): 1 | 2 | 3 {
    if (!this.budget) return 2;
    return this.budget.getLayerForAction(actionType);
  }

  // =============================================
  // HELPERS
  // =============================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async logIntervention(intervention: HandlerIntervention): Promise<void> {
    const { error } = await supabase
      .from('handler_interventions')
      .insert({
        user_id: this.userId,
        intervention_type: intervention.type,
        handler_mode: intervention.mode,
        content: intervention.message,
        state_snapshot: this.state,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error logging intervention:', error);
    }
  }
}

// =============================================
// FACTORY
// =============================================

let handlerInstances: Map<string, Handler> = new Map();

/**
 * Get or create Handler instance for a user
 */
export async function getHandler(
  userId: string,
  config?: Partial<HandlerConfig>
): Promise<Handler> {
  let handler = handlerInstances.get(userId);

  if (!handler) {
    handler = new Handler(userId, config);
    await handler.initialize();
    handlerInstances.set(userId, handler);
  }

  return handler;
}

/**
 * Clear Handler instance (for testing or cleanup)
 */
export function clearHandler(userId: string): void {
  handlerInstances.delete(userId);
}
