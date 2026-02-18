/**
 * Continuation Prompt
 * Appears after completing a task to maintain momentum
 * "Your brain is already in gear. Continue momentum."
 *
 * UX Psychology:
 * - Hardest part is starting; continuation is cheaper
 * - Leverages already-activated task mode
 * - Creates "session bundling" organically
 * - Reduces number of separate initiations needed per day
 */

import { useState, useEffect } from 'react';
import { Check, ArrowRight, X, Clock, Sparkles, Zap } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { PriorityAction } from './FocusedActionCard';

interface ContinuationPromptProps {
  completedTaskName: string;
  nextAction: PriorityAction | null;
  onContinue: () => void;
  onDone: () => void;
}

export function ContinuationPrompt({
  completedTaskName,
  nextAction,
  onContinue,
  onDone,
}: ContinuationPromptProps) {
  const { isBambiMode } = useBambiMode();
  const [isVisible, setIsVisible] = useState(false);

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // If no next action, just show completion message briefly
  if (!nextAction) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onDone} />
        <div className={`relative w-full max-w-sm p-6 rounded-2xl text-center transform transition-all duration-300 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        } ${
          isBambiMode
            ? 'bg-gradient-to-br from-pink-50 to-white border border-pink-200 shadow-xl shadow-pink-100'
            : 'bg-protocol-surface border border-protocol-border shadow-xl'
        }`}>
          <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
            isBambiMode ? 'bg-green-100' : 'bg-green-900/30'
          }`}>
            <Check className={`w-8 h-8 ${isBambiMode ? 'text-green-600' : 'text-green-400'}`} />
          </div>
          <p className={`font-bold text-lg ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
            All done for now!
          </p>
          <p className={`text-sm mt-2 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
            Great work on "{completedTaskName}"
          </p>
          <button
            onClick={onDone}
            className={`mt-4 px-6 py-2 rounded-xl font-medium ${
              isBambiMode
                ? 'bg-pink-100 hover:bg-pink-200 text-pink-700'
                : 'bg-protocol-surface hover:bg-protocol-border text-protocol-text-muted'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 transition-opacity duration-300 ${
      isVisible ? 'opacity-100' : 'opacity-0'
    }`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onDone} />

      <div className={`relative w-full max-w-md transform transition-all duration-300 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      } ${
        isBambiMode
          ? 'bg-gradient-to-br from-pink-50 to-white border border-pink-200 shadow-2xl shadow-pink-200/50'
          : 'bg-protocol-surface border border-protocol-border shadow-2xl'
      } rounded-2xl overflow-hidden`}>

        {/* Completed task indicator */}
        <div className={`px-5 py-4 flex items-center gap-3 ${
          isBambiMode
            ? 'bg-green-50 border-b border-green-100'
            : 'bg-green-900/20 border-b border-green-700/30'
        }`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isBambiMode ? 'bg-green-200' : 'bg-green-700/50'
          }`}>
            <Check className={`w-5 h-5 ${isBambiMode ? 'text-green-700' : 'text-green-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold truncate ${
              isBambiMode ? 'text-green-700' : 'text-green-400'
            }`}>
              {completedTaskName}
            </p>
            <p className={`text-xs ${isBambiMode ? 'text-green-600' : 'text-green-500'}`}>
              Complete!
            </p>
          </div>
        </div>

        {/* Momentum message */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-protocol-accent'}`} />
            <p className={`text-sm font-medium ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Your brain is already in gear
            </p>
          </div>
          <p className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
            Continue momentum:
          </p>
        </div>

        {/* Next action card */}
        <div className={`mx-5 mb-4 p-4 rounded-xl ${
          isBambiMode
            ? 'bg-pink-50 border border-pink-200'
            : 'bg-protocol-bg border border-protocol-border'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg flex-shrink-0 ${
              isBambiMode ? 'bg-pink-200 text-pink-600' : 'bg-protocol-accent/20 text-protocol-accent'
            }`}>
              <ArrowRight className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs uppercase tracking-wide font-semibold mb-1 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}>
                Next Up
              </p>
              <p className={`font-semibold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
                {nextAction.title}
              </p>
              {nextAction.estimatedMinutes && (
                <p className={`text-sm mt-1 flex items-center gap-1 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}>
                  <Clock className="w-3.5 h-3.5" />
                  {nextAction.estimatedMinutes} min
                </p>
              )}
            </div>
          </div>

          {/* "While you're warmed up" hint */}
          <p className={`mt-3 text-xs italic ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            "While you're warmed up..."
          </p>
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onContinue}
            className={`flex-1 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              isBambiMode
                ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-lg shadow-pink-200'
                : 'bg-protocol-accent hover:bg-protocol-accent-bright text-white'
            }`}
          >
            <Zap className="w-5 h-5" />
            Yes, Keep Going
          </button>

          <button
            onClick={onDone}
            className={`px-5 py-3.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              isBambiMode
                ? 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                : 'bg-protocol-surface hover:bg-protocol-border text-protocol-text-muted'
            }`}
          >
            <X className="w-4 h-4" />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
