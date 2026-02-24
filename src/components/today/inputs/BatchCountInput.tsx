/**
 * BatchCountInput — "Do N reps, then tap Done"
 * For exercises where hands are occupied (floor work, planks, etc.)
 * No tap-per-rep counter — just the target and a single Done button.
 */

import { Check, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { CompletionData } from '../../../types/task-bank';

interface BatchCountInputProps {
  targetCount?: number;
  intensity: number;
  isCompleting: boolean;
  onComplete: (data: CompletionData) => void;
  getGradient: (intensity: number, bambi: boolean) => string;
}

export function BatchCountInput({
  targetCount,
  intensity,
  isCompleting,
  onComplete,
  getGradient,
}: BatchCountInputProps) {
  const { isBambiMode } = useBambiMode();
  const target = targetCount || 1;

  const handleDone = () => {
    onComplete({
      completion_type: 'batch_count',
      count_value: target,
    });
  };

  return (
    <div className="flex-1 space-y-3">
      {/* Target display */}
      <div className="text-center py-2">
        <span className={`text-3xl font-bold font-mono ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text'
        }`}>
          {target}
        </span>
        <span className={`text-sm block mt-1 ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`}>
          reps
        </span>
      </div>

      {/* Done button */}
      <button
        onClick={handleDone}
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
            <span>Done</span>
          </span>
        )}
      </button>
    </div>
  );
}
