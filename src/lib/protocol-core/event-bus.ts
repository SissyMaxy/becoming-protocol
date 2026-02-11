/**
 * Protocol Core: Event Bus
 *
 * Central nervous system of the modular architecture.
 * Events flow through. Modules subscribe. Modules emit.
 * The bus doesn't care who listens.
 */

import { supabase } from '../supabase';

// ============================================
// EVENT TYPE DEFINITIONS
// ============================================

export type ProtocolEvent =
  // Task lifecycle
  | { type: 'task:assigned'; taskId: string; domain: string; category: string; source: string }
  | { type: 'task:completed'; taskId: string; domain: string; points: number; evidence?: string }
  | { type: 'task:declined'; taskId: string; domain: string; reason?: string }
  | { type: 'task:abandoned'; taskId: string; minutesElapsed: number }

  // State changes
  | { type: 'state:arousal_changed'; from: number; to: number }
  | { type: 'state:denial_day_changed'; day: number; previousDay: number }
  | { type: 'state:session_started'; sessionType: string; sessionId: string }
  | { type: 'state:session_ended'; sessionId: string; duration: number; edgeCount?: number; peakArousal?: number }
  | { type: 'state:gina_presence_changed'; home: boolean }
  | { type: 'state:mood_logged'; mood: number; energy?: number; anxiety?: number }
  | { type: 'state:exec_function_changed'; from: string; to: string }
  | { type: 'state:streak_changed'; days: number; previousDays: number }

  // Identity
  | { type: 'identity:self_reference'; name: 'maxy' | 'david'; context: string }
  | { type: 'identity:david_surfacing'; indicators: string[] }
  | { type: 'identity:anchor_challenged'; anchor: string; result: string }
  | { type: 'identity:euphoria_logged'; intensity: number; trigger: string }
  | { type: 'identity:dysphoria_logged'; intensity: number; trigger: string }

  // Coercion
  | { type: 'coercion:resistance_detected'; taskId: string; resistanceType: string }
  | { type: 'coercion:escalated'; fromLevel: number; toLevel: number; reason: string }
  | { type: 'coercion:complied'; level: number; taskId: string }
  | { type: 'coercion:episode_started'; episodeId: string; taskId: string }
  | { type: 'coercion:episode_resolved'; episodeId: string; resolution: string; effectiveLevel: number }

  // Vault
  | { type: 'vault:item_captured'; itemId: string; tier: number; capturedDuring: string }
  | { type: 'vault:threat_issued'; threatId: string; itemId: string; deadline: string }
  | { type: 'vault:threat_complied'; threatId: string }
  | { type: 'vault:consequence_fired'; itemId: string; action: string }

  // Capture (vault item creation opportunities)
  | { type: 'capture:vault_item_added'; itemId: string; tier: number }
  | { type: 'capture:opportunity'; context: Record<string, unknown> }

  // Switch (Dead Man's Switch)
  | { type: 'switch:tick'; silenceDays: number; tier: number }
  | { type: 'switch:escalated'; tier: number; payload: string }
  | { type: 'switch:armed'; triggerDays: number }
  | { type: 'switch:reengaged'; daysAbsent: number; financialLost: number }

  // Commitments
  | { type: 'commitment:extracted'; commitmentId: string; text: string; arousalLevel: number; denialDay: number }
  | { type: 'commitment:honored'; commitmentId: string }
  | { type: 'commitment:broken'; commitmentId: string }

  // Domain progress
  | { type: 'domain:level_up'; domain: string; newLevel: number }
  | { type: 'domain:avoided'; domain: string; daysSinceLastPractice: number }
  | { type: 'domain:practiced'; domain: string; minutes: number }

  // Partners
  | { type: 'partner:added'; partnerId: string; alias: string }
  | { type: 'partner:state_changed'; partnerId: string; fromState: string; toState: string }
  | { type: 'partner:message_received'; partnerId: string; content: string }
  | { type: 'partner:meetup_scheduled'; meetupId: string; partnerId: string; partnerAlias: string; scheduledAt: string; initiatedBy: string }
  | { type: 'partner:meetup_completed'; meetupId: string; partnerId: string; partnerAlias: string; meetupNumber: number; safeWordUsed: boolean; reflection?: string }
  | { type: 'partner:relationship_ended'; partnerId: string; reason: string }

  // Findom
  | { type: 'findom:tribute_received'; amount: number; fromAlias: string; pigId: string; totalFromPig: number; tributeCount: number }
  | { type: 'findom:expense_logged'; category: string; amount: number; fundedBy: string }
  | { type: 'findom:pig_added'; pigId: string; alias: string }
  | { type: 'findom:dependency_milestone'; ratio: number; message: string }

  // Schedule
  | { type: 'schedule:morning'; date: string }
  | { type: 'schedule:evening'; date: string }
  | { type: 'schedule:night'; date: string }
  | { type: 'schedule:vulnerability_window'; windowType: string }

  // Handler
  | { type: 'handler:mode_changed'; from: string; to: string; reason: string }
  | { type: 'handler:intervention_fired'; interventionType: string; mode: string }
  | { type: 'handler:briefing_generated'; briefingType: 'morning' | 'evening'; layer: 1 | 2 | 3 }

  // System
  | { type: 'system:initialized'; modules: string[] }
  | { type: 'system:module_registered'; moduleName: string }
  | { type: 'system:error'; module: string; error: string }
  | { type: 'system:budget_warning'; remainingPercent: number };

