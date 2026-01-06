import { useState } from 'react';
import { X, AlertTriangle, Check } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type {
  ReleaseType,
  ReleaseContext,
  OrgasmLogInput,
} from '../../types/arousal';
import { RELEASE_TYPE_CONFIG } from '../../types/arousal';

interface OrgasmLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: OrgasmLogInput) => Promise<void>;
  currentStreakDays?: number;
}

const CONTEXT_CONFIG: Record<ReleaseContext, { label: string; emoji: string }> = {
  solo: { label: 'Solo', emoji: '🔒' },
  with_partner: { label: 'With Partner', emoji: '💕' },
  during_content: { label: 'During Content', emoji: '📱' },
  during_practice: { label: 'During Practice', emoji: '✨' },
  sleep: { label: 'Sleep', emoji: '😴' },
};

export function OrgasmLogModal({
  isOpen,
  onClose,
  onSubmit,
  currentStreakDays = 0,
}: OrgasmLogModalProps) {
  const { isBambiMode } = useBambiMode();
  const [releaseType, setReleaseType] = useState<ReleaseType>('full');
  const [context, setContext] = useState<ReleaseContext>('solo');
  const [planned, setPlanned] = useState(false);
  const [intensity, setIntensity] = useState(5);
  const [satisfaction, setSatisfaction] = useState(5);
  const [regretLevel, setRegretLevel] = useState(1);
  const [trigger, setTrigger] = useState('');
  const [notes, setNotes] = useState('');
  const [partnerInitiated, setPartnerInitiated] = useState(false);
  const [partnerControlled, setPartnerControlled] = useState(false);
  const [partnerAware, setPartnerAware] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  if (!isOpen) return null;

  const selectedTypeConfig = RELEASE_TYPE_CONFIG[releaseType];
  const willResetStreak = selectedTypeConfig.resetsStreak;
  const showPartnerOptions = context === 'with_partner';

  // Check if user has actually reflected (changed from defaults)
  const hasReflected =
    intensity !== 5 ||
    satisfaction !== 5 ||
    regretLevel !== 1 ||
    trigger.trim() !== '' ||
    notes.trim() !== '';

  const handleSubmit = async () => {
    // If this will reset streak and hasn't been confirmed, show confirmation
    // Don't show confirmation for day 1 streaks - not meaningful yet
    if (willResetStreak && currentStreakDays > 1 && !showConfirmation) {
      setShowConfirmation(true);
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        releaseType,
        context,
        planned,
        intensity,
        satisfaction,
        regretLevel,
        trigger: trigger || undefined,
        notes: notes || undefined,
        partnerInitiated: showPartnerOptions ? partnerInitiated : undefined,
        partnerControlled: showPartnerOptions ? partnerControlled : undefined,
        partnerAware: showPartnerOptions ? partnerAware : undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to log orgasm:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const releaseTypes = Object.keys(RELEASE_TYPE_CONFIG) as ReleaseType[];
  const contexts = Object.keys(CONTEXT_CONFIG) as ReleaseContext[];

  // Confirmation view
  if (showConfirmation) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div
          className={`w-full max-w-sm rounded-2xl p-6 ${
            isBambiMode ? 'bg-white' : 'bg-protocol-bg'
          }`}
        >
          <div className="text-center mb-6">
            <div
              className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                isBambiMode ? 'bg-orange-100' : 'bg-orange-900/30'
              }`}
            >
              <AlertTriangle
                className={`w-8 h-8 ${
                  isBambiMode ? 'text-orange-500' : 'text-orange-400'
                }`}
              />
            </div>
            <h3
              className={`text-xl font-bold mb-2 ${
                isBambiMode ? 'text-gray-900' : 'text-protocol-text'
              }`}
            >
              Confirm Release
            </h3>
            <p
              className={`${
                isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
              }`}
            >
              This will end your current streak of{' '}
              <span className="font-bold">{currentStreakDays} days</span>.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirmation(false)}
              className={`flex-1 py-3 rounded-xl font-medium ${
                isBambiMode
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className={`flex-1 py-3 rounded-xl font-medium ${
                isBambiMode
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-orange-600 text-white hover:bg-orange-700'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoading ? 'Logging...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${
            isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-bg border-protocol-border'
          }`}
        >
          <h2
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Log Release
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-full ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-400'
                : 'hover:bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Release Type Selection */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Release Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {releaseTypes.map((type) => {
                const config = RELEASE_TYPE_CONFIG[type];
                const isSelected = releaseType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setReleaseType(type)}
                    className={`p-3 rounded-xl text-left transition-all ${
                      isSelected
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-accent text-white'
                        : isBambiMode
                          ? 'bg-pink-50 text-pink-600 border border-pink-200'
                          : 'bg-protocol-surface text-protocol-text border border-protocol-border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{config.emoji}</span>
                      <div>
                        <div className="font-medium text-sm">{config.label}</div>
                        {!config.resetsStreak && (
                          <div className="text-xs opacity-75">Keeps streak</div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Streak Warning - don't show for day 1 */}
            {willResetStreak && currentStreakDays > 1 && (
              <div
                className={`mt-3 p-3 rounded-lg flex items-start gap-2 ${
                  isBambiMode ? 'bg-orange-50 text-orange-700' : 'bg-orange-900/20 text-orange-400'
                }`}
              >
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="text-sm">
                  This will reset your {currentStreakDays}-day streak
                </span>
              </div>
            )}
          </div>

          {/* Context Selection */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Context
            </label>
            <div className="flex flex-wrap gap-2">
              {contexts.map((ctx) => {
                const config = CONTEXT_CONFIG[ctx];
                const isSelected = context === ctx;
                return (
                  <button
                    key={ctx}
                    onClick={() => setContext(ctx)}
                    className={`px-3 py-2 rounded-lg text-sm transition-all ${
                      isSelected
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-accent text-white'
                        : isBambiMode
                          ? 'bg-pink-50 text-pink-600 border border-pink-200'
                          : 'bg-protocol-surface text-protocol-text border border-protocol-border'
                    }`}
                  >
                    {config.emoji} {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Planned Toggle */}
          <div
            className={`flex items-center justify-between p-4 rounded-xl ${
              isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
            }`}
          >
            <span
              className={`font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Was this planned?
            </span>
            <button
              onClick={() => setPlanned(!planned)}
              className={`w-12 h-7 rounded-full transition-colors ${
                planned
                  ? isBambiMode
                    ? 'bg-pink-500'
                    : 'bg-protocol-accent'
                  : isBambiMode
                    ? 'bg-pink-200'
                    : 'bg-protocol-surface-light'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                  planned ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Partner Options (only if context is with_partner) */}
          {showPartnerOptions && (
            <div>
              <label
                className={`block text-sm font-medium mb-3 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                }`}
              >
                Partner Involvement
              </label>
              <div className="space-y-2">
                {[
                  { key: 'initiated', label: 'Partner Initiated', value: partnerInitiated, setValue: setPartnerInitiated },
                  { key: 'controlled', label: 'Partner Controlled', value: partnerControlled, setValue: setPartnerControlled },
                  { key: 'aware', label: 'Partner Aware', value: partnerAware, setValue: setPartnerAware },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => item.setValue(!item.value)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg ${
                      item.value
                        ? isBambiMode
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-purple-900/30 text-purple-400'
                        : isBambiMode
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-protocol-surface text-protocol-text-muted'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.value && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Intensity Scale */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Intensity
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <button
                  key={level}
                  onClick={() => setIntensity(level)}
                  className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                    intensity === level
                      ? isBambiMode
                        ? 'bg-red-400 text-white scale-110'
                        : 'bg-red-600 text-white scale-110'
                      : isBambiMode
                        ? 'bg-red-100 text-red-600'
                        : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Satisfaction Scale */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Satisfaction
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <button
                  key={level}
                  onClick={() => setSatisfaction(level)}
                  className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                    satisfaction === level
                      ? isBambiMode
                        ? 'bg-green-400 text-white scale-110'
                        : 'bg-green-600 text-white scale-110'
                      : isBambiMode
                        ? 'bg-green-100 text-green-600'
                        : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Regret Level Scale */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Regret Level
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <button
                  key={level}
                  onClick={() => setRegretLevel(level)}
                  className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                    regretLevel === level
                      ? isBambiMode
                        ? 'bg-purple-400 text-white scale-110'
                        : 'bg-purple-600 text-white scale-110'
                      : isBambiMode
                        ? 'bg-purple-100 text-purple-600'
                        : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Trigger */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Trigger (optional)
            </label>
            <input
              type="text"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="What led to this?"
              className={`w-full px-4 py-3 rounded-xl ${
                isBambiMode
                  ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
                  : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
              } outline-none transition-colors`}
            />
          </div>

          {/* Notes */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any reflections..."
              rows={2}
              className={`w-full px-4 py-3 rounded-xl resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
                  : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
              } outline-none transition-colors`}
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={isLoading || !hasReflected}
            className={`w-full py-3 rounded-xl font-medium transition-all ${
              isLoading || !hasReflected
                ? isBambiMode
                  ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                  : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
                : isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
            }`}
          >
            {isLoading
              ? 'Logging...'
              : !hasReflected
                ? 'Adjust ratings or add notes to save'
                : 'Log Release'}
          </button>
        </div>
      </div>
    </div>
  );
}
