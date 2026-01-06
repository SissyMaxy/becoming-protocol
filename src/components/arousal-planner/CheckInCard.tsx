/**
 * Check-In Card
 * Shows a scheduled check-in with status
 */

import { Bell, Check, Clock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { ArousalCheckIn } from '../../types/arousal-planner';

interface CheckInCardProps {
  checkIn: ArousalCheckIn;
  onOpenModal: () => void;
  isNext?: boolean;
}

export function CheckInCard({
  checkIn,
  onOpenModal,
  isNext = false,
}: CheckInCardProps) {
  const { isBambiMode } = useBambiMode();

  // Status styles
  const statusStyles = {
    scheduled: isBambiMode
      ? 'bg-white border-blue-200 hover:border-blue-300'
      : 'bg-protocol-surface border-blue-500/30 hover:border-blue-500/50',
    completed: isBambiMode
      ? 'bg-green-50 border-green-200'
      : 'bg-green-900/20 border-green-500/30',
    skipped: isBambiMode
      ? 'bg-gray-50 border-gray-200 opacity-60'
      : 'bg-gray-800/50 border-gray-600 opacity-60',
    missed: isBambiMode
      ? 'bg-red-50 border-red-200 opacity-60'
      : 'bg-red-900/20 border-red-600/50 opacity-60',
    started: isBambiMode
      ? 'bg-blue-50 border-blue-300'
      : 'bg-blue-900/20 border-blue-500/50',
  };

  // Check-in type labels
  const typeLabels = {
    morning: 'Morning Check-In',
    midday: 'Midday Check-In',
    evening: 'Evening Check-In',
    post_session: 'Post-Session Check-In',
  };

  const isActionable = checkIn.status === 'scheduled';

  return (
    <button
      onClick={isActionable ? onOpenModal : undefined}
      disabled={!isActionable}
      className={`w-full rounded-xl border p-3 transition-all text-left ${
        statusStyles[checkIn.status]
      } ${isNext && isActionable ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className={`p-2 rounded-lg ${
          checkIn.status === 'completed'
            ? isBambiMode ? 'bg-green-100' : 'bg-green-900/30'
            : isBambiMode ? 'bg-blue-100' : 'bg-blue-900/30'
        }`}>
          {checkIn.status === 'completed' ? (
            <Check className={`w-4 h-4 ${isBambiMode ? 'text-green-600' : 'text-green-400'}`} />
          ) : (
            <Bell className={`w-4 h-4 ${isBambiMode ? 'text-blue-600' : 'text-blue-400'}`} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${
              isBambiMode ? 'text-gray-800' : 'text-protocol-text'
            }`}>
              {typeLabels[checkIn.checkInType]}
            </span>
            <div className="flex items-center gap-1 text-xs">
              <Clock className={`w-3 h-3 ${
                isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
              }`} />
              <span className={isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}>
                {checkIn.scheduledTime}
              </span>
            </div>
          </div>

          {/* Completed info */}
          {checkIn.status === 'completed' && checkIn.arousalLevel && (
            <p className={`text-sm mt-0.5 ${
              isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
            }`}>
              Arousal: {checkIn.arousalLevel}/10 | State: {checkIn.stateReported}
            </p>
          )}
        </div>

        {/* Action indicator */}
        {isActionable && (
          <div className={`text-xs font-medium px-2 py-1 rounded ${
            isBambiMode ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
          }`}>
            Check In
          </div>
        )}
      </div>
    </button>
  );
}
