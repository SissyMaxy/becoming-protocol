import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOAuthState, verifyOAuthState } from '../../../api/_lib/oauth-state';

const SECRET = 'test-only-oauth-state-secret-with-enough-entropy';

afterEach(() => {
  vi.useRealTimers();
});

describe('signed OAuth state', () => {
  it('round-trips only for the expected nonce and provider', () => {
    const created = createOAuthState('user-123', 'google', SECRET);

    expect(verifyOAuthState(created.cookieValue, created.state, 'google', SECRET)).toBe('user-123');
    expect(verifyOAuthState(created.cookieValue, 'wrong-nonce', 'google', SECRET)).toBeNull();
    expect(verifyOAuthState(created.cookieValue, created.state, 'reddit', SECRET)).toBeNull();
  });

  it('rejects tampered values and the wrong signing key', () => {
    const created = createOAuthState('user-123', 'whoop', SECRET);
    const tampered = `${created.cookieValue.slice(0, -1)}x`;

    expect(verifyOAuthState(tampered, created.state, 'whoop', SECRET)).toBeNull();
    expect(verifyOAuthState(created.cookieValue, created.state, 'whoop', `${SECRET}-wrong`)).toBeNull();
  });

  it('expires after ten minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const created = createOAuthState('user-123', 'reddit', SECRET);
    vi.advanceTimersByTime(10 * 60_000 + 1);

    expect(verifyOAuthState(created.cookieValue, created.state, 'reddit', SECRET)).toBeNull();
  });

  it('refuses to create unsigned state', () => {
    expect(() => createOAuthState('user-123', 'google', '')).toThrow('OAUTH_STATE_SECRET');
  });
});
