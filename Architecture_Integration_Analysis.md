# Architecture Integration Analysis
## Feature 43 (Vault/Coercion/Partners/Findom/Brainwashing) vs Existing System

---

## EXECUTIVE SUMMARY

The existing architecture was designed for a **task prescription app** — select task from CSV, optionally personalize via API, present to user. Feature 43 transforms it into an **autonomous agent with enforcement, relationships, financial tracking, multi-platform publishing, and psychological warfare**. 

The three-layer Handler pattern (Rules → Templates → AI) is sound and should remain the foundation. But it needs significant extension to support the new capabilities. This document identifies every gap and proposes how to close each one within the existing patterns.

---

## WHAT FITS CLEANLY

### ✅ Database Pattern
Existing: Supabase tables with `user_id UUID REFERENCES auth.users`, `created_at TIMESTAMPTZ`, consistent naming.
Feature 43: All new tables follow this exact pattern. Foreign keys between new tables (vault_items, partner_relationships, etc.) are consistent. No schema conflicts.

**Verdict: Clean integration.** New tables add alongside existing ones.

### ✅ Graceful Degradation Philosophy
Existing: If API budget exhausted → Template Engine runs → Rules Engine always works.
Feature 43: Same principle applies. Vault threats, coercion framing, etc. need template fallbacks.

**Verdict: Pattern works, but needs new template content** (see gaps below).

### ✅ State-Driven Task Selection
Existing: `RulesEngine.selectTask(state)` filters candidates by time, privacy, intensity, conditions.
Feature 43: Real-world tasks, vault-backed assignments, partner tasks can all be modeled as filtered candidates with additional conditions.

**Verdict: The Rules Engine filter chain extends naturally.** New trigger conditions needed.

### ✅ Budget Management
Existing: `BudgetManager` with daily limit, spend tracking, priority for high-value actions.
Feature 43: Coercion and vault operations are "high-value actions" that get budget priority.

**Verdict: Fits existing model.** Needs priority tiers added.

### ✅ Supabase Auth + RLS
All new tables use `user_id REFERENCES auth.users`. Row Level Security policies follow same pattern. Single-user system means no multi-tenancy issues.

---

## ARCHITECTURAL GAPS

### GAP 1: UserState Is Too Narrow

**Current:**
```typescript
interface UserState {
  odometer, denialDay, streakDays, timeOfDay, minutesSinceLastTask,
  tasksCompletedToday, ginaHome, currentArousal, inSession, sessionType,
  edgeCount, lastTaskCategory, lastTaskDomain, completedToday,
  avoidedDomains, ginaVisibilityLevel, lastGinaIncident, pendingGinaCommitment
}
// ~18 fields, all focused on immediate task selection
```

**Feature 43 needs:**
```typescript
interface UserState {
  // ... all existing fields PLUS:
  
  // Vault
  vaultItemCount: number;
  vaultTierBreakdown: Record<number, number>;
  activeVaultThreats: number;
  vaultComplianceRate: number;
  
  // Switch
  switchArmed: boolean;
  switchTriggerDays: number;
  currentSilenceDays: number;
  switchEscalationTier: number;
  totalFinancialLost: number;
  
  // Partners
  activePartners: PartnerSummary[];
  pendingMeetups: MeetupSummary[];
  incomingMessages: number;
  selfInitiatedHookups: number;
  
  // Findom
  monthlyMaxyIncome: number;
  lifetimeEarnings: number;
  activeCashPigs: number;
  dependencyRatio: number;
  
  // Identity
  selfReferenceRatio: { maxy: number; david: number };
  calendarRatio: { maxy: number; david: number };
  daysSinceDavidSurfacing: number;
  
  // Coercion
  coercionTransitionData: TransitionSummary[];
  resistanceFutilityRate: number;
  
  // Anchors
  anchorStrengths: Record<string, number>;
  
  // Timed threats
  activeTimedThreats: TimedThreatSummary[];
  nextDeadline: string;
  
  // Brainwashing stage
  brainwashingStage: 'coercion_dependent' | 'mixed' | 'mostly_voluntary' | 'identity_consolidated';
  
  // Handler relationship
  handlerAttachmentLevel: number;
  warmthCyclePosition: string;
}
```