// Event categories (derived from event type prefix)
export type EventCategory =
  | 'task'
  | 'state'
  | 'identity'
  | 'coercion'
  | 'vault'
  | 'capture'
  | 'switch'
  | 'commitment'
  | 'domain'
  | 'partner'
  | 'findom'
  | 'schedule'
  | 'handler'
  | 'system';

// ============================================
// EVENT BUS CLASS
// ============================================

type EventHandler = (event: ProtocolEvent) => void | Promise<void>;

interface Subscription {
  id: string;
  pattern: string; // 'task:completed', 'task:*', '*'
  handler: EventHandler;
  moduleName?: string;
}

export class EventBus {
  private subscriptions: Subscription[] = [];
  private subscriptionIdCounter = 0;
  private userId: string | null = null;
  private persistEvents = true;
  private eventQueue: ProtocolEvent[] = [];
  private isProcessing = false;

  constructor(options?: { persistEvents?: boolean }) {
    this.persistEvents = options?.persistEvents ?? true;
  }

  /**
   * Set the user ID for event persistence
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Subscribe to a specific event type
   */
  on(eventType: string, handler: EventHandler, moduleName?: string): string {
    const id = `sub_${++this.subscriptionIdCounter}`;
    this.subscriptions.push({
      id,
      pattern: eventType,
      handler,
      moduleName,
    });
    return id;
  }

  /**
   * Subscribe to all events in a category (e.g., 'task:*')
   */
  onCategory(category: EventCategory, handler: EventHandler, moduleName?: string): string {
    return this.on(`${category}:*`, handler, moduleName);
  }

  /**
   * Subscribe to ALL events
   */
  onAll(handler: EventHandler, moduleName?: string): string {
    return this.on('*', handler, moduleName);
  }

  /**
   * Unsubscribe by subscription ID
   */
  off(subscriptionId: string): void {
    this.subscriptions = this.subscriptions.filter(s => s.id !== subscriptionId);
  }

  /**
   * Unsubscribe all handlers from a module
   */
  offModule(moduleName: string): void {
    this.subscriptions = this.subscriptions.filter(s => s.moduleName !== moduleName);
  }

  /**
   * Emit an event
   */
  async emit(event: ProtocolEvent): Promise<void> {
    // Add to queue for sequential processing
    this.eventQueue.push(event);

    // Process queue if not already processing
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  /**
   * Emit multiple events atomically
   */
  async emitBatch(events: ProtocolEvent[]): Promise<void> {
    this.eventQueue.push(...events);

    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  /**
   * Process the event queue
   */
  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      await this.processEvent(event);
    }

    this.isProcessing = false;
  }

