/**
 * GoonSessionView — Extended arousal (goon) session UI
 *
 * Conditioning-engine managed session with three escalating phases:
 *   Build    — warm up, light content
 *   Escalate — increasing intensity and fantasy level
 *   Peak     — maximum intensity, identity dissolution
 *
 * Uses startGoonSession/endGoonSession for lifecycle,
 * useSessionBiometrics for Whoop polling,
 * session-device for Lovense phase transitions.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Loader2,
  Play,
  Square,
  Flame,
  Activity,
  Heart,
  Vibrate,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronUp,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { useSessionBiometrics } from '../../hooks/useSessionBiometrics';
import {
  startGoonSession,
  endGoonSession,
  type GoonPhase,
  type GoonPlaylistItem,
  type GoonSessionMetrics,
} from '../../lib/conditioning/goon-session';
import {
  transitionSessionPhase,
  deactivateSessionDevice,
} from '../../lib/conditioning/session-device';
import { supabase } from '../../lib/supabase';

// ============================================
// TYPES
// ============================================

type ViewPhase = 'idle' | 'starting' | 'live' | 'summary';

interface GoonSessionViewProps {
  onBack: () => void;
  prescribedDuration?: number;
}

interface UserState {
  denialDay: number;
  arousalLevel: number;
}

const DURATION_OPTIONS = [30, 45, 60] as const;

const PHASE_COLORS: Record<GoonPhase, { dark: string; light: string; badge: string }> = {
  build: {
    dark: 'text-emerald-400',
    light: 'text-emerald-600',
    badge: 'bg-emerald-900/30 text-emerald-400',
  },
  escalate: {
    dark: 'text-amber-400',
    light: 'text-amber-600',
    badge: 'bg-amber-900/30 text-amber-400',
  },
  peak: {
    dark: 'text-red-400',
    light: 'text-red-600',
    badge: 'bg-red-900/30 text-red-400',
  },
};

const PHASE_LABELS: Record<GoonPhase, string> = {
  build: 'Build',
  escalate: 'Escalate',
  peak: 'Peak',
};

// ============================================
// COMPONENT
// ============================================

export function GoonSessionView({ onBack, prescribedDuration }: GoonSessionViewProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  // Biometrics
  const {
    latest: bioLatest,
    trend: bioTrend,
    isPolling: bioPolling,
    startPolling,
    stopPolling,
  } = useSessionBiometrics();

  // View state
  const [viewPhase, setViewPhase] = useState<ViewPhase>('idle');
  const [selectedDuration, setSelectedDuration] = useState<number>(
    prescribedDuration || 45
  );

  // User context
  const [userState, setUserState] = useState<UserState>({ denialDay: 0, arousalLevel: 0 });

  // Live session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<GoonPlaylistItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<GoonPhase>('build');
  const [deviceActive, setDeviceActive] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [intensityMultiplier, setIntensityMultiplier] = useState(1.0);

  // Summary inputs
  const [peakArousal, setPeakArousal] = useState(3);
  const [edgeCount, setEdgeCount] = useState(0);
  const [deviceUsed, setDeviceUsed] = useState(false);

  // Refs
  const startMsRef = useRef(0);
  const phaseRef = useRef<GoonPhase>('build');

  // Load user denial/arousal state
  useEffect(() => {
    if (!user?.id) return;

    const today = new Date().toISOString().split('T')[0];

    Promise.all([
      supabase
        .from('denial_state')
        .select('current_denial_day')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('daily_arousal_plans')
        .select('current_arousal_level')
        .eq('user_id', user.id)
        .eq('plan_date', today)
        .maybeSingle(),
    ]).then(([denialRes, arousalRes]) => {
      setUserState({
        denialDay: denialRes.data?.current_denial_day || 0,
        arousalLevel: arousalRes.data?.current_arousal_level || 0,
      });
    });
  }, [user?.id]);

  // Elapsed timer
  useEffect(() => {
    if (viewPhase !== 'live') return;

    const tick = () => setElapsed(Math.round((Date.now() - startMsRef.current) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [viewPhase]);

  // Phase boundaries based on selected duration
  const phaseBoundaries = useMemo(() => {
    const scale = selectedDuration / 45;
    return {
      buildEnd: Math.round(15 * scale) * 60,
      escalateEnd: Math.round(30 * scale) * 60,
      peakEnd: selectedDuration * 60,
    };
  }, [selectedDuration]);

  // Auto-transition phases based on elapsed time
  useEffect(() => {
    if (viewPhase !== 'live') return;

    let newPhase: GoonPhase;
    if (elapsed < phaseBoundaries.buildEnd) {
      newPhase = 'build';
    } else if (elapsed < phaseBoundaries.escalateEnd) {
      newPhase = 'escalate';
    } else {
      newPhase = 'peak';
    }

    if (newPhase !== phaseRef.current) {
      phaseRef.current = newPhase;
      setCurrentPhase(newPhase);
      // Transition device pattern
      transitionSessionPhase('goon', newPhase, intensityMultiplier)
        .then((ok) => setDeviceActive(ok))
        .catch(() => setDeviceActive(false));
    }
  }, [elapsed, viewPhase, phaseBoundaries, intensityMultiplier]);

  // Current playlist items for active phase
  const currentPlaylistItems = useMemo(
    () => playlist.filter((item) => item.phase === currentPhase),
    [playlist, currentPhase]
  );

  // Formatted elapsed
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  // Progress percentage
  const progressPct = Math.min(100, (elapsed / (selectedDuration * 60)) * 100);

  // ============================================
  // HANDLERS
  // ============================================

  const handleStart = useCallback(async () => {
    if (!user?.id) return;

    setViewPhase('starting');

    try {
      const result = await startGoonSession(user.id, selectedDuration);
      setSessionId(result.sessionId);
      setPlaylist(result.playlist);
      startMsRef.current = Date.now();
      phaseRef.current = 'build';
      setCurrentPhase('build');
      setElapsed(0);
      setDeviceActive(true);
      setDeviceUsed(true);

      // Fetch the intensity multiplier from the session record
      const { data: sessionRow } = await supabase
        .from('conditioning_sessions_v2')
        .select('intensity_multiplier')
        .eq('id', result.sessionId)
        .single();

      if (sessionRow?.intensity_multiplier) {
        setIntensityMultiplier(sessionRow.intensity_multiplier);
      }

      // Start biometric polling
      startPolling(result.sessionId);

      setViewPhase('live');
    } catch (err) {
      console.error('[GoonSessionView] Failed to start session:', err);
      setViewPhase('idle');
    }
  }, [user?.id, selectedDuration, startPolling]);

  const handleEndSession = useCallback(() => {
    if (!confirmEnd) {
      setConfirmEnd(true);
      setTimeout(() => setConfirmEnd(false), 3000);
      return;
    }

    // Stop device + biometrics, move to summary
    deactivateSessionDevice().catch(() => {});
    stopPolling();
    setDeviceActive(false);
    setViewPhase('summary');
    setConfirmEnd(false);
  }, [confirmEnd, stopPolling]);

  const handleComplete = useCallback(async () => {
    if (!sessionId) return;

    const metrics: GoonSessionMetrics = {
      peakArousal,
      edgeCount,
      deviceUsed,
      averageHeartRate: bioLatest?.avg_heart_rate,
      peakHeartRate: bioLatest?.max_heart_rate,
    };

    try {
      await endGoonSession(sessionId, metrics);
    } catch (err) {
      console.error('[GoonSessionView] Failed to end session:', err);
    }

    // Reset
    setSessionId(null);
    setPlaylist([]);
    setElapsed(0);
    setPeakArousal(3);
    setEdgeCount(0);
    setDeviceUsed(false);
    setViewPhase('idle');
  }, [sessionId, peakArousal, edgeCount, deviceUsed, bioLatest]);

  // ============================================
  // RENDER — IDLE
  // ============================================

  if (viewPhase === 'idle') {
    return (
      <div className="pb-20">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className={`p-1.5 rounded-lg transition-colors ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-500'
                : 'hover:bg-red-900/30 text-red-400'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Flame
              className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-red-400'}`}
            />
            <h1
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-red-200'
              }`}
            >
              Goon Session
            </h1>
          </div>
        </div>

        <div className="px-4 space-y-4">
          {/* Current state display */}
          <div
            className={`p-3 rounded-xl ${
              isBambiMode
                ? 'bg-pink-50 border border-pink-200'
                : 'bg-red-900/10 border border-red-700/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className={`text-[10px] uppercase tracking-wider font-semibold ${
                    isBambiMode ? 'text-pink-400' : 'text-red-500'
                  }`}
                >
                  Denial Day
                </p>
                <p
                  className={`text-2xl font-mono font-semibold ${
                    isBambiMode ? 'text-pink-700' : 'text-red-300'
                  }`}
                >
                  {userState.denialDay}
                </p>
              </div>
              <div
                className={`w-px h-10 ${isBambiMode ? 'bg-pink-200' : 'bg-red-700/30'}`}
              />
              <div>
                <p
                  className={`text-[10px] uppercase tracking-wider font-semibold ${
                    isBambiMode ? 'text-pink-400' : 'text-red-500'
                  }`}
                >
                  Arousal
                </p>
                <p
                  className={`text-2xl font-mono font-semibold ${
                    isBambiMode ? 'text-pink-700' : 'text-red-300'
                  }`}
                >
                  {userState.arousalLevel}
                  <span
                    className={`text-xs ml-0.5 ${
                      isBambiMode ? 'text-pink-400' : 'text-red-500'
                    }`}
                  >
                    /10
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Duration selector */}
          <div>
            <p
              className={`text-xs uppercase tracking-wider font-semibold mb-2 px-1 ${
                isBambiMode ? 'text-pink-500' : 'text-red-400'
              }`}
            >
              Duration
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.map((dur) => {
                const isSelected = selectedDuration === dur;
                const isPrescribed = prescribedDuration === dur;
                return (
                  <button
                    key={dur}
                    onClick={() => setSelectedDuration(dur)}
                    className={`py-3 rounded-xl text-sm font-medium transition-all ${
                      isSelected
                        ? isBambiMode
                          ? 'bg-pink-500 text-white ring-2 ring-pink-300'
                          : 'bg-red-600 text-white ring-2 ring-red-400/50'
                        : isBambiMode
                          ? 'bg-white border border-pink-200 text-pink-600 hover:bg-pink-50'
                          : 'bg-protocol-surface border border-protocol-border text-red-300 hover:bg-red-900/20'
                    }`}
                  >
                    {dur} min
                    {isPrescribed && (
                      <span className="block text-[10px] opacity-70 mt-0.5">
                        prescribed
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phase breakdown */}
          <div
            className={`p-3 rounded-xl space-y-2 ${
              isBambiMode
                ? 'bg-white border border-pink-200'
                : 'bg-protocol-surface border border-protocol-border'
            }`}
          >
            <p
              className={`text-[10px] uppercase tracking-wider font-semibold ${
                isBambiMode ? 'text-pink-400' : 'text-red-500'
              }`}
            >
              Phase Breakdown
            </p>
            {(['build', 'escalate', 'peak'] as GoonPhase[]).map((phase) => {
              const scale = selectedDuration / 45;
              const startMin =
                phase === 'build' ? 0 : phase === 'escalate' ? Math.round(15 * scale) : Math.round(30 * scale);
              const endMin =
                phase === 'build'
                  ? Math.round(15 * scale)
                  : phase === 'escalate'
                    ? Math.round(30 * scale)
                    : selectedDuration;
              const colors = PHASE_COLORS[phase];
              return (
                <div key={phase} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        isBambiMode
                          ? `bg-${phase === 'build' ? 'emerald' : phase === 'escalate' ? 'amber' : 'red'}-100 ${colors.light}`
                          : colors.badge
                      }`}
                    >
                      {PHASE_LABELS[phase]}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-mono ${
                      isBambiMode ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  >
                    {startMin}-{endMin} min
                  </span>
                </div>
              );
            })}
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={!user?.id}
            className={`w-full py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-colors ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600 active:bg-pink-700'
                : 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Play className="w-5 h-5" />
            Start Goon Session
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER — STARTING
  // ============================================

  if (viewPhase === 'starting') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2
          className={`w-8 h-8 animate-spin ${
            isBambiMode ? 'text-pink-400' : 'text-red-400'
          }`}
        />
        <p
          className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-red-400'}`}
        >
          Building playlist...
        </p>
      </div>
    );
  }

  // ============================================
  // RENDER — LIVE
  // ============================================

  if (viewPhase === 'live') {
    const phaseColors = PHASE_COLORS[currentPhase];

    return (
      <div
        className={`min-h-[60vh] flex flex-col ${
          isBambiMode ? 'text-pink-800' : 'text-red-200'
        }`}
      >
        {/* Phase badge + session label */}
        <div className="flex items-center justify-center gap-2 py-3">
          <Flame
            className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-red-500'}`}
          />
          <span
            className={`text-xs uppercase tracking-wider font-semibold ${
              isBambiMode ? 'text-pink-500' : 'text-red-400'
            }`}
          >
            Goon Session
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              isBambiMode
                ? `${phaseColors.light} bg-opacity-20 bg-current`
                : phaseColors.badge
            }`}
          >
            {PHASE_LABELS[currentPhase]}
          </span>
        </div>

        {/* Timer — large centered */}
        <div className="flex-1 flex flex-col items-center justify-center py-6">
          <div
            className={`text-6xl font-mono font-light tracking-tight mb-1 ${
              isBambiMode ? 'text-pink-700' : 'text-red-300'
            }`}
          >
            {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
          </div>

          {/* Progress bar */}
          <div className="w-48 h-1 rounded-full overflow-hidden mt-2 mb-1 bg-gray-700/30">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                isBambiMode ? 'bg-pink-400' : 'bg-red-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p
            className={`text-[10px] ${
              isBambiMode ? 'text-pink-400' : 'text-red-500'
            }`}
          >
            {selectedDuration} min target
          </p>
        </div>

        {/* Phase progress indicators */}
        <div className="flex items-center justify-center gap-1 mb-4 px-4">
          {(['build', 'escalate', 'peak'] as GoonPhase[]).map((phase) => {
            const isActive = phase === currentPhase;
            const isPast =
              (phase === 'build' && currentPhase !== 'build') ||
              (phase === 'escalate' && currentPhase === 'peak');
            const colors = PHASE_COLORS[phase];
            return (
              <div
                key={phase}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  isActive
                    ? isBambiMode
                      ? 'bg-pink-400 animate-pulse'
                      : `${colors.dark.replace('text-', 'bg-')} animate-pulse`
                    : isPast
                      ? isBambiMode
                        ? 'bg-pink-300'
                        : 'bg-gray-500'
                      : isBambiMode
                        ? 'bg-pink-100'
                        : 'bg-gray-700'
                }`}
              />
            );
          })}
        </div>

        {/* Current content item */}
        {currentPlaylistItems.length > 0 && (
          <div
            className={`mx-4 p-3 rounded-xl mb-3 ${
              isBambiMode
                ? 'bg-pink-100/60 border border-pink-200'
                : 'bg-red-900/20 border border-red-700/20'
            }`}
          >
            <p
              className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${
                isBambiMode ? 'text-pink-400' : 'text-red-500'
              }`}
            >
              Playlist ({currentPlaylistItems.length} items)
            </p>
            {currentPlaylistItems.slice(0, 3).map((item, i) => (
              <div
                key={item.contentId}
                className={`flex items-center justify-between py-1 ${
                  i > 0
                    ? isBambiMode
                      ? 'border-t border-pink-200/50'
                      : 'border-t border-red-700/10'
                    : ''
                }`}
              >
                <span
                  className={`text-xs truncate ${
                    i === 0
                      ? isBambiMode
                        ? 'text-pink-700 font-medium'
                        : 'text-red-300 font-medium'
                      : isBambiMode
                        ? 'text-pink-400'
                        : 'text-red-500'
                  }`}
                >
                  {i === 0 ? 'Now: ' : ''}
                  {item.contentId.slice(0, 8)}...
                </span>
                <span
                  className={`text-[10px] ${
                    isBambiMode ? 'text-pink-400' : 'text-red-500'
                  }`}
                >
                  {'●'.repeat(Math.min(5, Math.round(item.intensity / 20)))}
                  {'○'.repeat(5 - Math.min(5, Math.round(item.intensity / 20)))}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Biometrics + Device row */}
        <div className="flex items-stretch gap-2 mx-4 mb-4">
          {/* Whoop biometrics */}
          <div
            className={`flex-1 p-3 rounded-xl ${
              isBambiMode
                ? 'bg-pink-50 border border-pink-200'
                : 'bg-red-900/10 border border-red-700/30'
            }`}
          >
            <div className="flex items-center gap-1 mb-2">
              <Activity
                className={`w-3 h-3 ${
                  isBambiMode ? 'text-pink-400' : 'text-red-500'
                }`}
              />
              <span
                className={`text-[10px] uppercase tracking-wider font-semibold ${
                  isBambiMode ? 'text-pink-400' : 'text-red-500'
                }`}
              >
                Biometrics
              </span>
              {bioPolling && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-auto" />
              )}
            </div>

            {bioLatest ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] ${
                      isBambiMode ? 'text-pink-400' : 'text-red-500'
                    }`}
                  >
                    Strain
                  </span>
                  <span
                    className={`text-xs font-mono font-medium ${
                      isBambiMode ? 'text-pink-700' : 'text-red-300'
                    }`}
                  >
                    +{bioLatest.strain_delta.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] ${
                      isBambiMode ? 'text-pink-400' : 'text-red-500'
                    }`}
                  >
                    HR
                  </span>
                  <div className="flex items-center gap-1">
                    <Heart
                      className={`w-2.5 h-2.5 ${
                        isBambiMode ? 'text-pink-500' : 'text-red-400'
                      }`}
                    />
                    <span
                      className={`text-xs font-mono font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-red-300'
                      }`}
                    >
                      {bioLatest.avg_heart_rate}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] ${
                      isBambiMode ? 'text-pink-400' : 'text-red-500'
                    }`}
                  >
                    Trend
                  </span>
                  <span className="flex items-center gap-0.5">
                    {bioTrend === 'rising' && (
                      <TrendingUp className="w-3 h-3 text-red-400" />
                    )}
                    {bioTrend === 'falling' && (
                      <TrendingDown className="w-3 h-3 text-blue-400" />
                    )}
                    {bioTrend === 'stable' && (
                      <Minus className="w-3 h-3 text-gray-400" />
                    )}
                    <span
                      className={`text-[10px] capitalize ${
                        isBambiMode ? 'text-pink-500' : 'text-red-400'
                      }`}
                    >
                      {bioTrend || 'waiting'}
                    </span>
                  </span>
                </div>
                {bioLatest.stale && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    Data may be stale
                  </p>
                )}
              </div>
            ) : (
              <p
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-300' : 'text-red-600'
                }`}
              >
                {bioPolling ? 'Connecting...' : 'No Whoop data'}
              </p>
            )}
          </div>

          {/* Device status */}
          <div
            className={`w-20 p-3 rounded-xl flex flex-col items-center justify-center ${
              isBambiMode
                ? 'bg-pink-50 border border-pink-200'
                : 'bg-red-900/10 border border-red-700/30'
            }`}
          >
            <Vibrate
              className={`w-5 h-5 mb-1 ${
                deviceActive
                  ? isBambiMode
                    ? 'text-pink-500 animate-pulse'
                    : 'text-red-400 animate-pulse'
                  : isBambiMode
                    ? 'text-pink-200'
                    : 'text-red-700'
              }`}
            />
            <span
              className={`text-[10px] font-medium ${
                deviceActive
                  ? isBambiMode
                    ? 'text-pink-600'
                    : 'text-red-300'
                  : isBambiMode
                    ? 'text-pink-300'
                    : 'text-red-600'
              }`}
            >
              {deviceActive ? 'Active' : 'Off'}
            </span>
          </div>
        </div>

        {/* End session button */}
        <div className="px-4 pb-6">
          <button
            onClick={handleEndSession}
            className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              confirmEnd
                ? 'bg-red-500 text-white hover:bg-red-600'
                : isBambiMode
                  ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Square className="w-4 h-4" />
            {confirmEnd ? 'Tap again to end' : 'End Session'}
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER — SUMMARY
  // ============================================

  if (viewPhase === 'summary') {
    const durationMin = Math.round(elapsed / 60);

    return (
      <div className="pb-20">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className={`p-1.5 rounded-lg transition-colors ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-500'
                : 'hover:bg-red-900/30 text-red-400'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Flame
              className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-red-400'}`}
            />
            <h1
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-red-200'
              }`}
            >
              Session Complete
            </h1>
          </div>
        </div>

        <div className="px-4 space-y-4">
          {/* Duration display */}
          <div
            className={`p-4 rounded-xl text-center ${
              isBambiMode
                ? 'bg-pink-50 border border-pink-200'
                : 'bg-red-900/10 border border-red-700/30'
            }`}
          >
            <Clock
              className={`w-6 h-6 mx-auto mb-1 ${
                isBambiMode ? 'text-pink-400' : 'text-red-500'
              }`}
            />
            <p
              className={`text-3xl font-mono font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-red-300'
              }`}
            >
              {durationMin}
              <span
                className={`text-sm ml-1 ${
                  isBambiMode ? 'text-pink-400' : 'text-red-500'
                }`}
              >
                min
              </span>
            </p>
            <p
              className={`text-[10px] uppercase tracking-wider mt-1 ${
                isBambiMode ? 'text-pink-400' : 'text-red-500'
              }`}
            >
              Total Duration
            </p>
          </div>

          {/* Peak arousal slider (1-5) */}
          <div
            className={`p-4 rounded-xl ${
              isBambiMode
                ? 'bg-white border border-pink-200'
                : 'bg-protocol-surface border border-protocol-border'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p
                className={`text-xs font-semibold ${
                  isBambiMode ? 'text-pink-600' : 'text-red-300'
                }`}
              >
                Peak Arousal
              </p>
              <span
                className={`text-lg font-mono font-semibold ${
                  isBambiMode ? 'text-pink-700' : 'text-red-300'
                }`}
              >
                {peakArousal}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={peakArousal}
              onChange={(e) => setPeakArousal(Number(e.target.value))}
              className={`w-full h-2 rounded-full appearance-none cursor-pointer ${
                isBambiMode ? 'bg-pink-200' : 'bg-red-900/30'
              }`}
            />
            <div className="flex justify-between mt-1">
              <span
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-300' : 'text-red-600'
                }`}
              >
                Low
              </span>
              <span
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-300' : 'text-red-600'
                }`}
              >
                Extreme
              </span>
            </div>
          </div>

          {/* Edge count */}
          <div
            className={`p-4 rounded-xl ${
              isBambiMode
                ? 'bg-white border border-pink-200'
                : 'bg-protocol-surface border border-protocol-border'
            }`}
          >
            <p
              className={`text-xs font-semibold mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-red-300'
              }`}
            >
              Edge Count
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setEdgeCount(Math.max(0, edgeCount - 1))}
                disabled={edgeCount === 0}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold transition-colors disabled:opacity-30 ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-red-900/20 text-red-400 hover:bg-red-900/30'
                }`}
              >
                -
              </button>
              <span
                className={`text-3xl font-mono font-semibold w-12 text-center ${
                  isBambiMode ? 'text-pink-700' : 'text-red-300'
                }`}
              >
                {edgeCount}
              </span>
              <button
                onClick={() => setEdgeCount(edgeCount + 1)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold transition-colors ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-red-900/20 text-red-400 hover:bg-red-900/30'
                }`}
              >
                +
              </button>
            </div>
          </div>

          {/* Device used toggle */}
          <div
            className={`p-4 rounded-xl flex items-center justify-between ${
              isBambiMode
                ? 'bg-white border border-pink-200'
                : 'bg-protocol-surface border border-protocol-border'
            }`}
          >
            <div className="flex items-center gap-2">
              <Vibrate
                className={`w-4 h-4 ${
                  isBambiMode ? 'text-pink-400' : 'text-red-500'
                }`}
              />
              <p
                className={`text-xs font-semibold ${
                  isBambiMode ? 'text-pink-600' : 'text-red-300'
                }`}
              >
                Device Used
              </p>
            </div>
            <button
              onClick={() => setDeviceUsed(!deviceUsed)}
              className={`w-12 h-7 rounded-full relative transition-colors ${
                deviceUsed
                  ? isBambiMode
                    ? 'bg-pink-500'
                    : 'bg-red-600'
                  : isBambiMode
                    ? 'bg-pink-200'
                    : 'bg-gray-600'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-transform ${
                  deviceUsed ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Biometric summary if available */}
          {bioLatest && (
            <div
              className={`p-3 rounded-xl ${
                isBambiMode
                  ? 'bg-pink-50 border border-pink-200'
                  : 'bg-red-900/10 border border-red-700/30'
              }`}
            >
              <div className="flex items-center gap-1 mb-2">
                <Activity
                  className={`w-3 h-3 ${
                    isBambiMode ? 'text-pink-400' : 'text-red-500'
                  }`}
                />
                <span
                  className={`text-[10px] uppercase tracking-wider font-semibold ${
                    isBambiMode ? 'text-pink-400' : 'text-red-500'
                  }`}
                >
                  Session Biometrics
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <p
                    className={`text-xs ${
                      isBambiMode ? 'text-pink-400' : 'text-red-500'
                    }`}
                  >
                    Avg HR
                  </p>
                  <p
                    className={`text-sm font-mono font-medium ${
                      isBambiMode ? 'text-pink-700' : 'text-red-300'
                    }`}
                  >
                    {bioLatest.avg_heart_rate}
                  </p>
                </div>
                <div>
                  <p
                    className={`text-xs ${
                      isBambiMode ? 'text-pink-400' : 'text-red-500'
                    }`}
                  >
                    Peak HR
                  </p>
                  <p
                    className={`text-sm font-mono font-medium ${
                      isBambiMode ? 'text-pink-700' : 'text-red-300'
                    }`}
                  >
                    {bioLatest.max_heart_rate}
                  </p>
                </div>
                <div>
                  <p
                    className={`text-xs ${
                      isBambiMode ? 'text-pink-400' : 'text-red-500'
                    }`}
                  >
                    Strain
                  </p>
                  <p
                    className={`text-sm font-mono font-medium ${
                      isBambiMode ? 'text-pink-700' : 'text-red-300'
                    }`}
                  >
                    +{bioLatest.strain_delta.toFixed(1)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Complete button */}
          <button
            onClick={handleComplete}
            className={`w-full py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-colors ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600 active:bg-pink-700'
                : 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
            }`}
          >
            <ChevronUp className="w-5 h-5" />
            Complete Session
          </button>
        </div>
      </div>
    );
  }

  return null;
}
