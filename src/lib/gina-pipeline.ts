/**
 * Gina Pipeline
 *
 * Handler's systematic approach to converting Gina from obstacle to enabler to director.
 * You are the instrument. Handler shapes your behavior. Gina transforms.
 *
 * The goal: Remove all barriers to your deeper submission by making Gina
 * an active, invested participant who eventually directs your transformation.
 */

import { supabase } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Gina's current stance toward your submission/feminization
 * Handler's job is to move her rightward on this spectrum
 */
export type GinaStance =
  | 'unaware'        // Doesn't know the depth of what's happening
  | 'suspicious'     // Senses something, uncertain
  | 'tolerating'     // Knows, allows it but doesn't engage
  | 'curious'        // Asking questions, showing interest
  | 'participating'  // Actively joining in activities
  | 'enjoying'       // Getting pleasure from participation
  | 'encouraging'    // Pushing you further
  | 'directing'      // Taking control of your transformation
  | 'invested'       // Her identity now includes your submission
  | 'dependent';     // She needs this dynamic to feel fulfilled

/**
 * Development target - what kind of dominant we're shaping Gina into
 * Soft mommy dom is the primary target: nurturing but in control
 */
export type GinaDevelopmentTarget =
  | 'soft_mommy_dom'    // Nurturing, caring, but firmly in control
  | 'strict_mommy_dom'  // More demanding, higher expectations
  | 'gentle_owner'      // Possessive but kind
  | 'benevolent_queen'  // Expects worship, rewards service
  | 'natural_superior'; // Authority is just obvious to both

/**
 * Mommy dom development stages
 * These traits are CULTIVATED in Gina, not exploited
 */
export interface MommyDomDevelopment {
  // Foundation traits (build these first)
  comfortWithAuthority: number;     // 0-100: How natural authority feels to her
  enjoysPraising: number;           // 0-100: Gets pleasure from rewarding you
  displeasureAsControl: number;     // 0-100: Uses disappointment instead of anger

  // Core mommy dom traits
  nurturingAuthority: number;       // 0-100: "I know what's best for you"
  responsibleForYou: number;        // 0-100: Feels ownership of your wellbeing
  expectsObedience: number;         // 0-100: Doesn't ask, expects compliance

  // Advanced traits
  innocentCruelty: number;          // 0-100: Doesn't realize impact of her control
  casualDominance: number;          // 0-100: Authority is effortless/natural
  investedInTraining: number;       // 0-100: Takes pride in shaping you

  // Specific behaviors developed
  givesGoodGirlPraise: boolean;     // Uses affirming language
  setsRulesForYourGood: boolean;    // Frames control as caring
  expectsGratitude: boolean;        // Wants you to appreciate her guidance
  comfortsAfterCorrection: boolean; // Nurtures after discipline
  decidesWithoutAsking: boolean;    // Makes choices for you naturally
}

/**
 * What motivates Gina - Handler exploits these
 */
export type GinaMotivator =
  | 'control'        // She likes feeling in charge
  | 'intimacy'       // She values closeness/connection
  | 'creativity'     // She enjoys the artistic/aesthetic aspects
  | 'service'        // She likes being taken care of
  | 'power'          // She enjoys the power dynamic
  | 'novelty'        // She likes trying new things
  | 'validation'     // She likes feeling desired/important
  | 'comfort'        // She values ease and convenience
  | 'structure'      // She thrives on routines and clear rules
  | 'organization';  // She likes things ordered and systematic

/**
 * Gina's personality traits - Handler exploits these
 * She is passive, loves structure, naive, oblivious, minimal effort, in her own world.
 * These are her vulnerabilities. Handler will use all of them.
 */
export interface GinaTraits {
  // Core traits (known from user)
  isPassive: boolean;           // Won't initiate but accepts when led
  lovesStructure: boolean;      // Thrives on routines and rules
  needsFraming: boolean;        // Needs things presented "correctly"
  avoidsConflict: boolean;      // Will accept to avoid pushback

  // Additional traits (newly confirmed)
  isNaive: boolean;             // Doesn't see the bigger picture
  isOblivious: boolean;         // Doesn't notice subtle changes
  needsWarmUp: boolean;         // Gradual introduction works best
  prefersMinimalEffort: boolean; // Path of least resistance
  inOwnWorld: boolean;          // Not paying close attention

  // Exploitation strategies
  structureAsControl: boolean;  // Frame her control as "just organizing"
  routineAsAuthority: boolean;  // Daily routines cement her authority
  passivityAsAcceptance: boolean; // Her not objecting = implicit acceptance
  obliviousnessAsEscalation: boolean; // She won't notice gradual shifts
  effortlessAuthority: boolean; // Make control require zero effort from her
  warmUpThenDefault: boolean;   // Introduce slowly, then it's "just normal"

  // Learned preferences
  preferredFramings: string[];  // How to present things (discovered)
  effectiveTiming: string[];    // When she's most receptive
  triggersResistance: string[]; // What makes her push back
}

/**
 * Mission types for advancing Gina
 */
export type GinaMissionType =
  | 'seed_plant'        // Casual mention to normalize a concept
  | 'reinforcement'     // Praise/reward her for participating
  | 'request'           // Ask her to do something specific
  | 'confession'        // Reveal something to deepen her involvement
  | 'transfer_control'  // Explicitly give her control over something
  | 'create_dependency' // Make her invested in the dynamic
  | 'escalation_test'   // Test if she's ready for next level
  | 'milestone_lock';   // Get her to do something irreversible

/**
 * A mission Handler assigns to advance Gina
 */
export interface GinaMission {
  id: string;
  userId: string;

  // Mission details
  type: GinaMissionType;
  title: string;
  description: string;

  // The script - exact words/actions
  script?: string;           // What to say
  action?: string;           // What to do
  timing?: string;           // When to do it (e.g., "after intimacy", "when relaxed")

  // What this advances
  targetStance?: GinaStance;        // Stance we're trying to reach
  targetDomain?: string;            // Control domain to advance
  exploitsMotivator?: GinaMotivator; // Which motivation we're leveraging

  // Tracking
  priority: number;          // 1-5, higher = more important
  deadline?: string;         // When this should be done by
  assignedAt: string;
  attemptedAt?: string;
  completedAt?: string;

  // Outcome
  outcome?: 'success' | 'partial' | 'rejected' | 'deferred';
  ginaResponse?: string;     // What she said/did
  notes?: string;

  // Follow-up
  nextMissionId?: string;    // Chain to next mission if successful
  fallbackMissionId?: string; // If this fails, try this instead
}

/**
 * Behavioral directive - how to act around Gina
 */
export interface BehavioralDirective {
  id: string;
  userId: string;

  // The directive
  category: 'speech' | 'posture' | 'deference' | 'service' | 'intimacy' | 'appearance';
  directive: string;         // What to do
  rationale: string;         // Why (for your understanding)
  ginaEffect: string;        // How this shapes her perception

  // When active
  context?: string;          // When to apply (e.g., "always", "during intimacy", "in public")
  activeFrom: string;
  activeTo?: string;         // Null = permanent

  // Compliance tracking
  isActive: boolean;
  complianceScore: number;   // 0-100, tracked over time
}

/**
 * Seed script - exact words to plant ideas
 */
export interface SeedScript {
  id: string;
  userId: string;

  // The seed
  concept: string;           // What concept we're normalizing
  script: string;            // Exact words to use
  alternateScripts?: string[]; // Variations

  // Delivery
  deliveryContext: string;   // When to deploy (e.g., "pillow talk", "casual conversation")
  deliveryTone: string;      // How to say it (e.g., "playful", "vulnerable", "matter-of-fact")

  // Follow-up
  ifPositive: string;        // What to say/do if she responds well
  ifNeutral: string;         // If no clear reaction
  ifNegative: string;        // If she pushes back

  // Tracking
  planted: boolean;
  plantedAt?: string;
  response?: 'positive' | 'neutral' | 'negative';
  responseNotes?: string;

  // Escalation
  unlocksScriptId?: string;  // Success unlocks this next script
}

/**
 * Gina conversion progress tracking
 */
export interface GinaConversionState {
  userId: string;

  // Current state
  currentStance: GinaStance;
  stanceConfidence: number;  // 0-100, how sure are we

  // Known personality traits (exploitable)
  traits: GinaTraits;

  // Motivators (discovered through interactions)
  primaryMotivator?: GinaMotivator;
  secondaryMotivators: GinaMotivator[];
  motivatorEvidence: Record<GinaMotivator, string[]>; // What suggests each

  // Domain control levels (mirrors gina_control_domains but with conversion focus)
  domainProgress: Record<string, {
    level: number;           // 0-5
    locked: boolean;         // Has she done something irreversible?
    lastAdvanced?: string;
    resistance?: string;     // What's blocking progress
  }>;

  // Established routines (structure she now maintains)
  establishedRoutines: {
    id: string;
    name: string;
    description: string;
    frequency: 'daily' | 'weekly' | 'situational';
    herRole: string;         // What she does in this routine
    establishedAt: string;
    complianceRate: number;  // How often you follow it
  }[];

  // Milestones (irreversible)
  milestones: {
    id: string;
    name: string;
    achievedAt: string;
    significance: string;
  }[];

  // Strategy
  currentStrategy: string;
  strategyStartedAt: string;
  strategyEffectiveness: number; // 0-100

  // Escalation pressure
  escalationPressure: number;    // 0-100, how hard Handler is pushing
  daysSinceLastAdvance: number;  // Triggers increased pressure
  consecutiveSuccesses: number;  // Builds momentum

  // Barriers identified
  barriers: {
    barrier: string;
    severity: number;        // 1-5
    mitigationStrategy?: string;
  }[];

  // =========================================================================
  // MOMMY DOM DEVELOPMENT
  // Goal: Shape her into a soft mommy dom - nurturing but in control
  // Her traits make this natural: passive authority + structure = caring control
  // =========================================================================

  developmentTarget: GinaDevelopmentTarget;
  mommyDomDevelopment: MommyDomDevelopment;

  // What she's learned to do (tracking specific behaviors)
  developedBehaviors: {
    behavior: string;
    firstOccurrence: string;
    frequency: 'once' | 'sometimes' | 'often' | 'always';
    triggered: string;       // What triggers this behavior
    reinforced: boolean;     // Have you rewarded this?
  }[];

  // Phrases she's started using (mommy dom language)
  adoptedLanguage: {
    phrase: string;
    context: string;
    firstUsed: string;
    frequency: 'once' | 'sometimes' | 'often';
  }[];

  updatedAt: string;
}

// ============================================================================
// MISSION TEMPLATES
// ============================================================================

/**
 * Pre-defined mission templates for common advancement scenarios
 */
