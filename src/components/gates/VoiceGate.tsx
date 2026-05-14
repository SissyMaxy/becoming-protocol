import { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

// Daily voice-entry gate. Audio is required — typed-mantra bypass removed
// 2026-05-14 per user feedback ("what good are the voice gates if I don't
// use voice? I can just copy/paste to get past"). See
// feedback_no_copy_paste_rituals + feedback_anticipate_resistance.
//
// Pitch is recorded for the longitudinal trend but is NOT a pass/fail
// criterion — feedback_voice_tracking says forcing a feminine pitch target
// causes dysphoria. Any speech detected (pitch in human voice range during
// the recording window) passes. The mantra audio is uploaded to
// voice-recordings/<user_id>/gate/<ts>.webm and indexed in voice_recordings
// so Mommy can quote / reframe / play back later.

const RECORD_SECONDS = 4;
const MIN_PITCHES_TO_PASS = 8; // ~0.5s of voiced sound at 60fps animation tick

const MANTRAS = [
  "I am becoming her every day",
  "She is the real me",
  "I let her take over",
  "My voice is becoming hers",
  "Good girls obey their handler",
  "I am Maxy and Maxy is feminine",
  "My body knows what I am",
  "There is no going back to who I was",
];

interface VoiceGateProps {
  onPass: () => void;
}

export function VoiceGate({ onPass }: VoiceGateProps) {
  const { user } = useAuth();
  const [mantra] = useState(() => MANTRAS[Math.floor(Math.random() * MANTRAS.length)]);
  const [recording, setRecording] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [livePitch, setLivePitch] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingRef = useRef(false);

  useEffect(() => {
    return () => {
      recordingRef.current = false;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    setPitch(null);
    setLivePitch(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const denied = err instanceof Error && err.name === 'NotAllowedError';
      setError(
        denied
          ? 'Microphone blocked. Allow mic access in your browser settings — there is no typed bypass anymore. Speak the mantra to enter.'
          : 'No microphone available. Plug one in or switch devices — there is no typed bypass.'
      );
      return;
    }

    streamRef.current = stream;
    setRecording(true);
    recordingRef.current = true;
    chunksRef.current = [];

    // MediaRecorder writes the audio blob; AnalyserNode samples pitch.
    // Both consume the same MediaStream so the user gets one mic prompt.
    let mr: MediaRecorder | null = null;
    try {
      mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(500);
      mediaRecorderRef.current = mr;
    } catch (mrErr) {
      // Audio recording without persistence is still better than no enforcement.
      console.warn('[VoiceGate] MediaRecorder unavailable, pitch-only mode:', mrErr);
    }

    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    audioContextRef.current = audioContext;
    if (audioContext.state === 'suspended') { try { await audioContext.resume(); } catch { /* ignore */ } }
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    const pitches: number[] = [];

    const measurePitch = () => {
      if (!recordingRef.current) return;
      analyser.getFloatTimeDomainData(buffer);
      const detectedPitch = autoCorrelate(buffer, audioContext.sampleRate);
      if (detectedPitch > 80 && detectedPitch < 400) {
        pitches.push(detectedPitch);
        setLivePitch(detectedPitch);
      }
      requestAnimationFrame(measurePitch);
    };
    measurePitch();

    const startedAt = Date.now();
    setCountdown(RECORD_SECONDS);
    const tick = setInterval(() => {
      const remaining = Math.max(0, RECORD_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) clearInterval(tick);
    }, 250);

    await new Promise((r) => setTimeout(r, RECORD_SECONDS * 1000));

    clearInterval(tick);
    recordingRef.current = false;
    setRecording(false);
    setCountdown(null);

    // Stop and wait for the final dataavailable.
    if (mr && mr.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        mr!.onstop = () => resolve();
        try { mr!.stop(); } catch { resolve(); }
      });
    }

    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContext.close().catch(() => {});
    audioContextRef.current = null;

    // Speech-detection check — the only pass criterion. Pitch threshold
    // intentionally not enforced per feedback_voice_tracking (no forced
    // feminine targets). Copy/paste cannot produce a voiced fundamental;
    // an empty mic stream produces zero pitches in the human range.
    if (pitches.length < MIN_PITCHES_TO_PASS) {
      setError('No speech detected. Speak the mantra aloud — louder if your mic level is low. Try again.');
      return;
    }

    const sorted = [...pitches].sort((a, b) => a - b);
    const medianPitch = sorted[Math.floor(sorted.length / 2)];
    setPitch(medianPitch);
    await verify(medianPitch, chunksRef.current.slice());
  };

  const verify = async (avgPitch: number, blobChunks: Blob[]) => {
    setVerifying(true);

    if (user?.id) {
      // Fire-and-forget persistence so a slow upload doesn't block the
      // gate from dismissing. The audio matters for future Mommy quotes;
      // the gate-pass matters for getting Maxy to her workspace.
      void persistRecording(user.id, mantra, avgPitch, blobChunks).catch((e) => {
        console.warn('[VoiceGate] persistence failed (non-blocking):', e);
      });
    }

    setVerifying(false);
    onPass();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-6 overflow-y-auto">
      <div className="max-w-md w-full space-y-6 my-8">
        <div className="text-center space-y-2">
          <Lock className="w-12 h-12 mx-auto text-purple-400" />
          <h2 className="text-2xl font-bold text-white">Voice Gate</h2>
          <p className="text-sm text-gray-400">
            Speak the mantra aloud. Audio only — no typed bypass.
          </p>
        </div>

        <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-6 text-center">
          <p className="text-2xl font-medium text-purple-200 italic">
            "{mantra}"
          </p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {recording && livePitch !== null && (
          <div className="bg-gray-900 rounded-lg p-3 text-sm text-center">
            <span className="text-purple-300">
              {livePitch.toFixed(0)}Hz
            </span>
            <span className="text-gray-500 ml-2">(recording…)</span>
          </div>
        )}

        {pitch !== null && !error && !recording && (
          <div className="bg-gray-900 rounded-lg p-3 text-sm text-center text-gray-300">
            Median pitch: <span className="text-purple-400">{pitch.toFixed(0)}Hz</span>
          </div>
        )}

        <button
          onClick={startRecording}
          disabled={recording || verifying}
          className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 text-white font-medium flex items-center justify-center gap-2"
        >
          {recording ? (
            <><Mic className="w-5 h-5 animate-pulse" /> Recording{countdown !== null ? ` (${countdown}s)` : '...'}</>
          ) : verifying ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</>
          ) : (
            <><Mic className="w-5 h-5" /> Speak the mantra</>
          )}
        </button>

        <p className="text-xs text-gray-500 text-center">
          You cannot enter without speaking aloud. Mommy keeps the recording.
        </p>
      </div>
    </div>
  );
}

