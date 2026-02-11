/**
 * AI Layer
 *
 * Central AI integration for the protocol system.
 * Handles:
 * - Model selection based on operation priority
 * - Budget management with priority tiers
 * - Prefill technique for tone control
 * - Structured output parsing
 * - Template fallback when budget exhausted
 * - Response caching
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  SYSTEM_PROMPTS,
  MODEL_PREFERENCES,
  CACHEABLE_OPERATIONS,
  MAX_TOKENS,
  type OperationType
} from './system-prompts';
import { getPrefill, getStructuredPrefill, buildContextualPrefill } from './prefill-patterns';
import { getFallbackTemplate } from './template-fallbacks';
import { ContextComposer } from './context-composer';
import type { ModuleRegistry } from '../module-interface';

// ============================================
// TYPES
// ============================================

export type ModelTier = 'haiku' | 'sonnet' | 'opus';
export type Priority = 'low' | 'standard' | 'high' | 'critical';

export interface AICallConfig {
  operation: OperationType;
  prompt: string;
  priority?: Priority;
  prefillOverride?: string;
  contextOverride?: string;
  maxTokensOverride?: number;
  forceFresh?: boolean; // Bypass cache
}

export interface AIResponse {
  text: string;
  source: 'api' | 'cache' | 'fallback';
  cost: number;
  model?: string;
  cached?: boolean;
}

export interface BudgetConfig {
  totalBudget: number;
  criticalReserve: number; // Always keep this much for critical operations
  periodHours: number; // Budget period (e.g., 24 hours)
}

interface CacheEntry {
  response: string;
  expiry: number;
  operation: OperationType;
}

interface BudgetSpending {
  low: number;
  standard: number;
  high: number;
  critical: number;
}

// ============================================
// CONSTANTS
// ============================================

const MODEL_IDS: Record<ModelTier, string> = {
  haiku: 'claude-3-5-haiku-20241022',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
};

const ESTIMATED_COSTS: Record<ModelTier, { input: number; output: number }> = {
  haiku: { input: 0.00025, output: 0.00125 }, // per 1K tokens
  sonnet: { input: 0.003, output: 0.015 },
  opus: { input: 0.015, output: 0.075 },
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes default

const PRIORITY_BUDGET_ALLOCATION: Record<Priority, number> = {
  low: 0.1,      // 10% of budget
  standard: 0.3, // 30% of budget
  high: 0.3,     // 30% of budget
  critical: 0.3, // 30% reserved for critical
};

// ============================================
// AI LAYER CLASS
// ============================================

export class AILayer {
  private client: Anthropic | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private contextComposer: ContextComposer;

  // Budget tracking
  private budgetConfig: BudgetConfig;
  private spent: BudgetSpending = { low: 0, standard: 0, high: 0, critical: 0 };
  private periodStart: number = Date.now();

  constructor(
    registry: ModuleRegistry,
    budgetConfig?: Partial<BudgetConfig>
  ) {
    this.contextComposer = new ContextComposer(registry);
    this.budgetConfig = {
      totalBudget: budgetConfig?.totalBudget ?? 10.0, // $10 default daily budget
      criticalReserve: budgetConfig?.criticalReserve ?? 2.0, // $2 reserved for critical
      periodHours: budgetConfig?.periodHours ?? 24,
    };
  }

  /**
   * Initialize with API key
   */
  initialize(apiKey: string): void {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Check if AI is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Make an AI call with full orchestration
   */
  async call(config: AICallConfig): Promise<AIResponse> {
    const {
      operation,
      prompt,
      priority = 'standard',
      prefillOverride,
      contextOverride,
      maxTokensOverride,
      forceFresh = false,
    } = config;

    // 1. Check cache first (unless forced fresh)
    if (!forceFresh && CACHEABLE_OPERATIONS.has(operation)) {
      const cached = this.checkCache(operation, prompt);
      if (cached) {
        return { text: cached, source: 'cache', cost: 0, cached: true };
      }
    }

    // 2. Check budget
    const model = this.selectModel(operation, priority);
    const estimatedCost = this.estimateCost(model, prompt.length, MAX_TOKENS[operation]);

    if (!this.canSpend(estimatedCost, priority)) {
      // Fall back to template
      const fallback = this.getFallback(operation, { prompt });
      return { text: fallback, source: 'fallback', cost: 0 };
    }

    // 3. If no client, fall back to template
    if (!this.client) {
      const fallback = this.getFallback(operation, { prompt });
      return { text: fallback, source: 'fallback', cost: 0 };
    }

    // 4. Build context
    const context = contextOverride || this.contextComposer.composeContext(operation);

    // 5. Build messages with prefill
    const prefill = prefillOverride || getPrefill(operation);
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: `${context}\n\n${prompt}` }
    ];

    if (prefill) {
      messages.push({ role: 'assistant', content: prefill });
    }

    // 6. Make API call
    try {
      const response = await this.client.messages.create({
        model: MODEL_IDS[model],
        max_tokens: maxTokensOverride || MAX_TOKENS[operation],
        system: SYSTEM_PROMPTS[operation],
        messages,
      });

      // 7. Extract text
      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        }
      }

      // Prepend prefill to complete response
      const fullText = prefill ? prefill + text : text;

      // 8. Calculate actual cost and record spending
      const actualCost = this.calculateCost(response);
      this.recordSpending(actualCost, priority);

      // 9. Cache if appropriate
      if (CACHEABLE_OPERATIONS.has(operation)) {
        this.setCache(operation, prompt, fullText);
      }

      return {
        text: fullText,
        source: 'api',
        cost: actualCost,
        model: MODEL_IDS[model],
      };

    } catch (error) {
      console.error('[AILayer] API call failed:', error);
      const fallback = this.getFallback(operation, { prompt });
      return { text: fallback, source: 'fallback', cost: 0 };
    }
  }

  /**
   * Make a structured decision call (returns parsed JSON)
   */
  async structuredCall<T>(
    _operation: OperationType,
    prompt: string,
    jsonKey: string,
    priority: Priority = 'standard'
  ): Promise<{ data: T | null; source: 'api' | 'fallback' }> {
    const prefill = getStructuredPrefill(jsonKey as keyof typeof import('./prefill-patterns').STRUCTURED_PREFILLS)
      || `{"${jsonKey}":`;

    const response = await this.call({
      operation: 'structured_decision',
      prompt,
      priority,
      prefillOverride: prefill,
    });

    if (response.source === 'fallback') {
      return { data: null, source: 'fallback' };
    }

    try {
      const data = JSON.parse(response.text) as T;
      return { data, source: 'api' };
    } catch {
      console.error('[AILayer] Failed to parse JSON response:', response.text);
      return { data: null, source: 'fallback' };
    }
  }

  /**
   * Quick enhancement call (minimal context, Haiku model)
   */
  async enhance(instruction: string): Promise<string> {
    const response = await this.call({
      operation: 'task_enhancement',
      prompt: instruction,
      priority: 'low',
    });
    return response.text;
  }

  /**
   * Get morning briefing
   */
  async getMorningBriefing(): Promise<AIResponse> {
    const context = this.contextComposer.composeContext('morning_briefing');
    return this.call({
      operation: 'morning_briefing',
      prompt: 'Generate the morning briefing.',
      contextOverride: context,
      priority: 'standard',
    });
  }

  /**
   * Get evening review
   */
  async getEveningReview(): Promise<AIResponse> {
    const context = this.contextComposer.composeContext('evening_review');
    return this.call({
      operation: 'evening_review',
      prompt: 'Generate the evening review.',
      contextOverride: context,
      priority: 'standard',
    });
  }

  /**
   * Generate coercion message at specific level
   */
  async getCoercionMessage(level: number, taskDescription: string): Promise<AIResponse> {
    return this.call({
      operation: 'coercion',
      prompt: `Coercion level ${level}. Task: ${taskDescription}. Generate enforcement message.`,
      priority: level >= 7 ? 'high' : 'standard',
    });
  }

  /**
   * Generate vault threat
   */
  async getVaultThreat(
    vaultItemDate: string,
    taskDescription: string,
    deadlineHours: number
  ): Promise<AIResponse> {
    const prefill = buildContextualPrefill('vault_threat', { vaultDate: vaultItemDate });
    return this.call({
      operation: 'vault_threat',
      prompt: `Task required: ${taskDescription}. Deadline: ${deadlineHours} hours. Generate threat.`,
      priority: 'high',
      prefillOverride: prefill,
    });
  }

  /**
   * Generate warmth message
   */
  async getWarmthMessage(trigger: string): Promise<AIResponse> {
    return this.call({
      operation: 'warmth',
      prompt: `Trigger: ${trigger}. Generate genuine warmth.`,
      priority: 'standard',
    });
  }

  /**
   * Generate dissonance attack
   */
  async getDissonanceAttack(targetBelief: string, contradictingEvidence: string): Promise<AIResponse> {
    const prefill = buildContextualPrefill('dissonance_attack', { beliefText: targetBelief });
    return this.call({
      operation: 'dissonance_attack',
      prompt: `Target belief: "${targetBelief}". Contradicting evidence: ${contradictingEvidence}. Generate dissonance intervention.`,
      priority: 'high',
      prefillOverride: prefill,
    });
  }

  /**
   * Get full coach context (for strategic operations)
   */
  getCoachContext(): string {
    return this.contextComposer.buildCoachContext();
  }

  // ============================================
  // BUDGET MANAGEMENT
  // ============================================

  /**
   * Check if we can spend at this priority level
   */
  private canSpend(amount: number, priority: Priority): boolean {
    this.maybeResetPeriod();

    const totalSpent = this.totalSpent();
    const availableBudget = this.budgetConfig.totalBudget - totalSpent;

    // Always allow critical if within critical reserve
    if (priority === 'critical') {
      return availableBudget > 0;
    }

    // For non-critical, check if we'd eat into critical reserve
    const nonCriticalBudget = this.budgetConfig.totalBudget - this.budgetConfig.criticalReserve;
    const nonCriticalSpent = this.spent.low + this.spent.standard + this.spent.high;

    if (nonCriticalSpent + amount > nonCriticalBudget) {
      return false;
    }

    // Check priority-specific allocation
    const priorityBudget = this.budgetConfig.totalBudget * PRIORITY_BUDGET_ALLOCATION[priority];
    if (this.spent[priority] + amount > priorityBudget) {
      // Can borrow from lower priorities
      if (priority === 'high' && this.spent.standard < priorityBudget * 0.5) {
        return true; // Borrow from standard
      }
      if (priority === 'standard' && this.spent.low < priorityBudget * 0.5) {
        return true; // Borrow from low
      }
      return false;
    }

    return true;
  }

  private recordSpending(amount: number, priority: Priority): void {
    this.spent[priority] += amount;
  }

  private totalSpent(): number {
    return this.spent.low + this.spent.standard + this.spent.high + this.spent.critical;
  }

  private maybeResetPeriod(): void {
    const periodMs = this.budgetConfig.periodHours * 60 * 60 * 1000;
    if (Date.now() - this.periodStart > periodMs) {
      this.spent = { low: 0, standard: 0, high: 0, critical: 0 };
      this.periodStart = Date.now();
    }
  }

  /**
   * Get current budget status
   */
  getBudgetStatus(): {
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    byPriority: BudgetSpending;
    percentUsed: number;
  } {
    this.maybeResetPeriod();
    const totalSpent = this.totalSpent();
    return {
      totalBudget: this.budgetConfig.totalBudget,
      totalSpent,
      remaining: this.budgetConfig.totalBudget - totalSpent,
      byPriority: { ...this.spent },
      percentUsed: (totalSpent / this.budgetConfig.totalBudget) * 100,
    };
  }

  // ============================================
  // MODEL SELECTION
  // ============================================

  private selectModel(operation: OperationType, priority: Priority): ModelTier {
    // Critical operations get Opus
    if (priority === 'critical') {
      return 'opus';
    }

    // Use operation-specific preference, but downgrade if budget is tight
    const preferred = MODEL_PREFERENCES[operation] || 'sonnet';

    const budgetStatus = this.getBudgetStatus();
    if (budgetStatus.percentUsed > 80 && preferred === 'opus') {
      return 'sonnet';
    }
    if (budgetStatus.percentUsed > 90 && preferred !== 'haiku') {
      return 'haiku';
    }

    return preferred;
  }

  // ============================================
  // COST CALCULATION
  // ============================================

  private estimateCost(model: ModelTier, inputLength: number, maxOutputTokens: number): number {
    const costs = ESTIMATED_COSTS[model];
    const inputTokens = Math.ceil(inputLength / 4); // Rough estimate
    const outputTokens = maxOutputTokens;

    return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
  }

  private calculateCost(response: Anthropic.Message): number {
    const usage = response.usage;
    const model = response.model;

    let tier: ModelTier = 'sonnet';
    if (model.includes('haiku')) tier = 'haiku';
    if (model.includes('opus')) tier = 'opus';

    const costs = ESTIMATED_COSTS[tier];
    return (usage.input_tokens / 1000) * costs.input +
           (usage.output_tokens / 1000) * costs.output;
  }

  // ============================================
  // CACHING
  // ============================================

  private getCacheKey(operation: OperationType, prompt: string): string {
    return `${operation}:${prompt.slice(0, 100)}`;
  }

  private checkCache(operation: OperationType, prompt: string): string | null {
    const key = this.getCacheKey(operation, prompt);
    const entry = this.cache.get(key);

    if (entry && entry.expiry > Date.now()) {
      return entry.response;
    }

    // Expired, remove it
    if (entry) {
      this.cache.delete(key);
    }

    return null;
  }

  private setCache(operation: OperationType, prompt: string, response: string): void {
    const key = this.getCacheKey(operation, prompt);
    this.cache.set(key, {
      response,
      expiry: Date.now() + CACHE_TTL_MS,
      operation,
    });

    // Clean old entries periodically
    if (this.cache.size > 100) {
      this.cleanCache();
    }
  }

  private cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiry < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================
  // FALLBACKS
  // ============================================

  private getFallback(operation: OperationType, context: Record<string, unknown>): string {
    return getFallbackTemplate(operation, context);
  }
}

// ============================================
// SINGLETON FACTORY
// ============================================

let instance: AILayer | null = null;

export function getAILayer(registry: ModuleRegistry): AILayer {
  if (!instance) {
    instance = new AILayer(registry);
  }
  return instance;
}

export function createAILayer(
  registry: ModuleRegistry,
  budgetConfig?: Partial<BudgetConfig>
): AILayer {
  return new AILayer(registry, budgetConfig);
}
