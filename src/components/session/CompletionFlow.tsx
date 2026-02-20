/**
 * CompletionFlow — Denial vs release completion paths with points display.
 * Two-step: completion type selection → points breakdown → done.
 */

import { useState, useEffect } from 'react';
import { Shield, Unlock, Sparkles, AlertCircle, Zap } from 'lucide-react';
import { SESSION_COLORS } from './session-types';
import type { CompletionType, AuctionOption } from './session-types';

interface CompletionFlowProps {
  edgeCount: number;
  sessionType: string;
  onSelectType: (type: CompletionType) => void;
  pointsAwarded: number;
  completionType: CompletionType | null;
  commitments: AuctionOption[];
  onDone: () => void;
}

const COMPLETION_OPTIONS: {
  type: CompletionType;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    type: 'denial',
    icon: Shield,
    label: 'Denied',
    description: 'Good girl. Streak continues.',
    color: SESSION_COLORS.teal,
  },
  {
    type: 'hands_free',
    icon: Sparkles,
    label: 'Hands-Free',
    description: 'Incredible. Streak continues. Bonus points.',
    color: SESSION_COLORS.gold,
  },
  {
    type: 'ruined',
    icon: Unlock,
    label: 'Ruined',
    description: 'Streak resets. Start again.',
    color: '#ef4444',
  },
  {
    type: 'full',
    icon: Unlock,
    label: 'Full Release',
    description: 'Streak resets.',
    color: '#f97316',
  },
  {
    type: 'emergency_stop',
    icon: AlertCircle,
    label: 'Emergency Stop',
    description: 'No consequences. Take care of yourself.',
    color: '#6b7280',
  },
];

export function CompletionFlow({
  edgeCount,
  sessionType,
  onSelectType,
  pointsAwarded,
  completionType,
  commitments,
  onDone,
}: CompletionFlowProps) {
  const [animatedPoints, setAnimatedPoints] = useState(0);

  // Animate points counter when completion type is selected
  useEffect(() => {
    if (!completionType || pointsAwarded <= 0) {
      setAnimatedPoints(0);
      return;
    }

    const duration = 1500;
    const steps = 30;
    const increment = pointsAwarded / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= pointsAwarded) {
        setAnimatedPoints(pointsAwarded);
        clearInterval(interval);
      } else {
        setAnimatedPoints(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(interval);
  }, [completionType, pointsAwarded]);

  // Step 1: Select completion type
  if (!completionType) {
    // Filter options based on session type
    const options = sessionType === 'type_b'
      ? COMPLETION_OPTIONS
      : COMPLETION_OPTIONS.filter(o => o.type !== 'full');

    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <p className="text-sm tracking-widest uppercase mb-2" style={{ color: SESSION_COLORS.gold }}>
              Session End
            </p>
            <p className="text-white text-lg font-medium">How did this session end?</p>
          </div>

          <div className="space-y-3">
            {options.map(({ type, icon: Icon, label, description, color }) => (
              <button
                key={type}
                onClick={() => onSelectType(type)}
                className="w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all flex items-center gap-4 text-left"
              >
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}20` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <div>
                  <p className="text-white font-medium">{label}</p>
                  <p className="text-xs text-white/40">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Points display
  const selected = COMPLETION_OPTIONS.find(o => o.type === completionType);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Completion type result */}
        <div>
          <p className="text-sm text-white/40 mb-2">{selected?.description}</p>
        </div>

        {/* Points */}
        <div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="w-6 h-6" style={{ color: SESSION_COLORS.gold }} />
            <span className="text-5xl font-bold" style={{ color: SESSION_COLORS.gold }}>
              {completionType === 'emergency_stop' ? '—' : `+${animatedPoints}`}
            </span>
          </div>
          {completionType !== 'emergency_stop' && (
            <div className="text-xs text-white/30 space-y-1">
              <p>50 base + {edgeCount * 10} edges</p>
              {completionType === 'denial' && <p>+25 denial bonus</p>}
              {completionType === 'hands_free' && <p>+50 hands-free bonus</p>}
            </div>
          )}
        </div>

        {/* Commitment summary */}
        {commitments.length > 0 && (
          <div className="text-left space-y-2">
            <p className="text-xs text-white/50 uppercase tracking-widest text-center mb-3">
              Your horny self made these decisions. Honor her.
            </p>
            {commitments.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-white/10 bg-white/5"
              >
                <span className="text-lg">{c.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{c.label}</p>
                  <p className="text-white/30 text-xs">{c.commitmentValue}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Done button */}
        <button
          onClick={onDone}
          className="w-full py-4 rounded-xl font-semibold text-lg text-white hover:opacity-90 transition-all"
          style={{
            background: `linear-gradient(135deg, ${SESSION_COLORS.rose}, ${SESSION_COLORS.purple})`,
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