  /**
   * Process a single event
   */
  private async processEvent(event: ProtocolEvent): Promise<void> {
    const type = event.type;
    const category = type.split(':')[0] as EventCategory;

    // Find matching subscriptions
    const handlers: EventHandler[] = [];

    for (const sub of this.subscriptions) {
      if (this.matchesPattern(sub.pattern, type, category)) {
        handlers.push(sub.handler);
      }
    }

    // Execute handlers (catch errors to prevent cascade failures)
    const handlerPromises = handlers.map(async (handler) => {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[EventBus] Handler error for ${type}:`, error);
        // Emit system error event (but don't recurse)
        if (type !== 'system:error') {
          this.eventQueue.push({
            type: 'system:error',
            module: 'event-bus',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    await Promise.all(handlerPromises);

    // Persist event to database (async, don't block)
    if (this.persistEvents && this.userId) {
      this.persistEvent(event).catch(err => {
        console.error('[EventBus] Failed to persist event:', err);
      });
    }
  }

  /**
   * Check if a subscription pattern matches an event
   */
  private matchesPattern(pattern: string, eventType: string, category: string): boolean {
    // Global wildcard
    if (pattern === '*') return true;

    // Category wildcard (e.g., 'task:*')
    if (pattern.endsWith(':*')) {
      const patternCategory = pattern.slice(0, -2);
      return patternCategory === category;
    }

    // Exact match
    return pattern === eventType;
  }

  /**
   * Persist event to Supabase
   */
  private async persistEvent(event: ProtocolEvent): Promise<void> {
    if (!this.userId) return;

    const { error } = await supabase.from('event_log').insert({
      user_id: this.userId,
      event_type: event.type,
      payload: event,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[EventBus] Persistence error:', error);
    }
  }

  /**
   * Query historical events
   */
  async queryEvents(options: {
    types?: string[];
    category?: EventCategory;
    since?: Date;
    until?: Date;
    limit?: number;
  }): Promise<ProtocolEvent[]> {
    if (!this.userId) return [];

    let query = supabase
      .from('event_log')
      .select('payload')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false });

    if (options.types && options.types.length > 0) {
      query = query.in('event_type', options.types);
    }

    if (options.category) {
      query = query.like('event_type', `${options.category}:%`);
    }

    if (options.since) {
      query = query.gte('created_at', options.since.toISOString());
    }

    if (options.until) {
      query = query.lte('created_at', options.until.toISOString());
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[EventBus] Query error:', error);
      return [];
    }

    return (data || []).map(row => row.payload as ProtocolEvent);
  }

  /**
   * Get event counts by type (for analytics)
   */
  async getEventCounts(options: {
    since?: Date;
    until?: Date;
    groupBy?: 'type' | 'category';
  }): Promise<Record<string, number>> {
    if (!this.userId) return {};

    // This would ideally be a database aggregation, but for now we'll do it client-side
    const events = await this.queryEvents({
      since: options.since,
      until: options.until,
      limit: 10000,
    });

    const counts: Record<string, number> = {};

    for (const event of events) {
      const key = options.groupBy === 'category'
        ? event.type.split(':')[0]
        : event.type;

      counts[key] = (counts[key] || 0) + 1;
    }

    return counts;
  }

  /**
   * Get subscription count (for debugging)
   */
  getSubscriptionCount(): number {
    return this.subscriptions.length;
  }

  /**
   * Clear all subscriptions (for testing)
   */
  clearSubscriptions(): void {
    this.subscriptions = [];
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let busInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!busInstance) {
    busInstance = new EventBus();
  }
  return busInstance;
}

export function createEventBus(options?: { persistEvents?: boolean }): EventBus {
  return new EventBus(options);
}

// ============================================
// HELPER: Extract event category
// ============================================

export function getEventCategory(event: ProtocolEvent): EventCategory {
  return event.type.split(':')[0] as EventCategory;
}
