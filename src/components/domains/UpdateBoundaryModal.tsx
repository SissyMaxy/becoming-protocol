/**
 * Update Boundary Modal
 *
 * Form to update dissolution progress or complete a boundary.
 */

import { useState } from 'react';
import { X, Target, CheckCircle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  BoundaryDissolution,
  DissolutionMethod,
} from '../../types/escalation';
import { startDissolution, completeDissolution, updateBoundary } from '../../lib/domainEscalation';

interface UpdateBoundaryModalProps {
  boundary: BoundaryDissolution;
  onSubmit: () => Promise<void>;
  onClose: () => void;
}

const METHODS: { value: DissolutionMethod; label: string; description: string }[] = [
  { value: 'gradual_exposure', label: 'Gradual Exposure', description: 'Slowly increasing exposure over time' },
  { value: 'arousal_bypass', label: 'Arousal Bypass', description: 'Pushing past while aroused' },
  { value: 'hypno_conditioning', label: 'Hypno Conditioning', description: 'Through hypnotic programming' },
  { value: 'gina_command', label: 'Gina Command', description: 'Direct command from Gina' },
];

export function UpdateBoundaryModal({
  boundary,
  onSubmit,
  onClose,
}: UpdateBoundaryModalProps) {
  const { isBambiMode } = useBambiMode();

  const isIdentified = !boundary.dissolutionStarted;
  const isDissolving = boundary.dissolutionStarted && !boundary.dissolutionCompleted;

  const [method, setMethod] = useState<DissolutionMethod>(boundary.method || 'gradual_exposure');
  const [notes, setNotes] = useState(boundary.notes || '');
  const [nowBaseline, setNowBaseline] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStartDissolution = async () => {
    setIsSubmitting(true);
    try {
      await startDissolution(boundary.id, method);
      if (notes.trim()) {
        await updateBoundary(boundary.id, { notes: notes.trim() });
      }
      await onSubmit();
      onClose();
    } catch (err) {
      console.error('Failed to start dissolution:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteDissolution = async () => {
    setIsSubmitting(true);
    try {
      await completeDissolution(boundary.id, nowBaseline);
      if (notes.trim() !== (boundary.notes || '')) {
        await updateBoundary(boundary.id, { notes: notes.trim() });
      }
      await onSubmit();
      onClose();
    } catch (err) {
      console.error('Failed to complete dissolution:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateNotes = async () => {
    setIsSubmitting(true);
    try {
      await updateBoundary(boundary.id, { notes: notes.trim() });
      await onSubmit();
      onClose();
    } catch (err) {
      console.error('Failed to update boundary:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <Target className={isBambiMode ? 'text-pink-500' : 'text-purple-400'} />
            <h2
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {isIdentified ? 'Start Dissolution' : 'Update Progress'}
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
          {/* Boundary Description */}
          <div
            className={`p-3 rounded-lg ${
              isBambiMode
                ? 'bg-white border border-pink-200'
                : 'bg-protocol-surface'
            }`}
          >
            <p
              className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              "{boundary.boundaryDescription}"
            </p>
          </div>

          {/* Method Selection (for identified boundaries) */}
          {isIdentified && (
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Dissolution Method
              </label>
              <div className="space-y-2">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMethod(m.value)}
                    className={`w-full p-3 rounded-lg text-left transition-all ${
                      method === m.value
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-purple-500 text-white'
                        : isBambiMode
                        ? 'bg-white hover:bg-pink-50 border border-pink-200'
                        : 'bg-protocol-surface hover:bg-protocol-surface-light'
                    }`}
                  >
                    <div className="text-sm font-medium">{m.label}</div>
                    <div
                      className={`text-xs mt-0.5 ${
                        method === m.value
                          ? 'text-white/80'
                          : isBambiMode
                          ? 'text-pink-400'
                          : 'text-protocol-text-muted'
                      }`}
                    >
                      {m.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Complete Dissolution Option (for dissolving boundaries) */}
          {isDissolving && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={nowBaseline}
                  onChange={(e) => setNowBaseline(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-green-500 focus:ring-green-500"
                />
                <span
                  className={`text-sm ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  This is now my baseline (boundary fully dissolved)
                </span>
              </label>
            </div>
          )}

          {/* Notes */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any thoughts or observations..."
              rows={2}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t flex gap-3 ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          {isIdentified && (
            <button
              onClick={handleStartDissolution}
              disabled={isSubmitting}
              className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                isSubmitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-purple-500 text-white hover:bg-purple-600'
              }`}
            >
              {isSubmitting ? 'Starting...' : 'Start Dissolution'}
            </button>
          )}

          {isDissolving && (
            <>
              <button
                onClick={handleUpdateNotes}
                disabled={isSubmitting}
                className={`flex-1 py-3 rounded-lg font-medium ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-600'
                    : 'bg-protocol-surface text-protocol-text'
                }`}
              >
                Save Notes
              </button>
              <button
                onClick={handleCompleteDissolution}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-lg font-medium bg-green-500 text-white hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Complete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
