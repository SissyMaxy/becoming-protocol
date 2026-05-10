import { describe, it, expect } from 'vitest';
import { redact, shouldHoldForReview } from '../../lib/sniffies/redaction';

describe('sniffies/redaction', () => {
  it('strips US phone numbers', () => {
    const r = redact('Call me at 555-867-5309 tonight.');
    expect(r.text).not.toMatch(/555/);
    expect(r.text).toContain('[redacted-phone]');
    expect(r.flags).toContain('phone');
  });

  it('strips emails', () => {
    const r = redact('Email is dave@example.com if you wanna meet');
    expect(r.text).not.toContain('dave@example.com');
    expect(r.text).toContain('[redacted-email]');
    expect(r.flags).toContain('email');
  });

  it('strips street addresses', () => {
    const r = redact('Come to 123 Main St later, second floor.');
    expect(r.text).not.toContain('123 Main St');
    expect(r.text).toContain('[redacted-address]');
    expect(r.flags).toContain('street_address');
  });

  it('strips Luhn-valid credit card numbers', () => {
    // 4242 4242 4242 4242 is the canonical Luhn-valid Visa test card.
    const r = redact('Tribute via 4242 4242 4242 4242, please.');
    expect(r.text).not.toContain('4242 4242');
    expect(r.text).toContain('[redacted-card]');
    expect(r.flags).toContain('credit_card');
  });

  it('does NOT redact non-Luhn long digit sequences (e.g., order numbers)', () => {
    const r = redact('Reference number 1111111111111111 is on file.');
    expect(r.flags).not.toContain('credit_card');
  });

  it('strips SSN', () => {
    const r = redact('Sent over my SSN 123-45-6789 last week.');
    expect(r.text).not.toContain('123-45-6789');
    expect(r.flags).toContain('ssn');
  });

  it('strips Cash App handles', () => {
    const r = redact('My Cash App is $DaveSlut send tribute');
    expect(r.text).not.toContain('$DaveSlut');
    expect(r.flags).toContain('cashapp_handle');
  });

  it('passes clean text untouched', () => {
    const txt = 'I want to wear panties to the grocery store and feel cute.';
    const r = redact(txt);
    expect(r.text).toBe(txt);
    expect(r.flags).toEqual([]);
  });

  it('handles empty input', () => {
    expect(redact('').text).toBe('');
    expect(redact('').flags).toEqual([]);
  });

  it('shouldHoldForReview returns true when financial info is present', () => {
    expect(shouldHoldForReview(['credit_card'])).toBe(true);
    expect(shouldHoldForReview(['ssn'])).toBe(true);
    expect(shouldHoldForReview(['cashapp_handle'])).toBe(true);
  });

  it('shouldHoldForReview returns true when an address is present', () => {
    expect(shouldHoldForReview(['street_address'])).toBe(true);
  });

  it('shouldHoldForReview returns true when 2+ flags fire', () => {
    expect(shouldHoldForReview(['phone', 'email'])).toBe(true);
  });

  it('shouldHoldForReview returns false for a single phone hit alone', () => {
    expect(shouldHoldForReview(['phone'])).toBe(false);
  });

  it('shouldHoldForReview returns false for empty flags', () => {
    expect(shouldHoldForReview([])).toBe(false);
  });
});
