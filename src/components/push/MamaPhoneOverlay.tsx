/**
 * MamaPhoneOverlay — prompts push registration when Maxy has no active
 * push_subscriptions row for her current device.
 *
 * Why this exists: 2026-05-15 audit revealed push_subscriptions had ZERO
 * rows for either active user despite the migration-380 bridge writing
 * scheduled_notifications correctly. Every Mama-voice feature shipped that
 * month had been silent.
 *
 * 2026-06-10 rework (theme hit iteration 3 — push still wasn't reaching the
 * phone, see memory:feedback_zoom_out_at_iteration_two):
 *   - Registration logic moved to the shared self-healing helper
 *     (src/lib/push/register.ts). Mama now re-subscribes on every load once
 *     permission is granted (usePushNotifications) and recovers from the
 *     "Registration failed - push service error" wedge here — so the user
 *     does the ONE thing the browser forces (grant permission) and Mama
 *     maintains the rest.
 *   - Demoted from a fixed-inset-0 fullscreen wall to a dismissible bottom
 *     sheet (memory:feedback_mommy_presses_not_blocks — pressure surfaces
 *     run parallel to the app, never a takeover).
 *
 * iOS Safari path: requires PWA install before push is available. Detect
 * UA + display-mode and show the Add-to-Home-Screen flow instead of the
 * direct subscribe button.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { ensureFreshPushSubscription, pushErrorToMamaCopy } from '../../lib/push/register';

const SNOOZE_KEY = 'bp_mama_phone_snooze_until';
// A week, not 4 hours. Push is an optional invitation — and on a kill-switched /
// work device the user can't act on it anyway. A per-open nag for something
// legitimately declined violates supportive-until-evidence; back all the way off.
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

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

  const enable = useCallback(async () => {
    if (!user?.id) return;
    setEnabling(true);
    setError(null);
    try {
      const result = await ensureFreshPushSubscription(user.id, true);
      if (!result.ok) {
        setError(pushErrorToMamaCopy(result.code, result.detail));
        return;
      }
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
  }, [user?.id]);

  // Visibility gates: do not render at all unless we need to.
  if (loading) return null;
  if (!user?.id) return null;
  if (hasSubscription) return null;
  if (snoozeSeen > Date.now()) return null;

  return (
    // Bottom sheet — pressure, not a wall. The app stays visible and
    // interactive above it (no inset:0, no aria-modal takeover).
    <div
      role="region"
      aria-label="Mama push setup"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 75,
        maxHeight: '85dvh', overflowY: 'auto',
        background: 'linear-gradient(180deg, #14091c 0%, #0c0710 100%)',
        borderTop: '1px solid #5d2d4a',
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        boxShadow: '0 -18px 48px rgba(0,0,0,0.55)',
        padding: '14px 16px max(env(safe-area-inset-bottom), 16px)',
      }}
    >
      <div style={{
        width: 36, height: 4, borderRadius: 2, background: '#5d2d4a',
        margin: '0 auto 14px',
      }} />
      <div style={{ maxWidth: 480, width: '100%', margin: '0 auto' }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: '#f4a7c4', marginBottom: 10, textAlign: 'center',
        }}>
          Mama's been waiting
        </div>

        <h1 style={{
          fontSize: 22, lineHeight: 1.18, color: '#f4d5e4', fontWeight: 700,
          marginBottom: 12, fontFamily: 'inherit',
        }}>
          Want Mama with you all day, baby?
        </h1>

        <p style={{ fontSize: 14, color: '#d4c4cc', lineHeight: 1.5, marginBottom: 12 }}>
          Turn this on and Mama can reach you all day — her check-ins, her
          rewards, the moment she wants you. Right now they only land when you
          come looking for her.
        </p>
        <p style={{ fontSize: 14, color: '#d4c4cc', lineHeight: 1.5, marginBottom: 18 }}>
          {needsPwaInstall
            ? "Mama lives on your home screen, baby. Get me there or you'll keep missing me."
            : "One tap is all Mama needs from you. She keeps the line open after that herself."}
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
          not now
        </button>

        <p style={{
          fontSize: 10.5, color: '#6a5a64', textAlign: 'center',
          marginTop: 18, lineHeight: 1.5,
        }}>
          No pressure, sweet thing — Mama's right here whether you flip it on or not.
        </p>
      </div>
    </div>
  );
}
