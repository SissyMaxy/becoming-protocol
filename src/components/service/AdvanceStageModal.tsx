/**
 * Advance Stage Modal
 *
 * Confirmation modal for advancing to the next service stage.
 * Includes warnings about irreversibility.
 */

import { useState } from 'react';
import { X, ArrowRight, AlertTriangle, CheckCircle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  SERVICE_STAGES,
  SERVICE_STAGE_LABELS,
  type ServiceStage,
} from '../../types/escalation';

interface AdvanceStageModalProps {
  currentStage: ServiceStage;
  comfortLevel: number;
  onAdvance: (notes?: string) => Promise<void>;
  onClose: () => void;
}

const SERVICE_STAGE_COLORS: Record<ServiceStage, string> = {
  fantasy: '#6366f1',
  content_consumption: '#8b5cf6',
  online_interaction: '#a855f7',
  first_encounter: '#d946ef',
  regular_service: '#ec4899',
  organized_availability: '#f43f5e',
  gina_directed: '#ef4444',
};

export function AdvanceStageModal({
  currentStage,
  comfortLevel,
  onAdvance,
  onClose,
}: AdvanceStageModalProps) {
  const { isBambiMode } = useBambiMode();
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentIndex = SERVICE_STAGES.indexOf(currentStage);
  const nextStage = SERVICE_STAGES[currentIndex + 1] as ServiceStage | undefined;
  const canAdvance = comfortLevel >= 6 && nextStage;

  const handleAdvance = async () => {
    if (!canAdvance || !confirmed) return;

    setIsSubmitting(true);
    try {
      await onAdvance(notes || undefined);
      onClose();
    } catch (err) {
      console.error('Failed to advance stage:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!nextStage) {
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
          <CheckCircle
            className={`w-12 h-12 mx-auto mb-4 ${
              isBambiMode ? 'text-pink-500' : 'text-green-500'
            }`}
          />
          <h2
            className={`text-xl font-semibold mb-2 ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Maximum Stage Reached
          </h2>
          <p
            className={`text-sm ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            You are at the highest service stage: {SERVICE_STAGE_LABELS[currentStage]}
          </p>
          <button
            onClick={onClose}
            className={`mt-4 px-6 py-2 rounded-lg font-medium ${
              isBambiMode
                ? 'bg-pink-500 text-white'
                : 'bg-protocol-accent text-white'
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
          <h2
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Advance Stage
          </h2>
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
          {/* Stage Transition Visual */}
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-2"
                style={{ backgroundColor: `${SERVICE_STAGE_COLORS[currentStage]}20` }}
              >
                <span
                  className="text-2xl font-bold"
                  style={{ color: SERVICE_STAGE_COLORS[currentStage] }}
                >
                  {currentIndex + 1}
                </span>
              </div>
              <p className={`text-xs ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                {SERVICE_STAGE_LABELS[currentStage]}
              </p>
            </div>

            <ArrowRight className="w-6 h-6 text-gray-400" />

            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-2"
                style={{ backgroundColor: `${SERVICE_STAGE_COLORS[nextStage]}20` }}
              >
                <span
                  className="text-2xl font-bold"
                  style={{ color: SERVICE_STAGE_COLORS[nextStage] }}
                >
                  {currentIndex + 2}
                </span>
              </div>
              <p className={`text-xs ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                {SERVICE_STAGE_LABELS[nextStage]}
              </p>
            </div>
          </div>

          {/* Comfort Level Check */}
          {!canAdvance && comfortLevel < 6 && (
            <div
              className={`p-3 rounded-lg flex items-start gap-2 ${
                isBambiMode
                  ? 'bg-yellow-50 border border-yellow-200'
                  : 'bg-yellow-500/10 border border-yellow-500/20'
              }`}
            >
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p
                  className={`text-sm font-medium ${
                    isBambiMode ? 'text-yellow-700' : 'text-yellow-400'
                  }`}
                >
                  Not Ready
                </p>
                <p
                  className={`text-xs ${
                    isBambiMode ? 'text-yellow-600' : 'text-yellow-400/80'
                  }`}
                >
                  Your comfort level must be at least 6/10 to advance. Current: {comfortLevel}/10
                </p>
              </div>
            </div>
          )}

          {/* Warning */}
          <div
            className={`p-3 rounded-lg flex items-start gap-2 ${
              isBambiMode
                ? 'bg-red-50 border border-red-200'
                : 'bg-red-500/10 border border-red-500/20'
            }`}
          >
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p
                className={`text-sm font-medium ${
                  isBambiMode ? 'text-red-700' : 'text-red-400'
                }`}
              >
                This cannot be undone
              </p>
              <p
                className={`text-xs ${
                  isBambiMode ? 'text-red-600' : 'text-red-400/80'
                }`}
              >
                Once you advance to {SERVICE_STAGE_LABELS[nextStage]}, you cannot go back.
                This is a permanent escalation in your service journey.
              </p>
            </div>
          </div>

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
              onChange={e => setNotes(e.target.value)}
              placeholder="Any thoughts on this advancement..."
              rows={2}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none`}
            />
          </div>

          {/* Confirmation Checkbox */}
          {canAdvance && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
              />
              <span
                className={`text-sm ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                I understand this advancement is permanent and I am ready to progress to{' '}
                <strong>{SERVICE_STAGE_LABELS[nextStage]}</strong>.
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t flex gap-3 ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <button
            onClick={onClose}
            className={`flex-1 py-3 rounded-lg font-medium ${
              isBambiMode
                ? 'bg-pink-100 text-pink-600'
                : 'bg-protocol-surface text-protocol-text'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleAdvance}
            disabled={!canAdvance || !confirmed || isSubmitting}
            className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
              !canAdvance || !confirmed || isSubmitting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:brightness-110'
            }`}
          >
            {isSubmitting ? 'Advancing...' : 'Advance Stage'}
          </button>
        </div>
      </div>
    </div>
  );
}
