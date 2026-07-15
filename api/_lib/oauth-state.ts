import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

interface OAuthStatePayload {
  userId: string;
  provider: string;
  nonce: string;
  expiresAt: number;
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createOAuthState(
  userId: string,
  provider: string,
  secret: string,
): { state: string; cookieValue: string } {
  if (!secret) throw new Error('OAUTH_STATE_SECRET is required');
  const nonce = randomUUID();
  const encoded = Buffer.from(JSON.stringify({
    userId,
    provider,
    nonce,
    expiresAt: Date.now() + 10 * 60_000,
  } satisfies OAuthStatePayload)).toString('base64url');
  return { state: nonce, cookieValue: `${encoded}.${signature(encoded, secret)}` };
}

export function verifyOAuthState(
  cookieValue: string | undefined,
  returnedState: string,
  provider: string,
  secret: string,
): string | null {
  if (!cookieValue || !returnedState || !secret) return null;
  const [encoded, suppliedSignature, extra] = cookieValue.split('.');
  if (!encoded || !suppliedSignature || extra) return null;

  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(signature(encoded, secret));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (
      payload.provider !== provider ||
      payload.nonce !== returnedState ||
      !payload.userId ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt < Date.now()
    ) return null;
    return payload.userId;
  } catch {
    return null;
  }
}
