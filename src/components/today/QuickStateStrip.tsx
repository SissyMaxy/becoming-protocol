/**
 * QuickStateStrip — Slim always-visible horizontal state check-in.
 * Mood (5 emojis), Energy (cycle bars), Arousal (flame + number), Gina (toggle).
 * Each tap auto-saves immediately via onUpdate.
 */

import { useState, useEffect } from 'react';
import { Flame, Home, User, Moon } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { ExecFunction } from '../../hooks/useUserState';

interface QuickStateStripProps {
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
  onStateChanged?: () => void;
  isLoading?: boolean;
}

const MOOD_EMOJIS = ['😔', '😐', '🙂', '😊', '😄'] as const;
const MOOD_VALUES = [2, 4, 5, 7, 9]; // maps index 0-4 to mood scale

function moodToIndex(mood?: number): number | null {
  if (mood === undefined) return null;
  if (mood <= 2) return 0;
  if (mood <= 4) return 1;
  if (mood <= 5) return 2;
  if (mood <= 7) return 3;
  return 4;
}

const EXEC_CYCLE: ExecFunction[] = ['depleted', 'low', 'medium', 'high'];
const EXEC_BARS: Record<ExecFunction, number> = { depleted: 0, low: 1, medium: 2, high: 3 };
const EXEC_COLORS: Record<ExecFunction, string> = {
  depleted: 'text-red-400',
  low: 'text-orange-400',
  medium: 'text-amber-400',
  high: 'text-emerald-400',
};

type GinaState = 'home' | 'asleep' | 'alone';
const GINA_CYCLE: GinaState[] = ['home', 'alone', 'asleep'];

function deriveGinaState(home: boolean, asleep?: boolean): GinaState {
  if (home) return 'home';
  if (asleep) return 'asleep';
  return 'alone';
}

const AROUSAL_COLORS = [
  'text-gray-400',       // 0
  'text-amber-400',      // 1
  'text-amber-500',      // 2
  'text-orange-500',     // 3
  'text-rose-500',       // 4
  'text-red-500',        // 5
];

export function QuickStateStrip({
  currentMood,
  currentArousal,
  currentExecFunction,
  ginaHome,
  ginaAsleep,
  onUpdate,
  onStateChanged,
  isLoading = false,
}: QuickStateStripProps) {
  const { isBambiMode } = useBambiMode();
  const [localMoodIdx, setLocalMoodIdx] = useState<number | null>(moodToIndex(currentMood));
  const [localGina, setLocalGina] = useState<GinaState>(deriveGinaState(ginaHome, ginaAsleep));

  useEffect(() => { setLocalMoodIdx(moodToIndex(currentMood)); }, [currentMood]);
  useEffect(() => { setLocalGina(deriveGinaState(ginaHome, ginaAsleep)); }, [ginaHome, ginaAsleep]);

  const handleMood = (idx: number) => {
    setLocalMoodIdx(idx);
    onUpdate({ mood: MOOD_VALUES[idx] });
    onStateChanged?.();
  };

  const handleEnergy = () => {
    const nextIdx = (EXEC_CYCLE.indexOf(currentExecFunction) + 1) % EXEC_CYCLE.length;
    onUpdate({ execFunction: EXEC_CYCLE[nextIdx] });
    onStateChanged?.();
  };

  const handleArousal = () => {
    const next = (currentArousal + 1) % 6;
    onUpdate({ arousal: next });
    onStateChanged?.();
  };

  const handleGina = () => {
    const nextIdx = (GINA_CYCLE.indexOf(localGina) + 1) % GINA_CYCLE.length;
    const next = GINA_CYCLE[nextIdx];
    setLocalGina(next);
    onUpdate({
      ginaHome: next === 'home',
      ginaAsleep: next === 'asleep',
    });
    onStateChanged?.();
  };

  const divider = (
    <div className={`w-px h-5 ${isBambiMode ? 'bg-pink-200' : 'bg-protocol-border'}`} />
  );

  return (
    <div className={`flex items-center justify-between rounded-xl px-2 py-1.5 ${
      isBambiMode
        ? 'bg-pink-50/50 border border-pink-200'
        : 'bg-protocol-surface/50 border border-protocol-border'
    } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Mood: 5 emojis */}
      <div className="flex items-center gap-0.5">
        {MOOD_EMOJIS.map((emoji, i) => (
          <button
            key={i}
            onClick={() => handleMood(i)}
            className={`text-base leading-none p-1 rounded transition-opacity ${
              localMoodIdx === i ? 'opacity-100 scale-110' : 'opacity-30 hover:opacity-60'
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {divider}

      {/* Energy: bar segments */}
      <button onClick={handleEnergy} className="flex items-center gap-0.5 px-2 py-1">
        {[0, 1, 2].map(bar => (
          <div
            key={bar}
            className={`w-1.5 rounded-sm transition-all ${
              bar < EXEC_BARS[currentExecFunction]
                ? `${EXEC_COLORS[currentExecFunction]} bg-current h-${bar === 0 ? '2' : bar === 1 ? '3' : '4'}`
                : isBambiMode ? 'bg-pink-200 h-2' : 'bg-protocol-border h-2'
            }`}
            style={{ height: bar < EXEC_BARS[currentExecFunction] ? `${(bar + 1) * 5 + 3}px` : '8px' }}
          />
        ))}
      </button>

      {divider}

      {/* Arousal: flame + number */}
      <button onClick={handleArousal} className="flex items-center gap-1 px-2 py-1">
        <Flame className={`w-4 h-4 ${AROUSAL_COLORS[currentArousal]} ${currentArousal >= 4 ? 'animate-pulse' : ''}`} />
        <span className={`text-xs font-bold tabular-nums ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          {currentArousal}
        </span>
      </button>

      {divider}

      {/* Gina: toggle icon */}
      <button onClick={handleGina} className={`flex items-center gap-1 px-2 py-1 ${
        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
      }`}>
        {localGina === 'home' && <Home className="w-4 h-4 text-purple-400" />}
        {localGina === 'alone' && <User className="w-4 h-4" />}
        {localGina === 'asleep' && <Moon className="w-4 h-4 text-indigo-400" />}
      </button>
    </div>
  );
}
