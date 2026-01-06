/**
 * Guy Mode Stats Card
 * Displays guy mode statistics and penalty level
 */

import { Clock, TrendingDown, TrendingUp, Minus, AlertTriangle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { GuyModeStats, GuyModePenaltyLevel } from '../../types/guy-mode';

interface GuyModeStatsCardProps {
  stats: GuyModeStats;
}

const PENALTY_COLORS: Record<GuyModePenaltyLevel, { bg: string; text: string; bambi: string }> = {
  logged_only: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    bambi: 'bg-emerald-100 text-emerald-600',
  },
  warning: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    bambi: 'bg-amber-100 text-amber-600',
  },
  edge_debt: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    bambi: 'bg-orange-100 text-orange-600',
  },
  mandatory_task: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    bambi: 'bg-red-100 text-red-600',
  },
  ai_intervention: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    bambi: 'bg-red-200 text-red-700',
  },
  phase_regression_warning: {
    bg: 'bg-red-500/30',
    text: 'text-red-300',
    bambi: 'bg-red-300 text-red-800',
  },
};

const PENALTY_LABELS: Record<GuyModePenaltyLevel, string> = {
  logged_only: 'Clean',
  warning: 'Warning',
  edge_debt: 'Edge Debt',
  mandatory_task: 'Mandatory Task',
  ai_intervention: 'AI Intervention',
  phase_regression_warning: 'Regression Risk',
};

export function GuyModeStatsCard({ stats }: GuyModeStatsCardProps) {
  const { isBambiMode } = useBambiMode();

  const penaltyColors = PENALTY_COLORS[stats.currentPenaltyLevel];
  const penaltyLabel = PENALTY_LABELS[stats.currentPenaltyLevel];

  const TrendIcon = stats.guyModeRatioTrend === 'increasing'
    ? TrendingUp
    : stats.guyModeRatioTrend === 'decreasing'
      ? TrendingDown
      : Minus;

  const trendColor = stats.guyModeRatioTrend === 'increasing'
    ? 'text-red-400'
    : stats.guyModeRatioTrend === 'decreasing'
      ? 'text-emerald-400'
      : 'text-protocol-text-muted';

  return (
    <div className={`rounded-xl overflow-hidden ${
      isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${
        isBambiMode ? 'border-pink-100 bg-pink-50' : 'border-protocol-border bg-protocol-surface-light'
      }`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-semibold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            Guy Mode Tracking
          </h3>
          <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            isBambiMode ? penaltyColors.bambi : `${penaltyColors.bg} ${penaltyColors.text}`
          }`}>
            {penaltyLabel}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="p-4 grid grid-cols-2 gap-4">
        {/* Hours this week */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Clock className={`w-4 h-4 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`} />
            <span className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              This Week
            </span>
          </div>
          <p className={`text-2xl font-bold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            {stats.guyModeHoursThisWeek.toFixed(1)}h
          </p>
        </div>

        {/* Trend */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendIcon className={`w-4 h-4 ${trendColor}`} />
            <span className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              Trend
            </span>
          </div>
          <p className={`text-lg font-medium capitalize ${trendColor}`}>
            {stats.guyModeRatioTrend}
          </p>
        </div>

        {/* Total hours */}
        <div>
          <span className={`text-xs ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}>
            Total Hours
          </span>
          <p className={`text-lg font-semibold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            {stats.totalGuyModeHours.toFixed(1)}h
          </p>
        </div>

        {/* Days since masculine underwear */}
        <div>
          <span className={`text-xs ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}>
            Days Without Masc Underwear
          </span>
          <p className={`text-lg font-semibold ${
            stats.daysSinceMasculineUnderwear > 7
              ? 'text-emerald-500'
              : isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            {stats.daysSinceMasculineUnderwear}
          </p>
        </div>
      </div>

      {/* Warning if penalty level is elevated */}
      {stats.currentPenaltyLevel !== 'logged_only' && (
        <div className={`px-4 py-3 border-t ${
          isBambiMode ? 'border-pink-100 bg-amber-50' : 'border-protocol-border bg-amber-900/10'
        }`}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className={`text-xs ${
              isBambiMode ? 'text-amber-700' : 'text-amber-400'
            }`}>
              {stats.currentPenaltyLevel === 'warning' && 'Too much guy mode this week. Consider your choices.'}
              {stats.currentPenaltyLevel === 'edge_debt' && 'Edge debt accumulated. Complete extra edges today.'}
              {stats.currentPenaltyLevel === 'mandatory_task' && 'Mandatory feminization task has been added.'}
              {stats.currentPenaltyLevel === 'ai_intervention' && 'AI intervention active. Harder tasks tomorrow.'}
              {stats.currentPenaltyLevel === 'phase_regression_warning' && 'Phase regression imminent if pattern continues.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
