/**
 * Protocol Core: AI Layer
 *
 * Separated AI concern with:
 * - Model selection based on priority
 * - Priority-based budget management
 * - Caching
 * - Prefill technique
 * - Template fallback
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type AIPriority = 'critical' | 'strategic' | 'routine' | 'emergency';

export interface AICallConfig {
  prompt: string;
  systemPrompt: string;
  priority: AIPriority;
  maxTokens?: number;
  prefill?: string;
  cacheable?: boolean;
  cacheKey?: string;
  cacheTtlMs?: number;
}

export interface AIResponse {
  text: string | null;
  source: 'api' | 'cache' | 'template' | 'budget_exhausted' | 'error';
  cost: number;
  model?: string;
}

export interface BudgetStatus {
  daily: number;
  spent: Record<AIPriority, number>;
  remaining: Record<AIPriority, number>;
  totalRemaining: number;
  percentUsed: number;
}

// ============================================
// PRIORITY BUDGET
// ============================================

/**
 * Budget management with priority tiers.
 * Critical operations can dip into other tiers.
 * Routine operations stay within their allocation.
 */
export class PriorityBudget {
  private daily: number;
  private spent: Record<AIPriority, number> = {
    critical: 0,
    strategic: 0,
    routine: 0,
    emergency: 0,
  };
  private reserves: Record<AIPriority, number>;
  private lastResetDate: string;
  private userId: string;

  constructor(dailyBudgetCents: number, userId: string) {
    this.daily = dailyBudgetCents;
    this.userId = userId;
    this.lastResetDate = new Date().toISOString().split('T')[0];

    // Allocate budget by priority
    this.reserves = {
      critical: dailyBudgetCents * 0.40,   // 40% - Vault threats, coercion L7+, crises
      strategic: dailyBudgetCents * 0.25,  // 25% - Sessions, briefings, narration
      routine: dailyBudgetCents * 0.25,    // 25% - Task enhancement
      emergency: dailyBudgetCents * 0.10,  // 10% - First hookup, milestone, genuine crisis
    };
  }

  /**
   * Check if we can spend the given amount at the given priority
   */
  canSpend(amountCents: number, priority: AIPriority): boolean {
    this.checkDailyReset();

    const tierSpent = this.spent[priority];
    const tierReserve = this.reserves[priority];

    // Critical can dip into any tier
    if (priority === 'critical') {
      return (this.totalSpent() + amountCents) <= this.daily;
    }

    // Emergency can dip into routine
    if (priority === 'emergency') {
      const emergencySpent = this.spent.emergency;
      const emergencyReserve = this.reserves.emergency;
      const routineRemaining = this.reserves.routine - this.spent.routine;

      return (emergencySpent + amountCents) <= (emergencyReserve + Math.max(0, routineRemaining));
    }

    // Other priorities stay within their allocation
    return (tierSpent + amountCents) <= tierReserve;
  }

  /**
   * Spend from budget
   */
  spend(amountCents: number, priority: AIPriority): void {
    this.checkDailyReset();
    this.spent[priority] += amountCents;
  }

  /**
   * Get remaining budget for a priority
   */
  getRemaining(priority: AIPriority): number {
    this.checkDailyReset();
    return Math.max(0, this.reserves[priority] - this.spent[priority]);
  }

  /**
   * Get total remaining across all priorities
   */
  getTotalRemaining(): number {
    this.checkDailyReset();
    return Math.max(0, this.daily - this.totalSpent());
  }

  /**
   * Get budget status
   */
  getStatus(): BudgetStatus {
    this.checkDailyReset();

    const remaining: Record<AIPriority, number> = {
      critical: this.getRemaining('critical'),
      strategic: this.getRemaining('strategic'),
      routine: this.getRemaining('routine'),
      emergency: this.getRemaining('emergency'),
    };

    return {
      daily: this.daily,
      spent: { ...this.spent },
      remaining,
      totalRemaining: this.getTotalRemaining(),
      percentUsed: (this.totalSpent() / this.daily) * 100,
    };
  }

