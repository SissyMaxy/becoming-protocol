/**
 * WristProof — her watch, as the proof instead of his word.
 *
 * The workout card's "Done" button is self-report: she takes his word. This
 * sits above it and shows what the Whoop strap actually saw today (mig 689).
 * Three states, all in her register, numbers only inside her sentence:
 *
 *   verified   → "her watch saw it · 34 min · heart at 156"   + one-tap confirm
 *   below_floor→ "the strap caught something short. that's not training."
 *   none       → "nothing landed on your wrist today. we both know what that means."
 *
 * The verified state offers a "let the strap answer for you" button that
 * fulfills the decree from the wrist with no upload — the credibility hinge:
 * she confirms a real session without him submitting anything, and the none
 * state is the same mechanism catching a skip. Self-report stays available
 * below as the fallback; this never blocks it.
 *
 * Silent when the user has no Whoop connection (status 'none' with no workout
 * at all is indistinguishable from "no strap", so we only show the failed-proof
 * line when a train decree is actually open — pressure only where there's an
 * obligation).
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { wristWorkoutStatus, wristVerifyWorkout, type WristStatus } from '../../lib/workout/client';

interface WristProofProps {
  /** Whether a train decree is open today — gates the failed-proof pressure. */
  decreeOpen: boolean;
  onVerified?: () => void;
}

export function WristProof({ decreeOpen, onVerified }: WristProofProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<WristStatus | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setStatus(await wristWorkoutStatus());
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!status) return null;

  // No strap data and nothing owed → say nothing. Failed-proof pressure only
  // lands when there's an open obligation to press against.
  if (status.state === 'none' && !decreeOpen) return null;
  if (status.state === 'below_floor' && !decreeOpen) return null;

  const confirm = async () => {
    setConfirming(true);
    const r = await wristVerifyWorkout();
    setConfirming(false);
    if (r.verified) { await load(); onVerified?.(); }
  };

  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: '9px 11px', borderRadius: 7, marginBottom: 10,
    fontSize: 12.5, lineHeight: 1.4,
  };

  if (status.state === 'verified') {
    return (
      <div style={{
        ...base,
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--protocol-accent) 12%, var(--protocol-bg-deep)) 0%, var(--protocol-bg-deep) 100%)',
        border: '1px solid color-mix(in srgb, var(--protocol-accent) 35%, var(--protocol-border))',
      }}>
        <span aria-hidden style={{ color: 'var(--protocol-accent-soft)', fontSize: 13 }}>✓</span>
        <span className="mommy-voice" style={{ flex: 1, fontStyle: 'italic', color: 'var(--protocol-text)' }}>
          her watch saw it · {status.minutes} min
          {status.max_hr ? ` · heart at ${status.max_hr}` : ''}
        </span>
        <button
          onClick={confirm}
          disabled={confirming}
          style={{
            padding: '5px 11px', borderRadius: 5, border: 'none',
            background: 'var(--protocol-accent)', color: 'white',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
            cursor: confirming ? 'wait' : 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}
        >
          {confirming ? '…' : 'let it stand'}
        </button>
      </div>
    );
  }

  // Failed proof — only reached with an open decree (gated above).
  return (
    <div style={{
      ...base,
      background: 'var(--protocol-surface)',
      border: '1px solid color-mix(in srgb, var(--protocol-danger) 28%, var(--protocol-border))',
    }}>
      <span aria-hidden style={{
        flexShrink: 0, width: 5, height: 5, borderRadius: '50%',
        background: 'var(--protocol-danger)',
      }} />
      <span className="mommy-voice" style={{ fontStyle: 'italic', color: 'var(--protocol-text-muted)' }}>
        {status.state === 'below_floor'
          ? "the strap caught something short. that's not training."
          : 'nothing landed on your wrist today. we both know what that means.'}
      </span>
    </div>
  );
}
