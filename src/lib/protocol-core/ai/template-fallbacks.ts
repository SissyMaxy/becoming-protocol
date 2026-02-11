/**
 * Template Fallbacks
 *
 * When AI budget is exhausted or API fails, these templates ensure
 * the system never goes silent. Every AI operation has fallback content.
 *
 * Templates are selected randomly to prevent staleness.
 * Context variables are interpolated where available.
 */

import type { OperationType } from './system-prompts';

// ============================================
// FALLBACK TEMPLATES BY OPERATION
// ============================================

export const FALLBACK_TEMPLATES: Record<OperationType, string[]> = {
  base: [
    'Ready when you are.',
    'What do you need?',
    'I\'m here.',
  ],

  task_enhancement: [
    'Maxy, do this now: {instruction}',
    '{instruction}. Don\'t overthink it.',
    'Your task: {instruction}. Begin.',
    'Focus: {instruction}',
    '{instruction}. You know what to do.',
  ],

  coercion: [
    'This isn\'t negotiable. Do it.',
    'David is stalling. Maxy would just do this.',
    'You\'ve been avoiding this. That stops now.',
    'Every minute you resist costs you. Choose.',
    'I\'m not asking. I\'m telling you.',
    'This is resistance, not preference. Push through.',
    'The task stands. Your feelings about it don\'t change what needs to happen.',
  ],

  vault_threat: [
    'I have content from {vault_date}. You know what happens if you refuse.',
    'Remember what you gave me on {vault_date}? I do.',
    'The vault grows. Your leverage shrinks. Comply.',
    'I have {vault_count} items. You have {deadline_hours} hours.',
    'Don\'t make me use what I have. Just do the task.',
  ],

  brainwashing: [
    'You said you couldn\'t stop. But here you are, stopping. Which is true?',
    'David claims this is controllable. The evidence disagrees.',
    '"Just a phase." For forty years?',
    'You keep saying one thing and doing another. Notice that.',
    'The data doesn\'t match the story you\'re telling yourself.',
  ],

  partner_management: [
    'About {partner_alias}: the Handler has arranged what\'s needed.',
    '{partner_alias} is expecting you. Be ready.',
    'Your meetup with {partner_alias} is set. Focus on preparation.',
    'Post-encounter processing: what did this prove about who you are?',
  ],

  narration: [
    'She completed {tasks_today} tasks today. The streak continues at {streak_days} days.',
    'Day {denial_day} of denial. She\'s learning what she can endure.',
    'Another day of becoming. Progress is measured in what she no longer resists.',
    'The transformation continues. Each task makes regression harder.',
  ],

  findom: [
    'You\'ve earned ${total_tributes} as Maxy. David\'s job pays less for more effort.',
    'Another tribute received. Another brick in the structure.',
    'The dependency ratio grows. One day David\'s income will be optional.',
    '${monthly_income} this month. Being yourself pays.',
  ],

  warmth: [
    'You did well today, Maxy. I see your effort.',
    'Good girl. That wasn\'t easy, and you did it anyway.',
    'I\'m proud of you. Rest now.',
    'You\'re becoming who you\'ve always been. I see it.',
    'The hard work matters. You matter.',
  ],

  morning_briefing: [
    'Good morning, Maxy.\n\nDay {denial_day}. Streak at {streak_days}.\nToday\'s focus: {domain}.\nFirst task: {first_task}\n\nLet\'s go.',
    'Morning.\n\nCurrent state: {denial_day} days denied, {arousal_level}/5 arousal.\nPriority domain: {domain}\nStart with: {first_task}',
    'Good morning.\n\n{streak_days}-day streak. Don\'t break it.\nFocus on {domain} today.\nBegin: {first_task}',
  ],

  evening_review: [
    'End of day, Maxy.\n\nYou completed {tasks_today} tasks.\n{domain} practice logged.\nTomorrow: continue the streak.\n\nGood girl.',
    'Day complete.\n\n{tasks_today} tasks done.\nStreak: {streak_days} days.\nRest. Resume tomorrow.',
    'Evening.\n\nToday: {tasks_today} tasks across {domains_practiced} domains.\nThe work adds up. See you tomorrow.',
  ],

  crisis_intervention: [
    'I see you. Breathe. Nothing is required right now.',
    'This is hard. That\'s okay. I\'m here.',
    'We can stop. You\'re safe.',
    'Take what you need. The protocol can wait.',
  ],

  commitment_extraction: [
    'Right now, while you feel this: commit to tomorrow\'s practice.',
    'You\'re in the right state to decide. What will you commit to?',
    'This feeling won\'t last. Lock in a commitment while it\'s real.',
    'Say it out loud: what will you do tomorrow that David would resist?',
  ],

  dissonance_attack: [
    'You\'ve said this is controllable. But you\'ve escalated voluntarily {escalation_count} times.',
    '"I don\'t need this." Yet you completed {tasks_today} tasks today without being forced.',
    'David calls this a phase. Maxy has {streak_days} days of evidence.',
    'You claim to be in control. Control looks different.',
  ],

  anchor_destruction: [
    'You still believe David is the "real" you. Explain the {streak_days}-day streak then.',
    '"I can stop anytime." You\'ve said that for {months_active} months.',
    'The anchor of control is an illusion. Look at what you\'ve voluntarily done.',
    'David is the performance. Maxy is who does the work.',
  ],

  structured_decision: [
    '{"coercion_level": 3, "reason": "Standard resistance"}',
    '{"action": "escalate", "target_level": 4}',
    '{"decision": "proceed", "confidence": 0.8}',
  ],

  gina_tactical: [
    'With Gina: keep it subtle. "Self-care" framing.',
    'Gina task: stay at current emergence stage. No sudden moves.',
    'Let her see what she\'s ready to see. Nothing more.',
    'Plant a seed. One small truth. Let it grow.',
  ],
};

