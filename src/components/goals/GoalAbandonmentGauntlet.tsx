// Goal Abandonment Gauntlet
// Multi-step friction to prevent impulsive goal abandonment

import { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Target,
  Flame,
  ChevronRight,
  X,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { Goal } from '../../types/goals';
import { getDomainLabel, getDomainColor } from '../../types/goals';

interface GoalAbandonmentGauntletProps {
  goal: Goal;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

export function GoalAbandonmentGauntlet({
  goal,
  onConfirm,
  onCancel,
}: GoalAbandonmentGauntletProps) {
  const { isBambiMode } = useBambiMode();
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const domainColor = getDomainColor(goal.domain);
  const daysSinceStart = Math.floor(
    (Date.now() - new Date(goal.startedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const requiredConfirmText = `I am abandoning ${goal.name}`;

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleConfirm = async () => {
    if (confirmText !== requiredConfirmText || !reason.trim()) return;

    setSubmitting(true);
    try {
      await onConfirm(reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div
        className={`w-full max-w-md rounded-xl overflow-hidden ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b ${
            isBambiMode
              ? 'bg-red-50 border-red-200'
              : 'bg-red-900/20 border-red-900/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={isBambiMode ? 'text-red-500' : 'text-red-400'}
              />
              <h2
                className={`font-semibold ${
                  isBambiMode ? 'text-red-700' : 'text-red-400'
                }`}
              >
                Abandoning Goal
              </h2>
            </div>
            <button
              onClick={onCancel}
              className={`p-1 rounded ${
                isBambiMode
                  ? 'text-red-400 hover:bg-red-100'
                  : 'text-red-400 hover:bg-red-900/20'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2 mt-3">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  s <= step
                    ? isBambiMode
                      ? 'bg-red-500'
                      : 'bg-red-400'
                    : isBambiMode
                    ? 'bg-red-200'
                    : 'bg-red-900/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Step 1: Show Progress */}
          {step === 1 && (
            <div className="space-y-4">
              <p
                className={`text-center ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Look at what you've built:
              </p>

              <div
                className={`rounded-lg p-4 ${
                  isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface-light'
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${domainColor}20` }}
                  >
                    <Target className="w-5 h-5" style={{ color: domainColor }} />
                  </div>
                  <div>
                    <h3
                      className={`font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      {goal.name}
                    </h3>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${domainColor}20`,
                        color: domainColor,
                      }}
                    >
                      {getDomainLabel(goal.domain)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <Calendar
                        className={`w-4 h-4 ${
                          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                        }`}
                      />
                    </div>
                    <p
                      className={`text-lg font-bold ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      {daysSinceStart}
                    </p>
                    <p
                      className={`text-xs ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    >
                      Days Pursuing
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <Target
                        className={`w-4 h-4 ${
                          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                        }`}
                      />
                    </div>
                    <p
                      className={`text-lg font-bold ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      {goal.totalCompletions}
                    </p>
                    <p
                      className={`text-xs ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    >
                      Completions
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <Flame
                        className={`w-4 h-4 ${
                          isBambiMode ? 'text-orange-400' : 'text-orange-400'
                        }`}
                      />
                    </div>
                    <p
                      className={`text-lg font-bold ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      {goal.longestStreak}
                    </p>
                    <p
                      className={`text-xs ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    >
                      Best Streak
                    </p>
                  </div>
                </div>
              </div>

              <p
                className={`text-center text-sm ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                You were {Math.round((goal.consecutiveDays / goal.graduationThreshold) * 100)}%
                of the way to making this automatic.
              </p>
            </div>
          )}

          {/* Step 2: Require Explanation */}
          {step === 2 && (
            <div className="space-y-4">
              <p
                className={`text-center ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                What changed?
              </p>

              <p
                className={`text-center text-sm ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                When you started this goal, you believed it was important. Help your
                future self understand why you're stopping.
              </p>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you abandoning this goal?"
                rows={4}
                className={`w-full px-4 py-3 rounded-lg border resize-none ${
                  isBambiMode
                    ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400 focus:ring-pink-400'
                    : 'bg-protocol-surface-light border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:border-protocol-accent focus:ring-protocol-accent'
                }`}
              />

              <p
                className={`text-xs ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                This explanation will be saved. You may find it valuable later.
              </p>
            </div>
          )}

          {/* Step 3: Final Confirmation */}
          {step === 3 && (
            <div className="space-y-4">
              <p
                className={`text-center ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Final confirmation
              </p>

              <p
                className={`text-center text-sm ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Type the following to confirm:
              </p>

              <p
                className={`text-center font-mono text-sm ${
                  isBambiMode ? 'text-red-600' : 'text-red-400'
                }`}
              >
                "{requiredConfirmText}"
              </p>

              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type to confirm..."
                className={`w-full px-4 py-3 rounded-lg border ${
                  isBambiMode
                    ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-red-400 focus:ring-red-400'
                    : 'bg-protocol-surface-light border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:border-red-400 focus:ring-red-400'
                }`}
              />

              {confirmText && confirmText !== requiredConfirmText && (
                <p
                  className={`text-xs text-center ${
                    isBambiMode ? 'text-red-500' : 'text-red-400'
                  }`}
                >
                  Text doesn't match
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t flex gap-3 ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <button
            onClick={onCancel}
            className={`flex-1 py-2 rounded-lg font-medium ${
              isBambiMode
                ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
            }`}
          >
            Keep Goal
          </button>

          {step < 3 ? (
            <button
              onClick={handleNext}
              disabled={step === 2 && !reason.trim()}
              className={`flex-1 py-2 rounded-lg font-medium flex items-center justify-center gap-1 ${
                (step === 2 && !reason.trim())
                  ? isBambiMode
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
                  : isBambiMode
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={confirmText !== requiredConfirmText || submitting}
              className={`flex-1 py-2 rounded-lg font-medium ${
                confirmText !== requiredConfirmText || submitting
                  ? isBambiMode
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
                  : isBambiMode
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {submitting ? 'Abandoning...' : 'Abandon Goal'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
