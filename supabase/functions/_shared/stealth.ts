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

// Storage-link patterns. We strip these from push body text in BOTH
// stealth and plain mode — confession audio (and any other private
// asset URL) never belongs in a notification preview.
const STORAGE_URL_PATTERNS: ReadonlyArray<RegExp> = [
  /https?:\/\/[^\s]*\/storage\/v1\/object\/[^\s]*/gi,
  /\b(?:audio|evidence|verification-photos|voice-recordings|progress-photos)\/[^\s]+\.(?:webm|ogg|wav|mp3|m4a|mp4|jpg|jpeg|png|webp)\b/gi,
  /data:audio\/[^\s]+/gi,
]

function stripStorageRefs(text: string): string {
  let out = text
  for (const re of STORAGE_URL_PATTERNS) out = out.replace(re, '')
  return out.replace(/\s{2,}/g, ' ').trim()
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
  // Plain mode — still strip storage refs from the body and drop
  // any audio-link-shaped keys from the data dict. The signed URL
  // for confession audio NEVER appears in a push payload.
  const cleanedBody = stripStorageRefs(input.body || '')
  const cleanedData: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input.data || {})) {
    if (typeof v === 'string' && STORAGE_URL_PATTERNS.some(re => { re.lastIndex = 0; return re.test(v) })) {
      continue
    }
    cleanedData[k] = v
  }
  return {
    title: stripStorageRefs(input.title || '') || 'Handler',
    body: cleanedBody,
    data: cleanedData,
  }
}
