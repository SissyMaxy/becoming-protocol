/**
 * Streak Risk Banner
 *
 * Shows warning when goals are incomplete and streak is at risk.
 * "Skip ANY goal = entire streak breaks"
 */

import { AlertTriangle, Flame, Clock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface StreakRiskBannerProps {
  incompleteGoals: number;
  totalGoals: number;
  currentStreak: number;
  pointsAtRisk: number;
  hoursRemaining?: number;
}

export function StreakRiskBanner({
  incompleteGoals,
  totalGoals,
  currentStreak,
  pointsAtRisk,
  hoursRemaining,
}: StreakRiskBannerProps) {
  const { isBambiMode } = useBambiMode();

  if (incompleteGoals === 0) return null;

  const isUrgent = hoursRemaining !== undefined && hoursRemaining <= 4;
  const isCritical = hoursRemaining !== undefined && hoursRemaining <= 2;

  return (
    <div
      className={`p-4 rounded-xl border-2 ${
        isCritical
          ? 'bg-red-900/30 border-red-500/50 animate-pulse'
          : isUrgent
            ? 'bg-orange-900/20 border-orange-500/40'
            : isBambiMode
              ? 'bg-amber-50 border-amber-300'
              : 'bg-amber-900/20 border-amber-600/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${
          isCritical
            ? 'bg-red-500/20'
            : isUrgent
              ? 'bg-orange-500/20'
              : 'bg-amber-500/20'
        }`}>
          {isCritical ? (
            <Flame className="w-5 h-5 text-red-400 animate-pulse" />
          ) : (
            <AlertTriangle className={`w-5 h-5 ${
              isUrgent ? 'text-orange-400' : isBambiMode ? 'text-amber-600' : 'text-amber-400'
            }`} />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className={`font-semibold ${
              isCritical
                ? 'text-red-300'
                : isUrgent
                  ? 'text-orange-300'
                  : isBambiMode
                    ? 'text-amber-800'
                    : 'text-amber-300'
            }`}>
              {isCritical ? 'STREAK ENDING' : isUrgent ? 'Streak at Risk!' : 'Complete All Goals'}
            </p>
            {hoursRemaining !== undefined && (
              <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                isCritical
                  ? 'bg-red-500/30 text-red-200'
                  : isUrgent
                    ? 'bg-orange-500/30 text-orange-200'
                    : 'bg-amber-500/30 text-amber-200'
              }`}>
                <Clock className="w-3 h-3" />
                {hoursRemaining}h left
              </span>
            )}
          </div>

          <p className={`text-sm ${
            isCritical
              ? 'text-red-400'
              : isUrgent
                ? 'text-orange-400/80'
                : isBambiMode
                  ? 'text-amber-600'
                  : 'text-amber-400/70'
          }`}>
            {incompleteGoals} of {totalGoals} goals remaining today
          </p>

          {/* What's at stake */}
          <div className={`mt-3 pt-3 border-t ${
            isCritical
              ? 'border-red-500/30'
              : isUrgent
                ? 'border-orange-500/30'
                : 'border-amber-500/30'
          }`}>
            <p className={`text-xs uppercase tracking-wider mb-2 ${
              isCritical
                ? 'text-red-400'
                : isUrgent
                  ? 'text-orange-400'
                  : isBambiMode
                    ? 'text-amber-700'
                    : 'text-amber-400'
            }`}>
              At Risk If You Skip
            </p>
            <div className="flex gap-4">
              <div>
                <p className={`text-lg font-bold ${
                  isCritical
                    ? 'text-red-300'
                    : isUrgent
                      ? 'text-orange-300'
                      : isBambiMode
                        ? 'text-amber-800'
                        : 'text-amber-200'
                }`}>
                  {currentStreak} days
                </p>
                <p className={`text-xs ${
                  isBambiMode ? 'text-amber-600' : 'text-amber-400/60'
                }`}>
                  streak
                </p>
              </div>
              <div>
                <p className={`text-lg font-bold ${
                  isCritical
                    ? 'text-red-300'
                    : isUrgent
                      ? 'text-orange-300'
                      : isBambiMode
                        ? 'text-amber-800'
                        : 'text-amber-200'
                }`}>
                  {pointsAtRisk.toLocaleString()} pts
                </p>
                <p className={`text-xs ${
                  isBambiMode ? 'text-amber-600' : 'text-amber-400/60'
                }`}>
                  psychological value
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
