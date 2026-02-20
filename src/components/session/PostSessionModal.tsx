/**
 * PostSessionModal — End-of-session capture: mood, optional reflection.
 */

import { useState } from 'react';
import { SESSION_COLORS } from './session-types';
import type { PostMood } from './session-types';

interface PostSessionModalProps {
  edgeCount: number;
  targetEdges: number;
  elapsedFormatted: string;
  sessionType: string;
  onSubmit: (mood: PostMood, notes: string) => void;
}

const MOOD_OPTIONS: { value: PostMood; emoji: string; label: string }[] = [
  { value: 'settled', emoji: '😌', label: 'Settled' },
  { value: 'aching', emoji: '🔥', label: 'Aching' },
  { value: 'overwhelmed', emoji: '😵', label: 'Overwhelmed' },
  { value: 'euphoric', emoji: '✨', label: 'Euphoric' },
];

export function PostSessionModal({
  edgeCount,
  targetEdges,
  elapsedFormatted,
  sessionType,
  onSubmit,
}: PostSessionModalProps) {
  const [selectedMood, setSelectedMood] = useState<PostMood | null>(null);
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!selectedMood) return;
    onSubmit(selectedMood, notes);
  };

  const typeLabel = sessionType.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm tracking-widest uppercase mb-2" style={{ color: SESSION_COLORS.gold }}>
            Session Complete
          </p>
          <div className="flex items-center justify-center gap-3 text-white/50 text-sm">
            <span>{typeLabel}</span>
            <span className="text-white/20">|</span>
            <span>{elapsedFormatted}</span>
          </div>
          <p className="text-3xl font-bold text-white mt-4">
            {edgeCount}
            <span className="text-lg text-white/40">/{targetEdges}</span>
            <span className="text-lg text-white/30 ml-2">edges</span>
          </p>
        </div>

        {/* Mood capture */}
        <div className="space-y-3">
          <p className="text-sm text-white/60 text-center">How do you feel?</p>
          <div className="flex justify-center gap-3">
            {MOOD_OPTIONS.map(({ value, emoji, label }) => (
              <button
                key={value}
                onClick={() => setSelectedMood(value)}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
                  selectedMood === value
                    ? 'bg-white/15 scale-105'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-xs text-white/50">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Optional reflection */}
        <div className="space-y-2">
          <p className="text-sm text-white/40">Quick reflection (optional)</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="What did you notice?"
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
          />
        </div>

        {/* Continue button */}
        <button
          onClick={handleSubmit}
          disabled={!selectedMood}
          className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
            selectedMood
              ? 'text-white hover:opacity-90'
              : 'text-white/30 cursor-not-allowed'
          }`}
          style={{
            background: selectedMood
              ? `linear-gradient(135deg, ${SESSION_COLORS.rose}, ${SESSION_COLORS.purple})`
              : 'rgba(255,255,255,0.05)',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
