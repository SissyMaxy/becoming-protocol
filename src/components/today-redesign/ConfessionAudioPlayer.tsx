/**
 * ConfessionAudioPlayer — signs the audio_storage_path and renders an
 * inline audio control. Used by:
 *  - ConfessionQueueCard receipts (the user's archive of confessions)
 *  - FocusMode confession surface (live confession just recorded)
 *  - Mommy outreach card (audio implant playback — "listen to yourself")
 *
 * Audio is in the private `audio` bucket. We sign on mount and re-sign
 * when the path changes; if signing fails the component renders nothing
 * rather than a broken control.
 */

import { useEffect, useState } from 'react';
import { getSignedAssetUrl } from '../../lib/storage/signed-url';

interface Props {
  audioPath: string | null | undefined;
  /** Visible label above the player */
  label?: string;
  /** "compact" hides the label, used for tight rows */
  compact?: boolean;
  /** Optional duration (sec) shown next to the label */
  durationSec?: number | null;
}

export function ConfessionAudioPlayer({ audioPath, label, compact = false, durationSec }: Props) {
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!audioPath) { setSigned(null); return; }
    (async () => {
      const url = await getSignedAssetUrl('audio', audioPath, 6 * 3600);
      if (!cancelled) setSigned(url);
    })();
    return () => { cancelled = true; };
  }, [audioPath]);

  if (!audioPath) return null;
  if (!signed) {
    return (
      <div style={{ fontSize: 10, color: '#5a5560', fontStyle: 'italic' }}>
        loading audio…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {!compact && label && (
        <div style={{
          fontSize: 9.5, color: '#c4b5fd', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {label}
          {typeof durationSec === 'number' && durationSec > 0 && (
            <span style={{ color: '#8a8690', marginLeft: 6, fontWeight: 400 }}>
              · {durationSec}s
            </span>
          )}
        </div>
      )}
      <audio
        controls preload="metadata"
        src={signed}
        style={{
          width: '100%', height: 32,
          // Filter to keep the native player on-brand without breaking a11y
          filter: 'invert(0.85) hue-rotate(180deg)',
        }}
      />
    </div>
  );
}
