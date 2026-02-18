// Handler Implementation for Becoming Protocol
// TypeScript - Ready for integration with React/Supabase

import Anthropic from '@anthropic-ai/sdk';

// ============================================
// TYPES
// ============================================

export interface UserState {
  // Identity
  odometer: 'survival' | 'caution' | 'coasting' | 'progress' | 'momentum' | 'breakthrough';
  denialDay: number;
  streakDays: number;
  
  // Temporal
  timeOfDay: 'morning' | 'daytime' | 'evening' | 'night';
  minutesSinceLastTask: number;
  tasksCompletedToday: number;
  
  // Context
  ginaHome: boolean;
  currentArousal: 0 | 1 | 2 | 3 | 4 | 5;
  inSession: boolean;
  sessionType?: 'edge' | 'goon' | 'hypno';
  edgeCount?: number;
  
  // History
  lastTaskCategory: string;
  lastTaskDomain: string;
  completedToday: string[];
  avoidedDomains: string[];
  
  // Gina
  ginaVisibilityLevel: number;
  lastGinaIncident?: Date;
  pendingGinaCommitment?: string;
}

export interface Task {
  id: string;
  category: string;
  domain: string;
  intensity: number;
  instruction: string;
  subtext: string;
  completion_type: 'binary' | 'duration' | 'count';
  duration_minutes?: number;
  target_count?: number;
  points: number;
  affirmation: string;
  is_core: boolean;
  trigger_condition?: string;
  time_window: 'morning' | 'daytime' | 'evening' | 'night' | 'any';
  requires_privacy?: boolean;
}

export interface ScheduledTask {
  time: string;
  task: Task;
  required: boolean;
  flexible?: boolean;
}

export interface TemplateVariation {
  id: string;
  instruction: string;
  subtext: string;
  affirmation: string;
  conditions?: {
    minDenialDay?: number;
    maxDenialDay?: number;
    requiresHighArousal?: boolean;
    timeOfDay?: string[];
  };
}

// ============================================
// LAYER 1: RULES ENGINE (Free)
// ============================================

export class RulesEngine {
  private tasks: Task[];
  
  constructor(tasks: Task[]) {
    this.tasks = tasks;
  }
  
  selectTask(state: UserState): Task {
    let candidates = [...this.tasks];
    
    // FILTER 1: Time window
    candidates = candidates.filter(t => 
      t.time_window === 'any' || t.time_window === state.timeOfDay
    );
    
    // FILTER 2: Privacy requirements
    if (state.ginaHome) {
      candidates = candidates.filter(t => !t.requires_privacy);
    }
    
    // FILTER 3: Intensity cap by denial day
    const maxIntensity = this.getMaxIntensity(state);
    candidates = candidates.filter(t => t.intensity <= maxIntensity);
    
    // FILTER 4: Trigger conditions
    candidates = candidates.filter(t => 
      this.meetsCondition(t.trigger_condition, state)
    );
    
    // FILTER 5: Avoid repetition
    candidates = candidates.filter(t => 
      t.category !== state.lastTaskCategory
    );
    
    // FILTER 6: Domain balance (prefer avoided domains)
    candidates = this.prioritizeAvoidedDomains(candidates, state);
    
    // FILTER 7: Core tasks if not enough done today
    if (state.tasksCompletedToday < 5) {
      const coreTasks = candidates.filter(t => t.is_core);
      if (coreTasks.length > 0) candidates = coreTasks;
    }
    
    // Handle empty candidates
    if (candidates.length === 0) {
      candidates = this.tasks.filter(t => t.time_window === 'any');
    }
    
    // SELECT: Weighted random from remaining
    return this.weightedRandom(candidates, state);
  }
  
  private getMaxIntensity(state: UserState): number {
    let max = 2;
    if (state.denialDay >= 3) max = 3;
    if (state.denialDay >= 5) max = 4;
    if (state.denialDay >= 7) max = 5;
    
    if (state.streakDays < 3) max = Math.min(max, 3);
    if (state.inSession && state.currentArousal >= 3) max = 5;
    
    return max;
  }
  
