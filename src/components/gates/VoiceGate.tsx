import { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const RECORD_SECONDS = 4;
const PITCH_THRESHOLD_HZ = 140;

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
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone blocked. Allow access or use the typed fallback below.'
          : 'No microphone available. Use the typed fallback below.'
      );
      return;
    }

    streamRef.current = stream;
    setRecording(true);
    recordingRef.current = true;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;
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
    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContext.close().catch(() => {});
    audioContextRef.current = null;

    if (pitches.length === 0) {
      setError('No speech detected. Speak the mantra aloud and try again.');
      return;
    }

    const sorted = [...pitches].sort((a, b) => a - b);
    const medianPitch = sorted[Math.floor(sorted.length / 2)];
    setPitch(medianPitch);
    await verify(medianPitch);
  };

  const verify = async (avgPitch: number) => {
    setVerifying(true);

    if (avgPitch < PITCH_THRESHOLD_HZ) {
      setError(`Pitch too low: ${avgPitch.toFixed(0)}Hz (need ≥${PITCH_THRESHOLD_HZ}Hz). Speak higher.`);
      setVerifying(false);
      return;
    }

    if (user?.id) {
      try {
        await supabase.from('voice_practice_log').insert({
          user_id: user.id,
          duration_seconds: RECORD_SECONDS,
          avg_pitch_hz: Math.round(avgPitch),
        });
        await supabase.from('voice_pitch_samples').insert({
          user_id: user.id,
          pitch_hz: Math.round(avgPitch),
        });
      } catch {
        // Non-critical
      }
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
            Speak the mantra aloud to enter. Pitch must be feminine.
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
            <span className={livePitch >= PITCH_THRESHOLD_HZ ? 'text-green-400' : 'text-yellow-400'}>
              {livePitch.toFixed(0)}Hz
            </span>
            <span className="text-gray-500 ml-2">(target: ≥{PITCH_THRESHOLD_HZ}Hz)</span>
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

        {/* Typed fallback for devices without mic */}
        <TypedMantraFallback mantra={mantra} onPass={() => {
          // Dismiss gate immediately — log fire-and-forget so a slow or
          // failed insert never blocks the dismiss.
          onPass();
          if (user?.id) {
            supabase.from('voice_practice_log')
              .insert({ user_id: user.id, duration_seconds: 5, avg_pitch_hz: 0 })
              .then(() => {})
              .then(undefined, () => {});
          }
        }} />

        <p className="text-xs text-gray-500 text-center">
          You cannot enter without completing this. The Handler is waiting.
        </p>
      </div>
    </div>
  );
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

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function TypedMantraFallback({ mantra, onPass }: { mantra: string; onPass: () => void }) {
  const [typed, setTyped] = useState('');
  const [count, setCount] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const passedRef = useRef(false);
  const required = 3;
  const matches = normalize(typed) === normalize(mantra);

  const handleSubmit = () => {
    if (passedRef.current) return; // already dismissed once
    if (matches) {
      const newCount = count + 1;
      setCount(newCount);
      setTyped('');
      setHint(null);
      if (newCount >= required) {
        passedRef.current = true;
        onPass();
      }
    } else if (typed.trim().length > 0) {
      setHint('Does not match. Type the mantra exactly as shown.');
    }
  };

  return (
    <div className="border-t border-gray-800 pt-4 mt-2">
      <p className="text-xs text-gray-500 text-center mb-2">
        Mic not working? Type the mantra {required} times instead ({count}/{required})
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={typed}
          onChange={(e) => { setTyped(e.target.value); if (hint) setHint(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Type the mantra exactly..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          autoComplete="off"
        />
        <button
          onClick={handleSubmit}
          disabled={!matches}
          className="px-4 py-2 rounded-lg bg-purple-600 disabled:bg-gray-800 text-white text-sm"
        >
          {count}/{required}
        </button>
      </div>
      {hint && (
        <p className="text-xs text-red-400 text-center mt-2">{hint}</p>
      )}
    </div>
  );
}
