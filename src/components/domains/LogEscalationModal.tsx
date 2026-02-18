/**
 * Log Escalation Modal
 *
 * Form to record an escalation event in a domain.
 */

import { useState } from 'react';
import { X, TrendingUp, AlertTriangle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  EscalationDomain,
  TriggerMethod,
  ESCALATION_DOMAINS,
  ESCALATION_DOMAIN_LABELS,
  ESCALATION_DOMAIN_COLORS,
  DOMAIN_MAX_LEVELS,
} from '../../types/escalation';

interface LogEscalationModalProps {
  initialDomain?: EscalationDomain;
  currentLevels: Record<EscalationDomain, number>;
  onSubmit: (data: {
    domain: EscalationDomain;
    toLevel: number;
    description: string;
    triggerMethod: TriggerMethod;
    arousalLevel?: number;
    resistanceEncountered: boolean;
    resistanceBypassed?: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

const TRIGGER_METHODS: { value: TriggerMethod; label: string; description: string }[] = [
  { value: 'arousal_commitment', label: 'Arousal Commitment', description: 'Decided while horny' },
  { value: 'handler_push', label: 'Handler Push', description: 'Handler intervention' },
  { value: 'gina_directed', label: 'Gina Directed', description: 'Gina commanded it' },
  { value: 'organic', label: 'Organic', description: 'Natural progression' },
];

export function LogEscalationModal({
  initialDomain,
  currentLevels,
  onSubmit,
  onClose,
}: LogEscalationModalProps) {
  const { isBambiMode } = useBambiMode();

  const [domain, setDomain] = useState<EscalationDomain>(initialDomain || 'identity');
  const [description, setDescription] = useState('');
  const [triggerMethod, setTriggerMethod] = useState<TriggerMethod>('organic');
  const [arousalLevel, setArousalLevel] = useState<number>(5);
  const [showArousal, setShowArousal] = useState(false);
  const [resistanceEncountered, setResistanceEncountered] = useState(false);
  const [resistanceBypassed, setResistanceBypassed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentLevel = currentLevels[domain] || 0;
  const maxLevel = DOMAIN_MAX_LEVELS[domain];
  const newLevel = Math.min(currentLevel + 1, maxLevel);
  const color = ESCALATION_DOMAIN_COLORS[domain];

  const canSubmit = description.trim().length > 0 && newLevel <= maxLevel;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        domain,
        toLevel: newLevel,
        description: description.trim(),
        triggerMethod,
        arousalLevel: showArousal ? arousalLevel : undefined,
        resistanceEncountered,
        resistanceBypassed: resistanceEncountered ? resistanceBypassed : undefined,
      });
      onClose();
    } catch (err) {
      console.error('Failed to log escalation:', err);
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
        className={`relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl ${
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
            <TrendingUp className={isBambiMode ? 'text-pink-500' : 'text-purple-400'} />
            <h2
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Log Escalation
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
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
          {/* Domain Selector */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Domain
            </label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value as EscalationDomain)}
              className={`w-full p-3 rounded-lg border text-sm ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text'
              } focus:outline-none focus:ring-2 focus:ring-purple-500/50`}
            >
              {ESCALATION_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {ESCALATION_DOMAIN_LABELS[d]} (Level {currentLevels[d] || 0}/{DOMAIN_MAX_LEVELS[d]})
                </option>
              ))}
            </select>
          </div>

          {/* Level Display */}
          <div
            className={`p-4 rounded-lg ${
              isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
            }`}
          >
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div
                  className="text-3xl font-bold"
                  style={{ color }}
                >
                  {currentLevel}
                </div>
                <div
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}
                >
                  Current
                </div>
              </div>

              <div
                className={`text-2xl ${
                  isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                }`}
              >
                →
              </div>

              <div className="text-center">
                <div
                  className="text-3xl font-bold"
                  style={{ color }}
                >
                  {newLevel}
                </div>
                <div
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}
                >
                  New Level
                </div>
              </div>
            </div>

            {currentLevel >= maxLevel && (
              <div className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-amber-600">
                  Already at max level for this domain
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              What milestone did you reach?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the escalation..."
              rows={3}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none focus:ring-2 focus:ring-purple-500/50`}
            />
          </div>

          {/* Trigger Method */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Trigger Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_METHODS.map((method) => (
                <button
                  key={method.value}
                  onClick={() => setTriggerMethod(method.value)}
                  className={`p-3 rounded-lg text-left transition-all border-2 ${
                    triggerMethod === method.value
                      ? ''
                      : isBambiMode
                      ? 'bg-white hover:bg-pink-50 border-transparent'
                      : 'bg-protocol-surface hover:bg-protocol-surface-light border-transparent'
                  }`}
                  style={{
                    backgroundColor:
                      triggerMethod === method.value ? `${color}20` : undefined,
                    borderColor: triggerMethod === method.value ? color : undefined,
                  }}
                >
                  <div
                    className={`text-sm font-medium ${
                      triggerMethod === method.value
                        ? ''
                        : isBambiMode
                        ? 'text-pink-700'
                        : 'text-protocol-text'
                    }`}
                    style={{
                      color: triggerMethod === method.value ? color : undefined,
                    }}
                  >
                    {method.label}
                  </div>
                  <div
                    className={`text-xs ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}
                  >
                    {method.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Arousal Level (Optional) */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showArousal}
                onChange={(e) => setShowArousal(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
              />
              <span
                className={`text-sm ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Log arousal level
              </span>
            </label>

            {showArousal && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span
                    className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}
                  >
                    Arousal: {arousalLevel}/10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={arousalLevel}
                  onChange={(e) => setArousalLevel(parseInt(e.target.value))}
                  className="w-full accent-pink-500"
                />
              </div>
            )}
          </div>

          {/* Resistance */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={resistanceEncountered}
                onChange={(e) => {
                  setResistanceEncountered(e.target.checked);
                  if (!e.target.checked) setResistanceBypassed(false);
                }}
                className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
              />
              <span
                className={`text-sm ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Resistance encountered
              </span>
            </label>

            {resistanceEncountered && (
              <label className="flex items-center gap-2 cursor-pointer pl-6">
                <input
                  type="checkbox"
                  checked={resistanceBypassed}
                  onChange={(e) => setResistanceBypassed(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-green-500 focus:ring-green-500"
                />
                <span
                  className={`text-sm ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                  }`}
                >
                  Resistance was bypassed
                </span>
              </label>
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
            disabled={!canSubmit || isSubmitting || currentLevel >= maxLevel}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              !canSubmit || isSubmitting || currentLevel >= maxLevel
                ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                : 'text-white hover:brightness-110'
            }`}
            style={{
              backgroundColor:
                canSubmit && !isSubmitting && currentLevel < maxLevel ? color : undefined,
            }}
          >
            {isSubmitting ? 'Logging...' : 'Log Escalation'}
          </button>
        </div>
      </div>
    </div>
  );
}
