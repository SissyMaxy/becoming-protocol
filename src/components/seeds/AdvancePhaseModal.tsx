/**
 * Advance Phase Modal
 *
 * Modal for advancing a seed to a new phase.
 */

import { useState } from 'react';
import { X, Loader2, TrendingUp } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { SeedPhase } from '../../types/arousal';
import { SEED_PHASE_CONFIG } from '../../types/arousal';

interface AdvancePhaseModalProps {
  seedTitle: string;
  currentPhase: SeedPhase;
  onAdvance: (newPhase: SeedPhase, notes?: string) => Promise<void>;
  onCancel: () => void;
}

const PHASE_COLORS: Record<SeedPhase, string> = {
  identified: '#64748b',
  distant_mention: '#8b5cf6',
  positive_assoc: '#a855f7',
  adjacent_exp: '#d946ef',
  soft_offer: '#ec4899',
  first_attempt: '#f472b6',
  establishing: '#22c55e',
  established: '#16a34a',
  abandoned: '#6b7280',
  paused: '#9ca3af',
};

const ACTIVE_PHASES: SeedPhase[] = [
  'identified',
  'distant_mention',
  'positive_assoc',
  'adjacent_exp',
  'soft_offer',
  'first_attempt',
  'establishing',
  'established',
];

export function AdvancePhaseModal({
  seedTitle,
  currentPhase,
  onAdvance,
  onCancel,
}: AdvancePhaseModalProps) {
  const { isBambiMode } = useBambiMode();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<SeedPhase | null>(null);
  const [notes, setNotes] = useState('');

  const currentIndex = ACTIVE_PHASES.indexOf(currentPhase);
  const availablePhases = currentIndex >= 0
    ? ACTIVE_PHASES.slice(currentIndex + 1)
    : [];

  // Also allow pausing/abandoning
  const specialPhases: SeedPhase[] = ['paused', 'abandoned'];

  const handleSubmit = async () => {
    if (!selectedPhase) return;

    setIsSubmitting(true);
    try {
      await onAdvance(selectedPhase, notes.trim() || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`w-full max-w-sm rounded-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 border-b ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <TrendingUp
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-500' : 'text-green-400'
              }`}
            />
            <h2
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Advance Phase
            </h2>
          </div>
          <button
            onClick={onCancel}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-bg'
            }`}
          >
            <X
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <p
              className={`text-sm ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              {seedTitle}
            </p>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted/70'
              }`}
            >
              Currently: {SEED_PHASE_CONFIG[currentPhase].label}
            </p>
          </div>

          {/* Advance options */}
          {availablePhases.length > 0 && (
            <div>
              <p
                className={`text-sm font-medium mb-2 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                }`}
              >
                Advance to:
              </p>
              <div className="space-y-2">
                {availablePhases.map((phase) => {
                  const config = SEED_PHASE_CONFIG[phase];
                  const isSelected = selectedPhase === phase;
                  return (
                    <button
                      key={phase}
                      onClick={() => setSelectedPhase(phase)}
                      className={`w-full p-3 rounded-xl text-left transition-all flex items-center gap-3 ${
                        isSelected
                          ? ''
                          : isBambiMode
                          ? 'bg-pink-50 hover:bg-pink-100'
                          : 'bg-protocol-bg hover:bg-protocol-bg/70'
                      }`}
                      style={{
                        backgroundColor: isSelected
                          ? `${PHASE_COLORS[phase]}20`
                          : undefined,
                        boxShadow: isSelected
                          ? `0 0 0 2px ${PHASE_COLORS[phase]}`
                          : undefined,
                      }}
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: PHASE_COLORS[phase] }}
                      />
                      <div>
                        <span
                          className={`font-medium ${
                            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                          }`}
                        >
                          {config.label}
                        </span>
                        <p
                          className={`text-xs ${
                            isBambiMode
                              ? 'text-pink-400'
                              : 'text-protocol-text-muted'
                          }`}
                        >
                          {config.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Special phases (pause/abandon) */}
          <div>
            <p
              className={`text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Or change status:
            </p>
            <div className="flex gap-2">
              {specialPhases.map((phase) => {
                const config = SEED_PHASE_CONFIG[phase];
                const isSelected = selectedPhase === phase;
                return (
                  <button
                    key={phase}
                    onClick={() => setSelectedPhase(phase)}
                    className={`flex-1 p-3 rounded-xl text-center transition-all ${
                      isSelected
                        ? phase === 'abandoned'
                          ? 'bg-red-100 ring-2 ring-red-400'
                          : 'bg-gray-100 ring-2 ring-gray-400'
                        : isBambiMode
                        ? 'bg-pink-50 hover:bg-pink-100'
                        : 'bg-protocol-bg hover:bg-protocol-bg/70'
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${
                        isSelected && phase === 'abandoned'
                          ? 'text-red-600'
                          : isBambiMode
                          ? 'text-pink-700'
                          : 'text-protocol-text'
                      }`}
                    >
                      {config.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          {selectedPhase && (
            <div>
              <label
                className={`block text-sm font-medium mb-1 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                }`}
              >
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why this change?"
                rows={2}
                className={`w-full px-4 py-3 rounded-xl border outline-none transition-colors resize-none ${
                  isBambiMode
                    ? 'bg-pink-50 border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
                    : 'bg-protocol-bg border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:border-protocol-accent'
                }`}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`p-4 flex gap-3 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <button
            onClick={onCancel}
            className={`flex-1 py-3 rounded-xl font-medium ${
              isBambiMode
                ? 'bg-pink-100 text-pink-700'
                : 'bg-protocol-bg text-protocol-text'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedPhase || isSubmitting}
            className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
              !selectedPhase || isSubmitting
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : selectedPhase === 'abandoned'
                ? 'bg-red-500 text-white'
                : 'bg-green-500 text-white'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Phase'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
