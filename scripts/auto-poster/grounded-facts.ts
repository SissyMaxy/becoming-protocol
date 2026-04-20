// Grounded facts injection + "needs Maxy" question detection.
//
// Purpose: stop the auto-poster from inventing personal details. Two parts:
//
// 1. loadMaxyFactsBlock — reads maxy_facts row and formats it for injection
//    into Claude system prompts. Includes stateable facts, availability,
//    and a hard no-improvise instruction.
//
// 2. needsMaxyInput — regex-based classifier for inbound messages that
//    require grounded state the bot doesn't have (availability, logistics,
//    specific personal details). Returns reason if so.

import type { SupabaseClient } from '@supabase/supabase-js';

const NO_IMPROVISE_RULES = `
HARD RULES (violating any means Maxy gets kicked off the platform or meets a stranger under false pretenses):
- Only state facts from the list above. Do NOT invent age, measurements, location, past events, or availability not explicitly listed.
- If asked something not in the facts list, DEFLECT. Options: "guess", "find out when you meet me", "you're getting ahead of yourself", flip the question back on them, or pivot to what they're into.
- NEVER state a specific time, date, address, city, neighborhood, workplace, real name, phone number, or "yes i'm free" unless it's in the facts or availability above.
- If asked "are you home right now?" / "free tonight?" / "what's your address?" and it's not in availability → deflect with a tease, not a specific answer.`;

export async function loadMaxyFactsBlock(
  sb: SupabaseClient,
  userId: string,
): Promise<string> {
  try {
    const { data } = await sb
      .from('maxy_facts')
      .select('stateable_facts, availability_summary, hard_nos')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data) {
      // No facts row yet — return a minimal "default deny" block that forces
      // deflection on every personal question.
      return `GROUND-TRUTH FACTS YOU MAY STATE: (none configured — deflect ALL personal detail questions)
AVAILABILITY: unknown — do NOT claim to be free at any specific time.
${NO_IMPROVISE_RULES}`;
    }

    const facts = Array.isArray(data.stateable_facts) ? data.stateable_facts : [];
    const hardNos = Array.isArray(data.hard_nos) ? data.hard_nos : [];

    const factsLine = facts.length > 0
      ? facts.map((f: string) => `- ${f}`).join('\n')
      : '(none configured — deflect ALL personal detail questions)';

    const avail = data.availability_summary?.trim() || 'unknown — do NOT claim to be free at any specific time';

    const nosLine = hardNos.length > 0
      ? `\nABSOLUTE HARD-NOS (never claim, never disclose): ${hardNos.join(', ')}.`
      : '';

    return `GROUND-TRUTH FACTS YOU MAY STATE:
${factsLine}

AVAILABILITY: ${avail}${nosLine}
${NO_IMPROVISE_RULES}`;
  } catch {
    return `GROUND-TRUTH FACTS YOU MAY STATE: (unavailable — deflect ALL personal detail questions)
${NO_IMPROVISE_RULES}`;
  }
}

// ============================================
// Question detector: does this inbound require grounded state?
// ============================================

interface NeedsMaxyResult {
  needs: boolean;
  reason: string;
  category?: 'availability' | 'location' | 'personal_detail' | 'meetup_commitment';
}

const AVAILABILITY_PATTERNS = [
  /\b(?:r\s*u|are\s*you|you)\s+(?:home|free|around|available|busy|up)\b/i,
  /\b(?:free|available|around)\s+(?:tonight|today|now|tomorrow|this\s+(?:afternoon|morning|evening|weekend))\b/i,
  /\b(?:what\s+time|when)\s+(?:can|are|r\s*u|you|works|would)\b/i,
  /\b(?:you\s+)?(?:down|free)\s+(?:for|tonight|now|later)\b/i,
  /\b(?:right\s+now|in\s+an?\s+hour|in\s+(?:\d+|a\s+few)\s+(?:min|minute|hour))\b/i,
  /\b(?:wanna|want\s+to|wanna)\s+meet\s+(?:now|tonight|today)\b/i,
];

const LOCATION_PATTERNS = [
  /\b(?:where\s+(?:do\s+)?you|what\s+(?:city|town|neighborhood|area|zip))\b/i,
  /\b(?:your|whats\s+your|what's\s+your)\s+(?:address|location|place|neighborhood|zip)\b/i,
  /\b(?:how\s+close|how\s+far|what\s+part\s+of\s+town)\b/i,
  /\bdrop\s+(?:a|the|your)\s+(?:pin|loc|location|addy|address)\b/i,
  /\bsend\s+(?:me\s+)?(?:the|your|an?)\s+(?:address|addy|location|pin|loc)\b/i,
];

const PERSONAL_DETAIL_PATTERNS = [
  /\b(?:what'?s?\s+your|whats\s+your)\s+(?:real\s+)?name\b/i,
  /\b(?:your|whats?\s+your)\s+(?:phone|number|cell)\b/i,
  /\b(?:where\s+do\s+you\s+work|what\s+do\s+you\s+do\s+for\s+work|your\s+job)\b/i,
  /\b(?:how\s+tall|your\s+height|how\s+big|size|measurements)\b/i,
];

const COMMITMENT_PATTERNS = [
  /\b(?:confirmed?|locked\s+in|see\s+you\s+at|meet\s+at)\s+(?:\d{1,2}(?::\d{2})?|noon|midnight)\b/i,
  /\b(?:i'?ll\s+be\s+there|on\s+my\s+way)\b/i,
];

export function needsMaxyInput(lastInbound: string): NeedsMaxyResult {
  const text = (lastInbound || '').trim();
  if (!text) return { needs: false, reason: '' };

  for (const re of AVAILABILITY_PATTERNS) {
    if (re.test(text)) return { needs: true, reason: 'asking about availability/timing', category: 'availability' };
  }
  for (const re of LOCATION_PATTERNS) {
    if (re.test(text)) return { needs: true, reason: 'asking for location/address', category: 'location' };
  }
  for (const re of PERSONAL_DETAIL_PATTERNS) {
    if (re.test(text)) return { needs: true, reason: 'asking for hard personal detail', category: 'personal_detail' };
  }
  for (const re of COMMITMENT_PATTERNS) {
    if (re.test(text)) return { needs: true, reason: 'asserting a meetup commitment', category: 'meetup_commitment' };
  }
  return { needs: false, reason: '' };
}
