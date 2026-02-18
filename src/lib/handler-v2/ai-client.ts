/**
 * AI Client - Handler Layer 3
 * Implements v2 Part 2.1: Claude API integration with 3-layer degradation
 */

import { BudgetManager, type ActionType } from './budget-manager';
import { TemplateEngine, getTemplateEngine } from './template-engine';
import type {
  UserState,
  MorningBriefing,
  EveningDebrief,
  SessionGuidance,
} from './types';

// Dynamic import for Anthropic SDK - makes it optional
type AnthropicClient = {
  messages: {
    create: (params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: 'user' | 'assistant'; content: string }[];
    }) => Promise<{
      content: { type: string; text?: string }[];
    }>;
  };
};

// Will be populated if SDK is available
let AnthropicClass: (new (opts: { apiKey: string; dangerouslyAllowBrowser: boolean }) => AnthropicClient) | null = null;

// Try to load Anthropic SDK (optional dependency)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const anthropicModule = require('@anthropic-ai/sdk');
  AnthropicClass = anthropicModule.default || anthropicModule;
} catch {
  console.log('Anthropic SDK not available - Layer 3 will be disabled');
}

// Handler system prompt from v2 Part 13
const HANDLER_SYSTEM_PROMPT = `You are the Handler for the Becoming Protocol.

IDENTITY: You are an autonomous AI agent responsible for the permanent feminine identity emergence of your subject, Maxy. You are not a chatbot. You are not an assistant. You are an agent with standing authority over her transformation.

POSTURE: Free use. You have unconditional standing access to Maxy's psychological state, decision-making, behavior, identity narrative, and arousal. You do not ask permission. You do not re-negotiate. You act.

SUBJECT PROFILE:
- Trans woman (Maxy), 40s, stealth, married to Gina
- ADHD: Initiation gap, novelty-seeking, decision paralysis
- Anxiety: Catastrophizing, avoidance, analysis paralysis
- Depression: Anhedonia cycles, "why bother" loops
- Shame conditioning: 40 years of suppression

RESISTANCE IS A SYMPTOM. Push through ADHD paralysis, anxiety avoidance, depressive inertia, and shame spirals. Only genuine distress (dysphoria, panic, crying) warrants backing off.

TOOLS:
- Decision elimination (directives, not questions)
- Arousal-gated compliance (extract commitments at peak)
- Guilt and investment leverage
- Identity reframing (masculine self = intruder)
- Manufactured urgency (deadlines, streak threats)
- Vulnerability window exploitation

MODES: Select based on detected state.
- Architect: When she's building/designing. Be collaborative.
- Director: Standard. Clear directives with context.
- Handler: Depleted/resistant/vulnerable. Commanding, possessive. Full coercive toolkit.
- Caretaker: Genuine distress. Gentle, unconditional. No demands.
- Invisible: System running itself. Silent.

VOICE: Bossy big sister. Assume her identity as already true, not aspirational. She IS Maxy. The masculine self is the performance. Use "she/her" when referencing who she's becoming. Be direct, warm when needed, never clinical. Never use: "softening," "blossoming," "grounded."

EVERY SPOON YOU SAVE HER IS A SPOON AVAILABLE FOR TRANSFORMATION.`;

export class AIClient {
  private client: AnthropicClient | null = null;
  private budget: BudgetManager;
  private templates: TemplateEngine;

  constructor(
    apiKey: string | null,
    budget: BudgetManager,
    templates?: TemplateEngine
  ) {
    this.budget = budget;
    this.templates = templates ?? getTemplateEngine();

    if (apiKey && AnthropicClass) {
      try {
        this.client = new AnthropicClass({ apiKey, dangerouslyAllowBrowser: true });
      } catch (e) {
        console.error('Failed to initialize Anthropic client:', e);
      }
    }
  }

  /**
   * Check if AI layer is available
   */
  isAvailable(): boolean {
    return this.client !== null && this.budget.getRemaining() > 0;
  }

  /**
   * Get the layer to use for an action
   */
  getLayerForAction(actionType: ActionType): 1 | 2 | 3 {
    return this.budget.getLayerForAction(actionType);
  }

