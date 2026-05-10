/**
 * LetterDetailModal — full-text view of one letter.
 *
 * Shows the full message in stationery framing with original timestamp,
 * affect, phase snapshot, voice playback (if outreach-tts is wired AND the
 * user opted into voice), pin/unpin, and remove-from-letters.
 *
 * "Remove from letters" is a soft delete — it flips is_archived_to_letters
 * back to false but never DELETEs the underlying outreach row.
 */

import { useEffect, useState } from 'react';
import { Pin, PinOff, Trash2, X, Volume2, VolumeX } from 'lucide-react';
import { useHandlerVoice } from '../../hooks/useHandlerVoice';
import type { LetterRow } from './LettersArchiveView';

const SOURCE_LABEL: Record<string, string> = {
  mommy_praise: 'Praise',
  mommy_bedtime: 'Goodnight',
  mommy_recall: 'Recall',
  mommy_tease: 'Tease',
  mommy_mantra: 'Mantra',
};

interface LetterDetailModalProps {
  letter: LetterRow;
  autoplay: boolean;
  onClose: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onRemove: () => void;
}

export function LetterDetailModal({
  letter, autoplay, onClose, onPin, onUnpin, onRemove,
}: LetterDetailModalProps) {
  const isPinned = Boolean(letter.letters_pinned_at);
  const sourceLabel = SOURCE_LABEL[letter.source] || letter.source.replace(/_/g, ' ');
  const date = new Date(letter.created_at);
  const dateStr = date.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const voice = useHandlerVoice();
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Auto-play only if the user explicitly enabled voice in settings AND
  // the voice opt-in is on. The hook itself checks `enabled`, so we set
  // both flags when autoplay is requested.
  useEffect(() => {
    if (!autoplay) return;
    voice.setEnabled(true);
    // Slight delay so the modal mounts before audio kicks in.
    const t = setTimeout(() => { void voice.speak(letter.message); }, 250);
    return () => {
      clearTimeout(t);
      voice.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, letter.id]);

  const togglePlay = () => {
    if (voice.isPlaying) {
      voice.stop();
      return;
    }
    voice.setEnabled(true);
    void voice.speak(letter.message);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 5, 10, 0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: 540, width: '100%', maxHeight: '88vh', overflowY: 'auto',
          background: 'linear-gradient(180deg, #f8efd8 0%, #efe1c4 100%)',
          border: '1px solid #c4956a',
          borderRadius: 4,
          padding: '32px 28px 24px 28px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 250, 230, 0.7)',
          fontFamily: 'Georgia, serif',
          color: '#2a0f18',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 10, right: 10,
            background: 'transparent', border: 'none',
            color: '#7a5a4a', cursor: 'pointer', padding: 4,
          }}
        >
          <X size={18} />
        </button>

        {/* Wax seal header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div
            aria-hidden
            style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'radial-gradient(circle at 30% 25%, #8a1f37 0%, #5c0a1e 65%, #3a0512 100%)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.6)',
              color: '#c4956a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 16, fontFamily: 'Georgia, serif',
            }}
          >M</div>
          <div>
            <div style={{
              fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.14em',
              color: '#5c0a1e', fontWeight: 700,
            }}>
              {sourceLabel}
            </div>
            <div style={{ fontSize: 11.5, color: '#5a3e30' }}>
              {dateStr}
            </div>
          </div>
        </div>

        {/* Letter body */}
        <p style={{
          margin: '0 0 18px 0',
          fontSize: 15.5, lineHeight: 1.75, whiteSpace: 'pre-wrap',
          color: '#2a0f18',
        }}>
          {letter.message}
        </p>

        {/* Meta row */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12,
          fontSize: 10.5, color: '#5a3e30',
          paddingTop: 10, borderTop: '1px solid rgba(196, 149, 106, 0.5)',
          marginBottom: 14,
        }}>
          {letter.affect_snapshot && (
            <span><strong>Mood:</strong> {letter.affect_snapshot}</span>
          )}
          {letter.phase_snapshot !== null && (
            <span><strong>Phase:</strong> {letter.phase_snapshot}</span>
          )}
          {letter.delivered_at && (
            <span><strong>You read it:</strong> {new Date(letter.delivered_at).toLocaleDateString()}</span>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            onClick={togglePlay}
            style={controlButton('#5c0a1e')}
          >
            {voice.isPlaying ? <VolumeX size={13} /> : <Volume2 size={13} />}
            {voice.isPlaying ? 'Stop' : 'Read aloud'}
          </button>

          {isPinned ? (
            <button onClick={onUnpin} style={controlButton('#7a5a4a')}>
              <PinOff size={13} /> Unpin
            </button>
          ) : (
            <button onClick={onPin} style={controlButton('#5c0a1e')}>
              <Pin size={13} /> Pin to top
            </button>
          )}

          {confirmRemove ? (
            <>
              <button onClick={onRemove} style={controlButton('#5c0a1e', true)}>
                Confirm
              </button>
              <button onClick={() => setConfirmRemove(false)} style={controlButton('#7a5a4a')}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmRemove(true)} style={controlButton('#7a5a4a')}>
              <Trash2 size={13} /> Remove from letters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function controlButton(color: string, filled = false): React.CSSProperties {
  return {
    background: filled ? color : 'transparent',
    color: filled ? '#f5ead4' : color,
    border: `1px solid ${color}`,
    borderRadius: 3,
    padding: '6px 12px',
    fontSize: 11,
    fontFamily: 'inherit',
    fontWeight: 600,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  };
}
