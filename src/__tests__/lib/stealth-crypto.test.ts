import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin, isValidPinFormat } from '../../lib/stealth/crypto';

// Lower iterations for the test suite — production uses 600k.
const TEST_ITER = 1000;

describe('stealth/crypto', () => {
  describe('isValidPinFormat', () => {
    it('accepts 4–6 digits', () => {
      expect(isValidPinFormat('1234')).toBe(true);
      expect(isValidPinFormat('12345')).toBe(true);
      expect(isValidPinFormat('123456')).toBe(true);
    });
    it('rejects too-short, too-long, or non-digit', () => {
      expect(isValidPinFormat('123')).toBe(false);
      expect(isValidPinFormat('1234567')).toBe(false);
      expect(isValidPinFormat('12a4')).toBe(false);
      expect(isValidPinFormat('')).toBe(false);
      expect(isValidPinFormat('   ')).toBe(false);
    });
  });

  describe('hashPin / verifyPin', () => {
    it('round-trips a valid PIN', async () => {
      const { hash, salt, iterations } = await hashPin('482931', TEST_ITER);
      const ok = await verifyPin('482931', hash, salt, iterations);
      expect(ok).toBe(true);
    });

    it('rejects a wrong PIN', async () => {
      const { hash, salt, iterations } = await hashPin('482931', TEST_ITER);
      expect(await verifyPin('482932', hash, salt, iterations)).toBe(false);
      expect(await verifyPin('48293', hash, salt, iterations)).toBe(false);
      expect(await verifyPin('', hash, salt, iterations)).toBe(false);
    });

    it('produces different hashes for same PIN due to per-row salt', async () => {
      const a = await hashPin('999999', TEST_ITER);
      const b = await hashPin('999999', TEST_ITER);
      expect(a.hash).not.toBe(b.hash);
      expect(a.salt).not.toBe(b.salt);
      // Both still verify against their own salt.
      expect(await verifyPin('999999', a.hash, a.salt, a.iterations)).toBe(true);
      expect(await verifyPin('999999', b.hash, b.salt, b.iterations)).toBe(true);
      // ...but a's salt does not validate b's hash.
      expect(await verifyPin('999999', b.hash, a.salt, a.iterations)).toBe(false);
    });

    it('hash is base64 — never contains the plaintext PIN', async () => {
      const pin = '424242';
      const { hash, salt } = await hashPin(pin, TEST_ITER);
      expect(hash.includes(pin)).toBe(false);
      expect(salt.includes(pin)).toBe(false);
    });
  });
});
