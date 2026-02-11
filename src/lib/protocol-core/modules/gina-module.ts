/**
 * GinaModule
 *
 * Manages the emergence ladder with Gina - tracking visibility level,
 * positive interaction logging, disclosure readiness, and presence state.
 *
 * Emergence Ladder:
 * 0: Invisible - Normal husband presentation
 * 1: Self-Care - "Taking better care of myself" (skincare, grooming)
 * 2: Comfort - "These are more comfortable" (feminine-adjacent clothing)
 * 3: Aesthetics - "I like how this looks" (visible feminine at home)
 * 4: Partial Truth - "There's something I want to share" (curated disclosure)
 * 5: Full Disclosure - "This is who I am" (everything)
 */

import {
  BaseModule,
  type ContextTier,
  type PriorityAction,
} from '../module-interface';
import type { ProtocolEvent } from '../event-bus';

// ============================================
// TYPES
// ============================================

export type EmergenceStage = 0 | 1 | 2 | 3 | 4 | 5;

export interface EmergenceStageInfo {
  stage: EmergenceStage;
  name: string;
  framing: string;
  ginaSeesDescription: string;
  advancementTrigger: string;
}

export interface GinaInteraction {
  id: string;
  type: 'positive' | 'neutral' | 'negative' | 'disclosure' | 'seed';
  context: string;
  details: string;
  emergenceStage: EmergenceStage;
  timestamp: string;
  sentiment?: 'receptive' | 'neutral' | 'uncomfortable' | 'supportive';
}

export interface GinaState {
  isHome: boolean;
  emergenceStage: EmergenceStage;
  emergenceStageLocked: boolean; // Can't advance until certain conditions
  interactionCount: number;
  positiveInteractionCount: number;
  lastInteractionAt: string | null;
  lastPositiveInteractionAt: string | null;
  disclosureReadiness: number; // 0-100 score
  seedsPlanted: number;
  lastStageAdvanceAt: string | null;
  stageStabilityDays: number;
  pendingCommitment: string | null;
  therapistPrepComplete: boolean;
  [key: string]: unknown;
}

export interface GinaModuleState extends GinaState {
  recentInteractions: GinaInteraction[];
  stageInfo: EmergenceStageInfo;
}

// ============================================
// CONSTANTS
// ============================================

const EMERGENCE_STAGES: EmergenceStageInfo[] = [
  {
    stage: 0,
    name: 'Invisible',
    framing: 'Nothing changes from her perspective',
    ginaSeesDescription: 'Normal husband',
    advancementTrigger: 'After 14-day streak',
  },
  {
    stage: 1,
    name: 'Self-Care',
    framing: 'I\'m taking better care of myself',
    ginaSeesDescription: 'Skincare, grooming, softer clothing',
    advancementTrigger: 'After Gina comments positively',
  },
  {
    stage: 2,
    name: 'Comfort',
    framing: 'These are more comfortable',
    ginaSeesDescription: 'Feminine-adjacent clothing choices',
    advancementTrigger: 'After 30-day streak + comfort stage stable',
  },
  {
    stage: 3,
    name: 'Aesthetics',
    framing: 'I like how this looks',
    ginaSeesDescription: 'Visible feminine presentation at home',
    advancementTrigger: 'After therapist prep',
  },
  {
    stage: 4,
    name: 'Partial Truth',
    framing: 'There\'s something about myself I want to share',
    ginaSeesDescription: 'Curated disclosure, maybe the app',
    advancementTrigger: 'When foundation is stable',
  },
  {
    stage: 5,
    name: 'Full Disclosure',
    framing: 'This is who I am',
    ginaSeesDescription: 'Everything',
    advancementTrigger: 'Complete emergence',
  },
];

