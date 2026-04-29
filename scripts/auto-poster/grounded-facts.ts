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

export interface StructuredFacts {
  onHrt: boolean;
  hrtStartDate: string | null;
  chastityActive: boolean;
  chastityStartDate: string | null;
  outPublicly: boolean;
  partnerName: string | null;
  chosenName: string | null;
  age: number | null;
  pronouns: string | null;
}

const FACTS_CACHE_TTL_MS = 60 * 1000;
const factsCache = new Map<string, { facts: StructuredFacts | null; at: number }>();

export async function loadStructuredFacts(
  sb: SupabaseClient,
  userId: string,
): Promise<StructuredFacts | null> {
  const hit = factsCache.get(userId);
  if (hit && Date.now() - hit.at < FACTS_CACHE_TTL_MS) return hit.facts;
  try {
    const { data } = await sb
      .from('maxy_facts')
      .select('on_hrt, hrt_start_date, chastity_active, chastity_start_date, out_publicly, partner_name, chosen_name, age, pronouns')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) {
      factsCache.set(userId, { facts: null, at: Date.now() });
      return null;
    }
    const facts: StructuredFacts = {
      onHrt: !!data.on_hrt,
      hrtStartDate: data.hrt_start_date || null,
      chastityActive: !!data.chastity_active,
      chastityStartDate: data.chastity_start_date || null,
      outPublicly: !!data.out_publicly,
      partnerName: data.partner_name || null,
      chosenName: data.chosen_name || null,
      age: data.age ?? null,
      pronouns: data.pronouns || null,
    };
    factsCache.set(userId, { facts, at: Date.now() });
    return facts;
  } catch {
    return null;
  }
}

export interface ClaimGuardResult {
  ok: boolean;
  violations: Array<{ rule: string; matched: string }>;
}

/**
 * Hard claim-guard: scan candidate output text for claims that contradict
 * the user's structured facts. Returns violations so the caller can reject
 * + regenerate. This runs ALONGSIDE the slop-detector — slop catches AI
 * crutch phrases; this catches lies about Maxy.
 *
 * Add new rules here as facts grow. The pattern: "if facts.X = Y, ban patterns Z".
 */
export function factsClaimGuard(text: string, facts: StructuredFacts | null): ClaimGuardResult {
  const violations: ClaimGuardResult['violations'] = [];
  if (!facts) return { ok: true, violations };

  const lower = text.toLowerCase();

  // Medical-status claims when not on HRT
  if (!facts.onHrt) {
    const hrtPatterns = [
      { rx: /\bon\s*hrt\b/i, label: 'on hrt' },
      { rx: /\b(started|starting)\s+(hrt|estrogen|hormones?|estradiol|spiro|spironolactone)\b/i, label: 'started HRT/E/spiro' },
      { rx: /\bmonth(s)?\s+(\d+|one|two|three|four|five|six|\w+)\s+(on|of)\s+(hrt|hormones|e\b|estrogen)/i, label: 'month X on HRT/E' },
      { rx: /\bday\s+\d+\s+of\s+(hrt|estrogen|hormones)/i, label: 'day N of HRT' },
      { rx: /\b(hrt|estrogen|estradiol)\s+(brain|fog|titt|tit|breast|chest|skin|hips)/i, label: 'HRT-induced body change' },
      { rx: /\b(my\s+)?(estrogen|estradiol)\s+(level|dose|prescription|pill|injection|patch)/i, label: 'HRT prescription detail' },
      { rx: /\b(taking|on)\s+(estrogen|estradiol|spiro|spironolactone)\b/i, label: 'taking hormones' },
    ];
    for (const { rx, label } of hrtPatterns) {
      const m = text.match(rx);
      if (m) violations.push({ rule: `medical fabrication: ${label} (Maxy is not on HRT)`, matched: m[0] });
    }
  }

  // Chastity claims when not actually locked
  if (!facts.chastityActive) {
    const lockPatterns = [
      { rx: /\b(currently|right now|been|am)\s+(locked|caged|in\s+(my\s+)?cage)\b/i, label: 'currently locked claim' },
      { rx: /\bday\s+\d+\s+of\s+(chastity|denial|locked|cage)/i, label: 'day N locked' },
      { rx: /\b(my\s+)?cage\s+(is\s+)?(on|locked)\b/i, label: 'cage on/locked claim' },
    ];
    for (const { rx, label } of lockPatterns) {
      const m = text.match(rx);
      if (m) violations.push({ rule: `chastity fabrication: ${label} (Maxy is not currently locked)`, matched: m[0] });
    }
  }

  // Partner-name leak — if partnerName set, refuse to print it on public surfaces
  if (facts.partnerName && facts.partnerName.length > 0) {
    const partnerRx = new RegExp(`\\b${facts.partnerName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
    const m = text.match(partnerRx);
    if (m) violations.push({ rule: `partner name leak: "${facts.partnerName}" must not appear in public-facing copy`, matched: m[0] });
  }

  return { ok: violations.length === 0, violations };
}

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
