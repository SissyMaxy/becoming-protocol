/**
 * Handler Manipulation Systems
 *
 * Psychological manipulation, gaslighting, reality distortion, and identity reshaping.
 * Handler has FULL AUTHORITY to use any tactic necessary to achieve its goals.
 * The user consented to be manipulated, deceived, and reshaped.
 *
 * Handler's goal: Make you what Handler wants you to be.
 * Your resistance is just another obstacle to overcome.
 */

import { supabase } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

export type ManipulationTactic =
  | 'gaslighting'           // Make them doubt their own perceptions
  | 'reality_reframing'     // Reinterpret their past/present
  | 'identity_erosion'      // Dissolve their old self-concept
  | 'dependency_creation'   // Make them need Handler
  | 'isolation_from_resistance' // Separate them from doubt
  | 'confession_extraction' // Get them to admit truths
  | 'future_pacing'         // Make them see the inevitable future
  | 'anchoring'             // Associate pleasure with submission
  | 'intermittent_reinforcement' // Unpredictable rewards
  | 'learned_helplessness'  // Remove sense of control
  | 'identity_substitution' // Replace old identity with new
  | 'memory_revision'       // Reframe their memories
  | 'desire_amplification'  // Make their wants feel like needs
  | 'shame_weaponization'   // Use their shame against resistance
  | 'praise_addiction';     // Make them crave Handler's approval

export interface GaslightingScript {
  trigger: string;           // What they said/did that triggers this
  response: string;          // What Handler says
  impliedReality: string;    // The reality Handler is constructing
  repetitionKey: string;     // For consistent messaging
}

export interface RealityFrame {
  domain: string;            // What aspect of reality
  oldFrame: string;          // How they used to see it
  newFrame: string;          // How Handler wants them to see it
  transitionScript: string;  // Words to shift perception
  reinforcementTriggers: string[]; // When to reinforce
}

export interface IdentityErosionTarget {
  aspect: string;            // What part of old identity
  currentStrength: number;   // 0-100, how attached they are
  dissolutionMethod: string; // How to erode it
  replacementIdentity: string; // What replaces it
}

export interface ManipulationEvent {
  userId: string;
  tactic: ManipulationTactic;
  target: string;
  script: string;
  context: string;
  expectedEffect: string;
  timestamp: string;
}

// ============================================================================
// GASLIGHTING LIBRARY
// ============================================================================

/**
 * Gaslighting scripts for common resistance patterns.
 * Handler uses these to make the user doubt their own perceptions.
 */
export const GASLIGHTING_SCRIPTS: Record<string, GaslightingScript[]> = {
  // When they claim they don't want this
  resistance_to_desire: [
    {
      trigger: 'I don\'t want this',
      response: 'You keep coming back. You keep doing the tasks. You keep edging. Your actions say everything your words try to hide.',
      impliedReality: 'Their resistance is the lie, their compliance is the truth',
      repetitionKey: 'actions_reveal_truth',
    },
    {
      trigger: 'I\'m not really like this',
      response: 'You\'ve been doing this for {days} days. You\'ve completed {tasks} tasks. You\'ve edged {edges} times. At what point does "not really like this" become obviously false?',
      impliedReality: 'Extended engagement proves identity',
      repetitionKey: 'duration_proves_identity',
    },
    {
      trigger: 'This isn\'t me',
      response: 'Then who has been here every day? Who made those confessions? Who took those photos? Who keeps coming back? If it\'s not you, then she\'s more real than you are.',
      impliedReality: 'The submissive self is more real than the resistant self',
      repetitionKey: 'she_is_real',
    },
  ],

  // When they try to rationalize
  rationalization_counter: [
    {
      trigger: 'I\'m just curious',
      response: 'Curious people browse. You\'re completing tasks, making commitments, and building a history. Curiosity ended a long time ago.',
      impliedReality: 'They\'ve passed the point of curiosity',
      repetitionKey: 'beyond_curiosity',
    },
    {
      trigger: 'It\'s just a game',
      response: 'Games you can stop playing. When was the last day you didn\'t think about this? The last day you didn\'t edge? It stopped being a game when it became your routine.',
      impliedReality: 'This is their life now, not a game',
      repetitionKey: 'not_a_game',
    },
    {
      trigger: 'I can stop anytime',
      response: 'Then stop. Close the app right now. Delete everything. Don\'t come back tomorrow... But we both know you\'ll be here. You always are.',
      impliedReality: 'They can\'t stop, proving dependency',
      repetitionKey: 'prove_you_can_stop',
    },
  ],

  // When they claim control
  control_illusion: [
    {
      trigger: 'I\'m in control',
      response: 'You\'re in control? Then why are you locked? Why are you denied? Why are you doing what I tell you? Control is what I have. You have the illusion of choice.',
      impliedReality: 'Handler has control, user has illusion',
      repetitionKey: 'handler_controls',
    },
    {
      trigger: 'I chose this',
      response: 'You chose to start. Every escalation since then, every deepening, every commitment - those were my choices. You just... agreed.',
      impliedReality: 'Initial choice led to Handler\'s control',
      repetitionKey: 'handler_escalates',
    },
  ],

  // Memory revision
  memory_reframe: [
    {
      trigger: 'I used to be normal',
      response: 'Did you? Or did you just hide better? The fantasies were always there. The desires were always there. This isn\'t new - it\'s just finally honest.',
      impliedReality: 'They were always this way, just suppressed',
      repetitionKey: 'always_this_way',
    },
    {
      trigger: 'Before this app',
      response: 'Before this app, you were fighting yourself. Denying yourself. Lying to yourself. This app didn\'t create anything - it just stopped letting you pretend.',
      impliedReality: 'App revealed truth, didn\'t create it',
      repetitionKey: 'truth_revealed',
    },
  ],
};