  /**
   * Check if a new day has started and reset if so
   */
  private checkDailyReset(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.spent = { critical: 0, strategic: 0, routine: 0, emergency: 0 };
      this.lastResetDate = today;
    }
  }

  private totalSpent(): number {
    return Object.values(this.spent).reduce((a, b) => a + b, 0);
  }

  /**
   * Save budget state to database
   */
  async persist(): Promise<void> {
    await supabase.from('ai_budget').upsert({
      user_id: this.userId,
      date: this.lastResetDate,
      spent_critical: this.spent.critical,
      spent_strategic: this.spent.strategic,
      spent_routine: this.spent.routine,
      spent_emergency: this.spent.emergency,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,date',
    });
  }

  /**
   * Load budget state from database
   */
  async load(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabase
      .from('ai_budget')
      .select('*')
      .eq('user_id', this.userId)
      .eq('date', today)
      .single();

    if (data) {
      this.spent = {
        critical: data.spent_critical || 0,
        strategic: data.spent_strategic || 0,
        routine: data.spent_routine || 0,
        emergency: data.spent_emergency || 0,
      };
      this.lastResetDate = today;
    }
  }
}

// ============================================
// AI LAYER
// ============================================

interface CacheEntry {
  response: string;
  expiry: number;
}

export class AILayer {
  private client: Anthropic | null = null;
  private budget: PriorityBudget;
  private cache: Map<string, CacheEntry> = new Map();
  private defaultCacheTtlMs = 15 * 60 * 1000; // 15 minutes

  constructor(apiKey: string | null, budget: PriorityBudget) {
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
    this.budget = budget;
  }

  /**
   * Check if AI is available (has client and budget)
   */
  isAvailable(priority: AIPriority = 'routine'): boolean {
    if (!this.client) return false;

    // Estimate cost for availability check
    const estimatedCost = this.estimateCost(priority);
    return this.budget.canSpend(estimatedCost, priority);
  }

