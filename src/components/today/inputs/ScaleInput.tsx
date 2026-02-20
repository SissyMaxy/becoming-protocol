import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { CompletionData } from '../../../types/task-bank';

interface ScaleInputProps {
  intensity: number;
  isCompleting: boolean;
  onComplete: (data: CompletionData) => void;
  getGradient: (intensity: number, bambi: boolean) => string;
}

export function ScaleInput({ intensity, isCompleting, onComplete, getGradient }: ScaleInputProps) {
  const { isBambiMode } = useBambiMode();
  const [value, setValue] = useState(5);

  const handleComplete = () => {
    onComplete({
      completion_type: 'scale',
      scale_value: value,
    });
  };

  return (
    <div className="flex-1 space-y-3">
      {/* Value display */}
      <div className="flex items-center justify-between">
        <span className={`text-xs ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`}>
          Rate 1-10
        </span>
        <span className={`text-2xl font-bold ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text'
        }`}>
          {value}
        </span>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className={`w-full h-2 rounded-full appearance-none cursor-pointer ${
          isBambiMode ? 'accent-pink-500' : 'accent-emerald-500'
        }`}
        style={{
          background: `linear-gradient(to right, ${
            isBambiMode ? '#ec4899' : '#10b981'
          } ${((value - 1) / 9) * 100}%, ${
            isBambiMode ? '#fce7f3' : '#1a1a2e'
          } ${((value - 1) / 9) * 100}%)`,
        }}
      />

      {/* Scale labels */}
      <div className="flex justify-between px-1">
        <span className={`text-[10px] ${
          isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
        }`}>Low</span>
        <span className={`text-[10px] ${
          isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
        }`}>High</span>
      </div>

      {/* Submit */}
      <button
        onClick={handleComplete}
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
            <span>Submit ({value}/10)</span>
          </span>
        )}
      </button>
    </div>
  );
}
