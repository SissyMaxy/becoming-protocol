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

// Sources whose pushes are ALWAYS neutralized — regardless of the
// user's stealth setting. Sniffies content is the user's most-private
// data; opting into a non-stealth UI for the rest of the app does not
// implicitly opt into hookup-chat content on a lock screen.
const FORCE_NEUTRAL_SOURCE_PREFIXES = ['sniffies', 'mommy_sniffies']

function hasForceNeutralSource(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false
  for (const key of ['source', 'notification_type', 'type', 'kind']) {
    const v = data[key]
    if (typeof v === 'string' && FORCE_NEUTRAL_SOURCE_PREFIXES.some((p) => v.startsWith(p))) {
      return true
    }
  }
  return false
}

export function neutralizePayload(input: PushPayloadInput, isStealthOn: boolean): PushPayloadOutput {
  const forceNeutral = hasForceNeutralSource(input.data)
  if (isStealthOn || forceNeutral) {
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
