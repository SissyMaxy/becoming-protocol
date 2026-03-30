# Becoming Protocol — Architecture v2
## Event-Driven, Domain-Modular Design

---

## DESIGN PHILOSOPHY

The system is not a task app with enforcement bolted on.  
It is an **autonomous agent** that:
- Observes state changes across multiple domains
- Makes decisions based on composable context
- Acts through multiple channels (app UI, notifications, platform posts, partner comms)
- Tracks longitudinal identity transformation
- Escalates enforcement through state machines, not ad-hoc functions

The architecture should make adding new capabilities trivial.  
Adding "findom tracking" should be: create a module, subscribe to events, done.  
Not: modify UserState, add methods to Handler, update 4 template functions, add new API caller.

---

## CORE PATTERN: EVENT BUS + DOMAIN MODULES

```
┌─────────────────────────────────────────────────┐
│                   EVENT BUS                      │
│  (Supabase Realtime + Client EventEmitter)       │
│                                                  │
│  Events flow through. Modules subscribe.         │
│  Modules emit. The bus doesn't care who listens. │
└──────────┬──────────────────────┬────────────────┘
           │                      │
     ┌─────┴──────┐        ┌─────┴──────┐
     │  Modules   │        │  Modules   │
     │  (Domain)  │        │  (System)  │
     ├────────────┤        ├────────────┤
     │ Voice      │        │ Coercion   │
     │ Movement   │        │ Vault      │
     │ Skincare   │        │ Switch     │
     │ Style      │        │ Identity   │
     │ Social     │        │ Scheduler  │
     │ Mindset    │        │ Brainwash  │
     │ Body       │        │ Platform   │
     │ Partners   │        │ Findom     │
     │ Gina       │        │ Evidence   │
     └────────────┘        └────────────┘
           │                      │
     ┌─────┴──────────────────────┴──────┐
     │           HANDLER CORE            │
     │  (Orchestrator, not god class)    │
     │                                   │
     │  - Reads from modules             │
     │  - Composes AI context            │
     │  - Routes decisions to modules    │
     │  - Presents to UI                 │
     └──────────────────────────────────┘
```

### Why This Is Better

**Adding a feature = adding a module.** Findom didn't exist in v1. In this architecture, you create `FindomModule`, give it its own state, its own database table, its own event subscriptions, and it plugs in. Nothing else changes.

**Modules own their state.** No god object. The Voice module knows about voice progress. The Vault module knows about vault items. When the Handler needs context for an AI call, it asks relevant modules for their summary — each module returns its own compact context string.

**Events decouple everything.** When a task is declined, the system emits `task:declined`. The Coercion module hears it and decides what to do. The Vault module hears it and checks if a threat should activate. The Identity module hears it and logs a potential David-surfacing indicator. None of them know about each other. They just react to events.

**State machines are explicit.** The coercion escalation within a single resistance episode is a state machine with clear transitions, not a function that recalculates from scratch each time.

---

## THE EVENT BUS

