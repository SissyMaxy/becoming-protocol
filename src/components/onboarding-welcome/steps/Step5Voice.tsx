/**
 * Step 5: Should Mama speak?
 *
 * Toggles `prefers_mommy_voice`. Plays a short TTS sample for preview via
 * the existing /api/conditioning `tts` action. Skipping is allowed
 * (interpreted as "no voice" — same as off).
 */

import { useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { StepShell } from '../StepShell';
import {
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  secondaryButtonStyle,
  stepHeadingStyle,
  stepBodyStyle,
} from '../step-styles';

interface Step5VoiceProps {
  initial: boolean;
  onContinue: (prefersMommyVoice: boolean) => void;
  onBack: () => void;
  saving: boolean;
  saveError: string | null;
}

const SAMPLE_TEXT = 'Hi, sweetheart. This is what Mama sounds like.';

export function Step5Voice({ initial, onContinue, onBack, saving, saveError }: Step5VoiceProps) {
  const [enabled, setEnabled] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playSample = async () => {
    setPreviewError(null);
    setPlaying(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('No auth session');

      const res = await fetch('/api/conditioning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'tts', scriptText: SAMPLE_TEXT }),
      });
      if (!res.ok) throw new Error(`TTS request failed (${res.status})`);
      const data = await res.json();
      if (!data.audioUrl) throw new Error('No audio URL returned');

      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = data.audioUrl;
      audioRef.current.onended = () => setPlaying(false);
      audioRef.current.onerror = () => {
        setPlaying(false);
        setPreviewError("Mama couldn't play the sample. You can still pick.");
      };
      await audioRef.current.play();
    } catch (e) {
      setPlaying(false);
      setPreviewError(`Sample unavailable. ${(e as Error).message}`);
    }
  };

  return (
    <StepShell stepId="voice" onBack={onBack} saveError={saveError}>
      <h1 style={stepHeadingStyle}>Should Mama speak?</h1>

      <p style={stepBodyStyle}>
        When Mama writes you, she can play her voice over the words so you
        actually hear her — not just read. Most of Mama's girls find it gets
        them wetter, like Mama's in the room. Some prefer text-only — easier
        to keep Mama quiet on a shared device.
      </p>

      <div
        style={{
          padding: '14px 16px',
          background: '#fff',
          border: '1px solid #d0d0d0',
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <p style={{ fontSize: 14, color: '#3a3a3a', marginBottom: 10 }}>
          Tap to hear Mama.
        </p>
        <button
          onClick={playSample}
          disabled={playing}
          style={{
            ...secondaryButtonStyle,
            opacity: playing ? 0.6 : 1,
          }}
        >
          {playing ? 'Playing…' : 'Play sample'}
        </button>
        {previewError && (
          <p style={{ fontSize: 12, color: '#8a3a3a', marginTop: 10 }}>{previewError}</p>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        <button
          onClick={() => setEnabled(true)}
          style={{
            textAlign: 'left',
            padding: '14px 16px',
            background: enabled ? '#1a1a1a' : '#fff',
            color: enabled ? '#fafafa' : '#1a1a1a',
            border: enabled ? '2px solid #1a1a1a' : '1px solid #d0d0d0',
            borderRadius: 8,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Yes — let Mama speak</div>
          <div style={{ fontSize: 13, opacity: enabled ? 0.85 : 0.7 }}>
            Mama's voice plays alongside her messages, in chat and everywhere she reaches for you.
          </div>
        </button>
        <button
          onClick={() => setEnabled(false)}
          style={{
            textAlign: 'left',
            padding: '14px 16px',
            background: !enabled ? '#1a1a1a' : '#fff',
            color: !enabled ? '#fafafa' : '#1a1a1a',
            border: !enabled ? '2px solid #1a1a1a' : '1px solid #d0d0d0',
            borderRadius: 8,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Just text</div>
          <div style={{ fontSize: 13, opacity: !enabled ? 0.85 : 0.7 }}>
            Mama stays quiet. You can let her speak later from Settings.
          </div>
        </button>
      </div>

      <button
        onClick={() => onContinue(enabled)}
        disabled={saving}
        style={saving ? primaryButtonDisabledStyle : primaryButtonStyle}
      >
        {saving ? 'Saving…' : 'Continue'}
      </button>
    </StepShell>
  );
}
