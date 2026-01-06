/**
 * Stats Bar - Horizontal row of key metrics
 * Always visible at top of Today view
 */

import { Flame, Wallet, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../data/investment-categories';

interface StatsBarProps {
  streak: number;
  totalInvested: number;
  phase: number;
  daysInPhase: number;
  phaseName: string;
  onStreakTap?: () => void;
  onInvestedTap?: () => void;
  onPhaseTap?: () => void;
}

export function StatsBar({
  streak,
  totalInvested,
  phase,
  daysInPhase,
  phaseName: _phaseName,
  onStreakTap,
  onInvestedTap,
  onPhaseTap,
}: StatsBarProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {/* Streak */}
      <button
        onClick={onStreakTap}
        className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10
                   border border-orange-500/20 hover:border-orange-500/40 transition-all group"
      >
        <div className="p-1.5 rounded-lg bg-orange-500/20 group-hover:bg-orange-500/30 transition-colors">
          <Flame className="w-4 h-4 text-orange-400" />
        </div>
        <div className="text-left min-w-0">
          <p className="text-lg font-bold text-protocol-text leading-tight">
            {streak}
          </p>
          <p className="text-xs text-protocol-text-muted truncate">
            {streak === 1 ? 'day' : 'days'}
          </p>
        </div>
      </button>

      {/* Invested */}
      <button
        onClick={onInvestedTap}
        className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-protocol-accent/20 to-purple-500/10
                   border border-protocol-accent/20 hover:border-protocol-accent/40 transition-all group"
      >
        <div className="p-1.5 rounded-lg bg-protocol-accent/20 group-hover:bg-protocol-accent/30 transition-colors">
          <Wallet className="w-4 h-4 text-protocol-accent" />
        </div>
        <div className="text-left min-w-0">
          <p className="text-lg font-bold text-protocol-text leading-tight truncate">
            {totalInvested > 0 ? formatCurrency(totalInvested) : '$0'}
          </p>
          <p className="text-xs text-protocol-text-muted truncate">
            invested
          </p>
        </div>
      </button>

      {/* Phase */}
      <button
        onClick={onPhaseTap}
        className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10
                   border border-emerald-500/20 hover:border-emerald-500/40 transition-all group"
      >
        <div className="p-1.5 rounded-lg bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-left min-w-0">
          <p className="text-lg font-bold text-protocol-text leading-tight">
            {phase}
          </p>
          <p className="text-xs text-protocol-text-muted truncate">
            Day {daysInPhase + 1}
          </p>
        </div>
      </button>
    </div>
  );
}
