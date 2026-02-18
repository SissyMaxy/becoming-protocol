/**
 * Needs Work Modal
 *
 * Modal for providing feedback when a task needs improvement.
 */

import { useState } from 'react';
import { X, Send, SkipForward } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface NeedsWorkModalProps {
  onSubmit: (feedback?: string) => void;
  onCancel: () => void;
}

export function NeedsWorkModal({ onSubmit, onCancel }: NeedsWorkModalProps) {
  const { isBambiMode } = useBambiMode();
  const [feedback, setFeedback] = useState('');

  const handleSubmit = () => {
    onSubmit(feedback.trim() || undefined);
  };

  const handleSkip = () => {
    onSubmit(undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-sm rounded-2xl overflow-hidden ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b flex items-center justify-between ${
            isBambiMode
              ? 'border-pink-200 bg-blue-50'
              : 'border-protocol-border bg-blue-900/20'
          }`}
        >
          <h3
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-blue-600' : 'text-blue-400'
            }`}
          >
            What needs improvement?
          </h3>
          <button
            onClick={onCancel}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
            }`}
          >
            <X
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p
            className={`text-sm ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}
          >
            Your feedback helps improve task quality. This is optional - you can
            skip if you prefer.
          </p>

          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="E.g., 'Too vague', 'Intensity mismatch', 'Unrealistic timeframe'..."
            rows={3}
            className={`w-full p-3 rounded-lg border text-sm resize-none ${
              isBambiMode
                ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-blue-400'
                : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:border-blue-500'
            } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
          />
        </div>

        {/* Actions */}
        <div
          className={`p-4 border-t flex gap-3 ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <button
            onClick={handleSkip}
            className={`flex-1 py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
              isBambiMode
                ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
            }`}
          >
            <SkipForward className="w-4 h-4" />
            Skip
          </button>

          <button
            onClick={handleSubmit}
            className={`flex-1 py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
              isBambiMode
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
