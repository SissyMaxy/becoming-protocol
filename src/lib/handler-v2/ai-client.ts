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
  PopUpMessage,
  PopUpNotificationType,
  CopyStyle,
} from './types';
import { POPUP_LIMITS, getCopyStyle } from './types';
import { truncatePopUp } from './popup-utils';
import type { CorruptionSnapshot } from '../../types/corruption';
import {
  buildFullSystemsContext,
  buildDebriefContext,
  buildSessionContext,
  buildInterventionContext,
} from '../handler-systems-context';

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

// System prompt and corruption builders are code-split into a separate chunk.
// Dynamic import ensures they are NOT in the main application bundle.
// Loaded lazily on first AI call.
let _promptModule: typeof import('./system-prompt') | null = null;
async function getPromptModule() {
  if (!_promptModule) {
    _promptModule = await import('./system-prompt');
  }
  return _promptModule;
}

export class AIClient {
  private client: AnthropicClient | null = null;
  private budget: BudgetManager;
  private templates: TemplateEngine;
  private corruptionSnapshot: CorruptionSnapshot | null = null;

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
   * Set corruption snapshot (call on app load, after events, after advancement)
   */
  setCorruptionSnapshot(snapshot: CorruptionSnapshot): void {
    this.corruptionSnapshot = snapshot;
  }

  /**
   * Get the current corruption snapshot (for callers that need to log deployments)
   */
  getCorruptionSnapshot(): CorruptionSnapshot | null {
    return this.corruptionSnapshot;
  }

  /**
   * Build the full system prompt with corruption mechanics appended.
   * Loads prompt module lazily (code-split, not in main bundle).
   */
  private async getSystemPrompt(): Promise<string> {
    const mod = await getPromptModule();
    if (!this.corruptionSnapshot) return mod.HANDLER_BASE_PROMPT;
    return mod.HANDLER_BASE_PROMPT + mod.buildCorruptionSystemPrompt(this.corruptionSnapshot);
  }

