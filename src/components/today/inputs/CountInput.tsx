import { useState } from 'react';
import { Plus, Minus, Check, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { CompletionData } from '../../../types/task-bank';

interface CountInputProps {
  targetCount?: number;
  currentProgress: number;
  intensity: number;
  isCompleting: boolean;
  onComplete: (data: CompletionData) => void;
  onIncrement?: () => void;
  getGradient: (intensity: number, bambi: boolean) => string;
}

export function CountInput({
  targetCount,
  currentProgress,
  intensity,
  isCompleting,
  onComplete,
  onIncrement,
  getGradient,
}: CountInputProps) {
  const { isBambiMode } = useBambiMode();
  const [localCount, setLocalCount] = useState(currentProgress);
  const target = targetCount || 1;
  const progressPercent = Math.min(100, (localCount / target) * 100);

  const handleIncrement = () => {
    const newCount = localCount + 1;
    setLocalCount(newCount);
    onIncrement?.();

    // Auto-complete when target reached
    if (newCount >= target) {
      onComplete({
        completion_type: 'count',
        count_value: newCount,
      });
    }
  };

  const handleDecrement = () => {
    if (localCount > 0) {
      setLocalCount(localCount - 1);
    }
  };

  const handleManualComplete = () => {
    onComplete({
      completion_type: 'count',
      count_value: localCount,
    });
  };

  return (
    <div className="flex-1 space-y-3">
      {/* Counter display */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={handleDecrement}
          disabled={localCount <= 0}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            localCount <= 0
              ? 'opacity-30 cursor-not-allowed'
              : isBambiMode
                ? 'bg-pink-100 text-pink-600 hover:bg-pink-200 active:bg-pink-300'
                : 'bg-protocol-bg text-protocol-text hover:bg-protocol-surface active:bg-protocol-border'
          }`}
        >
          <Minus className="w-5 h-5" />
        </button>

        <div className="text-center">
          <span className={`text-3xl font-bold font-mono ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            {localCount}
          </span>
          {targetCount && (
            <span className={`text-sm block ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              / {targetCount}
            </span>
          )}
        </div>

        <button
          onClick={handleIncrement}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600 hover:bg-pink-200 active:bg-pink-300'
              : 'bg-protocol-bg text-protocol-text hover:bg-protocol-surface active:bg-protocol-border'
          }`}
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Progress bar (only if target specified) */}
      {targetCount && (
        <div className={`h-1.5 rounded-full overflow-hidden ${
          isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
        }`}>
          <div
            className={`h-full rounded-full transition-all duration-300 bg-gradient-to-r ${
              getGradient(intensity, isBambiMode)
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Complete button (only if not auto-completing at target) */}
      {localCount > 0 && localCount < target && (
        <button
          onClick={handleManualComplete}
          disabled={isCompleting}
          className={`w-full py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] bg-gradient-to-r ${
            getGradient(intensity, isBambiMode)
          } hover:opacity-90`}
        >
          {isCompleting ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Check className="w-5 h-5" />
              <span>Done ({localCount}/{targetCount})</span>
            </span>
          )}
        </button>
      )}
    </div>
  );
}
