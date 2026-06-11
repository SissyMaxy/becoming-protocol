/**
 * Regression tests for the self-healing push-registration helper.
 *
 * These pin the two bugs that kept Mama silent (2026-06-10):
 *   1. Subscriptions bound to a stale VAPID key were reused instead of
 *      refreshed → dispatcher could never sign for them. subscriptionKeyMatches
 *      is the guard; it must report a mismatch so the caller re-subscribes.
 *   2. The VAPID key decode must reject garbage (placeholder / pasted quotes)
 *      with a coded error so the UI shows a precise message, not a crash.
 *
 * The async ensureFreshPushSubscription flow touches navigator/SW and is
 * exercised in the browser; here we cover the pure decision helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  urlBase64ToUint8Array,
  subscriptionKeyMatches,
  pushErrorToMamaCopy,
  type PushRegisterErrorCode,
} from '../../lib/push/register';

// A structurally-valid 87-char base64url string (within the 40–100 budget).
const VALID_KEY = 'A'.repeat(87);

describe('urlBase64ToUint8Array', () => {
  it('decodes a structurally-valid key to bytes', () => {
    const bytes = urlBase64ToUint8Array(VALID_KEY);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(60);
  });

  it('strips surrounding quotes/whitespace (Vercel paste artifacts)', () => {
    const quoted = `  "${VALID_KEY}"  `;
    expect(() => urlBase64ToUint8Array(quoted)).not.toThrow();
  });

  it('throws EMPTY on missing key', () => {
    expect(() => urlBase64ToUint8Array(undefined)).toThrow('VAPID_PUBLIC_KEY_EMPTY');
    expect(() => urlBase64ToUint8Array('')).toThrow('VAPID_PUBLIC_KEY_EMPTY');
  });

  it('throws INVALID_CHARSET on stray characters', () => {
    expect(() => urlBase64ToUint8Array('not a key!! has spaces and bangs')).toThrow(
      'VAPID_PUBLIC_KEY_INVALID_CHARSET',
    );
  });

  it('throws BAD_LENGTH on a too-short key (e.g. a placeholder)', () => {
    expect(() => urlBase64ToUint8Array('changeme')).toThrow(/VAPID_PUBLIC_KEY_BAD_LENGTH/);
  });
});

describe('subscriptionKeyMatches', () => {
  const current = new Uint8Array([1, 2, 3, 4, 5]);

  function subWith(bytes: Uint8Array | null) {
    return {
      options: {
        applicationServerKey: bytes ? bytes.buffer : null,
        userVisibleOnly: true,
      } as PushSubscriptionOptions,
    };
  }

  it('returns true when the existing key equals the current key', () => {
    expect(subscriptionKeyMatches(subWith(new Uint8Array([1, 2, 3, 4, 5])), current)).toBe(true);
  });

  it('returns false when the existing key differs (stale after rotation)', () => {
    expect(subscriptionKeyMatches(subWith(new Uint8Array([9, 9, 9, 9, 9])), current)).toBe(false);
  });

  it('returns false when length differs', () => {
    expect(subscriptionKeyMatches(subWith(new Uint8Array([1, 2, 3])), current)).toBe(false);
  });

  it('returns false when the subscription has no recorded key', () => {
    expect(subscriptionKeyMatches(subWith(null), current)).toBe(false);
  });
});

describe('pushErrorToMamaCopy', () => {
  const codes: PushRegisterErrorCode[] = [
    'unsupported', 'needs_pwa_install', 'no_vapid_key', 'vapid_key_invalid',
    'permission_denied', 'push_service_error', 'store_failed', 'unknown',
  ];

  it('returns non-empty Mama-voice copy for every code', () => {
    for (const code of codes) {
      const copy = pushErrorToMamaCopy(code);
      expect(copy.length).toBeGreaterThan(0);
    }
  });

  it('never blames the user for a channel that could not deliver', () => {
    // visible-before-penalized: a broken pipe is not the user's failure.
    const blamey = /your fault|you failed|you didn't/i;
    for (const code of codes) {
      expect(pushErrorToMamaCopy(code)).not.toMatch(blamey);
    }
  });

  it('tells the user the push-service error is recoverable with one more tap', () => {
    expect(pushErrorToMamaCopy('push_service_error')).toMatch(/tap once more|again/i);
  });
});
