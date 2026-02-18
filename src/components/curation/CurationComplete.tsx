/**
 * Curation Complete
 *
 * Shows session summary when curation is finished.
 */

import { CheckCircle, Layers, ArrowRight } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { CurationSession } from '../../types/task-curation';

interface CurationCompleteProps {
  session: CurationSession;
  onViewCurated: () => void;
  onCurateMore: () => void;
  hasMoreTasks: boolean;
}

export function CurationComplete({
  session,
  onViewCurated,
  onCurateMore,
  hasMoreTasks,
}: CurationCompleteProps) {
  const { isBambiMode } = useBambiMode();

  const total = session.tasksKept + session.tasksRejected + session.tasksNeedsWork;
  const keepRate = total > 0 ? Math.round((session.tasksKept / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      {/* Success icon */}
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
          isBambiMode
            ? 'bg-pink-100'
            : 'bg-green-100'
        }`}
      >
        <CheckCircle
          className={`w-10 h-10 ${
            isBambiMode ? 'text-pink-500' : 'text-green-500'
          }`}
        />
      </div>

      {/* Title */}
      <h2
        className={`text-2xl font-bold mb-2 ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}
      >
        {session.endingReason === 'exhausted'
          ? 'All Tasks Evaluated!'
          : 'Session Complete!'}
      </h2>

      <p
        className={`text-sm mb-8 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}
      >
        {session.endingReason === 'exhausted'
          ? "You've reviewed all available tasks."
          : 'Great progress on building your task bank.'}
      </p>

      {/* Stats */}
      <div
        className={`w-full max-w-sm p-6 rounded-2xl mb-8 ${
          isBambiMode
            ? 'bg-white border border-pink-200'
            : 'bg-protocol-surface'
        }`}
      >
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <p
              className={`text-3xl font-bold ${
                isBambiMode ? 'text-green-500' : 'text-green-500'
              }`}
            >
              {session.tasksKept}
            </p>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              Kept
            </p>
          </div>
          <div>
            <p
              className={`text-3xl font-bold ${
                isBambiMode ? 'text-red-400' : 'text-red-500'
              }`}
            >
              {session.tasksRejected}
            </p>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              Rejected
            </p>
          </div>
          <div>
            <p
              className={`text-3xl font-bold ${
                isBambiMode ? 'text-blue-400' : 'text-blue-500'
              }`}
            >
              {session.tasksNeedsWork}
            </p>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              Flagged
            </p>
          </div>
        </div>

        <div
          className={`pt-4 border-t ${
            isBambiMode ? 'border-pink-100' : 'border-protocol-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-sm ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Keep Rate
            </span>
            <span
              className={`text-lg font-bold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {keepRate}%
            </span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span
              className={`text-sm ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Max Intensity
            </span>
            <span
              className={`text-lg font-bold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Level {session.maxIntensityReached}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={onViewCurated}
          className={`w-full py-4 px-6 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
            isBambiMode
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
          }`}
        >
          <Layers className="w-5 h-5" />
          View Curated Tasks
        </button>

        {hasMoreTasks && (
          <button
            onClick={onCurateMore}
            className={`w-full py-4 px-6 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
              isBambiMode
                ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
            }`}
          >
            Curate More Tasks
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
