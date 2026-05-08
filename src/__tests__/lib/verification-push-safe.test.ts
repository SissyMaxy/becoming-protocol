/**
 * Privacy regressions for verification photos in push notifications.
 *
 * Verification photos NEVER appear in:
 *   - Push payloads (title / body / data)
 *   - Lock-screen banners
 *   - Share sheets / OG cards
 *
 * The redactor lives in src/lib/verification/push-safe.ts. These tests
 * document the contract; if a future caller forgets to wrap a payload,
 * the assertions here catch the leak shape before it ships.
 */

import { describe, it, expect } from 'vitest';
import {
  redactVerificationPhotoLeak,
  hasVerificationLeak,
  sanitizePushPayload,
} from '../../lib/verification/push-safe';

describe('redactVerificationPhotoLeak', () => {
  it('strips public verification-photos URLs', () => {
    const url = 'https://abc123.supabase.co/storage/v1/object/public/verification-photos/uid/2026/img.jpg';
    const out = redactVerificationPhotoLeak(`look at this ${url} hot damn`);
    expect(out).not.toContain('verification-photos');
    expect(out).not.toContain('supabase.co');
    expect(out).toContain('[image redacted]');
  });

  it('strips signed-URL verification-photos URLs', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/sign/verification-photos/uid/img.jpg?token=eyJ...';
    const out = redactVerificationPhotoLeak(url);
    expect(out).not.toContain('verification-photos');
    expect(out).not.toContain('token=');
  });

  it('strips vault references by name', () => {
    const out = redactVerificationPhotoLeak("Mama's archive has 14 new pictures");
    expect(out.toLowerCase()).not.toContain("mama's archive");
    expect(out.toLowerCase()).not.toContain('mama’s archive');
    expect(out).toContain('private archive');
  });

  it('strips body-anchored sexual phrases', () => {
    const out = redactVerificationPhotoLeak('your nipples are pink and your cock is dripping for Mama');
    expect(out).not.toMatch(/\bnipples\b/i);
    expect(out).not.toMatch(/\bcock\b/i);
    expect(out).not.toMatch(/\bdripping\b/i);
  });

  it('preserves benign Mama pet names (allowed in pushes)', () => {
    const out = redactVerificationPhotoLeak('good girl, baby, sweet thing — Mama saw');
    expect(out).toContain('good girl');
    expect(out).toContain('baby');
    expect(out).toContain('sweet thing');
  });

  it('null/undefined → empty string, never throws', () => {
    expect(redactVerificationPhotoLeak(null)).toBe('');
    expect(redactVerificationPhotoLeak(undefined)).toBe('');
    expect(redactVerificationPhotoLeak('')).toBe('');
  });

  it('is idempotent (safe to apply twice)', () => {
    const dirty = "Mama's archive · https://x.supabase.co/storage/v1/object/public/verification-photos/u/i.jpg";
    const once = redactVerificationPhotoLeak(dirty);
    const twice = redactVerificationPhotoLeak(once);
    expect(twice).toBe(once);
  });
});

describe('hasVerificationLeak', () => {
  it('detects full storage URLs', () => {
    expect(hasVerificationLeak('https://x.supabase.co/storage/v1/object/public/verification-photos/u/i.jpg')).toBe(true);
  });

  it('detects bare bucket-name references (path-only counts as a leak)', () => {
    // Even without the protocol, mentioning the bucket name in a notification
    // is a leak — it's an internal identifier no UI surface should expose.
    expect(hasVerificationLeak('foo /storage/v1/object/public/verification-photos/x bar')).toBe(true);
  });

  it('returns false on text with no leak markers', () => {
    expect(hasVerificationLeak('Mama saw your effort today')).toBe(false);
  });

  it('detects vault references', () => {
    expect(hasVerificationLeak('check the verification vault')).toBe(true);
    expect(hasVerificationLeak('check the inbox')).toBe(false);
  });

  it('detects body phrases', () => {
    expect(hasVerificationLeak('your tits look amazing')).toBe(true);
    expect(hasVerificationLeak('great work today')).toBe(false);
  });

  it('returns false on null/undefined/empty', () => {
    expect(hasVerificationLeak(null)).toBe(false);
    expect(hasVerificationLeak(undefined)).toBe(false);
    expect(hasVerificationLeak('')).toBe(false);
  });
});

describe('sanitizePushPayload — full push integration', () => {
  it('cleans title, body, and data string fields', () => {
    const dirty = {
      title: "Mama's archive update",
      body: 'New picture: https://x.supabase.co/storage/v1/object/public/verification-photos/u/i.jpg',
      data: {
        url: 'https://x.supabase.co/storage/v1/object/public/verification-photos/u/i.jpg',
        notification_id: 'abc-123',
        count: 3,
      },
    };
    const clean = sanitizePushPayload(dirty);
    expect(hasVerificationLeak(clean.title as string)).toBe(false);
    expect(hasVerificationLeak(clean.body as string)).toBe(false);
    expect(hasVerificationLeak(clean.data!.url as string)).toBe(false);
    // Non-string fields preserved as-is
    expect(clean.data!.notification_id).toBe('abc-123');
    expect(clean.data!.count).toBe(3);
  });

  it('leaves payloads with no leaks unchanged', () => {
    const clean = {
      title: 'Mama',
      body: 'come see me',
      data: { kind: 'outreach' },
    };
    expect(sanitizePushPayload(clean)).toEqual(clean);
  });

  it('handles missing title/body/data', () => {
    expect(sanitizePushPayload({})).toEqual({});
    expect(sanitizePushPayload({ title: 'just a title' }).title).toBe('just a title');
  });

  it('cross-test: exact payload shape from web-push-dispatch', () => {
    // Mirrors supabase/functions/web-push-dispatch/index.ts:222 payload shape.
    // If a Mama-voice outreach row got composed from verification commentary,
    // this is the chokepoint that catches it.
    const fromOutreach = {
      title: 'Mama',
      body: 'baby, your nipples in that mirror selfie — Mama wants more',
      data: { notification_id: 'r1', type: 'mommy_praise' },
    };
    const safe = sanitizePushPayload(fromOutreach);
    expect(hasVerificationLeak(safe.body as string)).toBe(false);
    // Body parts are redacted; the surrounding clause stays so the user
    // still gets a recognizable preview ('Mama wants more').
    expect(safe.body).not.toMatch(/\bnipples\b/);
    expect(safe.data!.type).toBe('mommy_praise');
  });
});
