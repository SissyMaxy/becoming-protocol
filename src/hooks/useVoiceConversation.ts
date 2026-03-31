/**
 * useVoiceConversation — P12.3
 *
 * Web Speech API for speech-to-text input. Maxy speaks, the system transcribes,
 * sends to Handler, Handler responds in Serafina's voice via useHandlerVoice TTS.
 *
 * Simultaneously captures pitch data from the microphone for voice training tracking.
 * Records pitch samples to voice_pitch_samples with context='conversation'.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { recordPitchSample } from '../lib/voice/pitch-tracker';

// Pitch detection constants (same as useAmbientVoiceMonitor)
const MIN_VOICE_HZ = 80;
const MAX_VOICE_HZ = 400;

interface UseVoiceConversationReturn {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  isSupported: boolean;
  currentPitch: number | null;
}

/**
 * Autocorrelation-based pitch detection.
 * Returns fundamental frequency in Hz, or null if no voice detected.
 */
function detectPitch(audioBuffer: Float32Array, sampleRate: number): number | null {
  const SIZE = audioBuffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);

  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += audioBuffer[i] * audioBuffer[i];
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null;

  let bestOffset = -1;
  let bestCorrelation = 0;
  let foundGoodCorrelation = false;

  for (let offset = 50; offset < MAX_SAMPLES; offset++) {
    let correlation = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs(audioBuffer[i] - audioBuffer[i + offset]);
    }
    correlation = 1 - correlation / MAX_SAMPLES;

    if (correlation > 0.9 && correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
      foundGoodCorrelation = true;
    }
  }

  if (!foundGoodCorrelation || bestOffset === -1) return null;

  const frequency = sampleRate / bestOffset;
  return frequency >= MIN_VOICE_HZ && frequency <= MAX_VOICE_HZ ? frequency : null;
}

// Extend Window for Speech Recognition API
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

export function useVoiceConversation(): UseVoiceConversationReturn {
  const { user } = useAuth();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [currentPitch, setCurrentPitch] = useState<number | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldRestartRef = useRef(false);

  // Check browser support
  const isSupported = typeof window !== 'undefined' && (
    'SpeechRecognition' in window ||
    'webkitSpeechRecognition' in window
  );

  // Pitch sampling — runs while mic is active
  const startPitchTracking = useCallback(async () => {
    if (!user?.id) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);

      // Sample pitch every 2 seconds
      pitchIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(dataArray);
        const pitch = detectPitch(dataArray, audioCtx.sampleRate);

        if (pitch !== null) {
          setCurrentPitch(Math.round(pitch * 10) / 10);
          // Record to DB — fire and forget
          if (user?.id) {
            recordPitchSample(user.id, pitch, 'conversation').catch(() => {});
          }
        }
      }, 2000);
    } catch (err) {
      console.warn('[VoiceConversation] Pitch tracking failed:', err);
    }
  }, [user?.id]);

  const stopPitchTracking = useCallback(() => {
    if (pitchIntervalRef.current) {
      clearInterval(pitchIntervalRef.current);
      pitchIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    setCurrentPitch(null);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor() as SpeechRecognitionInstance;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      shouldRestartRef.current = true;
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      // Show interim results for real-time feedback, final when confirmed
      setTranscript(prev => {
        if (finalTranscript) {
          return (prev + ' ' + finalTranscript).trim();
        }
        // For interim, show the stable transcript + current interim
        return prev ? prev + ' ' + interimTranscript : interimTranscript;
      });
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn('[VoiceConversation] Recognition error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-available') {
        shouldRestartRef.current = false;
        setIsListening(false);
      }
      // For transient errors like 'network', onend will fire and we restart
    };

    recognition.onend = () => {
      // Auto-restart if we haven't explicitly stopped
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
          shouldRestartRef.current = false;
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      // Already started or unavailable
    }

    // Start pitch tracking in parallel
    startPitchTracking();
  }, [isSupported, startPitchTracking]);

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Already stopped
      }
      recognitionRef.current = null;
    }

    setIsListening(false);
    stopPitchTracking();
  }, [stopPitchTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
      }
      stopPitchTracking();
    };
  }, [stopPitchTracking]);

  // Clear transcript when not listening (ready for next round)
  const clearTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  // Expose clearTranscript via transcript reset when starting
  useEffect(() => {
    if (isListening) {
      clearTranscript();
    }
  }, [isListening, clearTranscript]);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    isSupported,
    currentPitch,
  };
}
