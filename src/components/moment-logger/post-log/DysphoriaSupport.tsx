// Dysphoria Support - Offers support options after logging dysphoria
// Gentle, calming design with optional support actions

import { Wind, Sparkles, Leaf } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { MomentIntensity, SupportType } from '../../../types/moment-logger';

interface DysphoriaSupportProps {
  intensity: MomentIntensity;
  onSupportSelected: (support: SupportType) => void;
  onSkip: () => void;
}

const SUPPORT_OPTIONS: Array<{
  type: SupportType;
  icon: typeof Wind;
  label: string;
  description: string;
}> = [
  {
    type: 'breathing',
    icon: Wind,
    label: 'Breathing',
    description: 'A quick calming breath',
  },
  {
    type: 'affirmation',
    icon: Sparkles,
    label: 'Affirmation',
    description: 'A reminder of who you are',
  },
  {
    type: 'grounding',
    icon: Leaf,
    label: 'Grounding',
    description: 'Come back to the present',
  },
];

const SUPPORTIVE_MESSAGES = [
  "This feeling is data, not destiny.",
  "You're building awareness.",
  "Noticing is the first step.",
  "This moment will pass.",
  "You're stronger than this feeling.",
];

export function DysphoriaSupport({
  intensity,
  onSupportSelected,
  onSkip,
}: DysphoriaSupportProps) {
  const { isBambiMode } = useBambiMode();

  // More intense = more support offered
  void (intensity >= 3); // showAllOptions - reserved for future conditional support rendering
  const message = SUPPORTIVE_MESSAGES[Math.floor(Math.random() * SUPPORTIVE_MESSAGES.length)];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div
        className={`w-full max-w-sm rounded-2xl overflow-hidden ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`p-6 text-center ${
            isBambiMode
              ? 'bg-gradient-to-br from-slate-100 to-gray-100'
              : 'bg-gradient-to-br from-slate-800/50 to-gray-800/50'
          }`}
        >
          <div className="text-3xl mb-2">💜</div>
          <h2
            className={`text-lg font-semibold mb-1 ${
              isBambiMode ? 'text-slate-800' : 'text-protocol-text'
            }`}
          >
            Logged.
          </h2>
          <p
            className={`text-sm ${
              isBambiMode ? 'text-slate-600' : 'text-protocol-text-muted'
            }`}
          >
            {message}
          </p>
        </div>

        {/* Support Options */}
        <div className="p-4 space-y-2">
          <p
            className={`text-sm font-medium mb-3 ${
              isBambiMode ? 'text-gray-700' : 'text-protocol-text-muted'
            }`}
          >
            Would anything help right now?
          </p>

          {SUPPORT_OPTIONS.map((option) => (
            <button
              key={option.type}
              onClick={() => onSupportSelected(option.type)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all
                          hover:scale-[1.02] active:scale-[0.98] ${
                isBambiMode
                  ? 'bg-slate-50 hover:bg-slate-100 border border-slate-200'
                  : 'bg-protocol-surface hover:bg-protocol-surface/80 border border-protocol-border'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isBambiMode
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                <option.icon className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p
                  className={`font-medium ${
                    isBambiMode ? 'text-slate-800' : 'text-protocol-text'
                  }`}
                >
                  {option.label}
                </p>
                <p
                  className={`text-xs ${
                    isBambiMode ? 'text-slate-500' : 'text-protocol-text-muted'
                  }`}
                >
                  {option.description}
                </p>
              </div>
            </button>
          ))}

          {/* Skip button */}
          <button
            onClick={onSkip}
            className={`w-full py-3 mt-2 rounded-xl font-medium transition-all ${
              isBambiMode
                ? 'text-slate-500 hover:bg-slate-100'
                : 'text-protocol-text-muted hover:bg-protocol-surface'
            }`}
          >
            I'm okay, close
          </button>
        </div>
      </div>
    </div>
  );
}
