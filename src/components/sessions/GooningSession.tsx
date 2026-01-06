// GooningSession.tsx
// Immersive gooning/hypnotic session with visual synchronization and audio

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  Eye,
  Sparkles,
  Heart,
  Timer,
  Moon,
  Waves,
  Volume2,
  VolumeX,
  SkipForward,
  Music,
} from 'lucide-react';
import { useLovense } from '../../hooks/useLovense';
import { useHypnoPlayer, buildHypnoPlaylist, formatPlayTime } from '../../hooks/useHypnoPlayer';
import { useHandlerContextOptional } from '../../context/HandlerContext';
import { getContentLibrary } from '../../lib/content';
import type { RewardContent } from '../../types/rewards';

interface GooningSessionProps {
  onClose: () => void;
  onSessionComplete?: (stats: GooningStats) => void;
}

interface GooningStats {
  duration: number;
  peakIntensity: number;
  cyclesCompleted: number;
  denials: number;
  audioTracksPlayed: number;
}

type GoonPhase = 'intro' | 'building' | 'peak' | 'denial' | 'tease' | 'reward';

const AFFIRMATIONS = [
  "Let go completely...",
  "Deeper and deeper...",
  "Feel the pleasure building...",
  "You're doing so well...",
  "Just feel... don't think...",
  "Surrender to the sensation...",
  "Good... very good...",
  "Let it wash over you...",
  "You deserve this pleasure...",
  "Edge for me...",
  "Not yet... hold it...",
  "Feel it building...",
  "So close... so good...",
  "Stay on the edge...",
  "Perfect... just like that...",
];