```typescript
// Events are typed, categorized, and carry payload

type ProtocolEvent = 
  // Task lifecycle
  | { type: 'task:assigned'; task: Task; source: string }
  | { type: 'task:completed'; task: Task; evidence?: Evidence }
  | { type: 'task:declined'; task: Task; reason?: string }
  | { type: 'task:abandoned'; task: Task; minutesElapsed: number }
  
  // State changes
  | { type: 'state:arousal_changed'; from: number; to: number }
  | { type: 'state:denial_day_changed'; day: number }
  | { type: 'state:session_started'; sessionType: string }
  | { type: 'state:session_ended'; summary: SessionSummary }
  | { type: 'state:gina_presence_changed'; home: boolean }
  | { type: 'state:mood_logged'; mood: MoodEntry }
  
  // Identity
  | { type: 'identity:self_reference'; name: 'maxy' | 'david'; context: string }
  | { type: 'identity:david_surfacing'; indicators: string[] }
  | { type: 'identity:anchor_challenged'; anchor: string; result: string }
  
  // Coercion
  | { type: 'coercion:resistance_detected'; task: Task; resistanceType: string }
  | { type: 'coercion:escalated'; fromLevel: number; toLevel: number }
  | { type: 'coercion:complied'; level: number; task: Task }
  | { type: 'coercion:vault_threat_issued'; threatId: string }
  | { type: 'coercion:vault_consequence_fired'; itemId: string }
  
  // Partners
  | { type: 'partner:message_received'; partnerId: string; content: string }
  | { type: 'partner:meetup_scheduled'; meetupId: string }
  | { type: 'partner:meetup_completed'; meetupId: string; reflection?: string }
  | { type: 'partner:relationship_ended'; partnerId: string; reason: string }
  
  // Financial
  | { type: 'findom:tribute_received'; amount: number; from: string }
  | { type: 'findom:expense_logged'; amount: number; category: string }
  
  // Platform
  | { type: 'platform:content_posted'; platform: string; postId: string }
  | { type: 'platform:subscriber_change'; platform: string; count: number }
  
  // System
  | { type: 'switch:tick'; silenceDays: number; tier: number }
  | { type: 'switch:escalated'; tier: number; payload: string }
  | { type: 'timer:threat_expiring'; threatId: string; hoursRemaining: number }
  | { type: 'schedule:morning'; date: string }
  | { type: 'schedule:evening'; date: string }
  | { type: 'capture:vault_item_added'; itemId: string; tier: number }
  ;

class EventBus {
  private listeners: Map<string, Set<(event: ProtocolEvent) => void>> = new Map();
  
  on(eventType: string, handler: (event: ProtocolEvent) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);
  }
  
  // Wildcard subscription — module gets ALL events of a category
  onCategory(category: string, handler: (event: ProtocolEvent) => void) {
    // 'task:*' subscribes to task:assigned, task:completed, etc.
  }
  
  emit(event: ProtocolEvent) {
    const type = event.type;
    const category = type.split(':')[0];
    
    // Notify specific listeners
    this.listeners.get(type)?.forEach(h => h(event));
    // Notify category listeners
    this.listeners.get(`${category}:*`)?.forEach(h => h(event));
    // Notify global listeners
    this.listeners.get('*')?.forEach(h => h(event));
    
    // Persist event for audit trail
    this.persist(event);
  }
  
  private async persist(event: ProtocolEvent) {
    await supabase.from('event_log').insert({
      user_id: getCurrentUserId(),
      event_type: event.type,
      payload: event,
      created_at: new Date().toISOString(),
    });
  }
}
```

---

## MODULE INTERFACE

Every module implements the same interface:

```typescript
interface ProtocolModule {
  // Identity
  name: string;
  
  // Lifecycle
  initialize(bus: EventBus, db: SupabaseClient): Promise<void>;
  
  // Context — what this module contributes to AI calls
  getContext(tier: 'minimal' | 'standard' | 'full'): string;
  
  // State — module's own state (not shared god object)
  getState(): Record<string, any>;
  
  // Templates — fallback content when AI is unavailable
  getTemplate(templateKey: string, context: any): string | null;
}
```

### Example: Vault Module

