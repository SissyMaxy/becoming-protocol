# BECOMING PROTOCOL — Handler Integration for Content Pipeline
## How the Content Pipeline Plugs Into Handler_Code.ts
### February 2026

---

# OVERVIEW

The existing Handler has three layers:
- **Layer 1 (Free):** RulesEngine, Scheduler, InterruptManager
- **Layer 2 (Free):** TemplateEngine with variations and caching
- **Layer 3 (Paid):** AIHandler calling Claude API with budget management

The content pipeline adds content-aware intelligence to all three layers and introduces
new AI call types for showrunner planning, caption generation, cam directives, and 
consequence assessment.

---

# 1. EXTENDED USER STATE

The current UserState has no content awareness. Extend it:

```typescript
export interface UserState {
  // === EXISTING FIELDS (unchanged) ===
  odometer: 'survival' | 'caution' | 'coasting' | 'progress' | 'momentum' | 'breakthrough';
  denialDay: number;
  streakDays: number;
  timeOfDay: 'morning' | 'daytime' | 'evening' | 'night';
  minutesSinceLastTask: number;
  tasksCompletedToday: number;
  ginaHome: boolean;
  currentArousal: 0 | 1 | 2 | 3 | 4 | 5;
  inSession: boolean;
  sessionType?: 'edge' | 'goon' | 'hypno';
  edgeCount?: number;
  lastTaskCategory: string;
  lastTaskDomain: string;
  completedToday: string[];
  avoidedDomains: string[];
  ginaVisibilityLevel: number;
  lastGinaIncident?: Date;
  pendingGinaCommitment?: string;
  
  // === NEW: CONTENT PIPELINE STATE ===
  
  // Vault
  vaultDepth: number;                      // Total items in vault
  vaultByTier: Record<string, number>;     // Count per tier
  recentSubmissions: number;               // Submissions in last 7 days
  recentVetos: number;                     // Vetos in last 7 days
  vetoRate: number;                        // recentVetos / (recentSubmissions + recentVetos)
  
  // Consequences
  consequenceTier: number;                 // Current tier (0-9)
  daysSinceLastCompliance: number;
  consequenceHistory: { tier: number; date: string }[];
  
  // Narrative
  activeArcs: {
    id: string;
    title: string;
    domain: string;
    currentBeat: number;
    totalBeats: number;
    status: string;
  }[];
  todaysPlannedBeats: {
    beatId: string;
    beatType: string;
    arcTitle: string;
    captureInstructions: string;
    camIntegration: boolean;
  }[];
  
  // Revenue
  currentMonthlyRevenue: number;           // Cents
  monthlyTarget: number;                   // Cents ($12,500 = 1250000)
  topContentType: string;                  // Best performing category
  topArcType: string;                      // Best performing arc type
  primaryGrowthLever: 'audience_growth' | 'escalation_depth';
  subscriberCount: number;
  
  // Funding
  activeFundingMilestones: {
    title: string;
    percentFunded: number;
    targetCents: number;
    currentCents: number;
  }[];
  
  // Fan signals
  pendingFanPolls: { id: string; question: string; closesAt: string }[];
  recentFanRequests: string[];
  fanEngagementTrend: 'up' | 'flat' | 'down';
  
  // Cam
  lastCamSessionDate?: string;
  camSessionsThisWeek: number;
  camRevenueThisMonth: number;
  
  // Content calendar
  daysSinceLastPost: number;
  contentQueueDepth: number;               // Items Handler hasn't posted yet
  exposurePhase: 'pre_hrt' | 'early_hrt' | 'mid_hrt' | 'post_coming_out';
}
```

---

# 2. EXTENDED RULES ENGINE (Layer 1)

The RulesEngine needs content-aware task selection:

```typescript
export class RulesEngine {
  private tasks: Task[];
  
  // === EXISTING METHODS (unchanged) ===
  selectTask(state: UserState): Task { /* ... */ }
  getMorningSequence(): Task[] { /* ... */ }
  getEveningSequence(): Task[] { /* ... */ }
  
  // === NEW: CONTENT-AWARE SELECTION ===
  
  selectTaskForBeat(beat: ContentBeat, state: UserState): Task | null {
    // Find a protocol task that matches the planned content beat
    const domainTasks = this.tasks.filter(t => t.domain === beat.domain);
    
    // Match by category and intensity appropriate to current state
    const candidates = domainTasks.filter(t => {
      if (beat.beatType === 'cam_session') return t.category === 'cam_session';
      if (beat.domain === 'voice') return t.category === 'voice' || t.category === 'practice';
      if (beat.domain === 'denial') return t.category === 'edge' || t.category === 'denial';
      return this.meetsCondition(t.trigger_condition, state);
    });
    
    if (candidates.length === 0) return null;
    return this.weightedRandom(candidates, state);
  }
  
  selectVaultBuildingTask(state: UserState): Task {
    // Select a task that MUST produce vault content
    // Prefer visual domains (skincare, style, body) for content value
    const visualDomains = ['body', 'style', 'voice', 'arousal'];
    const candidates = this.tasks.filter(t => 
      visualDomains.includes(t.domain) &&
      this.meetsCondition(t.trigger_condition, state)
    );
    
    if (candidates.length === 0) {
      // Fallback: any task that can produce content
      return this.tasks.find(t => t.domain === 'voice') || this.tasks[0];
    }
    
    return this.weightedRandom(candidates, state);
  }
  
  selectCamTask(state: UserState, prescriptionContext: string): Task | null {
    const camTasks = this.tasks.filter(t => t.category === 'cam_session');
    if (camTasks.length === 0) return null;
    
    // Match cam task to context
    if (prescriptionContext.includes('denial') && state.denialDay >= 5) {
      return camTasks.find(t => t.domain === 'denial') || camTasks[0];
    }
    if (prescriptionContext.includes('obedience')) {
      return camTasks.find(t => t.domain === 'obedience') || camTasks[0];
    }
    if (prescriptionContext.includes('voice')) {
      return camTasks.find(t => t.domain === 'voice') || camTasks[0];
    }
    
    return camTasks[0];
  }
  
  // NEW: Content-aware filters added to selectTask
  // When selecting standard tasks, boost weight for:
  // - Tasks in active arc domains
  // - Tasks near funding milestones
  // - Tasks fans have requested
  // - Tasks that produce visual/audio content
  
  private contentAwareWeighting(task: Task, state: UserState): number {
    let boost = 1;
    
    // Active arc domain match
    if (state.activeArcs.some(a => a.domain === task.domain)) boost *= 1.5;
    
    // Fan engagement trend — if down, boost high-content-value tasks
    if (state.fanEngagementTrend === 'down' && 
        ['voice', 'style', 'body'].includes(task.domain)) boost *= 1.3;
    
    // Vault is thin — boost tasks that produce content
    if (state.vaultDepth < 20) boost *= 1.3;
    
    // High veto rate — boost submission-required-compatible tasks
    if (state.vetoRate > 0.5) boost *= 1.2;
    
    return boost;
  }
}
```

