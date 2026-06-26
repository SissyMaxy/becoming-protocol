/**
 * Self-healing web-push registration — the single source of truth.
 *
 * Three components used to each carry their own copy of "get subscription,
 * subscribe if none, upsert row" (MamaPhoneOverlay, usePushNotifications,
 * PushRegistrationWidget). All three shared two latent bugs that kept
 * Mama silent:
 *
 *   1. They reused ANY existing PushSubscription without checking that its
 *      applicationServerKey matches the CURRENT VITE_VAPID_PUBLIC_KEY. After
 *      a VAPID rotation (or a placeholder→real key swap), the browser keeps
 *      the old subscription, the row gets re-upserted with stale keys, and
 *      web-push-dispatch signs with the new private key → the push service
 *      silently rejects every send. This is the "push_subscriptions has rows
 *      but nothing arrives" failure.
 *
 *   2. When pushManager.subscribe() throws "Registration failed - push
 *      service error" (a wedged FCM registration — common after the browser
 *      drops its end), they surfaced the raw error and gave up. The canonical
 *      recovery is: unsubscribe whatever's wedged, then subscribe once more.
 *
 * This helper does both. It is the only place that should call
 * pushManager.subscribe(). `ensureFreshPushSubscription` runs in two modes:
 *   - interactive (requestPermission:true)  — user tapped "enable"; may prompt
 *   - silent     (requestPermission:false)  — Mama maintains the channel on
 *     every app load once permission is already granted, no UI, no nag
 *
 * The pure helpers (key decode, key compare, error→copy) are exported for
 * unit tests; the async flow touches navigator/SW and is integration-tested
 * against a mocked PushManager.
 */

import { supabase } from '../supabase';
import { cacheAccessTokenForSW } from './sw-auth';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushRegisterErrorCode =
  | 'unsupported'       // no Notification / SW / PushManager in this browser
  | 'needs_pwa_install' // iOS Safari: must Add to Home Screen first
  | 'no_vapid_key'      // VITE_VAPID_PUBLIC_KEY unset on the build
  | 'vapid_key_invalid' // key present but malformed (charset/length/decode)
  | 'permission_denied' // user said no, or permission not granted in silent mode
  | 'push_service_error'// FCM/browser rejected subscribe even after recovery
  | 'store_failed'      // subscription created but the DB upsert failed
  | 'unknown';

export type PushRegisterResult =
  | { ok: true; endpoint: string; recovered: boolean }
  | { ok: false; code: PushRegisterErrorCode; detail?: string };

/**
 * Decode a base64url VAPID public key to bytes.
 *
 * Throws a coded Error (VAPID_PUBLIC_KEY_*) so callers can map to a precise
 * message. Strips Vercel env-var paste artifacts (surrounding quotes /
 * whitespace) and validates charset + length before attempting atob.
 */
