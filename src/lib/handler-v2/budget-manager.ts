/**
 * Budget Manager - Handler Layer 3 Cost Control
 * Implements v2 Part 2.1: Budget management with daily limits,
 * evening reserve, and high-value action priority.
 */

import { supabase } from '../supabase';

export interface AIBudget {
  daily_limit_cents: number;      // e.g., 50 = $0.50/day
  used_today_cents: number;
  reserve_for_evening: number;    // always keep some for evening debrief
  high_value_actions: string[];   // commitment extraction, crisis, vulnerability window
}

// Cost estimates per action type (in cents)
export const ACTION_COSTS = {
  morning_briefing: 2.0,         // ~200 tokens out
  evening_debrief: 2.0,          // ~200 tokens out
  task_enhancement: 0.5,         // ~150 tokens out
  session_guidance: 1.5,         // ~150 tokens out
  commitment_extraction: 0.8,    // ~100 tokens out
  intervention: 1.0,             // ~150 tokens out
  crisis_response: 3.0,          // ~300 tokens out
  vulnerability_window: 2.0,     // ~200 tokens out
  strategic_planning: 5.0,       // ~500 tokens out (opus)
} as const;

export type ActionType = keyof typeof ACTION_COSTS;

// High-value actions get priority even when budget is low
const HIGH_VALUE_ACTIONS: ActionType[] = [
  'commitment_extraction',
  'crisis_response',
  'vulnerability_window',
  'evening_debrief',
];

export class BudgetManager {
  private userId: string;
  private dailyLimitCents: number;
  private spentTodayCents: number = 0;
  private reserveForEvening: number;
  private lastResetDate: string | null = null;
  private initialized: boolean = false;

  constructor(
    userId: string,
    dailyLimitCents: number = 50,  // $0.50 default
    reserveForEvening: number = 10  // $0.10 for evening debrief
  ) {
    this.userId = userId;
    this.dailyLimitCents = dailyLimitCents;
    this.reserveForEvening = reserveForEvening;
  }

  /**
   * Initialize budget from database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const today = new Date().toISOString().split('T')[0];

    // Try to load today's budget from database
    const { data, error } = await supabase
      .from('handler_budget')
      .select('*')
      .eq('user_id', this.userId)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading budget:', error);
    }

    if (data) {
      this.spentTodayCents = data.spent_cents;
      this.lastResetDate = data.date;
    } else {
      // Create new budget for today
      this.spentTodayCents = 0;
      this.lastResetDate = today;
      await this.saveBudget();
    }

    this.initialized = true;
  }

  /**
   * Check if we can afford an action
   */
  canAfford(actionType: ActionType): boolean {
    this.checkDayReset();

    const cost = ACTION_COSTS[actionType];
    const isHighValue = HIGH_VALUE_ACTIONS.includes(actionType);
    const isEvening = new Date().getHours() >= 17;

    // High-value actions can dip into reserve
    if (isHighValue) {
      return (this.spentTodayCents + cost) <= this.dailyLimitCents;
    }

    // Non-high-value actions must respect evening reserve after 5pm
    if (isEvening) {
      const available = this.dailyLimitCents - this.reserveForEvening - this.spentTodayCents;
      return cost <= available;
    }

    // Before evening, can use full budget minus reserve
    const available = this.dailyLimitCents - this.reserveForEvening - this.spentTodayCents;
    return cost <= available;
  }

  /**
   * Spend budget on an action
   */
  async spend(actionType: ActionType, actualCostCents?: number): Promise<boolean> {
    if (!this.canAfford(actionType)) {
      return false;
    }

    const cost = actualCostCents ?? ACTION_COSTS[actionType];
    this.spentTodayCents += cost;

    await this.saveBudget();
    await this.logSpend(actionType, cost);

    return true;
  }

  /**
   * Get remaining budget
   */
  getRemaining(): number {
    this.checkDayReset();
    return Math.max(0, this.dailyLimitCents - this.spentTodayCents);
  }

  /**
   * Get available budget (respecting reserve)
   */
  getAvailable(): number {
    this.checkDayReset();
    const isEvening = new Date().getHours() >= 17;

    if (isEvening) {
      return this.getRemaining();
    }

    return Math.max(0, this.dailyLimitCents - this.reserveForEvening - this.spentTodayCents);
  }

  /**
   * Get budget status
   */
  getStatus(): AIBudget {
    this.checkDayReset();
    return {
      daily_limit_cents: this.dailyLimitCents,
      used_today_cents: this.spentTodayCents,
      reserve_for_evening: this.reserveForEvening,
      high_value_actions: HIGH_VALUE_ACTIONS,
    };
  }

  /**
   * Get spent amount today
   */
  getSpent(): number {
    return this.spentTodayCents;
  }

  /**
   * Check if Layer 3 (AI) should be used for this action
   */
  shouldUseAI(actionType: ActionType): boolean {
    // Always try AI for high-value actions if any budget remains
    if (HIGH_VALUE_ACTIONS.includes(actionType)) {
      return this.getRemaining() > 0;
    }

    // For other actions, only if we can afford it
    return this.canAfford(actionType);
  }

  /**
   * Get the layer to use for a given action
   * Layer 1: Rules engine (free)
   * Layer 2: Template enhancement (free)
   * Layer 3: Full AI (costs money)
   */
  getLayerForAction(actionType: ActionType): 1 | 2 | 3 {
    if (this.shouldUseAI(actionType)) {
      return 3;
    }

    // Fall back to template engine for most actions
    const templateableActions: ActionType[] = [
      'morning_briefing',
      'evening_debrief',
      'task_enhancement',
      'session_guidance',
    ];

    if (templateableActions.includes(actionType)) {
      return 2;
    }

    // Everything else falls to rules engine
    return 1;
  }

  /**
   * Check and handle day reset
   */
  private checkDayReset(): void {
    const today = new Date().toISOString().split('T')[0];

    if (this.lastResetDate !== today) {
      this.spentTodayCents = 0;
      this.lastResetDate = today;
      // Don't await - let it save in background
      this.saveBudget();
    }
  }

  /**
   * Save budget to database
   */
  private async saveBudget(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase
      .from('handler_budget')
      .upsert({
        user_id: this.userId,
        date: today,
        daily_limit_cents: this.dailyLimitCents,
        spent_cents: this.spentTodayCents,
        reserve_cents: this.reserveForEvening,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,date',
      });

    if (error) {
      console.error('Error saving budget:', error);
    }
  }

  /**
   * Log spend to action log
   */
  private async logSpend(actionType: ActionType, costCents: number): Promise<void> {
    const { error } = await supabase
      .from('handler_action_log')
      .insert({
        user_id: this.userId,
        action_type: actionType,
        cost_cents: costCents,
        layer_used: 3,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error logging action:', error);
    }
  }
}

/**
 * Create budget manager for a user
 */
export async function createBudgetManager(userId: string): Promise<BudgetManager> {
  const manager = new BudgetManager(userId);
  await manager.initialize();
  return manager;
}