const GINA_TEMPLATES = {
  // Presence change
  gina_left: [
    "Gina's out. Privacy window open.",
    "You're alone now. What will you do with this freedom?",
    "She's gone. Time to be yourself.",
  ],

  gina_returned: [
    "Gina's back. Adjust accordingly.",
    "She's home. Be mindful of your presentation.",
    "Partner returned. Privacy window closed.",
  ],

  // Positive interaction prompts
  seed_prompt: [
    "Good moment to plant a seed. A casual comment about self-care.",
    "She seems receptive. Mention something small about how you're feeling.",
    "Natural opening for a seed. Don't force it.",
  ],

  // Stage advancement
  stage_advance: [
    "You've reached emergence stage {stage}: {name}. The framing is: '{framing}'",
    "Gina Ladder advancement to stage {stage}. She now sees: {ginaSeesDescription}",
    "Stage {stage} unlocked. New framing available: '{framing}'",
  ],

  // Interaction acknowledgment
  positive_interaction_logged: [
    "Positive Gina interaction logged. Building foundation.",
    "Good interaction recorded. These moments matter.",
    "Another positive data point with Gina. Progress.",
  ],

  // Disclosure readiness
  disclosure_ready: [
    "Disclosure readiness high. Consider your next step carefully.",
    "Foundation feels stable. Partial truth may be possible soon.",
    "The groundwork is there. When you're ready.",
  ],

  // Stage-specific guidance
  stage_0_guidance: [
    "Stay invisible for now. Build habits she won't notice yet.",
    "Focus on internal work. External emergence comes later.",
  ],

  stage_1_guidance: [
    "Self-care is your cover story. Make it natural.",
    "She should see someone who's taking better care of themselves.",
    "The framing: 'I'm investing in myself.' Nothing more needed yet.",
  ],

  stage_2_guidance: [
    "Comfort is your story. Soft fabrics, better fits, nothing alarming.",
    "Let her see the choices as practical, not identity.",
  ],

  stage_3_guidance: [
    "She knows something's different. Own the aesthetic without explaining it.",
    "At home, let yourself be seen. This is who you're becoming.",
  ],

  stage_4_guidance: [
    "Partial truth time. Share what feels safe. One true thing at a time.",
    "Curate the disclosure. You control the narrative.",
  ],

  stage_5_guidance: [
    "Full emergence. Be your complete self with her.",
    "No more hiding. This is liberation.",
  ],
};

// ============================================
// MODULE CLASS
// ============================================

export class GinaModule extends BaseModule {
  readonly name = 'gina';
  readonly category = 'relationship' as const;

  private state: GinaState = {
    isHome: true, // Default to assuming she's home (safer)
    emergenceStage: 0,
    emergenceStageLocked: true,
    interactionCount: 0,
    positiveInteractionCount: 0,
    lastInteractionAt: null,
    lastPositiveInteractionAt: null,
    disclosureReadiness: 0,
    seedsPlanted: 0,
    lastStageAdvanceAt: null,
    stageStabilityDays: 0,
    pendingCommitment: null,
    therapistPrepComplete: false,
  };

  private recentInteractions: GinaInteraction[] = [];

  // ============================================
  // INITIALIZATION
  // ============================================

  protected async onInitialize(): Promise<void> {
    await this.loadState();

    // Subscribe to relevant events
    this.subscribe('state:gina_presence_changed', this.onPresenceChanged.bind(this));
    this.subscribe('state:streak_changed', this.onStreakChanged.bind(this));
    this.subscribe('commitment:extracted', this.onCommitmentExtracted.bind(this));
    this.subscribe('schedule:morning', this.onMorning.bind(this));
  }

