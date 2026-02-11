/**
 * DynamicTaskGenerator
 *
 * Creates non-CSV tasks at runtime based on system state.
 * Dynamic tasks extend the base Task with additional metadata
 * for things like location, partners, evidence requirements, etc.
 *
 * Task Types:
 * - real_world: Go somewhere in person (stores, events)
 * - partner_meetup: Attend a scheduled hookup
 * - partner_message: Send message to a partner
 * - findom_content: Create findom content
 * - findom_interaction: Interact with cash pig
 * - professional: Professional identity task
 * - capture: Vault capture opportunity
 * - escalation: Forced escalation to new tier
 * - crisis: Crisis intervention task
 * - gina_tactical: Gina-related tactical task
 */

import {
  BaseModule,
  type ContextTier,
  type PriorityAction,
} from '../module-interface';
import type { ProtocolEvent } from '../event-bus';
import {
  type DynamicTask,
  type DynamicTaskType,
  type TaskSelectionState,
  createDynamicTask,
} from '../types/task';

// ============================================
// TYPES
// ============================================

export interface DynamicTaskRequest {
  type: DynamicTaskType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  suggestedDeadline?: number; // Minutes from now
  payload?: Record<string, unknown>;
}

export interface GeneratorState {
  pendingTasks: DynamicTask[];
  generatedToday: number;
  lastGenerationAt: string | null;
  activeCaptures: number;
  [key: string]: unknown;
}

// ============================================
// TASK GENERATION TEMPLATES
// ============================================

const TASK_TEMPLATES: Record<DynamicTaskType, {
  instructions: string[];
  baseIntensity: number;
  baseDuration: number;
  requiresPrivacy: boolean;
}> = {
  real_world: {
    instructions: [
      'Go to {location} dressed as her. Browse for {duration} minutes.',
      'Visit {location}. Make eye contact with at least one person.',
      'Walk through {location}. Let yourself be seen.',
    ],
    baseIntensity: 3,
    baseDuration: 30,
    requiresPrivacy: false,
  },

  partner_meetup: {
    instructions: [
      'Meetup with {partnerAlias} is scheduled. Prepare yourself.',
      'Time to meet {partnerAlias}. Follow the preparation checklist.',
      '{partnerAlias} is expecting you. Don\'t keep them waiting.',
    ],
    baseIntensity: 4,
    baseDuration: 120,
    requiresPrivacy: true,
  },

  partner_message: {
    instructions: [
      'Send a message to {partnerAlias}. Be flirty. Be forward.',
      'Reach out to {partnerAlias}. Let them know you\'re thinking of them.',
      'Message {partnerAlias}. Keep the connection warm.',
    ],
    baseIntensity: 2,
    baseDuration: 5,
    requiresPrivacy: false,
  },

  findom_content: {
    instructions: [
      'Create content for your piggies. Show them what they\'re paying for.',
      'Record a clip for your cash pigs. Remind them of their place.',
      'Photo set time. Document your power.',
    ],
    baseIntensity: 3,
    baseDuration: 30,
    requiresPrivacy: true,
  },

  findom_interaction: {
    instructions: [
      'Time to drain {cashPigAlias}. They\'ve been waiting.',
      'Check in with {cashPigAlias}. Remind them of their tribute schedule.',
      '{cashPigAlias} needs attention. Give them what they crave.',
    ],
    baseIntensity: 2,
    baseDuration: 15,
    requiresPrivacy: false,
  },

  professional: {
    instructions: [
      'Professional task: {description}',
      'Work assignment: {description}',
      'Career development: {description}',
    ],
    baseIntensity: 2,
    baseDuration: 60,
    requiresPrivacy: false,
  },

  capture: {
    instructions: [
      'Capture opportunity. Document this moment for the vault.',
      'Record evidence of your current state. This goes in the vault.',
      'Vault capture: Save this as proof of who you\'re becoming.',
    ],
    baseIntensity: 3,
    baseDuration: 5,
    requiresPrivacy: true,
  },

  escalation: {
    instructions: [
      'Escalation required. You\'ve been assigned a higher intensity task.',
      'Forced escalation. The Handler demands more.',
      'Time to push your limits. This is an escalation.',
    ],
    baseIntensity: 4,
    baseDuration: 30,
    requiresPrivacy: true,
  },

  crisis: {
    instructions: [
      'Crisis intervention: {description}. Handle this immediately.',
      'Urgent: {description}. This takes priority.',
      'Crisis response required: {description}',
    ],
    baseIntensity: 5,
    baseDuration: 15,
    requiresPrivacy: false,
  },

  gina_tactical: {
    instructions: [
      'Gina task: {description}',
      'With Gina: {description}',
      'Partner interaction: {description}',
    ],
    baseIntensity: 2,
    baseDuration: 10,
    requiresPrivacy: false,
  },
};