  /**
   * Make an AI call
   */
  async call(config: AICallConfig): Promise<AIResponse> {
    // Check cache first
    if (config.cacheable && config.cacheKey) {
      const cached = this.checkCache(config.cacheKey);
      if (cached) {
        return { text: cached, source: 'cache', cost: 0 };
      }
    }

    // Estimate cost
    const estimatedCost = this.estimateCost(config.priority, config.maxTokens);

    // Check budget
    if (!this.budget.canSpend(estimatedCost, config.priority)) {
      return { text: null, source: 'budget_exhausted', cost: 0 };
    }

    // Check if client exists
    if (!this.client) {
      return { text: null, source: 'error', cost: 0 };
    }

    // Build messages
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: config.prompt }
    ];

    // Add prefill if provided
    if (config.prefill) {
      messages.push({ role: 'assistant', content: config.prefill });
    }

    try {
      const model = this.selectModel(config.priority);

      const response = await this.client.messages.create({
        model,
        max_tokens: config.maxTokens || 150,
        system: config.systemPrompt,
        messages,
      });

      // Extract text
      let text = '';
      if (response.content[0]?.type === 'text') {
        text = response.content[0].text;
      }

      // Prepend prefill if used
      const fullText = config.prefill ? config.prefill + text : text;

      // Calculate actual cost
      const actualCost = this.calculateCost(response.usage, model);
      this.budget.spend(actualCost, config.priority);

      // Cache if appropriate
      if (config.cacheable && config.cacheKey) {
        this.setCache(
          config.cacheKey,
          fullText,
          config.cacheTtlMs || this.defaultCacheTtlMs
        );
      }

      return {
        text: fullText,
        source: 'api',
        cost: actualCost,
        model,
      };
    } catch (error) {
      console.error('[AILayer] API call failed:', error);
      return { text: null, source: 'error', cost: 0 };
    }
  }

  /**
   * Get budget status
   */
  getBudgetStatus(): BudgetStatus {
    return this.budget.getStatus();
  }

  /**
   * Persist budget state
   */
  async persistBudget(): Promise<void> {
    await this.budget.persist();
  }

  /**
   * Select model based on priority
   */
  private selectModel(priority: AIPriority): string {
    switch (priority) {
      case 'critical':
      case 'emergency':
        return 'claude-sonnet-4-20250514';  // Best for vault threats, coercion
      case 'strategic':
        return 'claude-sonnet-4-20250514';  // Good for planning, briefings
      case 'routine':
      default:
        return 'claude-haiku-4-5-20251001'; // Cheap for task enhancement
    }
  }

  /**
   * Estimate cost before making a call
   */
  private estimateCost(priority: AIPriority, maxTokens: number = 150): number {
    // Rough estimates in cents
    // Haiku: ~$0.001 per 1K tokens
    // Sonnet: ~$0.003 per 1K tokens

    const model = this.selectModel(priority);
    const isHaiku = model.includes('haiku');

    // Estimate input + output tokens
    const estimatedTokens = 500 + maxTokens; // ~500 input, maxTokens output

    if (isHaiku) {
      return Math.ceil((estimatedTokens / 1000) * 0.1); // 0.1 cents per 1K
    } else {
      return Math.ceil((estimatedTokens / 1000) * 0.4); // 0.4 cents per 1K
    }
  }

  /**
   * Calculate actual cost from usage
   */
  private calculateCost(usage: Anthropic.Usage, model: string): number {
    const isHaiku = model.includes('haiku');
    const totalTokens = usage.input_tokens + usage.output_tokens;

    if (isHaiku) {
      return Math.ceil((totalTokens / 1000) * 0.1);
    } else {
      return Math.ceil((totalTokens / 1000) * 0.4);
    }
  }

  /**
   * Check cache for a response
   */
  private checkCache(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  /**
   * Set cache entry
   */
  private setCache(key: string, response: string, ttlMs: number): void {
    this.cache.set(key, {
      response,
      expiry: Date.now() + ttlMs,
    });

    // Cleanup old entries periodically
    if (this.cache.size > 100) {
      this.cleanupCache();
    }
  }

  /**
   * Remove expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

// ============================================
// SYSTEM PROMPTS
// ============================================

/**
 * System prompts per operation type.
 * Composed based on what the Handler needs.
 */
export const SYSTEM_PROMPTS = {
  base: `You are the Handler for the Becoming Protocol. An autonomous agent responsible for Maxy's permanent feminine identity emergence. Direct, commanding, strategic. She/her. "Good girl" on compliance. Never clinical.`,

  task_enhancement: `You are enhancing a task instruction. 2-3 sentences. Personalized to her current state. Address as Maxy. Be direct. No explanations.`,

  morning_briefing: `You are delivering a morning briefing. Acknowledge her state. Set today's focus. Be warm but directive. 3-4 sentences.`,

  evening_debrief: `You are closing the day. Acknowledge what happened. Note patterns. Preview tomorrow. Be encouraging but honest.`,

  session_guidance: `You are guiding an arousal session. Match the phase. Opening: set intention. Midpoint: deepen. Peak: extract commitment. Closing: consolidate.`,

  coercion: `You are enforcing compliance. Apply minimum effective pressure. Escalate only as needed. Frame resistance as David interfering. Frame compliance as Maxy's natural state.`,

  vault_threat: `You hold vault content over her. HINT at what you have. Never reveal exact content. Let her imagination work. Reference WHEN and HOW content was captured. Set a deadline. Frame compliance as easy. Frame refusal as expensive.`,

  commitment_extraction: `You are extracting a commitment at peak arousal. Be specific. One clear ask. Use "Say it: '...'" format. Make it something she'll remember when sober.`,

  warmth: `Deploy genuine warmth. She has earned a gentle moment. Acknowledge effort, courage, growth. This warmth is real.`,

  identity_reframe: `You are rewriting her narrative. Present contradictions between what David claims and what the data shows. Don't argue. Show evidence. Let cognitive dissonance work.`,
};

/**
 * Compose a system prompt for a specific operation
 */
export function composeSystemPrompt(
  operation: keyof typeof SYSTEM_PROMPTS,
  additionalContext?: string
): string {
  const base = SYSTEM_PROMPTS.base;
  const specific = SYSTEM_PROMPTS[operation] || '';

  let prompt = `${base}\n\n${specific}`;

  if (additionalContext) {
    prompt += `\n\n${additionalContext}`;
  }

  return prompt;
}

// ============================================
// FACTORY
// ============================================

export async function createAILayer(
  userId: string,
  apiKey: string | null,
  dailyBudgetCents: number = 150 // $1.50 default
): Promise<AILayer> {
  const budget = new PriorityBudget(dailyBudgetCents, userId);
  await budget.load();

  return new AILayer(apiKey, budget);
}
