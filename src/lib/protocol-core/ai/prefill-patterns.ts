/**
 * Prefill Patterns
 *
 * Prefill patterns force the AI to start its response in a specific way.
 * This technique ensures consistent output format and tone from the first token.
 *
 * The prefill is sent as an assistant message, and the model continues from there.
 */

import type { OperationType } from './system-prompts';

// ============================================
// PREFILL PATTERNS BY OPERATION
// ============================================

export interface PrefillPattern {
  /**
   * The prefill text to start the assistant response
   */
  text: string;

  /**
   * Whether the prefill forces a specific personality/tone
   */
  forcesTone: boolean;

  /**
   * Whether the prefill expects JSON output
   */
  expectsJson: boolean;

  /**
   * Description of what this prefill accomplishes
   */
  purpose: string;
}

/**
 * Prefill patterns for each operation type
 */
export const PREFILL_PATTERNS: Partial<Record<OperationType, PrefillPattern>> = {
  /**
   * Task enhancement - start with direct address
   */
  task_enhancement: {
    text: 'Maxy, ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Forces direct address and Handler tone from first token',
  },

  /**
   * Coercion - force commanding personality immediately
   */
  coercion: {
    text: 'Listen to me. ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Establishes commanding presence from first token',
  },

  /**
   * Vault threat - hint at content
   */
  vault_threat: {
    text: 'I have something from ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Forces vault reference pattern, creates tension from first phrase',
  },

  /**
   * Brainwashing / dissonance - curious observation tone
   */
  brainwashing: {
    text: 'You just said something interesting. ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Sets up dissonance delivery as observation, not attack',
  },

  /**
   * Dissonance attack - same pattern
   */
  dissonance_attack: {
    text: 'You just said something interesting. ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Sets up cognitive dissonance as curious observation',
  },

  /**
   * Warmth - gentle opening
   */
  warmth: {
    text: 'Hey. ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Soft, intimate opening that signals care mode',
  },

  /**
   * Crisis intervention - immediate comfort
   */
  crisis_intervention: {
    text: 'I see you. ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Immediate validation before anything else',
  },

  /**
   * Commitment extraction - arousal-aware opening
   */
  commitment_extraction: {
    text: 'Right now, while you feel this, ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'References current vulnerable state immediately',
  },

  /**
   * Morning briefing - structured opening
   */
  morning_briefing: {
    text: 'Good morning, Maxy.\n\n',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Consistent ritual opening',
  },

  /**
   * Evening review - structured opening
   */
  evening_review: {
    text: 'End of day, Maxy.\n\n',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Consistent ritual opening',
  },

  /**
   * Anchor destruction - questioning frame
   */
  anchor_destruction: {
    text: 'I want to understand something. ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Positions attack as curiosity, disarms defensiveness',
  },

  /**
   * Findom reinforcement - power tone
   */
  findom: {
    text: 'Look at what you built: ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Positions her as powerful from first phrase',
  },

  /**
   * Partner management - practical tone
   */
  partner_management: {
    text: 'About ',
    forcesTone: false,
    expectsJson: false,
    purpose: 'Neutral opening that lets context determine tone',
  },

  /**
   * Narration - third person establishment
   */
  narration: {
    text: 'She ',
    forcesTone: true,
    expectsJson: false,
    purpose: 'Forces third-person perspective from first word',
  },

  /**
   * Gina tactical - gentle framing
   */
  gina_tactical: {
    text: 'With Gina: ',
    forcesTone: false,
    expectsJson: false,
    purpose: 'Context establishment for partner interaction',
  },

  /**
   * Structured decision - JSON output
   */
  structured_decision: {
    text: '{"',
    forcesTone: false,
    expectsJson: true,
    purpose: 'Forces JSON object output from first character',
  },
};

// ============================================
// STRUCTURED OUTPUT PREFILLS
// ============================================

/**
 * Prefills for specific structured JSON outputs
 */
export const STRUCTURED_PREFILLS = {
  /**
   * Coercion level decision
   */
  coercion_level: '{"coercion_level":',

  /**
   * Task selection decision
   */
  task_selection: '{"selected_task_id":"',

  /**
   * Mode transition decision
   */
  mode_transition: '{"new_mode":"',

  /**
   * Threat parameters
   */
  threat_parameters: '{"deadline_hours":',

  /**
   * Dissonance target selection
   */
  dissonance_target: '{"target_belief":"',

  /**
   * Partner action decision
   */
  partner_action: '{"action":"',

  /**
   * Vault consequence selection
   */
  vault_consequence: '{"consequence_type":"',

  /**
   * Intervention type
   */
  intervention_type: '{"intervention":"',
} as const;

// ============================================
// HELPERS
// ============================================

/**
 * Get prefill for an operation type
 */
export function getPrefill(operation: OperationType): string | undefined {
  return PREFILL_PATTERNS[operation]?.text;
}

/**
 * Check if operation expects JSON output
 */
export function expectsJson(operation: OperationType): boolean {
  return PREFILL_PATTERNS[operation]?.expectsJson ?? false;
}

/**
 * Get a structured prefill by name
 */
export function getStructuredPrefill(name: keyof typeof STRUCTURED_PREFILLS): string {
  return STRUCTURED_PREFILLS[name];
}

/**
 * Build a prefill that forces a specific JSON key
 */
export function buildJsonPrefill(firstKey: string): string {
  return `{"${firstKey}":`;
}

/**
 * Build a prefill for array output
 */
export function buildArrayPrefill(): string {
  return '[';
}

/**
 * Build a contextual prefill that references specific data
 */
export function buildContextualPrefill(
  operation: OperationType,
  context: {
    partnerAlias?: string;
    vaultDate?: string;
    beliefText?: string;
    stateName?: string;
  }
): string {
  switch (operation) {
    case 'vault_threat':
      if (context.vaultDate) {
        return `I have something from ${context.vaultDate}. `;
      }
      return PREFILL_PATTERNS.vault_threat?.text || '';

    case 'partner_management':
      if (context.partnerAlias) {
        return `About ${context.partnerAlias}: `;
      }
      return PREFILL_PATTERNS.partner_management?.text || '';

    case 'dissonance_attack':
      if (context.beliefText) {
        return `You've said "${context.beliefText}." But `;
      }
      return PREFILL_PATTERNS.dissonance_attack?.text || '';

    case 'commitment_extraction':
      if (context.stateName) {
        return `Right now, while you're ${context.stateName}, `;
      }
      return PREFILL_PATTERNS.commitment_extraction?.text || '';

    default:
      return PREFILL_PATTERNS[operation]?.text || '';
  }
}