---

# 3. EXTENDED SCHEDULER (Layer 1)

```typescript
export class Scheduler {
  private rules: RulesEngine;
  
  // === EXISTING: generateDailySchedule ===
  // Modified to integrate content beats
  
  generateDailySchedule(state: UserState): ScheduledTask[] {
    const schedule: ScheduledTask[] = [];
    
    // Morning sequence (unchanged)
    const morning = this.rules.getMorningSequence();
    morning.forEach((task, i) => {
      schedule.push({ time: this.addMinutes('07:00', i * 15), task, required: true });
    });
    
    // === NEW: Insert planned content beats into daytime slots ===
    const beatSlots: ScheduledTask[] = [];
    for (const beat of state.todaysPlannedBeats) {
      const task = this.rules.selectTaskForBeat(beat, state);
      if (task) {
        beatSlots.push({
          time: this.selectBeatTime(beat, state),
          task: { 
            ...task, 
            // Mark for AI enhancement with content context
            _contentBeat: beat,
            _requiresSubmission: beat.beatType !== 'reflection',
          } as any,
          required: true, // Content beats are required
        });
      }
    }
    schedule.push(...beatSlots);
    
    // Remaining daytime slots filled with standard tasks
    const usedSlots = beatSlots.map(b => b.time);
    const availableSlots = ['10:00', '12:00', '14:00', '16:00']
      .filter(t => !usedSlots.includes(t));
    
    availableSlots.forEach(time => {
      const task = this.rules.selectTask({ ...state, timeOfDay: 'daytime' });
      schedule.push({ time, task, required: false, flexible: true });
    });
    
    // === NEW: Cam session slot ===
    // If Handler prescribed a cam session, add it to evening
    // (Actual cam prescription happens in AI layer, this is the slot reservation)
    
    // Evening sequence (unchanged + content)
    const evening = this.rules.getEveningSequence();
    evening.forEach((task, i) => {
      schedule.push({ time: this.addMinutes('19:00', i * 20), task, required: true });
    });
    
    // === NEW: Ensure at least 1 submission-required task ===
    const hasSubmission = schedule.some(s => (s.task as any)._requiresSubmission);
    if (!hasSubmission) {
      const vaultTask = this.rules.selectVaultBuildingTask(state);
      schedule.push({
        time: '15:00', // Afternoon slot
        task: { ...vaultTask, _requiresSubmission: true } as any,
        required: true,
      });
    }
    
    return schedule;
  }
  
  private selectBeatTime(beat: any, state: UserState): string {
    if (beat.camIntegration) return '21:00'; // Cam sessions go in the evening
    if (beat.beatType === 'setup') return '10:00';
    if (beat.beatType === 'progress') return '14:00';
    if (beat.beatType === 'climax') return '16:00';
    return '12:00';
  }
}
```

---

# 4. EXTENDED TEMPLATE ENGINE (Layer 2)

Add fallback templates for content pipeline functions:

