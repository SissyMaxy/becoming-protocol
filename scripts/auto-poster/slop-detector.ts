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

  // New bans — corny patterns that slipped through
  { pattern: /\bnobody (tells|warns|told) you (about)?\b/i, reason: 'banned phrase: nobody tells you about' },
  { pattern: /\bbiology doing its thing\b/i, reason: 'banned phrase: biology doing its thing' },
  { pattern: /\bmysterious ways\b/i, reason: 'banned phrase: mysterious ways' },
  { pattern: /\bso real (though|tho)\b/i, reason: 'banned phrase: so real though' },
  { pattern: /\bthe dysphoria tax\b/i, reason: 'banned phrase: the dysphoria tax' },
  { pattern: /\bcrying in (a |the )?(parking lot|walgreens|target)\b/i, reason: 'banned phrase: crying in public place' },
  { pattern: /^(god |ok(ay)? but )/i, reason: 'banned opener: god/okay but' },
  { pattern: /\b(just|stop) processing\b/i, reason: 'banned phrase: processing' },
  { pattern: /\bwhole thing worth it\b/i, reason: 'banned phrase: whole thing worth it' },
  { pattern: /\brent free\b/i, reason: 'banned phrase: rent free' },
  { pattern: /\bspeedrun(ning)?\b/i, reason: 'banned phrase: speedrunning' },
  { pattern: /\b(is|that'?s) (actually )?so real\b/i, reason: 'banned phrase: is/that\'s so real' },

  // Repetitive crutch phrases from audit
  { pattern: /doing (all )?the heavy lifting\b/i, reason: 'banned phrase: doing the heavy lifting' },
  { pattern: /\bthe math is mathing\b/i, reason: 'banned phrase: the math is mathing' },
  { pattern: /\bgo off i guess\b/i, reason: 'banned phrase: go off i guess' },
  { pattern: /\bgo touch grass\b/i, reason: 'banned phrase: go touch grass' },
  { pattern: /\bsending me\b/i, reason: 'banned phrase: sending me' },
  { pattern: /\bin a chokehold\b/i, reason: 'banned phrase: in a chokehold' },
  { pattern: /\bwho am i\b$/i, reason: 'banned phrase: trailing "who am i"' },
  { pattern: /\bi (get|respect) the (energy|vibe|commitment)\b/i, reason: 'banned phrase: i respect the X' },

  // From Claude memory feedback_no_confidence — blanket hard-ban, zero tolerance.
  // "valid" is already caught in specific validation-filler structures above.
  { pattern: /\bconfidence\b/i, reason: 'banned phrase: confidence (feedback_no_confidence)' },
];

export interface SlopCheckResult {
  pass: boolean;
  reasons: string[];
  /** True if any reason is a hard-ban (LLM score cannot override) */
  hasHardBan?: boolean;
}

/**
 * Fast pattern-based slop check. Returns pass/fail and reasons.
 */
