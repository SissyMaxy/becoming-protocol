/**
 * HypnoLiveView — Active session experience
 *
 * Immersive session UI with timer, capture controls, and flag button.
 * Uses useHypnoSession for lifecycle management.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Flag, Square, Camera, Headphones } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { HypnoSessionRecord, HypnoLibraryItem } from '../../types/hypno-bridge';

interface HypnoLiveViewProps {
  session: HypnoSessionRecord;
  libraryItem?: HypnoLibraryItem;
  captureCount: number;
  flaggedTimestamps: number[];
  onFlag: () => void;
  onEnd: () => void;
}

export function HypnoLiveView({
  session,
  libraryItem,
  captureCount,
  flaggedTimestamps,
  onFlag,
  onEnd,
}: HypnoLiveViewProps) {
  const { isBambiMode } = useBambiMode();
  const [elapsed, setElapsed] = useState(0);
  const [flagPulse, setFlagPulse] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const startMs = useRef(new Date(session.startedAt).getTime());

  // Elapsed timer
  useEffect(() => {
    const tick = () => setElapsed(Math.round((Date.now() - startMs.current) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  const handleFlag = useCallback(() => {
    onFlag();
    setFlagPulse(true);
    setTimeout(() => setFlagPulse(false), 600);
  }, [onFlag]);

  const handleEnd = useCallback(() => {
    if (!confirmEnd) {
      setConfirmEnd(true);
      setTimeout(() => setConfirmEnd(false), 3000);
      return;
    }
    onEnd();
  }, [confirmEnd, onEnd]);

  const captureMode = session.captureMode || 'none';

  return (
    <div
      className={`min-h-[60vh] flex flex-col ${
        isBambiMode ? 'text-purple-800' : 'text-purple-200'
      }`}
    >
      {/* Session type label */}
      <div className="flex items-center justify-center gap-2 py-3">
        <Headphones
          className={`w-4 h-4 ${isBambiMode ? 'text-purple-400' : 'text-purple-500'}`}
        />
        <span
          className={`text-xs uppercase tracking-wider font-semibold ${
            isBambiMode ? 'text-purple-500' : 'text-purple-400'
          }`}
        >
          {session.sessionType.replace(/_/g, ' ')}
        </span>
        {captureMode !== 'none' && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              isBambiMode
                ? 'bg-amber-100 text-amber-600'
                : 'bg-amber-900/30 text-amber-400'
            }`}
          >
            <Camera className="w-2.5 h-2.5 inline mr-0.5" />
            {captureMode}
          </span>
        )}
      </div>

      {/* Timer — large, centered */}
      <div className="flex-1 flex flex-col items-center justify-center py-8">
        <div
          className={`text-6xl font-mono font-light tracking-tight mb-2 ${
            isBambiMode ? 'text-purple-700' : 'text-purple-300'
          }`}
        >
          {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
        </div>
        <p
          className={`text-xs ${
            isBambiMode ? 'text-purple-400' : 'text-purple-500'
          }`}
        >
          Session in progress
        </p>
      </div>

      {/* Library item info */}
      {libraryItem && (
        <div
          className={`mx-4 p-3 rounded-xl mb-4 ${
            isBambiMode
              ? 'bg-purple-100/60 border border-purple-200'
              : 'bg-purple-900/30 border border-purple-700/20'
          }`}
        >
          <p
            className={`text-sm font-medium ${
              isBambiMode ? 'text-purple-700' : 'text-purple-300'
            }`}
          >
            {libraryItem.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                isBambiMode
                  ? 'bg-purple-200 text-purple-600'
                  : 'bg-purple-800 text-purple-300'
              }`}
            >
              {libraryItem.contentCategory.replace(/_/g, ' ')}
            </span>
            <span
              className={`text-[10px] ${
                isBambiMode ? 'text-purple-500' : 'text-purple-400'
              }`}
            >
              Intensity {'●'.repeat(libraryItem.intensity)}
              {'○'.repeat(5 - libraryItem.intensity)}
            </span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-center gap-6 mb-6">
        <div className="text-center">
          <p
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-purple-700' : 'text-purple-300'
            }`}
          >
            {captureCount}
          </p>
          <p
            className={`text-[10px] uppercase tracking-wide ${
              isBambiMode ? 'text-purple-400' : 'text-purple-500'
            }`}
          >
            Captures
          </p>
        </div>
        <div
          className={`w-px h-8 ${isBambiMode ? 'bg-purple-200' : 'bg-purple-700'}`}
        />
        <div className="text-center">
          <p
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-purple-700' : 'text-purple-300'
            }`}
          >
            {flaggedTimestamps.length}
          </p>
          <p
            className={`text-[10px] uppercase tracking-wide ${
              isBambiMode ? 'text-purple-400' : 'text-purple-500'
            }`}
          >
            Flagged
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-6 space-y-3">
        {/* Flag Moment */}
        <button
          onClick={handleFlag}
          className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            flagPulse
              ? isBambiMode
                ? 'bg-amber-200 text-amber-700 scale-[1.02]'
                : 'bg-amber-700/40 text-amber-300 scale-[1.02]'
              : isBambiMode
                ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                : 'bg-amber-900/20 text-amber-400 hover:bg-amber-900/30'
          }`}
        >
          <Flag className="w-4 h-4" />
          Flag This Moment
        </button>

        {/* End Session */}
        <button
          onClick={handleEnd}
          className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            confirmEnd
              ? 'bg-red-500 text-white hover:bg-red-600'
              : isBambiMode
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <Square className="w-4 h-4" />
          {confirmEnd ? 'Tap again to end session' : 'End Session'}
        </button>
      </div>
    </div>
  );
}
