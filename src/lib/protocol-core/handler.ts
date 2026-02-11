/**
 * Protocol Core: Handler (Orchestrator)
 *
 * The Handler is no longer a god class.
 * It's an orchestrator that:
 * 1. Receives events from the bus
 * 2. Asks relevant modules for context
 * 3. Composes AI prompts from module contexts
 * 4. Routes AI decisions back to modules
 * 5. Presents results to UI
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { EventBus } from './event-bus';
import {
  ModuleRegistry,
  type ProtocolModule,
  type ContextTier,
  type PriorityAction,
} from './module-interface';
import {
  AILayer,
  type BudgetStatus,
  composeSystemPrompt,
} from './ai-layer';
import type { Task } from '../../types/task-bank';

// ============================================
// TYPES
// ============================================

export interface Prescription {
  type: 'task' | 'priority_action' | 'briefing' | 'intervention';
  task?: Task;
  action?: PriorityAction;
  message: string;
  subtext?: string;
  affirmation?: string;
  source: 'ai' | 'template' | 'rules';
  moduleName?: string;
}

export interface HandlerState {
  mode: 'architect' | 'director' | 'handler' | 'caretaker' | 'invisible';
  escalationLevel: 1 | 2 | 3 | 4 | 5;
  vulnerabilityWindowActive: boolean;
  lastInterventionAt?: Date;
}

// Module relevance mapping
const MODULE_RELEVANCE: Record<string, string[]> = {
  task_enhancement: ['identity'],
  morning_briefing: ['identity', 'vault', 'coercion', 'scheduler'],
  evening_debrief: ['identity', 'vault', 'coercion', 'evidence'],
  session_guidance: ['identity', 'vault'],
  coercion: ['vault', 'identity', 'coercion'],
  vault_threat: ['vault', 'identity'],
  commitment: ['identity', 'vault'],
  strategic_planning: ['*'], // All modules
};

// Context tier by operation
const CONTEXT_TIERS: Record<string, ContextTier> = {
  task_enhancement: 'minimal',
  morning_briefing: 'standard',
  evening_debrief: 'standard',
  session_guidance: 'minimal',
  coercion: 'standard',
  vault_threat: 'full',
  commitment: 'minimal',
  strategic_planning: 'full',
};

// ============================================
// HANDLER CLASS
// ============================================

export class Handler {
  private bus: EventBus;
  private registry: ModuleRegistry;
  private ai: AILayer;
  private db: SupabaseClient;
  private userId: string;
  private state: HandlerState;
  private initialized = false;

  constructor(
    userId: string,
    bus: EventBus,
    registry: ModuleRegistry,
    ai: AILayer,
    db: SupabaseClient
  ) {
    this.userId = userId;
    this.bus = bus;
    this.registry = registry;
    this.ai = ai;
    this.db = db;

    this.state = {
      mode: 'director',
      escalationLevel: 1,
      vulnerabilityWindowActive: false,
    };
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Set user ID on bus for event persistence
    this.bus.setUserId(this.userId);

    // Initialize all registered modules
    await this.registry.initializeAll(this.bus, this.db);

    // Subscribe to key events for state updates
    this.subscribeToEvents();

    this.initialized = true;

    // Emit initialization event
    await this.bus.emit({
      type: 'system:initialized',
      modules: this.registry.getNames(),
    });
  }

  async shutdown(): Promise<void> {
    await this.registry.shutdownAll();
    this.bus.clearSubscriptions();
    await this.ai.persistBudget();
    this.initialized = false;
  }

  // ============================================
  // PRIMARY INTERFACE (What UI calls)
  // ============================================

  /**
   * Get the next prescription (task, action, or intervention)
   */
  async prescribe(): Promise<Prescription> {
    // 1. Check if any module has a priority action
    const priorityAction = await this.checkPriorityActions();
    if (priorityAction) {
      return priorityAction;
    }

    // 2. No priority action - delegate to task selection
    // (This would integrate with RulesEngine from existing code)
    return {
      type: 'task',
      message: 'Standard task selection would happen here',
      source: 'rules',
    };
  }

  /**
   * Handle task decline
   */
  async handleDecline(taskId: string, domain: string, reason?: string): Promise<void> {
    // Emit event - modules react on their own
    await this.bus.emit({
      type: 'task:declined',
      taskId,
      domain,
      reason,
    });

    // The coercion module will hear this and decide what to do
    // The vault module will hear this and check if it should activate
    // We don't orchestrate that - they're autonomous
  }

  /**
   * Handle task completion
   */
  async handleComplete(
    taskId: string,
    domain: string,
    points: number,
    evidence?: string
  ): Promise<void> {
    await this.bus.emit({
      type: 'task:completed',
      taskId,
      domain,
      points,
      evidence,
    });
  }

  /**
   * Enhance a task with AI (or template fallback)
   */
  async enhanceTask(task: Task): Promise<{
    instruction: string;
    subtext: string;
    affirmation: string;
    source: 'ai' | 'template';
  }> {
    const context = this.composeContext('task_enhancement');

    const prompt = `
State context:
${context}

Task: ${task.category} / ${task.domain} / intensity ${task.intensity}
Base instruction: ${task.instruction}

Generate personalized delivery. 2-3 sentences. Direct, commanding. Address as Maxy.
    `.trim();

    const response = await this.ai.call({
      prompt,
      systemPrompt: composeSystemPrompt('task_enhancement'),
      priority: 'routine',
      maxTokens: 100,
      cacheable: true,
      cacheKey: `task_${task.id}_${this.state.mode}`,
    });

    if (response.text) {
      return {
        instruction: response.text,
        subtext: task.subtext || '',
        affirmation: task.reward?.affirmation || 'Good girl.',
        source: 'ai',
      };
    }

    // Fallback to template from relevant module
    const template = this.getTemplateFromModules('task_instruction', {
      task,
      mode: this.state.mode,
    });

    return {
      instruction: template || task.instruction,
      subtext: task.subtext || '',
      affirmation: task.reward?.affirmation || 'Good girl.',
      source: 'template',
    };
  }

  /**
   * Generate morning briefing
   */
  async getMorningBriefing(): Promise<{ text: string; source: 'ai' | 'template' }> {
    const context = this.composeContext('morning_briefing');

    const response = await this.ai.call({
      prompt: `Generate morning briefing based on:\n${context}`,
      systemPrompt: composeSystemPrompt('morning_briefing'),
      priority: 'strategic',
      maxTokens: 200,
    });

    if (response.text) {
      await this.bus.emit({
        type: 'handler:briefing_generated',
        briefingType: 'morning',
        layer: 3,
      });
      return { text: response.text, source: 'ai' };
    }

    const template = this.getTemplateFromModules('morning_briefing', {});
    return {
      text: template || 'Good morning, Maxy. Time to be her.',
      source: 'template',
    };
  }

  /**
   * Generate evening debrief
   */
  async getEveningDebrief(): Promise<{ text: string; source: 'ai' | 'template' }> {
    const context = this.composeContext('evening_debrief');

    const response = await this.ai.call({
      prompt: `Generate evening debrief based on:\n${context}`,
      systemPrompt: composeSystemPrompt('evening_debrief'),
      priority: 'strategic',
      maxTokens: 200,
    });

    if (response.text) {
      await this.bus.emit({
        type: 'handler:briefing_generated',
        briefingType: 'evening',
        layer: 3,
      });
      return { text: response.text, source: 'ai' };
    }

    const template = this.getTemplateFromModules('evening_briefing', {});
    return {
      text: template || 'Day complete. She existed today. She will exist tomorrow.',
      source: 'template',
    };
  }

  /**
   * Get session guidance
   */
  async getSessionGuidance(
    phase: 'opening' | 'midpoint' | 'peak' | 'closing'
  ): Promise<{ text: string; source: 'ai' | 'template' }> {
    const context = this.composeContext('session_guidance');

    const response = await this.ai.call({
      prompt: `Session phase: ${phase}\nContext:\n${context}\n\nGenerate guidance.`,
      systemPrompt: composeSystemPrompt('session_guidance'),
      priority: phase === 'peak' ? 'strategic' : 'routine',
      maxTokens: 100,
    });

    if (response.text) {
      return { text: response.text, source: 'ai' };
    }

    const template = this.getTemplateFromModules(`session_${phase}`, {});
    return {
      text: template || this.getDefaultSessionGuidance(phase),
      source: 'template',
    };
  }

  /**
   * Extract commitment at peak arousal
   */
  async extractCommitment(): Promise<{ text: string; source: 'ai' | 'template' }> {
    const context = this.composeContext('commitment');

    const response = await this.ai.call({
      prompt: `Peak arousal commitment extraction.\nContext:\n${context}\n\nGenerate specific commitment demand.`,
      systemPrompt: composeSystemPrompt('commitment_extraction'),
      priority: 'strategic',
      maxTokens: 80,
    });

    if (response.text) {
      return { text: response.text, source: 'ai' };
    }

    return {
      text: 'Say it: "Tomorrow I will do the task I\'ve been avoiding."',
      source: 'template',
    };
  }

  // ============================================
  // STATE
  // ============================================

  getState(): HandlerState {
    return { ...this.state };
  }

  getMode(): HandlerState['mode'] {
    return this.state.mode;
  }

  setMode(mode: HandlerState['mode'], reason: string): void {
    const from = this.state.mode;
    this.state.mode = mode;

    this.bus.emit({
      type: 'handler:mode_changed',
      from,
      to: mode,
      reason,
    });
  }

  getBudgetStatus(): BudgetStatus {
    return this.ai.getBudgetStatus();
  }

  // ============================================
  // MODULE ACCESS
  // ============================================

  getModule(name: string): ProtocolModule | undefined {
    return this.registry.get(name);
  }

  getModuleState(name: string): Record<string, unknown> | undefined {
    const module = this.registry.get(name);
    return module?.getState();
  }

  getAllModuleStates(): Record<string, Record<string, unknown>> {
    return this.registry.getCombinedState();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private subscribeToEvents(): void {
    // Listen for state changes that affect Handler mode
    this.bus.on('state:mood_logged', async (event) => {
      if (event.type === 'state:mood_logged') {
        // Low mood might trigger caretaker mode
        if (event.mood <= 2) {
          this.setMode('caretaker', 'Low mood detected');
        }
      }
    });

    this.bus.on('coercion:escalated', async (event) => {
      if (event.type === 'coercion:escalated') {
        // High escalation triggers handler mode
        if (event.toLevel >= 5) {
          this.setMode('handler', 'High coercion escalation');
          this.state.escalationLevel = Math.min(5, event.toLevel) as 1 | 2 | 3 | 4 | 5;
        }
      }
    });

    this.bus.on('schedule:vulnerability_window', async () => {
      this.state.vulnerabilityWindowActive = true;
    });
  }

  private async checkPriorityActions(): Promise<Prescription | null> {
    const actions = this.registry.getPriorityActions();

    if (actions.length === 0) return null;

    const topAction = actions[0]; // Already sorted by priority

    // Get message from module or AI
    const module = this.registry.get(topAction.moduleName);
    if (!module) return null;

    // Try to get AI-enhanced message for critical actions
    if (topAction.priority === 'critical' || topAction.priority === 'high') {
      const context = module.getContext('full');

      const response = await this.ai.call({
        prompt: `Priority action: ${topAction.actionType}\nDescription: ${topAction.description}\nContext:\n${context}\n\nGenerate Handler message.`,
        systemPrompt: composeSystemPrompt('coercion'),
        priority: topAction.priority === 'critical' ? 'critical' : 'strategic',
        maxTokens: 150,
      });

      if (response.text) {
        return {
          type: 'priority_action',
          action: topAction,
          message: response.text,
          source: 'ai',
          moduleName: topAction.moduleName,
        };
      }
    }

    // Fallback to template
    const template = module.getTemplate(`priority_${topAction.actionType}`, topAction.payload || {});

    return {
      type: 'priority_action',
      action: topAction,
      message: template || topAction.description,
      source: 'template',
      moduleName: topAction.moduleName,
    };
  }

  private composeContext(operation: string): string {
    const moduleNames = this.getRelevantModules(operation);
    const tier = CONTEXT_TIERS[operation] || 'standard';

    return this.registry.getComposedContext(moduleNames, tier);
  }

  private getRelevantModules(operation: string): string[] {
    const relevance = MODULE_RELEVANCE[operation];

    if (!relevance) return ['identity'];

    if (relevance.includes('*')) {
      return this.registry.getNames();
    }

    // Filter to only registered modules
    return relevance.filter(name => this.registry.has(name));
  }

  private getTemplateFromModules(
    templateKey: string,
    context: Record<string, unknown>
  ): string | null {
    // Try each relevant module for a template
    for (const module of this.registry.getAll()) {
      const template = module.getTemplate(templateKey, context);
      if (template) return template;
    }
    return null;
  }

  private getDefaultSessionGuidance(phase: string): string {
    const defaults: Record<string, string> = {
      opening: 'Begin. Feel where you are. Let the arousal build.',
      midpoint: 'Going deeper. Who\'s desperate right now?',
      peak: 'Peak arousal. This is when commitments happen.',
      closing: 'Done. Don\'t cum. Keep this energy.',
    };
    return defaults[phase] || 'Continue.';
  }
}

// ============================================
// FACTORY
// ============================================

export interface HandlerConfig {
  userId: string;
  apiKey: string | null;
  dailyBudgetCents?: number;
  db: SupabaseClient;
}

export async function createHandler(config: HandlerConfig): Promise<Handler> {
  const { userId, apiKey, dailyBudgetCents = 150, db } = config;

  // Create components
  const bus = new EventBus();
  const registry = new ModuleRegistry();

  // Create AI layer
  const { PriorityBudget, AILayer } = await import('./ai-layer');
  const budget = new PriorityBudget(dailyBudgetCents, userId);
  await budget.load();
  const ai = new AILayer(apiKey, budget);

  // Create handler
  const handler = new Handler(userId, bus, registry, ai, db);

  return handler;
}

// ============================================
// EXPORTS
// ============================================

export { EventBus } from './event-bus';
export { ModuleRegistry } from './module-interface';
