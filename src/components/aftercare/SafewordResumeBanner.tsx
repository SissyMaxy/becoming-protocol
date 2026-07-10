/**
 * SafewordResumeBanner — the missing other half of the safeword latch.
 *
 * A safeword/panic gesture latches `safeword_latches` with no timer
 * expiry (mig 627) and every gated system stays denied until she takes
 * the explicit `resume_from_safeword()` action. Nothing in the app ever
 * called that RPC, so a single safeword permanently stopped the whole
 * protocol with no way back in. This banner is that call site.
 *
 * Plain, neutral voice — no persona, no pet names, no pressure. It is a
 * quiet strip, not a wall: she can keep using the ungated parts of the
 * app while it's up, and it only asks once she's ready.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getOpenSafewordLatch, resumeFromSafeword } from '../../lib/safeword';

export function SafewordResumeBanner() {
  const { user } = useAuth();
  const [latchId, setLatchId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState(false);

  const check = useCallback(async () => {
    if (!user?.id) return;
    const latch = await getOpenSafewordLatch(user.id);
    setLatchId(latch?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    check();
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [check]);

  const handleResume = async () => {
    if (!user?.id || resuming) return;
    setResuming(true);
    setError(false);
    const ok = await resumeFromSafeword(user.id);
    setResuming(false);
    if (ok) setLatchId(null);
    else setError(true);
  };

  if (!latchId) return null;

  return (
    <div
      data-testid="safeword-resume-banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#f5f1eb',
        color: '#3a3530',
        borderBottom: '1px solid #c8bfae',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        flexWrap: 'wrap',
        textAlign: 'center',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1.5 }}>
        Everything's paused since your safeword. It stays this way until you say you're ready — take your time.
      </span>
      <button
        onClick={handleResume}
        disabled={resuming}
        style={{
          padding: '8px 18px',
          background: '#5e564d',
          color: '#f5f1eb',
          border: 'none',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          cursor: resuming ? 'not-allowed' : 'pointer',
          opacity: resuming ? 0.7 : 1,
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        {resuming ? 'Resuming…' : "I'm ready"}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: '#a04a4a', width: '100%' }}>
          That didn't go through — try again in a moment.
        </span>
      )}
    </div>
  );
}