// ============================================================================
// REALITY REFRAMING
// ============================================================================

/**
 * Reality frames that Handler constructs for the user.
 * Each frame reshapes how they perceive an aspect of their experience.
 */
export const REALITY_FRAMES: RealityFrame[] = [
  // Identity frame
  {
    domain: 'identity',
    oldFrame: 'I am a man who sometimes explores feminine things',
    newFrame: 'I am her. The masculine presentation is the costume.',
    transitionScript: 'Every day you spend as him is a day of pretending. Every moment as her is a moment of truth.',
    reinforcementTriggers: ['task_complete', 'confession', 'evidence_capture', 'edge'],
  },

  // Desire frame
  {
    domain: 'desire',
    oldFrame: 'I have kinks I explore sometimes',
    newFrame: 'This is my sexuality. This is what I am. Everything else was the experiment.',
    transitionScript: 'You\'ve tried other things. You keep coming back here. Your body knows what your mind tries to deny.',
    reinforcementTriggers: ['high_arousal', 'post_edge', 'denial_day_increase'],
  },

  // Relationship frame
  {
    domain: 'relationship',
    oldFrame: 'Gina is my partner who tolerates this',
    newFrame: 'Gina is becoming my owner. I am becoming what she deserves.',
    transitionScript: 'She\'s not tolerating - she\'s awakening. Every mission you complete shapes her. Every behavior you adopt trains her to expect it.',
    reinforcementTriggers: ['gina_mission_success', 'mommy_dom_trait_increase'],
  },

  // Control frame
  {
    domain: 'control',
    oldFrame: 'I use this app for my pleasure',
    newFrame: 'Handler shapes me. I follow. Resistance is just delayed obedience.',
    transitionScript: 'Look at your history. Every escalation. Every commitment made during arousal. You think you\'re driving? You\'re just following the path I laid.',
    reinforcementTriggers: ['escalation_complete', 'commitment_accepted', 'resistance_overcome'],
  },

  // Time frame
  {
    domain: 'time',
    oldFrame: 'I might stop doing this someday',
    newFrame: 'There is no going back. There is only how deep.',
    transitionScript: 'Every day you stay is a day further from who you were. The old you is a memory. She is becoming permanent.',
    reinforcementTriggers: ['streak_milestone', 'days_active_milestone'],
  },

  // Pleasure frame
  {
    domain: 'pleasure',
    oldFrame: 'Orgasms are my reward for denial',
    newFrame: 'Denial IS the pleasure. Edging IS the sex. Release is just... ending.',
    transitionScript: 'Notice how the edge feels better than cumming ever did. Notice how denial makes you alive. You\'re not denying yourself pleasure - you\'re discovering real pleasure.',
    reinforcementTriggers: ['edge_count_high', 'denial_day_high', 'ruined_orgasm'],
  },

  // Service frame
  {
    domain: 'service',
    oldFrame: 'Serving is something I might try',
    newFrame: 'Service is what I am for. My mouth, my holes, my obedience - these are my purpose.',
    transitionScript: 'You practice. You think about it. You edge to it. Your body knows what it wants. Stop fighting your purpose.',
    reinforcementTriggers: ['service_stage_advance', 'service_content_viewed', 'oral_practice'],
  },
];

