/**
 * SunkCostDisplay
 *
 * Implements v2 Part 6: Sunk Cost Framing
 * Prominently displays total investment as "You've invested X in her"
 * Leverages sunk cost psychology to prevent regression
 */

import { useMemo } from 'react';
import {
  Clock,
  Flame,
  Heart,
  Camera,
  Trophy,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { useSunkCost } from '../../hooks/useRatchetSystem';

interface SunkCostDisplayProps {
  variant?: 'full' | 'compact' | 'minimal';
  showAnimation?: boolean;
  className?: string;
}

export function SunkCostDisplay({
  variant = 'full',
  showAnimation = true,
  className = '',
}: SunkCostDisplayProps) {
  const { summary, isLoading } = useSunkCost();

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format hours
  const formatHours = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 10) return `${hours.toFixed(1)}h`;
    return `${Math.round(hours)}h`;
  };

  // Calculate "total value" as an aggregate score
  const totalValue = useMemo(() => {
    if (!summary) return 0;
    // Weight: $1 = 1pt, 1 hour = 5pt, 1 session = 10pt, 1 edge = 1pt, 1 commitment = 15pt
    return Math.round(
      summary.totalInvestment +
      summary.totalHours * 5 +
      summary.totalSessions * 10 +
      summary.totalEdges +
      summary.totalCommitments * 15
    );
  }, [summary]);

  if (isLoading || !summary) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-32 bg-protocol-surface rounded-xl" />
      </div>
    );
  }

  if (variant === 'minimal') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Heart className="w-4 h-4 text-pink-400" />
        <span className="text-protocol-text-muted text-sm">
          {formatCurrency(summary.totalInvestment)} invested in her
        </span>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`bg-gradient-to-r from-pink-900/30 to-purple-900/30 rounded-xl p-4 border border-pink-500/20 ${className}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-pink-400/80 text-xs font-medium mb-1">You've Invested in Her</p>
            <p className="text-white text-2xl font-bold">{formatCurrency(summary.totalInvestment)}</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-white font-semibold">{formatHours(summary.totalHours)}</p>
              <p className="text-white/50 text-xs">Time</p>
            </div>
            <div className="text-center">
              <p className="text-white font-semibold">{summary.totalSessions}</p>
              <p className="text-white/50 text-xs">Sessions</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full variant
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-pink-900/40 via-purple-900/40 to-indigo-900/40 rounded-2xl" />

      {/* Animated sparkles */}
      {showAnimation && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
          <Sparkles className="absolute top-4 right-4 w-6 h-6 text-pink-400/30 animate-pulse" />
          <Sparkles className="absolute bottom-8 left-8 w-4 h-4 text-purple-400/30 animate-pulse delay-300" />
        </div>
      )}

      <div className="relative p-6 border border-pink-500/20 rounded-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Heart className="w-5 h-5 text-pink-400 fill-pink-400" />
            <span className="text-pink-400 text-sm font-medium uppercase tracking-wider">
              You've Invested in Her
            </span>
            <Heart className="w-5 h-5 text-pink-400 fill-pink-400" />
          </div>
          <p className="text-white text-4xl font-bold mb-1">
            {formatCurrency(summary.totalInvestment)}
          </p>
          <p className="text-white/60 text-sm">
            over {summary.daysSinceStart} days of transformation
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Time Invested"
            value={formatHours(summary.totalHours)}
            sublabel={`${summary.totalSessions} sessions`}
            color="text-blue-400"
          />
          <StatCard
            icon={<Flame className="w-5 h-5" />}
            label="Total Edges"
            value={summary.totalEdges.toLocaleString()}
            sublabel="moments of control"
            color="text-red-400"
          />
          <StatCard
            icon={<Heart className="w-5 h-5" />}
            label="Commitments"
            value={summary.totalCommitments.toString()}
            sublabel="promises kept"
            color="text-pink-400"
          />
          <StatCard
            icon={<Camera className="w-5 h-5" />}
            label="Evidence"
            value={summary.evidenceCount.toString()}
            sublabel="pieces captured"
            color="text-purple-400"
          />
        </div>

        {/* Milestones */}
        {summary.milestonesAchieved > 0 && (
          <div className="flex items-center justify-center gap-2 p-3 bg-white/5 rounded-xl">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span className="text-white/80 text-sm">
              <strong className="text-amber-400">{summary.milestonesAchieved}</strong> milestones achieved
            </span>
          </div>
        )}

        {/* Total Value Score */}
        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-white/60 text-xs">Total Investment Value</span>
          </div>
          <span className="text-green-400 font-bold">{totalValue.toLocaleString()} pts</span>
        </div>

        {/* Ratchet message */}
        <div className="mt-4 text-center">
          <p className="text-white/50 text-xs italic">
            "Stopping now means watching all of this decay. She's worth protecting."
          </p>
        </div>
      </div>
    </div>
  );
}

// Stat card component
function StatCard({
  icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  color: string;
}) {
  return (
    <div className="bg-white/5 rounded-xl p-4">
      <div className={`flex items-center gap-2 mb-2 ${color}`}>
        {icon}
        <span className="text-xs font-medium text-white/70">{label}</span>
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
      <p className="text-white/50 text-xs">{sublabel}</p>
    </div>
  );
}

// Hook to get framing message based on investment level
export function useSunkCostMessage(): string {
  const { summary } = useSunkCost();

  return useMemo(() => {
    if (!summary) return "Every step forward builds momentum.";

    const total = summary.totalInvestment;
    const hours = summary.totalHours;
    const days = summary.daysSinceStart;

    if (total >= 500 && hours >= 50) {
      return `${formatCurrency(total)} and ${Math.round(hours)} hours invested. She's real now. Protect her.`;
    }
    if (total >= 200 || hours >= 20) {
      return `${formatCurrency(total)} already invested. Every dollar brings her closer to reality.`;
    }
    if (days >= 30) {
      return `${days} days of consistent work. This momentum is too valuable to lose.`;
    }
    if (summary.totalSessions >= 10) {
      return `${summary.totalSessions} sessions completed. The practice is becoming who you are.`;
    }

    return "Every step forward builds the evidence of who you really are.";
  }, [summary]);
}

// Helper to format currency (for external use)
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default SunkCostDisplay;