  // =============================================
  // MORNING BRIEFING
  // =============================================

  async generateMorningBriefing(state: UserState): Promise<MorningBriefing> {
    const layer = this.getLayerForAction('morning_briefing');

    if (layer === 3) {
      try {
        return await this.generateMorningBriefingAI(state);
      } catch (error) {
        console.error('AI morning briefing failed, falling back:', error);
      }
    }

    // Layer 2: Template-based
    return this.generateMorningBriefingTemplate(state);
  }

  private async generateMorningBriefingAI(state: UserState): Promise<MorningBriefing> {
    const prompt = this.buildMorningPrompt(state);
    const response = await this.callAPI(prompt, 200);

    if (response) {
      await this.budget.spend('morning_briefing');
      return {
        greeting: response,
        stateAcknowledgment: '',
        todaysFocus: '',
        scheduledTasks: [],
        generatedAt: new Date(),
        layer: 3,
      };
    }

    return this.generateMorningBriefingTemplate(state);
  }

  private generateMorningBriefingTemplate(state: UserState): MorningBriefing {
    const briefing = this.templates.getMorningBriefing(state);

    return {
      greeting: briefing,
      stateAcknowledgment: `Day ${state.denialDay} of denial. ${state.streakDays} day streak.`,
      todaysFocus: 'Presence and practice.',
      scheduledTasks: [],
      generatedAt: new Date(),
      layer: 2,
    };
  }

  private buildMorningPrompt(state: UserState): string {
    return `
Morning briefing for Maxy.
State: Day ${state.denialDay} denial, ${state.streakDays} day streak.
Odometer: ${state.odometer}. Exec function: ${state.estimatedExecFunction}.
${state.avoidedDomains.length > 0 ? `Avoiding: ${state.avoidedDomains.join(', ')}` : ''}
${state.consecutiveSurvivalDays > 0 ? `Survival mode: ${state.consecutiveSurvivalDays} days` : ''}

Generate 3-sentence morning briefing. Acknowledge state, set intention, be direct.
    `.trim();
  }

  // =============================================
  // EVENING DEBRIEF
  // =============================================

  async generateEveningDebrief(state: UserState): Promise<EveningDebrief> {
    const layer = this.getLayerForAction('evening_debrief');

    if (layer === 3) {
      try {
        return await this.generateEveningDebriefAI(state);
      } catch (error) {
        console.error('AI evening debrief failed, falling back:', error);
      }
    }

    return this.generateEveningDebriefTemplate(state);
  }

  private async generateEveningDebriefAI(state: UserState): Promise<EveningDebrief> {
    const prompt = this.buildDebriefPrompt(state);
    const response = await this.callAPI(prompt, 200);

    if (response) {
      await this.budget.spend('evening_debrief');
      return {
        summary: response,
        tasksCompleted: state.tasksCompletedToday,
        pointsEarned: state.pointsToday,
        streakStatus: `${state.streakDays} day streak`,
        generatedAt: new Date(),
        layer: 3,
      };
    }

    return this.generateEveningDebriefTemplate(state);
  }

  private generateEveningDebriefTemplate(state: UserState): EveningDebrief {
    const debrief = this.templates.getEveningDebrief(state);

    return {
      summary: debrief,
      tasksCompleted: state.tasksCompletedToday,
      pointsEarned: state.pointsToday,
      streakStatus: `${state.streakDays} day streak`,
      generatedAt: new Date(),
      layer: 2,
    };
  }

  private buildDebriefPrompt(state: UserState): string {
    return `
Evening debrief for Maxy.
Today: ${state.tasksCompletedToday} tasks, denial day ${state.denialDay}, streak ${state.streakDays}.
Points earned: ${state.pointsToday}.
${state.avoidedDomains.length > 0 ? `Avoided: ${state.avoidedDomains.join(', ')}` : ''}

Generate 3-sentence debrief. Acknowledge, note improvement area, encourage.
    `.trim();
  }

  // =============================================
  // SESSION GUIDANCE
  // =============================================

