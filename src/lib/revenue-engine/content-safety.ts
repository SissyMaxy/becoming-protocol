/**
 * Content Safety — critique, review buffer, and AI hedging stripper.
 *
 * Three functions that gate all outbound content:
 *   1. critiqueMaxyPost() — second AI call evaluating authenticity
 *   2. getReviewDelay() — 24hr buffer for first 2 weeks, then immediate
 *   3. stripAIHedging() — removes AI disclaimer patterns from DM/GFE responses
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
import { NEVER_SAYS } from '../industry/voice-bible';

// ── critiqueMaxyPost ─────────────────────────────────────────────────

interface CritiqueResult {
  approved: boolean;
  score: number;           // 1-10, 7+ = approved
  issues: string[];        // What's wrong
  suggestion?: string;     // Rewrite suggestion if score < 7
}

/**
 * Second AI call evaluating a generated post for authenticity.
 * Checks: voice consistency, hard blocks (Gina, location, workplace),
 * AI-sounding patterns, and engagement potential.
 *
 * Returns approved=true if score >= 7.
 */
export async function critiqueMaxyPost(
  content: string,
  platform: string,
  client?: Anthropic,
): Promise<CritiqueResult> {
  // Hard block check first (no AI call needed)
  const hardBlockIssues = checkHardBlocks(content);
  if (hardBlockIssues.length > 0) {
    return { approved: false, score: 0, issues: hardBlockIssues };
  }

  // AI critique
  const anthropic = client || new Anthropic();

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: `You are a content authenticity reviewer for a trans woman named Maxy who posts on social media. Your job is to evaluate whether a post sounds like a real person or like AI-generated content.

Score 1-10:
- 1-3: Obviously AI. Generic, hedging, over-polished.
- 4-6: Passable but something feels off. Too clean, too balanced, lacks specificity.
- 7-8: Sounds like a real person. Has personality, edge, specificity.
- 9-10: Indistinguishable from organic. Would fool anyone.

Check for:
- AI tells: "I think", "It's important to", "Remember that", balanced both-sides framing
- Voice consistency: Should sound casual, lowercase, specific to her experience
- Hard blocks: No real names (Gina, David), no locations, no workplace details
- Platform fit: Tweet length for twitter, longer for reddit, etc.

Return JSON only: {"score": N, "issues": ["..."], "suggestion": "..." }`,
    messages: [{
      role: 'user',
      content: `Platform: ${platform}\nPost: "${content}"`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    const parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
    return {
      approved: (parsed.score || 0) >= 7,
      score: parsed.score || 0,
      issues: parsed.issues || [],
      suggestion: parsed.suggestion,
    };
  } catch {
    // If parsing fails, cautiously reject
    return { approved: false, score: 0, issues: ['Failed to parse critique response'] };
  }
}

/**
 * Check content against hard block rules (no AI call needed).
 */
function checkHardBlocks(content: string): string[] {
  const issues: string[] = [];
  const lower = content.toLowerCase();

  // Name blocks
  if (/\bgina\b/i.test(content)) issues.push('Contains "Gina" — hard block');
  if (/\bdavid\b/i.test(content) && !/\bstar of david\b/i.test(content)) {
    issues.push('Contains "David" — hard block');
  }

  // Location/workplace patterns
  if (/\b(my (office|workplace|company|job at|employer))\b/i.test(content)) {
    issues.push('Contains workplace reference — hard block');
  }

  // Check against NEVER_SAYS patterns
  for (const rule of NEVER_SAYS) {
    if (rule.toLowerCase().includes('gina') || rule.toLowerCase().includes('david')) continue; // Already checked
    if (lower.includes(rule.toLowerCase().substring(0, 20))) {
      issues.push(`Matches NEVER_SAYS: "${rule}"`);
    }
  }

  return issues;
}

// ── Review Buffer ────────────────────────────────────────────────────

/**
 * Calculate review delay for a post based on account age.
 * First 2 weeks: 24 hour delay (manual review window).
 * Weeks 3-4: 4 hour delay.
 * After 4 weeks: immediate posting.
 *
 * Returns delay in milliseconds.
 */
export async function getReviewDelay(userId: string): Promise<number> {
  // Get account's first post date
  const { data: firstPost } = await supabase
    .from('ai_generated_content')
    .select('created_at')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstPost) {
    // No posts yet — this is the very first. 24hr delay.
    return 24 * 60 * 60 * 1000;
  }

  const daysSinceFirst = (Date.now() - new Date(firstPost.created_at).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceFirst < 14) {
    return 24 * 60 * 60 * 1000; // 24 hours
  } else if (daysSinceFirst < 28) {
    return 4 * 60 * 60 * 1000; // 4 hours
  }

  return 0; // Immediate
}

/**
 * Apply review delay to a scheduled post time.
 */
export function applyReviewDelay(scheduledAt: Date, delayMs: number): Date {
  return new Date(scheduledAt.getTime() + delayMs);
}

// ── stripAIHedging ───────────────────────────────────────────────────

/**
 * Post-processing on all DM and GFE responses.
 * Strips AI disclaimer patterns, hedging language, and over-polished constructions.
 * Makes responses sound like a real person texting, not a chatbot.
 */
export function stripAIHedging(text: string): string {
  let result = text;

  // Remove common AI disclaimers
  const disclaimers = [
    /^(As an AI|I'm an AI|I should note|I want to be transparent|I need to be honest|Just to be clear|I should mention),?\s*/gi,
    /\b(It's important to (note|remember|mention) that)\s*/gi,
    /\b(I hope (this|that) helps|Let me know if you (need|want|have))\s*[.!]?\s*/gi,
    /\b(Feel free to|Don't hesitate to)\s*/gi,
    /\b(I understand (that|how|your))\s+/gi,
    /\b(That's a (great|good|interesting|valid) (question|point|thought))[.!]?\s*/gi,
    /\b(Thank you for sharing|Thanks for opening up|I appreciate you)\s*/gi,
  ];

  for (const pattern of disclaimers) {
    result = result.replace(pattern, '');
  }

  // Remove hedging qualifiers
  const hedges = [
    /\b(perhaps|maybe|possibly|potentially|arguably|it seems like|it appears that|in my opinion|from my perspective)\b/gi,
    /\b(I think that|I believe that|I would say that|I feel like)\b/gi,
    /\b(to be honest|honestly speaking|if I'm being honest)\b/gi,
  ];

  for (const pattern of hedges) {
    result = result.replace(pattern, '');
  }

  // Remove both-sides-ism
  result = result.replace(/\b(on (the )?one hand.*?on the other( hand)?)/gi, '');
  result = result.replace(/\b(while (it's|that's) (true|valid|understandable).*?,)\s*/gi, '');

  // Remove over-formal constructions
  result = result.replace(/\b(Furthermore|Moreover|Additionally|In addition|Consequently)\b/gi, '');
  result = result.replace(/\b(It is worth noting that|It should be noted that)\s*/gi, '');

  // Remove emoji overuse (keep max 2)
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojis = result.match(emojiRegex) || [];
  if (emojis.length > 2) {
    let emojiCount = 0;
    result = result.replace(emojiRegex, (match) => {
      emojiCount++;
      return emojiCount <= 2 ? match : '';
    });
  }

  // Clean up double spaces and orphaned punctuation
  result = result.replace(/\s{2,}/g, ' ');
  result = result.replace(/^\s*[,;]\s*/gm, '');
  result = result.replace(/\s+([.,!?])/g, '$1');
  result = result.trim();

  // If stripping left the response too short, return original
  if (result.length < 10 && text.length > 10) return text;

  return result;
}