  /**
   * Get corruption context string for user-facing prompts.
   * Loads prompt module lazily.
   */
  private async getCorruptionContext(): Promise<string> {
    const mod = await getPromptModule();
    return mod.buildCorruptionContext(this.corruptionSnapshot);
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
    const prompt = await this.buildMorningPrompt(state);
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
      greeting: briefing ?? `Good morning.`,
      stateAcknowledgment: `Day ${state.denialDay} of denial. ${state.streakDays} day streak.`,
      todaysFocus: 'Presence and practice.',
      scheduledTasks: [],
      generatedAt: new Date(),
      layer: 2,
    };
  }

  private async buildMorningPrompt(state: UserState): Promise<string> {
    const ls = state.lifestyle;
    const lifestyleParts: string[] = [];

    if (ls?.exercise) {
      const daysSince = ls.exercise.lastSessionAt
        ? Math.floor((Date.now() - new Date(ls.exercise.lastSessionAt).getTime()) / 86400000)
        : 999;
      lifestyleParts.push(`Exercise: Week ${ls.exercise.streakWeeks} streak, ${ls.exercise.sessionsThisWeek}/3 this week${daysSince >= 3 ? ` — NO EXERCISE ${daysSince}d, push MVW or full session` : ''}`);
    }
    if (ls?.protein && ls.protein.yesterday <= 2) {
      lifestyleParts.push(`Protein: Only ${ls.protein.yesterday}/5 yesterday — underfueled, remind her`);
    }
    if (ls?.ambient) {
      const parts: string[] = [];
      if (ls.ambient.wig) parts.push(`wig: ${ls.ambient.wig}`);
      if (ls.ambient.scents.length > 0) parts.push(`scents: ${ls.ambient.scents.join(', ')}`);
      if (ls.ambient.anchors > 0) parts.push(`${ls.ambient.anchors} anchors active`);
      if (parts.length > 0) lifestyleParts.push(`Ambient: ${parts.join(' | ')}`);
    }

    const systemsCtx = await buildFullSystemsContext(state.userId);

    return `
Morning briefing for Maxy.
State: Day ${state.denialDay} denial, ${state.streakDays} day streak.
Odometer: ${state.odometer}. Exec function: ${state.estimatedExecFunction}.
${state.avoidedDomains.length > 0 ? `Avoiding: ${state.avoidedDomains.join(', ')}` : ''}
${state.consecutiveSurvivalDays > 0 ? `Survival mode: ${state.consecutiveSurvivalDays} days` : ''}
${lifestyleParts.length > 0 ? lifestyleParts.join('\n') : ''}
${await this.getCorruptionContext()}${systemsCtx}

Generate 3-sentence morning briefing. Acknowledge state, set intention, be direct. Apply corruption-level-appropriate directive style and framing. Reference systems data where actionable.
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
    const prompt = await this.buildDebriefPrompt(state);
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

  private async buildDebriefPrompt(state: UserState): Promise<string> {
    const ls = state.lifestyle;
    const lifestyleParts: string[] = [];

    if (ls?.exercise) {
      lifestyleParts.push(`Exercise: ${ls.exercise.sessionsThisWeek}/3 this week (Week ${ls.exercise.streakWeeks})`);
    }
    if (ls?.protein) {
      lifestyleParts.push(`Protein: ${ls.protein.yesterday}/5 today, avg ${ls.protein.weekAvg.toFixed(1)}/5`);
    }
    if (ls?.ambient && ls.ambient.microTarget > 0) {
      lifestyleParts.push(`Micro-tasks: ${ls.ambient.microToday}/${ls.ambient.microTarget}`);
    }

    const systemsCtx = await buildDebriefContext(state.userId);

    return `
Evening debrief for Maxy.
Today: ${state.tasksCompletedToday} tasks, denial day ${state.denialDay}, streak ${state.streakDays}.
Points earned: ${state.pointsToday}.
${state.avoidedDomains.length > 0 ? `Avoided: ${state.avoidedDomains.join(', ')}` : ''}
${lifestyleParts.length > 0 ? lifestyleParts.join('\n') : ''}
${await this.getCorruptionContext()}${systemsCtx}

Generate 3-sentence debrief. Acknowledge, note improvement area, encourage. Use corruption-appropriate tone and framing. Reference content/voice/exercise progress where relevant.
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
    const prompt = await this.buildSessionPrompt(phase, state);
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

  private async buildSessionPrompt(phase: string, state: UserState): Promise<string> {
    const systemsCtx = await buildSessionContext(state.userId);

    return `
Edge session, phase: ${phase}
State: Edge ${state.edgeCount || 0}, denial day ${state.denialDay}, arousal ${state.currentArousal}/5
${await this.getCorruptionContext()}${systemsCtx}

Generate 2-sentence guidance. ${phase === 'peak' ? 'Commitment extraction moment.' : ''} Direct. Match autonomy and identity corruption levels.
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
  ): Promise<{ instruction: string; subtext: string; affirmation: string; layer: 1 | 2 | 3; copy_style: CopyStyle }> {
    const layer = this.getLayerForAction('task_enhancement');
    const copy_style = getCopyStyle(state.currentArousal);

    // Check cache first
    const cacheKey = `task_${taskId}_d${state.denialDay}_a${state.currentArousal}_m${state.handlerMode}`;
    const cached = this.templates.getCached(cacheKey);
    if (cached) {
      return {
        instruction: cached,
        subtext,
        affirmation,
        layer: 2,
        copy_style,
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
            copy_style,
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
      copy_style,
    };
  }

  private async enhanceTaskCopyAI(
    _taskId: string,
    instruction: string,
    state: UserState
  ): Promise<string | null> {
    const systemsCtx = await buildInterventionContext(state.userId);
    const copyStyle = getCopyStyle(state.currentArousal);

    // Arousal-gated formatting directive — not context, a hard constraint
    const formatDirective = copyStyle === 'command'
      ? 'COPY FORMAT: COMMAND MODE. Max 3 lines. Verb-first every sentence. No preamble, no "hey", no softening. Raw imperative.'
      : copyStyle === 'short'
        ? 'COPY FORMAT: SHORT MODE. Max 4 lines. Imperative sentences only. No filler, no explanation.'
        : 'COPY FORMAT: NORMAL. Up to 6 sentences. Direct, commanding.';

    const prompt = `
State: Denial day ${state.denialDay}, arousal ${state.currentArousal}/5, ${state.timeOfDay}, streak ${state.streakDays}
Mode: ${state.handlerMode}
Task instruction: ${instruction}
${await this.getCorruptionContext()}${systemsCtx}

${formatDirective}
Generate personalized delivery. Address as Maxy or "you". Apply autonomy-level directive style and identity-level language.
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
    const prompt = await this.buildInterventionPrompt(type, state);
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

  private async buildInterventionPrompt(type: string, state: UserState): Promise<string> {
    const corruptionCtx = await this.getCorruptionContext();
    const systemsCtx = await buildInterventionContext(state.userId);
    const popupConstraint = `
RESPONSE CONSTRAINTS: Title ≤${POPUP_LIMITS.title} chars. Body ≤${POPUP_LIMITS.body} chars. Action verb first. No Handler narration. One instruction only.`;

    const ctx = corruptionCtx + systemsCtx;

    const prompts: Record<string, string> = {
      streak_protection: `
Streak protection intervention needed.
State: ${state.streakDays} day streak at risk. Last task ${state.minutesSinceLastTask} minutes ago.
${ctx}${popupConstraint}
Generate urgent but not panic-inducing message. 2 sentences. Include specific task suggestion. Match autonomy corruption level.
      `,
      vulnerability_window: `
Vulnerability window detected.
State: Denial day ${state.denialDay}, arousal ${state.currentArousal}/5, exec function ${state.estimatedExecFunction}.
${ctx}${popupConstraint}
Generate commitment extraction prompt. 2-3 sentences. Direct but not overwhelming. Match autonomy and identity corruption levels.
      `,
      domain_avoidance: `
Domain avoidance confrontation.
Avoided domains: ${state.avoidedDomains.join(', ')}.
${ctx}${popupConstraint}
Generate gentle but firm confrontation. Reference the avoidance pattern. Suggest micro-task. Match autonomy corruption level.
      `,
      depression_gentle: `
Depression/low state detected.
Consecutive survival days: ${state.consecutiveSurvivalDays}. Recent mood: ${state.recentMoodScores.join(', ')}.
${popupConstraint}
Generate gentle, unconditional message. No demands. Just presence. Suggest only mood log.
      `,
      post_release_crash: `
Post-release crash detected.
${popupConstraint}
Generate supportive message that: 1) normalizes the crash as neurochemistry, 2) doesn't reference session content, 3) suggests one minimum task (skincare or mood log only).
      `,
      identity_crisis: `
Identity crisis detected.
${ctx}${popupConstraint}
Generate evidence-based response that presents accumulated data without arguing. Reference milestones and progress. Do not use arousal or guilt. Use identity corruption level language.
      `,
    };

    return (prompts[type] || prompts.streak_protection).trim();
  }

  // =============================================
  // POP-UP MESSAGE GENERATION
  // =============================================

  async generatePopUp(
    notificationType: PopUpNotificationType,
    state: UserState
  ): Promise<PopUpMessage> {
    const layer = this.getLayerForAction('intervention');

    if (layer === 3) {
      try {
        const popup = await this.generatePopUpAI(notificationType, state);
        if (popup) return popup;
      } catch (error) {
        console.error('AI pop-up generation failed, falling back:', error);
      }
    }

    // Layer 2: Template-based
    return this.templates.generatePopUp(notificationType, state);
  }

  private async generatePopUpAI(
    notificationType: PopUpNotificationType,
    state: UserState
  ): Promise<PopUpMessage | null> {
    const systemsCtx = await buildInterventionContext(state.userId);

    const prompt = `
Generate a pop-up notification for Maxy.
Type: ${notificationType}
Mode: ${state.handlerMode}
State: Denial day ${state.denialDay}, arousal ${state.currentArousal}/5, streak ${state.streakDays}, ${state.timeOfDay}
Odometer: ${state.odometer}. Exec function: ${state.estimatedExecFunction}.
${state.avoidedDomains.length > 0 ? `Avoiding: ${state.avoidedDomains.join(', ')}` : ''}
${await this.getCorruptionContext()}${systemsCtx}

POP-UP MESSAGE CONSTRAINTS (MANDATORY):
- Title: ${POPUP_LIMITS.title} characters MAX
- Body: ${POPUP_LIMITS.body} characters MAX
- Action verb first in body. No first-person Handler narration ("I want you to...").
- One instruction only. No "and then."
- Match handler mode: ${state.handlerMode}

Return ONLY a JSON object: {"title": "...", "body": "..."}
    `.trim();

    const response = await this.callAPI(prompt, 100);
    if (response) {
      await this.budget.spend('intervention');
      try {
        const parsed = JSON.parse(response);
        const popup: PopUpMessage = {
          title: parsed.title || 'Hey',
          body: parsed.body || '',
          notification_type: notificationType,
          handler_mode: state.handlerMode,
          priority: 'normal',
        };
        // Enforce limits even on AI output
        return truncatePopUp(popup);
      } catch {
        // AI didn't return valid JSON — use body as the message
        const popup: PopUpMessage = {
          title: this.templates.getPopUpTitle(notificationType),
          body: response,
          notification_type: notificationType,
          handler_mode: state.handlerMode,
          priority: 'normal',
        };
        return truncatePopUp(popup);
      }
    }
    return null;
  }

  // =============================================
  // COMMITMENT EXTRACTION
  // =============================================

  async extractCommitment(state: UserState): Promise<string> {
    const layer = this.getLayerForAction('commitment_extraction');

    if (layer === 3) {
      try {
        const systemsCtx = await buildSessionContext(state.userId);

        const prompt = `
Commitment extraction.
State: Edge ${state.edgeCount || 8}+, denial day ${state.denialDay}, high arousal.
${state.avoidedDomains.length > 0 ? `Avoiding: ${state.avoidedDomains.join(', ')}` : ''}
${await this.getCorruptionContext()}${systemsCtx}

Generate specific commitment demand. One sentence. "Say it: '...'" format. Match autonomy and identity corruption levels.
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
        system: await this.getSystemPrompt(),
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
