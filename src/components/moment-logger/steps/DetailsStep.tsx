// Details Step - Intensity picker + Trigger grid
// Combined for speed: select intensity, optionally add triggers, then save

import { Loader2 } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import {
  MomentType,
  MomentIntensity,
  INTENSITY_CONFIG,
  EUPHORIA_TRIGGERS,
  DYSPHORIA_TRIGGERS,
  AROUSAL_TRIGGERS,
} from '../../../types/moment-logger';

interface DetailsStepProps {
  type: MomentType;
  intensity: MomentIntensity;
  triggers: string[];
  customText: string;
  onIntensityChange: (intensity: MomentIntensity) => void;
  onToggleTrigger: (triggerId: string) => void;
  onCustomTextChange: (text: string) => void;
  onSave: () => Promise<unknown>;
  isLoading: boolean;
}

export function DetailsStep({
  type,
  intensity,
  triggers,
  customText,
  onIntensityChange,
  onToggleTrigger,
  onCustomTextChange,
  onSave,
  isLoading,
}: DetailsStepProps) {
  const { isBambiMode } = useBambiMode();
  const isEuphoria = type === 'euphoria';
  const isArousal = type === 'arousal';
  const triggerOptions = isEuphoria
    ? EUPHORIA_TRIGGERS
    : isArousal
      ? AROUSAL_TRIGGERS
      : DYSPHORIA_TRIGGERS;

  // Color scheme based on type
  const colors = isArousal
    ? {
        accent: 'orange',
        selectedBg: isBambiMode ? 'bg-orange-500' : 'bg-orange-500',
        selectedText: 'text-white',
        unselectedBg: isBambiMode ? 'bg-orange-100' : 'bg-orange-900/30',
        unselectedText: isBambiMode ? 'text-orange-700' : 'text-orange-300',
        buttonBg: isBambiMode
          ? 'bg-gradient-to-r from-orange-500 to-red-500'
          : 'bg-gradient-to-r from-orange-500 to-red-500',
      }
    : isEuphoria
    ? {
        accent: isBambiMode ? 'pink' : 'emerald',
        selectedBg: isBambiMode ? 'bg-pink-500' : 'bg-emerald-500',
        selectedText: 'text-white',
        unselectedBg: isBambiMode ? 'bg-pink-100' : 'bg-emerald-900/30',
        unselectedText: isBambiMode ? 'text-pink-700' : 'text-emerald-300',
        buttonBg: isBambiMode
          ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500'
          : 'bg-gradient-to-r from-emerald-500 to-teal-500',
      }
    : {
        accent: isBambiMode ? 'slate' : 'slate',
        selectedBg: isBambiMode ? 'bg-slate-500' : 'bg-slate-500',
        selectedText: 'text-white',
        unselectedBg: isBambiMode ? 'bg-slate-100' : 'bg-slate-800/50',
        unselectedText: isBambiMode ? 'text-slate-700' : 'text-slate-300',
        buttonBg: isBambiMode
          ? 'bg-gradient-to-r from-slate-500 to-gray-500'
          : 'bg-gradient-to-r from-slate-500 to-gray-600',
      };

  return (
    <div className="space-y-4">
      {/* Intensity Picker */}
      <div>
        <label
          className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text-muted'
          }`}
        >
          How strong?
        </label>
        <div className="grid grid-cols-4 gap-2">
          {([1, 2, 3, 4] as MomentIntensity[]).map((level) => {
            const config = INTENSITY_CONFIG[level];
            const isSelected = intensity === level;

            return (
              <button
                key={level}
                onClick={() => onIntensityChange(level)}
                className={`flex flex-col items-center p-2 rounded-lg transition-all ${
                  isSelected
                    ? `${colors.selectedBg} ${colors.selectedText}`
                    : `${colors.unselectedBg} ${colors.unselectedText} hover:opacity-80`
                }`}
              >
                <span className="text-xl">{config.emoji}</span>
                <span className="text-xs mt-1">{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Trigger Grid */}
      <div>
        <label
          className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text-muted'
          }`}
        >
          What triggered it? <span className="font-normal opacity-60">(optional)</span>
        </label>
        <div className="grid grid-cols-4 gap-2">
          {triggerOptions.map((trigger) => {
            const isSelected = triggers.includes(trigger.id);

            return (
              <button
                key={trigger.id}
                onClick={() => onToggleTrigger(trigger.id)}
                className={`flex flex-col items-center p-2 rounded-lg transition-all text-center ${
                  isSelected
                    ? `${colors.selectedBg} ${colors.selectedText}`
                    : `${colors.unselectedBg} ${colors.unselectedText} hover:opacity-80`
                }`}
              >
                <span className="text-lg">{trigger.emoji}</span>
                <span className="text-[10px] mt-0.5 leading-tight line-clamp-2">
                  {trigger.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom trigger text (optional) */}
      <input
        type="text"
        value={customText}
        onChange={(e) => onCustomTextChange(e.target.value)}
        placeholder="Other trigger..."
        className={`w-full px-3 py-2 rounded-lg text-sm ${
          isBambiMode
            ? 'bg-gray-100 text-gray-800 placeholder:text-gray-400 border border-gray-200'
            : 'bg-protocol-surface text-protocol-text placeholder:text-protocol-text-muted/50 border border-protocol-border'
        } focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
          isArousal
            ? 'focus:ring-orange-400'
            : isEuphoria
              ? isBambiMode ? 'focus:ring-pink-400' : 'focus:ring-emerald-500'
              : 'focus:ring-slate-400'
        }`}
      />

      {/* Save Button */}
      <button
        onClick={onSave}
        disabled={isLoading}
        className={`w-full py-3 rounded-xl font-semibold text-white transition-all
                    flex items-center justify-center gap-2
                    disabled:opacity-50 disabled:cursor-not-allowed
                    hover:opacity-90 active:scale-[0.98] ${colors.buttonBg}`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Logging...
          </>
        ) : (
          'Log It'
        )}
      </button>
    </div>
  );
}
