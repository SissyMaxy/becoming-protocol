/**
 * Strategic Multi-Day Protocol Manager (P11.4)
 *
 * Creates and manages multi-day protocols: structured step sequences
 * with conditions to advance. Pre-built templates for common situations
 * (post-regression recovery, encounter prep, escalation, social exposure).
 *
 * Table: handler_protocols (migration 156)
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type ProtocolType = 'recovery' | 'encounter_prep' | 'escalation' | 'social_exposure' | 'custom';
export type ProtocolStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export interface ProtocolStepInput {
  description: string;
  conditions_to_advance: string;
  estimated_days: number;
}

export interface ProtocolInput {
  name: string;
  type: ProtocolType;
  steps: ProtocolStepInput[];
}

export interface ProtocolStepHistory {
  step_index: number;
  started_at: string;
  completed_at: string | null;
  days_at_step: number;
  notes: string | null;
}

export interface Protocol {
  id: string;
  userId: string;
  name: string;
  type: ProtocolType;
  status: ProtocolStatus;
  steps: ProtocolStepInput[];
  currentStep: number;
  stepHistory: ProtocolStepHistory[];
  stepStartedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AdvancementEvaluation {
  shouldAdvance: boolean;
  currentStep: number;
  totalSteps: number;
  stepDescription: string;
  condition: string;
  reason: string;
}

// ============================================
// PROTOCOL TEMPLATES
// ============================================

interface ProtocolTemplateStep {
  description: string;
  conditions: string;
  days: number;
}

interface ProtocolTemplate {
  type: ProtocolType;
  steps: ProtocolTemplateStep[];
}

const PROTOCOL_TEMPLATES: Record<string, ProtocolTemplate> = {
  post_regression_recovery: {
    type: 'recovery',
    steps: [
      { description: 'Acknowledge the regression without shame. Gentle mode.', conditions: 'Maxy responds without defensiveness', days: 1 },
      { description: 'Reintroduce light identity tasks. Voice practice, journal.', conditions: 'Completes at least 1 task', days: 2 },
      { description: 'Reference evidence of who she really is. Photo timeline, journal quotes.', conditions: 'Engagement returns to baseline', days: 1 },
      { description: 'Introduce new commitment at current ladder level.', conditions: 'Accepts commitment', days: 1 },
      { description: 'Full protocol resumed. Reference how quickly she came back.', conditions: '2 consecutive days at >70% compliance', days: 2 },
    ],
  },
  first_encounter_prep: {
    type: 'encounter_prep',
    steps: [
      { description: 'Discuss the prospect. Build excitement, address fears.', conditions: 'Maxy expresses willingness', days: 1 },
      { description: 'Voice practice drill focused on sustained conversation.', conditions: '10 min at target pitch', days: 2 },
      { description: 'Outfit selection and practice. Photo verification.', conditions: 'Photo submitted and approved', days: 1 },
      { description: 'Full rehearsal: voice + outfit + movement. Handler evaluates.', conditions: 'Handler approval', days: 1 },
      { description: 'Day of. Morning confidence conditioning. Evening debrief after.', conditions: 'Encounter completed', days: 1 },
    ],
  },
  escalation_sequence: {
    type: 'escalation',
    steps: [
      { description: 'Baseline assessment. Current compliance, skill levels, comfort zones.', conditions: 'Assessment complete', days: 1 },
      { description: 'Push one skill domain one level beyond comfort. Handler provides maximum support.', conditions: 'Attempt made', days: 2 },
      { description: 'Consolidate the push. Repeat until comfortable.', conditions: 'Comfortable at new level', days: 3 },
      { description: 'Push next domain. Compound the momentum.', conditions: 'Second domain advanced', days: 2 },
      { description: 'Integration. Both domains at new level simultaneously.', conditions: 'Sustained for 3 days', days: 3 },
    ],
  },
  social_exposure_ladder: {
    type: 'social_exposure',
    steps: [
      { description: 'Online text interaction as Maxy with a stranger.', conditions: 'Conversation completed', days: 1 },
      { description: 'Share a photo publicly as Maxy.', conditions: 'Photo posted', days: 2 },
      { description: 'Voice call or video with someone who knows Maxy.', conditions: 'Call completed', days: 3 },
      { description: 'In-person interaction in stealth feminine presentation.', conditions: 'Interaction completed', days: 3 },
      { description: 'Full presentation in public setting. Coffee shop, store, event.', conditions: 'Outing completed with photo evidence', days: 5 },
    ],
  },
};

export const TEMPLATE_NAMES = Object.keys(PROTOCOL_TEMPLATES);

// ============================================
// CREATE PROTOCOL
// ============================================

/**
 * Create a multi-day protocol from input or template name.
 * Only one protocol can be active at a time — existing active protocols are paused.
 */
