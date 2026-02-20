/**
 * CleanupChecklist — Post-session cleanup items shown when Gina is home or expected.
 * Items reduce as gina corruption level increases.
 * The user sees a practical cleanup list — never sees corruption data.
 */

import { useState } from 'react';
import { Check, AlertTriangle, X } from 'lucide-react';
import { getActiveCleanupItems } from '../../lib/corruption-behaviors';

interface CleanupChecklistProps {
  ginaCorruptionLevel: number;
  onDismiss: () => void;
}

export function CleanupChecklist({ ginaCorruptionLevel, onDismiss }: CleanupChecklistProps) {
  const items = getActiveCleanupItems(ginaCorruptionLevel);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked = checked.size >= items.length;

  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center px-4 pb-8">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="text-white font-semibold">Quick Cleanup</h3>
          </div>
          {allChecked && (
            <button
              onClick={onDismiss}
              className="p-1 text-white/40 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="space-y-2 mb-4">
          {items.map(item => {
            const isChecked = checked.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                  isChecked
                    ? 'bg-green-500/10 border border-green-500/20'
                    : 'bg-white/5 border border-white/10'
                }`}
              >
                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                  isChecked ? 'bg-green-500' : 'border border-white/20'
                }`}>
                  {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className={`text-sm ${
                  isChecked ? 'text-white/40 line-through' : 'text-white/80'
                }`}>
                  {item.text}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={onDismiss}
          disabled={!allChecked}
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${
            allChecked
              ? 'bg-green-500 text-white'
              : 'bg-white/5 text-white/30 cursor-not-allowed'
          }`}
        >
          {allChecked ? 'All Clear' : `${checked.size}/${items.length} checked`}
        </button>
      </div>
    </div>
  );
}
