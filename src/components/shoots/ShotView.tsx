/**
 * ShotView — Full-screen shot-by-shot reference viewer
 * Shows SVG reference + instructions one shot at a time.
 * "Got it — Next" advances through the shot list.
 */

import { useState, useEffect } from 'react';
import {
  ChevronRight, ChevronLeft, Check, X, Camera,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { ShotListEntry, ShootReferenceImage } from '../../types/industry';

interface ShotViewProps {
  shots: ShotListEntry[];
  references: Map<string, ShootReferenceImage>;
  shootTitle: string;
  previousBests?: Map<string, string>; // ref name → vault URL
  onComplete: () => void;
  onClose: () => void;
}

export function ShotView({
  shots,
  references,
  shootTitle,
  previousBests,
  onComplete,
  onClose,
}: ShotViewProps) {
  const { isBambiMode } = useBambiMode();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedShots, setCompletedShots] = useState<Set<number>>(new Set());

  const currentShot = shots[currentIndex];
  const ref = currentShot ? references.get(currentShot.ref) : null;
  const previousBest = currentShot && previousBests ? previousBests.get(currentShot.ref) : null;
  const isLast = currentIndex === shots.length - 1;
  const progress = ((currentIndex + 1) / shots.length) * 100;

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const handleNext = () => {
    setCompletedShots(prev => new Set(prev).add(currentIndex));
    if (isLast) {
      onComplete();
    } else {
      setCurrentIndex(i => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  };

  if (!currentShot) return null;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${
      isBambiMode ? 'bg-white' : 'bg-protocol-bg'
    }`}>
      {/* Top bar */}
      <div className={`flex items-center justify-between px-4 py-3 ${
        isBambiMode ? 'bg-pink-50 border-b border-pink-100' : 'bg-protocol-surface border-b border-protocol-border'
      }`}>
        <button onClick={onClose} className="p-1">
          <X className={`w-5 h-5 ${isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}`} />
        </button>
        <div className="text-center">
          <p className={`text-xs font-semibold ${
            isBambiMode ? 'text-gray-800' : 'text-protocol-text'
          }`}>
            Shot {currentIndex + 1} of {shots.length}
          </p>
          <p className={`text-[10px] ${
            isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
          }`}>
            {shootTitle}
          </p>
        </div>
        <div className="w-6" /> {/* spacer */}
      </div>

      {/* Progress bar */}
      <div className={`h-1 ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-border'}`}>
        <div
          className={`h-full transition-all duration-300 ${
            isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Shot content — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Reference SVG */}
        <div className={`p-4 ${
          isBambiMode ? 'bg-gray-50' : 'bg-protocol-surface'
        }`}>
          {ref?.svgData ? (
            <div className="flex justify-center">
              <div
                className="w-full max-w-[240px]"
                dangerouslySetInnerHTML={{ __html: ref.svgData }}
              />
            </div>
          ) : (
            <div className={`flex items-center justify-center h-48 rounded-lg ${
              isBambiMode ? 'bg-gray-100' : 'bg-protocol-bg'
            }`}>
              <Camera className={`w-12 h-12 ${
                isBambiMode ? 'text-gray-300' : 'text-protocol-border'
              }`} />
            </div>
          )}

          {ref && (
            <p className={`text-center text-[10px] mt-2 ${
              isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
            }`}>
              {ref.angle} — {ref.bodyPosition}
            </p>
          )}
        </div>

        {/* Instructions */}
        <div className="px-4 py-4 space-y-4">
          {/* Shot name + count */}
          <div>
            <h3 className={`text-base font-semibold ${
              isBambiMode ? 'text-gray-800' : 'text-protocol-text'
            }`}>
              {currentShot.ref.replace(/_/g, ' ')}
            </h3>
            <p className={`text-xs mt-0.5 ${
              isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
            }`}>
              {currentShot.count ? `Take ${currentShot.count} photos` : ''}
              {currentShot.durationSeconds ? `Record ${currentShot.durationSeconds} seconds` : ''}
              {!currentShot.count && !currentShot.durationSeconds ? 'Capture this shot' : ''}
              {' — Handler picks the best'}
            </p>
          </div>

          {/* Notes / instructions */}
          {currentShot.notes && (
            <div className={`rounded-lg p-3 ${
              isBambiMode
                ? 'bg-amber-50 border border-amber-100'
                : 'bg-amber-900/20 border border-amber-800/30'
            }`}>
              <p className={`text-xs ${
                isBambiMode ? 'text-amber-700' : 'text-amber-300'
              }`}>
                {currentShot.notes}
              </p>
            </div>
          )}

          {/* Reference details */}
          {ref && (
            <div className="space-y-1">
              {ref.lighting && (
                <RefDetail label="Lighting" value={ref.lighting} isBambiMode={isBambiMode} />
              )}
              {ref.cameraPosition && (
                <RefDetail label="Camera" value={ref.cameraPosition} isBambiMode={isBambiMode} />
              )}
              {ref.description && (
                <p className={`text-xs mt-2 ${
                  isBambiMode ? 'text-gray-500' : 'text-protocol-text-secondary'
                }`}>
                  {ref.description}
                </p>
              )}
            </div>
          )}

          {/* Previous best */}
          {previousBest && (
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 ${
                isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
              }`}>
                Your best previous
              </p>
              <img
                src={previousBest}
                alt="Previous best"
                className="w-32 h-32 object-cover rounded-lg"
              />
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className={`flex items-center gap-3 px-4 py-4 ${
        isBambiMode ? 'bg-white border-t border-gray-100' : 'bg-protocol-surface border-t border-protocol-border'
      }`}>
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className={`p-2.5 rounded-lg transition-colors ${
            currentIndex === 0
              ? 'opacity-30 cursor-not-allowed'
              : isBambiMode ? 'bg-gray-100 hover:bg-gray-200' : 'bg-protocol-bg hover:bg-protocol-border'
          }`}
        >
          <ChevronLeft className={`w-5 h-5 ${
            isBambiMode ? 'text-gray-600' : 'text-protocol-text'
          }`} />
        </button>

        <button
          onClick={handleNext}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold text-white transition-colors ${
            isLast
              ? isBambiMode ? 'bg-green-500 hover:bg-green-600' : 'bg-emerald-600 hover:bg-emerald-500'
              : isBambiMode ? 'bg-pink-500 hover:bg-pink-600' : 'bg-protocol-accent hover:bg-purple-500'
          }`}
        >
          {isLast ? (
            <>
              <Check className="w-4 h-4" />
              Done — Upload Photos
            </>
          ) : (
            <>
              Got it — Next
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Shot dots */}
        <div className="flex gap-1">
          {shots.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIndex
                  ? isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
                  : completedShots.has(i)
                    ? isBambiMode ? 'bg-green-400' : 'bg-emerald-500'
                    : isBambiMode ? 'bg-gray-200' : 'bg-protocol-border'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RefDetail({ label, value, isBambiMode }: { label: string; value: string; isBambiMode: boolean }) {
  return (
    <div className="flex gap-2">
      <span className={`text-[10px] uppercase tracking-wider font-semibold w-14 flex-shrink-0 ${
        isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
      }`}>
        {label}
      </span>
      <span className={`text-xs ${
        isBambiMode ? 'text-gray-600' : 'text-protocol-text-secondary'
      }`}>
        {value}
      </span>
    </div>
  );
}
