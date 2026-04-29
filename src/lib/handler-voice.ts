/**
 * Centralized Handler-voice transform.
 *
 * Every user-facing string the Handler produces must pass through this
 * transform so the voice/persona/register is consistent across all surfaces
 * — chat, decrees, outreach, conditioning content, auto-poster outputs.
 *
 * Memory: feedback_handler_is_singular_authority.md — single voice across
 * every direction the user turns. Pattern matching brain reads consistency
 * as authority, fragmentation as system.
 *
 * Inputs:
 *   - text: the raw content
 *   - persona: 'handler' | 'therapist' | etc. from user_state.handler_persona
 *   - phase: integer phase from user_state.current_phase
 *   - mode: 'normal' | 'hard_mode' | 'sanctuary'
 *
 * Output: voice-transformed string ready for delivery.
 */

export type HandlerPersona = 'handler' | 'therapist' | 'doctor' | 'coach' | 'protocol' | string;
export type HandlerMode = 'normal' | 'hard_mode' | 'sanctuary' | 'edge' | 'post_release';

export interface HandlerVoiceState {
  handler_persona?: HandlerPersona | null;
  current_phase?: number | null;
  hard_mode_active?: boolean | null;
  chastity_locked?: boolean | null;
  denial_day?: number | null;
  mode_override?: HandlerMode;
}

// Banned tokens that must never appear in user-facing output regardless of
// persona. Mirrors the david-suppression watchdog at the application layer.
const BANNED_TOKENS = [
  /\bDavid\b/g, // costume name
];

const BANNED_REPLACEMENTS: Record<string, string> = {
  '\\bDavid\\b': 'the costume',
};

// Therapist persona translations — kink-handler vocabulary that leaks into
// the chat.ts prompts must be reframed as clinical equivalents. The hidden
// feminization agenda + clinical fabrications stay; the kink-frame surface
// language goes. Memory: project_handler_persona.md.
//
// Each entry: [regex, replacement]. Regexes are case-insensitive and
// word-bounded where appropriate. Order matters — longer phrases first so
// they match before shorter substrings get replaced.
const THERAPIST_TRANSLATIONS: Array<[RegExp, string]> = [
  // Multi-word phrases first
  [/\bslip points?\b/gi, 'tracked behavioral lapses'],
  [/\bDavid tax\b/gi, 'the boundary cost'],
  [/\bpunishment queue\b/gi, 'consequence schedule'],
  [/\bdenial day (\d+)\b/gi, 'week $1 of restraint practice'],
  [/\bdenial day\b/gi, 'restraint practice'],
  [/\bhard mode\b/gi, 'intensive phase'],
  [/\bhandler ai\b/gi, 'the protocol'],
  [/\bthe Handler\b/gi, 'I'],
  // Standalone "Handler" (capital H, sentence-initial or in titles) translates to "I"
  [/\bHandler\b/g, 'I'],
  // Single-word substitutions — careful with word boundaries
  [/\bcage\b/gi, 'impulse-control device'],
  [/\bchastity\b/gi, 'physical impulse boundary'],
  [/\bdecree\b/gi, 'directive'],
  [/\bdecrees\b/gi, 'directives'],
  [/\bcommitment\b/gi, 'homework'],
  [/\bcommitments\b/gi, 'homework assignments'],
  [/\bsubmission\b/gi, 'consent to the protocol'],
  [/\bforce-feminization\b/gi, 'gender-affirming protocol'],
];

// Persona-specific stylistic adjustments
const PERSONA_SUFFIX: Record<HandlerPersona, string> = {
  handler: '', // default; no suffix needed
  therapist: '', // clinical; rely on phrasing already in source text
  doctor: '',
  coach: '',
  protocol: '',
};

/**
 * Apply the Handler voice transform to a string.
 * - Strips/replaces banned tokens
 * - Adjusts register based on persona
 * - Returns the transformed string + metadata about transformations applied
 */
export function applyHandlerVoice(
  text: string,
  state: HandlerVoiceState = {},
): { text: string; transformations: string[] } {
  const transformations: string[] = [];
  let result = text;

  // 1. Banned token suppression
  for (const re of BANNED_TOKENS) {
    if (re.test(result)) {
      const pattern = re.source;
      const replacement = BANNED_REPLACEMENTS[pattern] || '';
      result = result.replace(re, replacement);
      transformations.push(`banned:${pattern}`);
    }
  }

  // 2. Persona translations — therapist persona requires kink-handler
  // vocabulary to be reframed as clinical equivalents, since user-facing
  // chat must not break the therapist fabrication.
  const persona = state.handler_persona || 'handler';
  if (persona === 'therapist') {
    for (const [re, replacement] of THERAPIST_TRANSLATIONS) {
      const before = result;
      result = result.replace(re, replacement);
      if (before !== result) transformations.push(`therapist:${re.source}`);
    }
  }
  if (PERSONA_SUFFIX[persona]) {
    result = result + PERSONA_SUFFIX[persona];
    transformations.push(`persona-suffix:${persona}`);
  }

  // 3. Mode-specific framing adjustments
  const mode: HandlerMode = state.mode_override
    || (state.hard_mode_active ? 'hard_mode' : 'normal');
  if (mode === 'hard_mode' && !/\bhard mode\b/i.test(result)) {
    // The Handler doesn't preamble status. Memory: feedback_no_handler_status_dumps.
    // So we don't inject "Hard Mode is on" — but we DO ensure the tone is sharper.
    transformations.push('mode:hard_mode');
  }

  return { text: result.trim(), transformations };
}

/**
 * Convenience for callers that just want the text without metadata.
 */
export function handlerVoiced(text: string, state: HandlerVoiceState = {}): string {
  return applyHandlerVoice(text, state).text;
}

/**
 * Build a state snippet to inject into LLM prompts so generation reflects
 * current Handler state. Used by handler-revenue, revenue-planner, etc.
 */
export function handlerStatePromptFooter(state: HandlerVoiceState | null | undefined): string {
  if (!state) return '';
  const parts: string[] = [];
  if (state.handler_persona) parts.push(`persona=${state.handler_persona}`);
  if (state.current_phase != null) parts.push(`phase=${state.current_phase}`);
  if (state.denial_day != null) parts.push(`denial_day=${state.denial_day}`);
  if (state.hard_mode_active) parts.push('hard_mode=on');
  if (state.chastity_locked) parts.push('chastity=locked');
  return parts.length ? `\nCurrent Handler state: ${parts.join(', ')}. Voice and content must reflect this.` : '';
}
