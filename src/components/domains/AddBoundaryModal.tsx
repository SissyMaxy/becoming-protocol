/**
 * Add Boundary Modal
 *
 * Form to add a new boundary for dissolution tracking.
 */

import { useState } from 'react';
import { X, Target } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  EscalationDomain,
  ESCALATION_DOMAINS,
  ESCALATION_DOMAIN_LABELS,
} from '../../types/escalation';
import { createBoundary } from '../../lib/domainEscalation';

interface AddBoundaryModalProps {
  initialDomain?: EscalationDomain;
  onSubmit: () => Promise<void>;
  onClose: () => void;
}

export function AddBoundaryModal({
  initialDomain,
  onSubmit,
  onClose,
}: AddBoundaryModalProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState<EscalationDomain | ''>(initialDomain || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = description.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;

    setIsSubmitting(true);
    try {
      await createBoundary(
        user.id,
        description.trim(),
        domain || undefined
      );
      await onSubmit();
      onClose();
    } catch (err) {
      console.error('Failed to add boundary:', err);
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
              Add Boundary
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
          {/* Description */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              What boundary do you want to dissolve?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., I won't wear feminine clothes outside"
              rows={3}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none focus:ring-2 focus:ring-purple-500/50`}
            />
          </div>

          {/* Domain (Optional) */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Related Domain (optional)
            </label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value as EscalationDomain | '')}
              className={`w-full p-3 rounded-lg border text-sm ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text'
              } focus:outline-none focus:ring-2 focus:ring-purple-500/50`}
            >
              <option value="">No specific domain</option>
              {ESCALATION_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {ESCALATION_DOMAIN_LABELS[d]}
                </option>
              ))}
            </select>
          </div>

          {/* Info */}
          <div
            className={`p-3 rounded-lg ${
              isBambiMode
                ? 'bg-pink-100 border border-pink-200'
                : 'bg-protocol-surface border border-protocol-border'
            }`}
          >
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Boundaries are limits you've set that can be gradually dissolved through exposure,
              conditioning, or direction. Track them here to measure your progress.
            </p>
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
                : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
          >
            {isSubmitting ? 'Adding...' : 'Add Boundary'}
          </button>
        </div>
      </div>
    </div>
  );
}
