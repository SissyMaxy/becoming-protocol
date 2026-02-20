/**
 * HypnoSessionCard — Prescription card for TodayView
 *
 * Shows Handler-prescribed hypno session with task config from
 * getHypnoTaskCard(). Supports both "prescribed" (start/skip) and
 * "in-progress" (resume) states.
 */

import { useState, useEffect } from 'react';
import { Play, SkipForward, Clock, Camera, Headphones } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { getHypnoTaskCard, type HypnoTaskCardConfig } from '../../lib/content/hypno-tasks';
import type { HypnoLibraryItem, HypnoSessionRecord } from '../../types/hypno-bridge';

interface HypnoSessionCardProps {
  taskCode: string;
  libraryItem?: HypnoLibraryItem;
  onStart: () => void;
  onSkip?: () => void;
  activeSession?: HypnoSessionRecord;
}

const EFFORT_LABELS: Record<string, string> = {
  zero: 'No effort',
  minimal: 'Minimal effort',
  moderate: 'Moderate effort',
  approval_only: 'Approval only',
};

export function HypnoSessionCard({
  taskCode,
  libraryItem,
  onStart,
  onSkip,
  activeSession,
}: HypnoSessionCardProps) {
  const { isBambiMode } = useBambiMode();
  const [elapsed, setElapsed] = useState(0);

  const config: HypnoTaskCardConfig | null = getHypnoTaskCard(taskCode);

  // Elapsed timer for active sessions
  useEffect(() => {
    if (!activeSession) return;

    const startMs = new Date(activeSession.startedAt).getTime();
    const tick = () => setElapsed(Math.round((Date.now() - startMs) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  if (!config) return null;

  const isActive = !!activeSession;
  const effortLabel = EFFORT_LABELS[config.effortLevel] || config.effortLevel;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        isBambiMode
          ? 'bg-purple-50 border-purple-200'
          : 'bg-purple-900/20 border-purple-700/30'
      }`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Headphones
              className={`w-4 h-4 ${
                isBambiMode ? 'text-purple-500' : 'text-purple-400'
              }`}
            />
            <span
              className={`text-sm font-semibold ${
                isBambiMode ? 'text-purple-700' : 'text-purple-300'
              }`}
            >
              {config.icon} {config.title}
            </span>
          </div>
          {isActive && (
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                isBambiMode
                  ? 'bg-green-100 text-green-700'
                  : 'bg-green-900/30 text-green-400'
              }`}
            >
              {mins}:{secs.toString().padStart(2, '0')}
            </span>
          )}
        </div>

        {/* Subtitle */}
        <p
          className={`text-xs mb-3 ${
            isBambiMode ? 'text-gray-600' : 'text-gray-400'
          }`}
        >
          {config.subtitle}
        </p>

        {/* Library item info */}
        {libraryItem && (
          <div
            className={`p-2 rounded-lg mb-3 ${
              isBambiMode
                ? 'bg-purple-100/60 border border-purple-200'
                : 'bg-purple-900/30 border border-purple-700/20'
            }`}
          >
            <p
              className={`text-xs font-medium ${
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
                {'●'.repeat(libraryItem.intensity)}
                {'○'.repeat(5 - libraryItem.intensity)}
              </span>
            </div>
          </div>
        )}

        {/* Badges row */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              isBambiMode
                ? 'bg-gray-100 text-gray-500'
                : 'bg-gray-800 text-gray-400'
            }`}
          >
            <Clock className="w-2.5 h-2.5 inline mr-0.5" />
            {effortLabel}
          </span>
          {config.includesCapture && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                isBambiMode
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-amber-900/30 text-amber-400'
              }`}
            >
              <Camera className="w-2.5 h-2.5 inline mr-0.5" />
              Capture enabled
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onStart}
            className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              isActive
                ? isBambiMode
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-green-600 text-white hover:bg-green-500'
                : isBambiMode
                  ? 'bg-purple-500 text-white hover:bg-purple-600'
                  : 'bg-purple-600 text-white hover:bg-purple-500'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            {isActive ? 'Resume Session' : 'Start Session'}
          </button>
          {!isActive && onSkip && (
            <button
              onClick={onSkip}
              className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                isBambiMode
                  ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
