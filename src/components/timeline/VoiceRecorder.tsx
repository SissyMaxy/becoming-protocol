/**
 * Voice Recorder Component
 *
 * Record voice samples for tracking vocal feminization progress.
 * Uses MediaRecorder API for audio capture.
 */

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Check, Star, X } from 'lucide-react';
import { formatDuration } from '../../types/timeline';

interface VoiceRecorderProps {
  phrase: string;
  onSave: (audioBlob: Blob, rating?: number, notes?: string) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

type RecordingState = 'idle' | 'recording' | 'recorded' | 'playing';

export function VoiceRecorder({ phrase, onSave, onCancel, saving }: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      stopMediaStream();
    };
  }, [audioUrl]);

  const stopMediaStream = () => {
    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState('recorded');
        stopMediaStream();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setState('recording');

      // Start duration timer
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Could not access microphone. Please allow microphone access.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const playRecording = () => {
    if (!audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setState('recorded');
    }

    audioRef.current.play();
    setState('playing');
  };

  const pausePlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setState('recorded');
  };

  const resetRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setRating(null);
    setNotes('');
    setState('idle');
  };

  const handleSave = async () => {
    if (!audioBlob) return;
    await onSave(audioBlob, rating ?? undefined, notes || undefined);
  };

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-protocol-text">Voice Recording</h3>
        <button
          onClick={onCancel}
          className="p-2 rounded-lg hover:bg-protocol-surface text-protocol-text-muted"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Phrase to say */}
      <div className="p-4 rounded-xl bg-protocol-surface/50 mb-6">
        <p className="text-xs text-protocol-text-muted uppercase tracking-wider mb-2">
          Say this phrase:
        </p>
        <p className="text-lg text-protocol-text font-medium italic">
          "{phrase}"
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Recording visualizer */}
      <div className="flex flex-col items-center py-8">
        {/* Duration display */}
        <div className="text-4xl font-mono text-protocol-text mb-6">
          {formatDuration(duration)}
        </div>

        {/* Main action button */}
        <div className="relative">
          {state === 'idle' && (
            <button
              onClick={startRecording}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-pink-600 text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
            >
              <Mic className="w-8 h-8" />
            </button>
          )}

          {state === 'recording' && (
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg animate-pulse"
            >
              <Square className="w-8 h-8" />
            </button>
          )}

          {(state === 'recorded' || state === 'playing') && (
            <div className="flex items-center gap-4">
              <button
                onClick={resetRecording}
                className="w-12 h-12 rounded-full bg-protocol-surface text-protocol-text-muted flex items-center justify-center hover:bg-protocol-border transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                onClick={state === 'playing' ? pausePlayback : playRecording}
                className="w-16 h-16 rounded-full bg-protocol-accent text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
              >
                {state === 'playing' ? (
                  <Pause className="w-7 h-7" />
                ) : (
                  <Play className="w-7 h-7 ml-1" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* State hint */}
        <p className="text-sm text-protocol-text-muted mt-4">
          {state === 'idle' && 'Tap to start recording'}
          {state === 'recording' && 'Recording... Tap to stop'}
          {state === 'recorded' && 'Tap to listen'}
          {state === 'playing' && 'Playing...'}
        </p>
      </div>

      {/* Rating and notes (after recording) */}
      {(state === 'recorded' || state === 'playing') && (
        <div className="space-y-4 pt-4 border-t border-protocol-border">
          {/* Rating */}
          <div>
            <p className="text-sm text-protocol-text-muted mb-2">
              How feminine did that sound?
            </p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(value => (
                <button
                  key={value}
                  onClick={() => setRating(value)}
                  className={`p-2 rounded-lg transition-all ${
                    rating === value ? 'scale-110' : 'hover:scale-105'
                  }`}
                >
                  <Star
                    className="w-8 h-8"
                    fill={rating && value <= rating ? '#f472b6' : 'transparent'}
                    color={rating && value <= rating ? '#f472b6' : '#666'}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm text-protocol-text-muted block mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did it feel? What to work on?"
              rows={2}
              className="w-full p-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted resize-none"
            />
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? (
              'Saving...'
            ) : (
              <>
                <Check className="w-5 h-5" />
                Save Recording
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
