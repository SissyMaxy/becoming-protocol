/**
 * planOutreachCompletion — the single source of truth for how a tapped push
 * notification resolves into an API call (or deliberately does NOT).
 *
 * Used by useNotificationActionRouter (the in-app deep-link / postMessage path).
 * public/sw.js implements the SAME contract for the fire-from-the-worker path —
 * it is a classic service worker and cannot import this module, so the two MUST
 * be kept in parity (there is a parity note in sw.js and a source-parity
 * regression test in src/__tests__/lib/outreach-action.test.ts).
 *
 * THE LOAD-BEARING GUARD: a confession/photo task with NO reply text must never
 * be marked complete. Completing it would record an answer or a photo that never
 * happened — the inverse of the visible-before-penalized rule. Those tasks just
 * open the app (chat / photo-responder surface) so the user actually responds.
 */
export type OutreachPlan =
  | { endpoint: null; reason: 'no_outreach' | 'needs_content' }
  | { endpoint: 'reply'; body: { outreach_id: string; reply_text: string } }
  | { endpoint: 'complete'; body: { outreach_id: string } };

export function planOutreachCompletion(
  outreachId: string | null | undefined,
  replyText: string | null | undefined,
  actionKind: string | null | undefined,
): OutreachPlan {
  if (!outreachId) return { endpoint: null, reason: 'no_outreach' };

  const trimmed = (replyText || '').trim();

  // Empty open-tap on a task that needs content → do NOT auto-complete.
  if (!trimmed && (actionKind === 'confession' || actionKind === 'photo')) {
    return { endpoint: null, reason: 'needs_content' };
  }

  // Real words → answer it (any kind). No words on a plain/absent kind → mark done.
  if (trimmed) {
    return { endpoint: 'reply', body: { outreach_id: outreachId, reply_text: trimmed } };
  }
  return { endpoint: 'complete', body: { outreach_id: outreachId } };
}