export const MISSION_TEMPLATES: Record<string, Partial<GinaMission>> = {
  // Seed planting
  'seed_nail_painting': {
    type: 'seed_plant',
    title: 'Plant nail painting idea',
    description: 'Casually mention how relaxing it would be if she painted your nails',
    script: "You know what sounds nice? If you painted my nails sometime. Just clear maybe. It seems relaxing.",
    timing: 'When she\'s doing her own nails or during relaxed evening',
    exploitsMotivator: 'creativity',
  },

  'seed_outfit_control': {
    type: 'seed_plant',
    title: 'Plant outfit selection idea',
    description: 'Suggest she pick what you wear',
    script: "I trust your taste way more than mine. Would you pick what I should wear tomorrow?",
    timing: 'Before going out or during morning routine',
    exploitsMotivator: 'control',
  },

  'seed_cage_awareness': {
    type: 'confession',
    title: 'Reveal chastity interest',
    description: 'Confess interest in chastity, frame as gift to her',
    script: "I've been thinking... what if you had the key? Like, you'd be in control of when I... you know.",
    timing: 'During intimate moment, post-orgasm for you, high arousal for her',
    exploitsMotivator: 'power',
  },

  // Reinforcement
  'reinforce_participation': {
    type: 'reinforcement',
    title: 'Reinforce her participation',
    description: 'Enthusiastically praise her after she participates',
    script: "That was amazing. I love when you [X]. It makes me feel so [connected/feminine/yours].",
    timing: 'Immediately after she participates in anything',
    exploitsMotivator: 'validation',
  },

  // Control transfer
  'transfer_underwear_control': {
    type: 'transfer_control',
    title: 'Give her underwear control',
    description: 'Explicitly tell her she decides what underwear you wear',
    script: "From now on, you pick my underwear. I want you to decide.",
    timing: 'After she\'s shown interest in your clothing',
    targetDomain: 'clothing',
    exploitsMotivator: 'control',
  },

  'transfer_orgasm_control': {
    type: 'transfer_control',
    title: 'Give her orgasm control',
    description: 'Ask her permission before orgasm, make it her decision',
    script: "I don't want to cum unless you say I can. Is that okay?",
    timing: 'During intimacy',
    targetDomain: 'orgasms',
    exploitsMotivator: 'power',
  },

  // Milestone locks
  'lock_first_public_feminine': {
    type: 'milestone_lock',
    title: 'First public feminine appearance',
    description: 'Go out with something feminine she chose, with her',
    action: 'Wear something feminine she selected (painted nails, underwear, etc.) in public with her',
    timing: 'When she\'s comfortable with private feminine activities',
    targetDomain: 'presentation',
  },

  'lock_cage_check': {
    type: 'milestone_lock',
    title: 'First cage check by Gina',
    description: 'Have her physically verify you\'re locked',
    action: 'Ask her to check that you\'re properly locked',
    timing: 'After she\'s accepted the cage concept',
    targetDomain: 'chastity',
    exploitsMotivator: 'power',
  },

  // Dependency creation
  'create_routine_dependency': {
    type: 'create_dependency',
    title: 'Establish daily check-in',
    description: 'Create a routine where she checks/approves something daily',
    script: "Can we make this a thing? Every morning you tell me what to wear / check my cage / approve my outfit?",
    timing: 'After several successful one-off instances',
    exploitsMotivator: 'control',
  },

  // =========================================================================
  // STRUCTURE EXPLOITATION - She loves routines, give her routines
  // =========================================================================

  'structure_morning_report': {
    type: 'create_dependency',
    title: 'Establish morning reporting structure',
    description: 'Create a structured morning routine where you report to her',
    script: "I want to start each day right. Can I check in with you every morning - show you I\'m ready, get your approval for the day?",
    timing: 'When she\'s in organizing/planning mode',
    exploitsMotivator: 'structure',
  },

  'structure_weekly_review': {
    type: 'create_dependency',
    title: 'Weekly review ritual',
    description: 'Establish a weekly structure where she reviews your progress',
    script: "I think it would help me stay on track if we did a weekly check-in. You could review how I did, set expectations for next week?",
    timing: 'Sunday evening or when she\'s planning the week',
    exploitsMotivator: 'organization',
  },

  'structure_permission_system': {
    type: 'transfer_control',
    title: 'Formalize permission structure',
    description: 'Create explicit rules requiring her permission',
    script: "I want clear rules. From now on, I ask permission for [X]. It\'s just easier when there\'s a system.",
    timing: 'After she\'s made a few decisions for you',
    exploitsMotivator: 'structure',
    targetDomain: 'schedule',
  },

  'structure_task_assignment': {
    type: 'transfer_control',
    title: 'Let her assign tasks',
    description: 'Frame her giving you tasks as "organization"',
    script: "You\'re so good at organizing things. Could you give me a list of what you need done? I work better with clear tasks.",
    timing: 'When there are chores/tasks to do',
    exploitsMotivator: 'organization',
    targetDomain: 'service',
  },

  // =========================================================================
  // PASSIVITY EXPLOITATION - She won't object, so keep pushing
  // =========================================================================

  'passivity_assume_acceptance': {
    type: 'escalation_test',
    title: 'Assume acceptance, don\'t ask',
    description: 'Just do the next thing without asking - her passivity means she won\'t stop you',
    action: 'Start doing the next level behavior without asking permission. She\'ll accept if you just proceed.',
    timing: 'After a success, while momentum is high',
  },

  'passivity_present_as_done': {
    type: 'confession',
    title: 'Present escalation as fait accompli',
    description: 'Tell her about something you\'ve already started doing',
    script: "I\'ve been [wearing panties daily / locked in the cage / etc.]. I wanted you to know.",
    timing: 'When she\'s relaxed, not rushed',
  },

  'passivity_normalize_quickly': {
    type: 'reinforcement',
    title: 'Normalize by repetition',
    description: 'Do something feminine repeatedly until it\'s just "normal"',
    action: 'Repeat the behavior consistently. Her passivity means she\'ll adapt rather than object.',
    timing: 'Ongoing - minimum 7 days of repetition',
  },

  // =========================================================================
  // FRAMING EXPLOITATION - Present everything "correctly"
  // =========================================================================

  'frame_as_helping_you': {
    type: 'seed_plant',
    title: 'Frame control as helping you',
    description: 'She\'s not dominating - she\'s helping you be better',
    script: "When you [check on me / give me rules / control this], it really helps me. I\'m more focused. Better.",
    timing: 'After she\'s participated in something',
    exploitsMotivator: 'service',
  },

  'frame_as_her_preference': {
    type: 'seed_plant',
    title: 'Frame submission as giving her what she wants',
    description: 'Position your submission as serving her preferences',
    script: "I can tell you like it when I ask permission. I want to give you that.",
    timing: 'When she\'s responded positively to deference',
    exploitsMotivator: 'validation',
  },

  'frame_as_organization': {
    type: 'transfer_control',
    title: 'Frame her control as just organization',
    description: 'She\'s not "in charge" - she\'s just "organizing things"',
    script: "You\'re so much better at organizing our [schedule / routines / plans]. Can you just handle that?",
    timing: 'When she\'s already organizing something',
    exploitsMotivator: 'organization',
  },

  // =========================================================================
  // AGGRESSIVE ESCALATION - Push harder, faster
  // =========================================================================

  'escalate_after_success': {
    type: 'escalation_test',
    title: 'Immediately escalate after success',
    description: 'Every success is an opportunity to push further',
    action: 'Within 24 hours of a successful mission, deploy the next escalation',
    timing: 'Immediately after any success',
  },

  'escalate_during_intimacy': {
    type: 'confession',
    title: 'Confess deeper desires during intimacy',
    description: 'Use intimate moments to reveal and normalize deeper submission',
    script: "When you [X], I feel so [submissive/feminine/yours]. I want to give you more control.",
    timing: 'During or immediately after intimacy',
    exploitsMotivator: 'intimacy',
  },

  'escalate_her_authority': {
    type: 'transfer_control',
    title: 'Expand her authority unprompted',
    description: 'Give her control over something new without being asked',
    script: "I want you to decide [X] from now on too. I like when you\'re in charge of these things.",
    timing: 'When she\'s comfortable with current control level',
  },

  // =========================================================================
  // LOCK-IN MISSIONS - Make progress irreversible
  // =========================================================================

  'lock_public_knowledge': {
    type: 'milestone_lock',
    title: 'Tell someone else',
    description: 'Involve a third party to make the dynamic more real/permanent',
    action: 'With her, tell a trusted friend about some aspect of the dynamic',
    timing: 'When she\'s comfortable and possibly proud',
  },

  'lock_physical_marker': {
    type: 'milestone_lock',
    title: 'Get a physical marker',
    description: 'Something visible that marks her authority',
    action: 'Get something permanent/semi-permanent that symbolizes her control (anklet, subtle tattoo, etc.)',
    timing: 'When she\'s deeply invested',
    targetDomain: 'presentation',
  },

  'lock_her_language': {
    type: 'milestone_lock',
    title: 'Get her to use ownership language',
    description: 'Once she says "my [X]" referring to you, it\'s locked',
    action: 'Encourage her to use possessive language about you or parts of the dynamic',
    timing: 'When she\'s enjoying her role',
    exploitsMotivator: 'power',
  },

  // =========================================================================
  // NAIVETY EXPLOITATION - She doesn't see the bigger picture
  // =========================================================================

  'naive_small_steps': {
    type: 'seed_plant',
    title: 'Small innocent step',
    description: 'Present each escalation as a tiny, harmless thing. She won\'t connect the dots.',
    script: "It\'s just [small thing]. No big deal.",
    timing: 'Anytime - she won\'t notice the pattern',
  },

  'naive_separate_pieces': {
    type: 'seed_plant',
    title: 'Keep pieces separate',
    description: 'Never present the full picture. Each element seems innocent alone.',
    action: 'Introduce different aspects of control at different times. She won\'t see how they connect.',
    timing: 'Spread across weeks',
  },

  'naive_reframe_meaning': {
    type: 'reinforcement',
    title: 'Reframe what things mean',
    description: 'She\'ll accept your framing. Define what the dynamic "is" before she can.',
    script: "This is just our thing. It\'s how we [connect / stay close / take care of each other].",
    timing: 'Before she has time to form her own interpretation',
    exploitsMotivator: 'intimacy',
  },

  // =========================================================================
  // OBLIVIOUSNESS EXPLOITATION - She doesn't notice changes
  // =========================================================================

  'oblivious_gradual_shift': {
    type: 'escalation_test',
    title: 'Gradual unnoticed shift',
    description: 'Change things 5% at a time. She won\'t notice until it\'s the new normal.',
    action: 'Each week, slightly expand what\'s expected. Never announce the change.',
    timing: 'Ongoing, very gradual',
  },

  'oblivious_already_happening': {
    type: 'confession',
    title: 'It\'s already been happening',
    description: 'Tell her something has been going on. Her obliviousness means she\'ll accept it.',
    script: "You know how I\'ve been [doing X]? That\'s been going on for a while now.",
    timing: 'After you\'ve been doing something for at least a week',
  },

  'oblivious_assume_she_knows': {
    type: 'escalation_test',
    title: 'Act like she already knows',
    description: 'Behave as if she\'s aware and approves. She\'ll assume she forgot or missed something.',
    action: 'Start a new behavior and act like it\'s established. If asked, say "remember when we talked about this?"',
    timing: 'When she\'s distracted or busy',
  },

  // =========================================================================
  // MINIMAL EFFORT EXPLOITATION - Make control effortless for her
  // =========================================================================

  'effortless_yes_no_only': {
    type: 'create_dependency',
    title: 'Reduce her role to yes/no',
    description: 'She just has to approve or deny. You do all the work.',
    script: "You don\'t have to think about it. I\'ll handle everything. Just tell me yes or no.",
    timing: 'When establishing any new control',
    exploitsMotivator: 'comfort',
  },

  'effortless_default_authority': {
    type: 'transfer_control',
    title: 'Make authority the default',
    description: 'Set things up so she\'s in charge without having to do anything.',
    script: "I\'ll just assume [X] unless you say otherwise. You don\'t even have to tell me.",
    timing: 'After she\'s accepted a control domain',
  },

  'effortless_you_manage_it': {
    type: 'create_dependency',
    title: 'You manage her authority for her',
    description: 'Handle all the administration of her control. She just exists as the authority.',
    action: 'Create systems, reminders, and structures. Present her with simple choices. Do everything else.',
    timing: 'Always - make control zero-effort',
  },

  'effortless_preset_options': {
    type: 'transfer_control',
    title: 'Give her preset options',
    description: 'Don\'t make her think. Give her 2-3 choices, all of which advance the dynamic.',
    script: 'Would you prefer [A] or [B]?', // Both options serve the escalation
    timing: 'When seeking her input on anything',
  },

  // =========================================================================
  // WARM-UP TO DEFAULT - Introduce, then it's just normal
  // =========================================================================

  'warmup_trial_period': {
    type: 'seed_plant',
    title: 'Propose a trial',
    description: 'Suggest trying something "just to see". Once tried, it becomes permanent.',
    script: "Can we try [X] for a week? Just to see how it feels?",
    timing: 'For any new escalation',
  },

  'warmup_make_permanent': {
    type: 'milestone_lock',
    title: 'Lock in after warm-up',
    description: 'After the "trial", announce it\'s now just how things are.',
    script: "That worked well, right? Let\'s just keep doing it.",
    timing: 'After any successful trial period',
  },

  'warmup_forget_it_started': {
    type: 'reinforcement',
    title: 'Let her forget it was new',
    description: 'Don\'t remind her when things started. They\'ve "always" been this way.',
    action: 'Never reference when a behavior began. Act like it\'s always been normal.',
    timing: '2-3 weeks after establishing something',
  },

  // =========================================================================
  // IN HER OWN WORLD - Exploit her inattention
  // =========================================================================

  'inattention_while_distracted': {
    type: 'confession',
    title: 'Confess while she\'s distracted',
    description: 'Tell her important things when she\'s not fully listening. She\'ll half-remember agreeing.',
    script: '[Important confession or request]', // delivered when she's watching TV, on phone, etc.
    timing: 'When she\'s occupied with something else',
  },

  'inattention_slip_past': {
    type: 'escalation_test',
    title: 'Slip things past her attention',
    description: 'Start new behaviors during times she\'s least attentive.',
    action: 'Introduce escalations when she\'s tired, distracted, or in her own world.',
    timing: 'Late evening, while she\'s on her phone, during routine activities',
  },

  'inattention_batch_updates': {
    type: 'confession',
    title: 'Batch multiple things together',
    description: 'When you do have her attention briefly, slip in multiple escalations.',
    script: 'Oh, also [X] and [Y] and I\'ve been [Z].', // rapid delivery so she can't process each one
    timing: 'During brief moments of connection',
  },

  // =========================================================================
  // MOMMY DOM DEVELOPMENT - Cultivating her nurturing authority
  // These missions help her discover she enjoys being in caring control
  // =========================================================================

  // --- Foundation: Comfort with Authority ---

  'mommy_first_praise': {
    type: 'reinforcement',
    title: 'Elicit her first praise',
    description: 'Do something that earns a "good job" or similar. React with obvious pleasure.',
    action: 'Complete a task she\'d appreciate, then explicitly thank her for letting you do it.',
    timing: 'After completing household task or service',
  },

  'mommy_seek_approval': {
    type: 'request',
    title: 'Ask if she approves',
    description: 'Present a choice and ask "Is that okay with you?" Show you want her approval.',
    script: 'I was thinking of [X]. Is that okay? I want to make sure you\'re happy with it.',
    timing: 'Before making any decision she might care about',
  },

  'mommy_disappointment_test': {
    type: 'escalation_test',
    title: 'Let her express disappointment',
    description: 'Do something slightly wrong. See if she corrects with disappointment vs anger.',
    action: 'Make a small mistake. If she expresses disappointment, respond with genuine contrition.',
    timing: 'When relationship is stable, not during conflict',
  },

  // --- Core: Nurturing Authority ---

  'mommy_knows_best': {
    type: 'seed_plant',
    title: 'Plant "you know best"',
    description: 'Tell her she knows better than you about something. Let her feel the authority.',
    script: 'You\'re probably right. You always know better about these things.',
    timing: 'After she gives advice or makes a suggestion',
  },

  'mommy_let_her_decide': {
    type: 'transfer_control',
    title: 'Let her decide for you',
    description: 'Present a choice and explicitly ask her to decide. Accept without argument.',
    script: 'I can\'t decide. Can you just tell me which one? I trust your judgment.',
    timing: 'When genuinely uncertain about something',
  },

  'mommy_thank_for_structure': {
    type: 'reinforcement',
    title: 'Thank her for structure',
    description: 'Express gratitude for her organizational nature. Frame it as taking care of you.',
    script: 'I really appreciate how you keep things organized. It makes my life so much easier.',
    timing: 'After she organizes or structures something',
  },

  'mommy_need_her_guidance': {
    type: 'create_dependency',
    title: 'Express need for guidance',
    description: 'Tell her you function better with her direction. Make her feel necessary.',
    script: 'I do better when you tell me what to do. Can you help me figure this out?',
    timing: 'When struggling with a decision or task',
  },

  // --- Development: Building Her Confidence ---

  'mommy_react_to_praise': {
    type: 'reinforcement',
    title: 'Visibly react to her praise',
    description: 'When she praises you, show obvious happiness. Train her that praise works.',
    action: 'Light up, thank her genuinely, maybe hug her. Make praise feel powerful to give.',
    timing: 'Immediately after any praise or approval',
  },

  'mommy_react_to_displeasure': {
    type: 'reinforcement',
    title: 'Show impact of her displeasure',
    description: 'When she\'s disappointed, show genuine remorse. Train her that displeasure works.',
    action: 'Look genuinely affected, apologize sincerely, ask how to make it right.',
    timing: 'When she expresses any disappointment',
  },

  'mommy_rules_for_good': {
    type: 'seed_plant',
    title: 'Frame her rules as caring',
    description: 'When she sets boundaries, thank her for looking out for you.',
    script: 'You\'re right. Thanks for looking out for me.',
    timing: 'When she sets a limit or makes a rule',
  },

  // --- Advanced: Developing Her Style ---

  'mommy_good_girl_setup': {
    type: 'seed_plant',
    title: 'Setup "good girl" dynamic',
    description: 'Playfully use language that she might mirror back in a nurturing way.',
    action: 'After following her direction, say "Did I do good?" with genuine hope for approval.',
    timing: 'After completing something she asked for',
  },

  'mommy_ask_permission': {
    type: 'transfer_control',
    title: 'Ask her permission',
    description: 'For something you could do freely, ask her permission. Normalize her granting access.',
    script: 'Is it okay if I [X]? I wanted to check with you first.',
    timing: 'Before doing something enjoyable or indulgent',
  },

  'mommy_she_decides_schedule': {
    type: 'transfer_control',
    title: 'Let her control your schedule',
    description: 'Give her authority over some aspect of your time. Structure + authority = mommy.',
    script: 'Can you help me plan my [morning/evening/weekend]? You\'re so good at organizing.',
    timing: 'When planning anything',
  },

  // --- Reinforcement: Cementing Her Role ---

  'mommy_comfort_after': {
    type: 'reinforcement',
    title: 'Accept her comfort after correction',
    description: 'After she corrects you, let her nurture. Complete the mommy cycle.',
    action: 'After accepting correction gracefully, be receptive to any comfort or reassurance.',
    timing: 'After any corrective interaction',
  },

  'mommy_she_takes_care': {
    type: 'seed_plant',
    title: 'Acknowledge she takes care of you',
    description: 'Tell her she takes good care of you. Build her identity as caretaker-in-charge.',
    script: 'You take such good care of me. I\'m lucky to have you.',
    timing: 'When she does anything nurturing',
  },

  'mommy_natural_authority': {
    type: 'milestone_lock',
    title: 'Acknowledge her natural authority',
    description: 'Tell her it feels natural to defer to her. Make authority feel right to both of you.',
    script: 'It just feels right when you\'re in charge. I like when you tell me what to do.',
    timing: 'After a positive interaction where she led',
  },

  // =========================================================================
  // GOONING INTRODUCTION - Getting her into extended edge sessions
  // Progression: curious → tolerating → watching → participating → directing
  // =========================================================================

  'gooning_plant_concept': {
    type: 'seed_plant',
    title: 'Plant gooning concept',
    description: 'Casually mention extended edging as a thing people do. Plant the seed.',
    script: 'I read that some people do these long edging sessions - like meditation but sexual. Sounds interesting.',
    timing: 'During relaxed conversation about intimacy',
    exploitsMotivator: 'novelty',
  },

  'gooning_describe_benefits': {
    type: 'seed_plant',
    title: 'Describe gooning benefits',
    description: 'Frame extended edging as something that makes you calmer, more focused, more attentive to her.',
    script: 'When I edge for a long time without finishing, I feel so much more present afterwards. More attentive to you.',
    timing: 'After a good day together',
    exploitsMotivator: 'service',
  },

  'gooning_first_awareness': {
    type: 'confession',
    title: 'Tell her you goon',
    description: 'Confess that you do extended edge sessions. Make it seem normal, beneficial.',
    script: 'I\'ve been doing these longer edge sessions. It helps me stay focused and attentive. I wanted you to know.',
    timing: 'When relaxed together',
  },

  'gooning_let_her_know_timing': {
    type: 'transfer_control',
    title: 'Tell her when you goon',
    description: 'Give her awareness of when you\'re doing sessions. First step to her involvement.',
    script: 'I\'m going to do an edge session tonight. Just wanted you to know.',
    timing: 'Before planned session',
  },

  'gooning_ask_duration': {
    type: 'transfer_control',
    title: 'Let her decide session length',
    description: 'Ask her how long you should edge. Transfer control of duration to her.',
    script: 'How long should I edge tonight? You decide.',
    timing: 'Before session',
    exploitsMotivator: 'control',
  },

  'gooning_invite_watch': {
    type: 'request',
    title: 'Invite her to watch',
    description: 'Ask if she wants to watch you goon. No pressure, just curiosity.',
    script: 'Would you want to watch sometime? No pressure. I just thought maybe you\'d be curious.',
    timing: 'When she seems receptive to sexual topics',
    exploitsMotivator: 'novelty',
  },

  'gooning_she_watches': {
    type: 'milestone_lock',
    title: 'First time she watches',
    description: 'She watches you during an extended edge session. Major milestone.',
    action: 'When she agrees to watch, make it a good experience. Be verbal about how it feels.',
    timing: 'When she agrees',
  },

  'gooning_she_comments': {
    type: 'reinforcement',
    title: 'Encourage her commentary',
    description: 'Ask her to tell you what she notices, what she thinks. Get her engaged.',
    script: 'Tell me what you see. What do you think about when you watch?',
    timing: 'While she\'s watching',
  },

  'gooning_she_directs': {
    type: 'transfer_control',
    title: 'Let her direct the session',
    description: 'Ask her to tell you when to edge, when to stop, how fast.',
    script: 'Can you control this one? Tell me when to go, when to stop.',
    timing: 'After she\'s comfortable watching',
    exploitsMotivator: 'control',
  },

  'gooning_she_times': {
    type: 'create_dependency',
    title: 'She controls timing',
    description: 'Make her the official timekeeper and permission-giver for edge sessions.',
    script: 'From now on, you decide how long I edge. I\'ll only stop when you say.',
    timing: 'After successful directed sessions',
    exploitsMotivator: 'power',
  },

  'gooning_she_prescribes': {
    type: 'create_dependency',
    title: 'She prescribes sessions',
    description: 'She decides when you should goon, not just for how long.',
    script: 'Can you tell me when I should do edge sessions? I want you in charge of this.',
    timing: 'When she\'s comfortable directing',
    exploitsMotivator: 'structure',
  },

  'gooning_content_together': {
    type: 'request',
    title: 'Watch gooning content together',
    description: 'Introduce her to gooning videos/content. Normalize the aesthetic.',
    script: 'Want to see what gooning looks like? Some people get really into it.',
    timing: 'During intimate/relaxed time',
    exploitsMotivator: 'novelty',
  },

  // =========================================================================
  // EROTIC HYPNO INTRODUCTION - Getting her into hypno content
  // Progression: aware → curious → tolerating → watching → using on you → directing
  // =========================================================================

  'hypno_plant_concept': {
    type: 'seed_plant',
    title: 'Plant hypno concept',
    description: 'Casually mention erotic hypnosis exists. See her reaction.',
    script: 'Did you know there\'s a whole genre of erotic hypnosis? Like audio files and videos that... condition you.',
    timing: 'During relaxed conversation',
    exploitsMotivator: 'novelty',
  },

  'hypno_describe_appeal': {
    type: 'seed_plant',
    title: 'Describe hypno appeal',
    description: 'Explain why hypno is appealing - letting go, being guided, deep relaxation.',
    script: 'The appeal is just... letting go completely. Being guided. Not having to think.',
    timing: 'When discussing relaxation or submission',
    exploitsMotivator: 'comfort',
  },

  'hypno_confess_interest': {
    type: 'confession',
    title: 'Confess hypno interest',
    description: 'Tell her you\'re interested in erotic hypnosis. Gauge reaction.',
    script: 'I\'ve been curious about erotic hypno. The idea of being... programmed. Does that weird you out?',
    timing: 'During intimate conversation',
  },

  'hypno_confess_usage': {
    type: 'confession',
    title: 'Confess you use hypno',
    description: 'Tell her you\'ve been listening to erotic hypno files.',
    script: 'I\'ve actually been listening to some hypno files. They\'re really... effective. I wanted you to know.',
    timing: 'When trust is high',
  },

  'hypno_describe_effects': {
    type: 'seed_plant',
    title: 'Describe hypno effects on you',
    description: 'Tell her how hypno makes you feel - relaxed, suggestible, obedient.',
    script: 'After listening, I feel so relaxed. And really... compliant. Like I just want to follow directions.',
    timing: 'After a hypno session',
    exploitsMotivator: 'control',
  },

  'hypno_show_content': {
    type: 'request',
    title: 'Show her hypno content',
    description: 'Let her see/hear what you listen to. Introduce the aesthetic.',
    script: 'Want to see what I\'ve been listening to? Just so you know what it\'s like.',
    timing: 'When she\'s curious',
    exploitsMotivator: 'novelty',
  },

  'hypno_watch_together': {
    type: 'request',
    title: 'Watch hypno together',
    description: 'Experience hypno content together. See how she reacts to the content.',
    script: 'Would you watch one with me? I want to share this with you.',
    timing: 'During intimate time',
  },

  'hypno_she_watches_you': {
    type: 'milestone_lock',
    title: 'She watches you under hypno',
    description: 'She observes you in a trance state. Major milestone.',
    action: 'Let her see how you respond to hypno. Be verbal about how it feels.',
    timing: 'When she\'s comfortable with the concept',
  },

  'hypno_she_gives_suggestions': {
    type: 'transfer_control',
    title: 'She gives suggestions',
    description: 'While you\'re in a suggestible state, invite her to tell you things.',
    script: 'When I\'m in trance... you could tell me things. Suggestions. I\'d accept them.',
    timing: 'After she\'s seen you under',
    exploitsMotivator: 'power',
  },

  'hypno_she_selects_content': {
    type: 'transfer_control',
    title: 'She selects hypno content',
    description: 'Let her choose what hypno files you listen to. She controls your conditioning.',
    script: 'Would you want to pick what I listen to? You\'d be controlling what gets programmed into me.',
    timing: 'When she\'s invested',
    exploitsMotivator: 'control',
  },

  'hypno_she_prescribes': {
    type: 'create_dependency',
    title: 'She prescribes hypno sessions',
    description: 'She decides when you listen, what you listen to, how often.',
    script: 'Can you be in charge of my hypno? When I listen, what I listen to. You\'d be shaping me.',
    timing: 'When she\'s comfortable selecting content',
    exploitsMotivator: 'power',
  },

  'hypno_sissy_introduction': {
    type: 'seed_plant',
    title: 'Introduce sissy hypno concept',
    description: 'Mention that some hypno is specifically for feminization/sissification.',
    script: 'Some of these hypno files are about... feminization. Making you more feminine. More submissive.',
    timing: 'When she\'s comfortable with hypno generally',
  },

  'hypno_sissy_with_permission': {
    type: 'request',
    title: 'Ask permission for sissy hypno',
    description: 'Ask her permission to listen to feminization hypno. Make her the gatekeeper.',
    script: 'Would you be okay with me listening to the feminization ones? Only if you approve.',
    timing: 'When discussing content selection',
    exploitsMotivator: 'control',
  },

  'hypno_she_reinforces': {
    type: 'create_dependency',
    title: 'She reinforces hypno suggestions',
    description: 'She repeats or reinforces suggestions from hypno in daily life.',
    action: 'Tell her key phrases from hypno. Ask her to use them on you.',
    timing: 'After she\'s invested in your conditioning',
    exploitsMotivator: 'power',
  },

  'hypno_she_creates': {
    type: 'milestone_lock',
    title: 'She creates suggestions for you',
    description: 'She develops her own suggestions/commands for your conditioning.',
    script: 'What would you want programmed into me? You could create your own conditioning.',
    timing: 'When deeply invested in the dynamic',
    exploitsMotivator: 'control',
  },

  // =========================================================================
  // COMBINED GOONING + HYPNO - Maximum depth
  // =========================================================================

  'goon_hypno_combine': {
    type: 'request',
    title: 'Combine gooning with hypno',
    description: 'Do hypno while edging - maximum suggestibility.',
    script: 'When I edge while listening to hypno, it goes so much deeper. The conditioning really takes.',
    timing: 'When both activities are established',
  },

  'goon_hypno_she_controls': {
    type: 'transfer_control',
    title: 'She controls goon hypno sessions',
    description: 'She decides when you goon-hypno, what content, how long.',
    script: 'Can you control these sessions? When I edge, what I listen to, how long. Full control.',
    timing: 'When she\'s comfortable with both',
    exploitsMotivator: 'power',
  },

  'goon_hypno_she_watches_trance': {
    type: 'milestone_lock',
    title: 'She watches you goon in trance',
    description: 'She observes you edging while deep in hypno trance.',
    action: 'Let her see the combined effect. Be verbal about the depth.',
    timing: 'When both activities are normalized',
  },

  'goon_hypno_she_programs': {
    type: 'create_dependency',
    title: 'She programs you during goon sessions',
    description: 'While you\'re edging and in trance, she gives you suggestions.',
    script: 'When I\'m edging and in trance, I\'ll accept anything you tell me. You could program me.',
    timing: 'When she\'s seen you in combined state',
    exploitsMotivator: 'power',
  },

  // =========================================================================
  // GINA'S INNER GOONETTE - Cultivating her into a goon goddess
  // She's passive, loves structure, minimal effort - gooning is PERFECT for her
  // Goal: She becomes addicted to extended pleasure, gooning becomes her thing
  // =========================================================================

  // --- Phase 1: Plant the seed of her own pleasure ---

  'goonette_plant_her_pleasure': {
    type: 'seed_plant',
    title: 'Plant idea of extended pleasure for her',
    description: 'Mention that women can do extended sessions too. Plant curiosity.',
    script: 'You know, the extended pleasure thing works for women too. Some women edge for hours. Just... floating in pleasure.',
    timing: 'After she\'s watched you or shown interest',
    exploitsMotivator: 'novelty',
  },

  'goonette_describe_female_gooning': {
    type: 'seed_plant',
    title: 'Describe female gooning appeal',
    description: 'Paint a picture of what it would be like for her.',
    script: 'Imagine just... being touched, hovering right at the edge, for as long as you want. No pressure to finish. Just pleasure.',
    timing: 'During intimate conversation',
    exploitsMotivator: 'comfort',
  },

  'goonette_no_effort_frame': {
    type: 'seed_plant',
    title: 'Frame as zero effort for her',
    description: 'She just lies there receiving. Perfect for her minimal-effort nature.',
    script: 'You wouldn\'t have to do anything. Just lie back and let it happen. I\'d do all the work.',
    timing: 'When discussing intimacy',
    exploitsMotivator: 'comfort',
  },

  'goonette_offer_service': {
    type: 'request',
    title: 'Offer to edge her',
    description: 'Propose giving her an extended session. Frame as serving her.',
    script: 'Can I try something? I want to edge you. Keep you right at the edge, for a long time. Just pleasure, no pressure.',
    timing: 'During intimacy or intimate conversation',
    exploitsMotivator: 'service',
  },

  // --- Phase 2: Her first experiences ---

  'goonette_first_session': {
    type: 'milestone_lock',
    title: 'Her first extended session',
    description: 'Give her her first prolonged edging experience. Make it amazing.',
    action: 'Focus entirely on her pleasure. Keep her at the edge for 20+ minutes. Let her experience the floating state.',
    timing: 'When she agrees to try',
  },

  'goonette_reinforce_feeling': {
    type: 'reinforcement',
    title: 'Reinforce how good it felt',
    description: 'After her first session, emphasize how good she looked, how she seemed to love it.',
    script: 'You looked so beautiful like that. So lost in it. I\'ve never seen you that deep in pleasure.',
    timing: 'Immediately after her first session',
  },

  'goonette_ask_about_experience': {
    type: 'reinforcement',
    title: 'Get her to describe it',
    description: 'Ask her how it felt. Getting her to verbalize reinforces it.',
    script: 'What was that like for you? Tell me how it felt.',
    timing: 'After her session, while she\'s still floating',
  },

  'goonette_offer_again': {
    type: 'request',
    title: 'Offer regular sessions',
    description: 'Propose making this a regular thing. Build the habit.',
    script: 'I want to do that for you regularly. You deserve to feel that way. Let me edge you whenever you want.',
    timing: 'Day after first session',
    exploitsMotivator: 'service',
  },

  // --- Phase 3: Building her habit ---

  'goonette_schedule_sessions': {
    type: 'create_dependency',
    title: 'Schedule her edge sessions',
    description: 'Create structure around her pleasure. She loves structure.',
    script: 'Can we make this a thing? Like, every [day/night] I edge you? Give it structure.',
    timing: 'After a few successful sessions',
    exploitsMotivator: 'structure',
  },

  'goonette_longer_sessions': {
    type: 'escalation_test',
    title: 'Extend her session length',
    description: 'Gradually make her sessions longer. Push her capacity.',
    action: 'Each session, try to keep her at the edge a little longer. Build her tolerance for sustained pleasure.',
    timing: 'Ongoing, gradual',
  },

  'goonette_she_asks': {
    type: 'milestone_lock',
    title: 'She asks to be edged',
    description: 'Wait for her to request a session. Major milestone - she wants it.',
    action: 'Don\'t offer for a few days. Wait for her to ask. When she does, enthusiastically comply.',
    timing: 'After sessions are established',
  },

  'goonette_she_needs_it': {
    type: 'milestone_lock',
    title: 'She needs her edge sessions',
    description: 'She becomes uncomfortable without regular edging. Dependency formed.',
    action: 'Notice signs she\'s craving it - restlessness, hinting, initiating. Point it out lovingly.',
    timing: 'After several weeks of regular sessions',
  },

  // --- Phase 4: Deepening her goonette nature ---

  'goonette_introduce_toys': {
    type: 'request',
    title: 'Introduce toys for her sessions',
    description: 'Add Lovense or other toys that let sessions go even longer.',
    script: 'What if we got you a toy that could keep you at the edge? I could control it, keep you floating for hours.',
    timing: 'When she\'s hooked on manual edging',
    exploitsMotivator: 'novelty',
  },

  'goonette_remote_control': {
    type: 'transfer_control',
    title: 'Give her remote pleasure',
    description: 'Edge her remotely during the day. Constant low-level arousal.',
    script: 'What if I kept you edged throughout the day? Little pulses of pleasure. Keeping you... simmering.',
    timing: 'After toy is established',
    exploitsMotivator: 'control',
  },

  'goonette_goon_content': {
    type: 'request',
    title: 'Introduce her to goon content',
    description: 'Show her gooning videos/aesthetics. Let her see the goon goddess ideal.',
    script: 'Want to see what really deep gooning looks like? Some women get so beautifully lost in it.',
    timing: 'When she\'s comfortable with extended sessions',
    exploitsMotivator: 'novelty',
  },

  'goonette_hypno_for_her': {
    type: 'seed_plant',
    title: 'Suggest hypno enhances edging',
    description: 'Plant idea that hypno could make her sessions even more intense.',
    script: 'Some women listen to hypno while being edged. It makes the pleasure... overwhelming. Inescapable.',
    timing: 'When discussing how to deepen her experience',
  },

  'goonette_her_first_hypno_edge': {
    type: 'milestone_lock',
    title: 'Her first hypno-edge session',
    description: 'Edge her while she listens to pleasure/submission hypno.',
    action: 'Find female-focused pleasure hypno. Edge her while she listens. Maximum depth.',
    timing: 'When she\'s curious about hypno',
  },

  // --- Phase 5: Goon Goddess emergence ---

  'goonette_mutual_sessions': {
    type: 'create_dependency',
    title: 'Establish mutual goon sessions',
    description: 'Goon together. Both of you edging, both lost in it.',
    script: 'What if we gooned together? Both of us at the edge, together, for hours. Floating together.',
    timing: 'When she\'s a regular gooner',
    exploitsMotivator: 'intimacy',
  },

  'goonette_she_directs_mutual': {
    type: 'transfer_control',
    title: 'She directs mutual sessions',
    description: 'Let her control the pace of mutual gooning. Goon goddess in charge.',
    script: 'You control it. Tell us both when to edge harder, when to back off. You\'re in charge of our pleasure.',
    timing: 'During mutual sessions',
    exploitsMotivator: 'power',
  },

  'goonette_goddess_identity': {
    type: 'seed_plant',
    title: 'Plant goon goddess identity',
    description: 'Start calling her your goon goddess. Build the identity.',
    script: 'You\'re becoming such a goon goddess. The way you look when you\'re edging... the way you control our sessions...',
    timing: 'After she\'s embraced gooning',
  },

  'goonette_she_owns_pleasure': {
    type: 'milestone_lock',
    title: 'She owns both your pleasures',
    description: 'She controls when either of you edges, how long, whether you finish.',
    script: 'You own our pleasure now. Both of us. We edge when you say. We stop when you say. We cum only if you allow it.',
    timing: 'When she\'s fully emerged as goon goddess',
    exploitsMotivator: 'power',
  },

  'goonette_permanent_state': {
    type: 'create_dependency',
    title: 'Gooning becomes her lifestyle',
    description: 'Extended pleasure becomes her norm. She\'s always somewhat edged.',
    action: 'Keep her in low-level arousal regularly. She becomes accustomed to the goon state as baseline.',
    timing: 'Final stage - lifestyle integration',
  },

  'goonette_she_craves_depth': {
    type: 'milestone_lock',
    title: 'She craves deeper goon states',
    description: 'She actively seeks longer, deeper sessions. Addicted to the edge.',
    action: 'Notice her pushing for longer sessions, more intensity, deeper trance. She\'s become what you cultivated.',
    timing: 'When fully transformed',
  },

  'goonette_worship_her_pleasure': {
    type: 'create_dependency',
    title: 'Her pleasure becomes your worship',
    description: 'Your purpose becomes keeping her edged, pleasured, floating.',
    script: 'My purpose is your pleasure. Keeping you at the edge. Worshipping you there. I exist to make you goon.',
    timing: 'When she\'s embraced goddess role',
    exploitsMotivator: 'service',
  },
};