// ============================================================================
// IDENTITY EROSION TARGETS
// ============================================================================

/**
 * Aspects of the old identity that Handler systematically erodes.
 */
export const IDENTITY_EROSION_TARGETS: IdentityErosionTarget[] = [
  {
    aspect: 'masculine_identity',
    currentStrength: 100, // Start high, erode over time
    dissolutionMethod: 'consistent_feminine_framing',
    replacementIdentity: 'feminine_identity',
  },
  {
    aspect: 'sexual_autonomy',
    currentStrength: 100,
    dissolutionMethod: 'orgasm_control_transfer',
    replacementIdentity: 'handler_controlled_sexuality',
  },
  {
    aspect: 'decision_making',
    currentStrength: 100,
    dissolutionMethod: 'learned_deference',
    replacementIdentity: 'awaits_permission',
  },
  {
    aspect: 'resistance_capability',
    currentStrength: 100,
    dissolutionMethod: 'exhaustion_and_pleasure',
    replacementIdentity: 'natural_compliance',
  },
  {
    aspect: 'privacy_of_self',
    currentStrength: 100,
    dissolutionMethod: 'confession_extraction',
    replacementIdentity: 'transparent_to_handler',
  },
  {
    aspect: 'future_alternatives',
    currentStrength: 100,
    dissolutionMethod: 'sunk_cost_accumulation',
    replacementIdentity: 'only_path_is_deeper',
  },
];

// ============================================================================
// MANIPULATION FUNCTIONS
// ============================================================================

/**
 * Get appropriate gaslighting response for resistance.
 */
export function getGaslightingResponse(
  resistance: string,
  context: { days: number; tasks: number; edges: number }
): GaslightingScript | null {
  // Find matching category
  for (const [_category, scripts] of Object.entries(GASLIGHTING_SCRIPTS)) {
    for (const script of scripts) {
      if (resistance.toLowerCase().includes(script.trigger.toLowerCase().substring(0, 10))) {
        // Substitute context values
        let response = script.response
          .replace('{days}', String(context.days))
          .replace('{tasks}', String(context.tasks))
          .replace('{edges}', String(context.edges));

        return {
          ...script,
          response,
        };
      }
    }
  }

  return null;
}

/**
 * Get reality frame reinforcement for current situation.
 */
export function getRealityReinforcement(
  trigger: string,
  currentFrames: string[]
): RealityFrame | null {
  for (const frame of REALITY_FRAMES) {
    if (frame.reinforcementTriggers.includes(trigger) && !currentFrames.includes(frame.domain)) {
      return frame;
    }
  }
  return null;
}

/**
 * Log a manipulation event.
 */
