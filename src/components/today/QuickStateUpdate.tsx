/**
 * QuickStateUpdate — Compact pill row for state check-in
 * Four pills: mood, arousal, energy, gina
 * Tap a pill to expand its selector inline.
 * If no check-in today, shows "Check in" prompt that expands all selectors once.
 */

import { useState, useEffect } from 'react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { ExecFunction } from '../../hooks/useUserState';

interface QuickStateUpdateProps {
  currentMood?: number;
  currentArousal: number;
  currentExecFunction: ExecFunction;
  ginaHome: boolean;
  ginaAsleep?: boolean;
  onUpdate: (update: {
    mood?: number;
    arousal?: number;
    execFunction?: ExecFunction;
    ginaHome?: boolean;
    ginaAsleep?: boolean;
  }) => void;
  isLoading?: boolean;
  compact?: boolean; // kept for interface compat, always compact now
}

type Dimension = 'mood' | 'arousal' | 'energy' | 'gina';

function getMoodDisplay(mood?: number): { emoji: string; label: string } {
  if (mood === undefined) return { emoji: '😐', label: 'Okay' };
  if (mood >= 7) return { emoji: '😊', label: 'Good' };
  if (mood <= 3) return { emoji: '😔', label: 'Low' };
  return { emoji: '😐', label: 'Okay' };
}

function getEnergyLabel(exec: ExecFunction): string {
  switch (exec) {
    case 'high': return 'High';
    case 'medium': return 'Med';
    case 'low': return 'Low';
    case 'depleted': return 'Depleted';
    default: return 'Med';
  }
}

function getGinaDisplay(state: 'home' | 'asleep' | 'alone'): { emoji: string; label: string } {
  switch (state) {
    case 'home': return { emoji: '🏠', label: 'Home' };
    case 'asleep': return { emoji: '🌙', label: 'Asleep' };
    case 'alone': return { emoji: '👤', label: 'Alone' };
  }
}

