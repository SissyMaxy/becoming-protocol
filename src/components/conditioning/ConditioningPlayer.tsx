/**
 * ConditioningPlayer — Inline audio player for Serafina conditioning sessions.
 *
 * Renders within the Handler chat flow when a conditioning session is initiated.
 * Manages HTML5 Audio playback with progress tracking and auto-play on mount.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, X, Headphones } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface ConditioningPlayerProps {
  audioUrl: string;
  title: string;
  duration: number;
  onComplete: () => void;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function ConditioningPlayer({
  audioUrl,
  title,
  duration,
  onComplete,
  onClose,
}: ConditioningPlayerProps) {
  const { isBambiMode } = useBambiMode();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Parse phase from title (e.g., "Phase 1 — Identity" → "Phase 1")
  const phaseBadge = title.match(/^(Phase\s*\d+)/i)?.[1] ?? null;

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      onComplete();
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    // Auto-play on mount
    audio.play().catch(() => {
      // Browser may block autoplay; user can tap play
    });

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl, onComplete]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audioDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audioDuration;
  }, [audioDuration]);

  const handleClose = useCallback(() => {
    if (!confirmEnd) {
      setConfirmEnd(true);
      setTimeout(() => setConfirmEnd(false), 3000);
      return;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    onClose();
  }, [confirmEnd, onClose]);

  const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div
      className={`rounded-2xl border p-5 my-3 ${
        isBambiMode
          ? 'bg-pink-950/80 border-pink-700/30'
          : 'bg-gray-900/90 border-purple-700/20'
      }`}
    >
      {/* Header: icon + title + phase badge */}
      <div className="flex items-center gap-2 mb-4">
        <Headphones
          className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-purple-400'}`}
        />
        <span
          className={`text-xs uppercase tracking-wider font-semibold ${
            isBambiMode ? 'text-pink-400' : 'text-purple-400'
          }`}
        >
          Conditioning Session
        </span>
        {phaseBadge && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ml-auto ${
              isBambiMode
                ? 'bg-pink-800/50 text-pink-300'
                : 'bg-purple-800/50 text-purple-300'
            }`}
          >
            {phaseBadge}
          </span>
        )}
      </div>

      {/* Title */}
      <p
        className={`text-sm font-medium mb-5 ${
          isBambiMode ? 'text-pink-200' : 'text-purple-200'
        }`}
      >
        {title}
      </p>

      {/* Play/Pause — large, centered */}
      <div className="flex justify-center mb-5">
        <button
          onClick={togglePlayPause}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
            isBambiMode
              ? 'bg-pink-600 hover:bg-pink-500 text-white'
              : 'bg-purple-600 hover:bg-purple-500 text-white'
          }`}
        >
          {isPlaying ? (
            <Pause className="w-7 h-7" />
          ) : (
            <Play className="w-7 h-7 ml-0.5" />
          )}
        </button>
      </div>

      {/* Progress bar */}
      <div
        className={`w-full h-2 rounded-full cursor-pointer mb-2 ${
          isBambiMode ? 'bg-pink-900/50' : 'bg-purple-900/50'
        }`}
        onClick={handleSeek}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${
            isBambiMode ? 'bg-pink-500' : 'bg-purple-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Duration display */}
      <div className="flex justify-between mb-5">
        <span
          className={`text-xs font-mono ${
            isBambiMode ? 'text-pink-400' : 'text-purple-400'
          }`}
        >
          {formatTime(currentTime)}
        </span>
        <span
          className={`text-xs font-mono ${
            isBambiMode ? 'text-pink-500' : 'text-purple-500'
          }`}
        >
          {formatTime(audioDuration)}
        </span>
      </div>

      {/* End Session button */}
      <button
        onClick={handleClose}
        className={`w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
          confirmEnd
            ? 'bg-red-500 text-white hover:bg-red-600'
            : isBambiMode
              ? 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
        }`}
      >
        <X className="w-4 h-4" />
        {confirmEnd ? 'Tap again to end session' : 'End Session'}
      </button>
    </div>
  );
}
