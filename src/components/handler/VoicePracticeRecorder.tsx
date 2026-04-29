import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { estimatePitchHz } from '../../lib/voice-pitch';

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
  const [micError, setMicError] = useState<string | null>(null);
  const [signal, setSignal] = useState<number>(0);

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
    setMicError(null);
    setSignal(0);

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('This browser does not expose microphone access. Try Chrome or Safari, or open the app in a real browser tab (not in-app webview).');
      setRecording(false);
      recordingRef.current = false;
      return;
    }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      setMicError('Microphone requires HTTPS. Open this app over https:// and reload.');
      setRecording(false);
      recordingRef.current = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Modern browsers create AudioContext suspended; explicitly resume.
      if (audioContext.state === 'suspended') {
        try { await audioContext.resume(); } catch { /* ignore */ }
      }
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);

      const measurePitch = () => {
        if (!recordingRef.current) return;
        analyser.getFloatTimeDomainData(buffer);
        // RMS gives us a live signal-strength readout for the UI.
        let sumSq = 0;
        for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
        const rms = Math.sqrt(sumSq / buffer.length);
        setSignal(rms);
        const pitch = estimatePitchHz(buffer, audioContext.sampleRate);
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
      const e = err as { name?: string; message?: string };
      console.error('[VoicePracticeRecorder] mic init failed:', e);
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        setMicError('Microphone permission denied. Click the lock icon in your browser address bar → allow microphone → reload.');
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        setMicError('No microphone detected. Plug one in or check OS audio settings.');
      } else if (e?.name === 'NotReadableError') {
        setMicError('Microphone is being used by another app. Close it and try again.');
      } else {
        setMicError(`Mic init failed: ${e?.message || e?.name || 'unknown error'}`);
      }
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

        {micError && (
          <div className="rounded-lg p-3 bg-red-950/40 border border-red-500/40 text-sm text-red-200">
            <div className="font-semibold mb-1">Microphone unavailable</div>
            <div className="text-xs leading-relaxed">{micError}</div>
          </div>
        )}

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
          {recording && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Mic signal</span>
                <span className={signal > 0.005 ? 'text-green-400' : 'text-red-400'}>
                  {signal > 0.005 ? 'detecting voice' : 'silent — speak louder or check mic'}
                </span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${signal > 0.005 ? 'bg-green-500' : 'bg-gray-700'}`}
                  style={{ width: `${Math.min(100, signal * 2000)}%` }}
                />
              </div>
            </div>
          )}
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

