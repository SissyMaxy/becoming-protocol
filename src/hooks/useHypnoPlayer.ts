// useHypnoPlayer.ts
// Hook for managing hypno audio/visual playback during sessions

import { useState, useEffect, useRef, useCallback } from 'react';
import type { RewardContent } from '../types/rewards';

export type HypnoPhase = 'idle' | 'induction' | 'deepener' | 'programming' | 'awakening';

interface HypnoPlaylist {
  induction?: RewardContent;
  deepener?: RewardContent;
  programming: RewardContent[];
  visuals: RewardContent[];
}

interface HypnoPlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentPhase: HypnoPhase;
  currentAudio: RewardContent | null;
  currentVisual: RewardContent | null;
  progress: number; // 0-100
  duration: number; // seconds
  currentTime: number; // seconds
  volume: number; // 0-1
}

interface HypnoPlayerActions {
  loadPlaylist: (playlist: HypnoPlaylist) => void;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipToPhase: (phase: HypnoPhase) => void;
  setVolume: (volume: number) => void;
  nextVisual: () => void;
}

export function useHypnoPlayer(): [HypnoPlayerState, HypnoPlayerActions] {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<HypnoPhase>('idle');
  const [currentAudio, setCurrentAudio] = useState<RewardContent | null>(null);
  const [currentVisual, setCurrentVisual] = useState<RewardContent | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(0.8);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlistRef = useRef<HypnoPlaylist | null>(null);
  const programmingIndexRef = useRef(0);
  const visualIndexRef = useRef(0);
  const visualIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = volume;

    const audio = audioRef.current;

    // Event listeners
    const handleTimeUpdate = () => {
      if (audio.duration) {
        setCurrentTime(audio.currentTime);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      handleAudioEnded();
    };

    const handleError = (e: Event) => {
      console.error('Audio error:', e);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Handle audio ended - move to next track/phase
  const handleAudioEnded = useCallback(() => {
    const playlist = playlistRef.current;
    if (!playlist) return;

    switch (currentPhase) {
      case 'induction':
        // Move to deepener if available, otherwise programming
        if (playlist.deepener) {
          playAudio(playlist.deepener, 'deepener');
        } else if (playlist.programming.length > 0) {
          programmingIndexRef.current = 0;
          playAudio(playlist.programming[0], 'programming');
        } else {
          stop();
        }
        break;

      case 'deepener':
        // Move to programming
        if (playlist.programming.length > 0) {
          programmingIndexRef.current = 0;
          playAudio(playlist.programming[0], 'programming');
        } else {
          stop();
        }
        break;

      case 'programming':
        // Play next programming track or loop
        programmingIndexRef.current++;
        if (programmingIndexRef.current < playlist.programming.length) {
          playAudio(playlist.programming[programmingIndexRef.current], 'programming');
        } else {
          // Loop programming playlist
          programmingIndexRef.current = 0;
          playAudio(playlist.programming[0], 'programming');
        }
        break;

      default:
        stop();
    }
  }, [currentPhase]);

  // Play a specific audio file
  const playAudio = useCallback((content: RewardContent, phase: HypnoPhase) => {
    const audio = audioRef.current;
    if (!audio || !content.contentUrl) return;

    setCurrentAudio(content);
    setCurrentPhase(phase);
    setProgress(0);
    setCurrentTime(0);

    audio.src = content.contentUrl;
    audio.load();
    audio.play().catch(err => {
      console.error('Failed to play audio:', err);
    });

    setIsPlaying(true);
    setIsPaused(false);
  }, []);

  // Rotate visuals
  const startVisualRotation = useCallback(() => {
    const playlist = playlistRef.current;
    console.log('[HypnoPlayer] Starting visual rotation, visuals:', playlist?.visuals.length);
    if (!playlist || playlist.visuals.length === 0) {
      console.log('[HypnoPlayer] No visuals to rotate');
      return;
    }

    // Set initial visual
    visualIndexRef.current = 0;
    const firstVisual = playlist.visuals[0];
    console.log('[HypnoPlayer] Setting initial visual:', firstVisual.title, firstVisual.contentUrl);
    setCurrentVisual(firstVisual);

    // Rotate every 8-15 seconds (randomized)
    const rotateVisual = () => {
      if (!playlistRef.current) return;

      visualIndexRef.current = (visualIndexRef.current + 1) % playlistRef.current.visuals.length;
      setCurrentVisual(playlistRef.current.visuals[visualIndexRef.current]);

      // Schedule next rotation with random interval
      const nextInterval = 8000 + Math.random() * 7000;
      visualIntervalRef.current = setTimeout(rotateVisual, nextInterval);
    };

    // Start rotation
    const initialInterval = 8000 + Math.random() * 7000;
    visualIntervalRef.current = setTimeout(rotateVisual, initialInterval);
  }, []);

  const stopVisualRotation = useCallback(() => {
    if (visualIntervalRef.current) {
      clearTimeout(visualIntervalRef.current);
      visualIntervalRef.current = null;
    }
  }, []);

  // Actions
  const loadPlaylist = useCallback((playlist: HypnoPlaylist) => {
    playlistRef.current = playlist;
    programmingIndexRef.current = 0;
    visualIndexRef.current = 0;
    setCurrentPhase('idle');
    setCurrentAudio(null);
    setCurrentVisual(null);
    setProgress(0);
    setDuration(0);
    setCurrentTime(0);
  }, []);

  const play = useCallback(() => {
    const playlist = playlistRef.current;
    if (!playlist) return;

    // Start with induction if available
    if (playlist.induction) {
      playAudio(playlist.induction, 'induction');
    } else if (playlist.deepener) {
      playAudio(playlist.deepener, 'deepener');
    } else if (playlist.programming.length > 0) {
      programmingIndexRef.current = 0;
      playAudio(playlist.programming[0], 'programming');
    }

    // Start visual rotation
    startVisualRotation();
  }, [playAudio, startVisualRotation]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio && isPlaying) {
      audio.pause();
      setIsPaused(true);
      stopVisualRotation();
    }
  }, [isPlaying, stopVisualRotation]);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (audio && isPaused) {
      audio.play().catch(err => console.error('Failed to resume:', err));
      setIsPaused(false);
      startVisualRotation();
    }
  }, [isPaused, startVisualRotation]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    }

    stopVisualRotation();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentPhase('idle');
    setCurrentAudio(null);
    setCurrentVisual(null);
    setProgress(0);
    setDuration(0);
    setCurrentTime(0);
  }, [stopVisualRotation]);

  const skipToPhase = useCallback((phase: HypnoPhase) => {
    const playlist = playlistRef.current;
    if (!playlist) return;

    switch (phase) {
      case 'induction':
        if (playlist.induction) {
          playAudio(playlist.induction, 'induction');
        }
        break;
      case 'deepener':
        if (playlist.deepener) {
          playAudio(playlist.deepener, 'deepener');
        }
        break;
      case 'programming':
        if (playlist.programming.length > 0) {
          programmingIndexRef.current = 0;
          playAudio(playlist.programming[0], 'programming');
        }
        break;
      case 'idle':
        stop();
        break;
    }
  }, [playAudio, stop]);

  const setVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  }, []);

  const nextVisual = useCallback(() => {
    const playlist = playlistRef.current;
    if (!playlist || playlist.visuals.length === 0) return;

    visualIndexRef.current = (visualIndexRef.current + 1) % playlist.visuals.length;
    setCurrentVisual(playlist.visuals[visualIndexRef.current]);
  }, []);

  // State object
  const state: HypnoPlayerState = {
    isPlaying,
    isPaused,
    currentPhase,
    currentAudio,
    currentVisual,
    progress,
    duration,
    currentTime,
    volume,
  };

  // Actions object
  const actions: HypnoPlayerActions = {
    loadPlaylist,
    play,
    pause,
    resume,
    stop,
    skipToPhase,
    setVolume,
    nextVisual,
  };

  return [state, actions];
}

