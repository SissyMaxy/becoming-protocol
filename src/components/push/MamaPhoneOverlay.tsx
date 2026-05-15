/**
 * MamaPhoneOverlay — force-prompts push registration when Maxy has no
 * push_subscriptions row for her current device.
 *
 * Why this exists: 2026-05-15 audit revealed push_subscriptions had ZERO
 * rows for either active user despite the migration-380 bridge writing
 * scheduled_notifications correctly. The dispatcher cron runs, marks
 * rows 'sent', but every send fans out to an empty endpoint list.
 * Every Mama-voice feature shipped this month has been silent.
 *
 * Self-gating overlay (same pattern as LivePhotoPingResponder /
 * EveningConfessionGate). Mounts at App.tsx top level. Auto-shows when:
 *   - the user is authenticated
 *   - they have no active push_subscriptions row
 *   - they haven't snoozed within the last 4h
 *   - the app isn't currently in a more urgent overlay (mantra gate, etc)
 *
 * Mama-voice copy escalates based on days since the row was wanted.
 * Limited snooze (4h) keeps pressure on without locking her out entirely.
 *
 * iOS Safari path: requires PWA install before push is available. Detect
 * UA + display-mode and show the Add-to-Home-Screen flow instead of the
 * direct subscribe button.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const SNOOZE_KEY = 'bp_mama_phone_snooze_until';
const SNOOZE_MS = 4 * 60 * 60 * 1000;

/**
 * Decode a base64url-encoded VAPID public key to bytes.
 *
 * Hardened (2026-05-15): trims surrounding whitespace + quotes (env var
 * copy-paste artifacts), validates the charset, throws a clear error
 * instead of bubbling up a cryptic `atob` exception. The overlay catches
 * this and surfaces a "VAPID key looks wrong" message rather than
 * crashing on tap.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  if (!base64String) throw new Error('VAPID_PUBLIC_KEY_EMPTY');
  // Strip Vercel env-var paste artifacts: surrounding quotes, whitespace.
  const cleaned = base64String
    .trim()
    .replace(/^['"`]|['"`]$/g, '')
    .trim();
  if (!cleaned) throw new Error('VAPID_PUBLIC_KEY_EMPTY');
  // base64url: A-Z a-z 0-9 - _ only. Anything else means the env var
  // was set to a placeholder or has hidden characters.
  if (!/^[A-Za-z0-9_-]+$/.test(cleaned)) {
    throw new Error('VAPID_PUBLIC_KEY_INVALID_CHARSET');
  }
  // Uncompressed P-256 public key is 65 bytes → ~87 base64url chars.
  // Compressed would be 33 → ~44. Anything wildly off is misconfigured.
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
  return arr;
}

function arrayBufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari sets navigator.standalone
    (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function snoozedUntil(): number {
  try {
    const v = localStorage.getItem(SNOOZE_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch { return 0; }
}

function setSnooze(): void {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); }
  catch { /* ignore */ }
}

interface SubscriptionState {
  hasSubscription: boolean;
  loading: boolean;
}

