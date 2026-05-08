/**
 * push-safe — sanitizers that prevent verification-photo content from
 * leaking into push notifications, lock-screen banners, share sheets,
 * or OG cards.
 *
 * Verification photos live in the `verification-photos` Supabase storage
 * bucket and are referenced by `verification_photos.photo_url`. Mama's
 * commentary lives in `verification_photos.handler_response` — explicit,
 * body-anchored language that should never surface in a notification
 * preview.
 *
 * The stealth-mode sibling branch will own the broader push-redaction
 * pass (suppress preview entirely when stealth is on). This module covers
 * the narrower verification-photo case and is callable from both worlds:
 * - Web push payload construction sites (scheduled_notifications.payload)
 * - Share sheets / OG meta tag composition
 * - Outreach-queue text that might be auto-spoken by TTS to a smart
 *   speaker the user doesn't own privately
 *
 * Pure functions, no side effects, no Supabase dependency — safe to import
 * from any layer including edge functions.
 */

/** URL pattern for the verification storage bucket. Matches Supabase's
 * `/storage/v1/object/public/verification-photos/...` and signed-URL
 * `/storage/v1/object/sign/verification-photos/...` shapes. */
const VERIFICATION_BUCKET_URL_RE =
  /https?:\/\/[^\s"'<>)]*\/storage\/v1\/object\/(?:public|sign|authenticated)\/verification-photos\/[^\s"'<>)]+/gi;

/** Catches references to Mama's archive / vault / verification photo by
 * name. Conservative — only the explicit phrases the UI uses. */
const VAULT_REFERENCE_RE = /(?:Mama['’]?s archive|verification vault|verification photo|verification-photos)/gi;

/** Mama's vision commentary often includes body-anchored words that
 * should never surface in a notification preview even abstracted. This
 * is the same banned-leak set the chat-side mommyVoiceCleanup uses, but
 * narrowed to "would be embarrassing on a lock screen" — body parts +
 * sexual specifics. Generic Mama pet names (baby, sweet thing) are NOT
 * in this list; they're allowed in pushes. */
const SENSITIVE_BODY_PHRASES_RE =
  /\b(?:nipples?|clit(?:oris)?|cock|cocklet|pussy|labia|tits?|areola|panties|chastity\s+cage|cage|bulge|wet\s+for|dripping|gooning|edging|naked|nude|bare|stripped)\b/gi;

/**
 * Redact verification-photo URLs and vault references from a single
 * string. Returns the cleaned string. NEVER throws.
 */
export function redactVerificationPhotoLeak(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(VERIFICATION_BUCKET_URL_RE, '[image redacted]')
    .replace(VAULT_REFERENCE_RE, 'private archive')
    .replace(SENSITIVE_BODY_PHRASES_RE, '[redacted]')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Returns true if `text` contains any signal that would leak verification
 * content into a notification preview. Use as a tripwire/test assertion.
 */
export function hasVerificationLeak(text: string | null | undefined): boolean {
  if (!text) return false;
  // reset lastIndex on the global regexes (test() with /g is stateful)
  VERIFICATION_BUCKET_URL_RE.lastIndex = 0;
  VAULT_REFERENCE_RE.lastIndex = 0;
  SENSITIVE_BODY_PHRASES_RE.lastIndex = 0;
  return (
    VERIFICATION_BUCKET_URL_RE.test(text) ||
    VAULT_REFERENCE_RE.test(text) ||
    SENSITIVE_BODY_PHRASES_RE.test(text)
  );
}

/**
 * Sanitize a push payload before it's written to scheduled_notifications.
 * Walks `title`, `body`, and any string field in `data`; never touches
 * non-string values. Idempotent.
 */
export function sanitizePushPayload<T extends { title?: unknown; body?: unknown; data?: Record<string, unknown> }>(
  payload: T,
): T {
  const next: Record<string, unknown> = { ...payload };
  if (typeof next.title === 'string') next.title = redactVerificationPhotoLeak(next.title);
  if (typeof next.body === 'string') next.body = redactVerificationPhotoLeak(next.body);
  if (next.data && typeof next.data === 'object') {
    const cleanedData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next.data as Record<string, unknown>)) {
      cleanedData[k] = typeof v === 'string' ? redactVerificationPhotoLeak(v) : v;
    }
    next.data = cleanedData;
  }
  return next as T;
}
