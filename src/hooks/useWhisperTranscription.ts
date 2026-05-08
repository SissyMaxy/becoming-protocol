/**
 * useWhisperTranscription
 *
 * Records audio via MediaRecorder and transcribes with OpenAI Whisper.
 * Drop-in replacement for useSpeechRecognition when accuracy matters.
 *
 * Web Speech API is unreliable for soft/trans voices and produced the
 * "test testing 1 2 3" partial-result spam. Whisper is ~10x more accurate
 * and returns a single clean transcript per utterance.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseWhisperTranscriptionReturn {
  isSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
  resetTranscript: () => void;
}

interface WhisperOptions {
  endpoint?: string;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  maxDurationMs?: number;
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

export function useWhisperTranscription(options: WhisperOptions = {}): UseWhisperTranscriptionReturn {
  const { endpoint = '/api/voice/transcribe', onResult, onError, maxDurationMs = 60_000 } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveStopRef = useRef<((text: string) => void) | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    !!navigator?.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const cleanup = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startRecording = useCallback(async () => {
    if (!isSupported || isRecording) return;
    setError(null);
    setTranscript('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
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
        cleanup();
        setIsRecording(false);

        if (blob.size < 1000) {
          setError('Too short — hold the mic longer.');
          onError?.('Too short');
          resolveStopRef.current?.('');
          resolveStopRef.current = null;
          return;
        }

        setIsTranscribing(true);
        try {
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'audio/webm' },
            body: blob,
          });
          if (!resp.ok) {
            const detail = await resp.text();
            throw new Error(`Whisper failed: ${resp.status} ${detail}`);
          }
          const data = (await resp.json()) as { text?: string };
          const text = (data.text || '').trim();
          setTranscript(text);
          onResult?.(text);
          resolveStopRef.current?.(text);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Transcription failed';
          setError(msg);
          onError?.(msg);
          resolveStopRef.current?.('');
        } finally {
          setIsTranscribing(false);
          resolveStopRef.current = null;
        }
      };

      recorder.start();
      setIsRecording(true);

      maxTimerRef.current = setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          recorderRef.current.stop();
        }
      }, maxDurationMs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Microphone access denied';
      setError(msg);
      onError?.(msg);
      cleanup();
      setIsRecording(false);
    }
  }, [isSupported, isRecording, endpoint, onResult, onError, maxDurationMs, cleanup]);

  const stopRecording = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      if (!recorderRef.current || recorderRef.current.state !== 'recording') {
        resolve('');
        return;
      }
      resolveStopRef.current = resolve;
      recorderRef.current.stop();
    });
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isSupported,
    isRecording,
    isTranscribing,
    transcript,
    error,
    startRecording,
    stopRecording,
    resetTranscript,
  };
}