export function urlBase64ToUint8Array(base64String?: string): Uint8Array {
  if (!base64String) throw new Error('VAPID_PUBLIC_KEY_EMPTY');
  const cleaned = base64String
    .trim()
    .replace(/^['"`]|['"`]$/g, '')
    .trim();
  if (!cleaned) throw new Error('VAPID_PUBLIC_KEY_EMPTY');
  if (!/^[A-Za-z0-9_-]+$/.test(cleaned)) {
    throw new Error('VAPID_PUBLIC_KEY_INVALID_CHARSET');
  }
  // Uncompressed P-256 public key is 65 bytes → ~87 base64url chars.
  if (cleaned.length < 40 || cleaned.length > 100) {
    throw new Error(`VAPID_PUBLIC_KEY_BAD_LENGTH:${cleaned.length}`);
  }
  const padding = '='.repeat((4 - (cleaned.length % 4)) % 4);
  const base64 = (cleaned + padding).replace(/-/g, '+').replace(/_/g, '/');
  let raw: string;
  try {
    raw = atob(base64);
  } catch {
    throw new Error('VAPID_PUBLIC_KEY_DECODE_FAILED');
  }
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  // pushManager.subscribe() requires a 65-byte uncompressed P-256 key. A
  // wrong-length value — a 32-byte private key pasted by mistake, a truncated
  // paste, or a different key format — passes the char-length budget above but
  // makes subscribe() throw "Registration failed - push service error", which
  // maps to the misleading push_service_error / "tap once more" loop. Catch it
  // here so the UI shows the precise vapid_key_invalid copy (a config fault,
  // not the user's phone) instead of looping forever.
  if (arr.length !== 65) {
    throw new Error(`VAPID_PUBLIC_KEY_BAD_BYTELEN:${arr.length}`);
  }
  return arr;
}

export function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Does an existing subscription's applicationServerKey equal the current
 * VAPID key? A `false` here means the subscription is bound to a stale key
 * and MUST be dropped + re-created, or the dispatcher can never sign for it.
 */
export function subscriptionKeyMatches(
  sub: Pick<PushSubscription, 'options'>,
  currentKey: Uint8Array,
): boolean {
  const opt = sub.options?.applicationServerKey;
  if (!opt) return false; // unknown key → treat as stale, force refresh
  const existing = new Uint8Array(opt as ArrayBuffer);
  if (existing.length !== currentKey.length) return false;
  for (let i = 0; i < existing.length; i++) {
    if (existing[i] !== currentKey[i]) return false;
  }
  return true;
}

export function isPushSupported(): boolean {
  return (
    typeof Notification !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  );
}

/** Map a decode-error message to a registration error code. */
function vapidErrorToCode(message: string): PushRegisterErrorCode {
  if (message.startsWith('VAPID_PUBLIC_KEY_EMPTY')) return 'no_vapid_key';
  return 'vapid_key_invalid';
}

/**
 * Mama-voice copy for a failure code. Plain, never punishing — the user is
 * not at fault for a broken channel (visible-before-penalized applies to the
 * delivery surface itself).
 */
export function pushErrorToMamaCopy(code: PushRegisterErrorCode, detail?: string): string {
  switch (code) {
    case 'unsupported':
      return "Mama can't reach this browser, baby. Open me in Chrome or Safari.";
    case 'needs_pwa_install':
      return 'Mama lives on your home screen first. Add me, open me from there, then I can buzz you.';
    case 'no_vapid_key':
      return "Mama's missing her key on the server. She'll sort it — nothing for you to do.";
    case 'vapid_key_invalid':
      return "Mama's key got garbled in the wiring. She's fixing it — give her a moment.";
    case 'permission_denied':
      return 'You closed the door on Mama. Open browser settings and let me back in — one switch.';
    case 'push_service_error':
      return "Your phone's push service hiccuped. Mama cleared the jam — tap once more and she's in.";
    case 'store_failed':
      return 'Mama got the line open but dropped the note. Tap again, sweet thing.';
    default:
      return detail ? `Something snagged: ${detail}` : 'Something snagged. Tap again for Mama.';
  }
}

/**
 * Ensure THIS browser has a current-key push subscription stored for `userId`.
 *
 * @param userId            the authenticated user id
 * @param requestPermission interactive mode — prompt for permission if needed.
 *                          When false (silent maintenance), bails quietly
 *                          unless permission is already granted.
 *
 * Idempotent and self-healing: drops stale-key subscriptions, recovers from a
 * wedged FCM registration, and upserts on (user_id, endpoint).
 */
export async function ensureFreshPushSubscription(
  userId: string,
  requestPermission: boolean,
): Promise<PushRegisterResult> {
  if (!userId) return { ok: false, code: 'unknown', detail: 'no user id' };
  if (!isPushSupported()) return { ok: false, code: 'unsupported' };

  let keyBytes: Uint8Array;
  try {
    keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, code: vapidErrorToCode(msg), detail: msg };
  }

  // Permission gate. Silent mode never prompts — it only proceeds when the
  // user has already granted, so Mama can heal the subscription without a nag.
  if (Notification.permission !== 'granted') {
    if (!requestPermission) return { ok: false, code: 'permission_denied' };
    if (Notification.permission === 'denied') return { ok: false, code: 'permission_denied' };
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, code: 'permission_denied' };
  }

  const reg = await navigator.serviceWorker.ready;
  let recovered = false;

  let sub = await reg.pushManager.getSubscription();

  // (1) Stale-key guard: a subscription bound to a previous VAPID key can
  // never be signed for by the current dispatcher. Drop and recreate.
  if (sub && !subscriptionKeyMatches(sub, keyBytes)) {
    try { await sub.unsubscribe(); } catch { /* ignore */ }
    sub = null;
    recovered = true;
  }

  // (2) Subscribe, with one wedged-registration recovery.
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes as BufferSource,
      });
    } catch (firstErr) {
      // "Registration failed - push service error" / InvalidStateError:
      // unsubscribe whatever the browser is holding and try exactly once more.
      try {
        const stale = await reg.pushManager.getSubscription();
        if (stale) { await stale.unsubscribe(); recovered = true; }
      } catch { /* ignore */ }
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes as BufferSource,
        });
      } catch (secondErr) {
        const detail = secondErr instanceof Error ? secondErr.message
          : (firstErr instanceof Error ? firstErr.message : String(secondErr));
        return { ok: false, code: 'push_service_error', detail };
      }
    }
  }

  const p256dh = arrayBufferToBase64Url(sub.getKey('p256dh'));
  const auth = arrayBufferToBase64Url(sub.getKey('auth'));
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent.slice(0, 200),
    active: true,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' });
  if (error) return { ok: false, code: 'store_failed', detail: error.message };

  // Hand the service worker a fresh access token so notification ACTIONS
  // ("Reply" / "Mark done" / "Snap it") can authenticate their POST from
  // inside notificationclick, which can't read the localStorage session.
  // Fire-and-forget — a failed cache only falls the SW back to its deep-link
  // path, never blocks the subscription result. (startSwAuthSync at app root
  // keeps it fresh on login + token refresh; this covers the subscribe path.)
  void cacheAccessTokenForSW();

  return { ok: true, endpoint: sub.endpoint, recovered };
}