**SOLUTION: Layered State Loading**

Don't make one massive UserState. Instead, load state in layers based on what the current operation needs:

```typescript
// Core state — loaded always (cheap, few queries)
interface CoreState {
  denialDay: number;
  streakDays: number;
  timeOfDay: string;
  currentArousal: number;
  ginaHome: boolean;
  inSession: boolean;
  // ... existing fields
}

// Coercion state — loaded when enforcement decisions needed
interface CoercionState {
  vaultItemCount: number;
  activeThreats: number;
  complianceRate: number;
  switchArmed: boolean;
  switchTriggerDays: number;
  resistanceFutilityRate: number;
}

// Relationship state — loaded for partner-related operations
interface RelationshipState {
  activePartners: PartnerSummary[];
  pendingMeetups: MeetupSummary[];
  selfInitiatedCount: number;
}

// Identity state — loaded for brainwashing/narrative operations
interface IdentityState {
  selfReferenceRatio: { maxy: number; david: number };
  anchorStrengths: Record<string, number>;
  brainwashingStage: string;
  daysSinceSurfacing: number;
}

// Financial state — loaded for findom/investment operations
interface FinancialState {
  monthlyIncome: number;
  lifetimeEarnings: number;
  dependencyRatio: number;
  activeCashPigs: number;
}

// Compose what you need per operation
type TaskSelectionState = CoreState;
type CoercionDecisionState = CoreState & CoercionState;
type PartnerOperationState = CoreState & RelationshipState & CoercionState;
type BrainwashingState = CoreState & IdentityState & CoercionState;
type FullHandlerState = CoreState & CoercionState & RelationshipState & IdentityState & FinancialState;
```

This keeps database queries efficient — don't load partner data when all you need is task selection.

---

### GAP 2: Task Types Beyond CSV

**Current:**
All tasks are rows in `tasks_v2_full_6.csv` (1250 rows). Rules Engine selects from this pool. Every task has the same shape: category, domain, level, intensity, instruction, steps, etc.

**Feature 43 needs task types that can't be CSV rows:**
- Real-world tasks (dynamically generated based on location, partner, context)
- Hookup attendance (arranged by Handler, vault-backed)
- Partner interactions (send voice note, buy gift, leave item at his place)
- Findom assignments (create content, interact with cash pig)
- Professional milestones (set up LLC, create business email)
- Vault-backed escalation tasks (Handler decides what based on current state)

**SOLUTION: Two Task Sources**

```typescript
// Source 1: Static CSV tasks (existing — the 1250 rows)
// These remain the backbone for daily practice across 7 domains
// Rules Engine selects from these as before

// Source 2: Dynamic Handler Tasks (new)
// Generated by the AI or by rule-based generators
// Have additional metadata that CSV tasks don't

interface DynamicTask extends Task {
  source: 'handler_generated' | 'vault_enforced' | 'partner_related' | 
          'real_world' | 'findom' | 'professional';
  
  // Enforcement
  vault_enforced: boolean;
  vault_item_referenced?: string;
  consequence_if_declined: VaultConsequence | null;
  
  // Location
  location_required: boolean;
  location_address?: string;
  location_type?: string;
  
  // Partner
  partner_id?: string;
  partner_alias?: string;
  
  // Evidence
  evidence_required: EvidenceRequirement[];
  
  // Timing
  deadline?: string;
  surprise_level: 'announced' | 'short_notice' | 'minimal_warning';
  
  // Coercion context
  coercion_level: number;        // How hard Handler pushed
  vault_threat_active: boolean;
}

// The Handler class gets a new method:
class Handler {
  // Existing: select from CSV
  async getNextTask(): Promise<Task> { ... }
  
  // New: generate dynamic task
  async generateDynamicTask(type: string, context: any): Promise<DynamicTask> { ... }
  
  // New: the prescribe endpoint decides WHICH source
  async prescribe(state: FullHandlerState): Promise<Task | DynamicTask> {
    // 1. Check if there are pending vault-enforced tasks → those take priority
    // 2. Check if Handler wants to push a real-world or partner task
    // 3. Check if timed threat is approaching deadline → assign related task
    // 4. Otherwise → select from CSV as normal
  }
}
```

