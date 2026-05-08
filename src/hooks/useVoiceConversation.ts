/**
 * useVoiceConversation — P12.3
 *
 * Speech-to-text via OpenAI Whisper (replacing the Web Speech API, which
 * produced the "test testing 1 2 3" partial-result spam and was wildly
 * inaccurate for soft/trans voices). Records with MediaRecorder, POSTs
 * the audio blob to /api/voice/transcribe on stop, returns a clean transcript.
 *
 * Pitch is sampled in parallel via YIN detection on the same mic stream
 * and written to voice_pitch_samples with context='conversation'.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { recordPitchSample } from '../lib/voice/pitch-tracker';

const MIN_VOICE_HZ = 75;
const MAX_VOICE_HZ = 500;
const YIN_THRESHOLD = 0.15;

interface UseVoiceConversationReturn {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  isSupported: boolean;
  currentPitch: number | null;
  isTranscribing: boolean;
}

// YIN pitch detection — resists octave errors of plain autocorrelation.
function detectPitchYin(buffer: Float32Array, sampleRate: number): number | null {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_VOICE_HZ));
  const tauMax = Math.min(buffer.length >> 1, Math.floor(sampleRate / MIN_VOICE_HZ));
  if (tauMax <= tauMin) return null;

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
  if (tauEstimate === -1) return null;

  const x0 = tauEstimate > 0 ? yinBuf[tauEstimate - 1] : yinBuf[tauEstimate];
  const x1 = yinBuf[tauEstimate];
  const x2 = tauEstimate < tauMax ? yinBuf[tauEstimate + 1] : yinBuf[tauEstimate];
  const denom = x0 + x2 - 2 * x1;
  const refinedTau = Math.abs(denom) < 1e-10 ? tauEstimate : tauEstimate + (x0 - x2) / (2 * denom);

  const hz = sampleRate / refinedTau;
  return hz >= MIN_VOICE_HZ && hz <= MAX_VOICE_HZ ? hz : null;
}

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export function useVoiceConversation(): UseVoiceConversationReturn {
  const { user } = useAuth();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [currentPitch, setCurrentPitch] = useState<number | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');

  const isSupported =
    typeof window !== 'undefined' &&
    !!navigator?.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const stopPitchTracking = useCallback(() => {
    if (pitchIntervalRef.current) {
      clearInterval(pitchIntervalRef.current);
      pitchIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setCurrentPitch(null);
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startListening = useCallback(async () => {
    if (!isSupported || isListening) return;
    setTranscript('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pitch tracking branch
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      analyserRef.current = analyser;

      const pitchBuf = new Float32Array(analyser.fftSize);
      pitchIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(pitchBuf);
        const hz = detectPitchYin(pitchBuf, audioCtx.sampleRate);
        if (hz !== null) {
          setCurrentPitch(Math.round(hz * 10) / 10);
          if (user?.id) recordPitchSample(user.id, hz, 'conversation').catch(() => {});
        }
      }, 2000);

      // Recording branch — Whisper
      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' });
        stopPitchTracking();
        cleanupStream();
        setIsListening(false);

        if (blob.size < 1000) {
          setIsTranscribing(false);
          return;
        }

        setIsTranscribing(true);
        try {
          const resp = await fetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'audio/webm' },
            body: blob,
          });
          if (resp.ok) {
            const data = (await resp.json()) as { text?: string };
            setTranscript((data.text || '').trim());
          } else {
            console.warn('[VoiceConversation] Whisper failed:', resp.status);
          }
        } catch (err) {
          console.warn('[VoiceConversation] transcription error:', err);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsListening(true);
    } catch (err) {
      console.warn('[VoiceConversation] startListening failed:', err);
      stopPitchTracking();
      cleanupStream();
      setIsListening(false);
    }
  }, [isSupported, isListening, user?.id, stopPitchTracking, cleanupStream]);

  const stopListening = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    } else {
      stopPitchTracking();
      cleanupStream();
      setIsListening(false);
    }
  }, [stopPitchTracking, cleanupStream]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        try { recorderRef.current.stop(); } catch { /* noop */ }
      }
      stopPitchTracking();
      cleanupStream();
    };
  }, [stopPitchTracking, cleanupStream]);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    isSupported,
    currentPitch,
    isTranscribing,
  };
}
