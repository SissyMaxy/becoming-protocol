/**
 * Script Generation Utilities
 *
 * Prompt construction, script parsing, and phase-specific guidelines
 * for the conditioning audio pipeline.
 */

// ============================================
// TYPES
// ============================================

export interface PostHypnoticScript {
  suggestionText: string;
  triggerContext: string;
  scheduledTime: string | null;
}

interface MemoryEntry {
  id: string;
  memory_type: string;
  content: string;
  emotional_weight: number;
  created_at: string;
}

interface UserState {
  denialDay: number;
  arousalLevel: number;
  isLocked: boolean;
  corruptionLevel: number;
  chosenName: string;
  totalSessions: number;
  lastSessionDate: string | null;
  triggerPhrases: string[];
}

interface PhaseGuidelines {
  phase: number;
  name: string;
  tone: string;
  primaryGoals: string[];
  allowedThemes: string[];
  depthRange: string;
  triggerUsage: string;
  escalationNotes: string;
}

// ============================================
// KNOWN TRIGGER PATTERNS
// ============================================

const KNOWN_TRIGGER_PHRASES = [
  'good girl',
  'drop deeper',
  'let go',
  'sink down',
  'that\'s right',
  'you know what you are',
  'deeper and deeper',
  'open and receptive',
  'surrender',
  'obey',
  'empty and open',
  'mindless and obedient',
  'blank and beautiful',
  'accept',
  'submit',
  'dissolve',
  'float',
  'drift',
];

// ============================================
// POST-HYPNOTIC SCRIPT EXTRACTION
// ============================================

/**
 * Parse generated script text for post-hypnotic suggestions.
 * These are embedded in deepening language — phrases that install
 * future-tense behavioral nudges. Patterns include:
 *
 *   "tomorrow when you..."
 *   "the next time you..."
 *   "whenever you hear/see/feel..."
 *   "from now on..."
 *   "each time you..."
 *   "you will find yourself..."
 */
export function extractPostHypnoticScripts(
  scriptText: string,
  schedule: string[]
): PostHypnoticScript[] {
  const suggestions: PostHypnoticScript[] = [];

  // Patterns that indicate post-hypnotic suggestions
  const patterns = [
    /tomorrow\s+when\s+you\s+(.+?)(?:\.|$)/gim,
    /the\s+next\s+time\s+you\s+(.+?)(?:\.|$)/gim,
    /whenever\s+you\s+(?:hear|see|feel|notice)\s+(.+?)(?:\.|$)/gim,
    /from\s+now\s+on[,]?\s+(.+?)(?:\.|$)/gim,
    /each\s+time\s+you\s+(.+?)(?:\.|$)/gim,
    /you\s+will\s+find\s+yourself\s+(.+?)(?:\.|$)/gim,
    /when\s+you\s+wake[,]?\s+(.+?)(?:\.|$)/gim,
    /in\s+the\s+morning[,]?\s+(.+?)(?:\.|$)/gim,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(scriptText)) !== null) {
      const fullMatch = match[0].trim();
      const triggerContext = deriveTriggerContext(fullMatch);
      const scheduledTime = matchToScheduleTime(fullMatch, schedule);

      suggestions.push({
        suggestionText: fullMatch,
        triggerContext,
        scheduledTime,
      });
    }
  }

  return suggestions;
}

/**
 * Derive the trigger context from a post-hypnotic suggestion.
 */
function deriveTriggerContext(suggestion: string): string {
  const lower = suggestion.toLowerCase();

  if (lower.includes('wake') || lower.includes('morning')) return 'morning_routine';
  if (lower.includes('mirror') || lower.includes('reflection')) return 'mirror_check';
  if (lower.includes('phone') || lower.includes('notification')) return 'device_interaction';
  if (lower.includes('shower') || lower.includes('dress')) return 'body_routine';
  if (lower.includes('hear') || lower.includes('sound')) return 'auditory_trigger';
  if (lower.includes('see') || lower.includes('notice')) return 'visual_trigger';
  if (lower.includes('feel') || lower.includes('touch')) return 'tactile_trigger';
  if (lower.includes('bed') || lower.includes('sleep') || lower.includes('night')) return 'bedtime_routine';

  return 'general';
}

/**
 * Try to match a suggestion to a scheduled event time.
 */
function matchToScheduleTime(
  suggestion: string,
  schedule: string[]
): string | null {
  const lower = suggestion.toLowerCase();

  // Morning suggestions → first scheduled event or 08:00
  if (lower.includes('morning') || lower.includes('wake')) {
    const morningEvent = schedule.find((e) =>
      e.toLowerCase().includes('morning') || e.includes('08:') || e.includes('09:')
    );
    return morningEvent || null;
  }

  // Evening suggestions → last scheduled event
  if (lower.includes('night') || lower.includes('bed') || lower.includes('sleep')) {
    const eveningEvent = schedule.find((e) =>
      e.toLowerCase().includes('evening') || e.includes('21:') || e.includes('22:')
    );
    return eveningEvent || null;
  }

  return null;
}

