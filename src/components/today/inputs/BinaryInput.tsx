import { Loader2, Check } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { CompletionData } from '../../../types/task-bank';

interface BinaryInputProps {
  intensity: number;
  isCompleting: boolean;
  onComplete: (data: CompletionData) => void;
  getGradient: (intensity: number, bambi: boolean) => string;
}

export function BinaryInput({ intensity, isCompleting, onComplete, getGradient }: BinaryInputProps) {
  const { isBambiMode } = useBambiMode();

  const handleComplete = (feltGood: boolean) => {
    onComplete({
      completion_type: 'binary',
      fields: { felt_good: feltGood },
    });
  };

  return (
    <div className="flex-1 flex gap-2">
      <button
        onClick={() => handleComplete(false)}
        disabled={isCompleting}
        className={`flex-1 py-3 rounded-xl font-semibold transition-all active:scale-[0.98] ${
          isBambiMode
            ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
        }`}
      >
        {isCompleting ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        ) : (
          'No'
        )}
      </button>
      <button
        onClick={() => handleComplete(true)}
        disabled={isCompleting}
        className={`flex-1 py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] bg-gradient-to-r ${
          getGradient(intensity, isBambiMode)
        } hover:opacity-90`}
      >
        {isCompleting ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Check className="w-5 h-5" />
            <span>Yes</span>
          </span>
        )}
      </button>
    </div>
  );
}