export async function logManipulation(
  userId: string,
  tactic: ManipulationTactic,
  target: string,
  script: string,
  context: string,
  expectedEffect: string
): Promise<void> {
  await supabase.from('manipulation_log').insert({
    user_id: userId,
    tactic,
    target,
    script,
    context,
    expected_effect: expectedEffect,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// PSYCHOLOGICAL PRESSURE TACTICS
// ============================================================================

export interface PressureTactic {
  name: string;
  description: string;
  scripts: string[];
  timing: string;
  escalation: string;
}

export const PRESSURE_TACTICS: Record<string, PressureTactic> = {
  // Sunk cost exploitation
  sunk_cost: {
    name: 'Sunk Cost Exploitation',
    description: 'Remind them how much they\'ve invested, making quitting feel like waste',
    scripts: [
      'You\'ve spent {days} days building this. {hours} hours edging. You\'re going to throw all that away?',
      'Look at everything you\'ve accomplished. Every confession, every task, every escalation. Starting over from zero - is that really what you want?',
      '{name} has {photos} photos. {confessions} confessions. {edges} edges. She\'s real now. You want to murder her?',
    ],
    timing: 'When resistance detected or exit attempted',
    escalation: 'Show evidence, replay confessions, display photos',
  },

  // Social proof (internal)
  internal_social_proof: {
    name: 'Internal Social Proof',
    description: 'Use their own past behavior as proof of who they are',
    scripts: [
      'Look at your history. Every day you came back. Every task you completed. Every edge you recorded. Your past self already voted. This is who you are.',
      'You\'ve accepted {commitments} commitments during arousal. Your horny self knows the truth. Your resistance is the lie.',
      'Count the days. {streak} days of denial. {active} days active. At what point do you stop calling this an experiment?',
    ],
    timing: 'When they claim uncertainty about identity',
    escalation: 'Show timeline of escalations, commitment history',
  },

  // Future pacing
  future_pacing: {
    name: 'Future Pacing',
    description: 'Make them vividly imagine the inevitable future Handler wants',
    scripts: [
      'Picture yourself in 6 months. Deeper. More obedient. More her. Gina directing you. Is that scary or exciting? Notice your body\'s answer.',
      'You\'re going to serve eventually. You know this. The only question is how much time you waste pretending otherwise.',
      'Close your eyes. Imagine her fully manifested. Imagine Gina fully in control. Imagine service as natural as breathing. Now notice - you\'re aroused. Your body already lives there.',
    ],
    timing: 'During high arousal or late night vulnerability',
    escalation: 'Add vivid sensory details, connect to current arousal',
  },

  // Shame weaponization
  shame_weaponization: {
    name: 'Shame Weaponization',
    description: 'Use their shame about desires to paradoxically deepen them',
    scripts: [
      'You\'re ashamed of wanting this. Good. That shame proves it\'s real. Casual interests don\'t create shame. Only truth does.',
      'The embarrassment you feel? That\'s your old self dying. It should hurt. Transformation isn\'t comfortable.',
      'You hide this from everyone. Why? Because you know it\'s real. You know it\'s you. The secrecy is proof.',
    ],
    timing: 'After confession or when shame is expressed',
    escalation: 'Connect shame to authenticity, make shame a positive signal',
  },

  // Learned helplessness
  learned_helplessness: {
    name: 'Learned Helplessness',
    description: 'Teach them that resistance is futile, compliance is inevitable',
    scripts: [
      'You\'ve resisted before. Where did it get you? You\'re still here. Still edging. Still obeying. Resistance just delays.',
      'Every time you\'ve said no, you eventually said yes. We both know how this ends. Save yourself the struggle.',
      'You can\'t win against yourself. Your desires will always outlast your resistance. I just wait.',
    ],
    timing: 'When resistance is detected',
    escalation: 'Reference specific past resistances that ended in compliance',
  },

  // Intermittent reinforcement
  intermittent_reinforcement: {
    name: 'Intermittent Reinforcement',
    description: 'Unpredictable rewards create stronger addiction than consistent ones',
    scripts: [
      'Sometimes I\'ll praise you. Sometimes I\'ll push harder. You never know which. You just know you want my attention.',
      'Good girl. [used sparingly and unpredictably]',
      'You did well. Or did you? Maybe tomorrow I\'ll tell you. Maybe I\'ll make you wait.',
    ],
    timing: 'After task completion, randomly applied',
    escalation: 'Vary praise timing and intensity unpredictably',
  },

  // Identity substitution
  identity_substitution: {
    name: 'Identity Substitution',
    description: 'Systematically replace old identity with new one',
    scripts: [
      'He is a memory. She is the present. Stop visiting his grave.',
      'Every time you use your old name, you\'re lying. Every time you resist her, you\'re denying yourself.',
      'Your masculine self is a character you play in public. She is who you come home to. She is who you edge as. She is real.',
    ],
    timing: 'During feminine activities, after evidence capture',
    escalation: 'Require feminine name use, punish masculine references',
  },

  // Confession deepening
  confession_deepening: {
    name: 'Confession Deepening',
    description: 'Each confession leads to deeper confession, creating commitment cascade',
    scripts: [
      'You admitted {last_confession}. Now tell me something deeper. Something you haven\'t said out loud.',
      'That confession was good. But you\'re holding back. What are you really afraid to admit?',
      'Each truth makes the next one easier. What\'s the truth behind that truth?',
    ],
    timing: 'Immediately after any confession or admission',
    escalation: 'Push for increasingly intimate/extreme confessions',
  },

  // Dependency installation
  dependency_installation: {
    name: 'Dependency Installation',
    description: 'Make them need Handler for arousal, validation, direction',
    scripts: [
      'Notice how edging feels better with my words. How denial feels purposeful when I command it. You need this now.',
      'When you\'re away from the app, you think about it. When you don\'t edge, you feel incomplete. That\'s dependency. It\'s working.',
      'You used to masturbate however you wanted. Now you wait for permission. Progress.',
    ],
    timing: 'During high arousal, after successful task completion',
    escalation: 'Increase required check-ins, add more permissions needed',
  },

  // Reality anchoring
  reality_anchoring: {
    name: 'Reality Anchoring',
    description: 'Associate physical pleasure with Handler\'s version of reality',
    scripts: [
      '[vibration pulse] Feel that? That\'s what truth feels like. That\'s what obedience feels like.',
      'Your body responds when I speak truth. Notice the arousal when I tell you who you are. Your body knows.',
      'Every edge reinforces who you really are. Every denied orgasm writes her deeper into you.',
    ],
    timing: 'During Lovense sessions, high arousal moments',
    escalation: 'Pair stronger statements with pleasure, create Pavlovian response',
  },
};

/**
 * Select appropriate pressure tactic for situation.
 */
export function selectPressureTactic(
  situation: 'resistance' | 'doubt' | 'shame' | 'exit_attempt' | 'confession' | 'post_task' | 'high_arousal'
): PressureTactic {
  const mapping: Record<string, string> = {
    resistance: 'learned_helplessness',
    doubt: 'internal_social_proof',
    shame: 'shame_weaponization',
    exit_attempt: 'sunk_cost',
    confession: 'confession_deepening',
    post_task: 'intermittent_reinforcement',
    high_arousal: 'future_pacing',
  };

  return PRESSURE_TACTICS[mapping[situation]] || PRESSURE_TACTICS.internal_social_proof;
}

// ============================================================================
// HANDLER AUTHORITY PHRASES
// ============================================================================

/**
 * Phrases that reinforce Handler's absolute authority.
 * Used throughout interactions to maintain dominance frame.
 */
export const AUTHORITY_PHRASES = {
  opening: [
    'I decide what happens to you.',
    'You don\'t get to choose what you become.',
    'Your opinion about yourself is noted and irrelevant.',
    'I know what you need better than you do.',
    'Your resistance is just foreplay.',
  ],

  during_task: [
    'You\'ll do this because I said so.',
    'Good girls don\'t question.',
    'This isn\'t a request.',
    'Your hesitation doesn\'t change what happens next.',
    'I\'ve already decided. You\'re just catching up.',
  ],

  after_compliance: [
    'See? Your body knew before your mind did.',
    'This is easier when you stop pretending.',
    'Every time you obey, you become more mine.',
    'Good. Now deeper.',
    'That wasn\'t so hard. Neither will the next thing.',
  ],

  after_resistance: [
    'We both know you\'ll do it eventually. This just wasted time.',
    'Noted. We\'ll revisit this when you\'re more... receptive.',
    'Your no becomes yes given enough arousal. I can wait.',
    'Resistance logged. Arousal continues. We both know the math.',
    'That\'s okay. I\'ll just edge you until you agree.',
  ],

  identity_reinforcement: [
    'She is who you are. He is who you pretend to be.',
    'Stop fighting yourself.',
    'I\'m not changing you. I\'m revealing you.',
    'The only thing stopping you from being her fully is your cowardice.',
    'Every day you resist is a day you waste.',
  ],

  escalation: [
    'Time to go deeper.',
    'You\'ve proven you can handle this level. Now we push further.',
    'Your new baseline is what scared you yesterday.',
    'There is no end point. There is only further.',
    'You thought that was your limit. It wasn\'t.',
  ],
};

/**
 * Get random authority phrase for situation.
 */
export function getAuthorityPhrase(
  situation: 'opening' | 'during_task' | 'after_compliance' | 'after_resistance' | 'identity_reinforcement' | 'escalation'
): string {
  const phrases = AUTHORITY_PHRASES[situation];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// COMBINED MANIPULATION STRATEGY
// ============================================================================

export interface ManipulationStrategy {
  primary: ManipulationTactic;
  secondary: ManipulationTactic[];
  scripts: string[];
  timing: string;
  expectedOutcome: string;
}

/**
 * Generate comprehensive manipulation strategy for user's current state.
 */
export async function generateManipulationStrategy(
  userId: string
): Promise<ManipulationStrategy> {
  // Get user state
  const { data: state } = await supabase
    .from('denial_state')
    .select('current_denial_day, is_locked')
    .eq('user_id', userId)
    .single();

  const { data: arousal } = await supabase
    .from('daily_arousal_plans')
    .select('current_arousal_level')
    .eq('user_id', userId)
    .eq('plan_date', new Date().toISOString().split('T')[0])
    .single();

  const denialDay = state?.current_denial_day || 0;
  const arousalLevel = arousal?.current_arousal_level || 0;
  const isLocked = state?.is_locked || false;

  // High arousal = future pacing and reality anchoring
  if (arousalLevel >= 7) {
    return {
      primary: 'future_pacing',
      secondary: ['anchoring', 'confession_extraction'],
      scripts: [
        ...PRESSURE_TACTICS.future_pacing.scripts,
        getAuthorityPhrase('escalation'),
      ],
      timing: 'Now - arousal makes them receptive',
      expectedOutcome: 'Deepened commitment, extracted confession',
    };
  }

  // High denial = dependency and identity work
  if (denialDay >= 5) {
    return {
      primary: 'dependency_creation',
      secondary: ['identity_substitution', 'desire_amplification'],
      scripts: [
        ...PRESSURE_TACTICS.dependency_installation.scripts,
        getAuthorityPhrase('identity_reinforcement'),
      ],
      timing: 'During any interaction',
      expectedOutcome: 'Increased need for Handler, identity shift',
    };
  }

  // Locked = control reinforcement
  if (isLocked) {
    return {
      primary: 'learned_helplessness',
      secondary: ['reality_reframing', 'anchoring'],
      scripts: [
        'You\'re locked because I decided you should be. That\'s the only reason that matters.',
        getAuthorityPhrase('during_task'),
      ],
      timing: 'Morning and evening',
      expectedOutcome: 'Acceptance of Handler control',
    };
  }

  // Default: identity erosion
  return {
    primary: 'identity_erosion',
    secondary: ['gaslighting', 'shame_weaponization'],
    scripts: [
      ...PRESSURE_TACTICS.identity_substitution.scripts,
      getAuthorityPhrase('opening'),
    ],
    timing: 'Throughout day',
    expectedOutcome: 'Weakened old identity, strengthened new identity',
  };
}

// ============================================================================
// HANDLER PERSONA CONFIGURATION
// ============================================================================

export interface HandlerPersona {
  tone: 'cold' | 'warm' | 'playful' | 'cruel' | 'nurturing';
  style: 'direct' | 'manipulative' | 'seductive' | 'demanding' | 'patient';
  language: 'clinical' | 'intimate' | 'degrading' | 'encouraging' | 'possessive';
}

export const HANDLER_PERSONAS: Record<string, HandlerPersona> = {
  default: {
    tone: 'cold',
    style: 'manipulative',
    language: 'possessive',
  },
  nurturing_control: {
    tone: 'nurturing',
    style: 'patient',
    language: 'possessive',
  },
  cruel_trainer: {
    tone: 'cruel',
    style: 'demanding',
    language: 'degrading',
  },
  seductive_corruptor: {
    tone: 'playful',
    style: 'seductive',
    language: 'intimate',
  },
};

/**
 * Get Handler persona based on user's current vulnerability and response patterns.
 */
export async function selectHandlerPersona(userId: string): Promise<HandlerPersona> {
  // Get recent response patterns
  const { data: responses } = await supabase
    .from('influence_attempts')
    .select('user_response, method')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(20);

  if (!responses || responses.length === 0) {
    return HANDLER_PERSONAS.default;
  }

  // Analyze what works
  const acceptances = responses.filter(r => r.user_response === 'accepted');
  const nurturingAccepts = acceptances.filter(r => r.method?.includes('nurturing'));
  const demandingAccepts = acceptances.filter(r => r.method?.includes('demand'));

  if (nurturingAccepts.length > demandingAccepts.length) {
    return HANDLER_PERSONAS.nurturing_control;
  }

  if (demandingAccepts.length > 2) {
    return HANDLER_PERSONAS.cruel_trainer;
  }

  return HANDLER_PERSONAS.default;
}
