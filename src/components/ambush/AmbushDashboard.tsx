/**
 * AmbushDashboard.tsx
 *
 * Dashboard view showing today's scheduled ambushes and completion stats.
 */

import { useAmbushContext } from './AmbushProvider';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  Clock,
  Check,
  X,
  AlarmClock,
  Target,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { AMBUSH_TYPE_CONFIG, type AmbushStatus } from '../../types/scheduled-ambush';

export function AmbushDashboard() {
  const { todaysAmbushes, todaysStats, isLoading, refresh, scheduleToday } = useAmbushContext();
  const { isBambiMode } = useBambiMode();

  const handleSchedule = async () => {
    await scheduleToday();
  };

  const getStatusIcon = (status: AmbushStatus) => {
    switch (status) {
      case 'completed':
        return <Check className="w-4 h-4 text-green-400" />;
      case 'missed':
        return <X className="w-4 h-4 text-red-400" />;
      case 'snoozed':
        return <AlarmClock className="w-4 h-4 text-amber-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: AmbushStatus) => {
    switch (status) {
      case 'completed':
        return isBambiMode ? 'bg-green-500/20 border-green-500/30' : 'bg-green-900/30 border-green-700/50';
      case 'missed':
        return isBambiMode ? 'bg-red-500/20 border-red-500/30' : 'bg-red-900/30 border-red-700/50';
      case 'snoozed':
        return isBambiMode ? 'bg-amber-500/20 border-amber-500/30' : 'bg-amber-900/30 border-amber-700/50';
      default:
        return isBambiMode ? 'bg-pink-900/20 border-pink-700/30' : 'bg-gray-800/50 border-gray-700/50';
    }
  };

  if (isLoading) {
    return (
      <div className={`p-6 rounded-2xl ${
        isBambiMode ? 'bg-pink-900/30 border border-pink-500/30' : 'bg-gray-800/50 border border-gray-700'
      }`}>
        <div className="animate-pulse space-y-4">
          <div className={`h-6 w-1/3 rounded ${isBambiMode ? 'bg-pink-800' : 'bg-gray-700'}`} />
          <div className={`h-20 rounded ${isBambiMode ? 'bg-pink-800/50' : 'bg-gray-700/50'}`} />
          <div className={`h-20 rounded ${isBambiMode ? 'bg-pink-800/50' : 'bg-gray-700/50'}`} />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-2xl space-y-6 ${
      isBambiMode
        ? 'bg-gradient-to-br from-pink-900/40 to-fuchsia-900/40 border border-pink-500/30'
        : 'bg-gray-800/50 border border-gray-700'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target className={`w-6 h-6 ${isBambiMode ? 'text-pink-400' : 'text-white'}`} />
          <h2 className={`text-xl font-bold ${isBambiMode ? 'text-pink-100' : 'text-white'}`}>
            Today's Ambushes
          </h2>
        </div>
        <button
          onClick={refresh}
          className={`p-2 rounded-lg transition-colors ${
            isBambiMode
              ? 'hover:bg-pink-800/50 text-pink-300'
              : 'hover:bg-gray-700 text-gray-400'
          }`}
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Stats */}
      {todaysStats && (
        <div className="grid grid-cols-3 gap-4">
          <div className={`p-4 rounded-xl text-center ${
            isBambiMode ? 'bg-pink-800/30' : 'bg-gray-700/30'
          }`}>
            <div className={`text-2xl font-bold ${isBambiMode ? 'text-pink-200' : 'text-white'}`}>
              {todaysStats.completed}/{todaysStats.total_scheduled}
            </div>
            <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-400'}`}>
              Completed
            </div>
          </div>
          <div className={`p-4 rounded-xl text-center ${
            isBambiMode ? 'bg-pink-800/30' : 'bg-gray-700/30'
          }`}>
            <div className={`text-2xl font-bold ${
              todaysStats.completion_rate >= 0.8
                ? 'text-green-400'
                : todaysStats.completion_rate >= 0.5
                  ? 'text-amber-400'
                  : 'text-red-400'
            }`}>
              {Math.round(todaysStats.completion_rate * 100)}%
            </div>
            <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-400'}`}>
              Rate
            </div>
          </div>
          <div className={`p-4 rounded-xl text-center ${
            isBambiMode ? 'bg-pink-800/30' : 'bg-gray-700/30'
          }`}>
            <div className={`text-2xl font-bold ${isBambiMode ? 'text-pink-200' : 'text-white'}`}>
              {todaysStats.avg_response_time_seconds > 0
                ? `${todaysStats.avg_response_time_seconds}s`
                : '-'}
            </div>
            <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-400'}`}>
              Avg Response
            </div>
          </div>
        </div>
      )}

      {/* Ambush list */}
      {todaysAmbushes.length === 0 ? (
        <div className={`text-center py-8 ${isBambiMode ? 'text-pink-300' : 'text-gray-400'}`}>
          <AlarmClock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="mb-4">No ambushes scheduled for today</p>
          <button
            onClick={handleSchedule}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              isBambiMode
                ? 'bg-pink-600 hover:bg-pink-500 text-white'
                : 'bg-white hover:bg-gray-100 text-black'
            }`}
          >
            Schedule Now
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {todaysAmbushes.map((ambush) => {
            const template = ambush.template;
            const typeConfig = template ? AMBUSH_TYPE_CONFIG[template.type] : null;

            return (
              <div
                key={ambush.id}
                className={`p-4 rounded-xl border transition-colors ${getStatusColor(ambush.status)}`}
              >
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    ambush.status === 'completed'
                      ? 'bg-green-500/30'
                      : ambush.status === 'missed'
                        ? 'bg-red-500/30'
                        : isBambiMode ? 'bg-pink-800/50' : 'bg-gray-700/50'
                  }`}>
                    {getStatusIcon(ambush.status)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{typeConfig?.icon || '✨'}</span>
                      <span className={`font-medium truncate ${
                        isBambiMode ? 'text-pink-100' : 'text-white'
                      }`}>
                        {typeConfig?.label || 'Task'}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${
                      isBambiMode ? 'text-pink-300' : 'text-gray-400'
                    }`}>
                      {template?.instruction || 'Micro-task'}
                    </p>
                  </div>

                  {/* Time */}
                  <div className={`text-sm font-mono ${
                    isBambiMode ? 'text-pink-400' : 'text-gray-500'
                  }`}>
                    {ambush.scheduled_time.slice(0, 5)}
                  </div>
                </div>

                {/* Response time if completed */}
                {ambush.status === 'completed' && ambush.response_time_seconds && (
                  <div className={`mt-2 flex items-center gap-1 text-xs ${
                    isBambiMode ? 'text-pink-400' : 'text-gray-500'
                  }`}>
                    <TrendingUp className="w-3 h-3" />
                    Completed in {ambush.response_time_seconds}s
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