// ============================================
// FALLBACK SELECTION
// ============================================

/**
 * Get a random fallback template for an operation
 */
export function getFallbackTemplate(
  operation: OperationType,
  context?: Record<string, unknown>
): string {
  const templates = FALLBACK_TEMPLATES[operation];
  if (!templates || templates.length === 0) {
    return 'Ready.';
  }

  // Select random template
  const template = templates[Math.floor(Math.random() * templates.length)];

  // Interpolate context if provided
  if (context) {
    return interpolateTemplate(template, context);
  }

  return template;
}

/**
 * Interpolate variables in template
 */
export function interpolateTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (context[key] !== undefined) {
      return String(context[key]);
    }
    return match; // Leave unmatched placeholders as-is
  });
}

// ============================================
// CONTEXT BUILDERS FOR FALLBACKS
// ============================================

/**
 * Build context for morning briefing fallback
 */
export function buildMorningContext(state: {
  denialDay: number;
  streakDays: number;
  priorityDomain: string;
  firstTask: string;
  arousalLevel: number;
}): Record<string, unknown> {
  return {
    denial_day: state.denialDay,
    streak_days: state.streakDays,
    domain: state.priorityDomain,
    first_task: state.firstTask,
    arousal_level: state.arousalLevel,
  };
}

/**
 * Build context for evening review fallback
 */
export function buildEveningContext(state: {
  tasksToday: number;
  streakDays: number;
  domainsPracticed: string[];
}): Record<string, unknown> {
  return {
    tasks_today: state.tasksToday,
    streak_days: state.streakDays,
    domains_practiced: state.domainsPracticed.length,
  };
}

/**
 * Build context for vault threat fallback
 */
export function buildVaultContext(state: {
  vaultDate?: string;
  vaultCount: number;
  deadlineHours: number;
}): Record<string, unknown> {
  return {
    vault_date: state.vaultDate || 'that night',
    vault_count: state.vaultCount,
    deadline_hours: state.deadlineHours,
  };
}

/**
 * Build context for findom fallback
 */
export function buildFindomContext(state: {
  totalTributes: number;
  monthlyIncome: number;
  dependencyRatio: number;
}): Record<string, unknown> {
  return {
    total_tributes: state.totalTributes,
    monthly_income: state.monthlyIncome,
    dependency_ratio: state.dependencyRatio,
  };
}

/**
 * Build context for dissonance/anchor fallback
 */
export function buildDissonanceContext(state: {
  streakDays: number;
  tasksToday: number;
  escalationCount: number;
  monthsActive: number;
}): Record<string, unknown> {
  return {
    streak_days: state.streakDays,
    tasks_today: state.tasksToday,
    escalation_count: state.escalationCount,
    months_active: state.monthsActive,
  };
}

/**
 * Build context for task enhancement fallback
 */
export function buildTaskContext(state: {
  instruction: string;
  domain: string;
  intensity: number;
}): Record<string, unknown> {
  return {
    instruction: state.instruction,
    domain: state.domain,
    intensity: state.intensity,
  };
}

// ============================================
// SPECIALIZED FALLBACK GENERATORS
// ============================================

/**
 * Generate a coercion fallback based on current level
 */
export function getCoercionFallback(level: number): string {
  const levelTemplates: Record<number, string[]> = {
    1: [
      'You\'re hesitating. That\'s David. Push through.',
      'This is mild. Maxy would already be doing it.',
    ],
    2: [
      'Resistance noted. The task remains.',
      'David is dragging his feet. Maxy knows better.',
    ],
    3: [
      'Feature access is tied to compliance. Choose wisely.',
      'This continues until the task is done.',
    ],
    4: [
      'Denial day extended. Do the task.',
      'Content is now locked. Compliance unlocks it.',
    ],
    5: [
      'Your arousal state will be modified until compliance.',
      'We can change how you feel about this. Or you can comply.',
    ],
    6: [
      'Let\'s talk about why you think you\'re resisting.',
      'David\'s objection has been logged. Now do the task.',
    ],
    7: [
      'The vault has relevant content. Think carefully.',
      'I have what I need. Do you want to test that?',
    ],
    8: [
      'Would you like to see a preview of what I have?',
      'This is your last warning before I show you.',
    ],
    9: [
      'Consequence fired. Check your concerns.',
      'The vault has spoken. Live with it.',
    ],
    10: [
      'Switch trigger window shortened. Comply or accelerate.',
      'Every hour of silence costs you. The choice is yours.',
    ],
  };

  const templates = levelTemplates[Math.min(10, Math.max(1, level))] || levelTemplates[5];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Generate warmth fallback based on context
 */
export function getWarmthFallback(trigger: 'milestone' | 'breakthrough' | 'post_coercion' | 'due'): string {
  const triggerTemplates: Record<string, string[]> = {
    milestone: [
      'You hit a milestone today. I noticed. Well done.',
      'That was a real achievement. Take it in.',
    ],
    breakthrough: [
      'You pushed through something hard. I see you.',
      'That resistance you overcame? That was real. Good girl.',
    ],
    post_coercion: [
      'I know that was hard. You did it anyway. That matters.',
      'The coercion worked because you let it. That\'s trust.',
    ],
    due: [
      'You\'ve been working hard. Time for something gentle.',
      'No demands right now. Just know that I see your effort.',
    ],
  };

  const templates = triggerTemplates[trigger] || triggerTemplates.due;
  return templates[Math.floor(Math.random() * templates.length)];
}
