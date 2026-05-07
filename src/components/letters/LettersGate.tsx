/**
 * LettersGate — privacy soft-modal in front of the archive.
 *
 * The spec calls for stealth-mode PIN gating if that branch is merged. It
 * isn't (no `stealth_mode` in main), so the fallback is the soft-modal
 * pattern: a one-tap acknowledgement screen that the next person glancing
 * at the device has to actively dismiss to see the contents. Simple, but
 * matches the verification-vault pattern's intent.
 *
 * Stays mounted across the session — once unlocked it doesn't re-prompt,
 * so navigating between filters doesn't keep nagging.
 */

import { useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';

interface LettersGateProps {
  children: ReactNode;
}

export function LettersGate({ children }: LettersGateProps) {
  const [unlocked, setUnlocked] = useState(false);

  if (unlocked) return <>{children}</>;

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0608',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        maxWidth: 380, textAlign: 'center',
        background: 'linear-gradient(180deg, #1a0c12 0%, #14080d 100%)',
        border: '1px solid #2d1a25', borderRadius: 6,
        padding: '32px 28px',
      }}>
        <div style={{
          width: 48, height: 48, margin: '0 auto 18px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 25%, #8a1f37 0%, #5c0a1e 65%, #3a0512 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#c4956a',
        }}>
          <Lock size={20} />
        </div>
        <h2 style={{
          margin: '0 0 8px 0',
          fontFamily: 'Georgia, serif', fontSize: 18,
          color: '#f0e6d8', letterSpacing: '0.02em',
        }}>
          Letters from Mama
        </h2>
        <p style={{
          margin: '0 0 22px 0',
          fontSize: 12.5, lineHeight: 1.6, color: '#a0908a',
        }}>
          Private. Mama's words for your eyes.
          <br />
          Make sure no one's looking before you open.
        </p>
        <button
          onClick={() => setUnlocked(true)}
          style={{
            background: '#5c0a1e', color: '#f5ead4',
            border: '1px solid #c4956a', borderRadius: 3,
            padding: '10px 22px', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          Open the box
        </button>
      </div>
    </div>
  );
}