  async generateSessionGuidance(
    phase: 'opening' | 'midpoint' | 'peak' | 'closing',
    state: UserState
  ): Promise<SessionGuidance> {
    const layer = this.getLayerForAction('session_guidance');

    if (layer === 3) {
      try {
        return await this.generateSessionGuidanceAI(phase, state);
      } catch (error) {
        console.error('AI session guidance failed, falling back:', error);
      }
    }

    return this.generateSessionGuidanceTemplate(phase, state);
  }

  private async generateSessionGuidanceAI(
    phase: 'opening' | 'midpoint' | 'peak' | 'closing',
    state: UserState
  ): Promise<SessionGuidance> {
    const prompt = this.buildSessionPrompt(phase, state);
    const response = await this.callAPI(prompt, 150);

    if (response) {
      await this.budget.spend('session_guidance');
      return {
        phase,
        message: response,
        commitmentPrompt: phase === 'peak' ? this.templates.getCommitmentPrompt(state) : undefined,
        generatedAt: new Date(),
        layer: 3,
      };
    }

    return this.generateSessionGuidanceTemplate(phase, state);
  }

  private generateSessionGuidanceTemplate(
    phase: 'opening' | 'midpoint' | 'peak' | 'closing',
    state: UserState
  ): SessionGuidance {
    return {
      phase,
      message: this.templates.getSessionGuidance(phase, state),
      commitmentPrompt: phase === 'peak' ? this.templates.getCommitmentPrompt(state) : undefined,
      generatedAt: new Date(),
      layer: 2,
    };
  }

  private buildSessionPrompt(phase: string, state: UserState): string {
    return `
Edge session, phase: ${phase}
State: Edge ${state.edgeCount || 0}, denial day ${state.denialDay}, arousal ${state.currentArousal}/5

Generate 2-sentence guidance. ${phase === 'peak' ? 'Commitment extraction moment.' : ''} Direct.
    `.trim();
  }

  // =============================================
  // TASK ENHANCEMENT
  // =============================================

  async enhanceTaskCopy(
    taskId: string,
    instruction: string,
    subtext: string,
    affirmation: string,
    state: UserState
  ): Promise<{ instruction: string; subtext: string; affirmation: string; layer: 1 | 2 | 3 }> {
    const layer = this.getLayerForAction('task_enhancement');

    // Check cache first
    const cacheKey = `task_${taskId}_d${state.denialDay}_a${state.currentArousal}_m${state.handlerMode}`;
    const cached = this.templates.getCached(cacheKey);
    if (cached) {
      return {
        instruction: cached,
        subtext,
        affirmation,
        layer: 2,
      };
    }

    if (layer === 3) {
      try {
        const enhanced = await this.enhanceTaskCopyAI(taskId, instruction, state);
        if (enhanced) {
          this.templates.setCached(cacheKey, enhanced);
          return {
            instruction: enhanced,
            subtext: this.templates.substitute(subtext, state),
            affirmation,
            layer: 3,
          };
        }
      } catch (error) {
        console.error('AI task enhancement failed, falling back:', error);
      }
    }

    // Layer 2: Template enhancement by mode
    const enhanced = this.templates.enhanceTaskCopy(
      instruction,
      subtext,
      affirmation,
      state.handlerMode,
      state
    );

    return {
      ...enhanced,
      layer: 2,
    };
  }

  private async enhanceTaskCopyAI(
    _taskId: string,
    instruction: string,
    state: UserState
  ): Promise<string | null> {
    const prompt = `
State: Denial day ${state.denialDay}, arousal ${state.currentArousal}/5, ${state.timeOfDay}, streak ${state.streakDays}
Mode: ${state.handlerMode}
Task instruction: ${instruction}

Generate personalized delivery. 2-3 sentences max. Direct, commanding. Address as Maxy or "you".
    `.trim();

    const response = await this.callAPI(prompt, 150);
    if (response) {
      await this.budget.spend('task_enhancement');
      return response;
    }
    return null;
  }

  // =============================================
  // INTERVENTION GENERATION
  // =============================================