export function GooningSession({ onClose, onSessionComplete }: GooningSessionProps) {
  const lovense = useLovense();
  const [hypnoState, hypnoActions] = useHypnoPlayer();
  const handlerContext = useHandlerContextOptional();
  const sessionIdRef = useRef<string>(`goon-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

  // Content loading state
  const [contentLoaded, setContentLoaded] = useState(false);
  const [contentLibrary, setContentLibrary] = useState<RewardContent[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);

  // Session state
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [phase, setPhase] = useState<GoonPhase>('intro');
  const [intensity, setIntensity] = useState(0);
  const [peakIntensity, setPeakIntensity] = useState(0);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);
  const [denials, setDenials] = useState(0);
  const [currentAffirmation, setCurrentAffirmation] = useState('');
  const [pulseScale, setPulseScale] = useState(1);
  const [hue, setHue] = useState(0);
  const [showAudioControls, setShowAudioControls] = useState(false);
  const [audioTracksPlayed, setAudioTracksPlayed] = useState(0);

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const cycleRef = useRef<NodeJS.Timeout | null>(null);
  const pulseRef = useRef<NodeJS.Timeout | null>(null);
  const affirmationRef = useRef<NodeJS.Timeout | null>(null);
  const lastAudioIdRef = useRef<string | null>(null);

  // Load content library on mount
  useEffect(() => {
    async function loadContent() {
      try {
        const content = await getContentLibrary();
        setContentLibrary(content);

        // Debug: log ALL content types with exact values
        const uniqueTypes = [...new Set(content.map(c => c.contentType))];
        const typeBreakdown = uniqueTypes.map(t => ({
          type: t,
          exactType: JSON.stringify(t), // Shows exact string including any whitespace
          count: content.filter(c => c.contentType === t).length
        }));
        console.log('[GooningSession] Content breakdown:', typeBreakdown);

        // Check for images with various filters
        const exactImageMatch = content.filter(c => c.contentType === 'image');
        const caseInsensitiveMatch = content.filter(c => c.contentType?.toLowerCase() === 'image');
        const includesMatch = content.filter(c => c.contentType?.includes('image'));
        console.log('[GooningSession] Image filtering tests:', {
          exactMatch: exactImageMatch.length,
          caseInsensitive: caseInsensitiveMatch.length,
          includesImage: includesMatch.length,
        });

        if (content.length > 0) {
          // Show first item of each type
          const samplesByType = uniqueTypes.map(t => {
            const item = content.find(c => c.contentType === t);
            return { type: t, title: item?.title, url: item?.contentUrl };
          });
          console.log('[GooningSession] Sample items by type:', samplesByType);
        }

        // Build and load playlist
        const playlist = buildHypnoPlaylist(content, {
          maxProgramming: 15,
          maxVisuals: 20,
        });

        console.log('[GooningSession] Playlist built:', {
          induction: playlist.induction?.title,
          deepener: playlist.deepener?.title,
          programming: playlist.programming.length,
          visuals: playlist.visuals.length,
          visualUrls: playlist.visuals.slice(0, 3).map(v => v.contentUrl),
        });

        hypnoActions.loadPlaylist(playlist);
        setContentLoaded(true);
      } catch (error) {
        console.error('Failed to load content library:', error);
        // Continue without audio content
        setContentLoaded(true);
      } finally {
        setLoadingContent(false);
      }
    }
    loadContent();
  }, []);

  // Track audio changes
  useEffect(() => {
    if (hypnoState.currentAudio && hypnoState.currentAudio.id !== lastAudioIdRef.current) {
      lastAudioIdRef.current = hypnoState.currentAudio.id;
      setAudioTracksPlayed(prev => prev + 1);
    }
  }, [hypnoState.currentAudio]);

  // Phase configuration
  const phaseConfig = {
    building: { duration: 30000, targetIntensity: 12 },
    peak: { duration: 15000, targetIntensity: 18 },
    denial: { duration: 5000, targetIntensity: 0 },
    tease: { duration: 20000, targetIntensity: 8 },
    reward: { duration: 10000, targetIntensity: 20 },
  };

  // Start visual pulse
  const startPulse = useCallback(() => {
    let growing = true;
    pulseRef.current = setInterval(() => {
      setPulseScale(prev => {
        if (prev >= 1.15) growing = false;
        if (prev <= 0.95) growing = true;
        return growing ? prev + 0.01 : prev - 0.01;
      });
      setHue(prev => (prev + 0.5) % 360);
    }, 50);
  }, []);

  // Update affirmation
  const updateAffirmation = useCallback(() => {
    const randomAffirmation = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
    setCurrentAffirmation(randomAffirmation);
  }, []);

  // Run phase cycle
  const runCycle = useCallback(async () => {
    // Building phase
    setPhase('building');
    await rampIntensity(0, phaseConfig.building.targetIntensity, phaseConfig.building.duration);

    if (!isActive) return;

    // Peak phase
    setPhase('peak');
    await holdIntensity(phaseConfig.peak.targetIntensity, phaseConfig.peak.duration);

    if (!isActive) return;

    // Denial phase
    setPhase('denial');
    setDenials(d => d + 1);
    await rampIntensity(phaseConfig.peak.targetIntensity, 0, 1000);
    await new Promise(resolve => setTimeout(resolve, phaseConfig.denial.duration));

    if (!isActive) return;

    // Tease phase
    setPhase('tease');
    await teasePattern(phaseConfig.tease.duration);

    if (!isActive) return;

    setCyclesCompleted(c => c + 1);

    // After 3 cycles, give a reward
    if ((cyclesCompleted + 1) % 3 === 0) {
      setPhase('reward');
      await rampIntensity(0, phaseConfig.reward.targetIntensity, 3000);
      await holdIntensity(phaseConfig.reward.targetIntensity, phaseConfig.reward.duration);
    }

    // Continue cycle
    if (isActive) {
      runCycle();
    }
  }, [isActive, cyclesCompleted]);

  // Ramp intensity gradually
  const rampIntensity = async (from: number, to: number, durationMs: number) => {
    const steps = 20;
    const stepDuration = durationMs / steps;
    const stepSize = (to - from) / steps;

    for (let i = 0; i <= steps; i++) {
      if (!isActive) break;
      const newIntensity = Math.round(from + stepSize * i);
      setIntensity(newIntensity);
      if (newIntensity > peakIntensity) setPeakIntensity(newIntensity);
      await lovense.setIntensity(newIntensity);
      await new Promise(resolve => setTimeout(resolve, stepDuration));
    }
  };

  // Hold intensity
  const holdIntensity = async (level: number, durationMs: number) => {
    setIntensity(level);
    await lovense.setIntensity(level);
    await new Promise(resolve => setTimeout(resolve, durationMs));
  };

  // Tease pattern - random pulses
  const teasePattern = async (durationMs: number) => {
    const endTime = Date.now() + durationMs;
    while (Date.now() < endTime && isActive) {
      const randomIntensity = Math.floor(Math.random() * 12) + 3;
      setIntensity(randomIntensity);
      await lovense.setIntensity(randomIntensity);
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1500));
      if (isActive) {
        setIntensity(0);
        await lovense.setIntensity(0);
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 2000));
      }
    }
  };

  // Start session
  const startSession = useCallback(() => {
    setIsActive(true);
    setIsPaused(false);
    setPhase('building');

    // Start timer
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);

    // Start pulse animation
    startPulse();

    // Start affirmation rotation
    updateAffirmation();
    affirmationRef.current = setInterval(updateAffirmation, 5000);

    // Start audio playback
    if (contentLoaded) {
      hypnoActions.play();
    }

    // Notify Handler AI of session start
    handlerContext?.notifySessionEvent({
      sessionId: sessionIdRef.current,
      event: 'session_start',
      data: {
        sessionType: 'gooning',
        contentLoaded,
        audioTracksAvailable: contentLibrary.filter(c => c.contentType === 'hypno').length,
      },
    });

    // Start cycle
    runCycle();
  }, [startPulse, updateAffirmation, runCycle, contentLoaded, hypnoActions, handlerContext, contentLibrary]);

  // Toggle pause
  const togglePause = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
      startPulse();
      hypnoActions.resume();
    } else {
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
      if (pulseRef.current) clearInterval(pulseRef.current);
      lovense.stop();
      hypnoActions.pause();
    }
  }, [isPaused, lovense, startPulse, hypnoActions]);

  // End session
  const endSession = useCallback(() => {
    setIsActive(false);

    if (timerRef.current) clearInterval(timerRef.current);
    if (cycleRef.current) clearInterval(cycleRef.current);
    if (pulseRef.current) clearInterval(pulseRef.current);
    if (affirmationRef.current) clearInterval(affirmationRef.current);

    lovense.stop();
    hypnoActions.stop();

    const stats: GooningStats = {
      duration,
      peakIntensity,
      cyclesCompleted,
      denials,
      audioTracksPlayed,
    };

    // Notify Handler AI of session end
    handlerContext?.notifySessionEvent({
      sessionId: sessionIdRef.current,
      event: 'session_end',
      data: {
        sessionType: 'gooning',
        totalDuration: duration,
        peakIntensity,
        cyclesCompleted,
        denials,
        audioTracksPlayed,
      },
    });

    onSessionComplete?.(stats);
  }, [duration, peakIntensity, cyclesCompleted, denials, audioTracksPlayed, lovense, hypnoActions, onSessionComplete, handlerContext]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (cycleRef.current) clearInterval(cycleRef.current);
      if (pulseRef.current) clearInterval(pulseRef.current);
      if (affirmationRef.current) clearInterval(affirmationRef.current);
      hypnoActions.stop();
    };
  }, [hypnoActions]);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Phase colors
  const getPhaseColor = () => {
    switch (phase) {
      case 'building': return `hsl(${hue}, 70%, 50%)`;
      case 'peak': return `hsl(${340 + hue * 0.1}, 80%, 55%)`;
      case 'denial': return `hsl(${240}, 60%, 40%)`;
      case 'tease': return `hsl(${280 + hue * 0.2}, 70%, 50%)`;
      case 'reward': return `hsl(${60}, 90%, 60%)`;
      default: return `hsl(${hue}, 70%, 50%)`;
    }
  };

  // Loading screen
  if (loadingContent) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
        <div className="animate-pulse text-white text-center">
          <Sparkles className="w-12 h-12 mx-auto mb-4 animate-spin" />
          <p className="text-lg">Loading content...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{
        background: `radial-gradient(circle at center, ${getPhaseColor()}, black)`,
        transition: 'background 1s ease',
      }}
    >
      {/* Visual GIF Background */}
      {isActive && hypnoState.currentVisual?.contentUrl && (
        <div
          className="absolute inset-0 z-0 opacity-40 transition-opacity duration-1000"
          style={{
            backgroundImage: `url(${hypnoState.currentVisual.contentUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(2px)',
            transform: `scale(${pulseScale * 1.1})`,
          }}
        />
      )}

      {/* Pulsing overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-1"
        style={{
          background: `radial-gradient(circle at center, transparent, rgba(0,0,0,0.7))`,
          transform: `scale(${pulseScale})`,
          transition: 'transform 0.1s ease',
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4 text-white/90">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-4">
          {/* Audio indicator */}
          {isActive && hypnoState.isPlaying && (
            <button
              onClick={() => setShowAudioControls(!showAudioControls)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Music className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5" />
            <span className="font-mono text-lg">{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Audio Controls Panel */}
      {showAudioControls && isActive && (
        <div className="relative z-20 mx-4 mb-2 p-4 bg-black/60 backdrop-blur-lg rounded-xl">
          {/* Current track info */}
          <div className="mb-3">
            <p className="text-white/60 text-xs uppercase tracking-wider mb-1">
              Now Playing - {hypnoState.currentPhase}
            </p>
            <p className="text-white font-medium truncate">
              {hypnoState.currentAudio?.title || 'No audio'}
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/80 transition-all duration-300"
                style={{ width: `${hypnoState.progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-white/50 mt-1">
              <span>{formatPlayTime(hypnoState.currentTime)}</span>
              <span>{formatPlayTime(hypnoState.duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            {/* Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => hypnoActions.setVolume(hypnoState.volume === 0 ? 0.8 : 0)}
                className="p-1.5 rounded-full hover:bg-white/10"
              >
                {hypnoState.volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-white/70" />
                ) : (
                  <Volume2 className="w-4 h-4 text-white/70" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={hypnoState.volume}
                onChange={(e) => hypnoActions.setVolume(parseFloat(e.target.value))}
                className="w-20 h-1 bg-white/20 rounded-full appearance-none cursor-pointer"
              />
            </div>

            {/* Skip to next visual */}
            <button
              onClick={() => hypnoActions.nextVisual()}
              className="p-2 rounded-full hover:bg-white/10 text-white/70"
              title="Next visual"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4">
        {!isActive ? (
          // Start screen
          <div className="text-center text-white max-w-md">
            <Moon className="w-16 h-16 mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">Goon Session</h2>
            <p className="text-lg opacity-90 mb-8">
              An immersive, hypnotic experience. Let go and surrender to the sensations.
              The intensity will build, peak, and deny in cycles.
            </p>

            <div className="flex items-center justify-center gap-4 mb-8 text-sm opacity-75">
              <div className="flex items-center gap-2">
                <Waves className="w-4 h-4" />
                <span>Cycles</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>Denial Training</span>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                <span>Rewards</span>
              </div>
            </div>

            {/* Content status */}
            {contentLoaded && contentLibrary.length > 0 && (
              <div className="mb-6 text-sm opacity-60">
                <Music className="w-4 h-4 inline mr-2" />
                {contentLibrary.filter(c => c.contentType === 'hypno').length} audio tracks ready
              </div>
            )}

            <button
              onClick={startSession}
              className="px-8 py-4 bg-white text-gray-900 rounded-full font-bold text-lg hover:bg-white/90 transition-colors flex items-center gap-2 mx-auto"
            >
              <Eye className="w-6 h-6" />
              Enter Session
            </button>
          </div>
        ) : (
          // Active session
          <>
            {/* Central focus */}
            <div
              className="w-48 h-48 rounded-full flex items-center justify-center mb-8"
              style={{
                background: `radial-gradient(circle, ${getPhaseColor()}, transparent)`,
                transform: `scale(${pulseScale})`,
                boxShadow: `0 0 60px ${getPhaseColor()}`,
              }}
            >
              <div className="text-center text-white">
                <div className="text-5xl font-bold mb-1">{intensity}</div>
                <div className="text-sm opacity-70 uppercase tracking-wider">intensity</div>
              </div>
            </div>

            {/* Affirmation */}
            <div
              className="text-2xl text-white/90 text-center font-light italic mb-8 transition-opacity duration-1000"
              style={{ opacity: currentAffirmation ? 1 : 0 }}
            >
              {currentAffirmation}
            </div>

            {/* Phase indicator */}
            <div className="flex items-center gap-2 text-white/70 text-sm uppercase tracking-wider">
              {phase === 'building' && <Waves className="w-4 h-4" />}
              {phase === 'peak' && <Sparkles className="w-4 h-4 animate-pulse" />}
              {phase === 'denial' && <Moon className="w-4 h-4" />}
              {phase === 'tease' && <Heart className="w-4 h-4" />}
              {phase === 'reward' && <Sparkles className="w-4 h-4 text-yellow-400" />}
              <span>{phase}</span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6 mt-8 text-white/60 text-sm">
              <div>Cycles: {cyclesCompleted}</div>
              <div>Denials: {denials}</div>
              <div>Peak: {peakIntensity}</div>
              {audioTracksPlayed > 0 && <div>Tracks: {audioTracksPlayed}</div>}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4 mt-8">
              <button
                onClick={togglePause}
                className="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                {isPaused ? (
                  <Play className="w-6 h-6 text-white" />
                ) : (
                  <Pause className="w-6 h-6 text-white" />
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {isActive && (
        <div className="relative z-10 p-4">
          <button
            onClick={endSession}
            className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-xl text-white font-medium transition-colors"
          >
            End Session
          </button>
        </div>
      )}
    </div>
  );
}