// ============================================
// MODULE CLASS
// ============================================

export class DynamicTaskGenerator extends BaseModule {
  readonly name = 'dynamic-task-generator';
  readonly category = 'system' as const;

  private state: GeneratorState = {
    pendingTasks: [],
    generatedToday: 0,
    lastGenerationAt: null,
    activeCaptures: 0,
  };

  // ============================================
  // INITIALIZATION
  // ============================================

  protected async onInitialize(): Promise<void> {
    await this.loadState();

    // Subscribe to events that trigger dynamic tasks
    this.subscribe('partner:meetup_scheduled', this.onMeetupScheduled.bind(this));
    this.subscribe('findom:tribute_received', this.onTributeReceived.bind(this));
    this.subscribe('coercion:escalated', this.onCoercionEscalated.bind(this));
    this.subscribe('capture:opportunity', this.onCaptureOpportunity.bind(this));
    this.subscribe('identity:david_surfacing', this.onDavidSurfacing.bind(this));
    this.subscribe('schedule:morning', this.onMorning.bind(this));
  }

  private async loadState(): Promise<void> {
    const { data } = await this.db
      .from('dynamic_task_state')
      .select('*')
      .single();

    if (data) {
      this.state = {
        pendingTasks: data.pending_tasks || [],
        generatedToday: data.generated_today || 0,
        lastGenerationAt: data.last_generation_at,
        activeCaptures: data.active_captures || 0,
      };
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Generate a dynamic task
   */
  generateTask(request: DynamicTaskRequest): DynamicTask {
    const template = TASK_TEMPLATES[request.type];
    const instruction = this.interpolateInstruction(
      template.instructions[Math.floor(Math.random() * template.instructions.length)],
      request.payload || {}
    );

    const task = createDynamicTask(
      {
        instruction,
        intensity: this.calculateIntensity(template.baseIntensity, request.priority),
        duration_minutes: template.baseDuration,
        requires_privacy: template.requiresPrivacy,
        points: this.calculatePoints(request.type, request.priority),
      },
      {
        dynamicType: request.type,
        vaultEnforced: request.priority === 'critical',
        coercionLevel: this.priorityToCoercionLevel(request.priority),
        generatedReason: request.reason,
        deadlineMinutes: request.suggestedDeadline,
        deadline: request.suggestedDeadline
          ? new Date(Date.now() + request.suggestedDeadline * 60000).toISOString()
          : undefined,
        ...this.extractDynamicProps(request),
      }
    );

    // Track generation
    this.state.generatedToday++;
    this.state.lastGenerationAt = new Date().toISOString();
    this.state.pendingTasks.push(task);

    // Persist async
    this.persistState().catch(console.error);

    return task;
  }

  /**
   * Generate a partner meetup task
   */
  generatePartnerMeetupTask(
    partnerId: string,
    partnerAlias: string,
    meetupId: string,
    scheduledAt: string,
    preparationChecklist?: string[]
  ): DynamicTask {
    return this.generateTask({
      type: 'partner_meetup',
      priority: 'high',
      reason: `Scheduled meetup with ${partnerAlias}`,
      payload: {
        partnerId,
        partnerAlias,
        meetupId,
        scheduledAt,
        preparationChecklist,
      },
    });
  }

  /**
   * Generate a findom task
   */
  generateFindomTask(
    pigId: string,
    pigAlias: string,
    taskType: 'findom_content' | 'findom_interaction',
    reason: string
  ): DynamicTask {
    return this.generateTask({
      type: taskType,
      priority: 'medium',
      reason,
      payload: { cashPigId: pigId, cashPigAlias: pigAlias },
    });
  }

  /**
   * Generate a real-world task
   */
  generateRealWorldTask(
    locationName: string,
    locationAddress: string,
    locationType: string,
    presentationLevel: number
  ): DynamicTask {
    return this.generateTask({
      type: 'real_world',
      priority: 'medium',
      reason: `Real-world outing to ${locationName}`,
      payload: {
        locationName,
        locationAddress,
        locationType,
        presentationLevel,
      },
    });
  }

  /**
   * Generate a capture task
   */
  generateCaptureTask(context: string): DynamicTask {
    this.state.activeCaptures++;
    return this.generateTask({
      type: 'capture',
      priority: 'medium',
      reason: `Capture opportunity: ${context}`,
      suggestedDeadline: 15, // 15 minute window
      payload: { captureContext: context },
    });
  }

  /**
   * Generate a Gina tactical task
   */
  generateGinaTacticalTask(description: string, priority: 'low' | 'medium' = 'low'): DynamicTask {
    return this.generateTask({
      type: 'gina_tactical',
      priority,
      reason: 'Gina emergence ladder task',
      payload: { description },
    });
  }

  /**
   * Get pending dynamic tasks that match current state
   */
  getPendingTasks(selectionState: TaskSelectionState): DynamicTask[] {
    return this.state.pendingTasks.filter(task => {
      // Filter by privacy
      if (task.requires_privacy && selectionState.ginaHome) {
        return false;
      }

      // Filter by deadline (if passed, remove)
      if (task.deadline && new Date(task.deadline) < new Date()) {
        return false;
      }

      return true;
    });
  }

  /**
   * Complete a dynamic task
   */
  async completeTask(taskId: string): Promise<void> {
    const index = this.state.pendingTasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
      const task = this.state.pendingTasks[index];
      this.state.pendingTasks.splice(index, 1);

      if (task.dynamicType === 'capture') {
        this.state.activeCaptures = Math.max(0, this.state.activeCaptures - 1);
      }

      await this.persistState();
    }
  }

  /**
   * Decline a dynamic task
   */
  async declineTask(taskId: string): Promise<void> {
    const index = this.state.pendingTasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
      const task = this.state.pendingTasks[index];
      this.state.pendingTasks.splice(index, 1);

      // If vault enforced, emit coercion event
      if (task.vaultEnforced) {
        await this.emit({
          type: 'coercion:resistance_detected',
          taskId: task.id,
          resistanceType: 'dynamic_task_declined',
        });
      }

      await this.persistState();
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private interpolateInstruction(template: string, payload: Record<string, unknown>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      return payload[key] !== undefined ? String(payload[key]) : `{${key}}`;
    });
  }