export async function createProtocol(
  userId: string,
  input: ProtocolInput | string,
): Promise<string | null> {
  try {
    let name: string;
    let type: ProtocolType;
    let steps: ProtocolStepInput[];

    if (typeof input === 'string') {
      // Template name
      const template = PROTOCOL_TEMPLATES[input];
      if (!template) return null;

      name = input.replace(/_/g, ' ');
      type = template.type;
      steps = template.steps.map(s => ({
        description: s.description,
        conditions_to_advance: s.conditions,
        estimated_days: s.days,
      }));
    } else {
      name = input.name;
      type = input.type;
      steps = input.steps;
    }

    // Pause any existing active protocols
    await supabase
      .from('handler_protocols')
      .update({ status: 'paused' })
      .eq('user_id', userId)
      .eq('status', 'active');

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('handler_protocols')
      .insert({
        user_id: userId,
        name,
        protocol_type: type,
        status: 'active',
        steps,
        current_step: 0,
        step_history: [],
        step_started_at: now,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[protocol-manager] createProtocol error:', error.message);
      return null;
    }

    return data.id;
  } catch {
    return null;
  }
}

// ============================================
// GET ACTIVE PROTOCOL
// ============================================

export async function getActiveProtocol(userId: string): Promise<Protocol | null> {
  try {
    const { data, error } = await supabase
      .from('handler_protocols')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return mapRow(data);
  } catch {
    return null;
  }
}

// ============================================
// ADVANCE PROTOCOL
// ============================================

/**
 * Move to the next step. Stores current step in step_history.
 * If already at last step, marks protocol as completed.
 */
export async function advanceProtocol(
  userId: string,
  protocolId: string,
): Promise<{ advanced: boolean; completed: boolean }> {
  try {
    const { data, error } = await supabase
      .from('handler_protocols')
      .select('*')
      .eq('id', protocolId)
      .eq('user_id', userId)
      .single();

    if (error || !data) return { advanced: false, completed: false };

    const steps = (data.steps as ProtocolStepInput[]) || [];
    const currentStep: number = data.current_step ?? 0;
    const stepHistory: ProtocolStepHistory[] = data.step_history || [];
    const now = new Date().toISOString();

    // Record completion of current step
    const stepStartedAt = data.step_started_at || data.created_at;
    const daysAtStep = Math.max(
      1,
      Math.ceil((Date.now() - new Date(stepStartedAt).getTime()) / 86400000),
    );

    stepHistory.push({
      step_index: currentStep,
      started_at: stepStartedAt,
      completed_at: now,
      days_at_step: daysAtStep,
      notes: null,
    });

    const nextStep = currentStep + 1;
    const isComplete = nextStep >= steps.length;

    if (isComplete) {
      await supabase
        .from('handler_protocols')
        .update({
          status: 'completed',
          current_step: currentStep,
          step_history: stepHistory,
          completed_at: now,
        })
        .eq('id', protocolId);

      return { advanced: true, completed: true };
    }

    await supabase
      .from('handler_protocols')
      .update({
        current_step: nextStep,
        step_history: stepHistory,
        step_started_at: now,
      })
      .eq('id', protocolId);

    return { advanced: true, completed: false };
  } catch {
    return { advanced: false, completed: false };
  }
}

// ============================================
// EVALUATE ADVANCEMENT
// ============================================

/**
 * Check if current step's conditions are met.
 * Uses heuristics based on protocol type and step conditions text.
 * Returns evaluation with reason.
 */
export async function evaluateProtocolAdvancement(
  userId: string,
): Promise<AdvancementEvaluation | null> {
  try {
    const protocol = await getActiveProtocol(userId);
    if (!protocol) return null;

    const steps = protocol.steps;
    if (protocol.currentStep >= steps.length) return null;

    const currentStepDef = steps[protocol.currentStep];
    const condition = currentStepDef.conditions_to_advance;
    const estimatedDays = currentStepDef.estimated_days;

    // Calculate days at current step
    const stepStart = protocol.stepStartedAt || protocol.createdAt;
    const daysAtStep = Math.max(
      0,
      Math.ceil((Date.now() - new Date(stepStart).getTime()) / 86400000),
    );

    // Pull data for heuristic evaluation
    const [complianceResult, classificationResult, taskResult] = await Promise.allSettled([
      supabase
        .from('user_state')
        .select('compliance_rate, tasks_completed_today, denial_day')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('conversation_classifications')
        .select('resistance_level, mood_detected')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('handler_messages')
        .select('content')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const state = complianceResult.status === 'fulfilled' ? complianceResult.value.data : null;
    const classifications = classificationResult.status === 'fulfilled' ? classificationResult.value.data : [];
    const recentMessages = taskResult.status === 'fulfilled' ? taskResult.value.data : [];

    // Heuristic conditions checking
    let shouldAdvance = false;
    let reason = '';

    const condLower = condition.toLowerCase();
    const compliance = state?.compliance_rate ?? 0;
    const avgResistance = classifications && classifications.length > 0
      ? classifications.reduce((sum: number, c: { resistance_level: number | null }) => sum + (c.resistance_level ?? 5), 0) / classifications.length
      : 5;

    // Check condition patterns
    if (condLower.includes('compliance') && condLower.includes('70')) {
      shouldAdvance = compliance >= 70 && daysAtStep >= 2;
      reason = shouldAdvance
        ? `Compliance at ${compliance}% for ${daysAtStep} days (target: >70% for 2 days)`
        : `Compliance at ${compliance}% for ${daysAtStep} days — need >70% for 2+ days`;
    } else if (condLower.includes('without defensiveness') || condLower.includes('responds without')) {
      shouldAdvance = avgResistance < 4 && daysAtStep >= 1;
      reason = shouldAdvance
        ? `Avg resistance ${avgResistance.toFixed(1)}/10 — defensiveness low`
        : `Avg resistance ${avgResistance.toFixed(1)}/10 — still defensive`;
    } else if (condLower.includes('engagement returns') || condLower.includes('baseline')) {
      shouldAdvance = compliance >= 60 && avgResistance < 5;
      reason = shouldAdvance
        ? `Engagement: compliance ${compliance}%, resistance ${avgResistance.toFixed(1)} — baseline recovered`
        : `Compliance ${compliance}%, resistance ${avgResistance.toFixed(1)} — not at baseline yet`;
    } else if (condLower.includes('completes') && condLower.includes('task')) {
      const tasksToday = state?.tasks_completed_today ?? 0;
      shouldAdvance = tasksToday >= 1;
      reason = shouldAdvance
        ? `${tasksToday} tasks completed today`
        : `No tasks completed today yet`;
    } else if (condLower.includes('accepts commitment') || condLower.includes('expresses willingness')) {
      // Check if recent messages contain acceptance language
      const acceptanceTerms = ['yes', 'okay', 'i will', "i'll", 'ready', 'want to', 'let\'s'];
      const recentText = (recentMessages || []).map((m: { content: string }) => m.content.toLowerCase()).join(' ');
      shouldAdvance = acceptanceTerms.some(term => recentText.includes(term)) && daysAtStep >= 1;
      reason = shouldAdvance
        ? `Recent messages indicate acceptance/willingness`
        : `No clear acceptance signal in recent messages`;
    } else if (condLower.includes('assessment complete') || condLower.includes('attempt made')) {
      // Time-based: just need minimum days
      shouldAdvance = daysAtStep >= estimatedDays;
      reason = shouldAdvance
        ? `${daysAtStep} days elapsed (estimated: ${estimatedDays})`
        : `${daysAtStep}/${estimatedDays} days elapsed`;
    } else {
      // Default: advance if estimated days have passed and compliance is reasonable
      shouldAdvance = daysAtStep >= estimatedDays && compliance >= 50;
      reason = shouldAdvance
        ? `${daysAtStep} days at step (est. ${estimatedDays}), compliance ${compliance}%`
        : `${daysAtStep}/${estimatedDays} days, compliance ${compliance}% — waiting`;
    }

    return {
      shouldAdvance,
      currentStep: protocol.currentStep,
      totalSteps: steps.length,
      stepDescription: currentStepDef.description,
      condition,
      reason,
    };
  } catch {
    return null;
  }
}

// ============================================
// BUILD PROTOCOL CONTEXT (for Handler prompt)
// ============================================

export async function buildProtocolContext(userId: string): Promise<string> {
  try {
    const protocol = await getActiveProtocol(userId);
    if (!protocol) return '';

    const steps = protocol.steps;
    if (protocol.currentStep >= steps.length) return '';

    const currentStepDef = steps[protocol.currentStep];
    const stepStart = protocol.stepStartedAt || protocol.createdAt;
    const daysAtStep = Math.max(
      1,
      Math.ceil((Date.now() - new Date(stepStart).getTime()) / 86400000),
    );

    // Evaluate advancement
    const evaluation = await evaluateProtocolAdvancement(userId);

    const parts: string[] = [
      `ACTIVE PROTOCOL: ${protocol.name}, Step ${protocol.currentStep + 1}/${steps.length}: '${currentStepDef.description}'`,
      `  Day ${daysAtStep} at this step (estimated: ${currentStepDef.estimated_days}d). Condition to advance: '${currentStepDef.conditions_to_advance}'.`,
    ];

    if (evaluation) {
      parts.push(`  Advancement: ${evaluation.shouldAdvance ? 'READY' : 'NOT YET'} — ${evaluation.reason}`);
    }

    // Show completed steps count
    const completedSteps = protocol.stepHistory.length;
    if (completedSteps > 0) {
      const totalDays = protocol.stepHistory.reduce((sum, h) => sum + h.days_at_step, 0);
      parts.push(`  Progress: ${completedSteps} steps completed in ${totalDays} days`);
    }

    // Show next step preview
    const nextStepIndex = protocol.currentStep + 1;
    if (nextStepIndex < steps.length) {
      parts.push(`  Next step: '${steps[nextStepIndex].description}'`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

function mapRow(row: Record<string, unknown>): Protocol {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    type: row.protocol_type as ProtocolType,
    status: row.status as ProtocolStatus,
    steps: (row.steps as ProtocolStepInput[]) || [],
    currentStep: (row.current_step as number) ?? 0,
    stepHistory: (row.step_history as ProtocolStepHistory[]) || [],
    stepStartedAt: (row.step_started_at as string) || null,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string) || null,
  };
}