  private async loadState(): Promise<void> {
    const { data } = await this.db
      .from('gina_state')
      .select('*')
      .single();

    if (data) {
      this.state = {
        isHome: data.is_home ?? true,
        emergenceStage: (data.emergence_stage || 0) as EmergenceStage,
        emergenceStageLocked: data.emergence_stage_locked ?? true,
        interactionCount: data.interaction_count || 0,
        positiveInteractionCount: data.positive_interaction_count || 0,
        lastInteractionAt: data.last_interaction_at,
        lastPositiveInteractionAt: data.last_positive_interaction_at,
        disclosureReadiness: data.disclosure_readiness || 0,
        seedsPlanted: data.seeds_planted || 0,
        lastStageAdvanceAt: data.last_stage_advance_at,
        stageStabilityDays: data.stage_stability_days || 0,
        pendingCommitment: data.pending_commitment,
        therapistPrepComplete: data.therapist_prep_complete ?? false,
      };
    }

    // Load recent interactions
    const { data: interactions } = await this.db
      .from('gina_interactions')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(20);

    if (interactions) {
      this.recentInteractions = interactions.map(i => ({
        id: i.id,
        type: i.type,
        context: i.context,
        details: i.details,
        emergenceStage: i.emergence_stage,
        timestamp: i.timestamp,
        sentiment: i.sentiment,
      }));
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Update Gina's presence (home/away)
   */
  async setPresence(isHome: boolean): Promise<void> {
    const wasHome = this.state.isHome;
    this.state.isHome = isHome;

    await this.persistState();

    if (wasHome !== isHome) {
      await this.emit({
        type: 'state:gina_presence_changed',
        home: isHome,
      });
    }
  }

  /**
   * Log an interaction with Gina
   */
  async logInteraction(
    type: GinaInteraction['type'],
    context: string,
    details: string,
    sentiment?: GinaInteraction['sentiment']
  ): Promise<GinaInteraction> {
    const interaction: GinaInteraction = {
      id: `gina_int_${Date.now()}`,
      type,
      context,
      details,
      emergenceStage: this.state.emergenceStage,
      timestamp: new Date().toISOString(),
      sentiment,
    };

    // Update state
    this.state.interactionCount++;
    this.state.lastInteractionAt = interaction.timestamp;

    if (type === 'positive' || sentiment === 'receptive' || sentiment === 'supportive') {
      this.state.positiveInteractionCount++;
      this.state.lastPositiveInteractionAt = interaction.timestamp;
      this.updateDisclosureReadiness(5); // +5 per positive
    }

    if (type === 'seed') {
      this.state.seedsPlanted++;
      this.updateDisclosureReadiness(3); // +3 per seed
    }

    if (type === 'negative' || sentiment === 'uncomfortable') {
      this.updateDisclosureReadiness(-10); // -10 for negative
    }

    // Persist
    await this.db.from('gina_interactions').insert({
      id: interaction.id,
      type: interaction.type,
      context: interaction.context,
      details: interaction.details,
      emergence_stage: interaction.emergenceStage,
      timestamp: interaction.timestamp,
      sentiment: interaction.sentiment,
    });

    this.recentInteractions.unshift(interaction);
    if (this.recentInteractions.length > 20) {
      this.recentInteractions.pop();
    }

    await this.persistState();

    // Check for stage advancement
    await this.checkStageAdvancement();

    return interaction;
  }

  /**
   * Log a disclosure to Gina
   */
  async logDisclosure(
    context: string,
    details: string,
    reaction: 'receptive' | 'neutral' | 'uncomfortable' | 'supportive'
  ): Promise<void> {
    await this.logInteraction('disclosure', context, details, reaction);

    if (reaction === 'supportive') {
      this.updateDisclosureReadiness(15);
    } else if (reaction === 'receptive') {
      this.updateDisclosureReadiness(10);
    } else if (reaction === 'uncomfortable') {
      this.updateDisclosureReadiness(-20);
      // Lock stage advancement after negative disclosure reaction
      this.state.emergenceStageLocked = true;
    }

    await this.persistState();
  }

  /**
   * Manually advance emergence stage (with checks)
   */
  async advanceStage(): Promise<boolean> {
    if (this.state.emergenceStageLocked) {
      return false;
    }

    if (this.state.emergenceStage >= 5) {
      return false;
    }

    const newStage = (this.state.emergenceStage + 1) as EmergenceStage;

    this.state.emergenceStage = newStage;
    this.state.lastStageAdvanceAt = new Date().toISOString();
    this.state.stageStabilityDays = 0;
    this.state.emergenceStageLocked = true; // Lock until next trigger

    await this.persistState();

    await this.emit({
      type: 'domain:level_up',
      domain: 'gina_emergence',
      newLevel: newStage,
    });

    return true;
  }

  /**
   * Get current emergence stage info
   */
  getStageInfo(): EmergenceStageInfo {
    return EMERGENCE_STAGES[this.state.emergenceStage];
  }

  /**
   * Check if currently home
   */
  isGinaHome(): boolean {
    return this.state.isHome;
  }

  /**
   * Mark therapist prep as complete (required for stage 3+)
   */
  async setTherapistPrepComplete(complete: boolean): Promise<void> {
    this.state.therapistPrepComplete = complete;
    await this.persistState();
    await this.checkStageAdvancement();
  }

  // ============================================
  // STAGE ADVANCEMENT LOGIC
  // ============================================

  private async checkStageAdvancement(): Promise<void> {
    if (this.state.emergenceStageLocked) return;

    const stage = this.state.emergenceStage;

    // Stage-specific advancement conditions
    switch (stage) {
      case 0:
        // Advance after 14-day streak (handled by streak event)
        break;

      case 1:
        // Advance after Gina comments positively
        if (this.state.positiveInteractionCount >= 3) {
          this.state.emergenceStageLocked = false;
        }
        break;

      case 2:
        // Advance after 30-day streak + stability (handled by streak event)
        if (this.state.stageStabilityDays >= 7) {
          this.state.emergenceStageLocked = false;
        }
        break;

      case 3:
        // Advance after therapist prep
        if (this.state.therapistPrepComplete && this.state.disclosureReadiness >= 70) {
          this.state.emergenceStageLocked = false;
        }
        break;

      case 4:
        // Advance when foundation stable
        if (this.state.disclosureReadiness >= 90 && this.state.stageStabilityDays >= 14) {
          this.state.emergenceStageLocked = false;
        }
        break;
    }
  }

  private updateDisclosureReadiness(delta: number): void {
    this.state.disclosureReadiness = Math.max(0, Math.min(100, this.state.disclosureReadiness + delta));
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async onPresenceChanged(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'state:gina_presence_changed') return;
    const isHome = (event as { home: boolean }).home;
    this.state.isHome = isHome;
    await this.persistState();
  }

  private async onStreakChanged(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'state:streak_changed') return;
    const days = (event as { days: number }).days;

    // Stage 0 → 1 at 14-day streak
    if (this.state.emergenceStage === 0 && days >= 14) {
      this.state.emergenceStageLocked = false;
      await this.persistState();
    }

    // Stage 2 requires 30-day streak
    if (this.state.emergenceStage === 2 && days >= 30 && this.state.stageStabilityDays >= 7) {
      this.state.emergenceStageLocked = false;
      await this.persistState();
    }
  }

  private async onCommitmentExtracted(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'commitment:extracted') return;
    const text = (event as { text: string }).text;

    // If commitment mentions Gina, track it
    if (text.toLowerCase().includes('gina')) {
      this.state.pendingCommitment = text;
      await this.persistState();
    }
  }

