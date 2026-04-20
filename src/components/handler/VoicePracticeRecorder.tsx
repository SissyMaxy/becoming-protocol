import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface VoicePracticeRecorderProps {
  targetPhrase?: string;
  minDurationSeconds?: number;
  targetPitchHz?: number;
  onComplete: (result: { avgPitch: number; transcript: string; passed: boolean }) => void;
  onCancel?: () => void;
}

export function VoicePracticeRecorder({
  targetPhrase,
  minDurationSeconds = 10,
  targetPitchHz: _targetPitchHz = 160,
  onComplete,
  onCancel,
}: VoicePracticeRecorderProps) {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [pitches, setPitches] = useState<number[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ avgPitch: number; minPitch: number; maxPitch: number; transcript: string; passed: boolean } | null>(null);

  const recordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<any>(null);
  const pitchesRef = useRef<number[]>([]);

  const startRecording = async () => {
    setRecording(true);
    recordingRef.current = true;
    setElapsed(0);
    setTranscript('');
    setPitches([]);
    pitchesRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);

      const measurePitch = () => {
        if (!recordingRef.current) return;
        analyser.getFloatTimeDomainData(buffer);
        const pitch = autoCorrelate(buffer, audioContext.sampleRate);
        if (pitch > 80 && pitch < 400) {
          pitchesRef.current.push(pitch);
          setPitches(prev => [...prev, pitch]);
        }
        if (recordingRef.current) requestAnimationFrame(measurePitch);
      };
      measurePitch();

      timerRef.current = setInterval(() => {
        setElapsed(s => s + 1);
      }, 1000);

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const recognition = new SR();
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;
        let finalTranscript = '';
        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
            else interim += event.results[i][0].transcript;
          }
          setTranscript(finalTranscript + interim);
        };
        recognition.onerror = () => {};
        recognitionRef.current = recognition;
        recognition.start();
      }
    } catch (err) {
      setRecording(false);
      recordingRef.current = false;
    }
  };

  const stopAndAnalyze = async () => {
    recordingRef.current = false;
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

    setAnalyzing(true);

    const allPitches = pitchesRef.current;
    const avgPitch = allPitches.length > 0 ? allPitches.reduce((s, p) => s + p, 0) / allPitches.length : 0;
    const minPitch = allPitches.length > 0 ? Math.min(...allPitches) : 0;
    const maxPitch = allPitches.length > 0 ? Math.max(...allPitches) : 0;
    // No pass/fail — voice tracking is longitudinal, not target-based
    const passed = elapsed >= minDurationSeconds;

    const analysisResult = { avgPitch, minPitch, maxPitch, transcript: transcript.trim(), passed };
    setResult(analysisResult);

    if (user?.id) {
      try {
        await supabase.from('voice_practice_log').insert({
          user_id: user.id,
          duration_seconds: elapsed,
          avg_pitch_hz: Math.round(avgPitch),
        });

        const sampled = allPitches.filter((_, i) => i % 5 === 0);
        if (sampled.length > 0) {
          const rows = sampled.map(p => ({ user_id: user.id, pitch_hz: Math.round(p) }));
          await supabase.from('voice_pitch_samples').insert(rows);
        }

        await supabase.from('handler_notes').insert({
          user_id: user.id,
          note_type: 'voice_analysis',
          content: `[VOICE SAMPLE] Duration: ${elapsed}s, Avg pitch: ${avgPitch.toFixed(0)}Hz, Min: ${minPitch.toFixed(0)}Hz, Max: ${maxPitch.toFixed(0)}Hz, Samples: ${allPitches.length}. Transcript: "${transcript.trim().substring(0, 200)}"`,
          priority: 4,
        });
      } catch {}
    }

    setAnalyzing(false);
    onComplete({ avgPitch, transcript: transcript.trim(), passed });
  };

  useEffect(() => {
    return () => {
      recordingRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const livePitch = pitches.length > 0 ? pitches[pitches.length - 1] : null;
  const liveAvg = pitches.length > 0 ? pitches.reduce((s, p) => s + p, 0) / pitches.length : null;

  return (
    <div className="fixed inset-0 z-[92] bg-black/95 flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-4">
        <div className="text-center">
          <Mic className="w-10 h-10 mx-auto text-purple-400 mb-2" />
          <h2 className="text-xl font-bold text-white">Voice Practice</h2>
          <p className="text-sm text-gray-400">
            {targetPhrase ? `Say: "${targetPhrase}"` : `Speak in your normal voice for ${minDurationSeconds}+ seconds`}
          </p>
          <p className="text-xs text-gray-500 mt-1">Just be you — we're tracking the trend over time</p>
        </div>

        <div className="bg-gray-900 rounded-xl p-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Current: {livePitch ? `${livePitch.toFixed(0)}Hz` : '--'}</span>
            <span>Average: {liveAvg ? `${liveAvg.toFixed(0)}Hz` : '--'}</span>
            <span>{elapsed}s</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200 bg-purple-500"
              style={{ width: `${Math.min(100, ((liveAvg || 0) / 300) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>80Hz</span>
            <span>190Hz</span>
            <span>300Hz</span>
          </div>
        </div>

        {transcript && (
          <div className="bg-gray-900 rounded-lg p-3 text-sm text-gray-300 max-h-20 overflow-y-auto">
            {transcript}
          </div>
        )}

        {result && (
          <div className="rounded-xl p-4 bg-purple-900/30 border border-purple-500/30">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-5 h-5 text-purple-400" />
              <span className="font-bold text-purple-400">Recorded</span>
            </div>
            <p className="text-sm text-gray-300">
              Avg: {result.avgPitch.toFixed(0)}Hz | Range: {result.minPitch.toFixed(0)}–{result.maxPitch.toFixed(0)}Hz | {elapsed}s
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Sample saved. The Handler will track your trend over time.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {!recording && !result ? (
            <button onClick={startRecording} className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium flex items-center justify-center gap-2">
              <Mic className="w-5 h-5" /> Start recording
            </button>
          ) : recording ? (
            <button
              onClick={stopAndAnalyze}
              disabled={elapsed < minDurationSeconds || analyzing}
              className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-gray-800 text-white font-medium flex items-center justify-center gap-2"
            >
              {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <MicOff className="w-5 h-5" />}
              {elapsed < minDurationSeconds ? `${minDurationSeconds - elapsed}s more...` : 'Stop & analyze'}
            </button>
          ) : (
            <button onClick={() => { setResult(null); setPitches([]); setTranscript(''); setElapsed(0); }} className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-medium">
              Record again
            </button>
          )}
          {onCancel && !recording && (
            <button onClick={onCancel} className="px-4 py-3 rounded-xl bg-gray-800 text-gray-400 text-sm">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// YIN pitch detection — resists octave errors and subharmonics that plagued the
// previous peak-picking autocorrelation. Based on de Cheveigné & Kawahara 2002.
function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
  const MIN_HZ = 75;
  const MAX_HZ = 500;
  const YIN_THRESHOLD = 0.15;

  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return -1;

  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  const tauMax = Math.min(buffer.length >> 1, Math.floor(sampleRate / MIN_HZ));
  if (tauMax <= tauMin) return -1;

  const yinBuf = new Float32Array(tauMax + 1);
  yinBuf[0] = 1;
  let runningSum = 0;

  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < tauMax; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    runningSum += sum;
    yinBuf[tau] = runningSum > 0 ? (sum * tau) / runningSum : 1;
  }

  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (yinBuf[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= tauMax && yinBuf[tau + 1] < yinBuf[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) return -1;

  const x0 = tauEstimate > 0 ? yinBuf[tauEstimate - 1] : yinBuf[tauEstimate];
  const x1 = yinBuf[tauEstimate];
  const x2 = tauEstimate < tauMax ? yinBuf[tauEstimate + 1] : yinBuf[tauEstimate];
  const denom = x0 + x2 - 2 * x1;
  const refinedTau = Math.abs(denom) < 1e-10 ? tauEstimate : tauEstimate + (x0 - x2) / (2 * denom);

  return sampleRate / refinedTau;
}
