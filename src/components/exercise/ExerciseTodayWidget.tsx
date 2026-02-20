/**
 * Exercise Today Widget — compact card for the Today View.
 *
 * Shows streak, next workout recommendation, gym gate progress,
 * and latest measurements. Self-contained with own hook call.
 */

import { Flame, Dumbbell, ChevronRight, Lock } from 'lucide-react';
import { useExercise } from '../../hooks/useExercise';

export function ExerciseTodayWidget() {
  const { streakData, recommendedTemplate, latestMeasurement, isLoading } = useExercise();

  if (isLoading || !streakData) return null;

  const handleStart = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-exercise'));
  };

  return (
    <div className="bg-white/5 rounded-xl p-4">
      {/* Header row: streak + start button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-400" />
          <span className="text-white font-medium text-sm">
            Week {streakData.currentStreakWeeks}
          </span>
          <span className="text-white/30 text-sm">|</span>
          <span className="text-white/60 text-sm">
            {streakData.sessionsThisWeek}/3 this week
          </span>
          {streakData.sessionsThisWeek >= 3 && (
            <span className="text-green-400 text-xs">&#10003;</span>
          )}
        </div>
      </div>

      {/* Next workout recommendation */}
      {recommendedTemplate && (
        <button
          onClick={handleStart}
          className="w-full flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg px-3 py-2.5 mb-3 hover:from-purple-500/20 hover:to-pink-500/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-purple-400" />
            <span className="text-white text-sm">{recommendedTemplate.name}</span>
            <span className="text-white/30 text-xs">~{recommendedTemplate.estimatedMinutes}m</span>
          </div>
          <div className="flex items-center gap-1 text-purple-400 text-xs font-medium">
            Start
            <ChevronRight className="w-3 h-3" />
          </div>
        </button>
      )}

      {/* Gym gate progress (if not unlocked) */}
      {!streakData.gymGateUnlocked && streakData.totalSessions > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-3 h-3 text-yellow-400" />
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full"
              style={{ width: `${Math.min(100, Math.round((streakData.totalSessions / 18) * 100))}%` }}
            />
          </div>
          <span className="text-white/40 text-xs">{streakData.totalSessions}/18</span>
        </div>
      )}

      {/* Measurements mini-line */}
      {latestMeasurement && (latestMeasurement.hipsInches || latestMeasurement.waistInches) && (
        <div className="flex gap-3 text-xs text-white/40">
          {latestMeasurement.hipsInches && (
            <span>Hips: <span className="text-white/60">{latestMeasurement.hipsInches}"</span></span>
          )}
          {latestMeasurement.waistInches && (
            <span>Waist: <span className="text-white/60">{latestMeasurement.waistInches}"</span></span>
          )}
          {latestMeasurement.hipWaistRatio && (
            <span>Ratio: <span className="text-purple-400">{latestMeasurement.hipWaistRatio}</span></span>
          )}
        </div>
      )}
    </div>
  );
}
