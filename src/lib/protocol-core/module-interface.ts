/**
 * Protocol Core: Module Interface
 *
 * Every module implements this interface.
 * Modules are self-contained units that:
 * - Subscribe to events they care about
 * - Maintain their own state
 * - Provide context for AI calls
 * - Have fallback templates when AI is unavailable
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventBus, ProtocolEvent, EventCategory } from './event-bus';

// ============================================
// CONTEXT TIERS
// ============================================

/**
 * Context tiers control how much data a module contributes to AI calls.
 * - minimal: Just the key facts (cheap operations)
 * - standard: More detail (routine operations)
 * - full: Everything relevant (strategic/critical operations)
 */
export type ContextTier = 'minimal' | 'standard' | 'full';

// ============================================
// PRIORITY ACTIONS
// ============================================

/**
 * Modules can signal they have urgent work that should preempt normal flow.
 */
export interface PriorityAction {
  moduleName: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  actionType: string;
  description: string;
  deadline?: Date;
  payload?: Record<string, unknown>;
}

// ============================================
// MODULE INTERFACE
// ============================================

export interface ProtocolModule {
  /**
   * Unique module name (used for registration and logging)
   */
  readonly name: string;

  /**
   * Module category for grouping
   */
  readonly category: 'domain' | 'system' | 'relationship';

  /**
   * Initialize the module.
   * Called once during system startup.
   * Subscribe to events, load initial state.
   */
  initialize(bus: EventBus, db: SupabaseClient): Promise<void>;

  /**
   * Shutdown the module.
   * Called during system cleanup.
   * Unsubscribe from events, save state.
   */
  shutdown?(): Promise<void>;

  /**
   * Get context string for AI calls.
   * Returns a compact summary based on tier.
   */
  getContext(tier: ContextTier): string;

  /**
   * Get module's current state.
   * Used for state composition and debugging.
   */
  getState(): Record<string, unknown>;

  /**
   * Get a fallback template when AI is unavailable.
   * Returns null if no template exists for the key.
   */
  getTemplate(templateKey: string, context: Record<string, unknown>): string | null;

  /**
   * Check if module has a priority action that should preempt normal flow.
   * Optional - modules can implement if they have time-sensitive actions.
   */
  getPriorityAction?(): PriorityAction | null;

  /**
   * Handle a request from the Handler.
   * Optional - modules can implement for custom request handling.
   */
  handleRequest?(request: ModuleRequest): Promise<ModuleResponse>;
}

// ============================================
// MODULE REQUEST/RESPONSE
// ============================================

export interface ModuleRequest {
  type: string;
  payload: Record<string, unknown>;
}

export interface ModuleResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================
// BASE MODULE CLASS
// ============================================

/**
 * Base class for modules with common functionality.
 * Extend this for easier module development.
 */
export abstract class BaseModule implements ProtocolModule {
  abstract readonly name: string;
  abstract readonly category: 'domain' | 'system' | 'relationship';

  protected bus!: EventBus;
  protected db!: SupabaseClient;
  protected subscriptionIds: string[] = [];
  protected initialized = false;

  async initialize(bus: EventBus, db: SupabaseClient): Promise<void> {
    if (this.initialized) return;

    this.bus = bus;
    this.db = db;

    // Call module-specific setup
    await this.onInitialize();

    this.initialized = true;

    // Emit registration event
    this.bus.emit({
      type: 'system:module_registered',
      moduleName: this.name,
    });
  }

  async shutdown(): Promise<void> {
    // Unsubscribe from all events
    for (const id of this.subscriptionIds) {
      this.bus.off(id);
    }
    this.subscriptionIds = [];

    // Call module-specific cleanup
    await this.onShutdown();

    this.initialized = false;
  }

  /**
   * Override in subclass to set up event subscriptions and load state
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Override in subclass for cleanup logic
   */
  protected async onShutdown(): Promise<void> {
    // Default: no-op
  }

