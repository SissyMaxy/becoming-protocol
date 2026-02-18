// Primer Video Player
// Plays short hypno/identity videos before tasks

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipForward, Sparkles } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface PrimerVideoPlayerProps {
  videoPath: string;
  title: string;
  duration: number;
  primerType: 'identity_erasure' | 'trigger_plant' | 'arousal' | 'affirmation' | 'hypno' | 'mantra';
  affirmations?: string[];
  triggers?: string[];
  onComplete: () => void;
  onSkip?: () => void;
  allowSkip?: boolean;
  skipAfterSeconds?: number;
}

export function PrimerVideoPlayer({
  videoPath,
  title,
  duration,
  primerType,
  affirmations = [],
  triggers = [],
  onComplete,
  onSkip,
  allowSkip = true,
  skipAfterSeconds = 5,
}: PrimerVideoPlayerProps) {
  const { isBambiMode } = useBambiMode();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [canSkip, setCanSkip] = useState(!allowSkip);
  const [showAffirmation, setShowAffirmation] = useState(false);
  const [currentAffirmation, setCurrentAffirmation] = useState(0);

  // Auto-play on mount
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, []);

  // Enable skip after delay
  useEffect(() => {
    if (allowSkip && skipAfterSeconds > 0) {
      const timer = setTimeout(() => setCanSkip(true), skipAfterSeconds * 1000);
      return () => clearTimeout(timer);
    }
  }, [allowSkip, skipAfterSeconds]);

  // Cycle affirmations
  useEffect(() => {
    if (affirmations.length > 0 && isPlaying) {
      const interval = setInterval(() => {
        setShowAffirmation(true);
        setCurrentAffirmation(prev => (prev + 1) % affirmations.length);
        setTimeout(() => setShowAffirmation(false), 2500);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [affirmations, isPlaying]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration || duration;
      setCurrentTime(current);
      setProgress((current / total) * 100);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    onComplete();
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSkip = () => {
    if (canSkip && onSkip) {
      onSkip();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const typeColors: Record<string, string> = {
    identity_erasure: '#dc2626',
    trigger_plant: '#8b5cf6',
    arousal: '#ec4899',
    affirmation: '#10b981',
    hypno: '#6366f1',
    mantra: '#f59e0b',
  };

  const typeLabels: Record<string, string> = {
    identity_erasure: 'Identity Reset',
    trigger_plant: 'Trigger Planting',
    arousal: 'Arousal Priming',
    affirmation: 'Affirmation',
    hypno: 'Hypno',
    mantra: 'Mantra',
  };

  return (
    <div className={`relative rounded-2xl overflow-hidden ${
      isBambiMode ? 'bg-pink-950' : 'bg-black'
    }`}>
      {/* Video */}
      <div className="relative aspect-video">
        <video
          ref={videoRef}
          src={videoPath}
          className="w-full h-full object-cover"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          playsInline
        />

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

        {/* Type badge */}
        <div className="absolute top-3 left-3">
          <div
            className="px-3 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1.5"
            style={{ backgroundColor: typeColors[primerType] }}
          >
            <Sparkles className="w-3 h-3" />
            {typeLabels[primerType]}
          </div>
        </div>

        {/* Affirmation overlay */}
        {showAffirmation && affirmations.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`text-center px-8 transition-all duration-500 ${
              showAffirmation ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}>
              <p className={`text-2xl md:text-3xl font-light italic ${
                isBambiMode ? 'text-pink-200' : 'text-white'
              }`} style={{ textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}>
                "{affirmations[currentAffirmation]}"
              </p>
            </div>
          </div>
        )}

        {/* Triggers indicator */}
        {triggers.length > 0 && (
          <div className="absolute top-3 right-3">
            <div className={`px-2 py-1 rounded text-[10px] ${
              isBambiMode ? 'bg-pink-500/30 text-pink-200' : 'bg-purple-500/30 text-purple-200'
            }`}>
              {triggers.length} trigger{triggers.length > 1 ? 's' : ''} active
            </div>
          </div>
        )}

        {/* Title */}
        <div className="absolute bottom-16 left-4 right-4">
          <h3 className="text-white font-medium text-lg">{title}</h3>
        </div>

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          {/* Progress bar */}
          <div className="w-full h-1 bg-white/20 rounded-full mb-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                isBambiMode ? 'bg-pink-500' : 'bg-white'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className={`p-2 rounded-full transition-all ${
                  isBambiMode
                    ? 'bg-pink-500/30 hover:bg-pink-500/50 text-pink-200'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </button>

              {/* Mute */}
              <button
                onClick={toggleMute}
                className={`p-2 rounded-full transition-all ${
                  isBambiMode
                    ? 'bg-pink-500/30 hover:bg-pink-500/50 text-pink-200'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>

              {/* Time */}
              <span className="text-white/70 text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Skip button */}
            {allowSkip && (
              <button
                onClick={handleSkip}
                disabled={!canSkip}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  canSkip
                    ? isBambiMode
                      ? 'bg-pink-500/30 hover:bg-pink-500/50 text-pink-200'
                      : 'bg-white/20 hover:bg-white/30 text-white'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                <SkipForward className="w-4 h-4" />
                {canSkip ? 'Skip' : `Wait ${skipAfterSeconds}s`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