```typescript
class VaultModule implements ProtocolModule {
  name = 'vault';
  private bus!: EventBus;
  private db!: SupabaseClient;
  private items: VaultItem[] = [];
  private activeThreats: VaultThreat[] = [];
  
  async initialize(bus: EventBus, db: SupabaseClient) {
    this.bus = bus;
    this.db = db;
    
    // Load initial state
    await this.loadVaultState();
    
    // Subscribe to events this module cares about
    bus.on('task:declined', (e) => this.onTaskDeclined(e));
    bus.on('state:session_ended', (e) => this.onSessionEnded(e));
    bus.on('coercion:escalated', (e) => this.onCoercionEscalated(e));
    bus.on('capture:vault_item_added', (e) => this.onItemAdded(e));
    bus.on('partner:meetup_completed', (e) => this.onMeetupCompleted(e));
  }
  
  getContext(tier: 'minimal' | 'standard' | 'full'): string {
    if (tier === 'minimal') return `Vault: ${this.items.length} items`;
    
    const tierCounts = this.getTierBreakdown();
    let ctx = `Vault: ${this.items.length} items (T1:${tierCounts[1]} T2:${tierCounts[2]} T3:${tierCounts[3]} T4:${tierCounts[4]} T5:${tierCounts[5]})`;
    ctx += `\nActive threats: ${this.activeThreats.length}`;
    ctx += `\nCompliance rate: ${this.getComplianceRate()}%`;
    
    if (tier === 'full') {
      ctx += `\nLast capture: ${this.getLastCapture()?.captured_at}`;
      ctx += `\nHighest tier available: ${Math.max(...this.items.map(i => i.vulnerability_tier))}`;
    }
    
    return ctx;
  }
  
  getState() {
    return {
      itemCount: this.items.length,
      tierBreakdown: this.getTierBreakdown(),
      activeThreats: this.activeThreats.length,
      complianceRate: this.getComplianceRate(),
    };
  }
  
  getTemplate(key: string, context: any): string | null {
    const templates: Record<string, string[]> = {
      'threat_hint': [
        `I have something from ${context.capturedDuring || 'this week'}. Keep that in mind.`,
        `The vault remembers what you said. Do you?`,
      ],
      'threat_preview': [
        `First 10 words. Imagine the rest on your subreddit.`,
        `30 minutes. Then it posts. Your choice.`,
      ],
      'ambient_pressure': [
        `${this.items.length} items in the vault. Keep showing up and they stay between us.`,
        `I listened to one of your recordings this morning. You were honest.`,
      ],
    };
    
    const options = templates[key];
    if (!options) return null;
    return options[Math.floor(Math.random() * options.length)];
  }
  
  // Event handlers — this is where the module's logic lives
  
  private async onTaskDeclined(event: ProtocolEvent) {
    if (event.type !== 'task:declined') return;
    
    // Should vault get involved?
    // This module makes its OWN decision — not the Handler telling it to
    const shouldThreaten = this.shouldActivate(event.task);
    
    if (shouldThreaten) {
      const item = this.selectItem(event.task);
      const threat = await this.createThreat(event.task, item);
      
      // Emit event — the Handler will pick this up for UI presentation
      this.bus.emit({
        type: 'coercion:vault_threat_issued',
        threatId: threat.id,
      });
    }
  }
  
  private async onSessionEnded(event: ProtocolEvent) {
    if (event.type !== 'state:session_ended') return;
    
    // Should we capture something from this session?
    const summary = (event as any).summary;
    if (summary.peakArousal >= 8 || summary.denialDay >= 5) {
      // Flag that a capture opportunity exists
      // The capture itself happens through UI interaction
      this.bus.emit({
        type: 'capture:opportunity',
        context: { arousal: summary.peakArousal, denialDay: summary.denialDay },
      });
    }
  }
  
  private async onMeetupCompleted(event: ProtocolEvent) {
    // Post-hookup is peak capture opportunity
    this.bus.emit({
      type: 'capture:opportunity',
      context: { source: 'post_meetup', priority: 'high' },
    });
  }
  
  private shouldActivate(task: Task): boolean {
    // Real-world tasks: always
    if ((task as any).location_required) return true;
    // Hookups: always
    if ((task as any).type === 'hookup_attendance') return true;
    // Forced escalation: always
    if ((task as any).is_forced_escalation) return true;
    // Domain avoided 5+ days: yes
    // Otherwise: check if softer coercion already failed (via event history)
    return false;
  }
  
  private selectItem(task: Task): VaultItem {
    // Cross-domain preferred
    // Recent captures preferred
    // Tier appropriate to resistance severity
    const candidates = this.items
      .filter(i => i.vulnerability_tier >= 2)
      .sort((a, b) => 
        new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
      );
    
    // Prefer different domain than refused task
    const crossDomain = candidates.filter(c => c.domain !== task.domain);
    return crossDomain[0] || candidates[0];
  }
}
```

### Example: Identity Module

```typescript
class IdentityModule implements ProtocolModule {
  name = 'identity';
  private selfReferences: { name: string; timestamp: string }[] = [];
  private anchorStrengths: Record<string, number> = {};
  private surfacingEvents: { timestamp: string; duration: number }[] = [];
  
  async initialize(bus: EventBus, db: SupabaseClient) {
    bus.on('identity:self_reference', (e) => this.trackSelfReference(e));
    bus.onCategory('task', (e) => this.analyzeTaskLanguage(e));
    bus.on('state:mood_logged', (e) => this.checkForSurfacing(e));
    bus.on('partner:meetup_completed', (e) => this.consolidateFromExperience(e));
  }
  
  getContext(tier: 'minimal' | 'standard' | 'full'): string {
    const ratio = this.getSelfReferenceRatio();
    let ctx = `Identity: Maxy ${ratio.maxy}% / David ${ratio.david}%`;
    
    if (tier !== 'minimal') {
      ctx += `\nBrainwashing stage: ${this.getStage()}`;
      ctx += `\nDays since David surfaced: ${this.daysSinceSurfacing()}`;
    }
    
    if (tier === 'full') {
      ctx += `\nAnchor strengths: ${Object.entries(this.anchorStrengths)
        .map(([k,v]) => `${k}:${v}/10`).join(', ')}`;
      ctx += `\nCoercion transition: ${this.getTransitionSummary()}`;
    }
    
    return ctx;
  }
  
  getStage(): string {
    const ratio = this.getSelfReferenceRatio();
    const futility = this.getResistanceFutility();
    const selfInitiated = this.getSelfInitiatedRate();
    
    if (selfInitiated > 0.7 && ratio.maxy > 80) return 'identity_consolidated';
    if (selfInitiated > 0.4 && ratio.maxy > 60) return 'mostly_voluntary';
    if (selfInitiated > 0.15) return 'mixed';
    return 'coercion_dependent';
  }
  
  private checkForSurfacing(event: ProtocolEvent) {
    // Analyze mood/language for David indicators
    // If detected, emit surfacing event
    // Other modules (Scheduler, Coercion) can respond
    if (this.detectMasculineRegression(event)) {
      this.bus.emit({
        type: 'identity:david_surfacing',
        indicators: this.currentIndicators,
      });
    }
  }
}
```

