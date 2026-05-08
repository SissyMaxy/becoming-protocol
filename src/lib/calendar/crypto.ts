// AES-256-GCM token encryption.
//
// Stored format: base64( iv(12) || ciphertext_with_tag )
// Tag is appended by Web Crypto's AES-GCM by default.
//
// Key seam: CALENDAR_TOKEN_KEY is a 32-byte secret, base64-encoded. Rotate by
// generating a new key and re-encrypting every row. Document this in your ops
// runbook; we don't carry historical keys here.
//
// This file uses the platform `crypto` global (Web Crypto), which works in
// both Vercel (Node 20+ exposes globalThis.crypto) and Deno. The Deno mirror
// at supabase/functions/_shared/calendar-crypto.ts is byte-identical except
// for the `globalThis.crypto` reference style (Deno also exposes it as a global).

const IV_BYTES = 12;
const KEY_BYTES = 32;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(buf: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64ToBytes(keyB64);
  if (raw.length !== KEY_BYTES) {
    throw new Error(
      `CALENDAR_TOKEN_KEY must decode to ${KEY_BYTES} bytes (got ${raw.length})`,
    );
  }
  return globalThis.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptToken(plaintext: string, keyB64: string): Promise<string> {
  if (!plaintext) throw new Error('encryptToken: empty plaintext');
  const key = await importKey(keyB64);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

export async function decryptToken(blobB64: string, keyB64: string): Promise<string> {
  if (!blobB64) throw new Error('decryptToken: empty blob');
  const key = await importKey(keyB64);
  const blob = b64ToBytes(blobB64);
  if (blob.length < IV_BYTES + 16) {
    throw new Error('decryptToken: blob too short to contain iv+tag');
  }
  const iv = blob.slice(0, IV_BYTES);
  const ct = blob.slice(IV_BYTES);
  const pt = new Uint8Array(
    await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct),
  );
  return new TextDecoder().decode(pt);
}
