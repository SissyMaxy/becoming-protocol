/**
 * Log Action Modal
 *
 * Form for logging an action/interaction on a seed.
 */

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { SeedActionType, SeedActionInput, SeedPhase, ArousalState } from '../../types/arousal';
import { AROUSAL_STATE_CONFIG, SEED_PHASE_CONFIG } from '../../types/arousal';

interface LogActionModalProps {
  seedTitle: string;
  currentPhase: SeedPhase;
  onSubmit: (action: SeedActionInput) => Promise<void>;
  onCancel: () => void;
}

const ACTION_TYPES: { type: SeedActionType; label: string; emoji: string; description: string }[] = [
  { type: 'mention', label: 'Mentioned', emoji: '💬', description: 'Brought it up casually' },
  { type: 'tested_waters', label: 'Tested Waters', emoji: '🌊', description: 'Gauged her reaction' },
  { type: 'soft_offer', label: 'Soft Offer', emoji: '💝', description: 'Gently proposed trying' },
  { type: 'attempted', label: 'Attempted', emoji: '🎯', description: 'Actually tried it' },
  { type: 'succeeded', label: 'Succeeded', emoji: '✅', description: 'It went well!' },
  { type: 'partial', label: 'Partial', emoji: '🔄', description: 'Mixed results' },
  { type: 'rejected', label: 'Rejected', emoji: '❌', description: 'Not ready/declined' },
  { type: 'postponed', label: 'Postponed', emoji: '⏸️', description: 'Paused for now' },
  { type: 'she_initiated', label: 'She Initiated', emoji: '💖', description: 'She brought it up!' },
  { type: 'she_expanded', label: 'She Expanded', emoji: '🌟', description: 'She took it further' },
  { type: 'note', label: 'Just a Note', emoji: '📝', description: 'General observation' },
];

const PARTNER_MOODS = [
  { value: 'playful', label: 'Playful', emoji: '😊' },
  { value: 'curious', label: 'Curious', emoji: '🤔' },
  { value: 'dominant', label: 'Dominant', emoji: '👑' },
  { value: 'relaxed', label: 'Relaxed', emoji: '😌' },
  { value: 'tired', label: 'Tired', emoji: '😴' },
  { value: 'stressed', label: 'Stressed', emoji: '😰' },
  { value: 'aroused', label: 'Aroused', emoji: '🔥' },
];

const AROUSAL_STATES: ArousalState[] = ['baseline', 'building', 'sweet_spot', 'overload', 'post_release'];