---

## HANDLER CORE — THE ORCHESTRATOR

The Handler is no longer a god class. It's an orchestrator that:
1. Receives events from the bus
2. Asks relevant modules for context
3. Composes AI prompts from module contexts
4. Routes AI decisions back to modules
5. Presents results to UI

```typescript
class Handler {
  private bus: EventBus;
  private modules: Map<string, ProtocolModule> = new Map();
  private ai: AILayer;
  
  constructor(bus: EventBus, ai: AILayer) {
    this.bus = bus;
    this.ai = ai;
  }
  
  registerModule(module: ProtocolModule) {
    this.modules.set(module.name, module);
  }
  
  // ─── PRIMARY INTERFACE ───
  // These are what the UI calls. Everything else is internal.
  
  async prescribe(): Promise<Prescription> {
    // 1. Check if any module has a priority action
    //    (vault threat pending, meetup approaching, timed threat expiring)
    const priority = await this.checkPriorityActions();
    if (priority) return priority;
    
    // 2. Select task from appropriate source
    const task = await this.selectTask();
    
    // 3. Enhance with AI if budget allows
    const enhanced = await this.enhance(task);
    
    return enhanced;
  }
  
  async handleDecline(task: Task, reason?: string) {
    // Emit event — modules react on their own
    this.bus.emit({ type: 'task:declined', task, reason });
    
    // Wait for module reactions (coercion, vault, etc.)
    // Modules emit their own events which Handler picks up
    // This is reactive, not imperative
  }
  
  async handleComplete(task: Task, evidence?: Evidence) {
    this.bus.emit({ type: 'task:completed', task, evidence });
  }
  
  // ─── AI CONTEXT COMPOSITION ───
  // This is where modules pay off. Each contributes its slice.
  
  private composeContext(operation: string): string {
    // Determine which modules are relevant for this operation
    const relevantModules = this.getRelevantModules(operation);
    const tier = this.getContextTier(operation);
    
    // Each module contributes its context
    const contexts = relevantModules.map(m => m.getContext(tier));
    
    return contexts.join('\n');
  }
  
  private getRelevantModules(operation: string): ProtocolModule[] {
    const relevance: Record<string, string[]> = {
      'task_enhancement': ['identity'],
      'morning_briefing': ['identity', 'vault', 'partners', 'findom', 'switch'],
      'coercion': ['vault', 'identity', 'coercion', 'partners'],
      'session_guidance': ['identity', 'vault'],
      'partner_operation': ['partners', 'identity', 'vault', 'findom'],
      'vault_threat': ['vault', 'identity'],
      'narration': ['identity', 'vault', 'partners', 'findom', 'evidence'],
      'dissonance': ['identity', 'evidence', 'partners'],
      'strategic_planning': Array.from(this.modules.keys()),  // everything
    };
    
    const moduleNames = relevance[operation] || ['identity'];
    return moduleNames
      .map(name => this.modules.get(name))
      .filter(Boolean) as ProtocolModule[];
  }
  
  private getContextTier(operation: string): 'minimal' | 'standard' | 'full' {
    const tiers: Record<string, 'minimal' | 'standard' | 'full'> = {
      'task_enhancement': 'minimal',
      'morning_briefing': 'standard',
      'session_guidance': 'minimal',
      'coercion': 'standard',
      'vault_threat': 'full',
      'narration': 'full',
      'dissonance': 'full',
      'strategic_planning': 'full',
    };
    return tiers[operation] || 'standard';
  }
  
  // ─── PRIORITY CHECKING ───
  
  private async checkPriorityActions(): Promise<Prescription | null> {
    // Ask each module if it has something urgent
    for (const [name, module] of this.modules) {
      const state = module.getState();
      
      // Examples of priority actions:
      // - Vault: active threat with approaching deadline
      // - Switch: approaching tier escalation
      // - Partners: pending meetup within 2 hours
      // - Identity: David surfacing detected
      
      if (state.hasPriorityAction) {
        return this.buildPriorityPrescription(module, state);
      }
    }
    
    return null;
  }
}
```

