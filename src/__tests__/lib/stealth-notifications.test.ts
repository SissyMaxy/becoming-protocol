import { describe, it, expect } from 'vitest';
import { neutralizePayload, NEUTRAL_TITLE, NEUTRAL_BODY } from '../../lib/stealth/notifications';

describe('stealth/notifications neutralizePayload', () => {
  it('passes payload through when stealth is off', () => {
    const out = neutralizePayload(
      { title: 'Mama', body: 'good girl, look how wet you are', data: { x: 1 } },
      false,
    );
    expect(out.title).toBe('Mama');
    expect(out.body).toBe('good girl, look how wet you are');
    expect(out.data).toEqual({ x: 1 });
  });

  it('replaces title and body with neutral strings when stealth is on', () => {
    const out = neutralizePayload(
      { title: 'Mama', body: 'put your panties back on, slut', data: { kind: 'mommy_outreach' } },
      true,
    );
    expect(out.title).toBe(NEUTRAL_TITLE);
    expect(out.body).toBe(NEUTRAL_BODY);
    expect(out.title).not.toContain('Mama');
    expect(out.body).not.toContain('panties');
  });

  it('keeps only the allowlisted routing id under stealth and drops content-typed keys', () => {
    const out = neutralizePayload(
      { title: 'Handler', body: 'edge for me', data: { notification_id: 'abc', kind: 'praise', type: 'mommy_outreach' } },
      true,
    );
    expect(out.data.notification_id).toBe('abc');
    expect(out.data.kind).toBeUndefined();
    expect(out.data.type).toBeUndefined();
    expect(out.data.stealth).toBe(true);
  });

  it('falls back to safe defaults when stealth is off and inputs are missing', () => {
    const out = neutralizePayload({}, false);
    expect(out.title).toBe('Handler');
    expect(out.body).toBe('');
    expect(out.data).toEqual({});
  });

  it('sample mommy outreach with kink content emits only generic strings under stealth', () => {
    // Concrete regression test: neutralized payload from a Mommy outreach
    // never contains any of the original kink-tagged text on the wire.
    const original = {
      title: 'Mama',
      body: 'come back to your panties, my hungry little girl, you are aching for me',
      data: { kind: 'mommy_tease' },
    };
    const out = neutralizePayload(original, true);
    const wire = JSON.stringify(out);
    expect(wire).not.toMatch(/panties|aching|girl|Mama|tease/i);
    expect(wire).toContain(NEUTRAL_TITLE);
    expect(wire).toContain(NEUTRAL_BODY);
  });

  // ─── Confession audio link sanitization ──────────────────────────────
  // Spec: confession audio (and any private storage URL) NEVER appears
  // in a push preview. Test both stealth on and off — the strip happens
  // in plain mode too, because previews are visible on lock screens.

  it('strips a Supabase signed-URL from the body in plain mode', () => {
    const out = neutralizePayload({
      title: 'Mama',
      body: 'listen to yourself say it https://atevwvexapiykchvqvhm.supabase.co/storage/v1/object/sign/audio/confessions/abc/123.webm?token=xyz',
      data: {},
    }, false);
    expect(out.body).not.toMatch(/storage\/v1\/object/);
    expect(out.body).not.toMatch(/audio\/confessions/);
    expect(out.body).toContain('listen to yourself say it');
  });

  it('strips bucket-prefixed object paths from the body', () => {
    // Realistic leak shape: the bucket name appears in the prefix because
    // most code that accidentally serializes a path includes the bucket
    // (it's how getPublicUrl + storage.from() output looked pre-mig 260).
    const out = neutralizePayload({
      title: 'Mama',
      body: 'press play baby — audio/confessions/abc/xyz.webm — Mama wants to hear it',
      data: {},
    }, false);
    expect(out.body).not.toMatch(/audio\/confessions\/abc\/xyz\.webm/);
    expect(out.body).toContain('press play');
  });

  it('drops URL-shaped values from the data dict in plain mode', () => {
    const out = neutralizePayload({
      title: 'Mama',
      body: 'message',
      data: {
        notification_id: 'abc',
        audio_url: 'https://atevwvexapiykchvqvhm.supabase.co/storage/v1/object/sign/audio/confessions/abc/123.webm',
        recall_confession_id: 'd5b9f1a2-1234-1234-1234-123456789abc',
      },
    }, false);
    expect(out.data.notification_id).toBe('abc');
    expect(out.data.audio_url).toBeUndefined();
    // Non-URL keys (UUIDs) survive — only URL-shaped strings are dropped
    expect(out.data.recall_confession_id).toBe('d5b9f1a2-1234-1234-1234-123456789abc');
  });

  it('under stealth, audio links are doubly-blocked: title+body neutral, data allowlisted', () => {
    const out = neutralizePayload({
      title: 'Listen to yourself say it',
      body: 'audio/confessions/abc/123.webm',
      data: {
        notification_id: 'n1',
        audio_url: 'https://x/storage/v1/object/sign/audio/confessions/abc/123.webm',
        kind: 'mommy_recall_audio',
      },
    }, true);
    expect(out.title).toBe(NEUTRAL_TITLE);
    expect(out.body).toBe(NEUTRAL_BODY);
    expect(JSON.stringify(out)).not.toMatch(/storage|webm|audio\/confessions|recall_audio/);
    // Allowlist preserved
    expect(out.data.notification_id).toBe('n1');
    expect(out.data.audio_url).toBeUndefined();
  });
});
