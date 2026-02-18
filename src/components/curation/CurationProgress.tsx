/**
 * Curation Progress
 *
 * Displays session progress with intensity level and decision counts.
 */

import { Check, X, Wrench } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { INTENSITY_CONFIG } from '../../types/task-bank';

interface CurationProgressProps {
  currentIntensity: number;
  stats: {
    shown: number;
    kept: number;
    rejected: number;
    needsWork: number;
  };
}

export function CurationProgress({ currentIntensity, stats }: CurationProgressProps) {
  const { isBambiMode } = useBambiMode();

  const intensityConfig = INTENSITY_CONFIG[currentIntensity] || INTENSITY_CONFIG[1];

  // Intensity dot colors
  const getDotColor = (level: number) => {
    if (level > currentIntensity) {
      return isBambiMode ? 'bg-pink-100' : 'bg-protocol-border';
    }

    const colors: Record<number, string> = {
      1: 'bg-emerald-500',
      2: 'bg-teal-500',
      3: 'bg-amber-500',
      4: 'bg-orange-500',
      5: 'bg-red-500',
    };
    return colors[level] || colors[1];
  };

  return (
    <div
      className={`p-4 rounded-xl ${
        isBambiMode
          ? 'bg-white border border-pink-200'
          : 'bg-protocol-surface'
      }`}
    >
      {/* Intensity level */}
      <div className="flex items-center justify-between mb-4">
        <span
          className={`text-sm font-medium ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}
        >
          Intensity Level
        </span>
        <span
          className={`text-sm font-medium ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          {intensityConfig.label}
        </span>
      </div>

      {/* Intensity dots */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className={`w-8 h-2 rounded-full transition-colors ${getDotColor(level)}`}
          />
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className={`flex items-center gap-2 p-2 rounded-lg ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
          }`}
        >
          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <p
              className={`text-lg font-bold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {stats.kept}
            </p>
            <p
              className={`text-[10px] uppercase ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              Kept
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 p-2 rounded-lg ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
          }`}
        >
          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
            <X className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p
              className={`text-lg font-bold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {stats.rejected}
            </p>
            <p
              className={`text-[10px] uppercase ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              Rejected
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 p-2 rounded-lg ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
          }`}
        >
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
            <Wrench className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p
              className={`text-lg font-bold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {stats.needsWork}
            </p>
            <p
              className={`text-[10px] uppercase ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              Flagged
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
