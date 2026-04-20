/**
 * Force Status Strip
 *
 * Always-visible condensed state for the main Protocol tab: Hard Mode,
 * chastity, overdue punishments, overdue disclosure, slip points.
 * Tapping any pill navigates to Menu → Force Layer.
 */

import { useAuth } from '../../context/AuthContext';
import { useForceLayerState } from '../../hooks/useForceLayerState';
import { Flame, Lock, AlertTriangle, MessageSquareWarning } from 'lucide-react';

interface Props {
  onNavigate: () => void;
}

export function ForceStatusStrip({ onNavigate }: Props) {
  const { user } = useAuth();
  const { state } = useForceLayerState(user?.id);

  if (state.loading) return null;

  const overduePunishments = state.queuedPunishments.filter(p => p.overdue).length;
  const queuedPunishments = state.queuedPunishments.length - overduePunishments;
  const slipPct = Math.min(100, Math.round((state.slipPoints24h / state.slipPointsThreshold) * 100));

  // Don't render if nothing to show
  const hasAnything =
    state.hardModeActive ||
    state.chastityLocked ||
    overduePunishments > 0 ||
    queuedPunishments > 0 ||
    state.overdueDisclosure ||
    state.slipPoints24h >= 5;

  if (!hasAnything) return null;

  return (
    <button
      onClick={onNavigate}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs overflow-x-auto whitespace-nowrap border-b ${
        state.hardModeActive ? 'bg-red-950/40 border-red-500/40' : 'bg-protocol-surface border-protocol-border'
      }`}
    >
      {state.hardModeActive && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-900/60 text-red-200 font-semibold">
          <Flame className="w-3 h-3" /> HARD MODE
        </span>
      )}

      {state.chastityLocked && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-900/40 text-purple-200">
          <Lock className="w-3 h-3" />
          day {state.chastityStreak}
        </span>
      )}

      {overduePunishments > 0 && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-900/50 text-red-200">
          <AlertTriangle className="w-3 h-3" />
          {overduePunishments} overdue
        </span>
      )}

      {queuedPunishments > 0 && !overduePunishments && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-900/40 text-amber-200">
          <AlertTriangle className="w-3 h-3" />
          {queuedPunishments} queued
        </span>
      )}

      {state.overdueDisclosure && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-pink-900/40 text-pink-200">
          <MessageSquareWarning className="w-3 h-3" />
          rung {state.overdueDisclosure.rung} overdue
        </span>
      )}

      {!state.hardModeActive && state.slipPoints24h >= 5 && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 text-gray-300">
          slips {state.slipPoints24h}/{state.slipPointsThreshold} ({slipPct}%)
        </span>
      )}

      <span className="ml-auto text-[10px] text-gray-500">tap →</span>
    </button>
  );
}
