/**
 * useSpeechRecognition Hook
 * Web Speech API wrapper for voice recognition
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface SpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  confidence: number;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

function getErrorMessage(error: string): string {
  switch (error) {
    case 'not-allowed':
      return 'Microphone access denied. Please allow microphone access in your browser settings.';
    case 'no-speech':
      return 'No speech detected. Please try again.';
    case 'audio-capture':
      return 'No microphone found. Please connect a microphone.';
    case 'network':
      return 'Network error. Please check your internet connection.';
    case 'aborted':
      return 'Speech recognition was stopped.';
    case 'language-not-supported':
      return 'Language not supported.';
    case 'service-not-allowed':
      return 'Speech recognition service not available.';
    default:
      return `Speech recognition error: ${error}`;
  }
}

export function useSpeechRecognition(
  options: SpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    language = 'en-US',
    continuous = false,
    interimResults = true,
    maxAlternatives = 1,
    onResult,
    onError,
    onStart,
    onEnd,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Check browser support
  const SpeechRecognitionAPI =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  const isSupported = !!SpeechRecognitionAPI;

  // Initialize recognition
  useEffect(() => {
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = language;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = maxAlternatives;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimText = '';
      let maxConfidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alternative = result[0];

        if (result.isFinal) {
          finalTranscript += alternative.transcript;
          if (alternative.confidence > maxConfidence) {
            maxConfidence = alternative.confidence;
          }
        } else {
          interimText += alternative.transcript;
        }
      }

      if (finalTranscript) {
        setTranscript((prev) => prev + finalTranscript);
        setConfidence(maxConfidence);
        onResult?.(finalTranscript, true);
      }

      setInterimTranscript(interimText);
      if (interimText) {
        onResult?.(interimText, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorMessage = getErrorMessage(event.error);
      setError(errorMessage);
      setIsListening(false);
      onError?.(errorMessage);
    };

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      onStart?.();
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      onEnd?.();
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore abort errors
        }
      }
    };
  }, [language, continuous, interimResults, maxAlternatives, onResult, onError, onStart, onEnd]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;

    setTranscript('');
    setInterimTranscript('');
    setError(null);
    setConfidence(0);

    try {
      recognitionRef.current.start();
    } catch (err) {
      // Handle if already started
      console.warn('Speech recognition start error:', err);
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return;

    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.warn('Speech recognition stop error:', err);
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setConfidence(0);
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    confidence,
    startListening,
    stopListening,
    resetTranscript,
  };
}
