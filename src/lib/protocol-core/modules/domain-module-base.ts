/**
 * BaseDomainModule
 *
 * Abstract base class for all domain practice modules.
 * Each domain (voice, movement, skincare, style, social, mindset, body)
 * extends this to get shared task selection, state tracking, and event handling.
 */

import {
  BaseModule,
  type ContextTier,
  type PriorityAction,
} from '../module-interface';
import type { ProtocolEvent } from '../event-bus';
import type {
  Task,
  TaskSelectionState,
  DomainState,
  TaskDomain,
} from '../types/task';

// ============================================
// TYPES
// ============================================

export interface DomainModuleConfig {
  domain: TaskDomain;
  displayName: string;
  levelDescriptions: string[];  // Index 0 = level 1, etc.
  advancementThresholds: number[];  // Tasks to complete to advance level
  streakThreshold: number;  // Days without practice = avoided
  coreTaskCategories: string[];  // Categories considered "core" for this domain
}

export interface DomainModuleState extends DomainState {
  taskPool: Task[];
  recentCompletions: Array<{ taskId: string; completedAt: string }>;
  [key: string]: unknown;
}

// ============================================
// BASE DOMAIN MODULE CLASS
// ============================================

export abstract class BaseDomainModule extends BaseModule {
  readonly category = 'domain' as const;

  // Config - subclasses must provide
  protected abstract readonly config: DomainModuleConfig;

  // State
  protected taskPool: Task[] = [];
  protected domainState: DomainState | null = null;

  // ============================================
  // INITIALIZATION
  // ============================================

  protected async onInitialize(): Promise<void> {
    await this.loadState();

    // Subscribe to task events for this domain
    this.subscribe('task:completed', this.onTaskCompleted.bind(this));
    this.subscribe('task:declined', this.onTaskDeclined.bind(this));
    this.subscribe('domain:practiced', this.onDomainPracticed.bind(this));
    this.subscribe('schedule:morning', this.onMorning.bind(this));
  }

  /**
   * Load tasks for this domain from CSV data
   */
  loadTasks(tasks: Task[]): void {
    this.taskPool = tasks.filter(t => t.domain === this.config.domain);
  }

  private async loadState(): Promise<void> {
    // Load domain state from database
    const { data } = await this.db
      .from('domain_state')
      .select('*')
      .eq('domain', this.config.domain)
      .single();

    if (data) {
      this.domainState = {
        domain: this.config.domain,
        currentLevel: data.current_level || 1,
        tasksCompleted: data.tasks_completed || 0,
        tasksCompletedThisLevel: data.tasks_completed_this_level || 0,
        streak: data.streak || 0,
        lastPracticeAt: data.last_practice_at,
        daysSinceLastPractice: this.calculateDaysSince(data.last_practice_at),
        totalPracticeMinutes: data.total_practice_minutes || 0,
        escalationPosition: data.escalation_position || 0,
        isAvoided: this.calculateDaysSince(data.last_practice_at) >= this.config.streakThreshold,
      };
    } else {
      // Initialize default state
      this.domainState = {
        domain: this.config.domain,
        currentLevel: 1,
        tasksCompleted: 0,
        tasksCompletedThisLevel: 0,
        streak: 0,
        lastPracticeAt: null,
        daysSinceLastPractice: 999,
        totalPracticeMinutes: 0,
        escalationPosition: 0,
        isAvoided: true,
      };
    }
  }