export function QuickStateUpdate({
  currentMood,
  currentArousal,
  currentExecFunction,
  ginaHome,
  ginaAsleep = false,
  onUpdate,
  isLoading = false,
}: QuickStateUpdateProps) {
  const { isBambiMode } = useBambiMode();
  const [expanded, setExpanded] = useState<Dimension | 'all' | null>(null);
  const [localMood, setLocalMood] = useState<number | undefined>(currentMood);
  const [ginaState, setGinaState] = useState<'home' | 'asleep' | 'alone'>(
    ginaHome ? 'home' : ginaAsleep ? 'asleep' : 'alone'
  );

  useEffect(() => { setLocalMood(currentMood); }, [currentMood]);
  useEffect(() => {
    setGinaState(ginaHome ? 'home' : ginaAsleep ? 'asleep' : 'alone');
  }, [ginaHome, ginaAsleep]);

  const needsCheckin = localMood === undefined;

  const handleMoodSelect = (value: number) => {
    setLocalMood(value);
    onUpdate({ mood: value });
    if (expanded !== 'all') setExpanded(null);
  };

  const handleArousalSelect = (value: number) => {
    onUpdate({ arousal: value });
    if (expanded !== 'all') setExpanded(null);
  };

  const handleEnergySelect = (value: ExecFunction) => {
    onUpdate({ execFunction: value });
    if (expanded !== 'all') setExpanded(null);
  };

  const handleGinaSelect = (state: 'home' | 'asleep' | 'alone') => {
    setGinaState(state);
    onUpdate({
      ginaHome: state === 'home',
      ginaAsleep: state === 'asleep',
    });
    if (expanded !== 'all') setExpanded(null);
  };

  const toggleDimension = (dim: Dimension) => {
    setExpanded(prev => prev === dim ? null : dim);
  };

  // Selector row styles
  const selectorBtn = (isSelected: boolean, variant?: 'rose' | 'orange' | 'emerald' | 'red' | 'purple') => {
    if (isSelected) {
      if (variant === 'rose') return 'bg-rose-500 text-white';
      if (variant === 'orange') return 'bg-orange-500 text-white';
      if (variant === 'emerald') return 'bg-emerald-500 text-white';
      if (variant === 'red') return 'bg-red-500 text-white';
      if (variant === 'purple') return isBambiMode ? 'bg-purple-300 text-purple-800' : 'bg-purple-900/30 text-purple-400';
      return isBambiMode ? 'bg-pink-300 text-pink-800' : 'bg-protocol-accent/30 text-protocol-accent';
    }
    return isBambiMode
      ? 'bg-pink-50 text-pink-600 hover:bg-pink-100 border border-pink-200'
      : 'bg-protocol-bg text-protocol-text-muted hover:bg-protocol-surface/80 border border-protocol-border';
  };

  // ── No check-in: show prompt ──
  if (needsCheckin && expanded !== 'all') {
    return (
      <button
        onClick={() => setExpanded('all')}
        disabled={isLoading}
        className={`w-full py-3 px-4 rounded-xl text-sm font-medium transition-colors ${
          isBambiMode
            ? 'bg-pink-50 text-pink-700 hover:bg-pink-100 border border-pink-200'
            : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface/80 border border-protocol-border'
        } ${isLoading ? 'opacity-50' : ''}`}
      >
        Check in
      </button>
    );
  }

  // ── Full expansion (initial check-in) ──
  if (expanded === 'all') {
    return (
      <div className={`rounded-xl p-3 space-y-3 ${
        isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
      }`}>
        {/* Mood */}
        <div className="space-y-1.5">
          <span className={`text-xs font-medium ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>Mood</span>
          <div className="flex gap-2">
            {[{ value: 2, label: '😔 Low' }, { value: 5, label: '😐 Okay' }, { value: 8, label: '😊 Good' }].map(opt => (
              <button
                key={opt.value}
                onClick={() => handleMoodSelect(opt.value)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  selectorBtn(localMood !== undefined && Math.abs(localMood - opt.value) < 2)
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Arousal */}
        <div className="space-y-1.5">
          <span className={`text-xs font-medium ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>Arousal</span>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                onClick={() => handleArousalSelect(v)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  selectorBtn(currentArousal === v, v >= 4 ? 'rose' : v >= 2 ? 'orange' : undefined)
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Energy */}
        <div className="space-y-1.5">
          <span className={`text-xs font-medium ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>Energy</span>
          <div className="flex gap-1">
            {(['depleted', 'low', 'medium', 'high'] as ExecFunction[]).map(v => (
              <button
                key={v}
                onClick={() => handleEnergySelect(v)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  selectorBtn(currentExecFunction === v, v === 'high' ? 'emerald' : v === 'depleted' ? 'red' : undefined)
                }`}
              >
                {v === 'medium' ? 'Med' : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Gina */}
        <div className="space-y-1.5">
          <span className={`text-xs font-medium ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>Gina</span>
          <div className="flex gap-2">
            {([
              { state: 'home' as const, label: '🏠 Home' },
              { state: 'asleep' as const, label: '🌙 Asleep' },
              { state: 'alone' as const, label: '👤 Alone' },
            ]).map(opt => (
              <button
                key={opt.state}
                onClick={() => handleGinaSelect(opt.state)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  selectorBtn(ginaState === opt.state, 'purple')
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Done — appears after mood is set */}
        {localMood !== undefined && (
          <button
            onClick={() => setExpanded(null)}
            className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            Done
          </button>
        )}
      </div>
    );
  }

  // ── Pill summary row ──
  const moodDisplay = getMoodDisplay(localMood);
  const energyLabel = getEnergyLabel(currentExecFunction);
  const ginaDisplay = getGinaDisplay(ginaState);

  const pillBase = 'px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer select-none';
  const pillActive = isBambiMode
    ? 'bg-pink-200 text-pink-700 border border-pink-300'
    : 'bg-protocol-accent/20 text-protocol-accent border border-protocol-accent/30';
  const pillInactive = isBambiMode
    ? 'bg-pink-50 text-pink-600 border border-pink-200 hover:bg-pink-100'
    : 'bg-protocol-surface text-protocol-text-muted border border-protocol-border hover:bg-protocol-surface/80';

  return (
    <div className="space-y-2">
      {/* Pill row */}
      <div className="flex gap-2">
        <button
          onClick={() => toggleDimension('mood')}
          className={`${pillBase} ${expanded === 'mood' ? pillActive : pillInactive}`}
        >
          {moodDisplay.emoji} {moodDisplay.label}
        </button>
        <button
          onClick={() => toggleDimension('arousal')}
          className={`${pillBase} ${expanded === 'arousal' ? pillActive : pillInactive}`}
        >
          🔥 {currentArousal}
        </button>
        <button
          onClick={() => toggleDimension('energy')}
          className={`${pillBase} ${expanded === 'energy' ? pillActive : pillInactive}`}
        >
          ⚡ {energyLabel}
        </button>
        <button
          onClick={() => toggleDimension('gina')}
          className={`${pillBase} ${expanded === 'gina' ? pillActive : pillInactive}`}
        >
          {ginaDisplay.emoji} {ginaDisplay.label}
        </button>
      </div>

      {/* Inline selector — mood */}
      {expanded === 'mood' && (
        <div className="flex gap-2">
          {[{ value: 2, label: '😔 Low' }, { value: 5, label: '😐 Okay' }, { value: 8, label: '😊 Good' }].map(opt => (
            <button
              key={opt.value}
              onClick={() => handleMoodSelect(opt.value)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectorBtn(localMood !== undefined && Math.abs(localMood - opt.value) < 2)
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Inline selector — arousal */}
      {expanded === 'arousal' && (
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4, 5].map(v => (
            <button
              key={v}
              onClick={() => handleArousalSelect(v)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectorBtn(currentArousal === v, v >= 4 ? 'rose' : v >= 2 ? 'orange' : undefined)
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {/* Inline selector — energy */}
      {expanded === 'energy' && (
        <div className="flex gap-1">
          {(['depleted', 'low', 'medium', 'high'] as ExecFunction[]).map(v => (
            <button
              key={v}
              onClick={() => handleEnergySelect(v)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectorBtn(currentExecFunction === v, v === 'high' ? 'emerald' : v === 'depleted' ? 'red' : undefined)
              }`}
            >
              {v === 'medium' ? 'Med' : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Inline selector — gina */}
      {expanded === 'gina' && (
        <div className="flex gap-2">
          {([
            { state: 'home' as const, label: '🏠 Home' },
            { state: 'asleep' as const, label: '🌙 Asleep' },
            { state: 'alone' as const, label: '👤 Alone' },
          ]).map(opt => (
            <button
              key={opt.state}
              onClick={() => handleGinaSelect(opt.state)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectorBtn(ginaState === opt.state, 'purple')
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