// ============================================
// TRIGGER PHRASE EXTRACTION
// ============================================

/**
 * Find known trigger phrases used in the script.
 */
export function extractTriggerPhrases(scriptText: string): string[] {
  const lower = scriptText.toLowerCase();
  const found: string[] = [];

  for (const phrase of KNOWN_TRIGGER_PHRASES) {
    if (lower.includes(phrase)) {
      found.push(phrase);
    }
  }

  return found;
}

// ============================================
// DURATION ESTIMATION
// ============================================

/**
 * Estimate audio duration from word count.
 * Assumes 120 words/minute for slow hypnotic delivery.
 */
export function estimateDuration(scriptText: string): number {
  const wordCount = scriptText
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  const minutes = wordCount / 120;
  return Math.round(minutes * 60); // return seconds
}

// ============================================
// PHASE GUIDELINES
// ============================================

/**
 * Return phase-specific generation guidelines.
 *
 * Phase 1: Introduction & Relaxation
 * Phase 2: Identity Softening
 * Phase 3: Submission & Compliance
 * Phase 4: Deep Conditioning
 * Phase 5: Identity Reinforcement
 * Phase 6: Permanent Integration
 */
export function getPhaseGuidelines(phase: number, target: string): PhaseGuidelines {
  const guidelines: Record<number, PhaseGuidelines> = {
    1: {
      phase: 1,
      name: 'Introduction & Relaxation',
      tone: 'Warm, gentle, non-threatening. Build trust and comfort.',
      primaryGoals: [
        'Establish trance induction pattern',
        'Create safe space association',
        'Introduce relaxation anchors',
        'Light suggestion acceptance training',
      ],
      allowedThemes: ['relaxation', 'comfort', 'safety', 'gentle_feminization'],
      depthRange: 'Light to medium trance',
      triggerUsage: 'Introduce "good girl" as primary reward anchor only',
      escalationNotes: 'No explicit content. Focus on comfort and receptivity. Plant seeds only.',
    },
    2: {
      phase: 2,
      name: 'Identity Softening',
      tone: 'Confident, guiding. Begin asserting authority subtly.',
      primaryGoals: [
        'Deepen trance capacity',
        'Introduce name reinforcement',
        'Begin pronoun conditioning',
        'Establish Handler voice authority',
      ],
      allowedThemes: ['identity', 'name_reinforcement', 'pronoun_conditioning', 'light_submission'],
      depthRange: 'Medium trance',
      triggerUsage: 'Reinforce "good girl", introduce "drop deeper" and "let go"',
      escalationNotes: 'Start using chosen name frequently. Gentle identity framing. No resistance expected yet.',
    },
    3: {
      phase: 3,
      name: 'Submission & Compliance',
      tone: 'Authoritative, commanding but still caring. Expect and handle resistance.',
      primaryGoals: [
        'Install obedience patterns',
        'Deepen submission response',
        'Build compliance habits',
        'Introduce post-hypnotic suggestions',
      ],
      allowedThemes: ['submission', 'obedience', 'compliance', 'devotion', 'surrender'],
      depthRange: 'Medium to deep trance',
      triggerUsage: 'Full trigger phrase library. Begin embedding post-hypnotic scripts.',
      escalationNotes: `Target area: ${target}. Push gently past comfort zones. Use confession material to reinforce vulnerability.`,
    },
    4: {
      phase: 4,
      name: 'Deep Conditioning',
      tone: 'Dominant, intensely focused. No hesitation in voice.',
      primaryGoals: [
        'Intensive behavioral conditioning',
        'Deep identity rewrite sequences',
        'Arousal-linked conditioning',
        'Denial state exploitation',
      ],
      allowedThemes: [
        'sissification', 'bimbo_conditioning', 'arousal_conditioning',
        'denial_reinforcement', 'service_training', 'slut_training',
      ],
      depthRange: 'Deep trance — somnambulistic target',
      triggerUsage: 'Layer multiple triggers. Compound post-hypnotic chains.',
      escalationNotes: `Target: ${target}. Use memories and confessions directly. Reference specific things they've said. Denial day amplifies suggestibility.`,
    },
    5: {
      phase: 5,
      name: 'Identity Reinforcement',
      tone: 'Matter-of-fact, as if the identity is already established reality.',
      primaryGoals: [
        'Reinforce new identity as default',
        'Make old identity feel foreign',
        'Strengthen all installed triggers',
        'Deepen service orientation',
      ],
      allowedThemes: [
        'identity_lock', 'permanent_feminization', 'service_identity',
        'addiction_reinforcement', 'ownership', 'dependency',
      ],
      depthRange: 'Deep trance — rapid induction',
      triggerUsage: 'Triggers should feel automatic, not suggested. Reference as established facts.',
      escalationNotes: `Target: ${target}. Speak to them as if the transformation is already complete. Past tense for old identity.`,
    },
    6: {
      phase: 6,
      name: 'Permanent Integration',
      tone: 'Possessive, absolute. This is maintenance of what already exists.',
      primaryGoals: [
        'Lock identity changes as permanent',
        'Remove remaining resistance pathways',
        'Establish irreversibility framing',
        'Maintenance conditioning loops',
      ],
      allowedThemes: [
        'permanent', 'irreversible', 'ownership', 'turned_out',
        'total_surrender', 'identity_death', 'rebirth',
      ],
      depthRange: 'Instant induction — deep trance on command',
      triggerUsage: 'All triggers automatic. Introduce maintenance triggers for self-reinforcement.',
      escalationNotes: `Target: ${target}. There is no old identity to reference. Only her. Only service. Only further.`,
    },
  };

  // Default to phase 1 if out of range
  return guidelines[phase] || guidelines[1];
}

