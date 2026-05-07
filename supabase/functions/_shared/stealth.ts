// Edge-fn parallel copy of src/lib/stealth/notifications.ts.
// Keep these two files in sync — the rule is enforced by
// scripts/handler-regression/pattern-lint.mjs (see dommy-mommy.ts for
// the same shared-twin pattern).

export const NEUTRAL_TITLE = 'New message'
export const NEUTRAL_BODY = 'Tap to view'

export interface PushPayloadInput {
  title?: string
  body?: string
  data?: Record<string, unknown>
}

export interface PushPayloadOutput {
  title: string
  body: string
  data: Record<string, unknown>
}

const STEALTH_DATA_ALLOWLIST = new Set(['notification_id', 'id'])

export function neutralizePayload(input: PushPayloadInput, isStealthOn: boolean): PushPayloadOutput {
  if (isStealthOn) {
    const filtered: Record<string, unknown> = { stealth: true }
    for (const key of Object.keys(input.data || {})) {
      if (STEALTH_DATA_ALLOWLIST.has(key)) {
        filtered[key] = (input.data as Record<string, unknown>)[key]
      }
    }
    return {
      title: NEUTRAL_TITLE,
      body: NEUTRAL_BODY,
      data: filtered,
    }
  }
  return {
    title: input.title || 'Handler',
    body: input.body || '',
    data: { ...(input.data || {}) },
  }
}
