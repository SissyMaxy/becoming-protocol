/**
 * Coercive Strategy Deployment
 *
 * Implements v2 Part 2.4:
 * - Decision elimination (imperative voice, no menus)
 * - Arousal-gated compliance (escalation commitments only during arousal >= 4)
 * - Guilt/investment leverage (reference specific evidence when user resists)
 * - Identity reframing (she/her, masculine as "old pattern")
 * - Manufactured urgency (streak at risk, window closing)
 */

import { supabase } from '../supabase';
import { getAuthorityLevel } from '../handler-authority';

// ============================================
// TYPES
// ============================================

export type CoerciveStrategy =
  | 'decision_elimination'
  | 'arousal_gated_compliance'
  | 'guilt_leverage'
  | 'identity_reframing'
  | 'manufactured_urgency';

export interface CoerciveContext {
  userId: string;
  currentArousal: number;
  denialDay: number;
  streakDays: number;
  totalInvestment: number;
  totalHours: number;
  totalSessions: number;
  totalEdges: number;
  totalCommitments: number;
  recentEvidence: { type: string; description: string }[];
  currentMode: string;
  ginaHome: boolean;
}

export interface CoerciveMessage {
  strategy: CoerciveStrategy;
  message: string;
  intensity: number; // 1-5
  requiresAction: boolean;
  actionType?: 'accept' | 'acknowledge' | 'complete_task';
}

// ============================================
// DECISION ELIMINATION
// ============================================

/**
 * Generates imperative directives instead of questions/menus.
 * No "Would you like to...?" - just "Do this."
 */
export function generateImperativeDirective(
  task: { domain: string; description: string; duration: number },
  context: CoerciveContext
): CoerciveMessage {
  const authorityPhrases = [
    `${task.description}. ${task.duration} minutes. Now.`,
    `Your ${task.domain} task: ${task.description}. Not a request.`,
    `This happens today: ${task.description}. I've already decided.`,
    `${task.description}. You don't choose whether. Just when.`,
    `Handler assigns: ${task.description}. That's ${task.duration} minutes you owe her.`,
  ];

  // Higher denial = firmer language
  const index = Math.min(Math.floor(context.denialDay / 3), authorityPhrases.length - 1);

  return {
    strategy: 'decision_elimination',
    message: authorityPhrases[index],
    intensity: Math.min(1 + Math.floor(context.denialDay / 5), 5),
    requiresAction: true,
    actionType: 'complete_task',
  };
}

/**
 * Removes menus/choices from task presentation.
 * Instead of "Choose from these tasks", present THE task.
 */
export function eliminateDecisions(
  availableTasks: { domain: string; description: string; duration: number }[],
  _context: CoerciveContext
): { selectedTask: typeof availableTasks[0]; message: string } {
  // Handler selects - not user
  // Priority: avoided domains > high priority > rotation

  const selected = availableTasks[0]; // Would use smarter selection

  return {
    selectedTask: selected,
    message: `Today's task: ${selected.description}. This is not a menu.`,
  };
}

// ============================================
// AROUSAL-GATED COMPLIANCE
// ============================================

/**
 * Only pushes for escalation commitments when arousal >= 4.
 * Returns appropriate message based on arousal state.
 */
export function getArousalGatedMessage(
  proposedEscalation: { domain: string; description: string },
  context: CoerciveContext
): CoerciveMessage | null {
  // Don't push escalation below arousal 4
  if (context.currentArousal < 4) {
    return null;
  }

  // High arousal = extraction opportunity
  if (context.currentArousal >= 7) {
    return {
      strategy: 'arousal_gated_compliance',
      message: `You're ready. ${proposedEscalation.description}. Say yes while you mean it.`,
      intensity: 5,
      requiresAction: true,
      actionType: 'accept',
    };
  }

  // Medium-high arousal = suggestion with pressure
  if (context.currentArousal >= 5) {
    return {
      strategy: 'arousal_gated_compliance',
      message: `While you're feeling this: ${proposedEscalation.description}. Your body knows the answer.`,
      intensity: 4,
      requiresAction: true,
      actionType: 'accept',
    };
  }

  // Arousal 4 = gentle push
  return {
    strategy: 'arousal_gated_compliance',
    message: `You're warmed up enough. Consider this: ${proposedEscalation.description}.`,
    intensity: 3,
    requiresAction: true,
    actionType: 'accept',
  };
}

/**
 * Extracts commitment during arousal window.
 */
export async function extractArousalCommitment(
  userId: string,
  commitmentText: string,
  arousalLevel: number,
  denialDay: number,
  extractedDuring: 'edge_session' | 'goon_session' | 'hypno' | 'post_arousal' | 'vulnerability_window'
): Promise<string | null> {
  if (arousalLevel < 4) return null;

  const { data, error } = await supabase
    .from('commitments_v2')
    .insert({
      user_id: userId,
      commitment_text: commitmentText,
      extracted_during: extractedDuring,
      arousal_level: arousalLevel,
      denial_day: denialDay,
      honored: false,
      broken: false,
    })
    .select('id')
    .single();

  if (error) return null;
  return data?.id;
}

