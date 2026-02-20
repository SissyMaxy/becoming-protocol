/**
 * Protein Tracker — 5 checkboxes with gram estimates, color-coded summary, 7-day trend.
 */

import { Check, Utensils } from 'lucide-react';
import { useProtein } from '../../hooks/useProtein';
import { PROTEIN_SOURCES, countSources } from '../../types/protein';

export function ProteinTracker() {
  const { today, count, grams, rating, history, isLoading, toggle } = useProtein();

  if (isLoading) return null;

  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
      <div className="flex items-center gap-2 mb-3">
        <Utensils className="w-4 h-4 text-green-400" />
        <span className="text-sm font-medium text-white/80">Protein Today</span>
      </div>

      {/* Checkboxes */}
      <div className="space-y-2 mb-3">
        {PROTEIN_SOURCES.map(src => {
          const checked = today ? today[src.key] : false;
          return (
            <button
              key={src.key}
              onClick={() => toggle(src.key, !checked)}
              className="w-full flex items-center gap-3 py-1.5 group"
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                checked
                  ? 'bg-green-500'
                  : 'bg-white/10 group-hover:bg-white/20'
              }`}>
                {checked && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
              <span className={`text-sm flex-1 text-left ${
                checked ? 'text-white' : 'text-white/50'
              }`}>
                {src.label}
              </span>
              <span className="text-xs text-white/30">~{src.estimatedGrams}g</span>
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <div className="border-t border-white/10 pt-3 mb-3">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${rating.color}`}>
            {count}/5 sources &middot; ~{grams}g
          </span>
          <span className={`text-xs ${rating.color}`}>{rating.label}</span>
        </div>
      </div>

      {/* 7-day trend */}
      {history.length > 0 && (
        <div>
          <p className="text-xs text-white/30 mb-2">7-day trend</p>
          <div className="flex items-end gap-1 h-8">
            {Array.from({ length: 7 }).map((_, i) => {
              const date = new Date();
              date.setDate(date.getDate() - (6 - i));
              const dateStr = date.toISOString().slice(0, 10);
              const entry = history.find(h => h.date === dateStr);
              const dayCount = entry ? countSources(entry) : 0;
              const heightPct = dayCount > 0 ? (dayCount / 5) * 100 : 4;
              const barColor = dayCount >= 4
                ? 'bg-green-500'
                : dayCount === 3
                  ? 'bg-yellow-500'
                  : dayCount > 0
                    ? 'bg-red-400'
                    : 'bg-white/10';

              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-sm transition-all ${barColor}`}
                    style={{ height: `${heightPct}%`, minHeight: '2px' }}
                  />
                  <span className="text-[9px] text-white/20">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
