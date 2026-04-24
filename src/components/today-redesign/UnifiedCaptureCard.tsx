/**
 * UnifiedCaptureCard — one-tap body/outfit/mirror/chastity/Gina-text capture.
 *
 * Consolidates the four photo flows Maxy needs daily so there's no friction
 * figuring out which button does what. Picks the right task_type for
 * analyze-photo automatically based on the task she taps.
 */

import { useState } from 'react';
import { PhotoVerificationUpload } from '../handler/PhotoVerificationUpload';

type CaptureMode = null | 'outfit' | 'progress_photo' | 'mirror_check' | 'gina_text';

const MODES: Array<{ key: NonNullable<CaptureMode>; label: string; icon: string; hint: string; accent: string }> = [
  { key: 'outfit', label: 'Today\'s outfit', icon: '👗', hint: 'Head-to-toe, full frame. Feminine pieces visible. Handler scores femininity.', accent: '#f4a7c4' },
  { key: 'progress_photo', label: 'Progress photo', icon: '🪞', hint: 'Underwear only. Front / side / back. Handler notes silhouette delta.', accent: '#c4b5fd' },
  { key: 'mirror_check', label: 'Mirror check', icon: '✨', hint: 'Mirror selfie. Handler reads posture, presentation, expression.', accent: '#6ee7b7' },
  { key: 'gina_text', label: 'Gina text screenshot', icon: '💬', hint: 'Screenshot of conversation with Gina. Extracts her quotes + reaction.', accent: '#f4c272' },
];

export function UnifiedCaptureCard() {
  const [mode, setMode] = useState<CaptureMode>(null);

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700 }}>
          Capture
        </span>
        {mode && (
          <button onClick={() => setMode(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#8a8690', fontSize: 11, cursor: 'pointer', padding: 0 }}>
            ← back
          </button>
        )}
      </div>

      {!mode ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {MODES.map(m => (
              <button key={m.key} onClick={() => setMode(m.key)} style={{
                background: '#0a0a0d', border: `1px solid ${m.accent}33`, borderRadius: 8,
                padding: '10px 8px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                color: '#e8e6e3',
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{m.icon}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: m.accent, marginBottom: 3 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: '#8a8690', lineHeight: 1.4 }}>{m.hint}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#6a656e', marginTop: 8, textAlign: 'center' }}>
            all captures route through Claude vision · analysis feeds Handler context
          </div>
        </>
      ) : (
        <div>
          <div style={{ fontSize: 11.5, color: '#c4b5fd', fontWeight: 600, marginBottom: 8 }}>
            {MODES.find(m => m.key === mode)?.icon} {MODES.find(m => m.key === mode)?.label}
          </div>
          <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 10, lineHeight: 1.4 }}>
            {MODES.find(m => m.key === mode)?.hint}
          </div>
          <PhotoVerificationUpload taskType={mode} onComplete={() => setMode(null)} />
        </div>
      )}
    </div>
  );
}
