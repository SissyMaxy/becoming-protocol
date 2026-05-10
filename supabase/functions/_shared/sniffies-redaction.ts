// Edge-fn twin of src/lib/sniffies/redaction.ts. Keep these two files
// in sync — the rule is enforced by scripts/handler-regression/pattern-lint.mjs
// (same shared-twin pattern as dommy-mommy.ts ↔ src/lib/persona/dommy-mommy.ts).

export type RedactionFlag =
  | 'phone'
  | 'street_address'
  | 'email'
  | 'credit_card'
  | 'ssn'
  | 'iban'
  | 'venmo_handle'
  | 'cashapp_handle'

export interface RedactionResult {
  text: string
  flags: RedactionFlag[]
}

const PHONE_RE = /\b(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const STREET_RE =
  /\b\d{1,5}\s+(?:[A-Z][A-Za-z]+\s+){1,4}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway)\.?\b/g
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g
const VENMO_RE = /(?:^|\s)@[A-Za-z0-9_-]{3,30}\b(?=.{0,40}(?:venmo|pay|tribute|cash))/gi
const CASHAPP_RE = /\$[A-Za-z][A-Za-z0-9_-]{1,29}\b/g

function luhnValid(input: string): boolean {
  const digits = input.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

export function redact(text: string): RedactionResult {
  if (!text) return { text: '', flags: [] }
  const flags = new Set<RedactionFlag>()
  let out = text

  out = out.replace(PHONE_RE, () => { flags.add('phone'); return '[redacted-phone]' })
  out = out.replace(EMAIL_RE, () => { flags.add('email'); return '[redacted-email]' })
  out = out.replace(STREET_RE, () => { flags.add('street_address'); return '[redacted-address]' })
  out = out.replace(CARD_RE, (m) => {
    if (luhnValid(m)) { flags.add('credit_card'); return '[redacted-card]' }
    return m
  })
  out = out.replace(SSN_RE, () => { flags.add('ssn'); return '[redacted-ssn]' })
  out = out.replace(IBAN_RE, (m) => {
    if (/^[A-Z]{2}\d{2}/.test(m)) { flags.add('iban'); return '[redacted-iban]' }
    return m
  })
  out = out.replace(VENMO_RE, () => { flags.add('venmo_handle'); return '[redacted-payment-handle]' })
  out = out.replace(CASHAPP_RE, () => { flags.add('cashapp_handle'); return '[redacted-payment-handle]' })

  return { text: out, flags: Array.from(flags) }
}

export function shouldHoldForReview(flags: RedactionFlag[]): boolean {
  if (flags.length === 0) return false
  if (
    flags.includes('credit_card') ||
    flags.includes('ssn') ||
    flags.includes('iban') ||
    flags.includes('venmo_handle') ||
    flags.includes('cashapp_handle')
  ) {
    return true
  }
  if (flags.includes('street_address')) return true
  if (flags.length >= 2) return true
  return false
}
