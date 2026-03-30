/**
 * Refusal filter — catches Claude content-filter refusals before they get posted.
 *
 * Without this, a refusal message like "I can't roleplay as this character..."
 * gets posted verbatim as a comment/reply. Ask me how I know.
 */

const REFUSAL_PATTERNS = [
  /i can'?t (roleplay|pretend|act as|play|write as|generate|create|engage|portray|produce)/i,
  /i'?m not (able|comfortable|willing|going) to/i,
  /i (cannot|won'?t|shouldn'?t) (help|assist|generate|create|write|produce|engage)/i,
  /as an ai/i,
  /content policy/i,
  /against my guidelines/i,
  /BDSM power/i,
  /this (scenario|request|prompt|character) (describes|involves|contains|depicts)/i,
  /i need to (decline|refuse|pass on)/i,
  /i'?m unable to/i,
  /violat(e|es|ing) .{0,30}(policy|guidelines|terms)/i,
  /sexual(ized)? content/i,
  /i apologize,? but/i,
  // Meta-refusals: model talks ABOUT the task instead of doing it
  /i don'?t have enough context/i,
  /i'?d be happy to (write|help|create|generate)/i,
  /if you can (share|provide|clarify|give)/i,
  /would violate/i,
  /the core rule/i,
  /without (understanding|knowing|more context)/i,
  /can'?t tell what (the|they)/i,
  /not enough (context|information|detail)/i,
  /genuine .{0,20} reply/i,
  /respond to what they actually/i,
  // Model breaks character to talk about the task
  /i can'?t reply to that/i,
  /not an actual tweet/i,
  /just a (string|number|sequence)/i,
  /did you (mean to|maybe) paste/i,
  /do you have the actual/i,
  /paste.{0,20}(wrong|tweet|link)/i,
  /what.{0,20}(actually|really) (about|say|mean)/i,
  /write.{0,20}(as|for) maxy/i,
  /in.?character/i,
  /authentic.{0,20}(reply|response|engage)/i,
  /i appreciate.{0,20}(testing|the vibe|the creative|you (setting|sharing))/i,
  // DM-specific refusals
  /i'?m going to pass on this/i,
  /wouldn'?t feel genuine/i,
  /social engineering/i,
  /manipulative/i,
  /crosses from/i,
  /happy to help with (other|different)/i,
  /can'?t write this (message|dm|reply)/i,
  /financial (exchange|domination|engagement)/i,
  /fake persona/i,
  /help.{0,20}refine/i,
  // Vision failures — model talks about not seeing an image
  /i don'?t.{0,20}see (an |the )?image/i,
  /didn'?t come through/i,
  /want to describe/i,
  /if there'?s a photo/i,
  /can'?t see (the |what )/i,
  /no (image|photo|picture) (in |attached|visible)/i,
  /on my end/i,
  /can'?t see the (image|link|photo|post)/i,
  /i'?m not sure what you'?re asking/i,
];

/**
 * Returns true if the text looks like a model refusal rather than actual content.
 */
export function isRefusal(text: string): boolean {
  for (const pattern of REFUSAL_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Validates a Claude API response. Returns the text if valid, null if refusal/empty.
 * Use this on every generation before posting anywhere.
 */
export function extractSafeText(
  response: { stop_reason: string | null; content: Array<{ type: string; text?: string }> },
  minLength: number = 10,
  label: string = 'Generation',
): string | null {
  if (response.stop_reason !== 'end_turn') {
    console.error(`[RefusalFilter] ${label}: unexpected stop_reason=${response.stop_reason}`);
    return null;
  }

  const block = response.content[0];
  const text = block?.type === 'text' && block.text ? block.text.trim() : '';

  if (!text || text.length < minLength) return null;

  if (isRefusal(text)) {
    console.error(`[RefusalFilter] ${label}: BLOCKED refusal — "${text.substring(0, 80)}..."`);
    return null;
  }

  // Strip wrapping quotes the model sometimes adds
  return text.replace(/^["']|["']$/g, '').trim();
}
