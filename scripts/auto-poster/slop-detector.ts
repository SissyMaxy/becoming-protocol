/**
 * Slop Detector — self-evaluation layer that catches AI-sounding replies
 * before they get posted.
 *
 * Two-pass system:
 *   1. Fast pattern check — catches obvious AI crutch phrases (free, instant)
 *   2. LLM judge — rates authenticity on a second pass (cheap Haiku call)
 *
 * Also checks for cross-reply repetition so the bot doesn't fall into ruts.
 */

import Anthropic from '@anthropic-ai/sdk';

// ── AI slop patterns ────────────────────────────────────────────────
// These are phrases/structures that real people rarely use but AI loves.

const SLOP_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // Generic affirmations
  { pattern: /^(oh )?i (absolutely |totally |completely )?love (this|that)/i, reason: 'generic "love this" opener' },
  { pattern: /^this is (so |really |truly )?(valid|important|powerful|beautiful|amazing)/i, reason: 'generic validation opener' },
  { pattern: /\bthat'?s (so |really )?(valid|real|important|powerful|beautiful)\b/i, reason: 'generic validation filler' },
  { pattern: /\byou'?re (so |really )?(valid|brave|strong|amazing|incredible|wonderful)\b/i, reason: '"you\'re so valid" filler compliment' },
  { pattern: /\b(sending|all the) (love|hugs|support|good vibes)\b/i, reason: '"sending love/hugs" bot phrase' },

  // Over-enthusiastic structure
  { pattern: /!{2,}/g, reason: 'multiple exclamation marks' },
  { pattern: /^(omg|oh my god|wow) /i, reason: 'forced excitement opener' },

  // AI sentence starters
  { pattern: /^(I just (want|need) to say|Can I just say)/i, reason: '"I just want to say" AI opener' },
  { pattern: /^As (a fellow|someone who)/i, reason: '"as a fellow X" AI structure' },

  // Hollow encouragement
  { pattern: /\byou('re| are) (doing|killing) (great|it|amazing)/i, reason: 'hollow encouragement' },
  { pattern: /\bso proud of you\b/i, reason: '"so proud of you" from a stranger' },
  { pattern: /\bkeep (going|it up|doing what you'?re doing|being you)/i, reason: 'generic encouragement' },
  { pattern: /\byou'?ve got this\b/i, reason: '"you\'ve got this" platitude' },
  { pattern: /\bmore power to you\b/i, reason: '"more power to you" cliché' },

  // Corporate/brand voice
  { pattern: /\bthanks for sharing\b/i, reason: '"thanks for sharing" brand voice' },
  { pattern: /\bi appreciate you (sharing|being|posting)/i, reason: 'brand voice appreciation' },
  { pattern: /\bthis (resonates|speaks to me)\b/i, reason: '"this resonates" corporate therapy-speak' },

  // Therapy-speak
  { pattern: /\bholding space\b/i, reason: 'therapy-speak' },
  { pattern: /\byour (journey|truth|lived experience)\b/i, reason: '"your journey/truth" therapy-speak' },
  { pattern: /\bso much this\b/i, reason: '"so much this" Reddit cliché' },

  // Overused transitional phrases
  { pattern: /\b(in all seriousness|jokes aside|but seriously|on a serious note)\b/i, reason: 'overused transition phrase' },
  { pattern: /\b(it'?s giving|no because|the way I)\b/i, reason: 'forced slang adoption' },

  // Structure tells — AI loves to mirror then add
  { pattern: /^(right|yes|exactly|same)[?!.]?\s+(and |but |like |i )/i, reason: 'agree-then-add AI structure' },

  // Already banned but double-check
  { pattern: /\bhits different\b/i, reason: 'banned phrase: hits different' },
  { pattern: /^the way /i, reason: 'banned phrase: "the way..." opener' },
  { pattern: /\benergy\b/i, reason: 'banned phrase: energy as descriptor' },
  { pattern: /\bngl\b/i, reason: 'banned phrase: ngl' },
  { pattern: /^honestly/i, reason: 'banned phrase: honestly opener' },
  { pattern: /chef'?s kiss/i, reason: 'banned phrase: chef\'s kiss' },
  { pattern: /\bi respect (it|that)\b/i, reason: 'banned phrase: i respect it/that' },
];

export interface SlopCheckResult {
  pass: boolean;
  reasons: string[];
}

/**
 * Fast pattern-based slop check. Returns pass/fail and reasons.
 */
export function patternSlopCheck(reply: string): SlopCheckResult {
  const reasons: string[] = [];

  for (const { pattern, reason } of SLOP_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(reply)) {
      reasons.push(reason);
    }
  }

  return { pass: reasons.length === 0, reasons };
}

/**
 * Check reply against recent history to catch repetitive patterns.
 * Returns phrases/structures that have been used too recently.
 */
export function repetitionCheck(reply: string, recentReplies: string[]): SlopCheckResult {
  if (recentReplies.length === 0) return { pass: true, reasons: [] };

  const reasons: string[] = [];
  const replyLower = reply.toLowerCase().trim();

  // Check if opening 3+ words match any recent reply
  const replyOpener = replyLower.split(/\s+/).slice(0, 3).join(' ');
  for (const recent of recentReplies) {
    const recentOpener = recent.toLowerCase().trim().split(/\s+/).slice(0, 3).join(' ');
    if (replyOpener === recentOpener && replyOpener.length > 5) {
      reasons.push(`same opener as recent reply: "${replyOpener}..."`);
      break;
    }
  }

  // Check for high word overlap (>60% shared non-stop-words)
  const STOP_WORDS = new Set(['i', 'the', 'a', 'an', 'is', 'it', 'to', 'and', 'of', 'in', 'my', 'that', 'this', 'was', 'for', 'on', 'you', 'me', 'so', 'but', 'like', 'with', 'just', 'not', 'be', 'are', 'do', 'if', 'at', 'or', 'no']);
  const replyWords = new Set(replyLower.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w)));

  for (const recent of recentReplies) {
    const recentWords = new Set(recent.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w)));
    if (replyWords.size === 0 || recentWords.size === 0) continue;

    let overlap = 0;
    replyWords.forEach(w => {
      if (recentWords.has(w)) overlap++;
    });
    const overlapRatio = overlap / Math.min(replyWords.size, recentWords.size);
    if (overlapRatio > 0.6 && overlap >= 3) {
      reasons.push(`high word overlap with a recent reply (${Math.round(overlapRatio * 100)}%)`);
      break;
    }
  }

  // Check for emoji repetition (same emoji used in >40% of recent replies)
  // Match common emoji ranges — tsx handles unicode but avoid the /u flag for tsc compat
  const replyEmojis = reply.match(/[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g) || [];
  if (replyEmojis.length > 0) {
    for (const emoji of replyEmojis) {
      const usageCount = recentReplies.filter(r => r.includes(emoji)).length;
      if (usageCount / recentReplies.length > 0.4) {
        reasons.push(`emoji ${emoji} used in ${usageCount}/${recentReplies.length} recent replies — find a new one`);
      }
    }
  }

  return { pass: reasons.length === 0, reasons };
}

// ── LLM judge ───────────────────────────────────────────────────────

const JUDGE_PROMPT = `You are a social media authenticity judge. Your job is to rate whether a reply sounds like it was written by a real person or by an AI bot.

Score 1-10:
- 1-3: Obvious AI slop. Generic, hollow, could be a reply to any tweet.
- 4-5: Suspicious. Has some personality but falls into AI patterns (over-enthusiastic, too supportive, therapy-speak, forced slang).
- 6-7: Decent. Sounds like a real person but could be tighter or more specific.
- 8-10: Authentic. Specific, has real personality, references concrete personal experience, natural cadence.

Common AI tells to watch for:
- Replying with generic encouragement instead of engaging with the actual content
- Over-mirroring the original tweet's language
- Adding unnecessary qualifiers ("honestly", "literally", "genuinely")
- Being too nice / too supportive (real people have edges)
- Sounding like a motivational poster
- Using slang that doesn't match the rest of the voice
- Starting multiple sentences the same way

Output EXACTLY this format:
SCORE: [number]
VERDICT: [PASS or FAIL]
REASON: [one sentence explaining why, be specific]`;

/**
 * LLM-based authenticity judge. Returns pass (score >= 7) or fail with reason.
 */
export async function llmSlopJudge(
  anthropic: Anthropic,
  originalTweet: string,
  reply: string,
): Promise<{ pass: boolean; score: number; reason: string }> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: JUDGE_PROMPT,
      messages: [{
        role: 'user',
        content: `Original tweet: "${originalTweet}"\n\nReply: "${reply}"\n\nRate this reply.`,
      }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const scoreMatch = text.match(/SCORE:\s*(\d+)/);
    const verdictMatch = text.match(/VERDICT:\s*(PASS|FAIL)/i);
    const reasonMatch = text.match(/REASON:\s*(.+)/);

    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 5;
    const pass = verdictMatch ? verdictMatch[1].toUpperCase() === 'PASS' : score >= 7;
    const reason = reasonMatch ? reasonMatch[1].trim() : 'no reason given';

    return { pass, score, reason };
  } catch (err) {
    console.error('[SlopJudge] LLM judge failed:', err instanceof Error ? err.message : err);
    // Fail open — if the judge errors, let the reply through
    return { pass: true, score: 7, reason: 'judge unavailable' };
  }
}

// ── Combined check ──────────────────────────────────────────────────

export interface FullSlopResult {
  pass: boolean;
  patternReasons: string[];
  repetitionReasons: string[];
  llmScore: number;
  llmReason: string;
  /** Feedback string to inject into a retry prompt */
  retryFeedback: string;
}

/**
 * Run the full slop detection pipeline:
 *   1. Pattern check (instant)
 *   2. Repetition check (instant)
 *   3. LLM judge (one Haiku call)
 *
 * Returns combined result with retry feedback for regeneration.
 */
export async function fullSlopCheck(
  anthropic: Anthropic,
  originalTweet: string,
  reply: string,
  recentReplies: string[],
): Promise<FullSlopResult> {
  // Pass 1: patterns
  const patterns = patternSlopCheck(reply);

  // Pass 2: repetition
  const repetition = repetitionCheck(reply, recentReplies);

  // If pattern check caught hard fails, skip LLM call to save money
  if (patterns.reasons.length >= 2) {
    const feedback = buildRetryFeedback(patterns.reasons, repetition.reasons, 0, 'skipped — too many pattern failures');
    return {
      pass: false,
      patternReasons: patterns.reasons,
      repetitionReasons: repetition.reasons,
      llmScore: 0,
      llmReason: 'skipped',
      retryFeedback: feedback,
    };
  }

  // Pass 3: LLM judge
  const llm = await llmSlopJudge(anthropic, originalTweet, reply);

  const allFailed = !patterns.pass || !repetition.pass || !llm.pass;
  const feedback = buildRetryFeedback(patterns.reasons, repetition.reasons, llm.score, llm.reason);

  return {
    pass: !allFailed,
    patternReasons: patterns.reasons,
    repetitionReasons: repetition.reasons,
    llmScore: llm.score,
    llmReason: llm.reason,
    retryFeedback: feedback,
  };
}

function buildRetryFeedback(
  patternReasons: string[],
  repetitionReasons: string[],
  llmScore: number,
  llmReason: string,
): string {
  const parts: string[] = [];

  if (patternReasons.length > 0) {
    parts.push(`AI PATTERN DETECTED: ${patternReasons.join('; ')}`);
  }
  if (repetitionReasons.length > 0) {
    parts.push(`REPETITION: ${repetitionReasons.join('; ')}`);
  }
  if (llmScore > 0 && llmScore < 7) {
    parts.push(`AUTHENTICITY SCORE: ${llmScore}/10 — ${llmReason}`);
  }

  return parts.length > 0
    ? `Your previous reply was rejected. Issues: ${parts.join('. ')}. Write a COMPLETELY different reply — different words, different angle, different structure.`
    : '';
}
