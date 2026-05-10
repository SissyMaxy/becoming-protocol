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

// Sources whose pushes are ALWAYS neutralized — regardless of the
// user's stealth setting. Sniffies content is the user's most-private
// data; opting into a non-stealth UI for the rest of the app does not
// implicitly opt into hookup-chat content on a lock screen.
const FORCE_NEUTRAL_SOURCE_PREFIXES = ['sniffies', 'mommy_sniffies'];

function hasForceNeutralSource(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  for (const key of ['source', 'notification_type', 'type', 'kind']) {
    const v = data[key];
    if (typeof v === 'string' && FORCE_NEUTRAL_SOURCE_PREFIXES.some((p) => v.startsWith(p))) {
      return true;
    }
  }
  return false;
}

export function neutralizePayload(input: PushPayloadInput, isStealthOn: boolean): PushPayloadOutput {
  const forceNeutral = hasForceNeutralSource(input.data);
  if (isStealthOn || forceNeutral) {
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
