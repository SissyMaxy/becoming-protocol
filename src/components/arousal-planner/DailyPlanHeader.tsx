/**
 * Daily Plan Header
 * Shows plan intensity, denial day, and lock status
 */

import { Flame, Lock, Calendar, Zap, Sparkles, Sun } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { PlanIntensity } from '../../types/arousal-planner';
import { PLAN_INTENSITY_CONFIG } from '../../types/arousal-planner';

interface DailyPlanHeaderProps {
  planIntensity: PlanIntensity;
  denialDay: number;
  isLocked: boolean;
  totalEdges: number;
  totalMinutes: number;
  completionPercentage: number;
}

export function DailyPlanHeader({
  planIntensity,
  denialDay,
  isLocked,
  totalEdges,
  totalMinutes,
  completionPercentage,
}: DailyPlanHeaderProps) {
  const { isBambiMode } = useBambiMode();

  const intensityConfig = PLAN_INTENSITY_CONFIG[planIntensity];

  // Intensity colors
  const intensityColors: Record<PlanIntensity, string> = {
    light: isBambiMode ? 'text-green-500 bg-green-50' : 'text-green-400 bg-green-900/30',
    moderate: isBambiMode ? 'text-yellow-600 bg-yellow-50' : 'text-yellow-400 bg-yellow-900/30',
    intense: isBambiMode ? 'text-purple-600 bg-purple-50' : 'text-purple-400 bg-purple-900/30',
    extreme: isBambiMode ? 'text-red-600 bg-red-50' : 'text-red-400 bg-red-900/30',
  };

  const IntensityIcon = {
    light: Sun,
    moderate: Flame,
    intense: Zap,
    extreme: Sparkles,
  }[planIntensity];

  return (
    <div className={`rounded-2xl p-4 ${
      isBambiMode ? 'bg-white shadow-sm' : 'bg-protocol-surface'
    }`}>
      {/* Top row: Intensity badge + Lock status */}
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${intensityColors[planIntensity]}`}>
          <IntensityIcon className="w-4 h-4" />
          <span className="text-sm font-semibold">{intensityConfig.label} Day</span>
        </div>

        {isLocked && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
            isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-pink-900/30 text-pink-400'
          }`}>
            <Lock className="w-4 h-4" />
            <span className="text-sm font-medium">Locked</span>
          </div>
        )}
      </div>

      {/* Description */}
      <p className={`text-sm mb-4 ${
        isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
      }`}>
        {intensityConfig.description}
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <Calendar className={`w-4 h-4 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`} />
          <span className={isBambiMode ? 'text-gray-700' : 'text-protocol-text'}>
            Day {denialDay}
          </span>
        </div>

        <div className={`h-4 w-px ${isBambiMode ? 'bg-gray-200' : 'bg-protocol-border'}`} />

        <div className={isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'}>
          {totalEdges} edges target
        </div>

        <div className={`h-4 w-px ${isBambiMode ? 'bg-gray-200' : 'bg-protocol-border'}`} />

        <div className={isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'}>
          {totalMinutes} min
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs ${isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}`}>
            Today's Progress
          </span>
          <span className={`text-xs font-medium ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
          }`}>
            {completionPercentage}%
          </span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${
          isBambiMode ? 'bg-gray-100' : 'bg-protocol-bg'
        }`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isBambiMode
                ? 'bg-gradient-to-r from-pink-400 to-pink-600'
                : 'bg-gradient-to-r from-protocol-accent to-emerald-500'
            }`}
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
