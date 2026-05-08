import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '../../lib/calendar/crypto';

// 32-byte AES-256 key, base64-encoded.
const TEST_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe('calendar token crypto', () => {
  it('roundtrips a refresh-token-shaped string', async () => {
    const plaintext = '1//0gA-faketoken_with_dashes-AND_underscores.0123456789';
    const enc = await encryptToken(plaintext, TEST_KEY);
    expect(enc).not.toBe(plaintext);
    const dec = await decryptToken(enc, TEST_KEY);
    expect(dec).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', async () => {
    const plaintext = 'same-input-twice';
    const a = await encryptToken(plaintext, TEST_KEY);
    const b = await encryptToken(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
    expect(await decryptToken(a, TEST_KEY)).toBe(plaintext);
    expect(await decryptToken(b, TEST_KEY)).toBe(plaintext);
  });

  it('refuses a wrong key', async () => {
    const enc = await encryptToken('secret', TEST_KEY);
    const wrongKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(8)));
    await expect(decryptToken(enc, wrongKey)).rejects.toThrow();
  });

  it('refuses a malformed key length', async () => {
    const tooShort = btoa(String.fromCharCode(...new Uint8Array(16).fill(1)));
    await expect(encryptToken('x', tooShort)).rejects.toThrow(/32 bytes/);
  });

  it('refuses an empty plaintext', async () => {
    await expect(encryptToken('', TEST_KEY)).rejects.toThrow();
  });
});