export function LogActionModal({
  seedTitle,
  currentPhase,
  onSubmit,
  onCancel,
}: LogActionModalProps) {
  const { isBambiMode } = useBambiMode();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'action' | 'details'>('action');

  const [actionType, setActionType] = useState<SeedActionType | null>(null);
  const [arousalState, setArousalState] = useState<ArousalState | undefined>();
  const [partnerMood, setPartnerMood] = useState<string | undefined>();
  const [whatHappened, setWhatHappened] = useState('');
  const [herReaction, setHerReaction] = useState('');
  const [whatWorked, setWhatWorked] = useState('');
  const [whatDidnt, setWhatDidnt] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [phaseChangeTo, setPhaseChangeTo] = useState<SeedPhase | undefined>();

  const handleSelectAction = (type: SeedActionType) => {
    setActionType(type);
    setStep('details');
  };

  const handleSubmit = async () => {
    if (!actionType) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        actionType,
        arousalState,
        partnerMood,
        whatHappened: whatHappened.trim() || undefined,
        herReaction: herReaction.trim() || undefined,
        whatWorked: whatWorked.trim() || undefined,
        whatDidnt: whatDidnt.trim() || undefined,
        nextStep: nextStep.trim() || undefined,
        phaseChangeTo,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get next phases for advancement
  const getNextPhases = (): SeedPhase[] => {
    const phases: SeedPhase[] = [
      'identified',
      'distant_mention',
      'positive_assoc',
      'adjacent_exp',
      'soft_offer',
      'first_attempt',
      'establishing',
      'established',
    ];
    const currentIndex = phases.indexOf(currentPhase);
    if (currentIndex < 0 || currentIndex >= phases.length - 1) return [];
    return phases.slice(currentIndex + 1);
  };

  const nextPhases = getNextPhases();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div
        className={`w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}
      >
        {/* Header */}
        <div
          className={`sticky top-0 flex items-center justify-between p-4 border-b ${
            isBambiMode
              ? 'bg-white border-pink-200'
              : 'bg-protocol-surface border-protocol-border'
          }`}
        >
          <div>
            <h2
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Log Action
            </h2>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              {seedTitle}
            </p>
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

        {/* Step 1: Action Selection */}
        {step === 'action' && (
          <div className="p-4">
            <p
              className={`text-sm mb-4 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              What happened?
            </p>
            <div className="space-y-2">
              {ACTION_TYPES.map((action) => (
                <button
                  key={action.type}
                  onClick={() => handleSelectAction(action.type)}
                  className={`w-full p-3 rounded-xl text-left transition-all flex items-center gap-3 ${
                    isBambiMode
                      ? 'bg-pink-50 hover:bg-pink-100 text-pink-700'
                      : 'bg-protocol-bg hover:bg-protocol-bg/70 text-protocol-text'
                  }`}
                >
                  <span className="text-xl">{action.emoji}</span>
                  <div>
                    <span className="font-medium">{action.label}</span>
                    <p
                      className={`text-xs ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    >
                      {action.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 'details' && actionType && (
          <div className="p-4 space-y-4">
            {/* Back to action selection */}
            <button
              onClick={() => setStep('action')}
              className={`text-sm ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`}
            >
              Change action type
            </button>

            {/* Your arousal state */}
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                }`}
              >
                Your arousal state
              </label>
              <div className="flex flex-wrap gap-2">
                {AROUSAL_STATES.map((state) => {
                  const config = AROUSAL_STATE_CONFIG[state];
                  const isSelected = arousalState === state;
                  return (
                    <button
                      key={state}
                      onClick={() => setArousalState(isSelected ? undefined : state)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        isSelected
                          ? isBambiMode
                            ? 'bg-pink-500 text-white'
                            : 'bg-protocol-accent text-white'
                          : isBambiMode
                          ? 'bg-pink-50 text-pink-700'
                          : 'bg-protocol-bg text-protocol-text'
                      }`}
                    >
                      {config.emoji} {config.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Partner mood */}
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                }`}
              >
                Her mood
              </label>
              <div className="flex flex-wrap gap-2">
                {PARTNER_MOODS.map((mood) => {
                  const isSelected = partnerMood === mood.value;
                  return (
                    <button
                      key={mood.value}
                      onClick={() => setPartnerMood(isSelected ? undefined : mood.value)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        isSelected
                          ? isBambiMode
                            ? 'bg-pink-500 text-white'
                            : 'bg-protocol-accent text-white'
                          : isBambiMode
                          ? 'bg-pink-50 text-pink-700'
                          : 'bg-protocol-bg text-protocol-text'
                      }`}
                    >
                      {mood.emoji} {mood.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* What happened */}
            <div>
              <label
                className={`block text-sm font-medium mb-1 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                }`}
              >
                What happened?
              </label>
              <textarea
                value={whatHappened}
                onChange={(e) => setWhatHappened(e.target.value)}
                placeholder="Brief description..."
                rows={2}
                className={`w-full px-4 py-3 rounded-xl border outline-none transition-colors resize-none ${
                  isBambiMode
                    ? 'bg-pink-50 border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
                    : 'bg-protocol-bg border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:border-protocol-accent'
                }`}
              />
            </div>

            {/* Her reaction */}
            <div>
              <label
                className={`block text-sm font-medium mb-1 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                }`}
              >
                Her reaction
              </label>
              <textarea
                value={herReaction}
                onChange={(e) => setHerReaction(e.target.value)}
                placeholder="How did she respond?"
                rows={2}
                className={`w-full px-4 py-3 rounded-xl border outline-none transition-colors resize-none ${
                  isBambiMode
                    ? 'bg-pink-50 border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
                    : 'bg-protocol-bg border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:border-protocol-accent'
                }`}
              />
            </div>

            {/* What worked / what didn't */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className={`block text-sm font-medium mb-1 ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                  }`}
                >
                  What worked
                </label>
                <input
                  type="text"
                  value={whatWorked}
                  onChange={(e) => setWhatWorked(e.target.value)}
                  placeholder="Good parts..."
                  className={`w-full px-3 py-2 rounded-xl border outline-none text-sm ${
                    isBambiMode
                      ? 'bg-pink-50 border-pink-200 text-pink-700'
                      : 'bg-protocol-bg border-protocol-border text-protocol-text'
                  }`}
                />
              </div>
              <div>
                <label
                  className={`block text-sm font-medium mb-1 ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                  }`}
                >
                  What didn't
                </label>
                <input
                  type="text"
                  value={whatDidnt}
                  onChange={(e) => setWhatDidnt(e.target.value)}
                  placeholder="To avoid..."
                  className={`w-full px-3 py-2 rounded-xl border outline-none text-sm ${
                    isBambiMode
                      ? 'bg-pink-50 border-pink-200 text-pink-700'
                      : 'bg-protocol-bg border-protocol-border text-protocol-text'
                  }`}
                />
              </div>
            </div>

            {/* Next step */}
            <div>
              <label
                className={`block text-sm font-medium mb-1 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                }`}
              >
                Next step
              </label>
              <input
                type="text"
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder="What to try next..."
                className={`w-full px-4 py-3 rounded-xl border outline-none ${
                  isBambiMode
                    ? 'bg-pink-50 border-pink-200 text-pink-700'
                    : 'bg-protocol-bg border-protocol-border text-protocol-text'
                }`}
              />
            </div>

            {/* Phase advancement */}
            {nextPhases.length > 0 && (
              <div>
                <label
                  className={`block text-sm font-medium mb-2 ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                  }`}
                >
                  Advance phase? (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {nextPhases.map((phase) => {
                    const config = SEED_PHASE_CONFIG[phase];
                    const isSelected = phaseChangeTo === phase;
                    return (
                      <button
                        key={phase}
                        onClick={() => setPhaseChangeTo(isSelected ? undefined : phase)}
                        className={`px-3 py-2 rounded-lg text-sm transition-all ${
                          isSelected
                            ? 'bg-green-500 text-white'
                            : isBambiMode
                            ? 'bg-pink-50 text-pink-700'
                            : 'bg-protocol-bg text-protocol-text'
                        }`}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {step === 'details' && (
          <div
            className={`sticky bottom-0 p-4 flex gap-3 border-t ${
              isBambiMode
                ? 'bg-white border-pink-200'
                : 'bg-protocol-surface border-protocol-border'
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
              disabled={isSubmitting}
              className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
                isSubmitting
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : isBambiMode
                  ? 'bg-pink-500 text-white'
                  : 'bg-protocol-accent text-white'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Log Action'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