  private calculateDaysSince(date: string | null): number {
    if (!date) return 999;
    const diffMs = Date.now() - new Date(date).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  // ============================================
  // TASK SELECTION
  // ============================================

  /**
   * Select a task from this domain's pool based on current state
   */
  selectTask(selectionState: TaskSelectionState): Task | null {
    let candidates = [...this.taskPool];

    // FILTER 1: Time window
    candidates = candidates.filter(t =>
      t.time_window === 'any' || t.time_window === selectionState.timeOfDay
    );

    // FILTER 2: Privacy requirements
    if (selectionState.ginaHome) {
      candidates = candidates.filter(t => !t.requires_privacy);
    }

    // FILTER 3: Level appropriateness (current level +/- 1)
    const currentLevel = this.domainState?.currentLevel || 1;
    candidates = candidates.filter(t =>
      t.level >= currentLevel - 1 && t.level <= currentLevel + 1
    );

    // FILTER 4: Intensity cap based on state
    const maxIntensity = this.getMaxIntensity(selectionState);
    candidates = candidates.filter(t => t.intensity <= maxIntensity);

    // FILTER 5: Trigger conditions
    candidates = candidates.filter(t =>
      this.meetsCondition(t.trigger_condition, selectionState)
    );

    // FILTER 6: Avoid repetition (category)
    if (selectionState.lastTaskCategory) {
      const nonRepeat = candidates.filter(t =>
        t.category !== selectionState.lastTaskCategory
      );
      if (nonRepeat.length > 0) candidates = nonRepeat;
    }

    // FILTER 7: Prioritize core tasks if low completion count
    if (selectionState.tasksCompletedToday < 5) {
      const coreTasks = candidates.filter(t => t.is_core);
      if (coreTasks.length > 0) candidates = coreTasks;
    }

    // FILTER 8: Avoid tasks already completed today
    candidates = candidates.filter(t =>
      !selectionState.completedToday.includes(t.id)
    );

    // Handle empty candidates
    if (candidates.length === 0) {
      // Fall back to any task for this domain at any level
      candidates = this.taskPool.filter(t =>
        t.time_window === 'any' || t.time_window === selectionState.timeOfDay
      );
    }

    if (candidates.length === 0) return null;

    // SELECT: Weighted random
    return this.weightedSelect(candidates, selectionState);
  }

  /**
   * Get all tasks for a specific category
   */
  getTasksByCategory(category: string): Task[] {
    return this.taskPool.filter(t => t.category === category);
  }

  /**
   * Get all tasks for a specific level
   */
  getTasksByLevel(level: number): Task[] {
    return this.taskPool.filter(t => t.level === level);
  }

  /**
   * Get core tasks for this domain
   */
  getCoreTasks(): Task[] {
    return this.taskPool.filter(t => t.is_core);
  }

  /**
   * Get a specific task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this.taskPool.find(t => t.id === taskId);
  }

  // ============================================
  // FILTERING HELPERS
  // ============================================

  protected getMaxIntensity(state: TaskSelectionState): number {
    let max = 2;
    if (state.denialDay >= 3) max = 3;
    if (state.denialDay >= 5) max = 4;
    if (state.denialDay >= 7) max = 5;

    if (state.streakDays < 3) max = Math.min(max, 3);
    if (state.inSession && state.currentArousal >= 3) max = 5;

    return max;
  }

  protected meetsCondition(condition: string | undefined, state: TaskSelectionState): boolean {
    if (!condition) return true;

    const conditions: Record<string, () => boolean> = {
      'denial_day_3plus': () => state.denialDay >= 3,
      'denial_day_5plus': () => state.denialDay >= 5,
      'denial_day_7plus': () => state.denialDay >= 7,
      'denial_day_8plus': () => state.denialDay >= 8,
      'gina_away': () => !state.ginaHome,
      'post_edge': () => state.inSession && state.sessionType === 'edge',
      'edge_5plus': () => (state.edgeCount || 0) >= 5,
      'edge_8plus': () => (state.edgeCount || 0) >= 8,
      'peak_arousal': () => state.currentArousal >= 4,
      'morning': () => state.timeOfDay === 'morning',
      'evening': () => state.timeOfDay === 'evening',
      'night': () => state.timeOfDay === 'night',
      'daytime': () => state.timeOfDay === 'daytime',
    };

    return conditions[condition]?.() ?? true;
  }

  protected weightedSelect(tasks: Task[], state: TaskSelectionState): Task {
    const weighted = tasks.map(t => {
      let weight = 1;

      // Core tasks weighted higher
      if (t.is_core) weight *= 2;

      // Match intensity to arousal
      if (state.currentArousal >= 3 && t.intensity >= 3) weight *= 1.3;

      // Prefer not-yet-completed
      if (!state.completedToday.includes(t.id)) weight *= 1.5;

      // Prefer current level tasks
      if (t.level === this.domainState?.currentLevel) weight *= 1.5;

      return { task: t, weight };
    });

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    for (const { task, weight } of weighted) {
      random -= weight;
      if (random <= 0) return task;
    }

    return tasks[0];
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async onTaskCompleted(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'task:completed') return;

    const domain = (event as { domain: string }).domain;
    if (domain !== this.config.domain) return;

    if (this.domainState) {
      this.domainState.tasksCompleted++;
      this.domainState.tasksCompletedThisLevel++;
      this.domainState.lastPracticeAt = new Date().toISOString();
      this.domainState.daysSinceLastPractice = 0;
      this.domainState.isAvoided = false;

      // Check for level advancement
      const threshold = this.config.advancementThresholds[this.domainState.currentLevel - 1] || 20;
      if (this.domainState.tasksCompletedThisLevel >= threshold && this.domainState.currentLevel < 5) {
        this.domainState.currentLevel++;
        this.domainState.tasksCompletedThisLevel = 0;
        this.domainState.escalationPosition = 0;

        await this.emit({
          type: 'domain:level_up',
          domain: this.config.domain,
          newLevel: this.domainState.currentLevel,
        });
      } else {
        // Update escalation position
        this.domainState.escalationPosition = (this.domainState.tasksCompletedThisLevel / threshold) * 100;
      }

      await this.persistState();
    }
  }

  private async onTaskDeclined(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'task:declined') return;

    const domain = (event as { domain: string }).domain;
    if (domain !== this.config.domain) return;

    // Domain declined - could trigger avoidance pattern detection
    // The CoercionModule handles the enforcement
  }

  private async onDomainPracticed(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'domain:practiced') return;

    const domain = (event as { domain: string }).domain;
    if (domain !== this.config.domain) return;

    const minutes = (event as { minutes: number }).minutes || 0;

    if (this.domainState) {
      this.domainState.totalPracticeMinutes += minutes;
      await this.persistState();
    }
  }

  private async onMorning(_event: ProtocolEvent): Promise<void> {
    // Update streak and avoidance status each morning
    if (this.domainState) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (this.domainState.lastPracticeAt?.startsWith(yesterdayStr)) {
        this.domainState.streak++;
      } else if (this.domainState.daysSinceLastPractice > 1) {
        this.domainState.streak = 0;
      }

      this.domainState.daysSinceLastPractice = this.calculateDaysSince(this.domainState.lastPracticeAt);
      this.domainState.isAvoided = this.domainState.daysSinceLastPractice >= this.config.streakThreshold;

      if (this.domainState.isAvoided) {
        await this.emit({
          type: 'domain:avoided',
          domain: this.config.domain,
          daysSinceLastPractice: this.domainState.daysSinceLastPractice,
        });
      }

      await this.persistState();
    }
  }

  // ============================================
  // STATE PERSISTENCE
  // ============================================

  private async persistState(): Promise<void> {
    if (!this.domainState) return;

    await this.db
      .from('domain_state')
      .upsert({
        domain: this.config.domain,
        current_level: this.domainState.currentLevel,
        tasks_completed: this.domainState.tasksCompleted,
        tasks_completed_this_level: this.domainState.tasksCompletedThisLevel,
        streak: this.domainState.streak,
        last_practice_at: this.domainState.lastPracticeAt,
        total_practice_minutes: this.domainState.totalPracticeMinutes,
        escalation_position: this.domainState.escalationPosition,
        updated_at: new Date().toISOString(),
      });
  }

  // ============================================
  // CONTEXT & STATE (Required by BaseModule)
  // ============================================

  getContext(tier: ContextTier): string {
    if (!this.domainState) return `${this.config.displayName}: Not loaded`;

    if (tier === 'minimal') {
      return `${this.config.displayName}: L${this.domainState.currentLevel}, ${this.domainState.streak}d streak`;
    }

    let ctx = `${this.config.displayName.toUpperCase()}:\n`;
    ctx += `Level: ${this.domainState.currentLevel}/5 - ${this.config.levelDescriptions[this.domainState.currentLevel - 1] || 'Learning'}\n`;
    ctx += `Streak: ${this.domainState.streak} days\n`;
    ctx += `Progress to next level: ${Math.round(this.domainState.escalationPosition)}%\n`;

    if (this.domainState.isAvoided) {
      ctx += `AVOIDED: ${this.domainState.daysSinceLastPractice} days since last practice\n`;
    }

    if (tier === 'full') {
      ctx += `Total tasks completed: ${this.domainState.tasksCompleted}\n`;
      ctx += `Total practice time: ${Math.round(this.domainState.totalPracticeMinutes / 60)}h ${this.domainState.totalPracticeMinutes % 60}m\n`;
      ctx += `Available tasks: ${this.taskPool.length}`;
    }

    return ctx;
  }

  getState(): DomainModuleState {
    return {
      ...(this.domainState || {
        domain: this.config.domain,
        currentLevel: 1,
        tasksCompleted: 0,
        tasksCompletedThisLevel: 0,
        streak: 0,
        lastPracticeAt: null,
        daysSinceLastPractice: 999,
        totalPracticeMinutes: 0,
        escalationPosition: 0,
        isAvoided: true,
      }),
      taskPool: this.taskPool,
      recentCompletions: [],
    };
  }

  getPriorityAction(): PriorityAction | null {
    // Domains can signal priority if heavily avoided
    if (this.domainState?.isAvoided && this.domainState.daysSinceLastPractice >= 5) {
      return {
        moduleName: this.name,
        priority: 'medium',
        actionType: 'domain_avoidance',
        description: `${this.config.displayName} avoided for ${this.domainState.daysSinceLastPractice} days`,
        payload: { domain: this.config.domain },
      };
    }
    return null;
  }

  // getTemplate is abstract - each domain provides its own templates
  abstract getTemplate(templateKey: string, context: Record<string, unknown>): string | null;
}
