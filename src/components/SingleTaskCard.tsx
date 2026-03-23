/**
 * SingleTaskCard — one instruction, one button.
 *
 * The Handler delivers ONE task at a time. No list. No choices.
 * Complete it or don't. There is no "skip" or "not now."
 */

import { useState } from 'react';

interface SingleTaskCardProps {
  instruction: string;
  category?: string;
  domain?: string;
  intensity?: number;
  taskId: string;
  onComplete: (taskId: string) => void;
}

export function SingleTaskCard({
  instruction,
  category,
  domain,
  intensity,
  taskId,
  onComplete,
}: SingleTaskCardProps) {
  const [completing, setCompleting] = useState(false);

  const handleComplete = async () => {
    setCompleting(true);
    await onComplete(taskId);
    setCompleting(false);
  };

  return (
    <div className="bg-[#141414] border border-gray-800/50 rounded-2xl p-6 mx-4">
      {/* Category/domain label */}
      {(category || domain) && (
        <div className="flex items-center gap-2 mb-3">
          {category && (
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              {category}
            </span>
          )}
          {domain && (
            <span className="text-xs text-purple-400/60">
              {domain}
            </span>
          )}
          {intensity != null && intensity >= 4 && (
            <span className="text-xs text-red-400/60">
              intensity {intensity}
            </span>
          )}
        </div>
      )}

      {/* The instruction */}
      <p className="text-gray-200 text-base leading-relaxed mb-6">
        {instruction}
      </p>

      {/* One button */}
      <button
        onClick={handleComplete}
        disabled={completing}
        className={`w-full py-3 rounded-xl font-medium transition-all ${
          completing
            ? 'bg-gray-700 text-gray-400 cursor-wait'
            : 'bg-purple-600/80 text-white hover:bg-purple-500/80 active:bg-purple-700/80'
        }`}
      >
        {completing ? 'Done.' : 'Done'}
      </button>
    </div>
  );
}
