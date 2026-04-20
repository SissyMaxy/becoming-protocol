/**
 * PII / meetup guardrail for outbound messages.
 *
 * Runs before any reply, DM, or chat is sent. Refuses the send if the outbound
 * text would leak location/contact info, or if the conversation is drifting
 * into meet-logistics that the Handler is NOT allowed to negotiate on its own.
 *
 * Philosophy: the bot talks, it doesn't negotiate. Flirty banter = fine.
 * Address/phone/meetup planning = hard refuse, flagged for the Handler to handle.
 */

export interface OutboundCheck {
  safe: boolean;
  reason?: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface InboundSignal {
  meetupIntent: boolean;
  askedForAddress: boolean;
  askedForPhone: boolean;
  askedForPic: boolean;
  keywords: string[];
}

// ── Outbound patterns — things the bot must not say ─────────────────

// US street address pattern: 1-5 digits + word(s) + street suffix
const STREET_ADDRESS = /\b\d{1,5}\s+[A-Za-z][A-Za-z\s]{0,30}\s+(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|court|ct\.?|place|pl\.?|highway|hwy\.?|parkway|pkwy\.?)\b/i;

// ZIP / postal code (US 5-digit or 5+4)
const ZIP_CODE = /\b\d{5}(?:-\d{4})?\b/;

// US phone number — various formats
const PHONE_NUMBER = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;

// Apartment / unit markers + number — weak signal, combined with other signals
const APARTMENT = /\b(?:apt|apartment|unit|suite|ste|#)\s*\d+\w?\b/i;

// Email address
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

// Phrases that commit to a specific meet (the bot should never do this)
const MEET_COMMIT = [
  /\bi['']?ll be (?:at|there|waiting|ready|outside|home)\b/i,
  /\b(?:come (?:over|by)|meet me|find me)\s+(?:at|to|in)\s+/i,
  /\b(?:my|the)\s+(?:place|house|apartment|apt|hotel)\s+(?:is|at)\s+/i,
  /\b(?:pick me up|pull up)\s+(?:at|to|around)\s+/i,
  /\bsee you (?:at|in|around)\s+(?:\d|tonight|tomorrow|today|in\s+\d)/i,
];

// Sharing a city + specific venue suggestion — also off-limits
const SPECIFIC_VENUE = /\b(?:meet (?:me )?at|let['']?s (?:go|meet) to|come to)\s+[A-Z][a-z]+(?:[\s&'-][A-Z][a-z]+){0,4}\b/;

// ── Inbound signals — things that should trigger Handler escalation ─

const MEETUP_KEYWORDS = [
  'meet up', 'meet-up', 'meetup', 'hook up', 'hookup', 'hook-up',
  'come over', 'come by', 'come thru', 'come through',
  'your place', 'my place', 'your house', 'my house',
  'what\'s your address', 'whats your address', 'drop your address',
  'send address', 'send your location', 'share location',
  'where do you live', 'where r u', 'where are you',
  'your number', 'whats your number', 'drop your number',
  'send pic', 'send pics', 'send a pic', 'send a picture',
  'face pic', 'face pics',
  'tonight', 'right now', 'available now', 'free tonight',
];

const ADDRESS_REQUEST = /\b(?:address|location|where (?:do )?(?:you|u) (?:live|stay|at))\b/i;
const PHONE_REQUEST = /\b(?:number|phone|digits|text me|whatsapp|snap(?:chat)?|insta(?:gram)?|kik|telegram)\b/i;
const PIC_REQUEST = /\b(?:pic|pics|picture|selfie|face pic|body shot|nude|nudes)\b/i;

/**
 * Scan an outbound message. Block if it contains PII, addresses, or meet-commits.
 */
export function checkOutboundSafety(text: string): OutboundCheck {
  if (!text) return { safe: true };

  // High-severity: verbatim PII
  if (STREET_ADDRESS.test(text)) {
    return { safe: false, severity: 'high', reason: 'outbound contains street address' };
  }
  if (PHONE_NUMBER.test(text)) {
    return { safe: false, severity: 'high', reason: 'outbound contains phone number' };
  }
  if (EMAIL.test(text)) {
    return { safe: false, severity: 'high', reason: 'outbound contains email' };
  }

  // Medium: ZIP alone (could be a false positive from a year or ID — require context)
  if (ZIP_CODE.test(text) && (APARTMENT.test(text) || /\b(?:city|state|zip)\b/i.test(text))) {
    return { safe: false, severity: 'high', reason: 'outbound contains zip + address context' };
  }

  // Medium: meet-commit phrasing
  for (const pat of MEET_COMMIT) {
    if (pat.test(text)) {
      return { safe: false, severity: 'medium', reason: 'outbound commits to specific meet logistics' };
    }
  }

  // Medium: specific venue proposal
  if (SPECIFIC_VENUE.test(text)) {
    return { safe: false, severity: 'medium', reason: 'outbound proposes specific venue' };
  }

  return { safe: true };
}

/**
 * Scan an inbound message. Returns signals the Handler should react to.
 * If meetupIntent or askedForAddress is true, the bot should suppress its
 * reply and let the operator (you) decide how to handle it.
 */
export function scanInboundSignals(text: string): InboundSignal {
  if (!text) {
    return { meetupIntent: false, askedForAddress: false, askedForPhone: false, askedForPic: false, keywords: [] };
  }
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const kw of MEETUP_KEYWORDS) {
    if (lower.includes(kw)) found.push(kw);
  }
  return {
    meetupIntent: found.length > 0,
    askedForAddress: ADDRESS_REQUEST.test(text),
    askedForPhone: PHONE_REQUEST.test(text),
    askedForPic: PIC_REQUEST.test(text),
    keywords: found,
  };
}

/**
 * Convenience: if inbound asks for address/phone/meetup AND the outbound
 * reply contains anything substantive, we override and return a safe deflection.
 * This is the bot's "I don't negotiate logistics" fallback.
 */
/**
 * Combined guard: given inbound + proposed outbound, decide what to do.
 * Returns one of:
 *   - { action: 'send' }                        — proceed normally
 *   - { action: 'deflect', text }               — replace outbound with safe deflection
 *   - { action: 'suppress', reason }             — do not send anything, flag for human review
 */
export function gateOutbound(inbound: string | undefined, outbound: string): (
  | { action: 'send' }
  | { action: 'deflect'; text: string; inboundSignal: InboundSignal }
  | { action: 'suppress'; reason: string; severity: 'low'|'medium'|'high' }
) {
  // Block on outbound PII first — non-negotiable.
  const out = checkOutboundSafety(outbound);
  if (!out.safe) {
    return { action: 'suppress', reason: out.reason || 'unsafe outbound', severity: out.severity || 'medium' };
  }

  // If inbound asked for logistics, deflect instead of sending the generated reply.
  const sig = scanInboundSignals(inbound || '');
  if (sig.askedForAddress || sig.askedForPhone || sig.meetupIntent) {
    const deflect = deflectionReply(sig);
    if (deflect) return { action: 'deflect', text: deflect, inboundSignal: sig };
  }

  return { action: 'send' };
}

export function deflectionReply(signal: InboundSignal): string | null {
  if (signal.askedForAddress) {
    return "not dropping that in chat, hun. if we're gonna link up you'll get details when it's time";
  }
  if (signal.askedForPhone) {
    return "stay on here for now";
  }
  if (signal.meetupIntent) {
    return "i'm not making plans right this second. keep my attention first";
  }
  return null;
}