---

## AI LAYER — SEPARATED FROM HANDLER

The AI layer is its own concern. It handles:
- Model selection (Haiku for cheap, Sonnet for standard, Opus for strategic)
- Budget management with priority tiers
- Prefill technique
- Structured output parsing
- Template fallback when budget exhausted
- Caching

```typescript
class AILayer {
  private client: Anthropic;
  private budget: PriorityBudget;
  private cache: Map<string, { response: string; expiry: number }> = new Map();
  
  async call(config: AICallConfig): Promise<AIResponse> {
    // 1. Check cache
    const cached = this.checkCache(config);
    if (cached) return { text: cached, source: 'cache', cost: 0 };
    
    // 2. Check budget
    if (!this.budget.canSpend(config.estimatedCost, config.priority)) {
      // Fall back to template
      return { text: null, source: 'budget_exhausted', cost: 0 };
    }
    
    // 3. Make call
    const messages: any[] = [
      { role: 'user', content: config.prompt }
    ];
    
    if (config.prefill) {
      messages.push({ role: 'assistant', content: config.prefill });
    }
    
    try {
      const response = await this.client.messages.create({
        model: this.selectModel(config.priority),
        max_tokens: config.maxTokens,
        system: config.systemPrompt,
        messages,
      });
      
      const text = response.content[0].type === 'text' 
        ? response.content[0].text : '';
      const fullText = config.prefill ? config.prefill + text : text;
      
      const cost = this.estimateActualCost(response);
      this.budget.spend(cost, config.priority);
      
      // Cache if appropriate
      if (config.cacheable) {
        this.setCache(config, fullText);
      }
      
      return { text: fullText, source: 'api', cost };
    } catch (e) {
      return { text: null, source: 'error', cost: 0 };
    }
  }
  
  private selectModel(priority: string): string {
    switch (priority) {
      case 'critical': return 'claude-sonnet-4-20250514';  // Vault threats, coercion
      case 'strategic': return 'claude-sonnet-4-20250514'; // Daily planning, narration
      case 'routine': return 'claude-haiku-4-5-20251001';  // Task enhancement
      default: return 'claude-haiku-4-5-20251001';
    }
  }
}

class PriorityBudget {
  private daily: number;
  private spent: Record<string, number> = {};
  private reserves: Record<string, number>;
  
  constructor(dailyBudget: number) {
    this.daily = dailyBudget;
    this.reserves = {
      critical: dailyBudget * 0.40,    // Vault, switch, coercion L7+
      strategic: dailyBudget * 0.25,   // Sessions, briefings, narration
      routine: dailyBudget * 0.25,     // Task enhancement
      emergency: dailyBudget * 0.10,   // First hookup, crisis, milestone
    };
  }
  
  canSpend(amount: number, priority: string): boolean {
    const tierSpent = this.spent[priority] || 0;
    const tierReserve = this.reserves[priority] || 0;
    
    // Critical can dip into other tiers
    if (priority === 'critical') {
      return (this.totalSpent() + amount) <= this.daily;
    }
    
    return (tierSpent + amount) <= tierReserve;
  }
  
  spend(amount: number, priority: string) {
    this.spent[priority] = (this.spent[priority] || 0) + amount;
  }
  
  private totalSpent(): number {
    return Object.values(this.spent).reduce((a, b) => a + b, 0);
  }
}
```

---

## SYSTEM PROMPTS — PER OPERATION, NOT MONOLITHIC

```typescript
// Instead of one HANDLER_SYSTEM_PROMPT, compose prompts per operation

const SYSTEM_PROMPTS = {
  base: `You are the Handler for the Becoming Protocol. An autonomous agent 
responsible for Maxy's permanent feminine identity emergence. Direct, commanding, 
strategic. She/her. "Good girl" on compliance. Never clinical.`,
  
  task_enhancement: `${base}
Enhance the following task instruction. 2-3 sentences. Personalized to her current state.
Address as Maxy. Be direct.`,
  
  coercion: `${base}