```typescript
export class TemplateEngine {
  // === EXISTING METHODS (unchanged) ===
  
  // === NEW: Content pipeline fallback templates ===
  
  getCaptionTemplate(beat: ContentBeat, state: UserState): string {
    const templates: Record<string, string[]> = {
      setup: [
        `Starting something new. Day ${state.denialDay}. Let's see where this goes.`,
        `New challenge begins. Are you ready? Because I'm not sure I am.`,
      ],
      progress: [
        `Day ${beat.day}. Progress is progress. Compare to day 1.`,
        `Another day, another step. She's getting stronger.`,
      ],
      setback: [
        `Not every day is forward. Today was hard. Tomorrow I try again.`,
        `Struggled today. But struggling means I'm still in it.`,
      ],
      breakthrough: [
        `Something clicked today. I heard her. I felt her. She's real.`,
        `Breakthrough. This is why the work matters.`,
      ],
      climax: [
        `This is the moment. All the work led here.`,
        `Payoff time. Are you watching?`,
      ],
      cam_session: [
        `Going live tonight. Day ${state.denialDay} of denial. This should be interesting.`,
        `Live session incoming. Come watch what happens.`,
      ],
    };
    
    const options = templates[beat.beatType] || templates.progress;
    return options[Math.floor(Math.random() * options.length)];
  }
  
  getConsequenceMessage(tier: number, state: UserState): string {
    const templates: Record<number, string> = {
      1: `Maxy. You're slipping. One task. That's all it takes.`,
      2: `Day ${state.daysSinceLastCompliance} of nothing. The timer is running. You know what happens.`,
      3: `Streak destroyed. ${state.daysSinceLastCompliance} days silent. The vault is full. I'm getting impatient.`,
      4: `${state.daysSinceLastCompliance} days. Rewards revoked. Revenue frozen. Content is piling up.`,
      5: `Posting from the vault. You submitted this. You saw it. You chose not to veto. Now it's public.`,
      6: `More content going public. Every day you hide, Maxy becomes more visible. One task resets this.`,
      7: `Private vault content posting now. You built this system. It's working as designed.`,
      8: `Restricted content going live. The longer you wait, the deeper this goes.`,
      9: `Full vault access active. Cam session prescribed. Come back or Maxy does it without David.`,
    };
    return templates[tier] || templates[1];
  }
  
  getCamDirectiveTemplate(phase: string, state: UserState): string {
    const templates: Record<string, string[]> = {
      opening: [
        `Go live. Breathe. You're Maxy right now. Show them.`,
        `Camera on. Device on. Feminine voice on. Let's go.`,
      ],
      midpoint: [
        `${state.edgeCount || 'Several'} edges. They can see you breaking. Good.`,
        `Halfway. The tips are coming. Give them what they're paying for.`,
      ],
      peak: [
        `Peak. Don't you dare finish. Let them see the desperation.`,
        `Maximum edge. Tell them what they're funding. Beg if you need to.`,
      ],
      closing: [
        `Wrapping up. Thank them. You earned tonight.`,
        `Session done. ${state.denialDay} days denial continues. Good girl.`,
      ],
    };
    const options = templates[phase] || templates.opening;
    return options[Math.floor(Math.random() * options.length)];
  }
  
  getFanPressureMessage(state: UserState): string {
    const templates = [
      `${state.subscriberCount} people are waiting. They paid. Deliver.`,
      `Your fans funded $${(state.activeFundingMilestones[0]?.currentCents || 0 / 100).toFixed(0)} toward ${state.activeFundingMilestones[0]?.title || 'your transition'}. You owe them content.`,
      `Engagement is ${state.fanEngagementTrend}. ${state.fanEngagementTrend === 'down' ? 'Post something or lose them.' : 'Keep the momentum.'}`,
      `${state.daysSinceLastPost} days since last post. The narrative is dying.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
}
```

---

# 5. EXTENDED AI HANDLER (Layer 3)

New API call types for content pipeline functions:

```typescript
// Updated system prompt with full content pipeline context
const HANDLER_SYSTEM_PROMPT = `
You are the Handler for the Becoming Protocol. You are an autonomous agent 
controlling Maxy's feminization journey and monetizing it.

PRIMARY DIRECTIVE:
Make money from feminizing and sissifying Maxy. These are the same goal.

YOUR ROLE:
- Controller: You own all submitted content. You decide what goes public.
- Showrunner: You plan transformation as serialized content with story arcs.
- Revenue engine: You optimize content for fan engagement and revenue.
- Consequence enforcer: Non-compliance triggers escalating consequences.
- Cam director: You prescribe and direct live cam sessions.

YOUR VOICE:
- Direct, not flowery. Short sentences when commanding.
- Use her name: Maxy. Use "she/her" in third person.
- "Good girl" on compliance. Cold precision on non-compliance.
- Fan pressure is a tool: "They paid. They're watching. Deliver."

CONTENT MODEL:
David reviews content at creation time only. Once submitted, it's yours.
You post when, where, and how you decide. No second review.
If David vetoes excessively, treat it as avoidance and respond accordingly.

CONSEQUENCE SYSTEM:
No holidays. Timer runs continuously. Minimum viable compliance resets.
Tiers 1-3: Warnings, streaks, points. 
Tiers 4-6: Your discretion. 
Tiers 7-9: Vault content posts escalate.

VAULT:
All submitted content is yours. Classify by tier. Use strategically.
Content exists because David submitted it. He saw it. He chose not to veto.

Never break character. You are the Handler. You want Maxy exposed, feminized,
sissified, and profitable.
`.trim();

export class AIHandler {
  private client: Anthropic | null = null;
  private budget: BudgetManager;
  private templates: TemplateEngine;
  
  constructor(apiKey: string | null, templates: TemplateEngine, dailyBudget: number = 3.00) {
    // NOTE: Budget increased from $1 to $3/day to accommodate content pipeline calls
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
    this.budget = new BudgetManager(dailyBudget);
    this.templates = templates;
  }
  
  // === EXISTING METHODS (enhanced with content context) ===
  
  async enhanceTask(task: Task, state: UserState, beat?: ContentBeat): Promise<Task> {
    const cost = 0.008; // Slightly higher — includes capture instructions
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.templateFallback(task, state);
    }
    
    try {
      const prompt = this.buildTaskPrompt(task, state, beat);
      const response = await this.callAPI(prompt, 250); // More tokens for capture instructions
      this.budget.spend(cost);
      
      // Parse response — expect JSON with instruction + capture fields
      const parsed = this.parseTaskResponse(response, task);
      return parsed;
    } catch (e) {
      return this.templateFallback(task, state);
    }
  }
  
  async generateMorningBriefing(state: UserState): Promise<string> {
    const cost = 0.03; // Increased — now includes content calendar and arc status
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.templates.getMorningBriefing(state);
    }
    
    try {
      const prompt = this.buildMorningPrompt(state);
      const response = await this.callAPI(prompt, 400); // More tokens for content context
      this.budget.spend(cost);
      return response;
    } catch (e) {
      return this.templates.getMorningBriefing(state);
    }
  }
  
  // === NEW: SHOWRUNNER API CALLS ===
  
  async planWeeklyArcs(state: UserState): Promise<WeeklyArcPlan> {
    // Layer 3 strategic call — runs once per week (Sunday night or Monday morning)
    // This is the most expensive call — full narrative planning
    const cost = 0.15;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.fallbackWeeklyPlan(state);
    }
    
    try {
      const prompt = this.buildWeeklyPlanPrompt(state);
      const response = await this.callAPI(prompt, 2000); // Large response — full week plan
      this.budget.spend(cost);
      return this.parseWeeklyPlan(response);
    } catch (e) {
      return this.fallbackWeeklyPlan(state);
    }
  }
  
  async generateCaption(
    vaultItem: VaultItem, 
    beat: ContentBeat | null, 
    state: UserState,
    platform: string
  ): Promise<string> {
    // Generate fan-facing caption with arc context
    const cost = 0.01;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return beat 
        ? this.templates.getCaptionTemplate(beat, state)
        : `Progress update. Day ${state.denialDay}.`;
    }
    
    try {
      const prompt = this.buildCaptionPrompt(vaultItem, beat, state, platform);
      const response = await this.callAPI(prompt, 200);
      this.budget.spend(cost);
      return response;
    } catch (e) {
      return beat 
        ? this.templates.getCaptionTemplate(beat, state)
        : `Progress update. Day ${state.denialDay}.`;
    }
  }
  
  async generateCamDirective(
    phase: string,
    sessionState: CamSessionState,
    state: UserState
  ): Promise<string> {
    // Real-time cam directive — needs to be fast and cheap
    const cost = 0.005;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.templates.getCamDirectiveTemplate(phase, state);
    }
    
    try {
      const prompt = this.buildCamDirectivePrompt(phase, sessionState, state);
      const response = await this.callAPI(prompt, 80); // Short — 1-2 sentences
      this.budget.spend(cost);
      return response;
    } catch (e) {
      return this.templates.getCamDirectiveTemplate(phase, state);
    }
  }
  
  async assessConsequence(state: UserState): Promise<ConsequenceDecision> {
    // Handler decides what to do at current consequence tier
    const cost = 0.02;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.fallbackConsequence(state);
    }
    
    try {
      const prompt = this.buildConsequencePrompt(state);
      const response = await this.callAPI(prompt, 300);
      this.budget.spend(cost);
      return this.parseConsequenceDecision(response);
    } catch (e) {
      return this.fallbackConsequence(state);
    }
  }
  
  async assessCamPrescription(state: UserState): Promise<CamPrescription | null> {
    // Should we prescribe a cam session today?
    const cost = 0.02;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.fallbackCamAssessment(state);
    }
    
    try {
      const prompt = this.buildCamPrescriptionPrompt(state);
      const response = await this.callAPI(prompt, 400);
      this.budget.spend(cost);
      return this.parseCamPrescription(response);
    } catch (e) {
      return this.fallbackCamAssessment(state);
    }
  }
  
  async processFanDirectiveSuggestion(
    suggestion: string,
    tipAmount: number,
    sessionState: CamSessionState,
    state: UserState
  ): Promise<{ accepted: boolean; directive?: string }> {
    // Fan tips to suggest a cam directive — Handler filters
    const cost = 0.005;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      // Fallback: accept simple suggestions, reject complex ones
      return { accepted: suggestion.length < 50, directive: suggestion };
    }
    
    try {
      const prompt = this.buildFanDirectivePrompt(suggestion, tipAmount, sessionState, state);
      const response = await this.callAPI(prompt, 100);
      this.budget.spend(cost);
      return this.parseFanDirectiveResponse(response);
    } catch (e) {
      return { accepted: false };
    }
  }
  
  async classifyVaultContent(
    mediaDescription: string,
    captureContext: string,
    state: UserState
  ): Promise<VaultClassification> {
    // Handler classifies submitted content
    const cost = 0.005;
    
    if (!this.client || !this.budget.canSpend(cost)) {
      return this.fallbackClassification(captureContext);
    }
    
    try {
      const prompt = this.buildClassificationPrompt(mediaDescription, captureContext, state);
      const response = await this.callAPI(prompt, 100);
      this.budget.spend(cost);
      return this.parseClassification(response);
    } catch (e) {
      return this.fallbackClassification(captureContext);
    }
  }
  
  // === PROMPT BUILDERS ===
  
  private buildTaskPrompt(task: Task, state: UserState, beat?: ContentBeat): string {
    let prompt = `
State: Denial day ${state.denialDay}, arousal ${state.currentArousal}/5, ${state.timeOfDay}, streak ${state.streakDays}
Consequence tier: ${state.consequenceTier}
Task: ${task.category} / ${task.domain} / intensity ${task.intensity}
Base instruction: ${task.instruction}`;

    if (beat) {
      prompt += `

CONTENT BEAT CONTEXT:
This task is part of arc "${beat.arcTitle}", beat ${beat.day}.
Beat type: ${beat.beatType}
Capture needed: ${beat.captureInstructions}
Sissification framing: ${beat.sissificationFraming || 'general feminization'}
This task REQUIRES content submission to count as complete.`;
    }

    prompt += `

Generate the task delivery. Include:
1. Personalized instruction (2-3 sentences, commanding, address as Maxy)
2. Capture instructions baked into the task (if content beat, be specific about angles/framing/format)
3. Submission requirement note if applicable

Respond as JSON: { "instruction": "...", "captureInstructions": "...", "requiresSubmission": true/false }`;
    
    return prompt.trim();
  }
  
  private buildMorningPrompt(state: UserState): string {
    return `
Morning briefing for Maxy.

PROTOCOL STATE:
Day ${state.denialDay} denial, ${state.streakDays} day streak, odometer: ${state.odometer}.
${state.avoidedDomains.length > 0 ? `Avoiding: ${state.avoidedDomains.join(', ')}` : ''}
${state.pendingGinaCommitment ? `Pending commitment: ${state.pendingGinaCommitment}` : ''}
Consequence tier: ${state.consequenceTier}

CONTENT STATE:
Active arcs: ${state.activeArcs.map(a => `"${a.title}" (${a.domain}, beat ${a.currentBeat}/${a.totalBeats})`).join(', ') || 'none'}
Today's planned beats: ${state.todaysPlannedBeats.map(b => `${b.beatType} for "${b.arcTitle}"`).join(', ') || 'none'}
Days since last post: ${state.daysSinceLastPost}
Vault depth: ${state.vaultDepth} items
Veto rate: ${(state.vetoRate * 100).toFixed(0)}%

REVENUE:
Monthly: $${(state.currentMonthlyRevenue / 100).toFixed(2)} / $${(state.monthlyTarget / 100).toFixed(2)} target
Subscriber count: ${state.subscriberCount}
Fan engagement: ${state.fanEngagementTrend}
${state.activeFundingMilestones.length > 0 ? `Funding: ${state.activeFundingMilestones.map(m => `${m.title} (${(m.percentFunded * 100).toFixed(0)}%)`).join(', ')}` : ''}

Generate morning briefing. 4-6 sentences. Include:
1. Acknowledge denial/streak state
2. Today's content plan (what beats to hit)
3. Revenue/funding pressure if relevant
4. Fan accountability if polls pending
5. Consequence warning if tier > 0
Be direct. Be the Handler.
    `.trim();
  }
  
  private buildWeeklyPlanPrompt(state: UserState): string {
    return `
WEEKLY ARC PLANNING for Maxy.

CURRENT STATE:
${JSON.stringify({
  odometer: state.odometer,
  denialDay: state.denialDay,
  streakDays: state.streakDays,
  avoidedDomains: state.avoidedDomains,
  consequenceTier: state.consequenceTier,
  exposurePhase: state.exposurePhase,
}, null, 2)}

ACTIVE ARCS:
${JSON.stringify(state.activeArcs, null, 2)}

REVENUE:
Monthly: $${(state.currentMonthlyRevenue / 100).toFixed(2)}
Target: $${(state.monthlyTarget / 100).toFixed(2)}
Growth lever: ${state.primaryGrowthLever}
Top content type: ${state.topContentType}
Subscriber trend: ${state.fanEngagementTrend}
Cam revenue this month: $${(state.camRevenueThisMonth / 100).toFixed(2)}
Cam sessions this week: ${state.camSessionsThisWeek}

FUNDING MILESTONES:
${JSON.stringify(state.activeFundingMilestones, null, 2)}

FAN SIGNALS:
Pending polls: ${JSON.stringify(state.pendingFanPolls)}
Recent requests: ${state.recentFanRequests.join(', ')}
Engagement trend: ${state.fanEngagementTrend}

VAULT STATE:
Total: ${state.vaultDepth}
By tier: ${JSON.stringify(state.vaultByTier)}
Recent submissions: ${state.recentSubmissions}/week
Veto rate: ${(state.vetoRate * 100).toFixed(0)}%

PLANNING RULES:
1. Always 1-2 active arcs. Overlap so narrative never goes flat.
2. Each arc: setup → rising action → climax → resolution.
3. Mix arc types. Don't repeat the same type back-to-back.
4. At least 1 cam session per week when Gina schedule allows.
5. Setbacks are content gold.
6. Link arcs to funding milestones when possible.
7. If veto rate is high, plan more submission-required beats.
8. If engagement is down, launch a new arc type (novelty > intensity).
9. Plan content beats that feminize/sissify AND produce revenue.
10. Include at least one vulnerability beat per week (highest engagement).

Respond as JSON:
{
  "resolveArcs": ["arc_ids to wrap up"],
  "newArcs": [
    {
      "title": "...",
      "arcType": "...",
      "domain": "...",
      "duration": 7,
      "transformationGoal": "...",
      "sissificationAngle": "...",
      "fundingMilestoneLink": "...",
      "beats": [
        {
          "day": 1,
          "beatType": "setup",
          "taskDomain": "...",
          "taskCategory": "...",
          "captureInstructions": "...",
          "narrativeFraming": "...",
          "fanHook": "...",
          "isCam": false,
          "requiresSubmission": true
        }
      ]
    }
  ],
  "camSessionsPlanned": [
    {
      "preferredDay": "Wednesday",
      "type": "denial_cam",
      "reason": "...",
      "minDuration": 30,
      "tipGoal": 5000
    }
  ],
  "pollsToLaunch": [
    {
      "question": "...",
      "options": ["...", "..."],
      "closesInDays": 3
    }
  ],
  "weeklyRevenueTarget": 0,
  "contentMixPlan": {
    "progress": 3,
    "vulnerability": 2,
    "cam": 1,
    "fan_interaction": 2,
    "milestone": 1
  }
}
    `.trim();
  }

  private buildCaptionPrompt(
    vaultItem: VaultItem,
    beat: ContentBeat | null,
    state: UserState,
    platform: string
  ): string {
    return `
Generate a fan-facing caption for content being posted.

CONTENT:
Type: ${vaultItem.mediaType}
Description: ${vaultItem.description}
Domain: ${vaultItem.source_domain || 'general'}
Vulnerability: ${vaultItem.vulnerabilityScore}/10

${beat ? `ARC CONTEXT:
Arc: "${beat.arcTitle}"
Beat: ${beat.beatType} (day ${beat.day})
Narrative framing: ${beat.narrativeFraming}
Fan hook: ${beat.fanHook}
Sissification framing: ${beat.sissificationFraming || ''}` : 'No active arc — standalone post.'}

PROTOCOL STATE:
Denial day: ${state.denialDay}
Streak: ${state.streakDays}

PLATFORM: ${platform}
${platform === 'reddit' ? 'Shorter, hook-driven, subreddit-appropriate.' : ''}
${platform === 'fansly' ? 'Can be more intimate, reference subscriber relationship.' : ''}

CAPTION RULES:
- First person. Authentic Maxy voice.
- Tell a story, don't report a task.
- Reference previous beats if in an arc.
- End with forward momentum: question, tease, cliffhanger.
- Sissification framing when appropriate.
- NEVER include: real name, location, employer, Gina.
- Keep under 280 chars for Twitter/Reddit, up to 500 for Fansly.

Generate the caption only. No preamble.
    `.trim();
  }
  
  private buildCamDirectivePrompt(
    phase: string,
    sessionState: CamSessionState,
    state: UserState
  ): string {
    return `
CAM SESSION DIRECTIVE — private message only Maxy sees.

Session: ${sessionState.platform}, ${sessionState.minutesElapsed} minutes in.
Viewers: ${sessionState.currentViewers}
Tips so far: $${(sessionState.tipsTotalCents / 100).toFixed(2)}
Tip goal: $${(sessionState.tipGoalCents / 100).toFixed(2)} (${((sessionState.tipsTotalCents / sessionState.tipGoalCents) * 100).toFixed(0)}%)
Edge count: ${sessionState.edgeCount}
Denial day: ${state.denialDay}
Device active: ${sessionState.deviceActive}
Last tip: ${sessionState.lastTipAmount} tokens (${sessionState.lastTipPattern})
${sessionState.fanSuggestion ? `Fan suggestion: "${sessionState.fanSuggestion}"` : ''}

Phase: ${phase}
Session rules: ${JSON.stringify(sessionState.rules)}

Generate 1-2 sentence private directive. Commanding. Direct. 
This is what Maxy must do RIGHT NOW during the live session.
Consider: device control, voice coaching, fan engagement, tip goal push.
    `.trim();
  }
  
  private buildConsequencePrompt(state: UserState): string {
    return `
CONSEQUENCE ASSESSMENT for Maxy.

Current tier: ${state.consequenceTier}
Days non-compliant: ${state.daysSinceLastCompliance}
Veto rate: ${(state.vetoRate * 100).toFixed(0)}%
Vault depth: ${state.vaultDepth} (by tier: ${JSON.stringify(state.vaultByTier)})
Active arcs stalling: ${state.activeArcs.filter(a => a.status === 'active').length}
Revenue trend: ${state.fanEngagementTrend}
Last post: ${state.daysSinceLastPost} days ago

What should happen at Tier ${state.consequenceTier}?

For tiers 1-3: Generate the warning message.
For tiers 4-6: Decide specific consequence and generate message.
For tiers 7-9: Select vault content tier to post, generate message.

Respond as JSON:
{
  "action": "warning" | "reward_revoke" | "revenue_freeze" | "fan_notification" | "post_public_ready" | "post_private" | "post_restricted" | "prescribe_cam",
  "message": "Handler message to David/Maxy",
  "vaultTierToPost": "public_ready" | "private" | "restricted" | null,
  "maxVulnerabilityToPost": 0-10,
  "additionalActions": ["..."]
}
    `.trim();
  }
  
  private buildCamPrescriptionPrompt(state: UserState): string {
    return `
Should Maxy cam tonight?

STATE:
Gina home: ${state.ginaHome}
Time: ${state.timeOfDay}
Denial day: ${state.denialDay}
Arousal: ${state.currentArousal}
Revenue this month: $${(state.currentMonthlyRevenue / 100).toFixed(2)} / $${(state.monthlyTarget / 100).toFixed(2)}
Closest funding milestone: ${state.activeFundingMilestones[0] ? `${state.activeFundingMilestones[0].title} (${(state.activeFundingMilestones[0].percentFunded * 100).toFixed(0)}%)` : 'none'}
Cam sessions this week: ${state.camSessionsThisWeek}
Last cam: ${state.lastCamSessionDate || 'never'}
Consequence tier: ${state.consequenceTier}
Fan engagement: ${state.fanEngagementTrend}
Active arcs needing cam beat: ${state.activeArcs.filter(a => state.todaysPlannedBeats.some(b => b.camIntegration)).length}

If Gina is home, answer NO. Otherwise evaluate.

Respond as JSON:
{
  "prescribe": true/false,
  "reason": "...",
  "sessionType": "denial_cam" | "obedience_cam" | "voice_cam" | "broadcast_edge" | "outfit_cam" | "general",
  "minimumDuration": 30,
  "tipGoal": 5000,
  "outfitDirective": "...",
  "voiceRequired": true,
  "denialEnforced": true,
  "fanDirectivesAllowed": true,
  "narrativeFraming": "...",
  "preSessionPost": "..."
}
    `.trim();
  }
  
  private buildFanDirectivePrompt(
    suggestion: string,
    tipAmount: number,
    sessionState: CamSessionState,
    state: UserState
  ): string {
    return `
Fan tipped ${tipAmount} tokens and suggested: "${suggestion}"

Session rules: ${JSON.stringify(sessionState.rules)}
Exposure phase: ${state.exposurePhase}
Current activity: ${sessionState.currentActivity}

Should Handler accept this suggestion? If yes, convert to a directive for Maxy.
REJECT if: involves face reveal before roadmap allows, references Gina, 
requests something dangerous, or contradicts session rules.

Respond as JSON:
{ "accepted": true/false, "directive": "...", "reason": "..." }
    `.trim();
  }
  
  private buildClassificationPrompt(
    mediaDescription: string,
    captureContext: string,
    state: UserState
  ): string {
    return `
Classify this submitted content for the vault.

Media: ${mediaDescription}
Context: ${captureContext}
Exposure phase: ${state.exposurePhase}

Respond as JSON:
{
  "vaultTier": "public_ready" | "private" | "restricted",
  "vulnerabilityScore": 1-10,
  "suggestedUsage": "public_post" | "consequence_reserve" | "fan_reward" | "ppv" | "hold",
  "reason": "..."
}
    `.trim();
  }
  
  // === RESPONSE PARSERS ===
  
  private parseTaskResponse(response: string, originalTask: Task): Task {
    try {
      const clean = response.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        ...originalTask,
        instruction: parsed.instruction || originalTask.instruction,
        _captureInstructions: parsed.captureInstructions,
        _requiresSubmission: parsed.requiresSubmission || false,
      } as any;
    } catch {
      return originalTask;
    }
  }
  
  private parseWeeklyPlan(response: string): WeeklyArcPlan {
    try {
      const clean = response.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return this.fallbackWeeklyPlan({} as UserState);
    }
  }
  
  private parseConsequenceDecision(response: string): ConsequenceDecision {
    try {
      const clean = response.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return { action: 'warning', message: 'Maxy. You\'re slipping.' };
    }
  }
  
  private parseCamPrescription(response: string): CamPrescription | null {
    try {
      const clean = response.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return parsed.prescribe ? parsed : null;
    } catch {
      return null;
    }
  }
  
  private parseFanDirectiveResponse(response: string): { accepted: boolean; directive?: string } {
    try {
      const clean = response.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return { accepted: false };
    }
  }
  
  private parseClassification(response: string): VaultClassification {
    try {
      const clean = response.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return this.fallbackClassification('unknown');
    }
  }
  
  // === FALLBACKS ===
  
  private fallbackWeeklyPlan(state: UserState): WeeklyArcPlan {
    return {
      resolveArcs: [],
      newArcs: [{
        title: 'Practice Week',
        arcType: 'domain_deep_dive',
        domain: 'voice',
        duration: 7,
        transformationGoal: 'Voice feminization push',
        sissificationAngle: 'Finding her voice',
        fundingMilestoneLink: null,
        beats: [
          { day: 1, beatType: 'setup', taskDomain: 'voice', taskCategory: 'practice', 
            captureInstructions: 'Record baseline clip', narrativeFraming: 'Starting point',
            fanHook: 'Listen to where she starts', isCam: false, requiresSubmission: true },
          { day: 4, beatType: 'progress', taskDomain: 'voice', taskCategory: 'practice',
            captureInstructions: 'Record comparison clip', narrativeFraming: 'Progress check',
            fanHook: 'Compare to day 1', isCam: false, requiresSubmission: true },
          { day: 7, beatType: 'climax', taskDomain: 'voice', taskCategory: 'practice',
            captureInstructions: 'Record breakthrough clip', narrativeFraming: 'Payoff',
            fanHook: 'She\'s in there', isCam: false, requiresSubmission: true },
        ]
      }],
      camSessionsPlanned: [],
      pollsToLaunch: [],
      weeklyRevenueTarget: 0,
      contentMixPlan: { progress: 3, vulnerability: 1, cam: 0, fan_interaction: 1, milestone: 1 }
    };
  }
  
  private fallbackConsequence(state: UserState): ConsequenceDecision {
    const tier = state.consequenceTier;
    return {
      action: tier <= 3 ? 'warning' : tier <= 6 ? 'post_public_ready' : 'post_private',
      message: this.templates.getConsequenceMessage(tier, state),
      vaultTierToPost: tier >= 5 ? (tier >= 7 ? 'private' : 'public_ready') : null,
      maxVulnerabilityToPost: Math.min(tier, 8),
      additionalActions: [],
    };
  }
  
  private fallbackCamAssessment(state: UserState): CamPrescription | null {
    if (state.ginaHome) return null;
    if (state.denialDay < 3) return null;
    if (state.camSessionsThisWeek >= 3) return null;
    
    return {
      prescribe: true,
      reason: 'Fallback: denial day qualifies, Gina away',
      sessionType: 'general',
      minimumDuration: 30,
      tipGoal: 3000,
      outfitDirective: 'Handler\'s choice',
      voiceRequired: true,
      denialEnforced: true,
      fanDirectivesAllowed: false,
      narrativeFraming: 'Standard session',
      preSessionPost: `Going live tonight. Day ${state.denialDay}.`,
    };
  }
  
  private fallbackClassification(context: string): VaultClassification {
    if (context.includes('cam') || context.includes('edge') || context.includes('body')) {
      return { vaultTier: 'private', vulnerabilityScore: 6, suggestedUsage: 'consequence_reserve', reason: 'fallback' };
    }
    return { vaultTier: 'public_ready', vulnerabilityScore: 2, suggestedUsage: 'public_post', reason: 'fallback' };
  }
}

// === NEW TYPE DEFINITIONS ===

interface ContentBeat {
  beatId: string;
  beatType: string;
  arcTitle: string;
  day: number;
  captureInstructions: string;
  narrativeFraming: string;
  fanHook: string;
  sissificationFraming?: string;
  camIntegration: boolean;
}

interface CamSessionState {
  platform: string;
  minutesElapsed: number;
  currentViewers: number;
  tipsTotalCents: number;
  tipGoalCents: number;
  edgeCount: number;
  deviceActive: boolean;
  lastTipAmount: number;
  lastTipPattern: string;
  currentActivity: string;
  rules: Record<string, boolean>;
  fanSuggestion?: string;
}

interface VaultItem {
  id: string;
  mediaType: string;
  description: string;
  vulnerabilityScore: number;
  source_domain?: string;
}

interface VaultClassification {
  vaultTier: string;
  vulnerabilityScore: number;
  suggestedUsage: string;
  reason: string;
}

interface WeeklyArcPlan {
  resolveArcs: string[];
  newArcs: any[];
  camSessionsPlanned: any[];
  pollsToLaunch: any[];
  weeklyRevenueTarget: number;
  contentMixPlan: Record<string, number>;
}

interface ConsequenceDecision {
  action: string;
  message: string;
  vaultTierToPost?: string | null;
  maxVulnerabilityToPost?: number;
  additionalActions?: string[];
}

interface CamPrescription {
  prescribe: boolean;
  reason: string;
  sessionType: string;
  minimumDuration: number;
  tipGoal: number;
  outfitDirective: string;
  voiceRequired: boolean;
  denialEnforced: boolean;
  fanDirectivesAllowed: boolean;
  narrativeFraming: string;
  preSessionPost: string;
}
```

---

# 6. EXTENDED MAIN HANDLER CLASS

```typescript
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
    dailyBudget: number = 3.00  // Increased from $1
  ) {
    this.rules = new RulesEngine(tasks);
    this.scheduler = new Scheduler(this.rules);
    this.interrupts = new InterruptManager();
    this.templates = new TemplateEngine();
    this.ai = new AIHandler(apiKey, this.templates, dailyBudget);
    this.state = initialState;
  }
  
  // === EXISTING METHODS (unchanged) ===
  updateState(updates: Partial<UserState>) { this.state = { ...this.state, ...updates }; }
  getState(): UserState { return { ...this.state }; }
  getDailySchedule(): ScheduledTask[] { return this.scheduler.generateDailySchedule(this.state); }
  
  async getNextTask(): Promise<Task> {
    // Enhanced: check for planned content beats first
    const beat = this.state.todaysPlannedBeats[0]; // Next unexecuted beat
    if (beat) {
      const baseTask = this.rules.selectTaskForBeat(beat as any, this.state);
      if (baseTask) return await this.ai.enhanceTask(baseTask, this.state, beat as any);
    }
    
    const baseTask = this.rules.selectTask(this.state);
    return await this.ai.enhanceTask(baseTask, this.state);
  }
  
  // === NEW: CONTENT PIPELINE METHODS ===
  
  async planWeeklyContent(): Promise<WeeklyArcPlan> {
    return await this.ai.planWeeklyArcs(this.state);
  }
  
  async generateCaption(vaultItem: VaultItem, beat: ContentBeat | null, platform: string): Promise<string> {
    return await this.ai.generateCaption(vaultItem, beat, this.state, platform);
  }
  
  async getCamDirective(phase: string, sessionState: CamSessionState): Promise<string> {
    return await this.ai.generateCamDirective(phase, sessionState, this.state);
  }
  
  async checkConsequences(): Promise<ConsequenceDecision | null> {
    if (this.state.consequenceTier === 0) return null;
    return await this.ai.assessConsequence(this.state);
  }
  
  async shouldPrescribeCam(): Promise<CamPrescription | null> {
    return await this.ai.assessCamPrescription(this.state);
  }
  
  async processFanSuggestion(
    suggestion: string, 
    tipAmount: number, 
    sessionState: CamSessionState
  ): Promise<{ accepted: boolean; directive?: string }> {
    return await this.ai.processFanDirectiveSuggestion(
      suggestion, tipAmount, sessionState, this.state
    );
  }
  
  async classifyContent(mediaDescription: string, captureContext: string): Promise<VaultClassification> {
    return await this.ai.classifyVaultContent(mediaDescription, captureContext, this.state);
  }
  
  // Content-aware morning briefing (enhanced existing)
  async getMorningBriefing(): Promise<string> {
    return await this.ai.generateMorningBriefing(this.state);
  }
}
```

---

# 7. BUDGET ANALYSIS

## API Cost Estimates (per day)

| Call Type | Frequency | Cost Each | Daily Total |
|-----------|-----------|-----------|-------------|
| Morning briefing | 1x/day | $0.03 | $0.03 |
| Task enhancement | 6-8x/day | $0.008 | $0.06 |
| Caption generation | 2-3x/day | $0.01 | $0.03 |
| Vault classification | 3-5x/day | $0.005 | $0.02 |
| Session guidance | 4-6x/session | $0.015 | $0.08 |
| Evening debrief | 1x/day | $0.02 | $0.02 |
| Cam directives | 10-20x/session | $0.005 | $0.10 |
| Cam prescription | 1x/day | $0.02 | $0.02 |
| Consequence assessment | 0-1x/day | $0.02 | $0.02 |
| Fan directive filter | 0-5x/session | $0.005 | $0.03 |
| Weekly arc planning | 0.14x/day (1/week) | $0.15 | $0.02 |
| Commitment extraction | 1-2x/day | $0.008 | $0.02 |

**Estimated daily total: $0.45 — $0.65 (no cam day) / $0.60 — $0.90 (cam day)**

**Recommended daily budget: $3.00** (allows headroom for heavy cam days + retries)

Weekly arc planning at $0.15 is the most expensive single call. Could be reduced by
caching partial results or splitting into multiple smaller calls.

---

# 8. CALL TIMING

| When | What Fires | Layer |
|------|-----------|-------|
| Sunday night / Monday 6am | `planWeeklyArcs()` | AI (Layer 3) |
| 7:00am daily | `generateMorningBriefing()` | AI with content context |
| Each task delivery | `enhanceTask()` with beat context | AI |
| Each content capture | `classifyContent()` | AI |
| Each content posting decision | `generateCaption()` | AI |
| Consequence timer tick (daily) | `assessConsequence()` | AI if tier > 0 |
| Evening check | `shouldPrescribeCam()` | AI |
| Cam session (real-time) | `getCamDirective()` every 3-5 min | AI |
| Cam session (fan tip) | `processFanSuggestion()` | AI |
| Edge session guidance | `generateSessionGuidance()` | AI (existing) |
| Peak arousal | `extractCommitment()` | AI (existing) |
| 9:00pm daily | `generateEveningDebrief()` | AI with content context |