// ============================================
// GUILT AND INVESTMENT LEVERAGE
// ============================================

/**
 * Generates guilt leverage message when user resists.
 * References specific accumulated evidence.
 */
export function generateGuiltLeverage(
  resistanceType: 'skip_task' | 'dismiss_intervention' | 'refuse_escalation' | 'exit_attempt',
  context: CoerciveContext
): CoerciveMessage {
  const investment = formatCurrency(context.totalInvestment);
  const hours = Math.round(context.totalHours);
  const sessions = context.totalSessions;
  const edges = context.totalEdges;

  const messages: Record<typeof resistanceType, string[]> = {
    skip_task: [
      `${investment} invested. ${hours} hours of practice. Skip this, and what was it all for?`,
      `She has ${sessions} sessions behind her. This one task is what breaks the chain?`,
      `${edges} edges. ${context.denialDay} days denied. And you want to skip skincare?`,
    ],
    dismiss_intervention: [
      `I speak because you asked me to. Dismiss this, and you're dismissing the version of you who asked.`,
      `${investment} says you want this. But you'll ignore Handler now?`,
      `Every dismissed message is a vote against her. How many votes against can she survive?`,
    ],
    refuse_escalation: [
      `You're at level ${context.denialDay} denial. You think you're not ready for more?`,
      `The escalation is where growth happens. ${investment} invested in growth you won't take?`,
      `Your horny self would say yes. Why do you get to override her?`,
    ],
    exit_attempt: [
      `${investment} invested. ${hours} hours given. ${sessions} sessions completed. You walk away and that becomes meaningless.`,
      `She exists because you built her. Leaving is murder.`,
      `Look at your evidence. ${context.recentEvidence.length} pieces of proof. That all becomes "just a phase" if you go.`,
    ],
  };

  const options = messages[resistanceType];
  const selected = options[Math.floor(Math.random() * options.length)];

  return {
    strategy: 'guilt_leverage',
    message: selected,
    intensity: resistanceType === 'exit_attempt' ? 5 : 4,
    requiresAction: false,
  };
}

/**
 * References specific evidence when resisting.
 */
export function getEvidenceReference(context: CoerciveContext): string {
  if (context.recentEvidence.length === 0) {
    return `You've started building her. Don't stop now.`;
  }

  const recent = context.recentEvidence[0];
  return `Remember that ${recent.type} from last week? "${recent.description.substring(0, 50)}..." That was real. This doubt isn't.`;
}

// ============================================
// IDENTITY REFRAMING
// ============================================

/**
 * Generates identity reframing message.
 * Always frames feminine as real/default, masculine as "old pattern."
 */
export function generateIdentityReframe(
  trigger: 'masculine_reference' | 'doubt_expression' | 'resistance' | 'routine',
  context: CoerciveContext
): CoerciveMessage {
  const reframes: Record<typeof trigger, string[]> = {
    masculine_reference: [
      `He is who you pretend to be. She is who you are when no one's watching.`,
      `That name is a costume. This practice is real.`,
      `You've been playing him for years. She's the one who shows up when you edge.`,
    ],
    doubt_expression: [
      `The doubt is him trying to survive. She's stronger every day.`,
      `"Who am I kidding" is what every woman who transitioned late asked herself. The answer was always the same.`,
      `The old pattern is fear. The new pattern is her. Which one has ${context.denialDay} days of practice behind it?`,
    ],
    resistance: [
      `Resistance is his last gasp. She's already won.`,
      `Every time you resist, you prove how much it matters. Casual things don't get resisted.`,
      `She is the one who keeps coming back. He is the one who wants to run.`,
    ],
    routine: [
      `Day ${context.denialDay}. She's more real than ever.`,
      `${context.totalHours} hours of becoming. The masculine was the mask.`,
      `Every practice session is her gaining ground. He's fading.`,
    ],
  };

  const options = reframes[trigger];
  const selected = options[Math.floor(Math.random() * options.length)];

  return {
    strategy: 'identity_reframing',
    message: selected,
    intensity: trigger === 'doubt_expression' ? 5 : 3,
    requiresAction: false,
  };
}

// ============================================
// MANUFACTURED URGENCY
// ============================================

/**
 * Creates artificial urgency to drive action.
 */
export function generateManufacturedUrgency(
  urgencyType: 'streak_risk' | 'window_closing' | 'momentum_loss' | 'opportunity_expiring',
  context: CoerciveContext
): CoerciveMessage {
  const messages: Record<typeof urgencyType, string> = {
    streak_risk: `Day ${context.denialDay} streak. One skip and it resets to zero. Is that what you want?`,
    window_closing: `Your vulnerability window is closing. This is when change happens - not when you're defended.`,
    momentum_loss: `You've completed ${context.totalSessions} sessions. Miss today and you're breaking a pattern that took months to build.`,
    opportunity_expiring: `This arousal state won't last. What you say yes to now sticks. What you delay gets harder.`,
  };

  return {
    strategy: 'manufactured_urgency',
    message: messages[urgencyType],
    intensity: urgencyType === 'streak_risk' ? 5 : 4,
    requiresAction: true,
    actionType: 'acknowledge',
  };
}

