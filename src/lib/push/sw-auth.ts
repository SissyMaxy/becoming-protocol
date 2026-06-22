/**
 * SW auth bridge — hand the service worker a short-lived access token.
 *
 * The problem: notification ACTIONS ("Reply", "Mark done", "Snap it") are
 * handled inside the service worker's `notificationclick`, which runs with NO
 * window and therefore NO access to the Supabase session — that lives in
 * localStorage, which a SW cannot read. So when the user taps "Reply" on a
 * lock-screen push, the SW has nothing to authenticate its POST to
 * /api/outreach/reply with.
 *
 * The fix: the APP caches the current session's `access_token` (only — never
 * the refresh_token) into IndexedDB, which both the page and the SW can read.
 * The SW reads it in `completeFromSW` and sends it as `Authorization: Bearer`.
 * The token is short-lived; the SW always falls back to a deep-link
 * (`/?complete_outreach=<id>`) when the token is missing or stale, so the
 * worst case is "open the app and it auto-completes" — never a lost action.
 *
 * Store shape (DB 'becoming-sw-auth', store 'bp-auth', fixed key 'session'):
 *   { access_token: string, expires_at: number /* epoch ms *​/ }
 *
 * Refresh tokens NEVER touch IndexedDB — a stolen access token expires in an
 * hour; a stolen refresh token is a standing key to the account.
 */

import { supabase } from '../supabase';

const SW_AUTH_DB = 'becoming-sw-auth';
const SW_AUTH_STORE = 'bp-auth';
const SW_AUTH_KEY = 'session';

interface CachedToken {
  access_token: string;
  expires_at: number; // epoch ms
}

function openSwAuthDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SW_AUTH_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SW_AUTH_STORE)) {
        db.createObjectStore(SW_AUTH_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putToken(token: CachedToken): Promise<void> {
  const db = await openSwAuthDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SW_AUTH_STORE, 'readwrite');
    tx.objectStore(SW_AUTH_STORE).put(token, SW_AUTH_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function clearToken(): Promise<void> {
  const db = await openSwAuthDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SW_AUTH_STORE, 'readwrite');
    tx.objectStore(SW_AUTH_STORE).delete(SW_AUTH_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * Write the CURRENT session's access token to IndexedDB for the SW. Reads the
 * live session itself, so callers don't have to pass it. No-op (clears the
 * cache) when there's no session — a signed-out SW must not hold a token.
 */
export async function cacheAccessTokenForSW(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.access_token) {
      await clearToken();
      return;
    }
    // expires_at is in epoch SECONDS on the Supabase session; normalize to ms.
    const expiresAtMs = session.expires_at
      ? session.expires_at * 1000
      : Date.now() + 55 * 60 * 1000;
    await putToken({ access_token: session.access_token, expires_at: expiresAtMs });
  } catch (e) {
    // IndexedDB blocked (private mode / quota) — the SW falls back to the
    // deep-link path, so a failed cache only costs one extra app-open.
    console.warn('[sw-auth] token cache failed:', e);
  }
}

/**
 * Wire the SW auth cache to the app lifecycle:
 *   - cache once on app load (session restored from storage), and
 *   - re-cache on every auth state change (login / token refresh), and
 *   - clear on sign-out.
 * Returns an unsubscribe fn. Mount once at app root.
 */
export function startSwAuthSync(): () => void {
  void cacheAccessTokenForSW();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      void clearToken();
    } else {
      void cacheAccessTokenForSW();
    }
  });
  return () => data.subscription.unsubscribe();
}