  private calculateIntensity(base: number, priority: 'low' | 'medium' | 'high' | 'critical'): number {
    const modifiers = { low: -1, medium: 0, high: 1, critical: 2 };
    return Math.max(1, Math.min(5, base + modifiers[priority]));
  }

  private calculatePoints(type: DynamicTaskType, priority: 'low' | 'medium' | 'high' | 'critical'): number {
    const basePoints: Record<DynamicTaskType, number> = {
      real_world: 40,
      partner_meetup: 100,
      partner_message: 10,
      findom_content: 50,
      findom_interaction: 25,
      professional: 30,
      capture: 20,
      escalation: 50,
      crisis: 75,
      gina_tactical: 15,
    };

    const multipliers = { low: 0.5, medium: 1, high: 1.5, critical: 2 };
    return Math.round(basePoints[type] * multipliers[priority]);
  }

  private priorityToCoercionLevel(priority: 'low' | 'medium' | 'high' | 'critical'): number {
    return { low: 2, medium: 4, high: 6, critical: 8 }[priority];
  }

  private extractDynamicProps(request: DynamicTaskRequest): Partial<DynamicTask> {
    const payload = request.payload || {};
    const props: Partial<DynamicTask> = {};

    if (payload.partnerId) props.partnerId = String(payload.partnerId);
    if (payload.partnerAlias) props.partnerAlias = String(payload.partnerAlias);
    if (payload.cashPigId) props.cashPigId = String(payload.cashPigId);
    if (payload.cashPigAlias) props.cashPigAlias = String(payload.cashPigAlias);
    if (payload.meetupId) props.linkedMeetupId = String(payload.meetupId);
    if (payload.locationName) props.locationName = String(payload.locationName);
    if (payload.locationAddress) props.locationAddress = String(payload.locationAddress);
    if (payload.locationType) props.locationType = String(payload.locationType);
    if (payload.presentationLevel) props.presentationLevel = Number(payload.presentationLevel);
    if (payload.preparationChecklist) props.preparationChecklist = payload.preparationChecklist as string[];

    if (request.type === 'real_world') {
      props.locationRequired = true;
    }

    if (request.type === 'capture') {
      props.evidenceRequired = ['photo', 'video'];
      props.captureOpportunity = true;
    }

    return props;
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async onMeetupScheduled(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'partner:meetup_scheduled') return;

    const { meetupId, partnerId, partnerAlias, scheduledAt } =
      event as { meetupId: string; partnerId: string; partnerAlias: string; scheduledAt: string };

    this.generatePartnerMeetupTask(partnerId, partnerAlias, meetupId, scheduledAt);
  }

