/**
 * Context Prioritizer — P12.1
 *
 * Scores 30+ context blocks for relevance to the current conversation.
 * Returns the top 10-12 most relevant blocks to include in the Handler prompt,
 * cutting DB queries and prompt tokens by ~60%.
 */

export type ContextBlockName =
  | 'state' | 'whoop' | 'memory' | 'impact' | 'gina' | 'irreversibility'
  | 'narrative' | 'autoPoster' | 'socialInbox' | 'voicePitch' | 'autoPurchase'
  | 'handlerNotes' | 'communityMirror' | 'journal' | 'skillTree' | 'changelog'
  | 'conditioningEngine' | 'denialMapping' | 'contentOptimization' | 'languageDrift'
  | 'sleepPhase' | 'photoTimeline' | 'correlation' | 'commitmentLadder'
  | 'ginaMicroExposure' | 'agenda' | 'predictions' | 'protocol' | 'emotionalModel'
  | 'accountability' | 'socialIntelligence' | 'outreach' | 'failureRecovery'
  | 'reflection';

interface ContextBlockConfig {
  priority: number;
  alwaysInclude: boolean;
}

const CONTEXT_BLOCKS: Record<ContextBlockName, ContextBlockConfig> = {
  state: { priority: 100, alwaysInclude: true },
  whoop: { priority: 80, alwaysInclude: false },
  memory: { priority: 90, alwaysInclude: true },
  impact: { priority: 40, alwaysInclude: false },
  gina: { priority: 30, alwaysInclude: false },
  irreversibility: { priority: 20, alwaysInclude: false },
  narrative: { priority: 20, alwaysInclude: false },
  autoPoster: { priority: 15, alwaysInclude: false },
  socialInbox: { priority: 25, alwaysInclude: false },
  voicePitch: { priority: 20, alwaysInclude: false },
  autoPurchase: { priority: 10, alwaysInclude: false },
  handlerNotes: { priority: 85, alwaysInclude: true },
  communityMirror: { priority: 35, alwaysInclude: false },
  journal: { priority: 40, alwaysInclude: false },
  skillTree: { priority: 50, alwaysInclude: false },
  changelog: { priority: 10, alwaysInclude: false },
  conditioningEngine: { priority: 30, alwaysInclude: false },
  denialMapping: { priority: 45, alwaysInclude: false },
  contentOptimization: { priority: 15, alwaysInclude: false },
  languageDrift: { priority: 35, alwaysInclude: false },
  sleepPhase: { priority: 20, alwaysInclude: false },
  photoTimeline: { priority: 15, alwaysInclude: false },
  correlation: { priority: 25, alwaysInclude: false },
  commitmentLadder: { priority: 40, alwaysInclude: false },
  ginaMicroExposure: { priority: 20, alwaysInclude: false },
  agenda: { priority: 95, alwaysInclude: true },
  predictions: { priority: 70, alwaysInclude: false },
  protocol: { priority: 75, alwaysInclude: false },
  emotionalModel: { priority: 80, alwaysInclude: true },
  accountability: { priority: 45, alwaysInclude: false },
  socialIntelligence: { priority: 20, alwaysInclude: false },
  outreach: { priority: 30, alwaysInclude: false },
  failureRecovery: { priority: 60, alwaysInclude: false },
  reflection: { priority: 50, alwaysInclude: false },
};

interface BoostRule {
  patterns: RegExp;
  boosts: Partial<Record<ContextBlockName, number>>;
}

const MESSAGE_BOOST_RULES: BoostRule[] = [
  {
    patterns: /\b(voice|pitch|sound)\b/i,
    boosts: { voicePitch: 50, skillTree: 30 },
  },
  {
    patterns: /\b(gina|wife|partner)\b/i,
    boosts: { gina: 60, ginaMicroExposure: 40 },
  },
  {
    patterns: /\b(exercise|workout|gym)\b/i,
    boosts: { whoop: 40 },
  },
  {
    patterns: /\b(photo|picture|look)\b/i,
    boosts: { photoTimeline: 40 },
  },
  {
    patterns: /\b(follower|post|comment|DM)\b/i,
    boosts: { socialIntelligence: 50, communityMirror: 40, socialInbox: 30 },
  },
  {
    patterns: /\b(journal|write|wrote)\b/i,
    boosts: { journal: 50 },
  },
  {
    patterns: /\b(scared|afraid|anxious|can'?t)\b/i,
    boosts: { failureRecovery: 40, emotionalModel: 20 },
  },
  {
    patterns: /\b(lovense|device|vibrate|cage)\b/i,
    boosts: { conditioningEngine: 40 },
  },
  {
    patterns: /\b(commit|promise|will)\b/i,
    boosts: { commitmentLadder: 50 },
  },
  {
    patterns: /\b(meet|date|encounter)\b/i,
    boosts: { ginaMicroExposure: 30, socialIntelligence: 20 },
  },
];

const MAX_BLOCKS = 12;

/**
 * Score and select the most relevant context blocks for this conversation turn.
 *
 * @param _userId - Not used currently, reserved for per-user config
 * @param userMessage - The user's current message text
 * @param timeOfDay - Hour of day (0-23)
 * @param activeProtocol - Whether there's an active multi-day protocol
 * @param releaseRisk - Predicted release risk probability (0-1), from predictions
 */
export function prioritizeContextBlocks(
  _userId: string,
  userMessage: string,
  timeOfDay: number,
  activeProtocol?: boolean,
  releaseRisk?: number,
): ContextBlockName[] {
  // Start with base priorities
  const scores: Record<ContextBlockName, number> = {} as Record<ContextBlockName, number>;
  for (const [name, config] of Object.entries(CONTEXT_BLOCKS)) {
    scores[name as ContextBlockName] = config.priority;
  }

  // Apply message-based boosts
  for (const rule of MESSAGE_BOOST_RULES) {
    if (rule.patterns.test(userMessage)) {
      for (const [block, boost] of Object.entries(rule.boosts)) {
        scores[block as ContextBlockName] += boost;
      }
    }
  }

  // Time-of-day boosts
  if (timeOfDay >= 6 && timeOfDay < 10) {
    scores.whoop += 20;
  }
  if (timeOfDay >= 20 || timeOfDay === 0) {
    scores.sleepPhase += 30;
    scores.journal += 20;
  }

  // Active protocol boost
  if (activeProtocol) {
    scores.protocol += 40;
  }

  // Release risk boost
  if (releaseRisk != null && releaseRisk > 0.5) {
    scores.predictions += 30;
    scores.conditioningEngine += 20;
  }

  // Collect always-include blocks
  const alwaysInclude: ContextBlockName[] = [];
  const optional: Array<{ name: ContextBlockName; score: number }> = [];

  for (const [name, config] of Object.entries(CONTEXT_BLOCKS)) {
    const blockName = name as ContextBlockName;
    if (config.alwaysInclude) {
      alwaysInclude.push(blockName);
    } else {
      optional.push({ name: blockName, score: scores[blockName] });
    }
  }

  // Sort optional blocks by score descending
  optional.sort((a, b) => b.score - a.score);

  // Fill remaining slots
  const remainingSlots = MAX_BLOCKS - alwaysInclude.length;
  const topOptional = optional.slice(0, remainingSlots).map(o => o.name);

  return [...alwaysInclude, ...topOptional];
}