// Helper to build a playlist from content library
export function buildHypnoPlaylist(
  allContent: RewardContent[],
  options?: {
    inductionId?: string;
    deepenerId?: string;
    programmingIds?: string[];
    visualIds?: string[];
    maxProgramming?: number;
    maxVisuals?: number;
    intensityLevel?: number;
  }
): {
  induction?: RewardContent;
  deepener?: RewardContent;
  programming: RewardContent[];
  visuals: RewardContent[];
} {
  const {
    inductionId,
    deepenerId,
    programmingIds,
    visualIds,
    maxProgramming = 10,
    maxVisuals = 15,
    intensityLevel,
  } = options || {};

  // Filter by intensity if specified
  const filterByIntensity = (content: RewardContent) => {
    if (!intensityLevel) return true;
    return !content.intensityLevel || content.intensityLevel <= intensityLevel;
  };

  // Get induction
  let induction: RewardContent | undefined;
  if (inductionId) {
    induction = allContent.find(c => c.id === inductionId);
  } else {
    // Pick random induction
    const inductions = allContent.filter(
      c => c.tags.includes('induction') && c.contentType === 'hypno' && filterByIntensity(c)
    );
    if (inductions.length > 0) {
      induction = inductions[Math.floor(Math.random() * inductions.length)];
    }
  }

  // Get deepener
  let deepener: RewardContent | undefined;
  if (deepenerId) {
    deepener = allContent.find(c => c.id === deepenerId);
  } else {
    // Pick random deepener
    const deepeners = allContent.filter(
      c => c.tags.includes('deepener') && c.contentType === 'hypno' && filterByIntensity(c)
    );
    if (deepeners.length > 0) {
      deepener = deepeners[Math.floor(Math.random() * deepeners.length)];
    }
  }

  // Get programming tracks
  let programming: RewardContent[] = [];
  if (programmingIds && programmingIds.length > 0) {
    programming = programmingIds
      .map(id => allContent.find(c => c.id === id))
      .filter((c): c is RewardContent => c !== undefined);
  } else {
    // Pick random programming tracks
    const programmingContent = allContent.filter(
      c => c.tags.includes('programming') && c.contentType === 'hypno' && filterByIntensity(c)
    );
    // Shuffle and take max
    programming = programmingContent
      .sort(() => Math.random() - 0.5)
      .slice(0, maxProgramming);
  }

  // Get visuals
  let visuals: RewardContent[] = [];
  if (visualIds && visualIds.length > 0) {
    visuals = visualIds
      .map(id => allContent.find(c => c.id === id))
      .filter((c): c is RewardContent => c !== undefined);
  } else {
    // Pick random visuals
    const visualContent = allContent.filter(
      c => c.contentType === 'image' && filterByIntensity(c)
    );
    // Shuffle and take max
    visuals = visualContent
      .sort(() => Math.random() - 0.5)
      .slice(0, maxVisuals);
  }

  return {
    induction,
    deepener,
    programming,
    visuals,
  };
}

// Format time helper
export function formatPlayTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