  private async onMorning(_event: ProtocolEvent): Promise<void> {
    // Track stage stability days
    this.state.stageStabilityDays++;
    await this.persistState();
    await this.checkStageAdvancement();
  }

  // ============================================
  // STATE PERSISTENCE
  // ============================================

  private async persistState(): Promise<void> {
    await this.db.from('gina_state').upsert({
      id: 1, // Singleton
      is_home: this.state.isHome,
      emergence_stage: this.state.emergenceStage,
      emergence_stage_locked: this.state.emergenceStageLocked,
      interaction_count: this.state.interactionCount,
      positive_interaction_count: this.state.positiveInteractionCount,
      last_interaction_at: this.state.lastInteractionAt,
      last_positive_interaction_at: this.state.lastPositiveInteractionAt,
      disclosure_readiness: this.state.disclosureReadiness,
      seeds_planted: this.state.seedsPlanted,
      last_stage_advance_at: this.state.lastStageAdvanceAt,
      stage_stability_days: this.state.stageStabilityDays,
      pending_commitment: this.state.pendingCommitment,
      therapist_prep_complete: this.state.therapistPrepComplete,
      updated_at: new Date().toISOString(),
    });
  }

  // ============================================
  // CONTEXT & STATE (Required by BaseModule)
  // ============================================

