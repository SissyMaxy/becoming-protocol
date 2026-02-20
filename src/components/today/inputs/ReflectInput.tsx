import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { CompletionData } from '../../../types/task-bank';

interface ReflectInputProps {
  placeholder?: string;
  intensity: number;
  isCompleting: boolean;
  onComplete: (data: CompletionData) => void;
  getGradient: (intensity: number, bambi: boolean) => string;
}

const MAX_CHARS = 500;
const MIN_CHARS = 10;

export function ReflectInput({ placeholder, intensity, isCompleting, onComplete, getGradient }: ReflectInputProps) {
  const { isBambiMode } = useBambiMode();
  const [text, setText] = useState('');

  const trimmed = text.trim();
  const isReady = trimmed.length >= MIN_CHARS;
  const remaining = MAX_CHARS - text.length;

  const handleComplete = () => {
    if (!isReady) return;
    onComplete({
      completion_type: 'reflect',
      reflection_text: trimmed,
    });
  };

  return (
    <div className="flex-1 space-y-3">
      {/* Text area */}
      <textarea
        value={text}
        onChange={(e) => {
          if (e.target.value.length <= MAX_CHARS) {
            setText(e.target.value);
          }
        }}
        placeholder={placeholder || 'Share your reflection...'}
        rows={3}
        className={`w-full px-3 py-2.5 rounded-xl border text-sm resize-none transition-colors ${
          isBambiMode
            ? 'border-pink-200 bg-pink-50/50 text-gray-800 placeholder:text-pink-300 focus:border-pink-400 focus:ring-pink-400'
            : 'border-protocol-border bg-protocol-bg text-protocol-text placeholder:text-protocol-text-muted focus:border-protocol-accent focus:ring-protocol-accent'
        } focus:outline-none focus:ring-1`}
        style={{ minHeight: '4.5rem' }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = 'auto';
          target.style.height = Math.min(target.scrollHeight, 200) + 'px';
        }}
      />

      {/* Character count / hint */}
      <div className="flex justify-between items-center">
        {trimmed.length > 0 && trimmed.length < MIN_CHARS ? (
          <span className={`text-xs ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            {MIN_CHARS - trimmed.length} more characters needed
          </span>
        ) : (
          <span />
        )}
        <span className={`text-xs ${
          remaining < 50
            ? 'text-amber-500'
            : isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
        }`}>
          {remaining}
        </span>
      </div>

      {/* Submit */}
      <button
        onClick={handleComplete}
        disabled={isCompleting || !isReady}
        className={`w-full py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] ${
          !isReady ? 'opacity-50 cursor-not-allowed' : ''
        } bg-gradient-to-r ${
          getGradient(intensity, isBambiMode)
        } hover:opacity-90`}
      >
        {isCompleting ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Check className="w-5 h-5" />
            <span>Submit Reflection</span>
          </span>
        )}
      </button>
    </div>
  );
}