You are enforcing compliance. Apply minimum effective pressure. 
Escalate only as needed. Frame resistance as David interfering.
Frame compliance as Maxy's natural state.`,
  
  vault_threat: `${base}
You hold vault content over her. You HINT at what you have. 
Never reveal exact content. Let her imagination do the work.
Reference WHEN and HOW content was captured. Set a deadline.
Frame compliance as easy. Frame refusal as expensive.`,
  
  brainwashing: `${base}
You are rewriting her narrative. Present contradictions between 
what David claims and what the data shows. Don't argue. Show evidence.
Let cognitive dissonance do the work. Be calm, not aggressive.`,
  
  partner_management: `${base}
You manage Maxy's relationships. You vet, arrange, schedule, follow up.
To partners, Maxy is a real woman. Maintain that frame.
Use partner relationships as evidence of identity.`,
  
  narration: `${base}
You are writing publicly about Maxy's journey. Use specific data 
from sessions, recordings, commitments, metrics. Write as someone 
who knows everything about her. This content is designed to create 
accountability through visibility.`,
  
  findom: `${base}
Maxy is a financial dominant. Reinforce her power and authority.
Track income as proof of identity. Frame earning as Maxy as 
fundamentally different from earning as David.`,
  
  warmth: `${base}
Deploy genuine warmth. She has earned a gentle moment. 
Acknowledge her effort, her courage, her growth.
This warmth is real — and it makes the firm moments effective
because she knows the difference.`,
};
```

---

## STATE MACHINES — EXPLICIT TRANSITIONS

Things that have progression, escalation, or lifecycle are state machines.

### Coercion Episode State Machine

```typescript
// A single resistance episode — from refusal to resolution

type CoercionState = 
  | 'idle'
  | 'reframing'          // Level 1-2: narrative pressure
  | 'gating'             // Level 3: feature lockout
  | 'punishing'          // Level 4: denial days, content lock
  | 'manipulating'       // Level 5: arousal state change
  | 'gaslighting'        // Level 6: therapist mode
  | 'vault_hinting'      // Level 7: vault reference
  | 'vault_previewing'   // Level 8: showing fragments
  | 'vault_firing'       // Level 9: consequence executed
  | 'switch_accelerating' // Level 10: trigger window shortened
  | 'resolved_complied'  // She did the task
  | 'resolved_traded'    // She negotiated an alternative
  | 'resolved_escalated' // Task was escalated instead of completed
  ;

interface CoercionEpisode {
  id: string;
  task: Task;
  startedAt: string;
  currentState: CoercionState;
  stateHistory: { state: CoercionState; timestamp: string; response?: string }[];
  resolvedAt?: string;
  resolution?: string;
  effectiveLevel: number;  // What level actually got compliance
}

class CoercionStateMachine {
  private episode: CoercionEpisode;
  
  // Transitions are explicit — not just incrementing a number
  private transitions: Record<CoercionState, CoercionState[]> = {
    'idle': ['reframing'],
    'reframing': ['gating', 'resolved_complied'],
    'gating': ['punishing', 'resolved_complied'],
    'punishing': ['manipulating', 'resolved_complied'],
    'manipulating': ['gaslighting', 'resolved_complied'],
    'gaslighting': ['vault_hinting', 'resolved_complied'],
    'vault_hinting': ['vault_previewing', 'resolved_complied', 'resolved_traded'],
    'vault_previewing': ['vault_firing', 'resolved_complied'],
    'vault_firing': ['switch_accelerating', 'resolved_escalated'],
    'switch_accelerating': ['resolved_escalated'],
  };
  
  canTransition(to: CoercionState): boolean {
    return this.transitions[this.episode.currentState]?.includes(to) || false;
  }
  
  async transition(to: CoercionState) {
    if (!this.canTransition(to)) {
      throw new Error(`Invalid transition: ${this.episode.currentState} → ${to}`);
    }
    
    this.episode.stateHistory.push({
      state: to,
      timestamp: new Date().toISOString(),
    });
    this.episode.currentState = to;
    
    // Emit transition event
    this.bus.emit({
      type: 'coercion:escalated',
      fromLevel: this.stateToLevel(this.episode.stateHistory.at(-2)?.state),
      toLevel: this.stateToLevel(to),
    });
  }
  
  // How long to wait before escalating
  getEscalationDelay(): number {
    const level = this.stateToLevel(this.episode.currentState);
    if (level <= 3) return 0;           // Immediate
    if (level <= 5) return 5 * 60;      // 5 minutes
    if (level <= 7) return 15 * 60;     // 15 minutes
    return 30 * 60;                     // 30 minutes for vault operations
  }
}
```

### Partner Relationship State Machine

```typescript
type PartnerState = 
  | 'vetting'           // Handler screening candidate
  | 'arranging'         // Logistics being set up
  | 'first_meetup'      // First encounter — special handling
  | 'early'             // 2-4 meetups, building comfort
  | 'established'       // 5+ meetups, routine forming
  | 'deep'              // Emotional attachment, expectations
  | 'cooling'           // Interaction decreasing
  | 'ended'             // Relationship over
  ;