export function patternSlopCheck(reply: string): SlopCheckResult {
  const reasons: string[] = [];
  let hasHardBan = false;

  for (const { pattern, reason } of SLOP_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(reply)) {
      reasons.push(reason);
      // "banned phrase:" entries are hard bans — LLM cannot override
      if (reason.startsWith('banned phrase:')) hasHardBan = true;
    }
  }

  // Truncation check — unmatched quotes or ends mid-sentence
  const quoteCount = (reply.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    reasons.push('truncated: unmatched quote');
    hasHardBan = true;
  }

  // Minimum substance check — reject filler replies under 10 words
  const wordCount = reply.split(/\s+/).length;
  if (wordCount < 10) {
    reasons.push(`too short: ${wordCount} words — lacks substance`);
  }

  // Emoji count — Maxy's rule: emojis are for emphasis, max 1 per message.
  // More than one almost always reads as decoration/saccharine/bot style.
  const emojis = reply.match(/\p{Extended_Pictographic}/gu) || [];
  if (emojis.length > 1) {
    reasons.push(`excess emojis: ${emojis.length} — max 1 per message, emojis are for emphasis only`);
    hasHardBan = true;
  }

  // Meta-commentary leakage — model reasoning bleeding into the output.
  // Catches "something like:", "they seem checked out", etc.
  if (/\bsomething like\s*:/i.test(reply)) {
    reasons.push('meta-commentary: "something like:" — model leaked reasoning');
    hasHardBan = true;
  }
  if (/^(they\s+seem|they're\s+clearly|looks\s+like\s+they|seems\s+like\s+they)/i.test(reply.trim())) {
    reasons.push('meta-commentary: output starts with reasoning about them');
    hasHardBan = true;
  }
  if (/\bhere'?s\s+(?:a|her|what\s+she'?d\s+say)\b/i.test(reply)) {
    reasons.push('meta-commentary: "here\'s a reply" framing');
    hasHardBan = true;
  }

  return { pass: reasons.length === 0, reasons, hasHardBan };
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

  // Check for high word overlap — but only flag if there are enough content words
  // to make the comparison meaningful. Short tweets sharing common topic words
  // (hrt, transition, cage, etc.) shouldn't be flagged as repeats.
  const STOP_WORDS = new Set(['i', 'the', 'a', 'an', 'is', 'it', 'to', 'and', 'of', 'in', 'my', 'that', 'this', 'was', 'for', 'on', 'you', 'me', 'so', 'but', 'like', 'with', 'just', 'not', 'be', 'are', 'do', 'if', 'at', 'or', 'no', 'about', 'when', 'been', 'still', 'really', 'don\'t', 'didn\'t', 'can\'t', 'got', 'get', 'going', 'think', 'know', 'feel', 'now', 'even', 'too', 'how', 'what', 'lol', 'lmao', 'tbh', 'yeah']);
  const replyWords = new Set(replyLower.split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w)));

  for (const recent of recentReplies) {
    const recentWords = new Set(recent.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w)));
    if (replyWords.size < 5 || recentWords.size < 5) continue; // skip short texts

    let overlap = 0;
    replyWords.forEach(w => {
      if (recentWords.has(w)) overlap++;
    });
    const overlapRatio = overlap / Math.min(replyWords.size, recentWords.size);
    if (overlapRatio > 0.7 && overlap >= 5) {
      reasons.push(`high word overlap with a recent reply (${Math.round(overlapRatio * 100)}%)`);
      break;
    }
  }

  // Check for "lmao/lmaooo" opener frequency — max 1 in 5 recent replies
  if (/^lmao+/i.test(replyLower)) {
    const lmaoCount = recentReplies.filter(r => /^lmao+/i.test(r.toLowerCase().trim())).length;
    // If 20%+ of recent replies start with lmao, block this one
    if (recentReplies.length >= 3 && lmaoCount / recentReplies.length >= 0.2) {
      reasons.push(`"lmao" opener overused: ${lmaoCount}/${recentReplies.length} recent replies start with it — vary your openings`);
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

// ── Cheap second-judge via OpenRouter (Gemini Flash / gpt-4o-mini) ──
// Calls the openrouter-cheap-judge edge function. Runs in parallel with
// the primary Haiku judge — both must pass or we reject. This catches
// model-specific blind spots: a slop reply that fools Haiku won't fool
// Gemini and vice versa.

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function cheapJudgeSlop(
  originalContext: string,
  reply: string,
): Promise<{ pass: boolean; score: number; reason: string }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { pass: true, score: 70, reason: 'cheap judge unconfigured' };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/openrouter-cheap-judge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        mode: 'slop_second_judge',
        original_context: originalContext,
        output: reply,
      }),
    });
    if (!res.ok) {
      return { pass: true, score: 70, reason: `cheap judge http ${res.status}` };
    }
    const data = await res.json() as { ok: boolean; score: number; accept: boolean; reason: string };
    if (!data.ok) {
      return { pass: true, score: 70, reason: data.reason || 'cheap judge fail-open' };
    }
    return { pass: data.accept, score: data.score, reason: data.reason };
  } catch (err) {
    return { pass: true, score: 70, reason: `cheap judge error: ${err instanceof Error ? err.message : err}` };
  }
}

// ── LLM judge ───────────────────────────────────────────────────────

