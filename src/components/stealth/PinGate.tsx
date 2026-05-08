import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { attemptPin } from '../../lib/stealth/pin';
import { lockoutSecondsRemaining } from '../../lib/stealth/lockout';
import type { LockoutState } from '../../lib/stealth/lockout';

export interface PinGateProps {
  onUnlock: () => void;
  onPanicReset?: () => void;
}

export function PinGate({ onUnlock, onPanicReset }: PinGateProps) {
  const { user, signOut, resetPasswordForEmail } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [recoverySent, setRecoverySent] = useState(false);

  useEffect(() => {
    if (!lockedUntil) {
      setSecondsRemaining(0);
      return;
    }
    const tick = () => {
      const state: LockoutState = { failed_attempts: 0, locked_until: lockedUntil };
      const s = lockoutSecondsRemaining(state, new Date());
      setSecondsRemaining(s);
      if (s <= 0) {
        setLockedUntil(null);
        setError(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  async function tryUnlock(submitted: string) {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await attemptPin(user.id, submitted);
      if (result.ok) {
        setPin('');
        onUnlock();
        return;
      }
      if (result.reason === 'locked') {
        setLockedUntil(result.lockedUntil ?? null);
        setError('Too many incorrect tries. Try again later.');
      } else if (result.reason === 'no_pin_set') {
        // PIN was cleared elsewhere; let the user through.
        onUnlock();
      } else {
        const remaining = result.remainingAttempts ?? 0;
        setError(remaining > 0 ? `Incorrect. ${remaining} tries remaining.` : 'Incorrect.');
      }
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  function pressDigit(d: string) {
    if (lockedUntil) return;
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    if (next.length >= 4) {
      // Auto-submit on length 4–6 after a brief settle delay so users can
      // continue typing for longer PINs. We trigger on every key past 4
      // and rely on the verify call to finalize.
    }
  }

  function backspace() {
    if (lockedUntil) return;
    setPin((p) => p.slice(0, -1));
  }

  function submit() {
    if (pin.length < 4) return;
    void tryUnlock(pin);
  }

  async function sendRecovery() {
    if (!user?.email) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await resetPasswordForEmail(user.email);
      if (err) {
        setError(err.message);
      } else {
        setRecoverySent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black text-white p-6">
      <div className="text-sm uppercase tracking-widest text-white/60 mb-4">Enter PIN</div>
      <div className="flex gap-3 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full ${i < pin.length ? 'bg-white' : 'bg-white/20'}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-xs w-full">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => pressDigit(d)}
            disabled={Boolean(lockedUntil) || busy}
            className="h-14 rounded-full bg-white/10 text-2xl font-light hover:bg-white/20 disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          disabled={Boolean(lockedUntil) || busy}
          className="h-14 rounded-full bg-white/5 text-sm hover:bg-white/15 disabled:opacity-40"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => pressDigit('0')}
          disabled={Boolean(lockedUntil) || busy}
          className="h-14 rounded-full bg-white/10 text-2xl font-light hover:bg-white/20 disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={Boolean(lockedUntil) || busy || pin.length < 4}
          className="h-14 rounded-full bg-white text-black text-sm font-medium disabled:opacity-30"
        >
          OK
        </button>
      </div>

      {error && (
        <div className="mt-6 text-sm text-red-300 text-center">{error}</div>
      )}
      {lockedUntil && secondsRemaining > 0 && (
        <div className="mt-2 text-xs text-white/60 text-center">
          Locked for {formatLockoutDuration(secondsRemaining)}
        </div>
      )}

      <div className="mt-10 flex flex-col items-center gap-3 text-xs text-white/50">
        {recoverySent ? (
          <span className="text-emerald-300">Recovery email sent. Check your inbox.</span>
        ) : (
          <button
            type="button"
            onClick={sendRecovery}
            disabled={busy || !user?.email}
            className="underline underline-offset-4 hover:text-white"
          >
            Forgot PIN
          </button>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="underline underline-offset-4 hover:text-white"
        >
          Sign out
        </button>
        {onPanicReset && (
          <button
            type="button"
            onClick={onPanicReset}
            className="text-white/30 hover:text-white/60"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function formatLockoutDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}