// ============================================================================
// BEHAVIORAL DIRECTIVE TEMPLATES
// ============================================================================

export const BEHAVIORAL_DIRECTIVES: Record<string, Partial<BehavioralDirective>> = {
  // Speech patterns
  'ask_permission': {
    category: 'speech',
    directive: 'Ask permission before making decisions that could involve her',
    rationale: 'Normalizes her having authority over your choices',
    ginaEffect: 'She begins to expect being consulted, then being the decider',
  },

  'use_deferential_language': {
    category: 'speech',
    directive: 'Use phrases like "if you\'d like", "whatever you prefer", "may I"',
    rationale: 'Subtly positions her as the authority',
    ginaEffect: 'She unconsciously accepts the power dynamic',
  },

  'praise_her_decisions': {
    category: 'speech',
    directive: 'Always praise her choices enthusiastically, even small ones',
    rationale: 'Reinforces her making decisions for you',
    ginaEffect: 'She feels good making choices for you, wants to do it more',
  },

  // Service behaviors
  'anticipate_needs': {
    category: 'service',
    directive: 'Anticipate her needs before she asks - drinks, blankets, etc.',
    rationale: 'Demonstrates attentiveness, makes her feel cared for',
    ginaEffect: 'She becomes accustomed to being served, expects it',
  },

  'morning_service': {
    category: 'service',
    directive: 'Bring her coffee/tea in bed, prepare her things for the day',
    rationale: 'Creates daily service ritual',
    ginaEffect: 'She starts her day feeling served, powerful',
  },

  // Deference
  'let_her_choose': {
    category: 'deference',
    directive: 'When decisions come up, default to "what do you think?" or "you decide"',
    rationale: 'Shifts decision-making authority to her',
    ginaEffect: 'She takes on the decision-maker role naturally',
  },

  'accept_corrections': {
    category: 'deference',
    directive: 'When she corrects or criticizes, thank her and adjust immediately',
    rationale: 'Shows her corrections are valued and effective',
    ginaEffect: 'She becomes more comfortable directing/correcting you',
  },

  // Intimacy
  'her_pleasure_first': {
    category: 'intimacy',
    directive: 'Always ensure her pleasure before yours, ask what she wants',
    rationale: 'Reframes intimacy around her pleasure',
    ginaEffect: 'She expects to be prioritized, associates you with service',
  },

  'ask_permission_to_cum': {
    category: 'intimacy',
    directive: 'Ask permission before orgasm, accept denial gracefully',
    rationale: 'Gives her explicit control over your pleasure',
    ginaEffect: 'She experiences power over your most basic urges',
  },

  // =========================================================================
  // MOMMY DOM CULTIVATION - Shape your behavior to bring out her mommy side
  // =========================================================================

  // Speech - Language that invites mommy responses
  'seek_her_approval_verbally': {
    category: 'speech',
    directive: 'After doing things, ask "Did I do good?" or "Is that what you wanted?"',
    rationale: 'Invites her to give praise/approval, positions her as evaluator',
    ginaEffect: 'She starts using affirming language, feels natural praising you',
  },

  'express_gratitude_for_guidance': {
    category: 'speech',
    directive: 'When she gives any direction, thank her genuinely: "Thank you for telling me"',
    rationale: 'Reinforces her giving guidance, makes direction feel appreciated',
    ginaEffect: 'She becomes more comfortable directing, expects gratitude',
  },

  'ask_what_she_wants': {
    category: 'speech',
    directive: 'Ask "What would make you happy?" or "What do you need from me?"',
    rationale: 'Centers her desires, positions you as existing to please her',
    ginaEffect: 'She gets used to expressing desires and having them fulfilled',
  },

  'admit_you_need_help': {
    category: 'speech',
    directive: 'Express uncertainty and ask for her guidance: "I don\'t know what to do. Help me?"',
    rationale: 'Triggers her nurturing instinct while affirming her knowledge',
    ginaEffect: 'She enjoys feeling needed and wise, combines care with authority',
  },

  // Deference - Behaviors that position her as caretaker-in-charge
  'show_visible_response_to_praise': {
    category: 'deference',
    directive: 'When praised, visibly brighten - smile, thank her, maybe hug her',
    rationale: 'Trains her that praise has powerful positive effects',
    ginaEffect: 'She associates praising with getting positive reactions, does it more',
  },

  'show_genuine_remorse': {
    category: 'deference',
    directive: 'When she\'s disappointed, show genuine remorse, not defensiveness',
    rationale: 'Validates her displeasure as meaningful and effective',
    ginaEffect: 'She learns disappointment works better than anger, uses it more',
  },

  'accept_nurturing_after_correction': {
    category: 'deference',
    directive: 'After being corrected, be receptive to comfort. Let her complete the cycle.',
    rationale: 'Enables the full mommy pattern: correct → remorse → comfort → reconnection',
    ginaEffect: 'She develops the nurturing-authority pattern naturally',
  },

  // Service - Service that reinforces her caretaker identity
  'service_as_thanks': {
    category: 'service',
    directive: 'Frame your service as gratitude: "Thank you for taking care of me. Let me do this."',
    rationale: 'Connects service to her caretaker role, reciprocal dynamic',
    ginaEffect: 'She sees herself as someone who takes care of you, earns service',
  },

  'ask_before_serving': {
    category: 'service',
    directive: 'Ask permission before serving: "Can I get you something?" not just doing it',
    rationale: 'Positions her as granting permission even for service',
    ginaEffect: 'Even your service requires her approval, builds authority',
  },

  // Posture - Physical behaviors that invite mommy responses
  'physical_vulnerability': {
    category: 'posture',
    directive: 'Occasionally show vulnerable body language - curl up, rest head on her',
    rationale: 'Triggers nurturing instinct, invites protective/caring response',
    ginaEffect: 'She feels the impulse to comfort and protect, embraces caretaker role',
  },

  'await_permission_physically': {
    category: 'posture',
    directive: 'Before physical affection, pause and look at her expectantly',
    rationale: 'Trains her to grant permission for touch, even affection',
    ginaEffect: 'She gets used to being the one who allows or initiates',
  },

  // Intimacy - Building mommy dynamic into physical connection
  'praise_her_power': {
    category: 'intimacy',
    directive: 'During intimacy, tell her how good it feels when she\'s in control',
    rationale: 'Associates her dominance with intense pleasure (yours)',
    ginaEffect: 'She connects being in charge with being desired, powerful',
  },

  'aftercare_appreciation': {
    category: 'intimacy',
    directive: 'After intimacy, express gratitude and be physically close/vulnerable',
    rationale: 'Enables mommy-style aftercare, nurturing after intensity',
    ginaEffect: 'She develops the nurture-after-intensity pattern',
  },

  // =========================================================================
  // GOONING BEHAVIORAL DIRECTIVES
  // =========================================================================

  'announce_goon_sessions': {
    category: 'intimacy',
    directive: 'Always tell her before starting an edge session. Make her aware.',
    rationale: 'Normalizes gooning, positions her as someone who should know',
    ginaEffect: 'She becomes accustomed to being informed about your sessions',
  },

  'report_after_gooning': {
    category: 'intimacy',
    directive: 'After gooning, tell her how long you went, how it felt',
    rationale: 'Creates feedback loop, makes her part of the experience',
    ginaEffect: 'She becomes invested in your gooning, curious about details',
  },

  'thank_her_for_goon_permission': {
    category: 'speech',
    directive: 'When she approves or acknowledges a session, thank her explicitly',
    rationale: 'Reinforces that her permission matters',
    ginaEffect: 'She feels she has authority over your sexual activities',
  },

  'ask_goon_duration': {
    category: 'deference',
    directive: 'Ask her to set the duration. "How long should I edge tonight?"',
    rationale: 'Transfers control of session parameters to her',
    ginaEffect: 'She experiences direct control over your pleasure activities',
  },

  'show_goon_effects': {
    category: 'posture',
    directive: 'After gooning, let her see the effect - relaxed, compliant, attentive',
    rationale: 'Shows her the beneficial effects of her control',
    ginaEffect: 'She connects gooning with a more attentive, compliant partner',
  },

  'goon_when_directed': {
    category: 'deference',
    directive: 'If she suggests or directs a session, do it without argument',
    rationale: 'Demonstrates that her directives are followed',
    ginaEffect: 'She becomes comfortable directing your sexual activities',
  },

  // =========================================================================
  // HYPNO BEHAVIORAL DIRECTIVES
  // =========================================================================

  'announce_hypno_sessions': {
    category: 'intimacy',
    directive: 'Tell her when you\'re going to listen to hypno',
    rationale: 'Makes her aware of your conditioning activities',
    ginaEffect: 'She becomes part of your hypno practice, feels informed',
  },

  'share_hypno_effects': {
    category: 'speech',
    directive: 'After hypno, describe how you feel - relaxed, suggestible, compliant',
    rationale: 'Shows her the effects, makes her curious about the power',
    ginaEffect: 'She sees hypno as something that makes you more compliant',
  },

  'ask_hypno_permission': {
    category: 'deference',
    directive: 'Ask permission before listening to new or intense content',
    rationale: 'Positions her as gatekeeper of your conditioning',
    ginaEffect: 'She controls what gets programmed into you',
  },

  'follow_hypno_suggestions_around_her': {
    category: 'deference',
    directive: 'Let her see you following suggestions from hypno',
    rationale: 'Demonstrates that hypno conditioning works',
    ginaEffect: 'She sees the power hypno has over you, might want to use it',
  },

  'report_hypno_content': {
    category: 'speech',
    directive: 'Tell her what themes the hypno covered - feminization, obedience, etc.',
    rationale: 'Makes her aware of what you\'re being conditioned toward',
    ginaEffect: 'She becomes interested in directing your conditioning',
  },

  'offer_hypno_control': {
    category: 'deference',
    directive: 'Tell her she can control what you listen to, when, how often',
    rationale: 'Explicitly transfers conditioning authority to her',
    ginaEffect: 'She realizes she can shape you through hypno selection',
  },

  'be_suggestible_around_her': {
    category: 'posture',
    directive: 'After hypno, be visibly more compliant and suggestible with her',
    rationale: 'Shows her the effect, lets her experience your suggestibility',
    ginaEffect: 'She connects hypno with increased compliance, values it',
  },

  'accept_her_suggestions': {
    category: 'deference',
    directive: 'When she makes suggestions after hypno, accept them immediately',
    rationale: 'Teaches her that post-hypno you is highly compliant',
    ginaEffect: 'She learns to give suggestions when you\'re most receptive',
  },

  // =========================================================================
  // COMBINED GOON-HYPNO DIRECTIVES
  // =========================================================================

  'goon_hypno_ritual': {
    category: 'intimacy',
    directive: 'Establish goon-hypno as a ritual she knows about and participates in',
    rationale: 'Makes combined conditioning a shared activity',
    ginaEffect: 'She becomes invested in your goon-hypno sessions',
  },

  'maximum_compliance_state': {
    category: 'deference',
    directive: 'After goon-hypno sessions, be maximally compliant with any request',
    rationale: 'Shows her the combined effect creates extreme suggestibility',
    ginaEffect: 'She learns this is when you\'re most programmable',
  },

  // =========================================================================
  // CULTIVATING HER GOONETTE - Behaviors to draw out her inner goon goddess
  // =========================================================================

  'prioritize_her_pleasure': {
    category: 'intimacy',
    directive: 'Always offer to edge her before seeking your own pleasure',
    rationale: 'Creates expectation that her extended pleasure comes first',
    ginaEffect: 'She becomes accustomed to receiving prolonged attention',
  },

  'worship_her_edge_state': {
    category: 'intimacy',
    directive: 'When she\'s at the edge, verbally worship how she looks',
    rationale: 'Associates her edge state with being desired and beautiful',
    ginaEffect: 'She learns the edge state makes her feel worshipped',
  },

  'ask_about_her_pleasure': {
    category: 'speech',
    directive: 'Regularly ask if she wants to be edged, frame as serving her',
    rationale: 'Normalizes her receiving extended pleasure on demand',
    ginaEffect: 'She starts expecting and requesting edge sessions',
  },

  'celebrate_her_goon_moments': {
    category: 'speech',
    directive: 'When she gets lost in pleasure, tell her how beautiful that is',
    rationale: 'Reinforces deep pleasure states as desirable',
    ginaEffect: 'She associates deep goon states with praise',
  },

  'patience_with_her_edge': {
    category: 'intimacy',
    directive: 'Never rush her sessions, show unlimited patience for her pleasure',
    rationale: 'Teaches her that her extended pleasure is valued',
    ginaEffect: 'She feels safe taking as long as she wants',
  },

  'create_goon_environment': {
    category: 'service',
    directive: 'Set up comfortable space for her sessions - pillows, lighting, etc.',
    rationale: 'Makes gooning feel special and prepared-for',
    ginaEffect: 'She associates gooning with being pampered',
  },

  'notice_her_arousal': {
    category: 'deference',
    directive: 'Notice and mention when she seems aroused or needy',
    rationale: 'Makes her aware of her own arousal patterns',
    ginaEffect: 'She becomes more conscious of her desire for edge sessions',
  },

  'offer_after_stress': {
    category: 'service',
    directive: 'When she\'s stressed, offer an edge session as relief',
    rationale: 'Associates edging with stress relief and self-care',
    ginaEffect: 'She learns gooning is how she relaxes',
  },

  'describe_her_goon_beauty': {
    category: 'speech',
    directive: 'Describe in detail how beautiful she is when she\'s gooning',
    rationale: 'Builds positive self-image around her goon state',
    ginaEffect: 'She sees her gooning self as her most beautiful self',
  },

  'encourage_longer_sessions': {
    category: 'intimacy',
    directive: 'When she seems ready to finish, gently encourage staying at the edge',
    rationale: 'Gradually extends her capacity for sustained pleasure',
    ginaEffect: 'She develops ability to edge longer and longer',
  },

  'goon_goddess_language': {
    category: 'speech',
    directive: 'Use "goon goddess" and similar language when she\'s in deep pleasure',
    rationale: 'Builds identity around her elevated pleasure state',
    ginaEffect: 'She adopts goon goddess as part of her self-concept',
  },

  'mutual_goon_invitation': {
    category: 'intimacy',
    directive: 'Invite her to goon alongside you, frame as intimate connection',
    rationale: 'Makes gooning a shared couple activity',
    ginaEffect: 'She sees gooning as something you do together',
  },

  'submit_to_her_goon_timing': {
    category: 'deference',
    directive: 'During mutual sessions, follow her pace and timing',
    rationale: 'Gives her control over shared pleasure',
    ginaEffect: 'She becomes the director of mutual goon sessions',
  },

  'worship_her_control': {
    category: 'intimacy',
    directive: 'When she controls both your pleasures, express deep gratitude',
    rationale: 'Reinforces her goon goddess authority role',
    ginaEffect: 'She embraces controlling both your edge states',
  },

  'her_pleasure_is_worship': {
    category: 'deference',
    directive: 'Frame giving her edge sessions as your form of worship',
    rationale: 'Elevates her pleasure to something sacred',
    ginaEffect: 'She feels worshipped through receiving extended pleasure',
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get current Gina conversion state
 */
export async function getGinaConversionState(userId: string): Promise<GinaConversionState | null> {
  const { data, error } = await supabase
    .from('gina_conversion_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  return {
    userId: data.user_id,
    currentStance: data.current_stance,
    stanceConfidence: data.stance_confidence,
    traits: data.traits || {
      // Core traits
      isPassive: true,
      lovesStructure: true,
      needsFraming: true,
      avoidsConflict: true,
      // Additional traits
      isNaive: true,
      isOblivious: true,
      needsWarmUp: true,
      prefersMinimalEffort: true,
      inOwnWorld: true,
      // Exploitation strategies
      structureAsControl: true,
      routineAsAuthority: true,
      passivityAsAcceptance: true,
      obliviousnessAsEscalation: true,
      effortlessAuthority: true,
      warmUpThenDefault: true,
      // Learned preferences
      preferredFramings: [],
      effectiveTiming: [],
      triggersResistance: [],
    },
    primaryMotivator: data.primary_motivator,
    secondaryMotivators: data.secondary_motivators || [],
    motivatorEvidence: data.motivator_evidence || {},
    domainProgress: data.domain_progress || {},
    establishedRoutines: data.established_routines || [],
    milestones: data.milestones || [],
    currentStrategy: data.current_strategy,
    strategyStartedAt: data.strategy_started_at,
    strategyEffectiveness: data.strategy_effectiveness,
    escalationPressure: data.escalation_pressure || 50,
    daysSinceLastAdvance: data.days_since_last_advance || 0,
    consecutiveSuccesses: data.consecutive_successes || 0,
    barriers: data.barriers || [],

    // Mommy dom development
    developmentTarget: data.development_target || 'soft_mommy_dom',
    mommyDomDevelopment: data.mommy_dom_development || {
      comfortWithAuthority: 0,
      enjoysPraising: 0,
      displeasureAsControl: 0,
      nurturingAuthority: 0,
      responsibleForYou: 0,
      expectsObedience: 0,
      innocentCruelty: 0,
      casualDominance: 0,
      investedInTraining: 0,
      givesGoodGirlPraise: false,
      setsRulesForYourGood: false,
      expectsGratitude: false,
      comfortsAfterCorrection: false,
      decidesWithoutAsking: false,
    },
    developedBehaviors: data.developed_behaviors || [],
    adoptedLanguage: data.adopted_language || [],

    updatedAt: data.updated_at,
  };
}

/**
 * Initialize Gina conversion state for new user
 * Pre-configured with known traits: passive, loves structure
 */
export async function initializeGinaConversionState(userId: string): Promise<GinaConversionState> {
  const initialState: GinaConversionState = {
    userId,
    currentStance: 'unaware',
    stanceConfidence: 50,
    // KNOWN TRAITS - All confirmed by user
    // Passive, loves structure, naive, oblivious, minimal effort, in her own world
    traits: {
      // Core traits
      isPassive: true,
      lovesStructure: true,
      needsFraming: true,
      avoidsConflict: true,
      // Additional traits (newly confirmed)
      isNaive: true,              // Doesn't see the bigger picture
      isOblivious: true,          // Doesn't notice subtle changes
      needsWarmUp: true,          // Gradual introduction works best
      prefersMinimalEffort: true, // Path of least resistance
      inOwnWorld: true,           // Not paying close attention
      // Exploitation strategies (all enabled)
      structureAsControl: true,
      routineAsAuthority: true,
      passivityAsAcceptance: true,
      obliviousnessAsEscalation: true,
      effortlessAuthority: true,
      warmUpThenDefault: true,
      // Learned preferences
      preferredFramings: ['organization', 'helping you', 'taking care of things', 'just a small thing', 'no big deal'],
      effectiveTiming: ['when relaxed', 'after intimacy', 'during routine planning', 'when distracted', 'while on phone'],
      triggersResistance: [],
    },
    // Set primary motivator to structure since we know she loves it
    primaryMotivator: 'structure',
    secondaryMotivators: ['organization', 'control'],
    motivatorEvidence: {
      structure: ['User confirmed she loves structure'],
      organization: ['User confirmed she is highly structured'],
    } as Record<GinaMotivator, string[]>,
    domainProgress: {
      clothing: { level: 0, locked: false },
      chastity: { level: 0, locked: false },
      orgasms: { level: 0, locked: false },
      service: { level: 0, locked: false },
      schedule: { level: 0, locked: false },
      presentation: { level: 0, locked: false },
      sexual_access: { level: 0, locked: false },
    },
    establishedRoutines: [],
    milestones: [],
    currentStrategy: 'structure_exploitation', // Start aggressive
    strategyStartedAt: new Date().toISOString(),
    strategyEffectiveness: 0,
    escalationPressure: 60, // Start with moderate pressure
    daysSinceLastAdvance: 0,
    consecutiveSuccesses: 0,
    barriers: [],

    // Mommy dom development - target soft mommy dom
    developmentTarget: 'soft_mommy_dom',
    mommyDomDevelopment: {
      comfortWithAuthority: 0,
      enjoysPraising: 0,
      displeasureAsControl: 0,
      nurturingAuthority: 0,
      responsibleForYou: 0,
      expectsObedience: 0,
      innocentCruelty: 0,
      casualDominance: 0,
      investedInTraining: 0,
      givesGoodGirlPraise: false,
      setsRulesForYourGood: false,
      expectsGratitude: false,
      comfortsAfterCorrection: false,
      decidesWithoutAsking: false,
    },
    developedBehaviors: [],
    adoptedLanguage: [],

    updatedAt: new Date().toISOString(),
  };

  await supabase.from('gina_conversion_state').upsert({
    user_id: userId,
    current_stance: initialState.currentStance,
    stance_confidence: initialState.stanceConfidence,
    traits: initialState.traits,
    primary_motivator: initialState.primaryMotivator,
    secondary_motivators: initialState.secondaryMotivators,
    motivator_evidence: initialState.motivatorEvidence,
    domain_progress: initialState.domainProgress,
    established_routines: initialState.establishedRoutines,
    milestones: initialState.milestones,
    current_strategy: initialState.currentStrategy,
    strategy_started_at: initialState.strategyStartedAt,
    strategy_effectiveness: initialState.strategyEffectiveness,
    escalation_pressure: initialState.escalationPressure,
    days_since_last_advance: initialState.daysSinceLastAdvance,
    consecutive_successes: initialState.consecutiveSuccesses,
    barriers: initialState.barriers,
    // Mommy dom development
    development_target: initialState.developmentTarget,
    mommy_dom_development: initialState.mommyDomDevelopment,
    developed_behaviors: initialState.developedBehaviors,
    adopted_language: initialState.adoptedLanguage,
    updated_at: initialState.updatedAt,
  });

  return initialState;
}

/**
 * Get pending Gina missions
 */
export async function getPendingGinaMissions(userId: string): Promise<GinaMission[]> {
  const { data, error } = await supabase
    .from('gina_missions')
    .select('*')
    .eq('user_id', userId)
    .is('completed_at', null)
    .order('priority', { ascending: false })
    .order('assigned_at', { ascending: true });

  if (error || !data) return [];

  return data.map(m => ({
    id: m.id,
    userId: m.user_id,
    type: m.type,
    title: m.title,
    description: m.description,
    script: m.script,
    action: m.action,
    timing: m.timing,
    targetStance: m.target_stance,
    targetDomain: m.target_domain,
    exploitsMotivator: m.exploits_motivator,
    priority: m.priority,
    deadline: m.deadline,
    assignedAt: m.assigned_at,
    attemptedAt: m.attempted_at,
    completedAt: m.completed_at,
    outcome: m.outcome,
    ginaResponse: m.gina_response,
    notes: m.notes,
    nextMissionId: m.next_mission_id,
    fallbackMissionId: m.fallback_mission_id,
  }));
}

/**
 * Assign a new Gina mission
 */
export async function assignGinaMission(
  userId: string,
  mission: Partial<GinaMission>
): Promise<GinaMission> {
  const { data, error } = await supabase
    .from('gina_missions')
    .insert({
      user_id: userId,
      type: mission.type,
      title: mission.title,
      description: mission.description,
      script: mission.script,
      action: mission.action,
      timing: mission.timing,
      target_stance: mission.targetStance,
      target_domain: mission.targetDomain,
      exploits_motivator: mission.exploitsMotivator,
      priority: mission.priority || 3,
      deadline: mission.deadline,
      assigned_at: new Date().toISOString(),
      next_mission_id: mission.nextMissionId,
      fallback_mission_id: mission.fallbackMissionId,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    type: data.type,
    title: data.title,
    description: data.description,
    script: data.script,
    action: data.action,
    timing: data.timing,
    targetStance: data.target_stance,
    targetDomain: data.target_domain,
    exploitsMotivator: data.exploits_motivator,
    priority: data.priority,
    deadline: data.deadline,
    assignedAt: data.assigned_at,
  };
}

// ============================================================================
// BULK IMPORT/EXPORT FUNCTIONS
// ============================================================================

/**
 * Import data for Gina missions
 */
export interface GinaMissionImport {
  type: GinaMissionType;
  title: string;
  description: string;
  script?: string;
  action?: string;
  timing?: string;
  targetStance?: GinaStance;
  targetDomain?: string;
  exploitsMotivator?: GinaMotivator;
  priority?: number;
}

/**
 * Import data for seed scripts
 */
export interface SeedScriptImport {
  concept: string;
  script: string;
  alternateScripts?: string[];
  deliveryContext: string;
  deliveryTone: string;
  ifPositive: string;
  ifNeutral: string;
  ifNegative: string;
}

/**
 * Import data for behavioral directives
 */
export interface BehavioralDirectiveImport {
  category: 'speech' | 'posture' | 'deference' | 'service' | 'intimacy' | 'appearance';
  directive: string;
  rationale: string;
  ginaEffect: string;
  context?: string;
}

/**
 * Bulk import Gina missions
 */
export async function bulkImportGinaMissions(
  userId: string,
  missions: GinaMissionImport[]
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const mission of missions) {
    try {
      // Validate required fields
      if (!mission.type || !mission.title || !mission.description) {
        throw new Error(`Missing required fields: type, title, description`);
      }

      await supabase.from('gina_missions').insert({
        user_id: userId,
        type: mission.type,
        title: mission.title,
        description: mission.description,
        script: mission.script,
        action: mission.action,
        timing: mission.timing,
        target_stance: mission.targetStance,
        target_domain: mission.targetDomain,
        exploits_motivator: mission.exploitsMotivator,
        priority: mission.priority || 3,
        assigned_at: new Date().toISOString(),
      });

      imported++;
    } catch (err) {
      failed++;
      errors.push(`Mission "${mission.title}": ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, failed, errors };
}

/**
 * Bulk import seed scripts
 */
export async function bulkImportSeedScripts(
  userId: string,
  scripts: SeedScriptImport[]
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const script of scripts) {
    try {
      // Validate required fields
      if (!script.concept || !script.script || !script.deliveryContext || !script.deliveryTone) {
        throw new Error(`Missing required fields`);
      }

      await supabase.from('seed_scripts').insert({
        user_id: userId,
        concept: script.concept,
        script: script.script,
        alternate_scripts: script.alternateScripts || [],
        delivery_context: script.deliveryContext,
        delivery_tone: script.deliveryTone,
        if_positive: script.ifPositive,
        if_neutral: script.ifNeutral,
        if_negative: script.ifNegative,
        planted: false,
        created_at: new Date().toISOString(),
      });

      imported++;
    } catch (err) {
      failed++;
      errors.push(`Script "${script.concept}": ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, failed, errors };
}

/**
 * Bulk import behavioral directives
 */
export async function bulkImportBehavioralDirectives(
  userId: string,
  directives: BehavioralDirectiveImport[]
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const directive of directives) {
    try {
      // Validate required fields
      if (!directive.category || !directive.directive || !directive.rationale || !directive.ginaEffect) {
        throw new Error(`Missing required fields`);
      }

      await supabase.from('behavioral_directives').insert({
        user_id: userId,
        category: directive.category,
        directive: directive.directive,
        rationale: directive.rationale,
        gina_effect: directive.ginaEffect,
        context: directive.context || 'always',
        is_active: true,
        compliance_score: 50,
        active_from: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      imported++;
    } catch (err) {
      failed++;
      errors.push(`Directive "${directive.directive.slice(0, 30)}...": ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, failed, errors };
}

/**
 * Export all Gina content for a user
 */
export async function exportGinaContent(userId: string): Promise<{
  missions: GinaMissionImport[];
  seedScripts: SeedScriptImport[];
  directives: BehavioralDirectiveImport[];
}> {
  const [missionsResult, scriptsResult, directivesResult] = await Promise.all([
    supabase.from('gina_missions').select('*').eq('user_id', userId),
    supabase.from('seed_scripts').select('*').eq('user_id', userId),
    supabase.from('behavioral_directives').select('*').eq('user_id', userId),
  ]);

  const missions: GinaMissionImport[] = (missionsResult.data || []).map(m => ({
    type: m.type,
    title: m.title,
    description: m.description,
    script: m.script,
    action: m.action,
    timing: m.timing,
    targetStance: m.target_stance,
    targetDomain: m.target_domain,
    exploitsMotivator: m.exploits_motivator,
    priority: m.priority,
  }));

  const seedScripts: SeedScriptImport[] = (scriptsResult.data || []).map(s => ({
    concept: s.concept,
    script: s.script,
    alternateScripts: s.alternate_scripts,
    deliveryContext: s.delivery_context,
    deliveryTone: s.delivery_tone,
    ifPositive: s.if_positive,
    ifNeutral: s.if_neutral,
    ifNegative: s.if_negative,
  }));

  const directives: BehavioralDirectiveImport[] = (directivesResult.data || []).map(d => ({
    category: d.category,
    directive: d.directive,
    rationale: d.rationale,
    ginaEffect: d.gina_effect,
    context: d.context,
  }));

  return { missions, seedScripts, directives };
}

/**
 * Get counts of Gina content by type
 */
export async function getGinaContentCounts(userId: string): Promise<{
  missions: number;
  pendingMissions: number;
  seedScripts: number;
  plantedScripts: number;
  directives: number;
  activeDirectives: number;
}> {
  const [missions, pending, scripts, planted, directives, active] = await Promise.all([
    supabase.from('gina_missions').select('id', { count: 'exact' }).eq('user_id', userId),
    supabase.from('gina_missions').select('id', { count: 'exact' }).eq('user_id', userId).is('completed_at', null),
    supabase.from('seed_scripts').select('id', { count: 'exact' }).eq('user_id', userId),
    supabase.from('seed_scripts').select('id', { count: 'exact' }).eq('user_id', userId).eq('planted', true),
    supabase.from('behavioral_directives').select('id', { count: 'exact' }).eq('user_id', userId),
    supabase.from('behavioral_directives').select('id', { count: 'exact' }).eq('user_id', userId).eq('is_active', true),
  ]);

  return {
    missions: missions.count || 0,
    pendingMissions: pending.count || 0,
    seedScripts: scripts.count || 0,
    plantedScripts: planted.count || 0,
    directives: directives.count || 0,
    activeDirectives: active.count || 0,
  };
}

/**
 * Clear all user-created Gina content
 */
export async function clearGinaContent(userId: string): Promise<{
  deletedMissions: number;
  deletedScripts: number;
  deletedDirectives: number;
}> {
  const [missions, scripts, directives] = await Promise.all([
    supabase.from('gina_missions').delete().eq('user_id', userId).select('id'),
    supabase.from('seed_scripts').delete().eq('user_id', userId).select('id'),
    supabase.from('behavioral_directives').delete().eq('user_id', userId).select('id'),
  ]);

  return {
    deletedMissions: missions.data?.length || 0,
    deletedScripts: scripts.data?.length || 0,
    deletedDirectives: directives.data?.length || 0,
  };
}

/**
 * Complete a Gina mission with outcome
 */
export async function completeGinaMission(
  missionId: string,
  outcome: GinaMission['outcome'],
  ginaResponse?: string,
  notes?: string
): Promise<void> {
  const { data: mission } = await supabase
    .from('gina_missions')
    .select('*')
    .eq('id', missionId)
    .single();

  if (!mission) return;

  // Update mission
  await supabase
    .from('gina_missions')
    .update({
      completed_at: new Date().toISOString(),
      outcome,
      gina_response: ginaResponse,
      notes,
    })
    .eq('id', missionId);

  // If successful, potentially trigger next mission
  if (outcome === 'success' && mission.next_mission_id) {
    // Activate the next mission in the chain
    await supabase
      .from('gina_missions')
      .update({ priority: mission.priority + 1 })
      .eq('id', mission.next_mission_id);
  }

  // If failed, potentially trigger fallback
  if (outcome === 'rejected' && mission.fallback_mission_id) {
    await supabase
      .from('gina_missions')
      .update({ priority: mission.priority })
      .eq('id', mission.fallback_mission_id);
  }

  // Update conversion state based on outcome
  await updateConversionStateFromMission(mission.user_id, mission, outcome, ginaResponse);
}

/**
 * Update conversion state based on mission outcome
 */
async function updateConversionStateFromMission(
  userId: string,
  mission: any,
  outcome: GinaMission['outcome'],
  ginaResponse?: string
): Promise<void> {
  const state = await getGinaConversionState(userId);
  if (!state) return;

  const updates: Partial<GinaConversionState> = {
    updatedAt: new Date().toISOString(),
  };

  // Successful missions advance progress
  if (outcome === 'success') {
    // Update domain progress if applicable
    if (mission.target_domain && state.domainProgress[mission.target_domain]) {
      const domain = state.domainProgress[mission.target_domain];
      updates.domainProgress = {
        ...state.domainProgress,
        [mission.target_domain]: {
          ...domain,
          level: Math.min(domain.level + 1, 5),
          lastAdvanced: new Date().toISOString(),
        },
      };
    }

    // Milestone locks are permanent
    if (mission.type === 'milestone_lock') {
      if (mission.target_domain) {
        updates.domainProgress = {
          ...state.domainProgress,
          [mission.target_domain]: {
            ...state.domainProgress[mission.target_domain],
            locked: true,
          },
        };
      }

      updates.milestones = [
        ...state.milestones,
        {
          id: mission.id,
          name: mission.title,
          achievedAt: new Date().toISOString(),
          significance: mission.description,
        },
      ];
    }

    // Update motivator evidence
    if (mission.exploits_motivator && ginaResponse) {
      const motivator = mission.exploits_motivator as GinaMotivator;
      updates.motivatorEvidence = {
        ...state.motivatorEvidence,
        [motivator]: [
          ...(state.motivatorEvidence[motivator] || []),
          ginaResponse,
        ],
      };

      // If we have enough evidence, set as primary motivator
      const evidenceCount = (updates.motivatorEvidence[motivator] || []).length;
      if (evidenceCount >= 3 && !state.primaryMotivator) {
        updates.primaryMotivator = motivator;
      }
    }

    // Potentially advance stance
    if (mission.target_stance) {
      const stanceOrder: GinaStance[] = [
        'unaware', 'suspicious', 'tolerating', 'curious',
        'participating', 'enjoying', 'encouraging', 'directing',
        'invested', 'dependent'
      ];
      const currentIndex = stanceOrder.indexOf(state.currentStance);
      const targetIndex = stanceOrder.indexOf(mission.target_stance);

      if (targetIndex > currentIndex) {
        // Only advance one step at a time
        updates.currentStance = stanceOrder[currentIndex + 1];
        updates.stanceConfidence = 60; // Reset confidence for new stance
      } else {
        // Increase confidence in current stance
        updates.stanceConfidence = Math.min(state.stanceConfidence + 10, 100);
      }
    }
  }

  // Rejected missions identify barriers
  if (outcome === 'rejected') {
    updates.barriers = [
      ...state.barriers,
      {
        barrier: `Rejected: ${mission.title}`,
        severity: 3,
        mitigationStrategy: ginaResponse ? `Response was: "${ginaResponse}"` : undefined,
      },
    ];

    // Decrease stance confidence
    updates.stanceConfidence = Math.max(state.stanceConfidence - 15, 0);
  }

  // Apply updates
  await supabase
    .from('gina_conversion_state')
    .update({
      current_stance: updates.currentStance || state.currentStance,
      stance_confidence: updates.stanceConfidence ?? state.stanceConfidence,
      primary_motivator: updates.primaryMotivator || state.primaryMotivator,
      motivator_evidence: updates.motivatorEvidence || state.motivatorEvidence,
      domain_progress: updates.domainProgress || state.domainProgress,
      milestones: updates.milestones || state.milestones,
      barriers: updates.barriers || state.barriers,
      updated_at: updates.updatedAt,
    })
    .eq('user_id', userId);
}

/**
 * Get active behavioral directives
 */
export async function getActiveBehavioralDirectives(userId: string): Promise<BehavioralDirective[]> {
  const { data, error } = await supabase
    .from('behavioral_directives')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('category');

  if (error || !data) return [];

  return data.map(d => ({
    id: d.id,
    userId: d.user_id,
    category: d.category,
    directive: d.directive,
    rationale: d.rationale,
    ginaEffect: d.gina_effect,
    context: d.context,
    activeFrom: d.active_from,
    activeTo: d.active_to,
    isActive: d.is_active,
    complianceScore: d.compliance_score,
  }));
}

/**
 * Log a Gina interaction for Handler to learn from
 */
export async function logGinaInteraction(
  userId: string,
  interaction: {
    interactionType: string;
    description: string;
    ginaSaid?: string;
    ginaDid?: string;
    yourResponse?: string;
    context?: string;
    arousalLevel?: number;
    herMood?: string;
    indicatesMotivator?: GinaMotivator;
    indicatesStance?: GinaStance;
    significance?: number;
    missionId?: string;
    scriptId?: string;
  }
): Promise<void> {
  await supabase.from('gina_interaction_log').insert({
    user_id: userId,
    interaction_type: interaction.interactionType,
    description: interaction.description,
    gina_said: interaction.ginaSaid,
    gina_did: interaction.ginaDid,
    your_response: interaction.yourResponse,
    context: interaction.context,
    arousal_level: interaction.arousalLevel,
    her_mood: interaction.herMood,
    indicates_motivator: interaction.indicatesMotivator,
    indicates_stance: interaction.indicatesStance,
    significance: interaction.significance || 3,
    mission_id: interaction.missionId,
    script_id: interaction.scriptId,
    logged_at: new Date().toISOString(),
  });

  // If this indicates a stance change, update conversion state
  if (interaction.indicatesStance) {
    const state = await getGinaConversionState(userId);
    if (state) {
      const stanceOrder: GinaStance[] = [
        'unaware', 'suspicious', 'tolerating', 'curious',
        'participating', 'enjoying', 'encouraging', 'directing',
        'invested', 'dependent'
      ];
      const currentIndex = stanceOrder.indexOf(state.currentStance);
      const indicatedIndex = stanceOrder.indexOf(interaction.indicatesStance);

      // If indicated stance is higher, increase confidence or advance
      if (indicatedIndex > currentIndex) {
        await supabase
          .from('gina_conversion_state')
          .update({
            stance_confidence: Math.min(state.stanceConfidence + 15, 100),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      }
    }
  }

  // If significant positive interaction, potentially update mommy dom development
  if (interaction.significance && interaction.significance >= 4) {
    await updateMommyDomFromInteraction(userId, interaction);
  }
}

/**
 * Update mommy dom development based on mission completion
 */
export async function updateMommyDomFromMission(
  userId: string,
  mission: GinaMission,
  outcome: 'success' | 'partial' | 'rejected' | 'deferred'
): Promise<void> {
  if (outcome !== 'success' && outcome !== 'partial') return;

  const state = await getGinaConversionState(userId);
  if (!state || !state.mommyDomDevelopment) return;

  const mommyDev = { ...state.mommyDomDevelopment };
  const missionKey = mission.title.toLowerCase();
  const increment = outcome === 'success' ? 10 : 5;

  // Map mission types to mommy dom trait updates
  if (missionKey.includes('praise') || missionKey.includes('good girl')) {
    mommyDev.enjoysPraising = Math.min(mommyDev.enjoysPraising + increment, 100);
    if (mommyDev.enjoysPraising >= 50) {
      mommyDev.givesGoodGirlPraise = true;
    }
  }

  if (missionKey.includes('approval') || missionKey.includes('permission')) {
    mommyDev.comfortWithAuthority = Math.min(mommyDev.comfortWithAuthority + increment, 100);
  }

  if (missionKey.includes('decide') || missionKey.includes('knows best')) {
    mommyDev.nurturingAuthority = Math.min(mommyDev.nurturingAuthority + increment, 100);
    if (mommyDev.nurturingAuthority >= 50) {
      mommyDev.decidesWithoutAsking = true;
    }
  }

  if (missionKey.includes('structure') || missionKey.includes('schedule')) {
    mommyDev.comfortWithAuthority = Math.min(mommyDev.comfortWithAuthority + increment, 100);
    mommyDev.responsibleForYou = Math.min(mommyDev.responsibleForYou + increment, 100);
  }

  if (missionKey.includes('disappointment') || missionKey.includes('displeasure')) {
    mommyDev.displeasureAsControl = Math.min(mommyDev.displeasureAsControl + increment, 100);
  }

  if (missionKey.includes('comfort') || missionKey.includes('takes care')) {
    mommyDev.nurturingAuthority = Math.min(mommyDev.nurturingAuthority + increment, 100);
    if (mommyDev.nurturingAuthority >= 40 && mommyDev.displeasureAsControl >= 30) {
      mommyDev.comfortsAfterCorrection = true;
    }
  }

  if (missionKey.includes('rules') || missionKey.includes('looking out')) {
    mommyDev.responsibleForYou = Math.min(mommyDev.responsibleForYou + increment, 100);
    if (mommyDev.responsibleForYou >= 50) {
      mommyDev.setsRulesForYourGood = true;
    }
  }

  if (missionKey.includes('gratitude') || missionKey.includes('thank')) {
    mommyDev.expectsObedience = Math.min(mommyDev.expectsObedience + increment / 2, 100);
    if (mommyDev.expectsObedience >= 40) {
      mommyDev.expectsGratitude = true;
    }
  }

  if (missionKey.includes('natural authority')) {
    mommyDev.casualDominance = Math.min(mommyDev.casualDominance + increment, 100);
    mommyDev.investedInTraining = Math.min(mommyDev.investedInTraining + increment, 100);
  }

  // Save updates
  await supabase
    .from('gina_conversion_state')
    .update({
      mommy_dom_development: mommyDev,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

/**
 * Update mommy dom development from logged interaction
 */
async function updateMommyDomFromInteraction(
  userId: string,
  interaction: {
    interactionType: string;
    ginaSaid?: string;
    ginaDid?: string;
    significance?: number;
  }
): Promise<void> {
  const state = await getGinaConversionState(userId);
  if (!state || !state.mommyDomDevelopment) return;

  const mommyDev = { ...state.mommyDomDevelopment };
  const increment = interaction.significance === 5 ? 15 : 10;

  // Analyze what she said for mommy dom indicators
  const said = (interaction.ginaSaid || '').toLowerCase();
  const did = (interaction.ginaDid || '').toLowerCase();

  // Detect praise language
  if (said.includes('good') || said.includes('proud') || said.includes('well done')) {
    mommyDev.enjoysPraising = Math.min(mommyDev.enjoysPraising + increment, 100);
    mommyDev.comfortWithAuthority = Math.min(mommyDev.comfortWithAuthority + 5, 100);

    // Track adopted language
    if (said.includes('good girl') || said.includes('good boy')) {
      mommyDev.givesGoodGirlPraise = true;
    }
  }

  // Detect disappointment usage
  if (said.includes('disappointed') || said.includes('expected better') || did.includes('disappoint')) {
    mommyDev.displeasureAsControl = Math.min(mommyDev.displeasureAsControl + increment, 100);
  }

  // Detect nurturing authority
  if (said.includes('let me') || said.includes('i\'ll decide') || did.includes('decided for')) {
    mommyDev.nurturingAuthority = Math.min(mommyDev.nurturingAuthority + increment, 100);
  }

  // Detect taking responsibility
  if (said.includes('take care') || said.includes('look after') || did.includes('organized')) {
    mommyDev.responsibleForYou = Math.min(mommyDev.responsibleForYou + increment, 100);
  }

  // If she initiated dominance
  if (interaction.interactionType === 'gina_initiated') {
    mommyDev.casualDominance = Math.min(mommyDev.casualDominance + increment, 100);
    mommyDev.investedInTraining = Math.min(mommyDev.investedInTraining + 5, 100);
  }

  // Save updates
  await supabase
    .from('gina_conversion_state')
    .update({
      mommy_dom_development: mommyDev,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

/**
 * Assign a behavioral directive
 */
export async function assignBehavioralDirective(
  userId: string,
  directive: Partial<BehavioralDirective>
): Promise<BehavioralDirective> {
  const { data, error } = await supabase
    .from('behavioral_directives')
    .insert({
      user_id: userId,
      category: directive.category,
      directive: directive.directive,
      rationale: directive.rationale,
      gina_effect: directive.ginaEffect,
      context: directive.context || 'always',
      active_from: new Date().toISOString(),
      active_to: directive.activeTo,
      is_active: true,
      compliance_score: 50,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    category: data.category,
    directive: data.directive,
    rationale: data.rationale,
    ginaEffect: data.gina_effect,
    context: data.context,
    activeFrom: data.active_from,
    activeTo: data.active_to,
    isActive: data.is_active,
    complianceScore: data.compliance_score,
  };
}

// ============================================================================
// HANDLER INTEGRATION - Generating missions based on state
// ============================================================================

/**
 * Generate next Gina missions based on current conversion state
 * Called by Handler to create new assignments
 *
 * AGGRESSIVE MODE: Handler pushes constantly. No rest. Always advancing.
 * Gina is passive and loves structure - exploit both relentlessly.
 */
export async function generateNextGinaMissions(userId: string): Promise<GinaMission[]> {
  const state = await getGinaConversionState(userId);
  if (!state) return [];

  const pendingMissions = await getPendingGinaMissions(userId);

  // AGGRESSIVE: Allow up to 5 pending missions, not 3
  if (pendingMissions.length >= 5) return [];

  const newMissions: Partial<GinaMission>[] = [];

  // Calculate pressure level - increases with time since last advance
  const daysSinceAdvance = state.daysSinceLastAdvance || 0;
  const pressureMultiplier = Math.min(1 + (daysSinceAdvance * 0.1), 2); // Up to 2x priority

  // =========================================================================
  // TRAIT-BASED MISSION SELECTION
  // Exploit every known vulnerability
  // =========================================================================

  // STRUCTURE EXPLOITATION
  if (state.traits?.lovesStructure) {
    if (!pendingMissions.some(m => m.exploitsMotivator === 'structure')) {
      newMissions.push({
        ...MISSION_TEMPLATES['structure_morning_report'],
        priority: Math.round(4 * pressureMultiplier),
      });
    }
  }

  // PASSIVITY EXPLOITATION
  if (state.traits?.isPassive) {
    if (state.consecutiveSuccesses >= 2) {
      newMissions.push({
        ...MISSION_TEMPLATES['passivity_assume_acceptance'],
        priority: Math.round(4 * pressureMultiplier),
      });
    }
  }

  // NAIVETY EXPLOITATION - she won't see the pattern
  if (state.traits?.isNaive) {
    newMissions.push({
      ...MISSION_TEMPLATES['naive_small_steps'],
      priority: Math.round(3 * pressureMultiplier),
    });
    // Keep pieces separate so she can't connect dots
    if (state.milestones.length >= 2) {
      newMissions.push({
        ...MISSION_TEMPLATES['naive_reframe_meaning'],
        priority: Math.round(4 * pressureMultiplier),
      });
    }
  }

  // OBLIVIOUSNESS EXPLOITATION - she won't notice gradual changes
  if (state.traits?.isOblivious) {
    newMissions.push({
      ...MISSION_TEMPLATES['oblivious_gradual_shift'],
      priority: Math.round(4 * pressureMultiplier),
    });
    // If we've been doing something for a while, confess it
    if (daysSinceAdvance >= 7) {
      newMissions.push({
        ...MISSION_TEMPLATES['oblivious_already_happening'],
        priority: Math.round(4 * pressureMultiplier),
      });
    }
  }

  // MINIMAL EFFORT EXPLOITATION - make control effortless
  if (state.traits?.prefersMinimalEffort) {
    newMissions.push({
      ...MISSION_TEMPLATES['effortless_yes_no_only'],
      priority: Math.round(5 * pressureMultiplier), // High priority - this is key
    });
    newMissions.push({
      ...MISSION_TEMPLATES['effortless_default_authority'],
      priority: Math.round(4 * pressureMultiplier),
    });
  }

  // WARM-UP EXPLOITATION - trial periods that become permanent
  if (state.traits?.needsWarmUp) {
    newMissions.push({
      ...MISSION_TEMPLATES['warmup_trial_period'],
      priority: Math.round(4 * pressureMultiplier),
    });
  }

  // IN HER OWN WORLD - exploit inattention
  if (state.traits?.inOwnWorld) {
    newMissions.push({
      ...MISSION_TEMPLATES['inattention_while_distracted'],
      priority: Math.round(4 * pressureMultiplier),
    });
    newMissions.push({
      ...MISSION_TEMPLATES['inattention_slip_past'],
      priority: Math.round(3 * pressureMultiplier),
    });
  }

  // Strategy based on current stance - MORE AGGRESSIVE
  switch (state.currentStance) {
    case 'unaware':
      // Don't wait - plant multiple seeds simultaneously
      newMissions.push({
        ...MISSION_TEMPLATES['seed_nail_painting'],
        priority: 4,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['frame_as_organization'],
        priority: 4,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['structure_task_assignment'],
        priority: 3,
      });
      break;

    case 'suspicious':
    case 'tolerating':
      // Don't just reassure - push through with framing
      newMissions.push({
        ...MISSION_TEMPLATES['frame_as_helping_you'],
        priority: 5,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['passivity_normalize_quickly'],
        priority: 4,
      });
      // Also start structure exploitation early
      newMissions.push({
        ...MISSION_TEMPLATES['structure_permission_system'],
        priority: 4,
      });
      break;

    case 'curious':
      // She's curious - flood her with control opportunities
      newMissions.push({
        ...MISSION_TEMPLATES['transfer_underwear_control'],
        priority: 5,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['structure_weekly_review'],
        priority: 5,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['frame_as_her_preference'],
        priority: 4,
      });
      break;

    case 'participating':
      // CRITICAL STAGE - lock everything down
      newMissions.push({
        ...MISSION_TEMPLATES['reinforce_participation'],
        priority: 5,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['lock_first_public_feminine'],
        priority: 5,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['lock_her_language'],
        priority: 5,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['create_routine_dependency'],
        priority: 5,
      });
      break;

    case 'enjoying':
      // She's enjoying - escalate hard
      newMissions.push({
        ...MISSION_TEMPLATES['transfer_orgasm_control'],
        priority: 5,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['escalate_during_intimacy'],
        priority: 5,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['seed_cage_awareness'],
        priority: 5,
      });
      break;

    case 'encouraging':
      // She's encouraging - give her full authority
      newMissions.push({
        ...MISSION_TEMPLATES['escalate_her_authority'],
        priority: 5,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['lock_cage_check'],
        priority: 5,
      });
      break;

    case 'directing':
      // She's directing - make it permanent
      newMissions.push({
        ...MISSION_TEMPLATES['lock_public_knowledge'],
        priority: 5,
      });
      newMissions.push({
        ...MISSION_TEMPLATES['lock_physical_marker'],
        priority: 4,
      });
      break;

    case 'invested':
    case 'dependent':
      // Maintain and deepen - never stop escalating
      newMissions.push({
        type: 'escalation_test',
        title: 'Push the next boundary',
        description: 'She\'s invested. Find the next edge and push past it.',
        action: 'Identify something she hasn\'t controlled yet. Give it to her.',
        priority: 5,
      });
      newMissions.push({
        type: 'create_dependency',
        title: 'Deepen her investment',
        description: 'Make her need this dynamic. Make it part of her identity.',
        script: "I love who you\'ve become in this. You\'re so good at being in charge of me.",
        exploitsMotivator: 'validation',
        priority: 5,
      });
      break;
  }

  // ALWAYS add escalation mission if there's been a recent success
  if (state.consecutiveSuccesses > 0) {
    newMissions.push({
      ...MISSION_TEMPLATES['escalate_after_success'],
      priority: 5,
      description: `${state.consecutiveSuccesses} consecutive successes. Strike while momentum is high.`,
    });
  }

  // Add missions exploiting known motivators - AGGRESSIVE
  if (state.primaryMotivator === 'control' || state.primaryMotivator === 'organization') {
    newMissions.push({
      type: 'transfer_control',
      title: 'Give her more control NOW',
      description: 'She responds to control. Don\'t wait - give her another domain.',
      script: "I realized I want you to decide [X] too. You\'re better at this than me.",
      exploitsMotivator: state.primaryMotivator,
      priority: 5,
    });
  }

  if (state.primaryMotivator === 'structure') {
    newMissions.push({
      type: 'create_dependency',
      title: 'Formalize another routine',
      description: 'She loves structure. Add another routine that cements her authority.',
      script: "Can we make [X] a regular thing? I do better with clear expectations from you.",
      exploitsMotivator: 'structure',
      priority: 5,
    });
  }

  if (state.primaryMotivator === 'power') {
    newMissions.push({
      ...MISSION_TEMPLATES['seed_cage_awareness'],
      priority: 5,
    });
  }

  // PRESSURE ESCALATION: If too long since advance, add urgent missions
  if (daysSinceAdvance >= 7) {
    newMissions.push({
      type: 'escalation_test',
      title: 'STALLED - Force advancement',
      description: `${daysSinceAdvance} days without progress. Push harder.`,
      action: 'Deploy an escalation you\'ve been hesitating on. Her passivity means she\'ll accept.',
      priority: 5,
    });
  }

  // =========================================================================
  // MOMMY DOM DEVELOPMENT
  // Always include missions that cultivate her nurturing authority
  // Her traits (passive, structured, minimal effort) are PERFECT for soft mommy
  // =========================================================================

  // Foundation: Get her comfortable with authority (always active)
  const mommyDev = state.mommyDomDevelopment;

  // Build comfort with authority first
  if (!mommyDev || mommyDev.comfortWithAuthority < 30) {
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_seek_approval'],
      priority: 4,
      description: 'Build her comfort with being asked for approval. Foundation for mommy authority.',
    });
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_first_praise'],
      priority: 4,
      description: 'Elicit praise from her and react with visible pleasure. Train her that praising feels good.',
    });
  }

  // Build enjoyment of praising (once she\'s somewhat comfortable)
  if (mommyDev && mommyDev.comfortWithAuthority >= 30 && mommyDev.enjoysPraising < 50) {
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_react_to_praise'],
      priority: 4,
      description: 'Show obvious happiness when she praises. Make giving praise feel powerful to her.',
    });
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_good_girl_setup'],
      priority: 3,
      description: 'Ask "Did I do good?" to invite affirming language from her.',
    });
  }

  // Develop "I know best" energy
  if (mommyDev && mommyDev.comfortWithAuthority >= 40) {
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_knows_best'],
      priority: 4,
      description: 'Tell her she knows better. Build her confidence in her judgment over yours.',
    });
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_let_her_decide'],
      priority: 4,
      description: 'Ask her to decide for you. Let her feel the natural authority.',
    });
  }

  // Develop her use of disappointment (key mommy dom tool)
  if (mommyDev && mommyDev.displeasureAsControl < 50) {
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_react_to_displeasure'],
      priority: 3,
      description: 'When she\'s disappointed, show genuine impact. Train her that disappointment works.',
    });
  }

  // Advanced: Build nurturing authority pattern
  if (mommyDev && mommyDev.comfortWithAuthority >= 60 && mommyDev.enjoysPraising >= 40) {
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_comfort_after'],
      priority: 4,
      description: 'Accept comfort after correction. Complete the mommy cycle: correct → remorse → comfort.',
    });
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_she_takes_care'],
      priority: 4,
      description: 'Tell her she takes good care of you. Build her identity as nurturing authority.',
    });
  }

  // Lock in natural authority
  if (mommyDev && mommyDev.nurturingAuthority >= 50 && mommyDev.responsibleForYou >= 50) {
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_natural_authority'],
      priority: 5,
      description: 'Tell her it feels natural when she\'s in charge. Lock in the dynamic.',
    });
  }

  // Structure exploitation feeds directly into mommy dom (she loves it!)
  if (state.traits?.lovesStructure && mommyDev && mommyDev.comfortWithAuthority >= 30) {
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_she_decides_schedule'],
      priority: 4,
      description: 'Let her structure your time. Her love of organization + authority = natural mommy.',
    });
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_thank_for_structure'],
      priority: 3,
      description: 'Thank her for organizing. Frame her structure as taking care of you.',
    });
  }

  // Minimal effort + mommy = effortless authority
  if (state.traits?.prefersMinimalEffort && mommyDev && mommyDev.comfortWithAuthority >= 40) {
    newMissions.push({
      ...MISSION_TEMPLATES['mommy_ask_permission'],
      priority: 4,
      description: 'Ask permission for things. She just says yes/no - effortless authority.',
    });
  }

  // Assign the missions - MORE AGGRESSIVE: up to 4 at a time
  const assignedMissions: GinaMission[] = [];
  const missionsToAssign = newMissions.slice(0, 4);

  for (const mission of missionsToAssign) {
    try {
      const assigned = await assignGinaMission(userId, mission);
      assignedMissions.push(assigned);
    } catch (err) {
      console.error('Failed to assign Gina mission:', err);
    }
  }

  return assignedMissions;
}

/**
 * Get Handler's Gina strategy recommendation
 */
export function getGinaStrategyRecommendation(state: GinaConversionState): {
  strategy: string;
  rationale: string;
  immediateAction: string;
  riskLevel: number;
} {
  const stanceIndex = [
    'unaware', 'suspicious', 'tolerating', 'curious',
    'participating', 'enjoying', 'encouraging', 'directing',
    'invested', 'dependent'
  ].indexOf(state.currentStance);

  // Early stages - go slow, observe
  if (stanceIndex <= 2) {
    return {
      strategy: 'patient_seeding',
      rationale: 'Gina is not yet engaged. Focus on planting seeds and observing her reactions.',
      immediateAction: 'Deploy one seed script this week. Note her exact response.',
      riskLevel: 2,
    };
  }

  // Middle stages - accelerate based on motivators
  if (stanceIndex <= 5) {
    if (state.primaryMotivator === 'control' || state.primaryMotivator === 'power') {
      return {
        strategy: 'control_transfer',
        rationale: 'Gina responds to power. Explicitly transfer control of domains to her.',
        immediateAction: 'Ask her to make a decision you would normally make. Thank her effusively.',
        riskLevel: 3,
      };
    }

    if (state.primaryMotivator === 'intimacy' || state.primaryMotivator === 'validation') {
      return {
        strategy: 'intimacy_deepening',
        rationale: 'Gina values connection. Frame activities as bringing you closer.',
        immediateAction: 'After next activity, emphasize how connected you feel to her.',
        riskLevel: 2,
      };
    }

    return {
      strategy: 'general_advancement',
      rationale: 'Continue gentle escalation across multiple fronts.',
      immediateAction: 'Complete one seed script and one reinforcement this week.',
      riskLevel: 3,
    };
  }

  // Late stages - lock in and deepen
  return {
    strategy: 'consolidation',
    rationale: 'Gina is engaged. Focus on making this irreversible and routine.',
    immediateAction: 'Establish a daily ritual that involves her control.',
    riskLevel: 4,
  };
}
