/**
 * Ambient Pressure Strip
 *
 * Always-visible indicators that create constant awareness:
 * - Denial day counter
 * - Streak days
 * - Vault item count
 * - Active threat countdown
 * - Unread partner messages
 * - Point of no return percentage
 */

import { Flame, Lock, Clock, MessageCircle, TrendingUp } from 'lucide-react';

interface AmbientPressureStripProps {
  denialDay: number;
  streakDays: number;
  vaultItemCount: number;
  activeTheatDeadline?: string; // ISO timestamp
  unreadPartnerMessages: number;
  pointOfNoReturnPercent: number;
}

export function AmbientPressureStrip({
  denialDay,
  streakDays,
  vaultItemCount,
  activeTheatDeadline,
  unreadPartnerMessages,
  pointOfNoReturnPercent,
}: AmbientPressureStripProps) {
  // Calculate time remaining for active threat
  const threatTimeRemaining = activeTheatDeadline
    ? getTimeRemaining(activeTheatDeadline)
    : null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-protocol-surface/50 border-b border-protocol-border/50">
      {/* Denial Day */}
      <div className="flex items-center gap-1.5 text-xs">
        <Flame className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-protocol-text-muted">Day</span>
        <span className="font-mono font-semibold text-amber-500">{denialDay}</span>
      </div>

      {/* Streak */}
      <div className="flex items-center gap-1.5 text-xs">
        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
        <span className="font-mono font-semibold text-emerald-500">{streakDays}</span>
      </div>

      {/* Vault Count */}
      {vaultItemCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          <Lock className="w-3.5 h-3.5 text-red-400" />
          <span className="font-mono font-semibold text-red-400">{vaultItemCount}</span>
        </div>
      )}

      {/* Active Threat Countdown */}
      {threatTimeRemaining && (
        <div className="flex items-center gap-1.5 text-xs animate-pulse">
          <Clock className="w-3.5 h-3.5 text-red-500" />
          <span className="font-mono font-semibold text-red-500">{threatTimeRemaining}</span>
        </div>
      )}

      {/* Unread Partner Messages */}
      {unreadPartnerMessages > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          <MessageCircle className="w-3.5 h-3.5 text-pink-400" />
          <span className="font-mono font-semibold text-pink-400">{unreadPartnerMessages}</span>
        </div>
      )}

      {/* Point of No Return */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-protocol-text-muted">PNR</span>
        <span className={`font-mono font-semibold ${
          pointOfNoReturnPercent >= 75 ? 'text-protocol-accent' :
          pointOfNoReturnPercent >= 50 ? 'text-amber-500' :
          'text-protocol-text-muted'
        }`}>
          {pointOfNoReturnPercent}%
        </span>
      </div>
    </div>
  );
}

function getTimeRemaining(deadline: string): string {
  const now = Date.now();
  const end = new Date(deadline).getTime();
  const diff = end - now;

  if (diff <= 0) return 'NOW';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