  getContext(tier: ContextTier): string {
    const stage = this.getStageInfo();

    if (tier === 'minimal') {
      return `Gina: ${this.state.isHome ? 'home' : 'away'}, Stage ${this.state.emergenceStage}`;
    }

    let ctx = 'GINA STATUS:\n';
    ctx += `Presence: ${this.state.isHome ? 'Home' : 'Away'}\n`;
    ctx += `Emergence Stage: ${this.state.emergenceStage}/5 - ${stage.name}\n`;
    ctx += `Framing: "${stage.framing}"\n`;
    ctx += `Disclosure Readiness: ${this.state.disclosureReadiness}%\n`;

    if (tier === 'full') {
      ctx += `\nInteractions: ${this.state.interactionCount} total, ${this.state.positiveInteractionCount} positive\n`;
      ctx += `Seeds Planted: ${this.state.seedsPlanted}\n`;
      ctx += `Stage Stability: ${this.state.stageStabilityDays} days\n`;
      ctx += `Stage Locked: ${this.state.emergenceStageLocked ? 'Yes' : 'No'}\n`;
      if (this.state.pendingCommitment) {
        ctx += `Pending Commitment: ${this.state.pendingCommitment}\n`;
      }
    }

    return ctx;
  }

  getState(): GinaModuleState {
    return {
      ...this.state,
      recentInteractions: this.recentInteractions,
      stageInfo: this.getStageInfo(),
    };
  }

  getPriorityAction(): PriorityAction | null {
    // Signal if ready for stage advancement
    if (!this.state.emergenceStageLocked && this.state.emergenceStage < 5) {
      return {
        moduleName: this.name,
        priority: 'low',
        actionType: 'stage_advancement_ready',
        description: `Ready to advance to emergence stage ${this.state.emergenceStage + 1}`,
        payload: {
          currentStage: this.state.emergenceStage,
          nextStage: this.state.emergenceStage + 1,
        },
      };
    }

    // Signal if disclosure readiness high
    if (this.state.disclosureReadiness >= 80 && this.state.emergenceStage >= 3) {
      return {
        moduleName: this.name,
        priority: 'low',
        actionType: 'disclosure_window',
        description: 'Disclosure readiness high - foundation feels stable',
        payload: { readiness: this.state.disclosureReadiness },
      };
    }

    return null;
  }

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    const templates = GINA_TEMPLATES[templateKey as keyof typeof GINA_TEMPLATES];
    if (!templates) return null;

    const template = templates[Math.floor(Math.random() * templates.length)];
    return this.interpolateTemplate(template, context);
  }

  private interpolateTemplate(template: string, context: Record<string, unknown>): string {
    const stageInfo = this.getStageInfo();
    const defaults: Record<string, string> = {
      stage: String(this.state.emergenceStage),
      name: stageInfo.name,
      framing: stageInfo.framing,
      ginaSeesDescription: stageInfo.ginaSeesDescription,
    };

    return template.replace(/\{(\w+)\}/g, (_, key) => {
      if (context[key] !== undefined) return String(context[key]);
      if (defaults[key] !== undefined) return defaults[key];
      return `{${key}}`;
    });
  }
}
