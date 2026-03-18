/**
 * WhoopCard — Settings card for Whoop integration.
 * Connect/disconnect, sync status, and latest metrics preview.
 */

import { Activity, RefreshCw, Unlink, Loader2 } from 'lucide-react';
import { useWhoop } from '../../hooks/useWhoop';
import { useBambiMode } from '../../context/BambiModeContext';

export function WhoopCard() {
  const { isBambiMode } = useBambiMode();
  const { isConnected, isLoading, isSyncing, snapshot, lastSynced, connect, disconnect, sync } = useWhoop();

  if (isLoading) {
    return (
      <div className={`rounded-xl p-4 ${isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-400">Checking Whoop connection...</span>
        </div>
      </div>
    );
  }

  const recoveryColor = snapshot?.recovery
    ? snapshot.recovery.score >= 67 ? 'text-green-400' : snapshot.recovery.score >= 34 ? 'text-yellow-400' : 'text-red-400'
    : 'text-gray-400';

  const recoveryDot = snapshot?.recovery
    ? snapshot.recovery.score >= 67 ? 'bg-green-400' : snapshot.recovery.score >= 34 ? 'bg-yellow-400' : 'bg-red-400'
    : '';

  return (
    <div className={`rounded-xl p-4 space-y-3 ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
          <span className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            Whoop Integration
          </span>
        </div>
        {isConnected && (
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${recoveryDot || 'bg-green-400'}`} />
            <span className="text-xs text-green-400">Connected</span>
          </div>
        )}
      </div>

      {!isConnected ? (
        <>
          <p className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
            Connect your Whoop to let the Handler see your recovery, sleep, and strain data for smarter prescriptions.
          </p>
          <button
            onClick={connect}
            className={`w-full py-3 rounded-xl font-medium transition-all ${
              isBambiMode
                ? 'bg-pink-500 hover:bg-pink-600 text-white'
                : 'bg-protocol-accent hover:bg-protocol-accent-bright text-white'
            }`}
          >
            Connect Whoop
          </button>
        </>
      ) : (
        <>
          {/* Metrics preview */}
          {snapshot?.recovery && (
            <div className="grid grid-cols-3 gap-2">
              <MetricPill
                label="Recovery"
                value={`${snapshot.recovery.score}%`}
                colorClass={recoveryColor}
                isBambiMode={isBambiMode}
              />
              {snapshot.sleep && (
                <MetricPill
                  label="Sleep"
                  value={`${snapshot.sleep.performance.toFixed(0)}%`}
                  colorClass="text-blue-400"
                  isBambiMode={isBambiMode}
                />
              )}
              {snapshot.strain && (
                <MetricPill
                  label="Strain"
                  value={snapshot.strain.dayStrain.toFixed(1)}
                  colorClass="text-orange-400"
                  isBambiMode={isBambiMode}
                />
              )}
            </div>
          )}

          {/* Last synced */}
          {lastSynced && (
            <p className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
              Last synced: {formatTimeSince(lastSynced)}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={sync}
              disabled={isSyncing}
              className={`flex-1 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                isBambiMode
                  ? 'bg-pink-100 hover:bg-pink-200 text-pink-600'
                  : 'bg-protocol-surface-light hover:bg-protocol-border text-protocol-text'
              } ${isSyncing ? 'opacity-50' : ''}`}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              onClick={disconnect}
              className={`py-2.5 px-4 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
                isBambiMode
                  ? 'bg-red-50 hover:bg-red-100 text-red-500'
                  : 'bg-red-900/20 hover:bg-red-900/30 text-red-400'
              }`}
            >
              <Unlink className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MetricPill({ label, value, colorClass, isBambiMode }: {
  label: string;
  value: string;
  colorClass: string;
  isBambiMode: boolean;
}) {
  return (
    <div className={`rounded-lg p-2 text-center ${
      isBambiMode ? 'bg-white' : 'bg-protocol-bg'
    }`}>
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
      <div className={`text-[10px] uppercase tracking-wider ${
        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
      }`}>{label}</div>
    </div>
  );
}

function formatTimeSince(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}
