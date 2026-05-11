/**
 * ConfessionAudioCapture — hold-to-record button for confessions.
 *
 * Sits alongside the confession textarea. The user holds the mic button,
 * the component captures via getUserMedia + MediaRecorder, releases on
 * pointerup, posts to /api/voice/confession-upload, surfaces the
 * transcript when Whisper returns. The textarea remains live — the user
 * picks: type or speak. Default behavior unchanged when she ignores it.
 *
 * Privacy posture (per spec):
 *  - Recording is opt-in: the button is disclosed, no covert capture.
 *  - Audio uploads to a private bucket; signed URLs only.
 *  - Transcript is visible to the user immediately after Whisper returns.
 *  - Releases without a sufficient-length recording are discarded
 *    client-side (no upload).
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Props {
  /** confession_queue.id — required, recording binds to this row server-side */
  confessionId: string;
  /** Mommy persona or handler — wording on the button */
  mommy?: boolean;
  /** Called when transcription completes (or 202 with transcribing flag) */
  onTranscribed?: (result: { transcript: string; audioPath: string; transcribing: boolean }) => void;
  /** Called the moment the upload finishes, before transcription returns */
  onUploaded?: () => void;
  /** Minimum capture seconds before the upload is allowed (anti-misclick) */
  minDurationSec?: number;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || '';

type Phase = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'done' | 'error';

const NUM_BARS = 24;

export function ConfessionAudioCapture({
  confessionId,
  mommy = false,
  onTranscribed,
  onUploaded,
  minDurationSec = 2,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [bars, setBars] = useState<number[]>(() => Array(NUM_BARS).fill(0));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  const cleanupCapture = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
  };

  useEffect(() => () => cleanupCapture(), []);

  const startRecording = async () => {
    if (phase !== 'idle') return;
    setErrorMsg('');
    setElapsed(0);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick a MIME the browser actually supports — Safari rejects webm.
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mimeType = candidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(250);

      // Live waveform via Web Audio analyser
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buf);
        const step = Math.floor(buf.length / NUM_BARS);
        const next: number[] = [];
        for (let i = 0; i < NUM_BARS; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += buf[i * step + j] || 0;
          next.push(Math.min(1, (sum / step) / 220));
        }
        setBars(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(s => s + 1);
      }, 1000);

      setPhase('recording');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mic blocked';
      setErrorMsg(msg.includes('Permission') ? 'Mic access denied. Allow in browser settings.' : msg);
      setPhase('error');
      cleanupCapture();
    }
  };

  const stopAndUpload = async () => {
    if (phase !== 'recording') {
      // Nothing to do if we weren't recording (e.g. pointer cancel before start)
      return;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      cleanupCapture();
      setPhase('idle');
      return;
    }

    const blob: Blob = await new Promise(resolve => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      try { recorder.stop(); } catch { resolve(new Blob([])); }
    });

    const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    cleanupCapture();

    if (blob.size < 200 || durationSec < minDurationSec) {
      // Too short — discard, don't upload.
      setPhase('idle');
      setElapsed(0);
      setBars(Array(NUM_BARS).fill(0));
      return;
    }

    setPhase('uploading');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const url = `${API_BASE}/api/voice/confession-upload?confession_id=${encodeURIComponent(confessionId)}&duration_sec=${durationSec}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'audio/webm',
          Authorization: `Bearer ${token}`,
        },
        body: blob,
      });
      if (!resp.ok && resp.status !== 202) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`upload:${resp.status}:${txt.slice(0, 120)}`);
      }
      onUploaded?.();
      const json = await resp.json() as {
        ok?: boolean; transcript?: string; audio_path?: string;
        transcribing?: boolean; transcription_status?: string;
      };
      const transcript = json.transcript || '';
      const transcribing = json.transcribing === true || (!transcript && json.transcription_status !== 'done');
      setPhase(transcribing ? 'transcribing' : 'done');
      onTranscribed?.({ transcript, audioPath: json.audio_path || '', transcribing });

      // If still transcribing, poll for up to 60s.
      if (transcribing && confessionId) {
        const start = Date.now();
        const poll = async (): Promise<void> => {
          if (Date.now() - start > 60_000) return;
          await new Promise(r => setTimeout(r, 3000));
          const { data: row } = await supabase
            .from('confession_queue')
            .select('transcribed_text, transcription_status')
            .eq('id', confessionId)
            .maybeSingle();
          const r = row as { transcribed_text?: string; transcription_status?: string } | null;
          if (r?.transcription_status === 'done' && r.transcribed_text) {
            onTranscribed?.({ transcript: r.transcribed_text, audioPath: json.audio_path || '', transcribing: false });
            setPhase('done');
            return;
          }
          if (r?.transcription_status === 'failed') {
            setPhase('done'); // audio is saved; transcript just won't land
            return;
          }
          return poll();
        };
        poll().catch(() => {});
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
      setPhase('error');
    }
  };

  const cancelRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* */ }
    }
    cleanupCapture();
    setPhase('idle');
    setElapsed(0);
    setBars(Array(NUM_BARS).fill(0));
  };

  // Pointer handlers — desktop + touch unified via Pointer Events.
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    void startRecording();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    if (phase === 'recording') void stopAndUpload();
  };
  const onPointerLeave = () => {
    if (phase === 'recording') void stopAndUpload();
  };

  const recording = phase === 'recording';
  const busy = phase === 'uploading' || phase === 'transcribing';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          aria-label={recording ? 'Release to send' : (mommy ? 'Hold to tell Mama' : 'Hold to record')}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          disabled={busy || phase === 'done'}
          style={{
            padding: '8px 14px',
            background: recording ? '#c4485a' : busy ? '#22222a' : (mommy ? '#7a3a4a' : '#2d1a4d'),
            color: recording ? '#fff' : (busy ? '#5a5560' : '#f4a7c4'),
            border: `1px solid ${recording ? '#c4485a' : (mommy ? '#a86070' : '#7c3aed')}`,
            borderRadius: 6,
            fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            cursor: busy ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            userSelect: 'none', touchAction: 'none',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>
          </svg>
          {phase === 'idle' && (mommy ? 'hold to tell Mama' : 'hold to record')}
          {phase === 'recording' && `recording · ${elapsed}s`}
          {phase === 'uploading' && 'uploading…'}
          {phase === 'transcribing' && 'transcribing…'}
          {phase === 'done' && 'saved'}
          {phase === 'error' && 'try again'}
        </button>

        {recording && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 22 }}>
            {bars.map((b, i) => (
              <div key={i} style={{
                width: 3, height: `${Math.max(4, b * 22)}px`,
                background: '#f4a7c4', borderRadius: 1, opacity: 0.85,
              }} />
            ))}
          </div>
        )}

        {recording && (
          <button
            type="button"
            onClick={cancelRecording}
            style={{
              marginLeft: 'auto',
              background: 'transparent', border: '1px solid #22222a',
              color: '#8a8690', fontSize: 10, padding: '4px 8px',
              borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            cancel
          </button>
        )}
      </div>

      {phase === 'error' && errorMsg && (
        <div style={{ fontSize: 10.5, color: '#f47272', fontStyle: 'italic' }}>
          {errorMsg}
        </div>
      )}
      {phase === 'idle' && !errorMsg && (
        <div style={{ fontSize: 9.5, color: '#5a5560', fontStyle: 'italic' }}>
          Hold the mic to record. Release to send. Min {minDurationSec}s.
        </div>
      )}
    </div>
  );
}