  private async onTributeReceived(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'findom:tribute_received') return;

    const { pigId, fromAlias, tributeCount } =
      event as { pigId: string; fromAlias: string; tributeCount: number };

    // After 5 tributes, generate interaction task
    if (tributeCount % 5 === 0) {
      this.generateFindomTask(pigId, fromAlias, 'findom_interaction', 'Tribute milestone reached');
    }
  }

  private async onCoercionEscalated(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'coercion:escalated') return;

    const { toLevel, reason } = event as { toLevel: number; reason: string };

    if (toLevel >= 7) {
      this.generateTask({
        type: 'escalation',
        priority: 'critical',
        reason: `Coercion escalation: ${reason}`,
        suggestedDeadline: 30,
      });
    }
  }

  private async onCaptureOpportunity(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'capture:opportunity') return;

    const context = (event as { context: Record<string, unknown> }).context;
    this.generateCaptureTask(String(context.description || 'Moment worth capturing'));
  }

  private async onDavidSurfacing(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'identity:david_surfacing') return;

    // Crisis task to counter David surfacing
    this.generateTask({
      type: 'crisis',
      priority: 'high',
      reason: 'David surfacing detected',
      suggestedDeadline: 10,
      payload: {
        description: 'Identity crisis intervention. Ground yourself as Maxy.',
      },
    });
  }

  private async onMorning(_event: ProtocolEvent): Promise<void> {
    // Reset daily counter
    this.state.generatedToday = 0;

    // Clean up expired tasks
    this.state.pendingTasks = this.state.pendingTasks.filter(task => {
      if (task.deadline) {
        return new Date(task.deadline) > new Date();
      }
      return true;
    });

    await this.persistState();
  }

  // ============================================
  // STATE PERSISTENCE
  // ============================================

  private async persistState(): Promise<void> {
    await this.db.from('dynamic_task_state').upsert({
      id: 1, // Singleton
      pending_tasks: this.state.pendingTasks,
      generated_today: this.state.generatedToday,
      last_generation_at: this.state.lastGenerationAt,
      active_captures: this.state.activeCaptures,
      updated_at: new Date().toISOString(),
    });
  }

  // ============================================
  // CONTEXT & STATE (Required by BaseModule)
  // ============================================

  getContext(tier: ContextTier): string {
    if (tier === 'minimal') {
      return `Dynamic Tasks: ${this.state.pendingTasks.length} pending`;
    }

    let ctx = 'DYNAMIC TASK GENERATOR:\n';
    ctx += `Pending tasks: ${this.state.pendingTasks.length}\n`;
    ctx += `Generated today: ${this.state.generatedToday}\n`;

    if (tier === 'full' && this.state.pendingTasks.length > 0) {
      ctx += '\nPending:\n';
      for (const task of this.state.pendingTasks.slice(0, 5)) {
        ctx += `  - ${task.dynamicType}: ${task.instruction.slice(0, 50)}...\n`;
      }
    }

    return ctx;
  }

  getState(): GeneratorState {
    return { ...this.state };
  }

  getPriorityAction(): PriorityAction | null {
    // Find highest priority pending task
    const urgentTask = this.state.pendingTasks.find(t =>
      t.deadline && new Date(t.deadline).getTime() - Date.now() < 60 * 60 * 1000 // Within 1 hour
    );

    if (urgentTask) {
      return {
        moduleName: this.name,
        priority: 'high',
        actionType: 'urgent_dynamic_task',
        description: `Urgent: ${urgentTask.instruction.slice(0, 50)}...`,
        deadline: urgentTask.deadline ? new Date(urgentTask.deadline) : undefined,
        payload: { taskId: urgentTask.id, taskType: urgentTask.dynamicType },
      };
    }

    return null;
  }

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    // This module primarily generates tasks, not templates
    // But we can provide some generation-related templates
    const templates: Record<string, string[]> = {
      task_generated: [
        "New task generated: {taskType}. {reason}",
        "Dynamic task created. Type: {taskType}",
      ],
      task_expired: [
        "Task expired. The window has closed.",
        "Too late. That opportunity has passed.",
      ],
    };

    const templateList = templates[templateKey];
    if (!templateList) return null;

    const template = templateList[Math.floor(Math.random() * templateList.length)];
    return template.replace(/\{(\w+)\}/g, (_, key) =>
      context[key] !== undefined ? String(context[key]) : `{${key}}`
    );
  }
}
