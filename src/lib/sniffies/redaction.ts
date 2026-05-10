// Sniffies redaction — strip phones, addresses, financial info from
// extracted chat content BEFORE it lands in sniffies_chat_messages.
//
// Twin file: supabase/functions/_shared/sniffies-redaction.ts. Keep in
// sync. Pattern-lint enforces twin-equivalence at CI time (same model
// as supabase/functions/_shared/dommy-mommy.ts ↔ src/lib/persona/dommy-mommy.ts).
//
// The contract: redact() returns the cleaned text plus a list of flags
// describing what was found. If any flag fires, the import is held in
// 'manual_review' instead of 'processed' so the user can confirm the
// redaction is acceptable before persona use.

export type RedactionFlag =
  | 'phone'
  | 'street_address'
  | 'email'
  | 'credit_card'
  | 'ssn'
  | 'iban'
  | 'venmo_handle'
  | 'cashapp_handle';

export interface RedactionResult {
  text: string;
  flags: RedactionFlag[];
}

const PHONE_RE = /\b(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Loose street-address heuristic: number + 1-3 capitalized words +
// suffix (st/ave/blvd/...). Catches the obvious cases without trying to
// be a full NER pass.
const STREET_RE =
  /\b\d{1,5}\s+(?:[A-Z][A-Za-z]+\s+){1,4}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway)\.?\b/g;
// Conservative card matcher — Luhn-checked digit run of 13-19, with
// common spacing variations.
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const VENMO_RE = /(?:^|\s)@[A-Za-z0-9_-]{3,30}\b(?=.{0,40}(?:venmo|pay|tribute|cash))/gi;
const CASHAPP_RE = /\$[A-Za-z][A-Za-z0-9_-]{1,29}\b/g;

function luhnValid(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function redact(text: string): RedactionResult {
  if (!text) return { text: '', flags: [] };
  const flags = new Set<RedactionFlag>();
  let out = text;

  out = out.replace(PHONE_RE, () => {
    flags.add('phone');
    return '[redacted-phone]';
  });
  out = out.replace(EMAIL_RE, () => {
    flags.add('email');
    return '[redacted-email]';
  });
  out = out.replace(STREET_RE, () => {
    flags.add('street_address');
    return '[redacted-address]';
  });
  out = out.replace(CARD_RE, (m) => {
    if (luhnValid(m)) {
      flags.add('credit_card');
      return '[redacted-card]';
    }
    return m;
  });
  out = out.replace(SSN_RE, () => {
    flags.add('ssn');
    return '[redacted-ssn]';
  });
  out = out.replace(IBAN_RE, (m) => {
    // IBAN check: country code + 2 digits + 11-30 alphanumeric. Don't
    // misclassify long all-caps acronyms.
    if (/^[A-Z]{2}\d{2}/.test(m)) {
      flags.add('iban');
      return '[redacted-iban]';
    }
    return m;
  });
  out = out.replace(VENMO_RE, () => {
    flags.add('venmo_handle');
    return '[redacted-payment-handle]';
  });
  out = out.replace(CASHAPP_RE, () => {
    flags.add('cashapp_handle');
    return '[redacted-payment-handle]';
  });

  return { text: out, flags: Array.from(flags) };
}

// Returns true when the redaction signal is strong enough to hold the
// row in 'manual_review' rather than auto-processing it. Caller writes
// to redaction_flags JSONB on sniffies_chat_imports.
export function shouldHoldForReview(flags: RedactionFlag[]): boolean {
  if (flags.length === 0) return false;
  // Anything financial = always hold.
  if (
    flags.includes('credit_card') ||
    flags.includes('ssn') ||
    flags.includes('iban') ||
    flags.includes('venmo_handle') ||
    flags.includes('cashapp_handle')
  ) {
    return true;
  }
  // Address or 2+ phone/email = hold.
  if (flags.includes('street_address')) return true;
  if (flags.length >= 2) return true;
  return false;
}