const JUDGE_PROMPT = `You are a social media authenticity judge. Your job is to rate whether a reply sounds like it was written by a real person or by an AI bot.

Score 1-10 (BE HARSH — only a 9 or 10 should pass):
- 1-4: Obvious AI. Generic, hollow, could be a reply to any tweet. Hollow encouragement. Therapy-speak.
- 5-6: Suspicious. Has some personality but still feels composed/polished. Real people are messier.
- 7-8: Close but not quite. Something's slightly off — too clean, too balanced, too supportive, or uses a phrase pattern that feels manufactured.
- 9: Authentic. Genuinely sounds like one specific real person typed this on their phone. Has rough edges, specificity, and personality that can't be faked.
- 10: Indistinguishable from a real person. Could never be flagged as AI by anyone.

Common AI tells to watch for:
- Replying with generic encouragement instead of engaging with the actual content
- Over-mirroring the original tweet's language
- Adding unnecessary qualifiers ("honestly", "literally", "genuinely")
- Being too nice / too supportive (real people have edges)
- Sounding like a motivational poster
- Using slang that doesn't match the rest of the voice
- Starting multiple sentences the same way
- Generic reaction replies that could respond to literally anything ("the way you said that", "oh yeah?", vague 👀 responses)
- Replies under 10 words that are just filler reactions with no substance
- Crutch phrases: "doing the heavy lifting", "sending me", "in a chokehold", "go off"

A score of 9 or 10 = PASS. Anything below 9 = FAIL. Be strict.

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
    const pass = verdictMatch ? verdictMatch[1].toUpperCase() === 'PASS' : score >= 9;
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
  /** Cheap second-judge score (0-100). 0 if not called. */
  cheapScore?: number;
  cheapReason?: string;
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

  // Skip LLM call on hard bans or 2+ pattern failures — saves API credits
  // Hard bans can never be overridden so the LLM score is irrelevant
  if (patterns.reasons.length >= 2 || patterns.hasHardBan || !repetition.pass) {
    const feedback = buildRetryFeedback(patterns.reasons, repetition.reasons, 0, 'skipped');
    return {
      pass: false,
      patternReasons: patterns.reasons,
      repetitionReasons: repetition.reasons,
      llmScore: 0,
      llmReason: 'skipped',
      retryFeedback: feedback,
    };
  }

  // Pass 3: dual-judge — Haiku (Anthropic) + cheap judge (OpenRouter Gemini Flash).
  // Run in parallel. Both must pass to accept. Catches model-specific blind spots.
  const [llm, cheap] = await Promise.all([
    llmSlopJudge(anthropic, originalTweet, reply),
    cheapJudgeSlop(originalTweet, reply),
  ]);

  // LLM score 9+ overrides pattern failures — the LLM is the more nuanced judge.
  // Pattern regexes catch common AI tells but produce false positives on authentic text.
  // Repetition failures are NOT overridable — even good text shouldn't repeat.
  // Hard bans (banned phrases) are NEVER overridable — these are explicit voice rules.
  const patternOverridden = !patterns.pass && llm.score >= 9 && !patterns.hasHardBan;
  const effectivePatternPass = patterns.pass || patternOverridden;

  const allFailed = !effectivePatternPass || !repetition.pass || !llm.pass || !cheap.pass;
  const feedback = buildRetryFeedback(
    patternOverridden ? [] : patterns.reasons,
    repetition.reasons,
    llm.score,
    llm.reason,
    cheap.pass ? 0 : cheap.score,
    cheap.pass ? '' : cheap.reason,
  );

  return {
    pass: !allFailed,
    patternReasons: patternOverridden ? [] : patterns.reasons,
    repetitionReasons: repetition.reasons,
    llmScore: llm.score,
    llmReason: llm.reason,
    cheapScore: cheap.score,
    cheapReason: cheap.reason,
    retryFeedback: feedback,
  };
}

function buildRetryFeedback(
  patternReasons: string[],
  repetitionReasons: string[],
  llmScore: number,
  llmReason: string,
  cheapScore: number = 0,
  cheapReason: string = '',
): string {
  const parts: string[] = [];

  if (patternReasons.length > 0) {
    parts.push(`AI PATTERN DETECTED: ${patternReasons.join('; ')}`);
  }
  if (repetitionReasons.length > 0) {
    parts.push(`REPETITION: ${repetitionReasons.join('; ')}`);
  }
  if (llmScore > 0 && llmScore < 9) {
    parts.push(`AUTHENTICITY SCORE: ${llmScore}/10 — ${llmReason}`);
  }
  if (cheapScore > 0 && cheapReason) {
    parts.push(`SECOND JUDGE: ${cheapScore}/100 — ${cheapReason}`);
  }

  return parts.length > 0
    ? `Your previous reply was rejected. Issues: ${parts.join('. ')}. Write a COMPLETELY different reply — different words, different angle, different structure.`
    : '';
}
