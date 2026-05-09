// Regression: Sniffies content NEVER reaches the wire of a push
// notification. The neutralizer force-neutralizes when source/type
// indicates Sniffies origin, regardless of the user's stealth setting.

import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_BODY,
  NEUTRAL_TITLE,
  neutralizePayload,
} from '../../lib/stealth/notifications';

describe('sniffies push payload neutralization', () => {
  it('neutralizes a mommy_sniffies_recall push even when stealth is OFF', () => {
    const out = neutralizePayload(
      {
        title: 'Mama',
        body: "remember when you told Mark you wanted him to breed you raw at his place",
        data: { source: 'mommy_sniffies_recall', contact_name: 'Mark' },
      },
      false, // stealth OFF
    );
    expect(out.title).toBe(NEUTRAL_TITLE);
    expect(out.body).toBe(NEUTRAL_BODY);
    const wire = JSON.stringify(out);
    expect(wire).not.toMatch(/Mark|breed|raw|Mama/i);
  });

  it('drops content data keys when source is sniffies, even with stealth off', () => {
    const out = neutralizePayload(
      {
        title: 'Mama',
        body: 'long body text',
        data: { source: 'sniffies_ghost', contact_name: 'Jake', kink: 'breeding' },
      },
      false,
    );
    expect(out.data.contact_name).toBeUndefined();
    expect(out.data.kink).toBeUndefined();
    expect(out.data.stealth).toBe(true);
  });

  it('forces neutral when notification_type starts with mommy_sniffies', () => {
    const out = neutralizePayload(
      {
        title: 'Handler',
        body: 'You ghosted Sam after telling Mama you would follow through',
        data: { notification_type: 'mommy_sniffies_recall' },
      },
      false,
    );
    expect(out.body).toBe(NEUTRAL_BODY);
    expect(JSON.stringify(out)).not.toMatch(/Sam|ghosted|Mama/);
  });

  it('passes a non-sniffies push through when stealth is off', () => {
    const out = neutralizePayload(
      {
        title: 'Mama',
        body: 'good girl, look how wet you are',
        data: { source: 'mommy_recall' },
      },
      false,
    );
    expect(out.title).toBe('Mama');
    expect(out.body).toBe('good girl, look how wet you are');
  });

  it('still neutralizes a non-sniffies push when stealth is on', () => {
    const out = neutralizePayload(
      {
        title: 'Mama',
        body: 'edge for me',
        data: { source: 'mommy_tease' },
      },
      true,
    );
    expect(out.title).toBe(NEUTRAL_TITLE);
    expect(out.body).toBe(NEUTRAL_BODY);
  });

  it('regression: simulated wire payload from a Sniffies recall contains zero Sniffies content', () => {
    // Concrete bytes-on-the-wire test. Even if some future caller forgets
    // to set stealth, the source-prefix gate kicks in and the wire-encoded
    // payload contains no contact name, no quoted message, no Mama voice.
    const original = {
      title: 'Mama',
      body: 'remember when you told Devin you wanted him bare in a hotel parking lot, princess?',
      data: {
        source: 'mommy_sniffies_recall',
        contact_id: '00000000-0000-0000-0000-000000000001',
        contact_name: 'Devin',
        message_id: '00000000-0000-0000-0000-000000000002',
        kink: 'public',
      },
    };
    const out = neutralizePayload(original, false);
    const wire = JSON.stringify(out);
    expect(wire).not.toMatch(/Devin|hotel|princess|bare|parking|sniffies/i);
    expect(wire).toContain(NEUTRAL_TITLE);
    expect(wire).toContain(NEUTRAL_BODY);
  });
});
