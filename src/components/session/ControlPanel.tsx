/**
 * ControlPanel — Bottom control bar with Stop and Breathe buttons.
 * Includes inline stop confirmation dialog.
 */

import { Square, Wind } from 'lucide-react';
import { SESSION_COLORS } from './session-types';

interface ControlPanelProps {
  edgeCount: number;
  targetEdges: number;
  isRecovering: boolean;
  showStopConfirm: boolean;
  onStop: () => void;
  onConfirmStop: () => void;
  onCancelStop: () => void;
  onBreathe: () => void;
}

export function ControlPanel({
  edgeCount,
  targetEdges,
  isRecovering,
  showStopConfirm,
  onStop,
  onConfirmStop,
  onCancelStop,
  onBreathe,
}: ControlPanelProps) {
  return (
    <div className="px-4 pb-8 pt-4">
      {/* Stop confirmation */}
      {showStopConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 pb-4 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 p-6 text-center">
            <p className="text-white font-semibold text-lg mb-2">End session?</p>
            <p className="text-gray-400 text-sm mb-6">
              {edgeCount}/{targetEdges} edges completed. Your progress will be saved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancelStop}
                className="flex-1 py-3 rounded-xl font-medium text-white"
                style={{ backgroundColor: SESSION_COLORS.purple }}
              >
                Keep Going
              </button>
              <button
                onClick={onConfirmStop}
                className="flex-1 py-3 rounded-xl font-medium bg-red-600 text-white"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Control buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={onStop}
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
        >
          <Square className="w-4 h-4" />
          Stop
        </button>

        <button
          onClick={onBreathe}
          disabled={isRecovering}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
            isRecovering
              ? 'text-white/20 cursor-not-allowed'
              : 'text-white/60 hover:text-white/90 hover:bg-white/5'
          }`}
        >
          <Wind className="w-4 h-4" />
          Breathe
        </button>
      </div>
    </div>
  );
}
