// Type Selector - Euphoria/Dysphoria/Arousal choice
// Three buttons for quick selection

import { Sparkles, Cloud, Flame } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { MomentType } from '../../../types/moment-logger';

interface TypeSelectorProps {
  onSelect: (type: MomentType) => void;
}

export function TypeSelector({ onSelect }: TypeSelectorProps) {
  const { isBambiMode } = useBambiMode();

  return (
    <div className="space-y-3">
      {/* Euphoria Button */}
      <button
        onClick={() => onSelect('euphoria')}
        className={`w-full flex items-center gap-4 p-4 rounded-xl
                    transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
          isBambiMode
            ? 'bg-gradient-to-r from-pink-100 to-fuchsia-100 hover:from-pink-200 hover:to-fuchsia-200 border-2 border-pink-300'
            : 'bg-gradient-to-r from-emerald-900/30 to-teal-900/30 hover:from-emerald-900/50 hover:to-teal-900/50 border-2 border-emerald-600/50'
        }`}
      >
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-400 to-fuchsia-500'
              : 'bg-gradient-to-br from-emerald-500 to-teal-500'
          }`}
        >
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="text-left">
          <span
            className={`text-lg font-semibold block ${
              isBambiMode ? 'text-pink-700' : 'text-emerald-300'
            }`}
          >
            Euphoria
          </span>
          <span
            className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-emerald-400/70'
            }`}
          >
            Feeling aligned, happy, affirmed
          </span>
        </div>
      </button>

      {/* Arousal Button */}
      <button
        onClick={() => onSelect('arousal')}
        className={`w-full flex items-center gap-4 p-4 rounded-xl
                    transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
          isBambiMode
            ? 'bg-gradient-to-r from-orange-100 to-red-100 hover:from-orange-200 hover:to-red-200 border-2 border-orange-300'
            : 'bg-gradient-to-r from-orange-900/30 to-red-900/30 hover:from-orange-900/50 hover:to-red-900/50 border-2 border-orange-600/50'
        }`}
      >
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            isBambiMode
              ? 'bg-gradient-to-br from-orange-400 to-red-500'
              : 'bg-gradient-to-br from-orange-500 to-red-500'
          }`}
        >
          <Flame className="w-6 h-6 text-white" />
        </div>
        <div className="text-left">
          <span
            className={`text-lg font-semibold block ${
              isBambiMode ? 'text-orange-700' : 'text-orange-300'
            }`}
          >
            Arousal
          </span>
          <span
            className={`text-xs ${
              isBambiMode ? 'text-orange-500' : 'text-orange-400/70'
            }`}
          >
            Feeling turned on, needy, aching
          </span>
        </div>
      </button>

      {/* Dysphoria Button */}
      <button
        onClick={() => onSelect('dysphoria')}
        className={`w-full flex items-center gap-4 p-4 rounded-xl
                    transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
          isBambiMode
            ? 'bg-gradient-to-r from-slate-100 to-gray-100 hover:from-slate-200 hover:to-gray-200 border-2 border-slate-300'
            : 'bg-gradient-to-r from-slate-800/50 to-gray-800/50 hover:from-slate-700/50 hover:to-gray-700/50 border-2 border-slate-600/50'
        }`}
      >
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            isBambiMode
              ? 'bg-gradient-to-br from-slate-400 to-gray-500'
              : 'bg-gradient-to-br from-slate-500 to-gray-600'
          }`}
        >
          <Cloud className="w-6 h-6 text-white" />
        </div>
        <div className="text-left">
          <span
            className={`text-lg font-semibold block ${
              isBambiMode ? 'text-slate-700' : 'text-slate-300'
            }`}
          >
            Dysphoria
          </span>
          <span
            className={`text-xs ${
              isBambiMode ? 'text-slate-500' : 'text-slate-400/70'
            }`}
          >
            Feeling off, disconnected, uncomfortable
          </span>
        </div>
      </button>
    </div>
  );
}
