/**
 * Quick State Input
 *
 * Minimal inputs to update:
 * - Arousal level (0-5 tap or slider)
 * - Gina home/away toggle
 * - Mood check (one tap, not a form)
 *
 * These are small, unobtrusive, always accessible.
 */

import { useState } from 'react';
import { Home, Coffee, Flame, Smile, Meh, Frown } from 'lucide-react';

// ============================================
// AROUSAL INPUT
// ============================================

interface ArousalInputProps {
  value: number;
  onChange: (value: number) => void;
}

export function ArousalInput({ value, onChange }: ArousalInputProps) {
  return (
    <div className="flex items-center gap-2">
      <Flame className="w-4 h-4 text-protocol-text-muted" />
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4, 5].map(level => (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={`w-6 h-6 rounded-full text-xs font-medium transition-all ${
              level === value
                ? level >= 4 ? 'bg-red-500 text-white scale-110' :
                  level >= 2 ? 'bg-amber-500 text-white scale-110' :
                  'bg-protocol-accent text-white scale-110'
                : 'bg-protocol-surface/50 text-protocol-text-muted hover:bg-protocol-surface'
            }`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// GINA TOGGLE
// ============================================

interface GinaToggleProps {
  isHome: boolean;
  onChange: (isHome: boolean) => void;
}

export function GinaToggle({ isHome, onChange }: GinaToggleProps) {
  return (
    <button
      onClick={() => onChange(!isHome)}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        isHome
          ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
          : 'bg-protocol-surface/50 text-protocol-text-muted hover:bg-protocol-surface border border-transparent'
      }`}
    >
      {isHome ? <Home className="w-3.5 h-3.5" /> : <Coffee className="w-3.5 h-3.5" />}
      <span>{isHome ? 'Home' : 'Away'}</span>
    </button>
  );
}

// ============================================
// MOOD TAP
// ============================================

export type Mood = 'good' | 'neutral' | 'low';

interface MoodTapProps {
  value: Mood | null;
  onChange: (mood: Mood) => void;
}

export function MoodTap({ value, onChange }: MoodTapProps) {
  const moods: { id: Mood; icon: React.ElementType; label: string }[] = [
    { id: 'good', icon: Smile, label: 'Good' },
    { id: 'neutral', icon: Meh, label: 'Okay' },
    { id: 'low', icon: Frown, label: 'Low' },
  ];

  return (
    <div className="flex items-center gap-1">
      {moods.map(mood => {
        const Icon = mood.icon;
        const isActive = value === mood.id;
        return (
          <button
            key={mood.id}
            onClick={() => onChange(mood.id)}
            className={`p-2 rounded-lg transition-all ${
              isActive
                ? mood.id === 'good' ? 'bg-emerald-500/20 text-emerald-400' :
                  mood.id === 'neutral' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-red-500/20 text-red-400'
                : 'text-protocol-text-muted hover:bg-protocol-surface/50'
            }`}
            title={mood.label}
          >
            <Icon className="w-5 h-5" />
          </button>
        );
      })}
    </div>
  );
}

// ============================================
// COMBINED QUICK STATE BAR
// ============================================

interface QuickStateBarProps {
  arousal: number;
  ginaHome: boolean;
  mood: Mood | null;
  onArousalChange: (value: number) => void;
  onGinaChange: (isHome: boolean) => void;
  onMoodChange: (mood: Mood) => void;
  compact?: boolean;
}

export function QuickStateBar({
  arousal,
  ginaHome,
  mood,
  onArousalChange,
  onGinaChange,
  onMoodChange,
  compact = false,
}: QuickStateBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-3 px-4 py-2 bg-protocol-surface/30 rounded-full text-xs text-protocol-text-muted hover:bg-protocol-surface/50 transition-colors"
      >
        <span className="flex items-center gap-1">
          <Flame className="w-3 h-3" />
          {arousal}
        </span>
        <span className="text-protocol-text-muted/30">·</span>
        <span className="flex items-center gap-1">
          {ginaHome ? <Home className="w-3 h-3" /> : <Coffee className="w-3 h-3" />}
        </span>
        <span className="text-protocol-text-muted/30">·</span>
        <span>Update</span>
      </button>
    );
  }

  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 bg-protocol-surface/30 rounded-lg ${
      compact ? 'animate-fade-in' : ''
    }`}>
      <ArousalInput value={arousal} onChange={onArousalChange} />

      <div className="flex items-center gap-3">
        <GinaToggle isHome={ginaHome} onChange={onGinaChange} />
        <MoodTap value={mood} onChange={onMoodChange} />
      </div>

      {compact && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-protocol-text-muted hover:text-protocol-text"
        >
          Done
        </button>
      )}
    </div>
  );
}
