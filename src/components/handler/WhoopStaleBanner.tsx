/**
 * WhoopStaleBanner — shows a reauth prompt when Whoop hasn't synced in
 * 48+ hours (token likely expired). Tapping Connect reopens the OAuth
 * flow. Hidden entirely when data is fresh.
 */

import { Activity, RefreshCw } from 'lucide-react';
import { useWhoop } from '../../hooks/useWhoop';

export function WhoopStaleBanner() {
  const { isConnected, lastSynced, connect, sync, isSyncing } = useWhoop();

  const staleHours = lastSynced
    ? Math.round((Date.now() - lastSynced.getTime()) / 3600000)
    : null;

  if (isConnected && staleHours !== null && staleHours < 48) return null;

  const needsReauth = !isConnected || (staleHours !== null && staleHours >= 48);
  if (!needsReauth) return null;

  return (
    <div className="bg-gray-900/60 border border-yellow-500/40 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-3 h-3 text-yellow-400" />
        <span className="uppercase tracking-wider text-[10px] text-gray-500">Whoop {isConnected ? 'Stale' : 'Disconnected'}</span>
        {staleHours !== null && (
          <span className="text-[10px] text-yellow-400">{staleHours}h old</span>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mb-2">
        {isConnected
          ? 'Recovery + sleep data is stale. Handler is flying blind on biometric prescriptions.'
          : 'Connect Whoop so the Handler can read recovery + sleep + strain.'}
      </p>
      <div className="flex gap-1">
        <button
          onClick={connect}
          className="flex-1 py-1.5 rounded bg-yellow-500/25 hover:bg-yellow-500/40 text-yellow-300 text-[11px] font-medium"
        >
          {isConnected ? 'Re-authorize' : 'Connect'}
        </button>
        {isConnected && (
          <button
            onClick={sync}
            disabled={isSyncing}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 inline ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
}
