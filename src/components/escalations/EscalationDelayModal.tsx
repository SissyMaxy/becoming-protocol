/**
 * Escalation Delay Modal
 * Shows the cost of delaying an escalation and confirms action
 */

import { useState } from 'react';
import { X, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { EscalationCalendarItem } from '../../types/escalations';

interface EscalationDelayModalProps {
  item: EscalationCalendarItem;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function EscalationDelayModal({
  item,
  onConfirm,
  onCancel,
}: EscalationDelayModalProps) {
  const { isBambiMode } = useBambiMode();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cost = item.delayCost;
  const hasCost = cost && (cost.edgeDebt || cost.investmentDecayPercent || cost.streakPenalty);

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delay');
      setIsLoading(false);
    }
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
        className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isBambiMode ? 'border-pink-100' : 'border-protocol-border'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
            }`}>
              <Clock className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`} />
            </div>
            <h2 className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Delay Escalation?
            </h2>
          </div>

          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-protocol-surface-light transition-colors"
          >
            <X className="w-5 h-5 text-protocol-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Escalation being delayed */}
          <div className={`p-4 rounded-xl ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
          }`}>
            <p className="text-xs text-protocol-text-muted mb-1">
              Day {item.escalation.dayTrigger}
            </p>
            <p className={`font-medium ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              {item.escalation.description}
            </p>
          </div>

          {/* Cost section */}
          {hasCost && (
            <div>
              <p className={`text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}>
                Delay cost:
              </p>

              <div className="space-y-2">
                {cost?.edgeDebt && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-amber-600">
                      +{cost.edgeDebt} edge debt
                    </span>
                  </div>
                )}

                {cost?.investmentDecayPercent && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-amber-600">
                      {cost.investmentDecayPercent}% investment decay
                    </span>
                  </div>
                )}

                {cost?.streakPenalty && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-protocol-danger/10 border border-protocol-danger/20">
                    <AlertTriangle className="w-4 h-4 text-protocol-danger" />
                    <span className="text-sm text-protocol-danger">
                      Streak penalty applied
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!hasCost && (
            <p className="text-sm text-protocol-text-muted text-center">
              This escalation can be delayed for 7 days at no cost.
            </p>
          )}

          {/* Warning */}
          <p className={`text-xs text-center ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            You can only delay each escalation once.
          </p>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-protocol-danger/10 border border-protocol-danger/20">
              <p className="text-sm text-protocol-danger text-center">{error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${
              isBambiMode
                ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
            }`}
          >
            Cancel
          </button>

          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Delaying...
              </>
            ) : (
              'Pay & Delay'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
