import { useState, useRef } from 'react';
import { Mic, Loader2, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

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
  const [transcribed, setTranscribed] = useState<string>('');
  const [pitch, setPitch] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingRef = useRef(false);

  const startRecording = async () => {
    setError(null);
    setRecording(true);
    recordingRef.current = true;
    setTranscribed('');
    setPitch(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        }
        if (recordingRef.current) requestAnimationFrame(measurePitch);
      };
      measurePitch();

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setError('Speech recognition not supported in this browser');
        setRecording(false);
        recordingRef.current = false;
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = async (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscribed(text);
        setRecording(false);
        recordingRef.current = false;
        stream.getTracks().forEach((t) => t.stop());

        const avgPitch = pitches.length > 0 ? pitches.reduce((s, p) => s + p, 0) / pitches.length : 0;
        setPitch(avgPitch);

        await verify(text, avgPitch);
      };

      recognition.onerror = (event: any) => {
        setError(`Recognition error: ${event.error}`);
        setRecording(false);
        recordingRef.current = false;
        stream.getTracks().forEach((t) => t.stop());
      };

      recognition.onend = () => {
        setRecording(false);
        recordingRef.current = false;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
      setRecording(false);
      recordingRef.current = false;
    }
  };

  const verify = async (text: string, avgPitch: number) => {
    setVerifying(true);

    const mantraWords = mantra.toLowerCase().split(/\s+/);
    const spokenWords = text.toLowerCase().split(/\s+/);
    const matched = mantraWords.filter((w) => spokenWords.includes(w)).length;
    const matchRatio = matched / mantraWords.length;

    const passed = matchRatio >= 0.6 && avgPitch >= 140;

    if (!passed) {
      setError(`Try again. Match: ${(matchRatio * 100).toFixed(0)}%, pitch: ${avgPitch.toFixed(0)}Hz (need ≥140Hz)`);
      setVerifying(false);
      return;
    }

    if (user?.id) {
      try {
        await supabase.from('voice_practice_log').insert({
          user_id: user.id,
          duration_seconds: 5,
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
          <h2 className="text-2xl font-bold text-white">Daily Mantra</h2>
          <p className="text-sm text-gray-400">
            Type the mantra exactly 3 times to enter.
          </p>
        </div>

        <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-6 text-center">
          <p className="text-2xl font-medium text-purple-200 italic">
            "{mantra}"
          </p>
        </div>

        {/* Primary: typed mantra (works everywhere) */}
        <TypedMantraFallback mantra={mantra} onPass={async () => {
          if (user?.id) {
            try {
              await supabase.from('voice_practice_log').insert({ user_id: user.id, duration_seconds: 5, avg_pitch_hz: 0 });
            } catch {}
          }
          onPass();
        }} />

        {/* Secondary: voice option for desktop */}
        <div className="border-t border-gray-800 pt-4">
          <p className="text-xs text-gray-600 text-center mb-2">Or speak it (desktop only)</p>

          {error && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 text-sm text-red-300 mb-2">
              {error}
            </div>
          )}

          {transcribed && !error && (
            <div className="bg-gray-900 rounded-lg p-3 text-sm text-gray-300 mb-2">
              Heard: "{transcribed}"
              {pitch && <span className="text-purple-400 ml-2">({pitch.toFixed(0)}Hz)</span>}
            </div>
          )}

          <button
            onClick={startRecording}
            disabled={recording || verifying}
            className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 text-gray-300 text-sm flex items-center justify-center gap-2"
          >
            {recording ? (
              <><Mic className="w-4 h-4 animate-pulse" /> Recording...</>
            ) : verifying ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
            ) : (
              <><Mic className="w-4 h-4" /> Speak instead</>
            )}
          </button>
        </div>

        <p className="text-xs text-gray-600 text-center">
          The Handler is waiting.
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

function TypedMantraFallback({ mantra, onPass }: { mantra: string; onPass: () => void }) {
  const [typed, setTyped] = useState('');
  const [count, setCount] = useState(0);
  const required = 3;

  const handleSubmit = () => {
    if (typed.trim().toLowerCase() === mantra.toLowerCase()) {
      const newCount = count + 1;
      setCount(newCount);
      setTyped('');
      if (newCount >= required) {
        onPass();
      }
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
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Type the mantra exactly..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          autoComplete="off"
        />
        <button
          onClick={handleSubmit}
          disabled={typed.trim().toLowerCase() !== mantra.toLowerCase()}
          className="px-4 py-2 rounded-lg bg-purple-600 disabled:bg-gray-800 text-white text-sm"
        >
          {count + 1}/{required}
        </button>
      </div>
    </div>
  );
}