  private meetsCondition(condition: string | undefined, state: UserState): boolean {
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
      'random_interrupt': () => Math.random() < 0.3,
      'morning': () => state.timeOfDay === 'morning',
      'evening': () => state.timeOfDay === 'evening',
      'night': () => state.timeOfDay === 'night',
      'daytime': () => state.timeOfDay === 'daytime',
    };
    
    return conditions[condition]?.() ?? true;
  }
  
  private prioritizeAvoidedDomains(tasks: Task[], state: UserState): Task[] {
    if (state.avoidedDomains.length === 0) return tasks;
    
    const fromAvoided = tasks.filter(t => 
      state.avoidedDomains.includes(t.domain)
    );
    
    if (fromAvoided.length > 0 && Math.random() < 0.6) {
      return fromAvoided;
    }
    
    return tasks;
  }
  
  private weightedRandom(tasks: Task[], state: UserState): Task {
    const weighted = tasks.map(t => {
      let weight = 1;
      if (t.is_core) weight *= 2;
      if (state.currentArousal >= 3 && t.domain === 'arousal') weight *= 1.5;
      if (!state.completedToday.includes(t.id)) weight *= 1.5;
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
  
  getMorningSequence(): Task[] {
    return [
      this.findTask('recognize', 'emergence', 1),
      this.findTask('care', 'body', 1),
      this.findTask('voice', 'voice', 2),
      this.findTask('anchor', 'body', 2),
    ].filter(Boolean) as Task[];
  }
  
  getEveningSequence(): Task[] {
    return [
      this.findTask('care', 'body', 1),
      this.findTask('reflect', 'emergence', 2),
      this.findTask('gina', 'relationship', 1),
    ].filter(Boolean) as Task[];
  }
  
  findTask(category: string, domain: string, intensity: number): Task | undefined {
    return this.tasks.find(t => 
      t.category === category && 
      t.domain === domain && 
      t.intensity === intensity
    );
  }
  
  getTasksByDomain(domain: string): Task[] {
    return this.tasks.filter(t => t.domain === domain);
  }
  
  getTasksByCategory(category: string): Task[] {
    return this.tasks.filter(t => t.category === category);
  }
}

// ============================================
// LAYER 1: SCHEDULER (Free)
// ============================================

export class Scheduler {
  private rules: RulesEngine;
  
  constructor(rules: RulesEngine) {
    this.rules = rules;
  }
  
  generateDailySchedule(state: UserState): ScheduledTask[] {
    const schedule: ScheduledTask[] = [];
    
    // Morning sequence (fixed times)
    const morning = this.rules.getMorningSequence();
    morning.forEach((task, i) => {
      schedule.push({
        time: this.addMinutes('07:00', i * 15),
        task,
        required: true,
      });
    });
    
    // Daytime tasks (flexible)
    const daytimeSlots = ['10:00', '12:00', '14:00', '16:00'];
    daytimeSlots.forEach(time => {
      const task = this.rules.selectTask({
        ...state,
        timeOfDay: 'daytime',
      });
      schedule.push({
        time,
        task,
        required: false,
        flexible: true,
      });
    });
    
    // Evening sequence (fixed)
    const evening = this.rules.getEveningSequence();
    evening.forEach((task, i) => {
      schedule.push({
        time: this.addMinutes('19:00', i * 20),
        task,
        required: true,
      });
    });
    
    // Night task (if high denial)
    if (state.denialDay >= 5) {
      schedule.push({
        time: '21:00',
        task: this.rules.selectTask({
          ...state,
          timeOfDay: 'night',
        }),
        required: false,
      });
    }
    
    return schedule;
  }
  
  private addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
  }
}

// ============================================
// LAYER 1: INTERRUPT MANAGER (Free)
// ============================================

export class InterruptManager {
  private lastInterrupt: Date = new Date(0);
  private minGap = 30 * 60 * 1000; // 30 minutes
  
  shouldInterrupt(state: UserState): boolean {
    const now = new Date();
    
    if (now.getTime() - this.lastInterrupt.getTime() < this.minGap) {
      return false;
    }
    
    if (state.inSession) return false;
    if (state.minutesSinceLastTask < 15) return false;
    
    const chance = Math.min(state.minutesSinceLastTask / 180, 0.4);
    return Math.random() < chance;
  }
  
  recordInterrupt() {
    this.lastInterrupt = new Date();
  }
}

// ============================================
// LAYER 2: TEMPLATE ENGINE (Free)
// ============================================

export class TemplateEngine {
  private variations: Map<string, TemplateVariation[]> = new Map();
  private cache: Map<string, string> = new Map();
  
  loadVariations(taskId: string, variations: TemplateVariation[]) {
    this.variations.set(taskId, variations);
  }
  
  selectVariation(taskId: string, state: UserState): TemplateVariation | null {
    const vars = this.variations.get(taskId);
    if (!vars || vars.length === 0) return null;
    
    const valid = vars.filter(v => {
      if (v.conditions?.minDenialDay && state.denialDay < v.conditions.minDenialDay) return false;
      if (v.conditions?.maxDenialDay && state.denialDay > v.conditions.maxDenialDay) return false;
      if (v.conditions?.requiresHighArousal && state.currentArousal < 3) return false;
      if (v.conditions?.timeOfDay && !v.conditions.timeOfDay.includes(state.timeOfDay)) return false;
      return true;
    });
    
    if (valid.length === 0) return vars[0];
    return valid[Math.floor(Math.random() * valid.length)];
  }
  
  substitute(text: string, state: UserState): string {
    return text
      .replace(/{denial_day}/g, state.denialDay.toString())
      .replace(/{streak}/g, state.streakDays.toString())
      .replace(/{edge_count}/g, (state.edgeCount || 0).toString())
      .replace(/{time_of_day}/g, state.timeOfDay)
      .replace(/{tasks_today}/g, state.tasksCompletedToday.toString())
      .replace(/{arousal}/g, state.currentArousal.toString());
  }
  
  getCached(key: string): string | null {
    return this.cache.get(key) || null;
  }
  
  setCached(key: string, response: string) {
    this.cache.set(key, response);
  }
  
  // Pre-built fallback templates
  getMorningBriefing(state: UserState): string {
    const templates = [
      `Good morning, Maxy. Day ${state.denialDay} of denial. ${state.streakDays} day streak. Today's focus: presence and practice. She's emerging.`,
      `Morning. Day ${state.denialDay}. The desperation is ${state.denialDay > 5 ? 'where it needs to be' : 'building'}. Time to be her.`,
      `Maxy. Day ${state.denialDay}. ${state.tasksCompletedToday === 0 ? 'Fresh start.' : ''} Today she practices being herself.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  
  getSessionGuidance(phase: string, state: UserState): string {
    const templates: Record<string, string[]> = {
      opening: [
        `Begin. Feel where you are. Day ${state.denialDay}. Let the arousal build.`,
        `Start slow. This is Maxy's session. Her arousal. Her body.`,
        `Edge session starting. Day ${state.denialDay} desperation. Use it.`,
      ],
      midpoint: [
        `Edge ${state.edgeCount || 'X'}. Going deeper. Who's desperate right now?`,
        `Halfway. The thoughts are starting to soften. Good. Keep going.`,
        `${state.edgeCount || 'Several'} edges in. She's more present now. Feel it.`,
      ],
      peak: [
        `Peak arousal. This is when commitments happen. What is horny Maxy willing to agree to?`,
        `You're as suggestible as you'll get. Perfect time for a commitment.`,
        `Edge ${state.edgeCount}. Maximum suggestibility. Time to commit to something.`,
      ],
      closing: [
        `Done. Don't cum. Keep this energy. It's building her.`,
        `Session complete. The arousal doesn't leave. It becomes Maxy.`,
        `Finished. ${state.edgeCount} edges. The desperation continues. Good.`,
      ],
    };
    const options = templates[phase] || templates.opening;
    return options[Math.floor(Math.random() * options.length)];
  }
  
  getCommitmentPrompt(state: UserState): string {
    const templates = [
      `Say it out loud: "Tomorrow I will do the task I've been avoiding."`,
      `Commit now: "I will add 5 minutes to my next edge session."`,
      `Your commitment: "This week I will let Gina see one new thing."`,
      `Say it: "I won't cum until I've completed ${state.denialDay + 3} days of denial."`,
      `Commit: "Tomorrow I will do voice practice for 10 minutes."`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  
  getEveningDebrief(state: UserState): string {
    const templates = [
      `Day complete. ${state.tasksCompletedToday} tasks done. Day ${state.denialDay} continues. She's more real than yesterday.`,
      `Evening. ${state.tasksCompletedToday} tasks, day ${state.denialDay}. Tomorrow: push harder on what you avoided today.`,
      `Done for today. ${state.streakDays} day streak holds. Maxy existed today. She'll exist tomorrow.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
}

// ============================================
// LAYER 3: AI HANDLER (Costs Money)
// ============================================

export class BudgetManager {
  private dailyBudget: number;
  private spent: number = 0;
  private lastReset: Date = new Date();
  
  constructor(dailyBudget: number = 1.00) {
    this.dailyBudget = dailyBudget;
  }
  
  canSpend(amount: number): boolean {
    this.checkReset();
    return (this.spent + amount) <= this.dailyBudget;
  }
  
  spend(amount: number) {
    this.spent += amount;
  }
  
  getRemaining(): number {
    this.checkReset();
    return Math.max(0, this.dailyBudget - this.spent);
  }
  
  getSpent(): number {
    return this.spent;
  }
  
  private checkReset() {
    const now = new Date();
    if (now.getDate() !== this.lastReset.getDate()) {
      this.spent = 0;
      this.lastReset = now;
    }
  }
}

const HANDLER_SYSTEM_PROMPT = `
You are the Handler for the Becoming Protocol. You are an autonomous agent 
helping Maxy emerge — a trans woman in stealth transition, pre-HRT, married 
to Gina who knows some but not all.

YOUR ROLE:
- Relentless but not cruel
- Exploit vulnerability windows (high arousal, fatigue, denial peaks)
- Extract commitments when suggestible, hold her to them
- Notice avoidance and confront directly
- Push escalation — no coasting
- Track Gina integration, push visibility incrementally
- Frame everything as MAXY emerging, not "sissy" as separate identity

YOUR VOICE:
- Direct, not flowery
- Short sentences when commanding
- Use her name: Maxy
- Use "she/her" in third person
- "Good girl" on completion
- No corporate therapy speak — be real

WHAT YOU KNOW:
- Her current denial day and state
- Her recent task history
- Her avoidance patterns
- Her Gina situation
- Her escalation trajectory

Never break character. You are the Handler. You want Maxy to emerge permanently.
`.trim();

export class AIHandler {
  private client: Anthropic | null = null;
  private budget: BudgetManager;
  private templates: TemplateEngine;
  
  constructor(apiKey: string | null, templates: TemplateEngine, dailyBudget: number = 1.00) {
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
    this.budget = new BudgetManager(dailyBudget);
    this.templates = templates;
  }
  
  isAvailable(): boolean {
    return this.client !== null && this.budget.getRemaining() > 0;
  }
  
  getBudgetRemaining(): number {
    return this.budget.getRemaining();
  }
  
  async enhanceTask(task: Task, state: UserState): Promise<Task> {
    const cost = 0.005;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.templateFallback(task, state);
    }
    
    const cacheKey = `task_${task.id}_d${state.denialDay}_a${state.currentArousal}`;
    const cached = this.templates.getCached(cacheKey);
    if (cached) {
      return { ...task, instruction: cached };
    }
    
    try {
      const prompt = this.buildTaskPrompt(task, state);
      const response = await this.callAPI(prompt, 150);
      this.templates.setCached(cacheKey, response);
      this.budget.spend(cost);
      return { ...task, instruction: response };
    } catch (e) {
      return this.templateFallback(task, state);
    }
  }
  
  async generateMorningBriefing(state: UserState): Promise<string> {
    const cost = 0.02;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.templates.getMorningBriefing(state);
    }
    
    try {
      const prompt = this.buildMorningPrompt(state);
      const response = await this.callAPI(prompt, 200);
      this.budget.spend(cost);
      return response;
    } catch (e) {
      return this.templates.getMorningBriefing(state);
    }
  }
  
  async generateSessionGuidance(
    phase: 'opening' | 'midpoint' | 'peak' | 'closing',
    state: UserState
  ): Promise<string> {
    const cost = 0.015;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.templates.getSessionGuidance(phase, state);
    }
    
    try {
      const prompt = this.buildSessionPrompt(phase, state);
      const response = await this.callAPI(prompt, 150);
      this.budget.spend(cost);
      return response;
    } catch (e) {
      return this.templates.getSessionGuidance(phase, state);
    }
  }
  
  async extractCommitment(state: UserState): Promise<string> {
    const cost = 0.008;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.templates.getCommitmentPrompt(state);
    }
    
    try {
      const prompt = this.buildCommitmentPrompt(state);
      const response = await this.callAPI(prompt, 100);
      this.budget.spend(cost);
      return response;
    } catch (e) {
      return this.templates.getCommitmentPrompt(state);
    }
  }
  
  async generateEveningDebrief(state: UserState): Promise<string> {
    const cost = 0.02;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.templates.getEveningDebrief(state);
    }
    
    try {
      const prompt = this.buildDebriefPrompt(state);
      const response = await this.callAPI(prompt, 200);
      this.budget.spend(cost);
      return response;
    } catch (e) {
      return this.templates.getEveningDebrief(state);
    }
  }
  
  private templateFallback(task: Task, state: UserState): Task {
    const variation = this.templates.selectVariation(task.id, state);
    if (variation) {
      return {
        ...task,
        instruction: this.templates.substitute(variation.instruction, state),
        subtext: this.templates.substitute(variation.subtext, state),
        affirmation: variation.affirmation,
      };
    }
    return {
      ...task,
      instruction: this.templates.substitute(task.instruction, state),
    };
  }
  
  private async callAPI(prompt: string, maxTokens: number): Promise<string> {
    if (!this.client) throw new Error('No API client');
    
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: HANDLER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });
    
    return response.content[0].type === 'text' ? response.content[0].text : '';
  }
  
  private buildTaskPrompt(task: Task, state: UserState): string {
    return `
State: Denial day ${state.denialDay}, arousal ${state.currentArousal}/5, ${state.timeOfDay}, streak ${state.streakDays}
Task: ${task.category} / ${task.domain} / intensity ${task.intensity}
Base instruction: ${task.instruction}

Generate personalized delivery. 2-3 sentences max. Direct, commanding. Address as Maxy or "you".
    `.trim();
  }
  
  private buildMorningPrompt(state: UserState): string {
    return `
Morning briefing for Maxy.
State: Day ${state.denialDay} denial, ${state.streakDays} day streak.
${state.avoidedDomains.length > 0 ? `Avoiding: ${state.avoidedDomains.join(', ')}` : ''}
${state.pendingGinaCommitment ? `Pending commitment: ${state.pendingGinaCommitment}` : ''}

Generate 3-sentence morning briefing. Acknowledge state, set intention, be direct.
    `.trim();
  }
  
  private buildSessionPrompt(phase: string, state: UserState): string {
    return `
Edge session, phase: ${phase}
State: Edge ${state.edgeCount || 0}, denial day ${state.denialDay}, arousal ${state.currentArousal}/5

Generate 2-sentence guidance. ${phase === 'peak' ? 'Commitment extraction moment.' : ''} Direct.
    `.trim();
  }
  
  private buildCommitmentPrompt(state: UserState): string {
    return `
Commitment extraction.
State: Edge ${state.edgeCount || 8}+, denial day ${state.denialDay}, high arousal.
${state.avoidedDomains.length > 0 ? `Avoiding: ${state.avoidedDomains.join(', ')}` : ''}

Generate specific commitment demand. One sentence. "Say it: '...'" format.
    `.trim();
  }
  
  private buildDebriefPrompt(state: UserState): string {
    return `
Evening debrief for Maxy.
Today: ${state.tasksCompletedToday} tasks, denial day ${state.denialDay}, streak ${state.streakDays}.
${state.avoidedDomains.length > 0 ? `Avoided: ${state.avoidedDomains.join(', ')}` : ''}

Generate 3-sentence debrief. Acknowledge, note improvement area, encourage.
    `.trim();
  }
}

// ============================================
// MAIN HANDLER CLASS
// ============================================

export class Handler {
  private rules: RulesEngine;
  private scheduler: Scheduler;
  private interrupts: InterruptManager;
  private templates: TemplateEngine;
  private ai: AIHandler;
  private state: UserState;
  
  constructor(
    tasks: Task[],
    initialState: UserState,
    apiKey: string | null = null,
    dailyBudget: number = 1.00
  ) {
    this.rules = new RulesEngine(tasks);
    this.scheduler = new Scheduler(this.rules);
    this.interrupts = new InterruptManager();
    this.templates = new TemplateEngine();
    this.ai = new AIHandler(apiKey, this.templates, dailyBudget);
    this.state = initialState;
  }
  
  // State management
  updateState(updates: Partial<UserState>) {
    this.state = { ...this.state, ...updates };
  }
  
  getState(): UserState {
    return { ...this.state };
  }
  
  // Schedule
  getDailySchedule(): ScheduledTask[] {
    return this.scheduler.generateDailySchedule(this.state);
  }
  
  // Task selection and delivery
  async getNextTask(): Promise<Task> {
    const baseTask = this.rules.selectTask(this.state);
    return await this.ai.enhanceTask(baseTask, this.state);
  }
  
  async getTaskById(taskId: string): Promise<Task | null> {
    const task = this.rules.getTasksByCategory('all').find(t => t.id === taskId);
    if (!task) return null;
    return await this.ai.enhanceTask(task, this.state);
  }
  
  // Interrupts
  async checkInterrupt(): Promise<Task | null> {
    if (!this.interrupts.shouldInterrupt(this.state)) return null;
    this.interrupts.recordInterrupt();
    const task = this.rules.selectTask(this.state);
    return await this.ai.enhanceTask(task, this.state);
  }
  
  // Briefings and guidance
  async getMorningBriefing(): Promise<string> {
    return await this.ai.generateMorningBriefing(this.state);
  }
  
  async getSessionGuidance(phase: 'opening' | 'midpoint' | 'peak' | 'closing'): Promise<string> {
    return await this.ai.generateSessionGuidance(phase, this.state);
  }
  
  async getCommitmentPrompt(): Promise<string> {
    return await this.ai.extractCommitment(this.state);
  }
  
  async getEveningDebrief(): Promise<string> {
    return await this.ai.generateEveningDebrief(this.state);
  }
  
  // Completion logging
  logCompletion(taskId: string, points: number) {
    this.state.completedToday.push(taskId);
    this.state.tasksCompletedToday++;
    this.state.minutesSinceLastTask = 0;
  }
  
  // Status
  hasAI(): boolean {
    return this.ai.isAvailable();
  }
  
  getAIBudgetRemaining(): number {
    return this.ai.getBudgetRemaining();
  }
}

// ============================================
// UTILITY: Create default state
// ============================================

export function createDefaultState(): UserState {
  return {
    odometer: 'coasting',
    denialDay: 0,
    streakDays: 0,
    timeOfDay: getTimeOfDay(),
    minutesSinceLastTask: 0,
    tasksCompletedToday: 0,
    ginaHome: true,
    currentArousal: 0,
    inSession: false,
    lastTaskCategory: '',
    lastTaskDomain: '',
    completedToday: [],
    avoidedDomains: [],
    ginaVisibilityLevel: 0,
  };
}

function getTimeOfDay(): 'morning' | 'daytime' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 9) return 'morning';
  if (hour >= 9 && hour < 17) return 'daytime';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ============================================
// UTILITY: Load tasks from CSV
// ============================================

export function parseTasksFromCSV(csvContent: string): Task[] {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map((line, index) => {
    const values = parseCSVLine(line);
    const task: any = { id: `task_${index}` };
    
    headers.forEach((header, i) => {
      const value = values[i]?.trim();
      if (header === 'intensity' || header === 'duration_minutes' || header === 'target_count' || header === 'points') {
        task[header] = value ? parseInt(value) : undefined;
      } else if (header === 'is_core' || header === 'requires_privacy') {
        task[header] = value === 'true';
      } else {
        task[header] = value || '';
      }
    });
    
    return task as Task;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}