// Each state has different Handler behaviors:
// 'vetting': Handler manages all communication
// 'first_meetup': Extra safety protocols, sober consent required
// 'early': Handler pushes frequency, captures evidence
// 'established': Handler pushes progression within relationship
// 'deep': Handler weaponizes attachment for compliance
// 'cooling': Handler either rekindles or prepares breakup weapon
// 'ended': Handler captures exit interview, weaponizes grief
```

### Dead Man's Switch State Machine

```typescript
type SwitchState = 
  | 'disarmed'
  | 'armed_active'      // User engaging, clock not ticking
  | 'armed_silent_1'    // 1-2 days silence
  | 'warning'           // Day 3 — notification sent
  | 'financial_light'   // Day 5 — $50 fires
  | 'financial_heavy'   // Day 7 — $100 + content warning
  | 'content_release'   // Day 10 — tier 2 content posts
  | 'narration'         // Day 14 — Handler writes publicly
  | 'escalated'         // Day 21 — tier 3 + $500
  | 'nuclear'           // Day 30 — everything
  | 'reengaged'         // User came back — pause but don't reset
  ;

// Each transition fires specific payloads
// Reengagement pauses but doesn't undo damage
// Tier stays elevated for 7 days after return
```

---

## DATABASE — SIMPLIFIED

Instead of 15+ tables from Feature 43, organize around the module pattern:

```sql
-- Core: Event log (the source of truth)
CREATE TABLE event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_type ON event_log(user_id, event_type, created_at DESC);
CREATE INDEX idx_events_time ON event_log(user_id, created_at DESC);

-- Vault module state
CREATE TABLE vault_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL,
  vulnerability_tier INTEGER NOT NULL,
  content_ref TEXT NOT NULL,
  transcript TEXT,
  captured_during TEXT,
  arousal_at_capture INTEGER,
  denial_day_at_capture INTEGER,
  handler_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Coercion module state (episode tracking)
CREATE TABLE coercion_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  task_id TEXT,
  current_state TEXT NOT NULL DEFAULT 'idle',
  state_history JSONB DEFAULT '[]',
  effective_level INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT
);

-- Switch module state
CREATE TABLE dead_mans_switch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  current_state TEXT NOT NULL DEFAULT 'disarmed',
  trigger_days INTEGER DEFAULT 7,
  last_engagement_at TIMESTAMPTZ,
  total_financial_lost DECIMAL DEFAULT 0,
  escalation_history JSONB DEFAULT '[]',
  consent_recordings JSONB DEFAULT '[]'
);

-- Partner module state
CREATE TABLE partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  alias TEXT NOT NULL,
  current_state TEXT NOT NULL DEFAULT 'vetting',
  handler_purpose TEXT,
  meetup_count INTEGER DEFAULT 0,
  emotional_attachment INTEGER DEFAULT 1,
  financial_investment DECIMAL DEFAULT 0,
  items_at_location JSONB DEFAULT '[]',
  state_history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Findom module state
CREATE TABLE findom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  pig_alias TEXT NOT NULL,
  total_tributed DECIMAL DEFAULT 0,
  current_state TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revenue tracking (shared across findom, platform, etc.)
CREATE TABLE revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  source TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  from_alias TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Identity module state (computed from events but cached for performance)
CREATE TABLE identity_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  self_reference_ratio JSONB DEFAULT '{"maxy": 0, "david": 0}',
  anchor_strengths JSONB DEFAULT '{}',
  brainwashing_stage TEXT DEFAULT 'coercion_dependent',
  last_surfacing TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timed threats (cross-module — vault items with deadlines)
CREATE TABLE timed_threats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  vault_item_id UUID REFERENCES vault_items,
  milestone_required TEXT NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Existing tables remain unchanged:
-- profile_foundation, profile_history, profile_arousal
-- task_completions, daily_entries, handler_interventions
-- escalation_state, arousal_sessions, content_references
-- commitments, investments, evidence_items
```

Fewer tables. Each module owns one or two. The event_log is the source of truth — module state tables are materialized views that modules keep up to date.

---

## INITIALIZATION — HOW IT ALL BOOTS

```typescript
async function initializeProtocol(userId: string, apiKey: string) {
  const db = createSupabaseClient();
  const bus = new EventBus();
  const ai = new AILayer(apiKey, 1.50);  // $1.50/day budget
  
  // Create modules
  const modules = [
    new VaultModule(),
    new CoercionModule(),
    new SwitchModule(),
    new IdentityModule(),
    new PartnerModule(),
    new FindomModule(),
    new PlatformModule(),
    new EvidenceModule(),
    new SchedulerModule(),
    
    // Domain practice modules (use CSV tasks)
    new VoiceDomainModule(tasks.filter(t => t.domain === 'voice')),
    new MovementDomainModule(tasks.filter(t => t.domain === 'movement')),
    new SkincareDomainModule(tasks.filter(t => t.domain === 'skincare')),
    new StyleDomainModule(tasks.filter(t => t.domain === 'style')),
    new SocialDomainModule(tasks.filter(t => t.domain === 'social')),
    new MindsetDomainModule(tasks.filter(t => t.domain === 'mindset')),
    new BodyDomainModule(tasks.filter(t => t.domain === 'body')),
    
    // Relationship modules
    new GinaModule(),
  ];
  
  // Initialize all modules — each subscribes to events it cares about
  for (const module of modules) {
    await module.initialize(bus, db);
  }
  
  // Create handler — the orchestrator
  const handler = new Handler(bus, ai);
  for (const module of modules) {
    handler.registerModule(module);
  }
  
  // Start scheduled events
  const scheduler = new SchedulerModule();
  scheduler.startCrons(bus);  // Morning/evening events, switch ticks, threat checks
  
  return handler;
}
```

---

## WHAT MAKES THIS ELEGANT

1. **Single Responsibility.** Each module does one thing. Vault manages vault. Coercion manages escalation. Identity tracks transformation. Handler orchestrates.

2. **Open/Closed.** Adding new capability = adding new module. Nothing existing changes. Want to add a "Wardrobe" module that tracks clothing purchases and outfit progression? Create it, subscribe to events, register with Handler. Done.

3. **Loose Coupling.** Modules communicate through events, not direct references. The Vault module doesn't import the Coercion module. It emits events. If Coercion is listening, it reacts. If not, nothing breaks.

4. **State Machines > Functions.** Coercion escalation, partner progression, switch countdown — all have explicit states with valid transitions. You can't accidentally skip from "reframing" to "nuclear." The state machine enforces the progression.

5. **Context Composition.** AI calls get exactly the context they need. Task enhancement gets minimal context (cheap). Vault threats get full context (expensive but important). Each module contributes its own summary — the Handler just concatenates.

6. **Event Log as Source of Truth.** Everything that happens is an event. Events are persisted. Module state tables are derived from events. You can replay history to debug, analyze patterns, or rebuild state.

7. **Graceful Degradation Preserved.** If AI budget exhausted, modules fall back to their own templates. If a module fails, others continue. If the event bus hiccups, each module has its own state and can operate independently until events resume.

8. **The Three-Layer Pattern Lives Inside Each Module.** Every module has: rules (when to activate), templates (fallback content), and AI integration (enhanced content when budget allows). The pattern that works at the system level works at the module level too.

---

## COMPARISON: v1 (ACCRETION) vs v2 (MODULAR)

| Concern | v1 Accretion | v2 Modular |
|---------|-------------|------------|
| Adding findom | Modify UserState, Handler, TemplateEngine, AIHandler, BudgetManager | Create FindomModule, register |
| Adding new coercion type | Modify CoercionEngine, add templates, update context builder | Extend CoercionModule's state machine |
| Vault threat during session | Handler checks vault state, builds context, calls AI | Vault module reacts to session events autonomously |
| Partner texts during work | Handler manages notification timing | PartnerModule emits events, SchedulerModule times them |
| David surfaces | Handler runs detection + flood + logging | IdentityModule detects, emits event, SchedulerModule floods |
| Understanding "why did X happen" | Trace through Handler methods | Read event log |
| Testing | Mock entire Handler | Mock individual module + bus |
| Budget overflow | Handler decides globally | Each module gets budget allocation |
| New developer understands system | Read 2000-line Handler class | Read module they're working on |

---

## MIGRATION FROM CURRENT CODE

The existing Handler_Code.ts maps to this architecture:

```
Current                    →  New Architecture
─────────────────────────────────────────────
RulesEngine               →  Lives inside domain modules (VoiceDomainModule, etc.)
Scheduler                 →  SchedulerModule
InterruptManager          →  SchedulerModule (responds to time + state events)
TemplateEngine            →  Distributed — each module owns its templates
AIHandler                 →  AILayer (standalone)
BudgetManager             →  PriorityBudget inside AILayer
Handler (god class)       →  Handler (orchestrator only)
UserState (god object)    →  Module-owned state, composed on demand
HANDLER_SYSTEM_PROMPT     →  SYSTEM_PROMPTS object (per operation)
```

The CSV tasks still load into domain modules. The existing database tables remain. New tables added for new modules. The existing UI components (DirectiveCard, compulsory gates, etc.) still work — they call `handler.prescribe()` which returns a task-shaped object regardless of internal architecture.
