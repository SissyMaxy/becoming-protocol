/**
 * QuickStateUpdate Component
 * Quick state update control for Today View
 * Allows updating: mood, arousal, exec function, Gina home
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Smile,
  Frown,
  Meh,
  Flame,
  Battery,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  Home,
  User,
  Moon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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
  compact?: boolean;
}

export function QuickStateUpdate({
  currentMood,
  currentArousal,
  currentExecFunction,
  ginaHome,
  ginaAsleep = false,
  onUpdate,
  isLoading = false,
  compact = false,
}: QuickStateUpdateProps) {
  const { isBambiMode } = useBambiMode();
  const [isExpanded, setIsExpanded] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [ginaState, setGinaState] = useState<'home' | 'asleep' | 'alone'>(
    ginaHome ? 'home' : ginaAsleep ? 'asleep' : 'alone'
  );

  // Sync ginaState when props change externally
  useEffect(() => {
    setGinaState(ginaHome ? 'home' : ginaAsleep ? 'asleep' : 'alone');
  }, [ginaHome, ginaAsleep]);

  const showSaved = useCallback((field: string) => {
    setSavedField(field);
    setTimeout(() => setSavedField(null), 1500);
  }, []);

  // Local state for immediate UI feedback
  const [selectedMood, setSelectedMood] = useState<number | undefined>(currentMood);

  // Sync with prop when it changes externally
  useEffect(() => {
    setSelectedMood(currentMood);
  }, [currentMood]);

  // Handle mood selection with immediate UI update
  const handleMoodSelect = (moodValue: number) => {
    setSelectedMood(moodValue);
    onUpdate({ mood: moodValue });
    showSaved('mood');
  };

  // Mood options
  const moodOptions = [
    { value: 2, label: 'Low', icon: Frown },
    { value: 5, label: 'Okay', icon: Meh },
    { value: 8, label: 'Good', icon: Smile },
  ];

  // Arousal options (0-5)
  const arousalOptions = [
    { value: 0, label: 'None' },
    { value: 1, label: 'Low' },
    { value: 2, label: 'Mild' },
    { value: 3, label: 'Medium' },
    { value: 4, label: 'High' },
    { value: 5, label: 'Peak' },
  ];

  // Exec function options
  const execOptions: { value: ExecFunction; label: string; icon: typeof Battery }[] = [
    { value: 'depleted', label: 'Depleted', icon: BatteryLow },
    { value: 'low', label: 'Low', icon: BatteryLow },
    { value: 'medium', label: 'Medium', icon: BatteryMedium },
    { value: 'high', label: 'High', icon: BatteryFull },
  ];

  // Get current exec icon
  const currentExecOption = execOptions.find(o => o.value === currentExecFunction) || execOptions[2];
  const ExecIcon = currentExecOption.icon;

  // Compact view - just shows current state with toggle
  if (compact && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        disabled={isLoading}
        className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${
          isBambiMode
            ? 'bg-pink-50 hover:bg-pink-100 border border-pink-200'
            : 'bg-protocol-surface hover:bg-protocol-surface/80 border border-protocol-border'
        } ${isLoading ? 'opacity-50' : ''}`}
      >
        <div className="flex items-center gap-3">
          {/* Mood indicator */}
          <div className={`p-1.5 rounded-lg ${
            selectedMood && selectedMood >= 7
              ? isBambiMode ? 'bg-green-100 text-green-600' : 'bg-green-900/30 text-green-400'
              : selectedMood && selectedMood <= 3
                ? isBambiMode ? 'bg-red-100 text-red-600' : 'bg-red-900/30 text-red-400'
                : isBambiMode ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-400'
          }`}>
            {selectedMood && selectedMood >= 7 ? <Smile className="w-4 h-4" /> :
             selectedMood && selectedMood <= 3 ? <Frown className="w-4 h-4" /> :
             <Meh className="w-4 h-4" />}
          </div>

          {/* Arousal indicator */}
          <div className={`p-1.5 rounded-lg ${
            currentArousal >= 4
              ? isBambiMode ? 'bg-rose-100 text-rose-600' : 'bg-rose-900/30 text-rose-400'
              : currentArousal >= 2
                ? isBambiMode ? 'bg-orange-100 text-orange-600' : 'bg-orange-900/30 text-orange-400'
                : isBambiMode ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-400'
          }`}>
            <Flame className="w-4 h-4" />
          </div>

          {/* Energy indicator */}
          <div className={`p-1.5 rounded-lg ${
            currentExecFunction === 'high'
              ? isBambiMode ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-900/30 text-emerald-400'
              : currentExecFunction === 'depleted'
                ? isBambiMode ? 'bg-red-100 text-red-600' : 'bg-red-900/30 text-red-400'
                : isBambiMode ? 'bg-yellow-100 text-yellow-600' : 'bg-yellow-900/30 text-yellow-400'
          }`}>
            <ExecIcon className="w-4 h-4" />
          </div>

          {/* Gina indicator */}
          <div className={`p-1.5 rounded-lg ${
            ginaState === 'home'
              ? isBambiMode ? 'bg-purple-100 text-purple-600' : 'bg-purple-900/30 text-purple-400'
              : ginaState === 'asleep'
                ? isBambiMode ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-900/30 text-indigo-400'
                : isBambiMode ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-400'
          }`}>
            {ginaState === 'home' ? <Home className="w-4 h-4" /> : ginaState === 'asleep' ? <Moon className="w-4 h-4" /> : <User className="w-4 h-4" />}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Update state
          </span>
          <ChevronDown className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
        </div>
      </button>
    );
  }

  return (
    <div className={`p-4 rounded-xl ${
      isBambiMode
        ? 'bg-pink-50 border border-pink-200'
        : 'bg-protocol-surface border border-protocol-border'
    } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Header with collapse button */}
      {compact && (
        <button
          onClick={() => setIsExpanded(false)}
          className={`w-full flex items-center justify-between mb-4 ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          <span className="font-medium text-sm">Quick State Update</span>
          <ChevronUp className="w-4 h-4" />
        </button>
      )}

      {!compact && (
        <h2 className={`font-medium text-sm mb-4 ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          How are you right now?
        </h2>
      )}

      <div className="space-y-4">
        {/* Mood */}
        <div>
          <label className={`text-xs font-medium mb-2 flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            Mood
            {savedField === 'mood' && <span className="text-green-500 transition-opacity">Saved ✓</span>}
          </label>
          <div className="flex gap-2">
            {moodOptions.map(option => {
              const Icon = option.icon;
              const isSelected = selectedMood !== undefined &&
                Math.abs(selectedMood - option.value) < 2;

              return (
                <button
                  key={option.value}
                  onClick={() => handleMoodSelect(option.value)}
                  className={`flex-1 p-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                    isSelected
                      ? isBambiMode
                        ? 'bg-pink-200 text-pink-700 border-2 border-pink-400'
                        : 'bg-protocol-accent/30 text-protocol-accent border-2 border-protocol-accent'
                      : isBambiMode
                        ? 'bg-white hover:bg-pink-100 text-pink-600 border border-pink-200'
                        : 'bg-protocol-bg hover:bg-protocol-surface text-protocol-text-muted border border-protocol-border'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Arousal Level */}
        <div>
          <label className={`text-xs font-medium mb-2 flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            Arousal Level
            {savedField === 'arousal' && <span className="text-green-500 transition-opacity">Saved ✓</span>}
          </label>
          <div className="flex gap-1">
            {arousalOptions.map(option => {
              const isSelected = currentArousal === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => { onUpdate({ arousal: option.value }); showSaved('arousal'); }}
                  aria-label={`Arousal level ${option.value}: ${option.label}`}
                  className={`flex-1 p-2 rounded-lg text-center transition-colors ${
                    isSelected
                      ? option.value >= 4
                        ? 'bg-rose-500 text-white'
                        : option.value >= 2
                          ? 'bg-orange-500 text-white'
                          : isBambiMode
                            ? 'bg-pink-200 text-pink-700'
                            : 'bg-protocol-accent/30 text-protocol-accent'
                      : isBambiMode
                        ? 'bg-white hover:bg-pink-100 text-pink-600 border border-pink-200'
                        : 'bg-protocol-bg hover:bg-protocol-surface text-protocol-text-muted border border-protocol-border'
                  }`}
                >
                  <span className="text-xs">{option.value}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
              None
            </span>
            <span className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
              Peak
            </span>
          </div>
        </div>

        {/* Executive Function */}
        <div>
          <label className={`text-xs font-medium mb-2 flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            Energy / Focus
            {savedField === 'energy' && <span className="text-green-500 transition-opacity">Saved ✓</span>}
          </label>
          <div className="flex gap-2">
            {execOptions.map(option => {
              const Icon = option.icon;
              const isSelected = currentExecFunction === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => { onUpdate({ execFunction: option.value }); showSaved('energy'); }}
                  className={`flex-1 p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${
                    isSelected
                      ? option.value === 'high'
                        ? 'bg-emerald-500 text-white'
                        : option.value === 'depleted'
                          ? 'bg-red-500 text-white'
                          : isBambiMode
                            ? 'bg-pink-200 text-pink-700'
                            : 'bg-protocol-accent/30 text-protocol-accent'
                      : isBambiMode
                        ? 'bg-white hover:bg-pink-100 text-pink-600 border border-pink-200'
                        : 'bg-protocol-bg hover:bg-protocol-surface text-protocol-text-muted border border-protocol-border'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[10px]">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Gina Home Toggle */}
        <div>
          <label className={`text-xs font-medium mb-2 flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            Gina Home?
            {savedField === 'gina' && <span className="text-green-500 transition-opacity">Saved ✓</span>}
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => { setGinaState('home'); onUpdate({ ginaHome: true, ginaAsleep: false }); showSaved('gina'); }}
              className={`flex-1 p-3 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                ginaState === 'home'
                  ? isBambiMode
                    ? 'bg-purple-200 text-purple-700 border-2 border-purple-400'
                    : 'bg-purple-900/30 text-purple-400 border-2 border-purple-500'
                  : isBambiMode
                    ? 'bg-white hover:bg-purple-50 text-purple-600 border border-purple-200'
                    : 'bg-protocol-bg hover:bg-protocol-surface text-protocol-text-muted border border-protocol-border'
              }`}
            >
              <Home className="w-4 h-4" />
              <span className="text-sm">Home</span>
            </button>
            <button
              onClick={() => { setGinaState('asleep'); onUpdate({ ginaHome: false, ginaAsleep: true }); showSaved('gina'); }}
              className={`flex-1 p-3 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                ginaState === 'asleep'
                  ? isBambiMode
                    ? 'bg-indigo-200 text-indigo-700 border-2 border-indigo-400'
                    : 'bg-indigo-900/30 text-indigo-400 border-2 border-indigo-500'
                  : isBambiMode
                    ? 'bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200'
                    : 'bg-protocol-bg hover:bg-protocol-surface text-protocol-text-muted border border-protocol-border'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span className="text-sm">Asleep</span>
            </button>
            <button
              onClick={() => { setGinaState('alone'); onUpdate({ ginaHome: false, ginaAsleep: false }); showSaved('gina'); }}
              className={`flex-1 p-3 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                ginaState === 'alone'
                  ? isBambiMode
                    ? 'bg-emerald-200 text-emerald-700 border-2 border-emerald-400'
                    : 'bg-emerald-900/30 text-emerald-400 border-2 border-emerald-500'
                  : isBambiMode
                    ? 'bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : 'bg-protocol-bg hover:bg-protocol-surface text-protocol-text-muted border border-protocol-border'
              }`}
            >
              <User className="w-4 h-4" />
              <span className="text-sm">Alone</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
