/**
 * useSleepContent — Core orchestration hook for the sleep content player.
 *
 * Manages the full player lifecycle: setup → delay → playing → fading → complete.
 * Coordinates Speech Synthesis (TTS), Wake Lock, Lovense subliminal pulse,
 * progressive screen dimming, and session logging.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCorruption } from './useCorruption';
import { useLovense } from './useLovense';
import type {
  SleepAudioMode,
  SleepContentItem,
  SleepContentConfig,
  SleepPlayerPhase,
  SleepPlayerState,
} from '../types/sleep-content';
import {
  getOrCreateSleepConfig,
  updateSleepConfig as updateConfigDB,
  getSleepContent,
  addSleepContent as addContentDB,
  deleteSleepContent as deleteContentDB,
  toggleSleepContent as toggleContentDB,
  ensureSeedContent,
  generatePlaylist,
  recommendMode,
  createSleepSession,
  completeSleepSession,
} from '../lib/sleep-content';
import {
  isSpeechAvailable,
  getVoices,
  selectFeminineVoice,
  speakAffirmation,
  stopSpeech,
} from '../lib/speech-synthesis';
import { requestWakeLock, releaseWakeLock } from '../lib/wake-lock';
import { logCorruptionEvent } from '../lib/corruption';

// ============================================
// CONSTANTS
// ============================================

const FADE_IN_MS = 1500;
const FADE_OUT_MS = 1500;
const FADE_DURATION_SECONDS = 120; // 2-minute volume fade before timer end
const TICK_INTERVAL_MS = 1000;

const INITIAL_STATE: SleepPlayerState = {
  phase: 'setup',
  mode: 'text_only',
  timerTotalSeconds: 1800,
  timerRemainingSeconds: 1800,
  delayRemainingSeconds: 0,
  currentAffirmation: null,
  affirmationVisible: false,
  affirmationsDisplayed: 0,
  affirmationsSpoken: 0,
  screenOpacity: 1,
  volume: 1,
  lovenseActive: false,
};

// ============================================
// HOOK
// ============================================

export interface UseSleepContentReturn {
  state: SleepPlayerState;
  config: SleepContentConfig | null;
  playlist: SleepContentItem[];
  recommendedMode: SleepAudioMode;
  isLoading: boolean;

  // Playback
  launch: (mode: SleepAudioMode, timerMinutes: number, delayMinutes: number) => Promise<void>;
  stop: () => Promise<void>;

  // Config
  updateConfig: (fields: Partial<SleepContentConfig>) => Promise<void>;

  // Content management
  content: SleepContentItem[];
  addContent: (item: { category: SleepContentItem['category']; affirmationText: string; corruptionLevelMin?: number; requiresPrivacy?: boolean }) => Promise<void>;
  removeContent: (id: string) => Promise<void>;
  toggleContent: (id: string, enabled: boolean) => Promise<void>;
  refreshContent: () => Promise<void>;
}

export function useSleepContent(): UseSleepContentReturn {
  const { user } = useAuth();
  const { snapshot } = useCorruption();
  const lovense = useLovense();

  const [state, setState] = useState<SleepPlayerState>(INITIAL_STATE);
  const [config, setConfig] = useState<SleepContentConfig | null>(null);
  const [content, setContent] = useState<SleepContentItem[]>([]);
  const [playlist, setPlaylist] = useState<SleepContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Refs for managing timers and state across intervals
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const affirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const playlistIndexRef = useRef(0);
  const stateRef = useRef(state);
  const configRef = useRef(config);
  const playlistRef = useRef(playlist);

  // Keep refs in sync
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);

  const corruptionLevel = snapshot?.levels?.identity_language ?? 0;

  // Derive recommended mode (ginaHome not stored in hook - will be passed context)
  // For now, default to false; the player component knows the actual ginaHome state
  const recommended = recommendMode(false, corruptionLevel);

  // ============================================
  // LOAD CONFIG + CONTENT ON MOUNT
  // ============================================

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    (async () => {
      try {
        await ensureSeedContent(user.id);
        const [cfg, items] = await Promise.all([
          getOrCreateSleepConfig(user.id),
          getSleepContent(user.id),
        ]);
        if (cancelled) return;
        setConfig(cfg);
        setContent(items);
      } catch (err) {
        console.error('[SleepContent] Failed to load:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  // Load speech synthesis voice
  useEffect(() => {
    if (!isSpeechAvailable()) return;
    getVoices().then(voices => {
      voiceRef.current = selectFeminineVoice(voices, config?.voiceName);
    });
  }, [config?.voiceName]);

  // ============================================
  // CLEANUP ON UNMOUNT
  // ============================================

  useEffect(() => {
    return () => {
      clearAllTimers();
      stopSpeech();
      releaseWakeLock(wakeLockRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // TIMER HELPERS
  // ============================================

  function clearAllTimers() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (affirmationTimerRef.current) {
      clearTimeout(affirmationTimerRef.current);
      affirmationTimerRef.current = null;
    }
  }

  // ============================================
  // SCREEN DIMMING
  // ============================================

  function calculateScreenOpacity(elapsed: number, total: number): number {
    if (total <= 0) return 1;
    const progress = elapsed / total;
    // Quadratic ease: dims slowly at first, faster toward end
    const dimProgress = progress * progress;
    return Math.max(0.05, 1 - dimProgress * 0.95);
  }

  // ============================================
  // LOVENSE SUBLIMINAL PULSE
  // ============================================

  const pulseLovense = useCallback(async (maxIntensity: number) => {
    if (!lovense.activeToy || lovense.activeMode) return;
    try {
      await lovense.setIntensity(Math.min(maxIntensity, 3));
      setTimeout(async () => {
        try {
          await lovense.setIntensity(0);
        } catch { /* ignore */ }
      }, 2000);
    } catch { /* ignore */ }
  }, [lovense]);

  // ============================================
  // AFFIRMATION CYCLE
  // ============================================

  const startAffirmationCycle = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg) return;

    const holdMs = cfg.affirmationHoldSeconds * 1000;
    const gapMs = cfg.affirmationGapSeconds * 1000;
    const cycleMs = FADE_IN_MS + holdMs + FADE_OUT_MS + gapMs;

    function showNext() {
      const currentState = stateRef.current;
      const pl = playlistRef.current;

      if (currentState.phase !== 'playing' && currentState.phase !== 'fading') return;
      if (pl.length === 0) return;

      const index = playlistIndexRef.current % pl.length;
      const item = pl[index];
      playlistIndexRef.current++;

      // Fade in
      setState(prev => ({
        ...prev,
        currentAffirmation: item.affirmationText,
        affirmationVisible: true,
        affirmationsDisplayed: prev.affirmationsDisplayed + 1,
      }));

      // Speak if in audio mode
      const mode = currentState.mode;
      if ((mode === 'single_earbud' || mode === 'full_audio') && isSpeechAvailable()) {
        const cfg2 = configRef.current;
        speakAffirmation(item.affirmationText, {
          pitch: cfg2?.voicePitch ?? 1.1,
          rate: cfg2?.voiceRate ?? 0.75,
          volume: currentState.volume,
          voiceName: cfg2?.voiceName,
        }, voiceRef.current).then(() => {
          setState(prev => ({
            ...prev,
            affirmationsSpoken: prev.affirmationsSpoken + 1,
          }));
        }).catch(() => { /* speech cancelled or failed */ });
      }

      // Lovense pulse on full_audio
      if (mode === 'full_audio' && cfg?.lovenseSubliminalEnabled) {
        pulseLovense(cfg.lovenseMaxIntensity);
      }

      // Fade out after hold
      affirmationTimerRef.current = setTimeout(() => {
        setState(prev => ({ ...prev, affirmationVisible: false }));

        // Schedule next after gap + fade out
        affirmationTimerRef.current = setTimeout(() => {
          showNext();
        }, FADE_OUT_MS + gapMs);
      }, FADE_IN_MS + holdMs);
    }

    // Start first affirmation after a brief initial pause
    affirmationTimerRef.current = setTimeout(showNext, 1000);

    // Track cycle duration for cleanup reference (not used directly but helpful for debugging)
    return cycleMs;
  }, [pulseLovense]);

  // ============================================
  // MAIN TICK (1-second interval)
  // ============================================

  const startMainTick = useCallback((totalSeconds: number) => {
    const startTime = Date.now();

    tickRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);
      const currentState = stateRef.current;

      // Calculate dimming
      const screenOpacity = configRef.current?.screenDimEnabled
        ? calculateScreenOpacity(elapsed, totalSeconds)
        : 1;

      // Calculate volume fade
      let volume = 1;
      if (remaining <= FADE_DURATION_SECONDS && totalSeconds > FADE_DURATION_SECONDS) {
        volume = remaining / FADE_DURATION_SECONDS;
      }

      // Determine phase
      let phase: SleepPlayerPhase = currentState.phase;
      if (remaining <= FADE_DURATION_SECONDS && phase === 'playing') {
        phase = 'fading';
      }

      setState(prev => ({
        ...prev,
        timerRemainingSeconds: remaining,
        screenOpacity,
        volume,
        phase,
      }));

      // Timer expired
      if (remaining <= 0) {
        finishSession('timer');
      }
    }, TICK_INTERVAL_MS);
  }, []);  // finishSession referenced below via closure

  // ============================================
  // LAUNCH
  // ============================================

  const launch = useCallback(async (
    mode: SleepAudioMode,
    timerMinutes: number,
    delayMinutes: number,
  ) => {
    if (!user?.id) return;

    const userId = user.id;
    const timerSeconds = timerMinutes * 60;
    const delaySeconds = delayMinutes * 60;

    // Generate playlist
    const pl = await generatePlaylist(userId, corruptionLevel, false);
    setPlaylist(pl);
    playlistRef.current = pl;
    playlistIndexRef.current = 0;

    // Create session
    const categories = [...new Set(pl.map(i => i.category))];
    const rec = recommendMode(false, corruptionLevel);
    const lovenseActive = mode === 'full_audio' && (configRef.current?.lovenseSubliminalEnabled ?? false) && !!lovense.activeToy;

    const sessionId = await createSleepSession(userId, {
      mode,
      modeRecommended: rec,
      timerMinutes,
      delayMinutes,
      categories,
      lovenseActive,
      corruptionLevel,
    });
    sessionIdRef.current = sessionId;

    // Wake lock
    wakeLockRef.current = await requestWakeLock();

    if (delaySeconds > 0) {
      // Start with delay phase
      setState({
        ...INITIAL_STATE,
        phase: 'delay',
        mode,
        timerTotalSeconds: timerSeconds,
        timerRemainingSeconds: timerSeconds,
        delayRemainingSeconds: delaySeconds,
        lovenseActive,
      });

      // Delay countdown
      const delayStart = Date.now();
      tickRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - delayStart) / 1000);
        const remaining = Math.max(0, delaySeconds - elapsed);

        setState(prev => ({ ...prev, delayRemainingSeconds: remaining }));

        if (remaining <= 0) {
          // Delay complete, transition to playing
          clearAllTimers();
          setState(prev => ({ ...prev, phase: 'playing', delayRemainingSeconds: 0 }));
          startMainTick(timerSeconds);
          startAffirmationCycle();
        }
      }, TICK_INTERVAL_MS);
    } else {
      // No delay, start playing immediately
      setState({
        ...INITIAL_STATE,
        phase: 'playing',
        mode,
        timerTotalSeconds: timerSeconds,
        timerRemainingSeconds: timerSeconds,
        lovenseActive,
      });
      startMainTick(timerSeconds);
      startAffirmationCycle();
    }
  }, [user?.id, corruptionLevel, lovense.activeToy, startMainTick, startAffirmationCycle]);

  // ============================================
  // FINISH SESSION
  // ============================================

  const finishSession = useCallback(async (reason: 'timer' | 'manual') => {
    clearAllTimers();
    stopSpeech();

    // Stop Lovense
    if (stateRef.current.lovenseActive) {
      try { await lovense.stop(); } catch { /* ignore */ }
    }

    // Release wake lock
    await releaseWakeLock(wakeLockRef.current);
    wakeLockRef.current = null;

    const currentState = stateRef.current;

    // Log session completion
    if (sessionIdRef.current) {
      try {
        await completeSleepSession(sessionIdRef.current, {
          endReason: reason,
          affirmationsDisplayed: currentState.affirmationsDisplayed,
          affirmationsSpoken: currentState.affirmationsSpoken,
          completedNaturally: reason === 'timer',
        });
      } catch (err) {
        console.error('[SleepContent] Failed to complete session:', err);
      }
      sessionIdRef.current = null;
    }

    // Log corruption milestone (fire-and-forget)
    if (user?.id && currentState.affirmationsDisplayed > 0) {
      logCorruptionEvent(user.id, 'content', 'milestone', corruptionLevel, {
        sleep_session: true,
        mode: currentState.mode,
        affirmations_displayed: currentState.affirmationsDisplayed,
        affirmations_spoken: currentState.affirmationsSpoken,
        completed_naturally: reason === 'timer',
        duration_minutes: Math.round(currentState.timerTotalSeconds / 60),
      }).catch(() => {});
    }

    setState(prev => ({
      ...prev,
      phase: 'complete',
      affirmationVisible: false,
      currentAffirmation: null,
      volume: 0,
    }));
  }, [user?.id, corruptionLevel, lovense]);

  // Wire finishSession into the tick interval (closure issue workaround)
  // The tick interval calls finishSession('timer') when remaining <= 0
  // Since startMainTick creates the interval, we need finishSession in scope
  // This is handled by stateRef pattern - tick checks remaining from state

  // Override the tick's timer-expire logic: check in a separate effect
  useEffect(() => {
    if (state.phase === 'playing' || state.phase === 'fading') {
      if (state.timerRemainingSeconds <= 0) {
        finishSession('timer');
      }
    }
  }, [state.timerRemainingSeconds, state.phase, finishSession]);

  // ============================================
  // STOP (manual)
  // ============================================

  const stop = useCallback(async () => {
    await finishSession('manual');
  }, [finishSession]);

  // ============================================
  // CONFIG MANAGEMENT
  // ============================================

  const updateConfig = useCallback(async (fields: Partial<SleepContentConfig>) => {
    if (!user?.id) return;
    await updateConfigDB(user.id, fields);
    setConfig(prev => prev ? { ...prev, ...fields } : prev);
  }, [user?.id]);

  // ============================================
  // CONTENT MANAGEMENT
  // ============================================

  const refreshContent = useCallback(async () => {
    if (!user?.id) return;
    const items = await getSleepContent(user.id);
    setContent(items);
  }, [user?.id]);

  const addContent = useCallback(async (item: {
    category: SleepContentItem['category'];
    affirmationText: string;
    corruptionLevelMin?: number;
    requiresPrivacy?: boolean;
  }) => {
    if (!user?.id) return;
    await addContentDB(user.id, item);
    await refreshContent();
  }, [user?.id, refreshContent]);

  const removeContent = useCallback(async (id: string) => {
    await deleteContentDB(id);
    setContent(prev => prev.filter(c => c.id !== id));
  }, []);

  const toggleContent = useCallback(async (id: string, enabled: boolean) => {
    await toggleContentDB(id, enabled);
    setContent(prev => prev.map(c => c.id === id ? { ...c, enabled } : c));
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    state,
    config,
    playlist,
    recommendedMode: recommended,
    isLoading,
    launch,
    stop,
    updateConfig,
    content,
    addContent,
    removeContent,
    toggleContent,
    refreshContent,
  };
}
