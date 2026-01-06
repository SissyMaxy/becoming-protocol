/**
 * Guy Mode View
 * Main view for tracking and managing guy mode
 */

import { useState } from 'react';
import { User, Plus, Loader2, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useGuyMode } from '../../hooks/useGuyMode';
import { GuyModeStatsCard } from './GuyModeStatsCard';
import { CapabilityAtrophyCard } from './CapabilityAtrophyCard';
import { LogGuyModeModal } from './LogGuyModeModal';

export function GuyModeView() {
  const { isBambiMode } = useBambiMode();
  const {
    stats,
    capabilities,
    isLoading,
    error,
    activePrompt,
    atrophyMilestones,
    lastPenalty,
    logEvent,
    refreshStats,
    acknowledgeCapabilityAtrophy,
    dismissPrompt,
    dismissMilestones,
    dismissPenalty,
  } = useGuyMode();

  const [showLogModal, setShowLogModal] = useState(false);

  const handleLogEvent = async (
    eventType: Parameters<typeof logEvent>[0],
    durationMinutes?: number,
    notes?: string
  ) => {
    await logEvent(eventType, durationMinutes, notes);
    setShowLogModal(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className={`w-8 h-8 animate-spin ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
        }`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-protocol-danger" />
        <p className="text-protocol-danger mb-4">{error}</p>
        <button
          onClick={refreshStats}
          className={`px-4 py-2 rounded-lg font-medium ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600'
              : 'bg-protocol-surface text-protocol-text'
          }`}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}>
            <User className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`} />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Guy Mode
            </h2>
            <p className="text-xs text-protocol-text-muted">
              Track masculine presentation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshStats}
            className="p-2 rounded-lg hover:bg-protocol-surface transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-protocol-text-muted" />
          </button>
          <button
            onClick={() => setShowLogModal(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
              isBambiMode
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Log Event</span>
          </button>
        </div>
      </div>

      {/* Active prompt */}
      {activePrompt && (
        <div className={`p-4 rounded-xl border-l-4 ${
          isBambiMode
            ? 'bg-pink-50 border-pink-400'
            : 'bg-protocol-surface border-protocol-accent'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <p className={`text-sm italic ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              "{activePrompt}"
            </p>
            <button
              onClick={dismissPrompt}
              className={`p-1 rounded hover:bg-black/10 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Penalty notification */}
      {lastPenalty && (
        <div className={`p-4 rounded-xl ${
          isBambiMode ? 'bg-amber-50 border border-amber-200' : 'bg-amber-900/20 border border-amber-600/30'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className={`text-sm font-medium ${
                  isBambiMode ? 'text-amber-700' : 'text-amber-400'
                }`}>
                  Penalty Applied
                </span>
              </div>
              <p className={`text-sm ${
                isBambiMode ? 'text-amber-600' : 'text-amber-400/80'
              }`}>
                {lastPenalty.description}
              </p>
              {lastPenalty.edgeDebt && (
                <p className={`text-xs mt-1 ${
                  isBambiMode ? 'text-amber-500' : 'text-amber-400/60'
                }`}>
                  +{lastPenalty.edgeDebt} edge debt
                </p>
              )}
            </div>
            <button
              onClick={dismissPenalty}
              className={`p-1 rounded hover:bg-black/10 ${
                isBambiMode ? 'text-amber-400' : 'text-amber-400/60'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Atrophy milestones */}
      {atrophyMilestones.length > 0 && (
        <div className={`p-4 rounded-xl ${
          isBambiMode ? 'bg-emerald-50 border border-emerald-200' : 'bg-emerald-900/20 border border-emerald-600/30'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={`text-sm font-medium ${
                isBambiMode ? 'text-emerald-700' : 'text-emerald-400'
              }`}>
                Milestone Reached
              </span>
              {atrophyMilestones.map((m, i) => (
                <p key={i} className={`text-sm mt-1 ${
                  isBambiMode ? 'text-emerald-600' : 'text-emerald-400/80'
                }`}>
                  {m.message}
                </p>
              ))}
            </div>
            <button
              onClick={dismissMilestones}
              className={`p-1 rounded hover:bg-black/10 ${
                isBambiMode ? 'text-emerald-400' : 'text-emerald-400/60'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Stats card */}
      {stats && <GuyModeStatsCard stats={stats} />}

      {/* Capability atrophy */}
      {capabilities.length > 0 && (
        <CapabilityAtrophyCard
          capabilities={capabilities}
          onAcknowledge={acknowledgeCapabilityAtrophy}
        />
      )}

      {/* Info card */}
      <div className={`p-4 rounded-xl ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}>
        <p className={`text-sm ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          Guy mode is tracked to help you notice patterns and celebrate progress.
          Less time in costume mode means more time as yourself.
        </p>
      </div>

      {/* Log modal */}
      {showLogModal && (
        <LogGuyModeModal
          onLogEvent={handleLogEvent}
          onClose={() => setShowLogModal(false)}
        />
      )}
    </div>
  );
}

/**
 * Compact preview for dashboard
 */
export function GuyModePreview() {
  const { isBambiMode } = useBambiMode();
  const { stats, capabilities } = useGuyMode();

  if (!stats) {
    return null;
  }

  const atrophyingCount = capabilities.filter(c => c.comfortLevel <= 50).length;

  return (
    <div className={`p-4 rounded-xl ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <User className={`w-4 h-4 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`} />
        <span className={`text-sm font-semibold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          Guy Mode
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className={`text-2xl font-bold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            {stats.guyModeHoursThisWeek.toFixed(1)}h
          </p>
          <p className="text-xs text-protocol-text-muted">this week</p>
        </div>

        {stats.guyModeRatioTrend === 'decreasing' && (
          <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            isBambiMode
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-emerald-900/20 text-emerald-400'
          }`}>
            Decreasing
          </div>
        )}
      </div>

      {atrophyingCount > 0 && (
        <div className="mt-3 pt-3 border-t border-protocol-border">
          <div className={`flex items-center gap-1.5 text-xs ${
            isBambiMode ? 'text-emerald-600' : 'text-emerald-400'
          }`}>
            <span>{atrophyingCount} capabilities fading</span>
          </div>
        </div>
      )}
    </div>
  );
}
