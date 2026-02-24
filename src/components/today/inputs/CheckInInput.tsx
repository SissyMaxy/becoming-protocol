/**
 * CheckInInput — For long-duration tasks (2+ hours)
 * Shows the instruction reminder + optional "How long?" input + Done button.
 * No countdown timer — user does the activity and checks in when done.
 */

import { useState } from 'react';
import { Check, Clock, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { CompletionData } from '../../../types/task-bank';

interface CheckInInputProps {
  durationMinutes?: number;
  subtext?: string;
  intensity: number;
  isCompleting: boolean;
  onComplete: (data: CompletionData) => void;
  getGradient: (intensity: number, bambi: boolean) => string;
}

export function CheckInInput({
  durationMinutes,
  subtext,
  intensity,
  isCompleting,
  onComplete,
  getGradient,
}: CheckInInputProps) {
  const { isBambiMode } = useBambiMode();
  const [actualMinutes, setActualMinutes] = useState('');

  const handleDone = () => {
    const mins = actualMinutes ? parseInt(actualMinutes, 10) : (durationMinutes ?? 0);
    onComplete({
      completion_type: 'check_in',
      actual_duration_seconds: mins * 60,
    });
  };

  return (
    <div className="flex-1 space-y-3">
      {/* Duration hint */}
      {durationMinutes && (
        <div className={`flex items-center justify-center gap-2 py-1 ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`}>
          <Clock className="w-4 h-4" />
          <span className="text-sm">~{durationMinutes} min</span>
        </div>
      )}

      {/* Subtext reminder */}
      {subtext && (
        <p className={`text-xs text-center ${
          isBambiMode ? 'text-pink-300/60' : 'text-protocol-text-muted/60'
        }`}>
          {subtext}
        </p>
      )}

      {/* Optional actual duration input */}
      <div className="flex items-center gap-2 justify-center">
        <label className={`text-xs ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`}>
          How long?
        </label>
        <input
          type="number"
          value={actualMinutes}
          onChange={(e) => setActualMinutes(e.target.value)}
          placeholder={durationMinutes ? `${durationMinutes}` : '—'}
          className={`w-16 px-2 py-1 rounded text-center text-sm ${
            isBambiMode
              ? 'bg-pink-50 text-pink-600 placeholder:text-pink-300'
              : 'bg-protocol-bg text-protocol-text placeholder:text-protocol-text-muted'
          }`}
        />
        <span className={`text-xs ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`}>
          min
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
