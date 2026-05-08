// PIN hashing for stealth_pin.
//
// Uses PBKDF2-SHA256 via Web Crypto. Picked over bcrypt/argon2 because
// (a) the project has no native crypto deps to match, (b) PBKDF2 is
// available in browsers and Deno without imports, and (c) for a 4–6
// digit PIN the dominant defense is the lockout policy, not the KDF
// constant. Iteration count is stored per-row so it can be raised
// later without breaking existing PINs.
//
// Format: hash + salt are stored as base64. Salt is 16 bytes random
// per row.

const ITERATIONS_DEFAULT = 600_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function bytesToB64(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export interface HashedPin {
  hash: string;
  salt: string;
  iterations: number;
}

export async function hashPin(pin: string, iterations: number = ITERATIONS_DEFAULT): Promise<HashedPin> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await pbkdf2(pin, salt, iterations);
  return {
    hash: bytesToB64(derived),
    salt: bytesToB64(salt),
    iterations,
  };
}

export async function verifyPin(
  pin: string,
  storedHash: string,
  storedSalt: string,
  iterations: number,
): Promise<boolean> {
  const salt = b64ToBytes(storedSalt);
  const derived = await pbkdf2(pin, salt, iterations);
  const expected = b64ToBytes(storedHash);
  return constantTimeEqual(derived, expected);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