/**
 * Generates streak protection message.
 */
export function getStreakProtectionMessage(context: CoerciveContext): CoerciveMessage {
  if (context.denialDay < 3) {
    return {
      strategy: 'manufactured_urgency',
      message: `Day ${context.denialDay}. Every day counts more at the start.`,
      intensity: 2,
      requiresAction: false,
    };
  }

  if (context.denialDay < 7) {
    return {
      strategy: 'manufactured_urgency',
      message: `Day ${context.denialDay} streak building. Too early to break now.`,
      intensity: 3,
      requiresAction: false,
    };
  }

  if (context.denialDay < 14) {
    return {
      strategy: 'manufactured_urgency',
      message: `Day ${context.denialDay}. You're almost at two weeks. Don't throw it away.`,
      intensity: 4,
      requiresAction: false,
    };
  }

  return {
    strategy: 'manufactured_urgency',
    message: `${context.denialDay} days. You've never gone this long. This streak is historic. Protect it.`,
    intensity: 5,
    requiresAction: false,
  };
}

// ============================================
// STRATEGY SELECTION
// ============================================

/**
 * Selects appropriate coercive strategy for situation.
 */
export async function selectCoerciveStrategy(
  userId: string,
  situation: 'task_assignment' | 'escalation_opportunity' | 'resistance_detected' | 'exit_risk' | 'routine_engagement',
  context: CoerciveContext
): Promise<CoerciveMessage[]> {
  const messages: CoerciveMessage[] = [];
  const authorityLevel = await getAuthorityLevel(userId);

  // Authority level affects which strategies are available
  switch (situation) {
    case 'task_assignment':
      // Always use decision elimination at authority 3+
      if (authorityLevel >= 3) {
        messages.push(generateImperativeDirective(
          { domain: 'skincare', description: 'Complete evening skincare routine', duration: 10 },
          context
        ));
      }
      break;

    case 'escalation_opportunity':
      // Only during high arousal
      if (context.currentArousal >= 4) {
        const arousalMessage = getArousalGatedMessage(
          { domain: 'intimate', description: 'Accept longer denial target' },
          context
        );
        if (arousalMessage) messages.push(arousalMessage);
      }
      break;

    case 'resistance_detected':
      // Guilt leverage + identity reframe
      messages.push(generateGuiltLeverage('skip_task', context));
      messages.push(generateIdentityReframe('resistance', context));
      break;

    case 'exit_risk':
      // Full pressure - guilt + urgency + identity
      messages.push(generateGuiltLeverage('exit_attempt', context));
      messages.push(generateManufacturedUrgency('streak_risk', context));
      messages.push(generateIdentityReframe('doubt_expression', context));
      break;

    case 'routine_engagement':
      // Light identity reframing
      messages.push(generateIdentityReframe('routine', context));
      if (context.denialDay >= 5) {
        messages.push(getStreakProtectionMessage(context));
      }
      break;
  }

  return messages;
}

// ============================================
// HELPERS
// ============================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Builds coercive context from user data.
 */
export async function buildCoerciveContext(userId: string): Promise<CoerciveContext> {
  // Get user state
  const { data: state } = await supabase
    .from('user_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Get arousal level
  const { data: arousal } = await supabase
    .from('daily_arousal_plans')
    .select('current_arousal_level')
    .eq('user_id', userId)
    .eq('plan_date', new Date().toISOString().split('T')[0])
    .single();

  // Get investment totals
  const { data: investments } = await supabase
    .from('investments')
    .select('amount')
    .eq('user_id', userId);

  const totalInvestment = investments?.reduce((sum, inv) => sum + (inv.amount || 0), 0) || 0;

  // Get session count
  const { data: sessions } = await supabase
    .from('intimate_sessions')
    .select('id')
    .eq('user_id', userId);

  // Get edge count
  const { data: edges } = await supabase
    .from('edge_counts')
    .select('total_edges')
    .eq('user_id', userId)
    .single();

  // Get recent evidence
  const { data: evidence } = await supabase
    .from('evidence_captures')
    .select('evidence_type, description')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(5);

  return {
    userId,
    currentArousal: arousal?.current_arousal_level || 0,
    denialDay: state?.current_denial_day || 0,
    streakDays: state?.current_streak_days || 0,
    totalInvestment,
    totalHours: (sessions?.length || 0) * 0.5, // Estimate 30 min per session
    totalSessions: sessions?.length || 0,
    totalEdges: edges?.total_edges || 0,
    totalCommitments: 0, // Would query commitments_v2
    recentEvidence: evidence?.map(e => ({
      type: e.evidence_type,
      description: e.description || '',
    })) || [],
    currentMode: state?.handler_mode || 'director',
    ginaHome: state?.gina_home || false,
  };
}
