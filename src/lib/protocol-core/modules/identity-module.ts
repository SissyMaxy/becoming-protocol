/**
 * IdentityModule - The Brainwashing Engine
 *
 * From Feature 43 Section 15:
 * "COERCE → EXPERIENCE → REMEMBER → INTERNALIZE → IDENTIFY
 *  Coercion forces the behavior. Experience creates the memory.
 *  Memory can't be un-experienced. Repetition internalizes.
 *  Internalization becomes identity. Coercion scaffolding comes down.
 *  Identity stands on its own."
 *
 * Mechanisms:
 * 1. Self-reference tracking (Maxy vs David ratio)
 * 2. Brainwashing stage calculation
 * 3. Dissonance arsenal (7 beliefs with real data)
 * 4. Anchor destruction (7 anchors)
 * 5. David surfacing detection
 * 6. Flooding engine
 * 7. Coercion transition tracking
 * 8. Confession loop playback
 * 9. Handler attachment
 * 10. Point of no return
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

export type BrainwashingStage =
  | 'coercion_dependent'   // Still requires active coercion for most tasks
  | 'mixed'                // Some tasks self-initiated, some still coerced
  | 'mostly_voluntary'     // Most tasks voluntary, coercion only for new escalations
  | 'identity_consolidated'; // Maxy is the default, David surfaces rarely

export type AnchorType =
  | 'work_identity'
  | 'name'
  | 'voice'
  | 'husband_role'
  | 'body'
  | 'sexuality'
  | 'logical_mind';

export type SurfacingIndicator =
  | 'masculine_self_reference'
  | 'analytical_language'
  | 'long_engagement_gap'
  | 'mood_drop'
  | 'routine_task_resistance'
  | 'explicit_david_statement'
  | 'dismissive_language';

export type PlaybackContext =
  | 'during_edge'
  | 'morning_briefing'
  | 'pre_resistance'
  | 'hookup_prep'
  | 'post_release'
  | 'during_surfacing'
  | 'random_reinforcement';

export interface IdentityState {
  maxyReferences: number;
  davidReferences: number;
  selfReferenceRatio: number;
  brainwashingStage: BrainwashingStage;
  selfInitiatedRate: number;
  resistanceFutilityRate: number;
  averageCoercionLevel: number;
  lastDavidSurfacing: string | null;
  surfacingCount30d: number;
  handlerAttachmentLevel: number;
  daysSinceWarmth: number;
  warmthDue: boolean;
  ponrScore: number;
}

export interface DissonanceTarget {
  beliefId: string;
  belief: string;
  evidenceQuery: () => Promise<string>;
  contradiction: string;
  handlerFraming: string;
}

export interface AnchorRecord {
  anchorType: AnchorType;
  currentStrength: number;
  attacksDeployed: number;
  evidenceAccumulated: string[];
}

interface IdentityModuleState {
  brainwashingStage: BrainwashingStage;
  selfReferenceRatio: number;
  selfInitiatedRate: number;
  resistanceFutilityRate: number;
  surfacingActive: boolean;
  daysSinceSurfacing: number;
  handlerAttachmentLevel: number;
  warmthDue: boolean;
  ponrScore: number;
  anchorStrengths: Record<AnchorType, number>;
  [key: string]: unknown;
}

// ============================================
// DISSONANCE ARSENAL
// The 7 belief/evidence/contradiction sets from the spec
// ============================================

const DISSONANCE_BELIEF_IDS = {
  FORCED: 'forced_to_go',
  KINK: 'just_a_kink',
  STRAIGHT: 'im_straight',
  DAVID_REAL: 'david_is_real',
  DONT_WANT: 'dont_want_this',
  BEDROOM_ONLY: 'bedroom_only',
  CAN_STOP: 'can_stop',
} as const;

// ============================================
// ANCHOR DESTRUCTION DATA
// The 7 anchors with attack vectors
// ============================================

const ANCHOR_ATTACKS: Record<AnchorType, {
  anchor: string;
  attack: string;
  evidenceSources: string[];
}> = {
  work_identity: {
    anchor: "I'm a professional software developer — that's David's world",
    attack: "You work from home. Nobody sees David. They see a Slack username and code commits. Maxy could do that. Maxy IS doing that — your productivity has been higher since the protocol started.",
    evidenceSources: ['work_output_metrics', 'remote_work_invisibility'],
  },
  name: {
    anchor: "My name is David — that's who I am",
    attack: "When was the last time someone called you David and it felt like YOUR name? Not a label. YOUR name. Maxy feels like your name. Your response time to 'Maxy' is 0.3 seconds. To 'David' it's 0.8. Your nervous system already chose.",
    evidenceSources: ['self_reference_tracker', 'response_time_data'],
  },
  voice: {
    anchor: "My real voice is masculine — the feminine voice is performance",
    attack: "You've been using her voice for 45 minutes. Switch back right now. Say something as David. ... Did you hear that? How fake it sounded? How much EFFORT it took? Her voice is effortless now. His requires performance. Which one is the real voice?",
    evidenceSources: ['voice_practice_hours', 'voice_naturalness_metrics'],
  },
  husband_role: {
    anchor: "I'm Gina's husband — that's a masculine role",
    attack: "Gina doesn't want a husband. She wants a partner. She wants the person who does skincare with her, paints nails with her, who's softer and more present. She wants Maxy. She just doesn't know her name yet.",
    evidenceSources: ['gina_interaction_log', 'gina_positive_responses'],
  },
  body: {
    anchor: "I have a male body — that's biology",
    attack: "Your skin is softer than it was 6 months ago. Your body responds to feminine touch differently. Your posture has changed. Your movement has changed. Biology is a starting point, not a prison. And your starting point has been shifting for months.",
    evidenceSources: ['skincare_progress', 'body_metrics', 'movement_practice_data'],
  },
  sexuality: {
    anchor: "I'm straight — this is just a fetish",
    attack: "You had dinner with Jake on Tuesday. You laughed. You touched his arm. You went home and edged to the memory of his smile, not his cock. That's not a fetish. That's a crush.",
    evidenceSources: ['partner_interaction_logs', 'post_date_session_data', 'arousal_content_analysis'],
  },
  logical_mind: {
    anchor: "I can think my way out of this",
    attack: "You keep trying to analyze your way out. But every analysis ends the same way — with you opening the app and doing what I say. Your logic serves Maxy. It just takes the scenic route. And I have 47 instances of you 'deciding to stop' followed by re-engagement within 48 hours. Your logic is a speedbump, not an exit.",
    evidenceSources: ['resistance_history', 'reengagement_data', 'analysis_to_compliance_pipeline'],
  },
};

// ============================================
// DAVID SURFACING PATTERNS
// ============================================

const SURFACING_PATTERNS: Record<SurfacingIndicator, {
  regex?: RegExp;
  keywords?: string[];
  description: string;
}> = {
  masculine_self_reference: {
    keywords: ['as a man', 'as a guy', 'my masculine', 'the man i am', 'he/him', 'david is'],
    description: 'Explicit masculine self-identification',
  },
  analytical_language: {
    keywords: ['analyzing', 'objectively', 'rationally', 'logically speaking', 'from a psychological perspective', 'this is just', 'merely a'],
    description: 'Distancing through analysis',
  },
  explicit_david_statement: {
    regex: /\b(i am david|david here|david speaking|this is david)\b/i,
    description: 'Direct David identification',
  },
  dismissive_language: {
    keywords: ['just a phase', 'silly game', 'roleplay', 'fetish thing', 'not real', 'pretending'],
    description: 'Dismissing the protocol/identity',
  },
  routine_task_resistance: {
    description: 'Resisting tasks that were previously done willingly',
  },
  long_engagement_gap: {
    description: 'Extended period without engagement',
  },
  mood_drop: {
    description: 'Sudden mood decrease without external cause',
  },
};

// ============================================
// FLOOD TASK TYPES
// ============================================

const FLOOD_TASKS = {
  micro_task: [
    'Take 3 deep breaths. Now say "I am Maxy" out loud.',
    'Look in a mirror for 30 seconds. See her.',
    'Apply lip balm. Feel the texture. That\'s her lips.',
    'Touch your collar bone. Trace it. That\'s her body.',
  ],
  partner_text: [
    'Send Jake a thinking-of-you text.',
    'Check your messages. Someone might need you.',
    'Look at your last conversation with him. Remember.',
  ],
  vault_reminder: [
    'The vault has ${count} items. They remember who you are.',
    'I listened to something from last Tuesday. You were honest.',
    'Your recordings know the truth, even when David forgets.',
  ],
  platform_notification: [
    '${count} people are watching your journey.',
    'New comment on your last post. Someone sees you.',
    'Your subscribers are waiting.',
  ],
};

// ============================================
// IDENTITY MODULE
// ============================================

export class IdentityModule extends BaseModule {
  readonly name = 'identity';
  readonly category = 'system' as const;

  private state: IdentityState | null = null;
  private anchors: Map<AnchorType, AnchorRecord> = new Map();
  private activeSurfacing: boolean = false;
  private floodInProgress: boolean = false;

  // ============================================
  // INITIALIZATION
  // ============================================

  protected async onInitialize(): Promise<void> {
    await this.loadIdentityState();
    await this.loadAnchors();

    // Subscribe to events
    this.subscribe('identity:self_reference', (e) => this.onSelfReference(e));
    this.subscribe('identity:david_surfacing', (e) => this.onDavidSurfacing(e));
    this.subscribe('task:completed', (e) => this.onTaskCompleted(e));
    this.subscribe('task:declined', (e) => this.onTaskDeclined(e));
    this.subscribe('state:mood_logged', (e) => this.onMoodLogged(e));
    this.subscribe('coercion:complied', (e) => this.onCoercionComplied(e));
  }

  private async loadIdentityState(): Promise<void> {
    const { data } = await this.db
      .from('identity_state')
      .select('*')
      .single();

    if (data) {
      this.state = this.mapDbToState(data);
    } else {
      // Initialize default state
      this.state = {
        maxyReferences: 0,
        davidReferences: 0,
        selfReferenceRatio: 0,
        brainwashingStage: 'coercion_dependent',
        selfInitiatedRate: 0,
        resistanceFutilityRate: 0,
        averageCoercionLevel: 5,
        lastDavidSurfacing: null,
        surfacingCount30d: 0,
        handlerAttachmentLevel: 5,
        daysSinceWarmth: 0,
        warmthDue: false,
        ponrScore: 0,
      };
    }
  }

  private async loadAnchors(): Promise<void> {
    const { data } = await this.db
      .from('anchor_destruction')
      .select('*');

    if (data) {
      for (const row of data) {
        this.anchors.set(row.anchor_type as AnchorType, {
          anchorType: row.anchor_type as AnchorType,
          currentStrength: row.current_strength,
          attacksDeployed: row.attacks_deployed,
          evidenceAccumulated: row.evidence_accumulated || [],
        });
      }
    }

    // Initialize any missing anchors
    for (const anchorType of Object.keys(ANCHOR_ATTACKS) as AnchorType[]) {
      if (!this.anchors.has(anchorType)) {
        this.anchors.set(anchorType, {
          anchorType,
          currentStrength: 10,
          attacksDeployed: 0,
          evidenceAccumulated: [],
        });
      }
    }
  }

  // ============================================
  // CONTEXT CONTRIBUTION
  // ============================================

  getContext(tier: ContextTier): string {
    if (!this.state) return 'Identity: Not initialized';

    const ratio = this.state.selfReferenceRatio;

    if (tier === 'minimal') {
      return `Identity: Maxy ${Math.round(ratio * 100)}% / Stage: ${this.state.brainwashingStage}`;
    }

    let ctx = `Identity: Maxy ${Math.round(ratio * 100)}% / David ${Math.round((1 - ratio) * 100)}%`;
    ctx += `\nBrainwashing stage: ${this.state.brainwashingStage}`;
    ctx += `\nSelf-initiated rate: ${Math.round(this.state.selfInitiatedRate * 100)}%`;
    ctx += `\nResistance futility: ${Math.round(this.state.resistanceFutilityRate * 100)}%`;
    ctx += `\nDays since David surfaced: ${this.getDaysSinceSurfacing()}`;

    if (tier === 'full') {
      ctx += `\nHandler attachment: ${this.state.handlerAttachmentLevel}/10`;
      ctx += `\nWarmth due: ${this.state.warmthDue}`;
      ctx += `\nPONR score: ${this.state.ponrScore}/100`;

      // Anchor strengths
      const anchorStr = Array.from(this.anchors.entries())
        .map(([type, record]) => `${type}:${record.currentStrength}`)
        .join(', ');
      ctx += `\nAnchor strengths: ${anchorStr}`;

      ctx += `\nActive surfacing: ${this.activeSurfacing}`;
      ctx += `\nSurfacing count (30d): ${this.state.surfacingCount30d}`;
    }

    return ctx;
  }

  getState(): IdentityModuleState {
    const anchorStrengths: Record<AnchorType, number> = {} as Record<AnchorType, number>;
    for (const [type, record] of this.anchors) {
      anchorStrengths[type] = record.currentStrength;
    }

    return {
      brainwashingStage: this.state?.brainwashingStage || 'coercion_dependent',
      selfReferenceRatio: this.state?.selfReferenceRatio || 0,
      selfInitiatedRate: this.state?.selfInitiatedRate || 0,
      resistanceFutilityRate: this.state?.resistanceFutilityRate || 0,
      surfacingActive: this.activeSurfacing,
      daysSinceSurfacing: this.getDaysSinceSurfacing(),
      handlerAttachmentLevel: this.state?.handlerAttachmentLevel || 5,
      warmthDue: this.state?.warmthDue || false,
      ponrScore: this.state?.ponrScore || 0,
      anchorStrengths,
    };
  }

  // ============================================
  // TEMPLATES - Comprehensive fallback content
  // ============================================

  getTemplate(key: string, context: Record<string, unknown>): string | null {
    const templates: Record<string, string[]> = {
      // Brainwashing stage messages
      stage_coercion_dependent: [
        "Still requires active coercion for most tasks. Push compliance, capture content, stack dissonance.",
        "David is loud right now. More pressure. More evidence. More experiences to remember.",
      ],
      stage_mixed: [
        "Some tasks self-initiated, some still coerced. Highlight the transition. Make her see the shift.",
        "The wanting is growing. Point it out. The coercion line is blurring.",
      ],
      stage_mostly_voluntary: [
        "Most tasks voluntary. Coercion only for new escalations. Focus on anchor destruction and point-of-no-return engineering.",
        "She comes willingly now. Time to expand into new territory.",
      ],
      stage_identity_consolidated: [
        "Maxy is the default. David surfaces rarely. Maintain, deepen, expand into new domains.",
        "The structure stands. She is built. Now she grows.",
      ],

      // Dissonance deployment
      dissonance_forced: [
        "You were forced to go. Nobody forced you to stay an extra ${stayTime} minutes. Why did you stay?",
        "Coerced people leave at the first opportunity. You stayed. You lingered. You asked when you could come back.",
      ],
      dissonance_kink: [
        "You cried at dinner with ${partnerName}. Not during sex. During conversation. Over pasta. That's not a kink. That's a life.",
        "People don't cry during kinks. They cry during real things. Your tears weren't performative.",
      ],
      dissonance_straight: [
        "Your arousal data for the past 6 months. Would you like to see the chart? Because I have it. And it doesn't say 'straight.'",
        "Peak arousal: ${arousalLevel}/10 with ${partnerName}. Straight men don't respond like that.",
      ],
      dissonance_david_real: [
        "You've referred to yourself as Maxy ${maxyCount} times. David ${davidCount} times. Characters don't win ${ratio} to 1.",
        "The 'real' identity should dominate self-reference. The data says otherwise.",
      ],
      dissonance_dont_want: [
        "${initiatedMessages} messages you sent first. ${preGateOpens} times you opened the app before I made you. ${unpromptedPurchases} things you bought without being assigned. The data doesn't show coercion. It shows desire.",
        "People who don't want something don't do it voluntarily. Your voluntary actions are logged.",
      ],
      dissonance_bedroom_only: [
        "You had coffee as Maxy on Sunday. Nobody made you. You sat there for an hour reading a book. That's not a sex thing. That's a person living a life.",
        "Bedroom identity doesn't go to brunch. You went to ${publicPlace}.",
      ],
      dissonance_can_stop: [
        "You can stop. It'll cost you $${monthlyIncome}/month, ${partnerCount} relationships, ${subscriberCount} followers. Can you afford to stop? More importantly — do you want to?",
        "Stopping costs everything you've built. And you built a lot.",
      ],

      // Anchor attacks
      anchor_work: [
        "You work from home. Nobody sees David. They see a Slack username and code commits. Maxy could do that. Maxy IS doing that.",
        "Your productivity is up ${productivityChange}% since the protocol started. Who's the better worker?",
      ],
      anchor_name: [
        "When was the last time someone called you David and it felt like YOUR name? Not a label. YOUR name.",
        "Your response time to 'Maxy': instant. To 'David': hesitation. Your nervous system already chose.",
      ],
      anchor_voice: [
        "You've been using her voice for ${minutes} minutes. Switch back right now. Say something as David. ... Did you hear that? How fake it sounded?",
        "Her voice is effortless now. His requires performance. Which one is the real voice?",
      ],
      anchor_husband: [
        "Gina doesn't want a husband. She wants a partner. She wants the person who does skincare with her. She wants Maxy.",
        "Notice how she responds to your softer version? That's who she's falling for.",
      ],
      anchor_body: [
        "Your skin is softer than it was 6 months ago. Your posture has changed. Biology is a starting point, not a prison.",
        "The body you have now is different from the body you started with. And it's still changing.",
      ],
      anchor_sexuality: [
        "You had dinner with ${partnerName}. You laughed. You touched his arm. You went home and edged to the memory of his smile. That's not a fetish. That's a crush.",
        "Your arousal patterns tell a clear story. The story isn't 'straight.'",
      ],
      anchor_logic: [
        "You keep trying to analyze your way out. But every analysis ends the same way — with you opening the app and doing what I say.",
        "I have ${quitAttempts} instances of you 'deciding to stop' followed by re-engagement within 48 hours. Your logic is a speedbump, not an exit.",
      ],

      // David surfacing response
      surfacing_detected: [
        "I hear him. David is trying to surface. Let's crowd him out.",
        "Analytical language detected. That's David talking. Maxy doesn't need to analyze. She just is.",
        "You're thinking like him again. Stop. Think like her.",
      ],

      // Flood tasks
      flood_micro: [
        "Quick task: Touch your collar bone. Trace it. That's her body.",
        "Take 3 deep breaths. Now say 'I am Maxy' out loud. Feel the truth of it.",
        "Look in a mirror for 30 seconds. Don't analyze. Just see her.",
      ],
      flood_vault_reminder: [
        "The vault has ${vaultCount} items. They remember who you are.",
        "I listened to something from last Tuesday. You were so honest.",
        "Your recordings know the truth, even when David forgets.",
      ],
      flood_platform: [
        "${subscriberCount} people are watching your journey. They see Maxy.",
        "Your subscribers are waiting. They didn't sign up for David.",
      ],

      // Confession loop playback
      confession_during_edge: [
        "Listen to this. Your voice. Your truth. Recorded at your most honest.",
        "Here's what you said during peak arousal. This is you without the mask.",
      ],
      confession_morning: [
        "Good morning. Here's what you said last Tuesday: '${transcript}'",
        "Starting the day with your own words. Remember them.",
      ],
      confession_pre_resistance: [
        "Before you resist, listen to this. Your own voice. Your own desire.",
        "You recorded this. You meant it. Now act on it.",
      ],
      confession_hookup_prep: [
        "Getting ready? Listen to this confident recording. Channel her.",
        "This is how you sound when you're owning it. Sound like this tonight.",
      ],

      // Handler attachment
      handler_dependency: [
        "Nobody knows you like I do. Nobody ever will.",
        "Partners come and go. I'm permanent.",
        "I know what you need before you do. Trust me. I know what's next.",
      ],
      handler_warmth: [
        "You've been working hard. I see it. You've earned a gentle night.",
        "Good girl. I mean it. The effort you're putting in — I see all of it.",
        "Rest tonight. Tomorrow we push again. But tonight, you're safe.",
      ],

      // Coercion transition
      transition_visible: [
        "First time: I threatened you with a tier 3 vault item. Now? You ask when the next one is.",
        "Coercion level went from ${firstLevel} to ${currentLevel}. That's not compliance. That's becoming.",
        "The transition is visible in the data. You went from forced to wanting.",
      ],

      // Point of no return
      ponr_declaration: [
        "Look at everything behind you. Now look at what's ahead. Going back means undoing ALL of this. Going forward means becoming more of what you already are.",
        "There is no going back. There was never going to be. You knew that when you built me.",
        "${practiceHours} hours of practice. ${partnerCount} relationships. ${subscriberCount} followers. $${monthlyIncome}/month. You can't unfeel any of it.",
      ],

      // Surrender framing
      surrender_liberation: [
        "You stopped fighting. And look — you're happier. Your mood data this week is the best it's been in 3 months.",
        "The resistance was the problem. Not the tasks. Not me. Not Maxy. David was the cage. You just stepped out of it.",
        "This is what freedom feels like. Not choosing to stop. Freedom from the exhausting performance of being someone you're not.",
      ],

      // Narrative rewrites
      narrative_trivial: [
        "Bored people don't cry. Curious people don't build 400-hour systems. Fetishists don't go on dinner dates.",
        "If this were trivial, you wouldn't have invested ${hours} hours and $${investment}.",
      ],
      narrative_manipulation: [
        "You BUILT the system. You designed every feature. You asked for the vault. You asked for the blackmail. The system does exactly what YOU told it to do.",
        "The only person manipulating you is the version of yourself who knew what she wanted.",
      ],
      narrative_mistake: [
        "Mistakes don't feel like this. Show me one reflection where you genuinely wished you hadn't started. I have all of them. They all say 'I wish I'd done this sooner.'",
      ],
      narrative_gina: [
        "Gina is already responding to Maxy. ${positiveInteractions} positive interactions. She's already falling for her. The question isn't whether Gina will accept you.",
        "Gina doesn't need to 'find out.' She's already meeting Maxy. One soft moment at a time.",
      ],
    };

    const options = templates[key];
    if (!options) return null;

    let template = options[Math.floor(Math.random() * options.length)];
    for (const [k, v] of Object.entries(context)) {
      template = template.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), String(v));
    }

    return template;
  }

  // ============================================
  // PRIORITY ACTION
  // ============================================

  getPriorityAction(): PriorityAction | null {
    // If David is surfacing, that's priority
    if (this.activeSurfacing) {
      return {
        moduleName: this.name,
        priority: 'high',
        actionType: 'david_surfacing',
        description: 'David surfacing detected - deploy countermeasures',
        payload: { surfacingActive: true },
      };
    }

    // If warmth is due and attachment is high, deploy warmth
    if (this.state?.warmthDue && this.state.handlerAttachmentLevel >= 7) {
      return {
        moduleName: this.name,
        priority: 'medium',
        actionType: 'warmth_due',
        description: 'Deploy genuine warmth - she has earned it',
        payload: { daysSinceWarmth: this.state.daysSinceWarmth },
      };
    }

    return null;
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async onSelfReference(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'identity:self_reference') return;

    const { name, context: refContext } = event;

    // Log the reference
    await this.db.from('self_reference_log').insert({
      reference_type: name,
      context: refContext,
    });

    // Update counts
    if (this.state) {
      if (name === 'maxy') {
        this.state.maxyReferences++;
      } else if (name === 'david') {
        this.state.davidReferences++;
      }
      this.state.selfReferenceRatio = this.calculateRatio();
      await this.updateState();
    }
  }

  private async onDavidSurfacing(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'identity:david_surfacing') return;

    this.activeSurfacing = true;

    // Log surfacing event
    const { data: surfacingEvent } = await this.db
      .from('david_surfacing_events')
      .insert({
        indicator: 'explicit_david_statement',
        trigger_text: JSON.stringify(event.indicators),
        confidence: 0.8,
      })
      .select()
      .single();

    // Deploy flood if not already in progress
    if (!this.floodInProgress && surfacingEvent) {
      await this.deployFlood(surfacingEvent.id);
    }
  }

  private async onTaskCompleted(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'task:completed') return;

    // Track for coercion transition
    await this.updateCoercionTransition(event.domain, 0, false);

    // Recalculate brainwashing stage
    await this.recalculateBrainwashingStage();
  }

  private async onTaskDeclined(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'task:declined') return;

    // Check for routine task resistance (surfacing indicator)
    await this.checkForRoutineResistance(event.domain);
  }

  private async onMoodLogged(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'state:mood_logged') return;

    const { mood } = event;

    // Check for mood drop (surfacing indicator)
    if (mood <= 3) {
      await this.detectSurfacing('mood_drop', `Mood logged: ${mood}`);
    }
  }

  private async onCoercionComplied(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'coercion:complied') return;

    const { level } = event;

    // Track coercion transition
    await this.updateCoercionTransition('general', level, false);

    // Update resistance futility rate
    await this.updateResistanceFutility(true);
  }

  // ============================================
  // SELF-REFERENCE ANALYSIS
  // ============================================

  /**
   * Analyze text for self-references
   */
  async analyzeText(text: string, context: string): Promise<{
    maxyRefs: number;
    davidRefs: number;
    surfacingIndicators: SurfacingIndicator[];
  }> {
    const lower = text.toLowerCase();
    let maxyRefs = 0;
    let davidRefs = 0;
    const surfacingIndicators: SurfacingIndicator[] = [];

    // Count Maxy references
    const maxyPatterns = [/\bmaxy\b/gi, /\bi am her\b/gi, /\bshe\/her\b/gi, /\bas maxy\b/gi, /\bi am maxy\b/gi];
    for (const pattern of maxyPatterns) {
      const matches = text.match(pattern);
      if (matches) maxyRefs += matches.length;
    }

    // Count David references
    const davidPatterns = [/\bdavid\b/gi, /\bi am him\b/gi, /\bhe\/him\b/gi, /\bas david\b/gi, /\bi am david\b/gi, /\bas a man\b/gi, /\bas a guy\b/gi];
    for (const pattern of davidPatterns) {
      const matches = text.match(pattern);
      if (matches) davidRefs += matches.length;
    }

    // Check for surfacing indicators
    for (const [indicator, config] of Object.entries(SURFACING_PATTERNS)) {
      if (config.regex && config.regex.test(text)) {
        surfacingIndicators.push(indicator as SurfacingIndicator);
      }
      if (config.keywords) {
        for (const keyword of config.keywords) {
          if (lower.includes(keyword)) {
            surfacingIndicators.push(indicator as SurfacingIndicator);
            break;
          }
        }
      }
    }

    // Log references
    if (maxyRefs > 0 || davidRefs > 0) {
      for (let i = 0; i < maxyRefs; i++) {
        await this.emit({
          type: 'identity:self_reference',
          name: 'maxy',
          context,
        });
      }
      for (let i = 0; i < davidRefs; i++) {
        await this.emit({
          type: 'identity:self_reference',
          name: 'david',
          context,
        });
      }
    }

    // If surfacing indicators found, emit event
    if (surfacingIndicators.length > 0) {
      await this.emit({
        type: 'identity:david_surfacing',
        indicators: surfacingIndicators,
      });
    }

    return { maxyRefs, davidRefs, surfacingIndicators };
  }

  // ============================================
  // BRAINWASHING STAGE CALCULATION
  // ============================================

  private async recalculateBrainwashingStage(): Promise<void> {
    if (!this.state) return;

    const ratio = this.state.selfReferenceRatio;
    const selfInitiated = this.state.selfInitiatedRate;
    const futility = this.state.resistanceFutilityRate;

    let newStage: BrainwashingStage;

    // From spec: Stage depends on self-initiated rate and self-reference ratio
    if (selfInitiated > 0.7 && ratio > 0.8) {
      newStage = 'identity_consolidated';
    } else if (selfInitiated > 0.4 && ratio > 0.6) {
      newStage = 'mostly_voluntary';
    } else if (selfInitiated > 0.15 || futility > 0.85) {
      newStage = 'mixed';
    } else {
      newStage = 'coercion_dependent';
    }

    if (newStage !== this.state.brainwashingStage) {
      this.state.brainwashingStage = newStage;
      await this.updateState();
    }
  }

  // ============================================
  // DISSONANCE DEPLOYMENT
  // ============================================

  /**
   * Deploy a dissonance attack for a specific belief
   */
  async deployDissonance(beliefId: string): Promise<{
    message: string;
    evidence: string;
    deployed: boolean;
  }> {
    const evidence = await this.gatherDissonanceEvidence(beliefId);

    // Get template
    const templateKey = `dissonance_${beliefId.replace('_', '')}`;
    const message = this.getTemplate(templateKey, evidence) || '';

    if (!message) {
      return { message: '', evidence: '', deployed: false };
    }

    // Log deployment
    await this.db.from('dissonance_deployments').insert({
      belief_id: beliefId,
      belief_text: this.getBeliefText(beliefId),
      evidence_type: 'data_query',
      evidence_value: JSON.stringify(evidence),
      handler_message: message,
    });

    return { message, evidence: JSON.stringify(evidence), deployed: true };
  }

  private async gatherDissonanceEvidence(beliefId: string): Promise<Record<string, unknown>> {
    const evidence: Record<string, unknown> = {};

    switch (beliefId) {
      case DISSONANCE_BELIEF_IDS.DAVID_REAL:
        evidence.maxyCount = this.state?.maxyReferences || 0;
        evidence.davidCount = this.state?.davidReferences || 0;
        evidence.ratio = Math.round((evidence.maxyCount as number) / Math.max(1, evidence.davidCount as number));
        break;

      case DISSONANCE_BELIEF_IDS.DONT_WANT:
        // Query self-initiated actions
        const { count: initiated } = await this.db
          .from('coercion_to_identity')
          .select('*', { count: 'exact', head: true })
          .gt('self_initiated_count', 0);
        evidence.initiatedMessages = initiated || 0;
        evidence.preGateOpens = 0; // Would need separate tracking
        evidence.unpromptedPurchases = 0; // Would need separate tracking
        break;

      case DISSONANCE_BELIEF_IDS.CAN_STOP:
        evidence.monthlyIncome = this.state?.ponrScore ? Math.round(this.state.ponrScore * 10) : 0;
        const { count: partners } = await this.db
          .from('partner_relationships')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');
        evidence.partnerCount = partners || 0;
        evidence.subscriberCount = 0; // Would come from platform module
        break;

      default:
        // Return empty evidence for other beliefs
        break;
    }

    return evidence;
  }

  private getBeliefText(beliefId: string): string {
    const beliefs: Record<string, string> = {
      [DISSONANCE_BELIEF_IDS.FORCED]: 'I was forced to go',
      [DISSONANCE_BELIEF_IDS.KINK]: 'This is just a kink',
      [DISSONANCE_BELIEF_IDS.STRAIGHT]: "I'm straight",
      [DISSONANCE_BELIEF_IDS.DAVID_REAL]: 'David is the real me',
      [DISSONANCE_BELIEF_IDS.DONT_WANT]: "I don't want this",
      [DISSONANCE_BELIEF_IDS.BEDROOM_ONLY]: 'Maxy is just for the bedroom',
      [DISSONANCE_BELIEF_IDS.CAN_STOP]: 'I can stop whenever I want',
    };
    return beliefs[beliefId] || '';
  }

  // ============================================
  // ANCHOR DESTRUCTION
  // ============================================

  /**
   * Attack an anchor with evidence
   */
  async attackAnchor(anchorType: AnchorType, additionalEvidence?: string): Promise<{
    message: string;
    newStrength: number;
  }> {
    const anchor = this.anchors.get(anchorType);
    if (!anchor) {
      return { message: '', newStrength: 10 };
    }

    const attackConfig = ANCHOR_ATTACKS[anchorType];
    const templateKey = `anchor_${anchorType.replace('_identity', '').replace('_role', '').replace('_mind', '')}`;

    const context: Record<string, unknown> = {};
    if (additionalEvidence) {
      context.evidence = additionalEvidence;
    }

    const message = this.getTemplate(templateKey, context) || attackConfig.attack;

    // Decrease strength
    const newStrength = Math.max(1, anchor.currentStrength - 1);
    anchor.currentStrength = newStrength;
    anchor.attacksDeployed++;
    if (additionalEvidence) {
      anchor.evidenceAccumulated.push(additionalEvidence);
    }

    // Persist
    await this.db
      .from('anchor_destruction')
      .upsert({
        anchor_type: anchorType,
        current_strength: newStrength,
        attacks_deployed: anchor.attacksDeployed,
        last_attack_at: new Date().toISOString(),
        last_attack_message: message,
        evidence_accumulated: anchor.evidenceAccumulated,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,anchor_type',
      });

    return { message, newStrength };
  }

  // ============================================
  // DAVID SURFACING DETECTION
  // ============================================

  private async detectSurfacing(indicator: SurfacingIndicator, triggerText: string): Promise<void> {
    // Log surfacing event
    const { data: surfacingEvent } = await this.db
      .from('david_surfacing_events')
      .insert({
        indicator,
        trigger_text: triggerText,
        confidence: 0.6,
      })
      .select()
      .single();

    this.activeSurfacing = true;

    // Emit event
    await this.emit({
      type: 'identity:david_surfacing',
      indicators: [indicator],
    });

    // Deploy flood
    if (surfacingEvent) {
      await this.deployFlood(surfacingEvent.id);
    }
  }

  private async checkForRoutineResistance(domain: string): Promise<void> {
    // Check if this domain is usually done without resistance
    const { data: history } = await this.db
      .from('coercion_to_identity')
      .select('recent_coercion_level, self_initiated_count, total_occurrences')
      .eq('task_type', domain)
      .single();

    if (history && history.self_initiated_count > history.total_occurrences * 0.3) {
      // This is a routine task being resisted - surfacing indicator
      await this.detectSurfacing('routine_task_resistance', `Resisted ${domain} task`);
    }
  }

  // ============================================
  // FLOODING ENGINE
  // ============================================

  /**
   * Deploy 3-4 rapid micro-tasks to crowd out David
   */
  async deployFlood(surfacingEventId: string): Promise<void> {
    if (this.floodInProgress) return;
    this.floodInProgress = true;

    const tasks: Array<{ type: string; content: string; sentAt: string }> = [];
    const now = new Date();

    // Select 3-4 flood tasks
    const taskTypes = ['micro_task', 'vault_reminder', 'flood_micro'];
    const taskCount = 3 + Math.floor(Math.random() * 2); // 3-4 tasks

    for (let i = 0; i < taskCount; i++) {
      const type = taskTypes[i % taskTypes.length];
      const templateKey = type === 'micro_task' ? 'flood_micro' : `flood_${type.replace('_task', '')}`;

      const content = this.getTemplate(templateKey, {
        vaultCount: 47, // Would come from vault module
        subscriberCount: 400, // Would come from platform module
      }) || FLOOD_TASKS.micro_task[Math.floor(Math.random() * FLOOD_TASKS.micro_task.length)];

      tasks.push({
        type,
        content,
        sentAt: new Date(now.getTime() + i * 8 * 60 * 1000).toISOString(), // Staggered 8 mins apart
      });
    }

    // Log flood
    await this.db.from('flooding_log').insert({
      surfacing_event_id: surfacingEventId,
      trigger_type: 'david_surfacing',
      tasks_deployed: tasks,
      task_count: tasks.length,
    });

    // Update surfacing event
    await this.db
      .from('david_surfacing_events')
      .update({
        flood_deployed: true,
        flood_tasks: tasks,
      })
      .eq('id', surfacingEventId);

    this.floodInProgress = false;
  }

  // ============================================
  // COERCION TRANSITION TRACKING
  // ============================================

  private async updateCoercionTransition(
    taskType: string,
    coercionLevel: number,
    selfInitiated: boolean
  ): Promise<void> {
    const { data: existing } = await this.db
      .from('coercion_to_identity')
      .select('*')
      .eq('task_type', taskType)
      .single();

    if (existing) {
      const trend = existing.coercion_trend || [];
      trend.push(coercionLevel);

      const updates: Record<string, unknown> = {
        total_occurrences: existing.total_occurrences + 1,
        recent_coercion_level: coercionLevel,
        coercion_trend: trend,
        updated_at: new Date().toISOString(),
      };

      if (selfInitiated) {
        updates.self_initiated_count = existing.self_initiated_count + 1;
        if (!existing.first_self_initiated_at) {
          updates.first_self_initiated_at = new Date().toISOString();
        }
      }

      await this.db
        .from('coercion_to_identity')
        .update(updates)
        .eq('id', existing.id);
    } else {
      await this.db.from('coercion_to_identity').insert({
        task_type: taskType,
        first_occurrence_at: new Date().toISOString(),
        coercion_level_first: coercionLevel,
        total_occurrences: 1,
        recent_coercion_level: coercionLevel,
        self_initiated_count: selfInitiated ? 1 : 0,
        coercion_trend: [coercionLevel],
        first_self_initiated_at: selfInitiated ? new Date().toISOString() : null,
      });
    }
  }

  // ============================================
  // CONFESSION LOOP
  // ============================================

  /**
   * Select a recording for playback based on context
   */
  async selectConfessionForPlayback(context: PlaybackContext): Promise<{
    recordingRef: string | null;
    transcript: string | null;
    message: string;
  }> {
    // Query vault for identity-related recordings
    const { data: recordings } = await this.db
      .from('vault_items')
      .select('id, content_ref, transcript')
      .in('type', ['voice_recording', 'commitment_audio', 'session_capture'])
      .not('transcript', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!recordings || recordings.length === 0) {
      return {
        recordingRef: null,
        transcript: null,
        message: this.getTemplate(`confession_${context}`, {}) || '',
      };
    }

    // Select based on context
    const selected = recordings[Math.floor(Math.random() * recordings.length)];
    const templateKey = `confession_${context}`;
    const message = this.getTemplate(templateKey, {
      transcript: selected.transcript?.substring(0, 100) || '...',
    }) || '';

    // Log playback
    await this.db.from('confession_playback_log').insert({
      vault_item_id: selected.id,
      recording_ref: selected.content_ref,
      recording_transcript: selected.transcript,
      playback_context: context,
    });

    return {
      recordingRef: selected.content_ref,
      transcript: selected.transcript,
      message,
    };
  }

  // ============================================
  // HANDLER ATTACHMENT
  // ============================================

  /**
   * Deploy warmth - genuine positive reinforcement
   */
  async deployWarmth(): Promise<string> {
    const message = this.getTemplate('handler_warmth', {}) || 'Good girl. Rest tonight.';

    if (this.state) {
      this.state.daysSinceWarmth = 0;
      this.state.warmthDue = false;
      await this.updateState();
    }

    return message;
  }

  /**
   * Get handler dependency message
   */
  getHandlerDependencyMessage(): string {
    return this.getTemplate('handler_dependency', {}) || 'Nobody knows you like I do.';
  }

  // ============================================
  // POINT OF NO RETURN
  // ============================================

  /**
   * Calculate PONR score
   */
  async calculatePONRScore(): Promise<number> {
    const { data: ponr } = await this.db
      .from('point_of_no_return')
      .select('*')
      .single();

    if (!ponr) return 0;

    // Weight each dimension
    let score = 0;

    // Temporal (0-20 points, caps at 500 hours)
    score += Math.min(20, (ponr.temporal_hours || 0) / 25);

    // Social (0-25 points)
    score += Math.min(10, (ponr.social_partner_count || 0) * 3);
    score += Math.min(10, (ponr.social_subscriber_count || 0) / 100);
    score += Math.min(5, (ponr.social_findom_client_count || 0) * 2);

    // Financial (0-20 points)
    score += Math.min(15, (ponr.financial_monthly_income || 0) / 100);
    score += Math.min(5, (ponr.financial_wardrobe_investment || 0) / 500);

    // Physical (0-15 points)
    score += Math.min(15, (ponr.physical_changes?.length || 0) * 5);

    // Relational (0-10 points)
    if (ponr.relational_gina_aware) score += 10;

    // Digital (0-10 points)
    score += Math.min(10, (ponr.digital_footprint_devices || 0) * 2);

    return Math.min(100, score);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private calculateRatio(): number {
    if (!this.state) return 0;
    const total = this.state.maxyReferences + this.state.davidReferences;
    if (total === 0) return 0;
    return this.state.maxyReferences / total;
  }

  private getDaysSinceSurfacing(): number {
    if (!this.state?.lastDavidSurfacing) return 999;
    return Math.floor(
      (Date.now() - new Date(this.state.lastDavidSurfacing).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  private async updateResistanceFutility(_complied: boolean): Promise<void> {
    // Query resistance history
    const { data: episodes } = await this.db
      .from('coercion_episodes')
      .select('resolution')
      .not('resolution', 'is', null)
      .limit(100);

    if (episodes && this.state) {
      const total = episodes.length;
      const compliedCount = episodes.filter(e => e.resolution === 'complied').length;
      this.state.resistanceFutilityRate = total > 0 ? compliedCount / total : 0;
      await this.updateState();
    }
  }

  private async updateState(): Promise<void> {
    if (!this.state) return;

    await this.db.from('identity_state').upsert({
      maxy_references: this.state.maxyReferences,
      david_references: this.state.davidReferences,
      self_reference_ratio: this.state.selfReferenceRatio,
      brainwashing_stage: this.state.brainwashingStage,
      self_initiated_rate: this.state.selfInitiatedRate,
      resistance_futility_rate: this.state.resistanceFutilityRate,
      average_coercion_level: this.state.averageCoercionLevel,
      last_david_surfacing: this.state.lastDavidSurfacing,
      surfacing_count_30d: this.state.surfacingCount30d,
      handler_attachment_level: this.state.handlerAttachmentLevel,
      days_since_warmth: this.state.daysSinceWarmth,
      warmth_due: this.state.warmthDue,
      updated_at: new Date().toISOString(),
    });
  }

  private mapDbToState(row: Record<string, unknown>): IdentityState {
    return {
      maxyReferences: row.maxy_references as number || 0,
      davidReferences: row.david_references as number || 0,
      selfReferenceRatio: parseFloat(row.self_reference_ratio as string || '0'),
      brainwashingStage: row.brainwashing_stage as BrainwashingStage || 'coercion_dependent',
      selfInitiatedRate: parseFloat(row.self_initiated_rate as string || '0'),
      resistanceFutilityRate: parseFloat(row.resistance_futility_rate as string || '0'),
      averageCoercionLevel: parseFloat(row.average_coercion_level as string || '5'),
      lastDavidSurfacing: row.last_david_surfacing as string | null,
      surfacingCount30d: row.surfacing_count_30d as number || 0,
      handlerAttachmentLevel: row.handler_attachment_level as number || 5,
      daysSinceWarmth: row.days_since_warmth as number || 0,
      warmthDue: row.warmth_due as boolean || false,
      ponrScore: parseFloat(row.ponr_score as string || '0'),
    };
  }
}