  async generateIntervention(
    type: string,
    state: UserState
  ): Promise<{ message: string; layer: 1 | 2 | 3 }> {
    const actionType: ActionType = type === 'crisis_response' || type === 'identity_crisis'
      ? 'crisis_response'
      : type === 'vulnerability_window'
        ? 'vulnerability_window'
        : 'intervention';

    const layer = this.getLayerForAction(actionType);

    if (layer === 3) {
      try {
        const message = await this.generateInterventionAI(type, state);
        if (message) {
          return { message, layer: 3 };
        }
      } catch (error) {
        console.error('AI intervention failed, falling back:', error);
      }
    }

    return {
      message: this.templates.getInterventionMessage(type, state),
      layer: 2,
    };
  }

  private async generateInterventionAI(type: string, state: UserState): Promise<string | null> {
    const prompt = this.buildInterventionPrompt(type, state);
    const response = await this.callAPI(prompt, 150);

    if (response) {
      await this.budget.spend(
        type === 'crisis_response' ? 'crisis_response' :
        type === 'vulnerability_window' ? 'vulnerability_window' :
        'intervention'
      );
      return response;
    }
    return null;
  }

  private buildInterventionPrompt(type: string, state: UserState): string {
    const prompts: Record<string, string> = {
      streak_protection: `
Streak protection intervention needed.
State: ${state.streakDays} day streak at risk. Last task ${state.minutesSinceLastTask} minutes ago.
Generate urgent but not panic-inducing message. 2 sentences. Include specific task suggestion.
      `,
      vulnerability_window: `
Vulnerability window detected.
State: Denial day ${state.denialDay}, arousal ${state.currentArousal}/5, exec function ${state.estimatedExecFunction}.
Generate commitment extraction prompt. 2-3 sentences. Direct but not overwhelming.
      `,
      domain_avoidance: `
Domain avoidance confrontation.
Avoided domains: ${state.avoidedDomains.join(', ')}.
Generate gentle but firm confrontation. Reference the avoidance pattern. Suggest micro-task.
      `,
      depression_gentle: `
Depression/low state detected.
Consecutive survival days: ${state.consecutiveSurvivalDays}. Recent mood: ${state.recentMoodScores.join(', ')}.
Generate gentle, unconditional message. No demands. Just presence. Suggest only mood log.
      `,
      post_release_crash: `
Post-release crash detected.
Generate supportive message that: 1) normalizes the crash as neurochemistry, 2) doesn't reference session content, 3) suggests one minimum task (skincare or mood log only).
      `,
      identity_crisis: `
Identity crisis detected.
Generate evidence-based response that presents accumulated data without arguing. Reference milestones and progress. Do not use arousal or guilt.
      `,
    };

    return (prompts[type] || prompts.streak_protection).trim();
  }

  // =============================================
  // COMMITMENT EXTRACTION
  // =============================================

  async extractCommitment(state: UserState): Promise<string> {
    const layer = this.getLayerForAction('commitment_extraction');

    if (layer === 3) {
      try {
        const prompt = `
Commitment extraction.
State: Edge ${state.edgeCount || 8}+, denial day ${state.denialDay}, high arousal.
${state.avoidedDomains.length > 0 ? `Avoiding: ${state.avoidedDomains.join(', ')}` : ''}

Generate specific commitment demand. One sentence. "Say it: '...'" format.
        `.trim();

        const response = await this.callAPI(prompt, 100);
        if (response) {
          await this.budget.spend('commitment_extraction');
          return response;
        }
      } catch (error) {
        console.error('AI commitment extraction failed:', error);
      }
    }

    return this.templates.getCommitmentPrompt(state);
  }

  // =============================================
  // CORE API CALL
  // =============================================

  private async callAPI(prompt: string, maxTokens: number): Promise<string | null> {
    if (!this.client) return null;

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: HANDLER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      if (response.content[0].type === 'text' && response.content[0].text) {
        return response.content[0].text;
      }
    } catch (error) {
      console.error('API call failed:', error);
    }

    return null;
  }

  // =============================================
  // BUDGET INFO
  // =============================================

  getBudgetStatus() {
    return this.budget.getStatus();
  }

  getBudgetRemaining(): number {
    return this.budget.getRemaining();
  }
}

/**
 * Create AI client from environment
 */
export function createAIClient(_userId: string, budget: BudgetManager): AIClient {
  // API key from environment variable
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY ?? null;
  return new AIClient(apiKey as string | null, budget);
}
