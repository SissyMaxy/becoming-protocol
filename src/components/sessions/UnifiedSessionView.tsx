/**
 * Unified Session View
 * Full-screen video with flashing text overlay - used by all session types
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, Volume2, VolumeX, SkipForward, MessageSquare, MessageSquareOff } from 'lucide-react';
import { useLovense } from '../../hooks/useLovense';

export type SessionType = 'edge' | 'goon' | 'conditioning' | 'freestyle' | 'denial';

interface UnifiedSessionProps {
  sessionType: SessionType;
  onClose: () => void;
  onComplete?: (stats: SessionStats) => void;
}

export interface SessionStats {
  duration: number;
}

// Affirmations by session type
const AFFIRMATIONS: Record<SessionType, string[]> = {
  edge: [
    "Feel it building...",
    "Right on the edge...",
    "Hold it there...",
    "So close...",
    "Don't let go...",
    "Stay with it...",
    "Breathe...",
    "Good...",
  ],
  goon: [
    "Let go...",
    "Deeper...",
    "Surrender...",
    "Feel everything...",
    "Don't think...",
    "Just feel...",
    "Good girl...",
    "Empty your mind...",
  ],
  conditioning: [
    "You are feminine...",
    "This is who you are...",
    "Feel it in your body...",
    "Let it become you...",
    "Accept yourself...",
    "You deserve this...",
    "Beautiful...",
    "Perfect...",
  ],
  freestyle: [
    "Enjoy...",
    "Take your time...",
    "This is yours...",
    "Feel good...",
    "You earned this...",
    "Let go...",
  ],
  denial: [
    "Not yet...",
    "Hold it...",
    "You can wait...",
    "Control...",
    "Stay there...",
    "Don't you dare...",
    "Keep edging...",
    "Almost...",
  ],
};

export function UnifiedSessionView({
  sessionType,
  onClose,
  onComplete,
}: UnifiedSessionProps) {
  // Lovense integration
  const lovense = useLovense();

  // Content state - loads from public/videos/
  const [videos, setVideos] = useState<string[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Session state
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  // Text overlay state
  const [currentText, setCurrentText] = useState('');
  const [textVisible, setTextVisible] = useState(false);
  const [textEnabled, setTextEnabled] = useState(true);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const textTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load videos from public/videos/sessions/{sessionType}/ folder
  // Videos are configured in public/videos/manifest.json
  useEffect(() => {
    async function loadVideos() {
      setIsLoading(true);
      try {
        // Try to load from manifest
        const response = await fetch('/videos/manifest.json');
        if (response.ok) {
          const manifest = await response.json();
          const sessionVideos = manifest.sessions?.[sessionType] || [];

          if (sessionVideos.length > 0) {
            // Build full paths from manifest
            const videoPaths = sessionVideos.map(
              (filename: string) => `/videos/sessions/${sessionType}/${filename}`
            );
            // Shuffle and set
            const shuffled = [...videoPaths].sort(() => Math.random() - 0.5);
            setVideos(shuffled);
          } else {
            // Fallback to legacy video if no session-specific videos
            setVideos(['/videos/68c137bce1ba3.mp4']);
          }
        } else {
          // Manifest not found, use fallback
          setVideos(['/videos/68c137bce1ba3.mp4']);
        }
      } catch (err) {
        console.warn('Failed to load video manifest, using fallback:', err);
        setVideos(['/videos/68c137bce1ba3.mp4']);
      } finally {
        setIsLoading(false);
      }
    }

    loadVideos();
  }, [sessionType]);

  // Text flash cycle
  const cycleText = useCallback(() => {
    const affirmations = AFFIRMATIONS[sessionType];
    const randomText = affirmations[Math.floor(Math.random() * affirmations.length)];

    setCurrentText(randomText);
    setTextVisible(true);

    // Hide after 2 seconds
    setTimeout(() => {
      setTextVisible(false);
    }, 2000);
  }, [sessionType]);

  // Start text cycling
  useEffect(() => {
    if (!isActive || isPaused) {
      if (textTimerRef.current) clearInterval(textTimerRef.current);
      return;
    }

    // Initial text
    cycleText();

    // Cycle every 4-6 seconds
    textTimerRef.current = setInterval(() => {
      cycleText();
    }, 4000 + Math.random() * 2000);

    return () => {
      if (textTimerRef.current) clearInterval(textTimerRef.current);
    };
  }, [isActive, isPaused, cycleText]);

  // Duration timer
  useEffect(() => {
    if (!isActive || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, isPaused]);

  // Handle video end - play next
  const handleVideoEnd = () => {
    if (videos.length > 1) {
      setCurrentVideoIndex(prev => (prev + 1) % videos.length);
    } else if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  };

  // Skip to next video
  const skipVideo = () => {
    setCurrentVideoIndex(prev => (prev + 1) % Math.max(videos.length, 1));
  };

  const currentVideo = videos[currentVideoIndex];

  // Start session
  const startSession = () => {
    setIsActive(true);
    if (videoRef.current) {
      videoRef.current.play();
    }

    // Start appropriate Lovense mode based on session type
    if (lovense.status === 'connected' || lovense.cloudConnected) {
      switch (sessionType) {
        case 'denial':
          lovense.startDenialTraining();
          break;
        case 'edge':
          lovense.startEdgeTraining();
          break;
        case 'goon':
        case 'freestyle':
          lovense.startTeaseMode();
          break;
        // conditioning doesn't use Lovense
      }
    }
  };

  // Toggle pause
  const togglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      if (videoRef.current) videoRef.current.play();
    } else {
      setIsPaused(true);
      if (videoRef.current) videoRef.current.pause();
    }
  };

  // End session
  const endSession = () => {
    setIsActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (textTimerRef.current) clearInterval(textTimerRef.current);

    // Stop Lovense
    switch (sessionType) {
      case 'denial':
        lovense.stopDenialTraining();
        break;
      case 'edge':
        lovense.stopEdgeTraining();
        break;
      case 'goon':
      case 'freestyle':
        lovense.stopTeaseMode();
        break;
    }
    lovense.stop();

    onComplete?.({
      duration,
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      lovense.stop();
    };
  }, []);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Close confirmation overlay */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 p-6 rounded-2xl max-w-sm mx-4 text-center">
            <p className="text-white font-semibold text-lg mb-2">End session?</p>
            <p className="text-gray-400 text-sm mb-6">
              Your progress ({formatTime(duration)}) will be lost.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="px-5 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
              >
                Keep Going
              </button>
              <button
                onClick={() => { setShowCloseConfirm(false); onClose(); }}
                className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Background */}
      {currentVideo ? (
        <video
          ref={videoRef}
          src={currentVideo}
          className="absolute inset-0 w-full h-full object-cover"
          loop={videos.length <= 1}
          muted={isMuted}
          playsInline
          onEnded={handleVideoEnd}
        />
      ) : (
        // Fallback gradient if no videos
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-black to-pink-900" />
      )}

      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Header - z-40 to stay above start screen overlay (z-30) */}
      <div className="absolute top-0 left-0 right-0 z-40 p-4 flex items-center justify-between">
        <button
          onClick={() => isActive ? setShowCloseConfirm(true) : onClose()}
          aria-label="Close session"
          className="p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
        >
          <X className="w-6 h-6 text-white" />
        </button>

        <div className="flex items-center gap-3">
          {/* Timer */}
          <div className="px-3 py-1.5 rounded-full bg-black/50 text-white font-mono">
            {formatTime(duration)}
          </div>

          {/* Text toggle */}
          <button
            onClick={() => setTextEnabled(!textEnabled)}
            className="p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
          >
            {textEnabled ? (
              <MessageSquare className="w-5 h-5 text-white" />
            ) : (
              <MessageSquareOff className="w-5 h-5 text-white/50" />
            )}
          </button>

          {/* Mute toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-white/50" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>

          {/* Skip video */}
          {videos.length > 1 && (
            <button
              onClick={skipVideo}
              className="p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
            >
              <SkipForward className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Center Text Overlay */}
      {textEnabled && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div
            className={`text-center transition-all duration-500 ${
              textVisible
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-95'
            }`}
          >
            <p className="text-4xl md:text-6xl font-light text-white tracking-wide drop-shadow-2xl">
              {currentText}
            </p>
          </div>
        </div>
      )}

      {/* Start Screen (before session begins) */}
      {!isActive && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white mb-6 capitalize">
              {sessionType} Session
            </h2>
            <button
              onClick={startSession}
              className="px-8 py-4 bg-white text-black rounded-full font-bold text-lg hover:bg-white/90 transition-colors flex items-center gap-2 mx-auto"
            >
              <Play className="w-6 h-6" />
              Start
            </button>
          </div>
        </div>
      )}

      {/* Bottom Controls */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-6">
          <div className="flex items-center justify-center gap-4">
            {/* Pause/Play */}
            <button
              onClick={togglePause}
              className="p-4 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              {isPaused ? (
                <Play className="w-8 h-8 text-white" />
              ) : (
                <Pause className="w-8 h-8 text-white" />
              )}
            </button>

            {/* End Session */}
            <button
              onClick={endSession}
              className="px-8 py-4 bg-white/20 hover:bg-white/30 rounded-full text-white font-medium transition-colors"
            >
              End Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
