/**
 * Session Complete Screen
 * Shows stats, points, streak update, interactive protein shake prompt, affirmation.
 */

import { useState } from 'react';
import { Trophy, Flame, Clock, Dumbbell, UtensilsCrossed, TrendingUp, Check } from 'lucide-react';
import type { SessionCompletionResult, ExerciseDomainConfig } from '../../types/exercise';
import { DOMAIN_LEVEL_NAMES, DOMAIN_LEVEL_THRESHOLDS } from '../../types/exercise';

interface SessionCompleteScreenProps {
  result: SessionCompletionResult;
  onDone: () => void;
  domainConfig?: ExerciseDomainConfig | null;
  daysSinceMeasurement?: number | null;
  onProteinShakeCheck?: () => void;
}

export function SessionCompleteScreen({ result, onDone, domainConfig, daysSinceMeasurement, onProteinShakeCheck }: SessionCompleteScreenProps) {
  const minutes = Math.floor(result.durationSeconds / 60);
  const seconds = result.durationSeconds % 60;
  const [shakeDone, setShakeDone] = useState(false);

  const handleShake = () => {
    if (shakeDone) return;
    setShakeDone(true);
    onProteinShakeCheck?.();
  };

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-8 min-h-screen bg-gradient-to-b from-purple-900/40 to-black">
      {/* Trophy */}
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center mt-8">
        <Trophy className="w-10 h-10 text-white" />
      </div>

      <h1 className="text-2xl font-bold text-white">Session Complete</h1>

      {/* Affirmation */}
      <p className="text-purple-300 text-center italic text-lg max-w-xs">
        {result.affirmation}
      </p>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        <StatBox
          icon={<Dumbbell className="w-5 h-5" />}
          value={String(result.totalReps)}
          label="reps"
        />
        <StatBox
          icon={<Clock className="w-5 h-5" />}
          value={`${minutes}:${String(seconds).padStart(2, '0')}`}
          label="time"
        />
        <StatBox
          icon={<Flame className="w-5 h-5" />}
          value={`+${result.pointsAwarded}`}
          label="points"
        />
      </div>

      {/* Streak update */}
      <div className="w-full max-w-sm bg-white/5 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Flame className="w-6 h-6 text-orange-400" />
          <div>
            <p className="text-white font-medium">
              Week {result.newStreakWeeks}
            </p>
            <p className="text-white/50 text-sm">
              {result.sessionsThisWeek}/3 sessions this week
            </p>
          </div>
        </div>
        {result.sessionsThisWeek >= 3 && (
          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
            Maintained
          </span>
        )}
      </div>

      {/* Interactive protein shake prompt */}
      <button
        onClick={handleShake}
        className={`w-full max-w-sm rounded-xl p-4 flex items-center gap-3 transition-all ${
          shakeDone
            ? 'bg-green-500/15 border border-green-500/30'
            : 'bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 hover:from-pink-500/20 hover:to-purple-500/20'
        }`}
      >
        {shakeDone ? (
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-white" />
          </div>
        ) : (
          <UtensilsCrossed className="w-6 h-6 text-pink-400 flex-shrink-0" />
        )}
        <div className="text-left">
          <p className={`font-medium text-sm ${shakeDone ? 'text-green-300' : 'text-white'}`}>
            {shakeDone ? 'Shake done — 30g delivered' : 'Post-workout shake'}
          </p>
          <p className={`text-xs ${shakeDone ? 'text-green-300/60' : 'text-white/60'}`}>
            {shakeDone
              ? 'Fuel the muscles she just worked.'
              : '1 scoop. Shake. Drink. 30g of protein.'}
          </p>
        </div>
      </button>

      {/* Domain level progress */}
      {domainConfig && domainConfig.domainLevel < 5 && (
        <div className="w-full max-w-sm bg-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <p className="text-white/70 text-sm font-medium">
              {DOMAIN_LEVEL_NAMES[domainConfig.domainLevel]}
            </p>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.round((domainConfig.tasksCompletedThisLevel / DOMAIN_LEVEL_THRESHOLDS[domainConfig.domainLevel]) * 100))}%`,
              }}
            />
          </div>
          <p className="text-white/40 text-xs">
            {DOMAIN_LEVEL_THRESHOLDS[domainConfig.domainLevel] - domainConfig.tasksCompletedThisLevel} more sessions to Level {domainConfig.domainLevel + 1}
          </p>
        </div>
      )}

      {/* Measurement prompt */}
      {daysSinceMeasurement !== null && daysSinceMeasurement !== undefined && daysSinceMeasurement > 14 && (
        <div className="w-full max-w-sm bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
          <p className="text-yellow-300 text-sm">
            {daysSinceMeasurement} days since your last measurement — time to check in on your progress.
          </p>
        </div>
      )}

      {/* Done button */}
      <button
        onClick={onDone}
        className="w-full max-w-sm mt-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-lg"
      >
        Done
      </button>
    </div>
  );
}

function StatBox({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-3 flex flex-col items-center gap-1">
      <div className="text-purple-400">{icon}</div>
      <p className="text-white font-bold text-lg">{value}</p>
      <p className="text-white/40 text-xs">{label}</p>
    </div>
  );
}
