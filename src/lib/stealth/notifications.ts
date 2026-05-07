// Server-side neutralization for web-push.
//
// When a user has stealth_settings.neutral_notifications=true, every
// outbound push payload is replaced with a generic title/body before
// the AES-128-GCM encryption step in web-push-dispatch. The actual
// content is fetched after the user opens the notification.
//
// This module is imported BOTH from the React app (for tests + UI
// preview) and from the Deno edge function via a parallel copy at
// supabase/functions/_shared/stealth.ts. Keep the two in sync.

export const NEUTRAL_TITLE = 'New message';
export const NEUTRAL_BODY = 'Tap to view';

export interface PushPayloadInput {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface PushPayloadOutput {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

// Identifier-only data keys we'll preserve under stealth so the SW can
// still route the click to the right resource. Anything else is
// dropped — kind/type/category strings can themselves leak content.
const STEALTH_DATA_ALLOWLIST = new Set(['notification_id', 'id']);

export function neutralizePayload(input: PushPayloadInput, isStealthOn: boolean): PushPayloadOutput {
  if (isStealthOn) {
    const filtered: Record<string, unknown> = { stealth: true };
    for (const key of Object.keys(input.data || {})) {
      if (STEALTH_DATA_ALLOWLIST.has(key)) {
        filtered[key] = (input.data as Record<string, unknown>)[key];
      }
    }
    return {
      title: NEUTRAL_TITLE,
      body: NEUTRAL_BODY,
      data: filtered,
    };
  }
  return {
    title: input.title || 'Handler',
    body: input.body || '',
    data: { ...(input.data || {}) },
  };
}