  /**
   * Subscribe to an event (tracks subscription for cleanup)
   */
  protected subscribe(
    eventType: string,
    handler: (event: ProtocolEvent) => void | Promise<void>
  ): void {
    const id = this.bus.on(eventType, handler, this.name);
    this.subscriptionIds.push(id);
  }

  /**
   * Subscribe to an event category (tracks subscription for cleanup)
   */
  protected subscribeCategory(
    category: EventCategory,
    handler: (event: ProtocolEvent) => void | Promise<void>
  ): void {
    const id = this.bus.onCategory(category, handler, this.name);
    this.subscriptionIds.push(id);
  }

  /**
   * Emit an event
   */
  protected emit(event: ProtocolEvent): Promise<void> {
    return this.bus.emit(event);
  }

  // Abstract methods subclasses must implement
  abstract getContext(tier: ContextTier): string;
  abstract getState(): Record<string, unknown>;
  abstract getTemplate(templateKey: string, context: Record<string, unknown>): string | null;

  // Optional methods with default implementations
  getPriorityAction(): PriorityAction | null {
    return null;
  }

  async handleRequest(_request: ModuleRequest): Promise<ModuleResponse> {
    return { success: false, error: 'Not implemented' };
  }
}

// ============================================
// MODULE REGISTRY
// ============================================

export class ModuleRegistry {
  private modules: Map<string, ProtocolModule> = new Map();
  private modulesByCategory: Map<string, ProtocolModule[]> = new Map();

  /**
   * Register a module
   */
  register(module: ProtocolModule): void {
    if (this.modules.has(module.name)) {
      throw new Error(`Module '${module.name}' is already registered`);
    }

    this.modules.set(module.name, module);

    // Add to category index
    const categoryModules = this.modulesByCategory.get(module.category) || [];
    categoryModules.push(module);
    this.modulesByCategory.set(module.category, categoryModules);
  }

  /**
   * Get a module by name
   */
  get(name: string): ProtocolModule | undefined {
    return this.modules.get(name);
  }

  /**
   * Get all modules
   */
  getAll(): ProtocolModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Get modules by category
   */
  getByCategory(category: 'domain' | 'system' | 'relationship'): ProtocolModule[] {
    return this.modulesByCategory.get(category) || [];
  }

  /**
   * Get module names
   */
  getNames(): string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * Check if a module is registered
   */
  has(name: string): boolean {
    return this.modules.has(name);
  }

  /**
   * Initialize all modules
   */
  async initializeAll(bus: EventBus, db: SupabaseClient): Promise<void> {
    const initPromises = Array.from(this.modules.values()).map(
      module => module.initialize(bus, db)
    );
    await Promise.all(initPromises);
  }

  /**
   * Shutdown all modules
   */
  async shutdownAll(): Promise<void> {
    const shutdownPromises = Array.from(this.modules.values()).map(
      module => module.shutdown?.() ?? Promise.resolve()
    );
    await Promise.all(shutdownPromises);
  }

  /**
   * Get composed context from relevant modules
   */
  getComposedContext(
    moduleNames: string[],
    tier: ContextTier
  ): string {
    const contexts: string[] = [];

    for (const name of moduleNames) {
      const module = this.modules.get(name);
      if (module) {
        const ctx = module.getContext(tier);
        if (ctx) {
          contexts.push(`[${module.name}]\n${ctx}`);
        }
      }
    }

    return contexts.join('\n\n');
  }

  /**
   * Get all priority actions across modules
   */
  getPriorityActions(): PriorityAction[] {
    const actions: PriorityAction[] = [];

    for (const module of this.modules.values()) {
      const action = module.getPriorityAction?.();
      if (action) {
        actions.push(action);
      }
    }

    // Sort by priority (critical > high > medium > low)
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return actions;
  }

  /**
   * Get combined state from all modules
   */
  getCombinedState(): Record<string, Record<string, unknown>> {
    const state: Record<string, Record<string, unknown>> = {};

    for (const [name, module] of this.modules) {
      state[name] = module.getState();
    }

    return state;
  }
}
