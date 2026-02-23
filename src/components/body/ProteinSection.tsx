/**
 * ProteinSection — protein tracking UI with progress bar, time-gated sources,
 * quick-adjust gram estimates, supplements, grocery nudge, and handler messages.
 */

import { Check, Pill, ShoppingCart } from 'lucide-react';
import { countSources, GRAM_ESTIMATES, PROTEIN_TARGET, SUPPLEMENT_ITEMS } from '../../types/protein';
import type { DailyProtein, ProteinSource, GramLevel, ProteinSourceKey, SupplementKey } from '../../types/protein';

interface ProteinSectionProps {
  today: DailyProtein | null;
  count: number;
  grams: number;
  progressPct: number;
  gramsRating: { label: string; color: string; barColor: string };
  rating: { rating: string; label: string; color: string };
  visibleSources: ProteinSource[];
  history: DailyProtein[];
  supplements: { protein: boolean; creatine: boolean; collagen: boolean };
  groceryNudge: boolean;
  handlerMessage: string;
  toggle: (key: ProteinSourceKey, value: boolean) => Promise<void>;
  toggleSupp: (key: SupplementKey, value: boolean) => Promise<void>;
  adjustGrams: (sourceKey: ProteinSourceKey, level: GramLevel) => Promise<void>;
}

const GRAM_LEVELS: GramLevel[] = ['low', 'medium', 'high'];
const GRAM_LABELS: Record<GramLevel, string> = { low: 'L', medium: 'M', high: 'H' };

function getSourceGrams(source: ProteinSource, today: DailyProtein | null): { grams: number; level: GramLevel } {
  const level = (today?.gramAdjustments?.[source.key] as GramLevel) || 'medium';
  const grams = GRAM_ESTIMATES[source.key][level];
  return { grams, level };
}

export function ProteinSection({
  today, count, grams, progressPct, gramsRating, rating,
  visibleSources, history, supplements, groceryNudge, handlerMessage,
  toggle, toggleSupp, adjustGrams,
}: ProteinSectionProps) {
  return (
    <>
      {/* Progress bar toward 130g */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs font-medium ${gramsRating.color}`}>
            ~{grams}g / {PROTEIN_TARGET}g
          </span>
          <span className={`text-xs ${gramsRating.color}`}>{gramsRating.label}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${gramsRating.barColor} ${
              grams >= PROTEIN_TARGET ? 'animate-pulse' : ''
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Protein source checkboxes (time-gated) */}
      <div className="space-y-2 mb-3">
        {visibleSources.map(src => {
          const checked = today ? today[src.key] : false;
          const { grams: srcGrams, level } = getSourceGrams(src, today);
          const canAdjust = src.key !== 'shakePostWorkout';

          return (
            <div key={src.key} className="flex items-center gap-2">
              <button
                onClick={() => toggle(src.key, !checked)}
                className="flex-1 flex items-center gap-3 py-1.5 group"
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                  checked ? 'bg-green-500' : 'bg-white/10 group-hover:bg-white/20'
                }`}>
                  {checked && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className={`text-sm flex-1 text-left ${checked ? 'text-white' : 'text-white/50'}`}>
                  {src.label}
                </span>
              </button>

              {/* Quick-adjust or fixed gram display */}
              {canAdjust ? (
                <div className="flex items-center gap-0.5">
                  {GRAM_LEVELS.map(l => (
                    <button
                      key={l}
                      onClick={() => adjustGrams(src.key, l)}
                      className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                        level === l
                          ? 'bg-purple-500/30 text-purple-300'
                          : 'bg-white/5 text-white/25 hover:text-white/40'
                      }`}
                    >
                      {GRAM_LABELS[l]}
                    </button>
                  ))}
                  <span className="text-xs text-white/30 ml-1 w-7 text-right">~{srcGrams}g</span>
                </div>
              ) : (
                <span className="text-xs text-white/30">~{srcGrams}g</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Supplement row */}
      <div className="flex items-center gap-3 mb-3 py-2 border-t border-b border-white/5">
        <Pill className="w-3.5 h-3.5 text-blue-400" />
        {SUPPLEMENT_ITEMS.map(item => {
          const checked = supplements[item.key.replace('supplement', '').toLowerCase() as keyof typeof supplements];
          return (
            <button
              key={item.key}
              onClick={() => toggleSupp(item.key, !checked)}
              className={`px-2 py-1 rounded-full text-xs transition-colors ${
                checked
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'bg-white/5 text-white/30 hover:text-white/50'
              }`}
            >
              {checked && <span className="mr-1">&#10003;</span>}
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-medium ${rating.color}`}>
          {count}/5 sources
        </span>
        <span className={`text-xs ${rating.color}`}>{rating.label}</span>
      </div>

      {/* Handler message */}
      <p className="text-xs text-white/40 italic mb-3">"{handlerMessage}"</p>

      {/* Grocery nudge */}
      {groceryNudge && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-3 flex items-start gap-2">
          <ShoppingCart className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-300 text-xs font-medium">Low protein this week</p>
            <p className="text-yellow-300/60 text-xs">If the pantry is stocked, the protein takes care of itself.</p>
          </div>
        </div>
      )}

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
    </>
  );
}
