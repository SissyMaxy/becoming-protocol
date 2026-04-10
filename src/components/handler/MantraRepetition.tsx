import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface MantraRepetitionProps {
  mantra: string;
  repetitions: number;
  onComplete: () => void;
  reasonShown?: string;
}

export function MantraRepetition({ mantra, repetitions, onComplete, reasonShown }: MantraRepetitionProps) {
  const { user } = useAuth();
  const [completed, setCompleted] = useState(0);
  const [currentInput, setCurrentInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [completed]);

  const handleSubmit = async () => {
    const normalized = currentInput.trim().toLowerCase();
    const target = mantra.toLowerCase();
    if (normalized !== target) return;

    const newCount = completed + 1;
    setCompleted(newCount);
    setCurrentInput('');

    if (newCount >= repetitions) {
      setSubmitting(true);
      // Log completion
      if (user?.id) {
        try {
          await supabase.from('handler_notes').insert({
            user_id: user.id,
            note_type: 'mantra_completed',
            content: `Completed ${repetitions}x: "${mantra}"`,
            priority: 2,
          });
        } catch {}
      }
      setSubmitting(false);
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-6">
        {reasonShown && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 text-sm text-red-300 text-center">
            {reasonShown}
          </div>
        )}

        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white">Type this {repetitions} times</h2>
          <p className="text-sm text-gray-400">{completed}/{repetitions} complete</p>
        </div>

        <div className="bg-purple-900/30 border-2 border-purple-500/50 rounded-xl p-6 text-center">
          <p className="text-2xl font-medium text-purple-200 italic">
            "{mantra}"
          </p>
        </div>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && currentInput.trim().toLowerCase() === mantra.toLowerCase()) {
                handleSubmit();
              }
            }}
            placeholder="Type the exact words..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-white text-center text-lg"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />

          <button
            onClick={handleSubmit}
            disabled={currentInput.trim().toLowerCase() !== mantra.toLowerCase() || submitting}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Submit'}
          </button>
        </div>

        <div className="flex justify-center gap-1">
          {Array.from({ length: repetitions }).map((_, i) => (
            <div
              key={i}
              className={`w-8 h-2 rounded-full ${
                i < completed ? 'bg-purple-500' : 'bg-gray-800'
              }`}
            />
          ))}
        </div>

        <p className="text-xs text-gray-600 text-center">
          You cannot skip this. The Handler is waiting for you to finish.
        </p>
      </div>
    </div>
  );
}
