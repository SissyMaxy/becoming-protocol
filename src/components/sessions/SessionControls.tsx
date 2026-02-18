// SessionControls Component
// Mid-session intensity and pattern controls

import { memo, useState, useCallback } from 'react';
import {
  Minus,
  Plus,
  Pause,
  Play,
  StopCircle,
  Waves,
  Zap,
  Wind,
  Heart,
  Activity,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { LOVENSE_PATTERNS, type LovensePatternName } from '../../types/lovense';

interface SessionControlsProps {
  intensity: number;
  maxIntensity?: number;
  currentPattern: LovensePatternName | null;
  phase: string;
  isPaused: boolean;
  onIntensityChange: (intensity: number) => void;
  onPatternChange: (pattern: LovensePatternName) => void;
  onPause: () => void;
  onResume: () => void;
  onEmergencyStop: () => void;
  compact?: boolean;
  className?: string;
}

// Pattern icons mapping
const PATTERN_ICONS: Record<string, React.ReactNode> = {
  gentle_wave: <Waves className="w-4 h-4" />,
  building: <Activity className="w-4 h-4" />,
  edge_tease: <Zap className="w-4 h-4" />,
  denial_pulse: <Heart className="w-4 h-4" />,
  constant_low: <Wind className="w-4 h-4" />,
  constant_medium: <Wind className="w-4 h-4" />,
  constant_high: <Wind className="w-4 h-4" />,
  heartbeat: <Heart className="w-4 h-4" />,
  staircase: <Activity className="w-4 h-4" />,
  random_tease: <Zap className="w-4 h-4" />,
  flutter_gentle: <Waves className="w-4 h-4" />,
};

// Quick pattern presets for each phase
const PHASE_PATTERNS: Record<string, LovensePatternName[]> = {
  warmup: ['gentle_wave', 'constant_low', 'flutter_gentle'],
  building: ['building', 'staircase', 'constant_medium'],
  edge: ['edge_tease', 'constant_high', 'denial_pulse'],
  cooldown: ['gentle_wave', 'constant_low'],
  plateau: ['constant_medium', 'heartbeat'],
  rest: ['constant_low', 'flutter_gentle'],
};

export const SessionControls = memo(function SessionControls({
  intensity,
  maxIntensity = 20,
  currentPattern,
  phase,
  isPaused,
  onIntensityChange,
  onPatternChange,
  onPause,
  onResume,
  onEmergencyStop,
  compact = false,
  className = '',
}: SessionControlsProps) {
  const [showPatternPicker, setShowPatternPicker] = useState(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);

  // Intensity change handlers
  const increaseIntensity = useCallback(() => {
    if (intensity < maxIntensity) {
      onIntensityChange(Math.min(maxIntensity, intensity + 1));
    }
  }, [intensity, maxIntensity, onIntensityChange]);

  const decreaseIntensity = useCallback(() => {
    if (intensity > 0) {
      onIntensityChange(Math.max(0, intensity - 1));
    }
  }, [intensity, onIntensityChange]);

  // Quick intensity presets
  const setIntensityPreset = useCallback((preset: 'low' | 'medium' | 'high' | 'max') => {
    const presets = {
      low: Math.round(maxIntensity * 0.25),
      medium: Math.round(maxIntensity * 0.5),
      high: Math.round(maxIntensity * 0.75),
      max: maxIntensity,
    };
    onIntensityChange(presets[preset]);
  }, [maxIntensity, onIntensityChange]);

  // Suggested patterns for current phase
  const suggestedPatterns = PHASE_PATTERNS[phase] || PHASE_PATTERNS.building;

  // Intensity percentage for visual
  const intensityPercent = (intensity / maxIntensity) * 100;

  // Get intensity color
  const getIntensityColor = () => {
    if (intensityPercent < 25) return 'bg-green-500';
    if (intensityPercent < 50) return 'bg-yellow-500';
    if (intensityPercent < 75) return 'bg-orange-500';
    return 'bg-red-500';
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Intensity quick controls */}
        <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
          <button
            onClick={decreaseIntensity}
            disabled={intensity <= 0}
            className="p-1 rounded-full hover:bg-white/20 disabled:opacity-30 transition-colors"
          >
            <Minus className="w-4 h-4 text-white" />
          </button>
          <span className="text-white font-mono text-sm w-8 text-center">{intensity}</span>
          <button
            onClick={increaseIntensity}
            disabled={intensity >= maxIntensity}
            className="p-1 rounded-full hover:bg-white/20 disabled:opacity-30 transition-colors"
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Pause/Play */}
        <button
          onClick={isPaused ? onResume : onPause}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          {isPaused ? (
            <Play className="w-4 h-4 text-white" />
          ) : (
            <Pause className="w-4 h-4 text-white" />
          )}
        </button>

        {/* Emergency stop */}
        <button
          onClick={onEmergencyStop}
          className="p-2 rounded-full bg-red-500/20 hover:bg-red-500/40 transition-colors"
        >
          <StopCircle className="w-4 h-4 text-red-300" />
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Intensity Control */}
      <div className="bg-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white/80 text-sm font-medium">Intensity</span>
          <span className="text-white font-mono text-lg">{intensity}/{maxIntensity}</span>
        </div>

        {/* Intensity bar */}
        <div className="h-3 bg-white/20 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getIntensityColor()}`}
            style={{ width: `${intensityPercent}%` }}
          />
        </div>

        {/* +/- Controls */}
        <div className="flex items-center justify-between">
          <button
            onClick={decreaseIntensity}
            disabled={intensity <= 0}
            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-colors"
          >
            <Minus className="w-6 h-6 text-white" />
          </button>

          {/* Quick presets */}
          <div className="flex items-center gap-2">
            {(['low', 'medium', 'high', 'max'] as const).map(preset => (
              <button
                key={preset}
                onClick={() => setIntensityPreset(preset)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  preset === 'max'
                    ? 'bg-red-500/30 text-red-200 hover:bg-red-500/50'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {preset.charAt(0).toUpperCase() + preset.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={increaseIntensity}
            disabled={intensity >= maxIntensity}
            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-colors"
          >
            <Plus className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      {/* Pattern Selector */}
      <div className="bg-white/10 rounded-xl p-4">
        <button
          onClick={() => setShowPatternPicker(!showPatternPicker)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-sm font-medium">Pattern</span>
            {currentPattern && (
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs text-white capitalize">
                {currentPattern.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          {showPatternPicker ? (
            <ChevronUp className="w-5 h-5 text-white/50" />
          ) : (
            <ChevronDown className="w-5 h-5 text-white/50" />
          )}
        </button>

        {showPatternPicker && (
          <div className="mt-4 space-y-3">
            {/* Suggested for phase */}
            <div>
              <div className="text-xs text-white/50 mb-2">Suggested for {phase}</div>
              <div className="flex flex-wrap gap-2">
                {suggestedPatterns.map(pattern => (
                  <button
                    key={pattern}
                    onClick={() => {
                      onPatternChange(pattern);
                      setShowPatternPicker(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      currentPattern === pattern
                        ? 'bg-white/30 text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {PATTERN_ICONS[pattern] || <Waves className="w-4 h-4" />}
                    <span className="capitalize">{pattern.replace(/_/g, ' ')}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* All patterns */}
            <div>
              <div className="text-xs text-white/50 mb-2">All Patterns</div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {Object.keys(LOVENSE_PATTERNS).map(pattern => (
                  <button
                    key={pattern}
                    onClick={() => {
                      onPatternChange(pattern as LovensePatternName);
                      setShowPatternPicker(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                      currentPattern === pattern
                        ? 'bg-white/30 text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {PATTERN_ICONS[pattern] || <Waves className="w-4 h-4" />}
                    <span className="capitalize truncate">{pattern.replace(/_/g, ' ')}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Session Controls */}
      <div className="flex items-center gap-3">
        {/* Pause/Resume */}
        <button
          onClick={isPaused ? onResume : onPause}
          className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
            isPaused
              ? 'bg-green-500/30 text-green-200 hover:bg-green-500/50'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          {isPaused ? (
            <>
              <Play className="w-5 h-5" />
              Resume
            </>
          ) : (
            <>
              <Pause className="w-5 h-5" />
              Pause
            </>
          )}
        </button>

        {/* Emergency Stop */}
        <button
          onClick={() => setShowEmergencyConfirm(true)}
          className="py-3 px-4 rounded-xl bg-red-500/20 text-red-200 hover:bg-red-500/40 transition-colors"
        >
          <StopCircle className="w-5 h-5" />
        </button>
      </div>

      {/* Emergency Stop Confirmation */}
      {showEmergencyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <div>
                <h3 className="text-lg font-bold text-white">Emergency Stop</h3>
                <p className="text-sm text-gray-400">This will end your session immediately</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowEmergencyConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-gray-700 text-white hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onEmergencyStop();
                  setShowEmergencyConfirm(false);
                }}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
              >
                Stop Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

SessionControls.displayName = 'SessionControls';

export default SessionControls;