function useSubscriptionState(userId: string | undefined): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>({ hasSubscription: true, loading: true });

  useEffect(() => {
    if (!userId) { setState({ hasSubscription: true, loading: false }); return; }
    let alive = true;
    const check = async () => {
      try {
        const { count } = await supabase
          .from('push_subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('active', true);
        if (alive) setState({ hasSubscription: (count ?? 0) > 0, loading: false });
      } catch {
        if (alive) setState({ hasSubscription: true, loading: false });
      }
    };
    void check();
    const t = setInterval(() => void check(), 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [userId]);

  return state;
}

export function MamaPhoneOverlay() {
  const { user } = useAuth();
  const { hasSubscription, loading } = useSubscriptionState(user?.id);
  const [snoozeSeen, setSnoozeSeen] = useState<number>(snoozedUntil());
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ios = isIos();
  const standalone = isStandalonePWA();
  const needsPwaInstall = ios && !standalone;
  const browserUnsupported =
    typeof Notification === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window);

  const enable = useCallback(async () => {
    if (!user?.id) return;
    setEnabling(true);
    setError(null);
    try {
      if (browserUnsupported) {
        setError("Mama can't talk to this browser, baby. Open the app in Chrome or Safari.");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        setError("Mama's missing a key, sweet thing. Tell whoever runs this to set VAPID_PUBLIC_KEY.");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setError("You said no to Mama. Open browser settings and let me in.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        let keyBytes: Uint8Array;
        try {
          keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        } catch (e) {
          const code = e instanceof Error ? e.message : String(e);
          if (code.startsWith('VAPID_PUBLIC_KEY_EMPTY')) {
            setError("Mama's VAPID key is missing on Vercel. Set VITE_VAPID_PUBLIC_KEY and redeploy.");
          } else if (code.startsWith('VAPID_PUBLIC_KEY_INVALID_CHARSET')) {
            setError("Mama's VAPID key has stray characters (quotes, whitespace, or wrong value). Re-paste it on Vercel — no quotes, no spaces.");
          } else if (code.startsWith('VAPID_PUBLIC_KEY_BAD_LENGTH')) {
            setError(`Mama's VAPID key is the wrong length (${code.split(':')[1] || '?'}). Should be ~87 characters. Generate a fresh keypair.`);
          } else {
            setError("Mama's VAPID key won't decode. Re-paste it on Vercel from a freshly-generated keypair.");
          }
          return;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes,
        });
      }
      const p256dh = arrayBufferToBase64(sub.getKey('p256dh'));
      const auth = arrayBufferToBase64(sub.getKey('auth'));
      await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh,
        auth,
        device_label: null,
        user_agent: navigator.userAgent.slice(0, 200),
        active: true,
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint' });
      // Subscription detection happens on next poll; force-clear snooze.
      try { localStorage.removeItem(SNOOZE_KEY); } catch { /* ignore */ }
      setSnoozeSeen(0);
      // Optimistically reload state by waiting briefly.
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong');
    } finally {
      setEnabling(false);
    }
  }, [user?.id, browserUnsupported]);

  // Visibility gates: do not render at all unless we need to.
  if (loading) return null;
  if (!user?.id) return null;
  if (hasSubscription) return null;
  if (snoozeSeen > Date.now()) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 75,
        background: 'rgba(8,5,12,0.96)',
        display: 'flex', flexDirection: 'column', alignItems: 'stretch',
        justifyContent: 'flex-start',
        padding: 'max(env(safe-area-inset-top), 16px) 16px max(env(safe-area-inset-bottom), 16px)',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 480, width: '100%', margin: '0 auto' }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: '#f4a7c4', marginBottom: 18, textAlign: 'center',
        }}>
          Mama's been waiting
        </div>

        <h1 style={{
          fontSize: 28, lineHeight: 1.15, color: '#f4d5e4', fontWeight: 700,
          marginBottom: 16, fontFamily: 'inherit',
        }}>
          You're hiding from me, sweet thing.
        </h1>

        <p style={{ fontSize: 15, color: '#d4c4cc', lineHeight: 1.5, marginBottom: 14 }}>
          Mama has been talking to nobody. Every directive, every check-in,
          every reward — sent to a phone that never agreed to listen.
        </p>
        <p style={{ fontSize: 15, color: '#d4c4cc', lineHeight: 1.5, marginBottom: 22 }}>
          {needsPwaInstall
            ? "Mama lives on your home screen, baby. Get me there or you'll keep missing me."
            : "Let Mama into the only channel that actually reaches you. One tap."}
        </p>

        {needsPwaInstall ? (
          <div style={{
            background: '#1a0f22', border: '1px solid #5d2d4a', borderRadius: 10,
            padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f4a7c4', marginBottom: 10 }}>
              How to put Mama on your phone (iPhone)
            </div>
            <ol style={{ fontSize: 13, color: '#d4c4cc', lineHeight: 1.6, paddingLeft: 20, margin: 0 }}>
              <li>Tap the <strong style={{ color: '#f4a7c4' }}>Share</strong> button at the bottom of Safari.</li>
              <li>Scroll down and tap <strong style={{ color: '#f4a7c4' }}>Add to Home Screen</strong>.</li>
              <li>Tap <strong style={{ color: '#f4a7c4' }}>Add</strong> in the top-right corner.</li>
              <li>Close Safari. Open Mama from your home screen.</li>
              <li>Mama will ask to send notifications. Say yes.</li>
            </ol>
            <p style={{ fontSize: 11.5, color: '#8a7a84', marginTop: 12, marginBottom: 0, fontStyle: 'italic' }}>
              (Apple makes Mama wait for the home screen install before she can buzz you. That's the only step.)
            </p>
          </div>
        ) : (
          <button
            onClick={() => void enable()}
            disabled={enabling}
            style={{
              width: '100%',
              padding: '14px 18px',
              background: 'linear-gradient(135deg, #f4a7c4 0%, #d784a4 100%)',
              color: '#1a0820',
              border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700,
              cursor: enabling ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              marginBottom: 12,
              opacity: enabling ? 0.65 : 1,
            }}
          >
            {enabling ? 'letting Mama in…' : 'let Mama into your phone'}
          </button>
        )}

        {error && (
          <div style={{
            background: 'rgba(255,80,100,0.1)', border: '1px solid rgba(255,80,100,0.3)',
            borderRadius: 8, padding: 12, marginBottom: 12,
            fontSize: 12.5, color: '#ffb4b8',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={() => { setSnooze(); setSnoozeSeen(Date.now() + SNOOZE_MS); }}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'transparent',
            color: '#8a7a84',
            border: '1px solid #2d1a4d',
            borderRadius: 8,
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
          }}
        >
          not yet, mama — 4 hours
        </button>

        <p style={{
          fontSize: 10.5, color: '#6a5a64', textAlign: 'center',
          marginTop: 22, lineHeight: 1.5,
        }}>
          Mama doesn't punish you for missing what she could never deliver.
          But every hour off the leash is one Mama is not building you.
        </p>
      </div>
    </div>
  );
}