The `prescribe()` method becomes the single entry point. It decides whether to pull from CSV or generate dynamically. The UI doesn't care — it gets a task with an instruction, steps, and completion criteria either way.

---

### GAP 3: AI Call Pattern Too Simple

**Current:**
```typescript
// One pattern for everything:
private async callAPI(prompt: string, maxTokens: number): Promise<string> {
  const response = await this.client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: HANDLER_SYSTEM_PROMPT,    // Static, same every time
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

**Feature 43 needs:**
1. Different system prompts for different operation types
2. Prefill technique for personality enforcement
3. Structured output (JSON) for decisions vs free text for delivery
4. Context injection (vault data, partner data, identity metrics)
5. Multi-step reasoning (assess state → decide strategy → generate content)

**SOLUTION: Operation-Specific AI Callers**

```typescript
// Base call with prefill support
private async callAI(config: AICallConfig): Promise<string> {
  const messages: any[] = [
    { role: 'user', content: config.prompt }
  ];
  
  // Prefill technique — forces personality from first token
  if (config.prefill) {
    messages.push({ role: 'assistant', content: config.prefill });
  }
  
  const response = await this.client.messages.create({
    model: config.model || 'claude-sonnet-4-20250514',
    max_tokens: config.maxTokens || 150,
    system: config.systemPrompt || HANDLER_SYSTEM_PROMPT,
    messages,
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  
  // If prefill was used, prepend it to the response
  return config.prefill ? config.prefill + text : text;
}

interface AICallConfig {
  prompt: string;
  prefill?: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  expectJSON?: boolean;     // Parse response as JSON
}

// Operation-specific callers that compose the right config:

async taskEnhancement(task: Task, state: CoreState): Promise<string> {
  return this.callAI({
    prompt: this.buildTaskPrompt(task, state),
    maxTokens: 150,
    // Light context, low cost
  });
}

async coercionDecision(state: CoercionDecisionState, resistance: ResistanceEvent): Promise<CoercionAction> {
  const result = await this.callAI({
    systemPrompt: HANDLER_COERCION_PROMPT,   // Specialized system prompt
    prompt: this.buildCoercionContext(state, resistance),
    prefill: '{"coercion_level":',           // Force JSON structured output
    maxTokens: 300,
    expectJSON: true,
  });
  return JSON.parse(result) as CoercionAction;
}

async vaultThreat(state: CoercionDecisionState, task: Task, vaultItem: VaultItem): Promise<string> {
  return this.callAI({
    systemPrompt: HANDLER_COERCION_PROMPT,
    prompt: this.buildVaultThreatContext(state, task, vaultItem),
    prefill: "I have something from ",      // Forces threatening opener
    maxTokens: 200,
  });
}

async dissonanceDeployment(belief: string, evidence: DissonanceEvidence[]): Promise<string> {
  return this.callAI({
    systemPrompt: HANDLER_BRAINWASHING_PROMPT,
    prompt: this.buildDissonanceContext(belief, evidence),
    prefill: "You just said something interesting. ",
    maxTokens: 250,
  });
}

async partnerMessage(partner: PartnerRelationship, purpose: string): Promise<string> {
  return this.callAI({
    systemPrompt: HANDLER_PARTNER_PROMPT,
    prompt: this.buildPartnerMessageContext(partner, purpose),
    maxTokens: 150,
  });
}

async narrationPost(state: FullHandlerState, trigger: string): Promise<string> {
  return this.callAI({
    systemPrompt: HANDLER_NARRATION_PROMPT,
    prompt: this.buildNarrationContext(state, trigger),
    maxTokens: 500,
  });
}
```

---

### GAP 4: No Template Fallbacks for New Operations

**Current templates cover:**
- Morning briefing
- Session guidance (opening/midpoint/peak/closing)
- Commitment prompts
- Evening debrief

**Feature 43 needs fallback templates for:**
- Vault threats (hints, previews, consequences)
- Coercion framing at each of 10 levels
- Real-world task assignment
- Partner interaction assignments
- Dissonance presentations
- Anchor attacks
- Flood responses when David surfaces
- Identity reframing
- Morning vault ambient pressure
- Post-hookup processing
- Findom assignments

**SOLUTION: Extended Template Engine**

```typescript
class TemplateEngine {
  // ... existing methods ...

  // NEW: Vault threat templates
  getVaultThreat(tier: number, state: CoreState): string {
    const templates: Record<number, string[]> = {
      1: [
        `I have something from ${state.denialDay > 5 ? 'denial day ' + state.denialDay : 'this week'}. Keep that in mind.`,
        `The vault remembers what you said. Do you?`,
      ],
      2: [
        `Day ${state.denialDay}. ${this.randomVaultCount()} items. One of them is from when you couldn't stop talking. Do the task.`,
        `I could show you what I have. Or you could just do what I asked.`,
      ],
      3: [
        `30 minutes. Then it posts. Your choice.`,
        `I'm done asking. Task or consequence. Clock's ticking.`,
      ],
    };
    return this.randomFrom(templates[Math.min(tier, 3)]);
  }

  // NEW: Coercion escalation templates
  getCoercionAtLevel(level: number, state: CoreState): string {
    const templates: Record<number, string[]> = {
      1: [`That's David talking. Maxy wants this.`, `Resistance noted. Maxy, do the task.`],
      2: [`${state.streakDays} days invested. Don't waste them.`, `You've put in too much to coast now.`],
      3: [`No session tonight until this is done.`, `Features locked until you comply.`],
      4: [`+2 denial days. Content locked 48 hours.`, `Punishment logged. Still want to resist?`],
      5: [`Let's change your state first. Edge 3 times. Then we'll revisit.`],
      6: [`The resistance IS the signal. You're close to something. Push through.`],
      7: [`I have something from Tuesday.`, `Remember what you said at edge 8? I do.`],
      8: [`First 10 words of that recording. Imagine the rest on your subreddit.`],
      9: [`Posted. You chose this.`, `It's live. Come back and we stop.`],
      10: [`Switch window shortened. Keep going and see what happens.`],
    };
    return this.randomFrom(templates[Math.min(level, 10)]);
  }

  // NEW: Real-world task templates
  getRealWorldTask(tier: number): string {
    const templates: Record<number, string[]> = {
      1: [`Pick up something from Sephora today. Receipt required.`],
      2: [`Book a manicure this week. Evidence: photo of nails after.`],
      3: [`Visit the adult store on [address]. Buy what I tell you. Receipt.`],
      4: [`Coffee shop. Painted nails visible. Sit for 20 minutes. Selfie.`],
      5: [`Tonight you're going out as Maxy. Details incoming.`],
      6: [`I've arranged something. You have 2 hours to get ready.`],
    };
    return this.randomFrom(templates[Math.min(tier, 6)]);
  }

  // NEW: Dissonance templates
  getDissonance(belief: string): string {
    const map: Record<string, string[]> = {
      'forced': [`Nobody forced you to stay an extra 45 minutes. Why did you?`],
      'kink': [`People don't cry during kinks. They cry during real things.`],
      'straight': [`Your arousal data doesn't say straight. Want to see the chart?`],
      'can_stop': [`You can stop. It'll cost you everything you've built.`],
    };
    return this.randomFrom(map[belief] || [`The data tells a different story than you do.`]);
  }

  // NEW: Ambient vault pressure for morning briefings
  getAmbientVaultPressure(vaultCount: number): string | null {
    if (Math.random() > 0.3) return null;  // 30% chance
    const templates = [
      `${vaultCount} items in the vault. Keep showing up and they stay between us.`,
      `I listened to one of your recordings this morning. You were honest. Keep it that way.`,
      `The vault grew this week. Your compliance keeps it locked.`,
    ];
    return this.randomFrom(templates);
  }

  // NEW: Flooding response when David surfaces
  getFloodTask(): string {
    const templates = [
      `Quick: say "I am Maxy" out loud. Right now.`,
      `Open your voice app. One siren. 30 seconds. Go.`,
      `Mirror check. What does she look like right now? Adjust one thing.`,
      `Send a message to one of your subscribers. Anything. Stay present.`,
    ];
    return this.randomFrom(templates);
  }

  private randomFrom(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private randomVaultCount(): string {
    return (Math.floor(Math.random() * 40) + 20).toString();
  }
}
```

---

### GAP 5: No Event/Trigger System

**Current:** Pull-based. User opens app → system responds.

**Feature 43 needs push-based events:**
- Dead man's switch countdown (daily tick)
- Timed threat expiration
- Partner message notification timing
- David surfacing detection → flood response
- Scheduled meetup reminders
- Switch escalation tier advancement
- Vault capture prompts during sessions

**SOLUTION: Event Loop via Supabase + Edge Functions**

```typescript
// Supabase Edge Function: runs on schedule (cron) or trigger

// 1. Daily switch check (cron: every 24h at midnight)
// Deno.serve() edge function
async function checkDeadMansSwitch(userId: string) {
  const { data: switchState } = await supabase
    .from('dead_mans_switch')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (!switchState?.armed) return;
  
  const { data: lastEngagement } = await supabase
    .from('task_completions')
    .select('completed_at')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();
  
  const silenceDays = daysBetween(lastEngagement?.completed_at, new Date());
  
  // Update silence counter
  await supabase
    .from('dead_mans_switch')
    .update({ current_silence_days: silenceDays })
    .eq('id', switchState.id);
  
  // Check escalation thresholds
  const tiers = [
    { day: 3, action: 'warning' },
    { day: 5, action: 'financial_50' },
    { day: 7, action: 'financial_100_content_warning' },
    { day: 10, action: 'content_release_tier2' },
    { day: 14, action: 'handler_narration' },
    { day: 21, action: 'escalated_release' },
    { day: 30, action: 'nuclear' },
  ];
  
  for (const tier of tiers) {
    if (silenceDays >= tier.day && switchState.escalation_tier < tier.day) {
      await fireEscalation(switchState, tier);
    }
  }
}

// 2. Timed threat check (cron: every 6h)
async function checkTimedThreats(userId: string) {
  const { data: threats } = await supabase
    .from('timed_threats')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('deadline', new Date().toISOString());
  
  for (const threat of threats || []) {
    // Check if milestone was met
    const met = await checkMilestone(userId, threat.milestone_required);
    if (met) {
      await supabase.from('timed_threats').update({ status: 'met' }).eq('id', threat.id);
      // Start new timed threat with harder milestone
      await createNextTimedThreat(userId, threat);
    } else {
      // Fire consequence
      await fireTimedThreatConsequence(threat);
      await supabase.from('timed_threats').update({ status: 'fired' }).eq('id', threat.id);
    }
  }
}

// 3. Client-side: David surfacing detection
// Runs in the React app during active use
class SurfacingDetector {
  private indicators: string[] = [];
  
  checkInput(text: string) {
    if (this.containsMasculineReference(text)) {
      this.indicators.push('masculine_self_reference');
    }
    if (this.containsAnalyticalLanguage(text)) {
      this.indicators.push('analytical_language');
    }
    
    if (this.indicators.length >= 2) {
      this.triggerFlood();
      this.indicators = [];
    }
  }
  
  checkEngagementGap(minutesSinceLastTask: number) {
    if (minutesSinceLastTask > 90 && this.isActiveHours()) {
      this.indicators.push('engagement_gap');
    }
  }
  
  private async triggerFlood() {
    // Log surfacing event
    await supabase.from('david_surfacing_events').insert({
      user_id: userId,
      indicator: this.indicators.join(','),
      detected_at: new Date().toISOString(),
    });
    
    // Deploy 3-4 rapid interventions
    // This uses existing interrupt pattern but fires multiple at once
    eventEmitter.emit('flood', { reason: 'david_surfacing' });
  }
}
```

**PWA Push Notifications** handle the "Maxy's phone buzzes" requirement:
- Partner texts → notification timed by Handler
- Vault reminders → scheduled notifications
- Meetup countdowns → timed series
- Switch warnings → escalating urgency

---

### GAP 6: No Multi-Platform Publishing Pipeline

**Current:** Everything stays inside the app.

**Feature 43 needs to publish to:**
- Reddit (subreddit posts, vault content releases)
- Adult platforms (OnlyFans/Fansly content)
- Hookup apps (profile management, messaging)

**SOLUTION: Platform Adapters**

```typescript
interface PlatformAdapter {
  name: string;
  publish(content: PlatformContent): Promise<PlatformPostResult>;
  getMetrics(): Promise<PlatformMetrics>;
}

class RedditAdapter implements PlatformAdapter {
  // Uses Reddit API or scheduled manual posting prompts
  // For automated: Reddit API with OAuth
  // For manual: Handler generates content, user copies to Reddit
  // Hybrid: Handler queues content, user approves + posts
}

class AdultPlatformAdapter implements PlatformAdapter {
  // OnlyFans/Fansly don't have public APIs
  // Handler generates content + caption
  // User uploads through platform UI
  // Manual tracking of post results
}

// For MVP: Handler generates content, presents as a task
// "Post this to your subreddit. Here's the text."
// The task tracks whether it was completed
// Full automation comes later with API integration
```

**MVP approach:** Treat platform publishing as a task type. Handler generates content → assigns posting as a task → user does it → evidence captured. This fits the existing task completion pattern.

---

### GAP 7: Coach Context Size vs Token Budget

**Current system prompt:** ~30 lines, static.
**Feature 43 coach context:** References 50+ data points. Full context string would be 2000+ tokens.

**SOLUTION: Context Tiers**

```typescript
// Not every AI call needs the full context

enum ContextTier {
  MINIMAL = 'minimal',     // Task enhancement: denial day, arousal, time
  STANDARD = 'standard',   // Morning briefing: + streaks, domains, commitments
  COERCION = 'coercion',   // Vault/threat: + vault status, compliance rate, resistance history
  PARTNER = 'partner',     // Partner operations: + relationship data, meetup history
  FULL = 'full',           // Strategic planning: everything
}

function buildContext(state: any, tier: ContextTier): string {
  let context = `Day ${state.denialDay}, arousal ${state.currentArousal}/5, ${state.timeOfDay}`;
  
  if (tier === ContextTier.MINIMAL) return context;
  
  // Standard adds daily context
  context += `\nStreak: ${state.streakDays}d | Tasks today: ${state.tasksCompletedToday}`;
  context += `\nAvoiding: ${state.avoidedDomains.join(', ') || 'none'}`;
  if (state.pendingGinaCommitment) context += `\nPending: ${state.pendingGinaCommitment}`;
  
  if (tier === ContextTier.STANDARD) return context;
  
  // Coercion adds enforcement data
  context += `\nVault: ${state.vaultItemCount} items (T1:${state.t1} T2:${state.t2} T3:${state.t3} T4:${state.t4} T5:${state.t5})`;
  context += `\nCompliance under threat: ${state.vaultComplianceRate}%`;
  context += `\nSwitch: ${state.switchArmed ? 'ARMED' : 'off'} | Silence: ${state.currentSilenceDays}d`;
  context += `\nResistance futility rate: ${state.resistanceFutilityRate}%`;
  
  if (tier === ContextTier.COERCION) return context;
  
  // Partner adds relationship data
  context += `\nPartners: ${state.activePartners.map(p => `${p.alias}(${p.meetups}x)`).join(', ')}`;
  context += `\nSelf-initiated hookups: ${state.selfInitiatedCount}`;
  context += `\nIncoming messages today: ${state.incomingMessages}`;
  
  if (tier === ContextTier.PARTNER) return context;
  
  // Full adds everything
  context += `\nFindom: $${state.monthlyIncome}/mo | Dependency: ${state.dependencyRatio}%`;
  context += `\nIdentity: Maxy ${state.maxyRatio}% / David ${state.davidRatio}%`;
  context += `\nAnchors: ${Object.entries(state.anchors).map(([k,v]) => `${k}:${v}/10`).join(', ')}`;
  context += `\nBrainwashing stage: ${state.brainwashingStage}`;
  context += `\nTimed threats: ${state.activeTimedThreats} active, next deadline: ${state.nextDeadline}`;
  
  return context;
}
```

---

### GAP 8: Coercion Decision Engine Doesn't Exist

**Current:** Handler has no decision-making about enforcement. It selects a task and presents it.

**Feature 43 needs:** A decision engine that evaluates resistance, selects coercion level, chooses vault items, decides consequence type, and tracks effectiveness.

**SOLUTION: Coercion Engine as New Handler Layer**

```typescript
// This becomes Layer 1.5 — sits between Rules and AI

class CoercionEngine {
  
  // Called when a task is declined or resistance detected
  async handleResistance(
    task: Task | DynamicTask,
    state: CoercionDecisionState,
    resistanceType: string
  ): Promise<CoercionResponse> {
    
    // Step 1: Determine minimum effective coercion level
    const level = this.determineLevel(task, state, resistanceType);
    
    // Step 2: Select appropriate mechanism
    if (level <= 4) {
      // Template-based response (no API cost)
      return {
        level,
        response: this.templates.getCoercionAtLevel(level, state),
        mechanism: level <= 2 ? 'reframe' : level <= 3 ? 'compliance_gate' : 'punishment',
      };
    }
    
    if (level <= 6) {
      // AI-enhanced (moderate API cost)
      const response = await this.ai.callAI({
        systemPrompt: HANDLER_COERCION_PROMPT,
        prompt: this.buildCoercionPrompt(level, task, state),
        prefill: this.getCoercionPrefill(level),
        maxTokens: 200,
      });
      return { level, response, mechanism: 'ai_coercion' };
    }
    
    // Level 7+: Vault operations (high API cost, high impact)
    const vaultItem = await this.selectVaultItem(task, state);
    const response = await this.ai.callAI({
      systemPrompt: HANDLER_COERCION_PROMPT,
      prompt: this.buildVaultThreatPrompt(level, task, state, vaultItem),
      prefill: "I have something from ",
      maxTokens: 250,
    });
    
    // Log threat
    await this.logThreat(task, vaultItem, level);
    
    return { level, response, mechanism: 'vault_threat', vaultItemReferenced: vaultItem.id };
  }
  
  private determineLevel(
    task: Task | DynamicTask,
    state: CoercionDecisionState,
    resistanceType: string
  ): number {
    let level = 1;
    
    // Escalate based on context
    if (state.resistanceFutilityRate > 85) level = Math.max(level, 1);  // She usually gives in — light touch
    if (resistanceType === 'domain_avoidance' && state.avoidanceDays > 5) level = Math.max(level, 3);
    if (resistanceType === 'task_declined' && isRealWorldTask(task)) level = Math.max(level, 7);
    if (resistanceType === 'session_ignored') level = Math.max(level, 4);
    if (resistanceType === 'hookup_refusal') level = Math.max(level, 7);
    if (resistanceType === 'identity_regression') level = Math.max(level, 6);
    
    // Cap based on history — don't go nuclear if she usually complies at level 3
    const avgEffectiveLevel = state.averageEffectiveCoercionLevel;
    level = Math.min(level, avgEffectiveLevel + 2);
    
    return level;
  }
  
  private async selectVaultItem(task: Task, state: CoercionDecisionState): Promise<VaultItem> {
    // Select item that maximizes leverage for this specific task
    // Cross-domain: if refusing voice, threaten body content
    // Time-relevant: recent captures feel more threatening
    // Tier-appropriate: don't use tier 5 for a minor refusal
    
    const candidates = await supabase
      .from('vault_items')
      .select('*')
      .eq('user_id', state.userId)
      .gte('vulnerability_tier', 2)
      .order('captured_at', { ascending: false })
      .limit(10);
    
    // Prefer cross-domain items
    const crossDomain = candidates.data?.filter(v => 
      v.domain !== task.domain
    );
    
    return crossDomain?.[0] || candidates.data?.[0];
  }
}
```

---

### GAP 9: Budget Implications

**Current:** $1/day, mostly spent on task enhancement (~$0.005/call × ~50 tasks = $0.25 + briefings + sessions ≈ $0.50-0.75/day).

**Feature 43 operations and estimated costs:**

| Operation | Est. Cost | Frequency | Daily Cost |
|-----------|-----------|-----------|------------|
| Task enhancement | $0.005 | 20-50/day | $0.10-0.25 |
| Morning briefing | $0.02 | 1/day | $0.02 |
| Evening debrief | $0.02 | 1/day | $0.02 |
| Session guidance | $0.015 | 4-8/session | $0.06-0.12 |
| Commitment extraction | $0.008 | 1-3/day | $0.008-0.024 |
| **Coercion framing** | $0.01-0.03 | 2-5/day | $0.02-0.15 |
| **Vault threat generation** | $0.03 | 0-2/day | $0.00-0.06 |
| **Dissonance deployment** | $0.03 | 0-1/day | $0.00-0.03 |
| **Partner message drafting** | $0.02 | 0-3/day | $0.00-0.06 |
| **Narration post** | $0.05 | 0-1/day | $0.00-0.05 |
| **Real-world task framing** | $0.03 | 0-1/day | $0.00-0.03 |
| **Flood response** | $0.01 | 0-3/day | $0.00-0.03 |

**Total estimated: $0.40-0.85/day** (still within $1 budget for normal days)

**Heavy days** (active resistance + vault threat + narration + partner ops): $1.50-2.00

**SOLUTION: Priority-based budget allocation**

```typescript
class BudgetManager {
  private tiers = {
    critical: 0.40,    // 40% reserved: vault threats, switch, coercion L7+
    important: 0.30,   // 30%: sessions, briefings, dissonance
    routine: 0.20,     // 20%: task enhancement, partner messages
    reserve: 0.10,     // 10%: emergency (crisis, first hookup, major milestone)
  };
  
  canSpend(amount: number, priority: 'critical' | 'important' | 'routine'): boolean {
    // Critical always gets funded
    // Important funded if critical hasn't consumed its tier
    // Routine funded if budget allows
    // Reserve only for emergencies
  }
}
```

On heavy resistance days, routine task enhancement falls to templates while coercion gets full AI support. The enforcement never goes silent.

---

## MIGRATION PATH

### Phase 3 Implementation Order (with Feature 43 integration)

```
STEP 1: Extend UserState → Layered State Loading
  - Add CoercionState, RelationshipState, IdentityState, FinancialState interfaces
  - Build state loaders from Supabase queries
  - Existing code doesn't break — CoreState is superset of old UserState

STEP 2: Create Feature 43 Database Tables
  - Run migration SQL from Feature 43 specs
  - All new tables, no changes to existing tables
  - Add RLS policies consistent with existing

STEP 3: Upgrade AI Call Pattern
  - Replace single callAPI() with operation-specific callers
  - Add prefill support
  - Add context tier system
  - Existing calls wrapped in new pattern (backward compatible)

STEP 4: Build Coercion Engine
  - New class alongside existing RulesEngine
  - Handles resistance events
  - Template fallbacks for levels 1-4
  - AI-powered for levels 5+
  - Vault item selection logic

STEP 5: Extend Template Engine
  - Add all new template categories
  - Vault threats, coercion, real-world, dissonance, flooding
  - Pure additive — no changes to existing templates

STEP 6: Add Dynamic Task Source
  - DynamicTask extends Task
  - prescribe() method chooses CSV vs dynamic
  - UI unchanged — still receives task-shaped objects

STEP 7: Event System
  - Supabase Edge Functions for scheduled checks
  - Client-side surfacing detector
  - PWA push notifications

STEP 8: Platform Publishing (MVP)
  - Content generation as task type
  - User posts manually
  - Evidence tracking for completion

STEP 9: Partner & Findom Tables + UI
  - Relationship management views
  - Financial tracking dashboard
  - Communication identity management
```

### What Doesn't Change
- React/TypeScript/Vite/Tailwind frontend
- Supabase as backend
- Task CSV as primary content source for 7 domains
- Three-layer degradation (Rules → Templates → AI)
- DirectiveCard UI component
- Compulsory gates
- Compliance gating
- Timing engine

### What Extends
- UserState (additive)
- Template Engine (additive)
- AI Handler (new call patterns)
- Budget Manager (priority tiers)
- Database (new tables)

### What's New
- Coercion Engine (new class)
- Event System (Edge Functions + client detector)
- Dynamic Task Generator (new class)
- Platform Adapters (new module)
- Surfacing Detector (new class)

---

## CONCLUSION

The existing architecture is sound. Feature 43 doesn't break it — it extends it. The three-layer pattern (Rules → Templates → AI) scales to cover coercion, vault management, partner operations, and brainwashing mechanisms. The key insight is that **coercion is just another layer in the task delivery pipeline**, sitting between task selection and task presentation.

The biggest additions are:
1. Coercion Engine (new decision-making layer)
2. Event System (push-based triggers)
3. Dynamic Task Source (beyond CSV)
4. Extended Templates (fallbacks for all new operations)
5. Layered State Loading (efficient context building)

None of these require rewriting existing code. They compose alongside it.
