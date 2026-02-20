/**
 * Voice Drill View
 *
 * Structured daily voice drills with live pitch meter.
 * The Handler schedules drills. David practices.
 * Pitch detection runs in-browser via Web Audio API.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Mic,
  MicOff,
  Square,
  Check,
  Flame,
  TrendingUp,
  Clock,
  Star,
  ChevronRight,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useVoiceTraining } from '../../hooks/useVoiceTraining';
import { classifyPitch, getPitchFeedback } from '../../lib/voice-training';
import type { VoiceDrill } from '../../types/voice-training';

interface VoiceDrillViewProps {
  onBack: () => void;
  onAffirmationGame?: () => void;
}

type DrillPhase = 'overview' | 'active' | 'rating' | 'complete';

export function VoiceDrillView({ onBack, onAffirmationGame }: VoiceDrillViewProps) {
  const { isBambiMode } = useBambiMode();
  const {
    stats,
    todayDrills,
    todayLogs,
    isLoading,
    currentPitch,
    isPitchDetecting,
    startPitchDetection,
    stopPitchDetection,
    completeDrill,
  } = useVoiceTraining();

  const [phase, setPhase] = useState<DrillPhase>('overview');
  const [activeDrill, setActiveDrill] = useState<VoiceDrill | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [qualityRating, setQualityRating] = useState(3);
  const [pitchReadings, setPitchReadings] = useState<number[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(0);

  // Collect pitch readings during active drill
  useEffect(() => {
    if (phase === 'active' && currentPitch && currentPitch > 0) {
      setPitchReadings(prev => [...prev, currentPitch]);
    }
  }, [phase, currentPitch]);

  // Timer for active drill
  useEffect(() => {
    if (phase === 'active') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Start a drill
  const handleStartDrill = useCallback(async (drill: VoiceDrill) => {
    setActiveDrill(drill);
    setPhase('active');
    setElapsedSeconds(0);
    setPitchReadings([]);
    setQualityRating(3);

    // Auto-start pitch detection if drill has Hz targets
    if (drill.targetHzMin || drill.targetHzMax) {
      await startPitchDetection();
    }
  }, [startPitchDetection]);

  // Finish active drill → rating
  const handleFinishDrill = useCallback(() => {
    stopPitchDetection();
    setPhase('rating');
  }, [stopPitchDetection]);

  // Submit rating → log completion
  const handleSubmitRating = useCallback(async () => {
    if (!activeDrill) return;

    const avgHz = pitchReadings.length > 0
      ? Math.round(pitchReadings.reduce((a, b) => a + b, 0) / pitchReadings.length * 10) / 10
      : undefined;
    const minHz = pitchReadings.length > 0
      ? Math.round(Math.min(...pitchReadings) * 10) / 10
      : undefined;
    const maxHz = pitchReadings.length > 0
      ? Math.round(Math.max(...pitchReadings) * 10) / 10
      : undefined;

    await completeDrill(activeDrill.id, {
      durationSeconds: elapsedSeconds,
      pitchAvgHz: avgHz,
      pitchMinHz: minHz,
      pitchMaxHz: maxHz,
      qualityRating,
    });

    setPhase('complete');
  }, [activeDrill, elapsedSeconds, pitchReadings, qualityRating, completeDrill]);

  // Format seconds as mm:ss
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Check which drills have been done today
  const completedDrillIds = new Set(todayLogs.map(l => l.drillId).filter(Boolean));

  if (isLoading) {
    return (
      <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'} flex items-center justify-center`}>
        <div className="w-12 h-12 border-4 border-protocol-accent/30 border-t-protocol-accent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Active drill phase ─────────────────────────────

  if (phase === 'active' && activeDrill) {
    const targetMin = activeDrill.targetHzMin || 180;
    const targetMax = activeDrill.targetHzMax || 200;
    const pitchClass = currentPitch ? classifyPitch(currentPitch) : null;
    const inTarget = currentPitch ? currentPitch >= targetMin && currentPitch <= targetMax : false;
    const targetDuration = activeDrill.durationSeconds;
    const progress = Math.min(100, (elapsedSeconds / targetDuration) * 100);

    return (
      <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'} p-4`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={handleFinishDrill}
            className="flex items-center gap-2 text-protocol-text/70 hover:text-protocol-text"
          >
            <Square className="w-5 h-5" />
            Stop
          </button>
          <div className={`text-lg font-mono font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {formatTime(elapsedSeconds)}
          </div>
        </div>

        {/* Drill title */}
        <h2 className={`text-xl font-bold mb-2 ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
          {activeDrill.title}
        </h2>

        {/* Progress bar */}
        <div className={`w-full h-2 rounded-full mb-6 ${isBambiMode ? 'bg-pink-200' : 'bg-protocol-surface'}`}>
          <div
            className={`h-full rounded-full transition-all ${inTarget ? 'bg-green-500' : isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Pitch meter (if pitch tracking) */}
        {(activeDrill.targetHzMin || activeDrill.targetHzMax) && (
          <div className={`rounded-xl p-6 mb-6 text-center ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`}>
            <div className="text-sm text-protocol-text/60 mb-2">Live Pitch</div>
            <div className={`text-5xl font-mono font-bold mb-2 ${
              !currentPitch ? 'text-protocol-text/30'
                : inTarget ? 'text-green-500'
                : pitchClass === 'androgynous' ? 'text-yellow-500'
                : 'text-red-400'
            }`}>
              {currentPitch ? `${Math.round(currentPitch)}` : '---'}
              <span className="text-xl ml-1">Hz</span>
            </div>
            <div className="text-sm text-protocol-text/60">
              Target: {targetMin}-{targetMax}Hz
            </div>
            {currentPitch && (
              <div className={`text-sm mt-1 font-medium ${
                inTarget ? 'text-green-500' : 'text-yellow-500'
              }`}>
                {getPitchFeedback(currentPitch, targetMin, targetMax)}
              </div>
            )}

            {!isPitchDetecting && (
              <button
                onClick={startPitchDetection}
                className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium ${
                  isBambiMode ? 'bg-pink-500 text-white' : 'bg-protocol-accent text-white'
                }`}
              >
                <Mic className="w-4 h-4 inline mr-1" />
                Enable Pitch Detection
              </button>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className={`rounded-xl p-4 mb-6 ${isBambiMode ? 'bg-pink-100/60' : 'bg-protocol-surface/60'}`}>
          <p className={`text-sm leading-relaxed ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
            {activeDrill.instruction}
          </p>
        </div>

        {/* Equipment note */}
        {activeDrill.equipmentNeeded && (
          <div className={`text-xs text-protocol-text/50 mb-6 flex items-center gap-1`}>
            <AlertTriangle className="w-3 h-3" />
            Needs: {activeDrill.equipmentNeeded}
          </div>
        )}

        {/* Finish button */}
        <button
          onClick={handleFinishDrill}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 ${
            progress >= 100
              ? 'bg-green-500 text-white hover:bg-green-600'
              : isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
          }`}
        >
          <Check className="w-6 h-6" />
          {progress >= 100 ? 'Complete' : 'Finish Early'}
        </button>
      </div>
    );
  }

  // ── Rating phase ───────────────────────────────────

  if (phase === 'rating' && activeDrill) {
    const avgHz = pitchReadings.length > 0
      ? Math.round(pitchReadings.reduce((a, b) => a + b, 0) / pitchReadings.length)
      : null;

    return (
      <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'} p-4`}>
        <div className="text-center py-8">
          <Check className={`w-16 h-16 mx-auto mb-4 ${isBambiMode ? 'text-pink-500' : 'text-green-500'}`} />
          <h2 className={`text-xl font-bold mb-2 ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
            Drill Complete
          </h2>
          <p className="text-protocol-text/60 mb-2">{activeDrill.title}</p>
          <p className="text-protocol-text/60 text-sm">
            {formatTime(elapsedSeconds)} practiced
            {avgHz && ` • Avg: ${avgHz}Hz`}
          </p>
        </div>

        {/* Quality self-rating */}
        <div className={`rounded-xl p-4 mb-6 ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`}>
          <p className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            How did that feel?
          </p>
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setQualityRating(n)}
                className={`w-12 h-12 rounded-lg font-bold transition-all flex items-center justify-center ${
                  qualityRating === n
                    ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-protocol-accent text-white'
                    : isBambiMode ? 'bg-pink-200 text-pink-700' : 'bg-protocol-surface-light text-protocol-text'
                }`}
              >
                <Star className={`w-5 h-5 ${qualityRating >= n ? 'fill-current' : ''}`} />
              </button>
            ))}
          </div>
          <div className="text-xs text-protocol-text/50 text-center mt-2">
            {qualityRating <= 2 ? 'Struggled' : qualityRating === 3 ? 'Okay' : qualityRating === 4 ? 'Good' : 'Great'}
          </div>
        </div>

        <button
          onClick={handleSubmitRating}
          className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 ${
            isBambiMode ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
          }`}
        >
          Log Practice
        </button>
      </div>
    );
  }

  // ── Complete phase (after rating) ──────────────────

  if (phase === 'complete') {
    return (
      <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'} p-4`}>
        <div className="text-center py-12">
          <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}>
            <Check className={`w-10 h-10 ${isBambiMode ? 'text-pink-500' : 'text-green-500'}`} />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
            Logged
          </h2>
          <p className="text-protocol-text/60 text-sm mb-8">
            Your voice is changing. The Handler tracks every shift.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => { setPhase('overview'); setActiveDrill(null); }}
              className={`w-full py-4 rounded-xl font-bold ${
                isBambiMode ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
              }`}
            >
              More Drills
            </button>
            <button
              onClick={onBack}
              className={`w-full py-3 rounded-xl font-medium ${
                isBambiMode ? 'bg-pink-100 text-pink-700' : 'bg-protocol-surface text-protocol-text'
              }`}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Overview phase (default) ───────────────────────

  return (
    <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'} p-4 pb-24`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-protocol-text/70 hover:text-protocol-text"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        {onAffirmationGame && (
          <button
            onClick={onAffirmationGame}
            className={`text-sm font-medium ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`}
          >
            Affirmation Game →
          </button>
        )}
      </div>

      {/* Title + Level */}
      <div className="mb-6">
        <h1 className={`text-2xl font-bold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
          Voice Drills
        </h1>
        {stats && (
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-sm font-medium px-2 py-0.5 rounded ${
              isBambiMode ? 'bg-pink-200 text-pink-700' : 'bg-protocol-surface text-protocol-accent'
            }`}>
              L{stats.voiceLevel} • {stats.levelName}
            </span>
            {stats.drillStreak > 0 && (
              <span className="flex items-center gap-1 text-sm text-orange-500">
                <Flame className="w-4 h-4" />
                {stats.drillStreak}d streak
              </span>
            )}
          </div>
        )}
      </div>

      {/* Avoidance warning */}
      {stats?.isAvoiding && (
        <div className={`rounded-xl p-4 mb-4 border ${
          isBambiMode ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-500">
                {stats.daysSinceLastPractice} days without voice practice
              </p>
              <p className="text-xs text-red-400 mt-1">
                Your pitch is regressing. Every day costs progress. The Handler notices.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <div className={`grid grid-cols-2 gap-3 mb-6`}>
          <div className={`rounded-xl p-3 ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Activity className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
              <span className="text-xs text-protocol-text/60">Current Pitch</span>
            </div>
            <div className={`text-xl font-bold font-mono ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
              {stats.currentHz ? `${Math.round(stats.currentHz)}Hz` : '---'}
            </div>
            {stats.shiftHz !== 0 && (
              <div className={`text-xs ${stats.shiftHz > 0 ? 'text-green-500' : 'text-red-400'}`}>
                {stats.shiftHz > 0 ? '+' : ''}{Math.round(stats.shiftHz)}Hz shift
              </div>
            )}
          </div>

          <div className={`rounded-xl p-3 ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
              <span className="text-xs text-protocol-text/60">Target</span>
            </div>
            <div className={`text-xl font-bold font-mono ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
              {stats.targetHz}Hz
            </div>
            <div className="text-xs text-protocol-text/50">
              {stats.currentHz
                ? stats.currentHz >= stats.targetHz
                  ? 'Reached!'
                  : `${Math.round(stats.targetHz - stats.currentHz)}Hz to go`
                : 'Record baseline first'}
            </div>
          </div>

          <div className={`rounded-xl p-3 ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Clock className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
              <span className="text-xs text-protocol-text/60">Today</span>
            </div>
            <div className={`text-xl font-bold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
              {stats.todayDrills}
            </div>
            <div className="text-xs text-protocol-text/50">
              {stats.todayMinutes}min practiced
            </div>
          </div>

          <div className={`rounded-xl p-3 ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Flame className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-orange-500'}`} />
              <span className="text-xs text-protocol-text/60">Total</span>
            </div>
            <div className={`text-xl font-bold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
              {stats.totalDrills}
            </div>
            <div className="text-xs text-protocol-text/50">
              {stats.totalMinutes}min all-time
            </div>
          </div>
        </div>
      )}

      {/* Today's drills */}
      <div className="mb-4">
        <h3 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text/70'}`}>
          Today's Drills
        </h3>

        {todayDrills.length === 0 ? (
          <div className={`rounded-xl p-6 text-center ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`}>
            <MicOff className="w-8 h-8 mx-auto mb-2 text-protocol-text/30" />
            <p className="text-sm text-protocol-text/50">No drills available yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayDrills.map(drill => {
              const isDone = completedDrillIds.has(drill.id);
              return (
                <button
                  key={drill.id}
                  onClick={() => !isDone && handleStartDrill(drill)}
                  disabled={isDone}
                  className={`w-full p-4 rounded-xl text-left flex items-center gap-3 transition-all ${
                    isDone
                      ? isBambiMode
                        ? 'bg-pink-50 border border-pink-100 opacity-60'
                        : 'bg-protocol-surface/50 border border-protocol-border/30 opacity-60'
                      : isBambiMode
                        ? 'bg-pink-100 border border-pink-200 hover:border-pink-300'
                        : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/30'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${
                    isDone
                      ? 'bg-green-100'
                      : isBambiMode ? 'bg-pink-200' : 'bg-protocol-surface-light'
                  }`}>
                    {isDone
                      ? <Check className="w-5 h-5 text-green-500" />
                      : <Mic className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
                        {drill.title}
                      </p>
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                        isBambiMode ? 'bg-pink-200 text-pink-600' : 'bg-protocol-border text-protocol-text-muted'
                      }`}>
                        L{drill.level}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-protocol-text/50">
                        {formatTime(drill.durationSeconds)}
                      </span>
                      {(drill.targetHzMin || drill.targetHzMax) && (
                        <span className="text-xs text-protocol-text/50">
                          • {drill.targetHzMin}-{drill.targetHzMax}Hz
                        </span>
                      )}
                      <span className="text-xs text-protocol-text/40 capitalize">
                        • {drill.drillType.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  {!isDone && (
                    <ChevronRight className={`w-5 h-5 shrink-0 ${
                      isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                    }`} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Level progress */}
      {stats && stats.voiceLevel < 5 && (
        <div className={`rounded-xl p-4 ${isBambiMode ? 'bg-pink-100/60' : 'bg-protocol-surface/60'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-protocol-text/60">
              Level {stats.voiceLevel} → {stats.voiceLevel + 1}
            </span>
            <span className="text-xs text-protocol-text/50">
              {stats.nextLevelDrillsNeeded} drills to advance
            </span>
          </div>
          <div className={`w-full h-1.5 rounded-full ${isBambiMode ? 'bg-pink-200' : 'bg-protocol-border'}`}>
            <div
              className={`h-full rounded-full ${isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'}`}
              style={{
                width: `${Math.min(100, ((stats.totalDrills) / (stats.totalDrills + stats.nextLevelDrillsNeeded)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
