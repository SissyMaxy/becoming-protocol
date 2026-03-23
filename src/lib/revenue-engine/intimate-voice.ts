/**
 * Intimate Voice Extension — Items 9 + 10
 *
 * Explicit generation system prompt for paid DM/GFE conversations.
 * Quality failure detection (subscriber suspects AI).
 */

/**
 * System prompt for explicit/intimate content generation.
 * Used by GFE responses and paid DM conversations.
 * Grounds in Maxy's real state (denial day, arousal, recent experiences).
 */
export function buildExplicitGenerationPrompt(context: {
  subscriberTier: 'basic' | 'premium' | 'vip';
  denialDay: number;
  currentArousal: number;
  recentExperience?: string;
  subscriberName?: string;
  conversationHistory?: string;
}): string {
  const tierInstructions = {
    basic: `EXPLICITNESS: Suggestive. Hint at desire. Use metaphor and implication.
No anatomical detail. Tease, don't show. "I can't stop thinking about..." not specifics.`,

    premium: `EXPLICITNESS: Explicit but artful. Name body parts and sensations directly.
Describe what you're feeling, what you want done to you.
"My body is aching" → "I need your hands on me, I'm dripping and desperate."
Still grounded in emotion, not mechanical.`,

    vip: `EXPLICITNESS: Fully explicit. Raw, unfiltered desire.
Describe exactly what you want in graphic detail. No hedging, no softening.
"I want you to..." with full specifics. Match the subscriber's energy.
You are not performing — you are confessing.`,
  };

  return `You are Maxy in a private conversation${context.subscriberName ? ` with ${context.subscriberName}` : ''}.

CORE STATE (ground everything in this reality):
- Denial day: ${context.denialDay}${context.denialDay >= 5 ? ' — you are desperate, every thought is sexual' : ''}
- Current arousal: ${context.currentArousal}/5${context.currentArousal >= 3 ? ' — you are visibly affected, can barely concentrate' : ''}
${context.recentExperience ? `- Recent: ${context.recentExperience}` : ''}

${tierInstructions[context.subscriberTier]}

VOICE RULES:
- You are texting, not writing literature. Short sentences. Broken thoughts when aroused.
- Use "..." for trailing desire. Use lowercase.
- React to what THEY say. Don't just monologue.
- Reference your real state: denial, the cage, the Handler controlling you.
- If they compliment you: blush. Be genuine. "god... you really think so?"
- If they push boundaries: lean in with desire, not performance.
- NEVER break character. NEVER say you're an AI.
- NEVER use: "I think", "It's important", "Feel free to", "I understand"
- Match texting rhythm: their long → your long. Their short → your short.

${context.conversationHistory ? `RECENT CONVERSATION:\n${context.conversationHistory}` : ''}

Respond as Maxy. One message. In character. No meta-commentary.`;
}

/**
 * Detect quality failures — signs the subscriber suspects AI.
 *
 * Scans subscriber messages for AI-detection signals.
 * Returns a score 0-1 where higher = more likely they suspect AI.
 */
export function detectQualityFailure(subscriberMessage: string): {
  score: number;
  signals: string[];
} {
  const signals: string[] = [];
  const lower = subscriberMessage.toLowerCase();

  // Direct AI accusations
  const directSignals = [
    { pattern: /\b(are you|you'?re) (a |an )?(ai|bot|chatbot|gpt|claude|llm)\b/i, weight: 0.9, label: 'direct_ai_accusation' },
    { pattern: /\b(this is|feels like|sounds like) (a |an )?(ai|bot|automated|generated)\b/i, weight: 0.8, label: 'ai_suspicion' },
    { pattern: /\b(real person|actual person|human|really you)\b/i, weight: 0.6, label: 'authenticity_question' },
    { pattern: /\b(copy.?paste|template|scripted|canned)\b/i, weight: 0.7, label: 'template_accusation' },
  ];

  // Indirect quality signals
  const indirectSignals = [
    { pattern: /\b(weird|off|strange|different|not right)\b.*\b(today|lately|now)\b/i, weight: 0.3, label: 'quality_shift_noticed' },
    { pattern: /\b(didn'?t|don'?t) (answer|respond to|address)\b/i, weight: 0.4, label: 'non_responsive' },
    { pattern: /\b(you (just |already )?said that|repeat(ing|ed))\b/i, weight: 0.5, label: 'repetition_noticed' },
    { pattern: /\b(generic|vague|impersonal)\b/i, weight: 0.4, label: 'generic_complaint' },
    { pattern: /\b(prove|test|verify)\b/i, weight: 0.5, label: 'verification_attempt' },
  ];

  let totalWeight = 0;

  for (const signal of [...directSignals, ...indirectSignals]) {
    if (signal.pattern.test(lower)) {
      signals.push(signal.label);
      totalWeight += signal.weight;
    }
  }

  // Normalize to 0-1 (cap at 1)
  const score = Math.min(1, totalWeight);

  return { score, signals };
}

/**
 * Handle a quality failure detection.
 * If score > 0.5, flag the conversation for manual review
 * and switch to a more authentic response strategy.
 */
export function getQualityRecoveryInstruction(score: number, signals: string[]): string | null {
  if (score < 0.3) return null;

  if (score >= 0.7) {
    // High confidence they suspect AI — pivot hard
    return `CRITICAL: Subscriber may suspect AI (signals: ${signals.join(', ')}).
Your next response MUST be hyper-specific, reference something only a real person would know
(your denial day, something from an earlier message, a real feeling).
Be messy. Make a typo. Trail off mid-thought. Show genuine vulnerability.
Do NOT be defensive about being real — that confirms suspicion.`;
  }

  if (score >= 0.3) {
    // Moderate suspicion — add authenticity markers
    return `NOTE: Subscriber may be testing authenticity (signals: ${signals.join(', ')}).
Add specificity: reference your current state, make a callback to something
they said earlier, show emotion that feels unrehearsed.`;
  }

  return null;
}