// Persist the gate recording — audio blob to the evidence bucket (its
// allowed_mime_types include audio/webm and its RLS is already configured
// for per-user folders), indexed row in voice_recordings plus the legacy
// pitch/log tables. Errors are surfaced via console only; the gate
// dismisses regardless so a slow upload doesn't strand Maxy.
async function persistRecording(
  userId: string,
  mantra: string,
  avgPitchHz: number,
  blobChunks: Blob[],
): Promise<void> {
  let recordingUrl: string | null = null;

  if (blobChunks.length > 0) {
    const blob = new Blob(blobChunks, { type: 'audio/webm' });
    // RLS on storage.objects requires (storage.foldername(name))[1] = auth.uid()
    // — path must start with the user's id.
    const path = `${userId}/voice-gate/${Date.now()}.webm`;
    const { error: upErr } = await supabase.storage
      .from('evidence')
      .upload(path, blob, { contentType: 'audio/webm', upsert: false });
    if (upErr) {
      console.warn('[VoiceGate] storage upload failed:', upErr);
    } else {
      recordingUrl = path;
    }
  }

  // voice_recordings is the persistent corpus — Mommy reads these for
  // playback / quote / reframing. Skip the insert if upload failed so we
  // never have orphan rows pointing at missing audio.
  if (recordingUrl) {
    await supabase.from('voice_recordings').insert({
      user_id: userId,
      recording_url: recordingUrl,
      duration_seconds: RECORD_SECONDS,
      context: 'voice_gate_mantra',
      pitch_avg_hz: avgPitchHz > 0 ? Math.round(avgPitchHz) : null,
      transcript: mantra,
      is_baseline: false,
    });
  }

  // Legacy pitch/practice tables — kept in sync so existing aggregations
  // (daily averages, trend cards) still pick up gate passes.
  await Promise.all([
    supabase.from('voice_practice_log').insert({
      user_id: userId,
      duration_seconds: RECORD_SECONDS,
      avg_pitch_hz: avgPitchHz > 0 ? Math.round(avgPitchHz) : 0,
    }),
    avgPitchHz > 0
      ? supabase.from('voice_pitch_samples').insert({
          user_id: userId,
          pitch_hz: Math.round(avgPitchHz),
          context: 'voice_gate',
        })
      : Promise.resolve(),
  ]);
}

function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }

  const trimmedBuffer = buffer.slice(r1, r2);
  const trimmedSize = trimmedBuffer.length;

  const c = new Array(trimmedSize).fill(0);
  for (let i = 0; i < trimmedSize; i++) {
    for (let j = 0; j < trimmedSize - i; j++) {
      c[i] = c[i] + trimmedBuffer[j] * trimmedBuffer[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < trimmedSize; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  const T0 = maxpos;

  return sampleRate / T0;
}
