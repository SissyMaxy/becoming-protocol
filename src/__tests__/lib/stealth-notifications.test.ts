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
});