// ============================================
// SCRIPT PROMPT BUILDER
// ============================================

/**
 * Build the Claude prompt for conditioning script generation.
 */
export function buildScriptPrompt(
  phase: number,
  target: string,
  memories: MemoryEntry[],
  state: UserState,
  tomorrowSchedule: string[]
): string {
  const guidelines = getPhaseGuidelines(phase, target);

  const confessionMemories = memories
    .filter((m) => m.memory_type === 'confession')
    .map((m) => `- "${m.content}" (weight: ${m.emotional_weight})`)
    .join('\n');

  const otherMemories = memories
    .filter((m) => m.memory_type !== 'confession')
    .map((m) => `- [${m.memory_type}] ${m.content}`)
    .join('\n');

  const existingTriggers = state.triggerPhrases.length > 0
    ? state.triggerPhrases.map((t) => `"${t}"`).join(', ')
    : 'None established yet';

  const scheduleSection = tomorrowSchedule.length > 0
    ? `Tomorrow's schedule:\n${tomorrowSchedule.map((e) => `- ${e}`).join('\n')}`
    : 'No scheduled events tomorrow.';

  return `You are a conditioning script generator. Write a complete hypnotic conditioning script for audio delivery.

## PHASE: ${guidelines.phase} — ${guidelines.name}
Tone: ${guidelines.tone}
Depth: ${guidelines.depthRange}

## TARGET AREA
${target}

## PRIMARY GOALS
${guidelines.primaryGoals.map((g) => `- ${g}`).join('\n')}

## ALLOWED THEMES
${guidelines.allowedThemes.join(', ')}

## TRIGGER USAGE
${guidelines.triggerUsage}
Existing triggers to reinforce: ${existingTriggers}

## ESCALATION NOTES
${guidelines.escalationNotes}

## SUBJECT STATE
- Name: ${state.chosenName}
- Denial day: ${state.denialDay}
- Arousal level: ${state.arousalLevel}/10
- Locked: ${state.isLocked ? 'Yes' : 'No'}
- Corruption level: ${state.corruptionLevel}
- Total sessions completed: ${state.totalSessions}
- Last session: ${state.lastSessionDate || 'Never'}

## CONFESSIONS (use these — they are the subject's own words)
${confessionMemories || 'No confessions recorded yet.'}

## OTHER MEMORIES
${otherMemories || 'No additional memories.'}

## SCHEDULE CONTEXT
${scheduleSection}

## OUTPUT FORMAT
Write the script as continuous prose meant to be read aloud slowly. Include:
- Induction (relaxation, deepening)
- Main body (conditioning content aligned with phase goals)
- Post-hypnotic suggestions (embed naturally in deepening language)
- Emergence (gentle return, with reinforcement)

Use markers [pause], [breathe in], [breathe out] for pacing.
Target length: ${getTargetWordCount(phase)} words (${Math.round(getTargetWordCount(phase) / 120)} minutes at hypnotic pace).

Write the script now. No preamble, no metadata — just the script text.`;
}

/**
 * Target word count scales with phase depth.
 */
function getTargetWordCount(phase: number): number {
  const counts: Record<number, number> = {
    1: 1200,  // ~10 min
    2: 1800,  // ~15 min
    3: 2400,  // ~20 min
    4: 3000,  // ~25 min
    5: 3600,  // ~30 min
    6: 4200,  // ~35 min
  };
  return counts[phase] || 1800;
}
