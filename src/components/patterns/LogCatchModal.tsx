/**
 * Log Catch Modal
 *
 * Quick form to log a pattern catch instance.
 */

import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { MasculinePattern } from '../../types/patterns';
import { logPatternCatch } from '../../lib/patterns';

interface LogCatchModalProps {
  patterns: MasculinePattern[];
  initialPatternId?: string;
  onSubmit: () => Promise<void>;
  onClose: () => void;
}

export function LogCatchModal({
  patterns,
  initialPatternId,
  onSubmit,
  onClose,
}: LogCatchModalProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [selectedPatternId, setSelectedPatternId] = useState<string>(
    initialPatternId || (patterns.length > 0 ? patterns[0].id : '')
  );
  const [context, setContext] = useState('');
  const [triggerCause, setTriggerCause] = useState('');
  const [correctionApplied, setCorrectionApplied] = useState(false);
  const [correctionSuccess, setCorrectionSuccess] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = selectedPatternId.length > 0;
  const activePatterns = patterns.filter(p => p.status !== 'resolved');

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;

    setIsSubmitting(true);
    try {
      await logPatternCatch(selectedPatternId, user.id, {
        context: context.trim() || undefined,
        triggerCause: triggerCause.trim() || undefined,
        correctionApplied,
        correctionSuccess: correctionApplied ? correctionSuccess : undefined,
      });
      await onSubmit();
      onClose();
    } catch (err) {
      console.error('Failed to log catch:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (activePatterns.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <div
          className={`relative w-full max-w-sm p-6 rounded-2xl text-center ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
          }`}
        >
          <AlertCircle
            className={`w-12 h-12 mx-auto mb-4 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          />
          <h3
            className={`text-lg font-semibold mb-2 ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            No Patterns to Track
          </h3>
          <p
            className={`text-sm mb-4 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            Add a pattern first before logging catches.
          </p>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg font-medium ${
              isBambiMode
                ? 'bg-pink-500 text-white'
                : 'bg-protocol-surface text-protocol-text'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-2xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b flex items-center justify-between ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className={isBambiMode ? 'text-pink-500' : 'text-red-400'} />
            <h2
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Log Pattern Catch
            </h2>
          </div>
          <button
            onClick={onClose}
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
          {/* Pattern Selector */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Pattern
            </label>
            <select
              value={selectedPatternId}
              onChange={(e) => setSelectedPatternId(e.target.value)}
              className={`w-full p-3 rounded-lg border text-sm ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text'
              } focus:outline-none focus:ring-2 focus:ring-red-500/50`}
            >
              {activePatterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.patternName}
                </option>
              ))}
            </select>
          </div>

          {/* Context */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Context (optional)
            </label>
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Where/when did this happen?"
              className={`w-full p-3 rounded-lg border text-sm ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none`}
            />
          </div>

          {/* Trigger Cause */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              What triggered it? (optional)
            </label>
            <input
              type="text"
              value={triggerCause}
              onChange={(e) => setTriggerCause(e.target.value)}
              placeholder="What caused this pattern to appear?"
              className={`w-full p-3 rounded-lg border text-sm ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none`}
            />
          </div>

          {/* Correction Applied */}
          <div
            className={`p-3 rounded-lg ${
              isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
            }`}
          >
            <label className="flex items-center justify-between cursor-pointer">
              <span
                className={`text-sm font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Applied feminine correction?
              </span>
              <button
                onClick={() => setCorrectionApplied(!correctionApplied)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  correctionApplied
                    ? 'bg-green-500'
                    : isBambiMode
                    ? 'bg-pink-200'
                    : 'bg-protocol-border'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    correctionApplied ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>

            {/* Correction Success */}
            {correctionApplied && (
              <div className="mt-3 pt-3 border-t border-pink-100">
                <label className="flex items-center justify-between cursor-pointer">
                  <span
                    className={`text-sm ${
                      isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                    }`}
                  >
                    Correction successful?
                  </span>
                  <button
                    onClick={() => setCorrectionSuccess(!correctionSuccess)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      correctionSuccess
                        ? 'bg-green-500'
                        : isBambiMode
                        ? 'bg-pink-200'
                        : 'bg-protocol-border'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        correctionSuccess ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              !canSubmit || isSubmitting
                ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                : isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
          >
            {isSubmitting ? 'Logging...' : 'Log Catch'}
          </button>
        </div>
      </div>
    </div>
  );
}
