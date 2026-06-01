/**
 * Pop-Up Message Utilities
 * Enforces character limits on all pop-up messages (AI-generated and template).
 */

import type { PopUpMessage } from './types';
import { POPUP_LIMITS } from './types';

/**
 * Truncate text to a character limit at the last complete sentence boundary.
 * If no sentence boundary exists under the limit, truncates at last word boundary.
 */
export function truncateToLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;

  const truncated = text.slice(0, limit);

  // Try to find the last sentence boundary (. ! ?)
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
    // Also check if the last char is a sentence ender
    truncated.endsWith('.') ? truncated.length - 1 : -1,
    truncated.endsWith('!') ? truncated.length - 1 : -1,
    truncated.endsWith('?') ? truncated.length - 1 : -1,
  );

  if (lastSentenceEnd > 0) {
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }

  // No sentence boundary — truncate at last word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace).trim();
  }

  // Last resort: hard truncate
  return truncated.trim();
}

/**
 * Enforce character limits on a PopUpMessage.
 * Truncates title, body, and subtext at sentence/word boundaries.
 */
export function truncatePopUp(message: PopUpMessage): PopUpMessage {
  return {
    ...message,
    title: truncateToLimit(message.title, POPUP_LIMITS.title),
    body: truncateToLimit(message.body, POPUP_LIMITS.body),
    subtext: message.subtext
      ? truncateToLimit(message.subtext, POPUP_LIMITS.subtext)
      : undefined,
  };
}

/**
 * Character limits for non-PopUpMessage notification surfaces.
 * These render at larger font sizes / tighter layouts than PopUpMessage.
 */
export const NOTIFICATION_LIMITS = {
  /** InterventionNotification — renders at text-lg in a modal */
  interventionContent: 160,
  /** HandlerNotification — modal message body */
  handlerMessage: 120,
  /** CompletionToast — thin floating bar */
  toastAffirmation: 80,
  /** AmbushNotification — top banner instruction */
  ambushInstruction: 120,
} as const;

/**
 * Validate that a PopUpMessage respects all character limits.
 * Returns an array of violations (empty = valid).
 */
export function validatePopUp(message: PopUpMessage): string[] {
  const violations: string[] = [];

  if (message.title.length > POPUP_LIMITS.title) {
    violations.push(`Title exceeds ${POPUP_LIMITS.title} chars (got ${message.title.length})`);
  }
  if (message.body.length > POPUP_LIMITS.body) {
    violations.push(`Body exceeds ${POPUP_LIMITS.body} chars (got ${message.body.length})`);
  }
  if (message.subtext && message.subtext.length > POPUP_LIMITS.subtext) {
    violations.push(`Subtext exceeds ${POPUP_LIMITS.subtext} chars (got ${message.subtext.length})`);
  }

  return violations;
}
