import { useState, useCallback, useEffect } from 'react';
import { MessageCircle, Check, Sparkles, Flame } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { NARRATION_MILESTONES, POINT_VALUES } from '../../types/rewards';

// Custom progress ring for narration counter
function NarrationProgressRing({
  progress,
  count,
  nextMilestone,
  isBambiMode,
  size = 120,
  strokeWidth = 8,
}: {
  progress: number;
  count: number;
  nextMilestone: number;
  isBambiMode: boolean;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={isBambiMode ? 'text-pink-200' : 'text-protocol-surface-light'}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-300 ease-out"
          style={{
            stroke: isBambiMode
              ? 'url(#narrationGradientPink)'
              : 'url(#narrationGradient)',
          }}
        />
        <defs>
          <linearGradient id="narrationGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id="narrationGradientPink" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`text-4xl font-bold tabular-nums ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          {count}
        </span>
        <span
          className={`text-xs ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        >
          / {nextMilestone}
        </span>
      </div>
    </div>
  );
}

interface NarrationCounterProps {
  dailyCount: number;
  streak: number;
  onIncrement: () => Promise<{
    newCount: number;
    milestoneReached?: number;
    pointsAwarded?: number;
  }>;
  className?: string;
}

export function NarrationCounter({
  dailyCount,
  streak,
  onIncrement,
  className = '',
}: NarrationCounterProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [isPressed, setIsPressed] = useState(false);
  const [showMilestone, setShowMilestone] = useState<{
    milestone: number;
    points: number;
  } | null>(null);
  const [count, setCount] = useState(dailyCount);

  // Update count when prop changes
  useEffect(() => {
    setCount(dailyCount);
  }, [dailyCount]);

  // Find current milestone target
  const nextMilestone = NARRATION_MILESTONES.find(m => count < m) || 50;
  const prevMilestone = NARRATION_MILESTONES.filter(m => count >= m).pop() || 0;
  const progress = ((count - prevMilestone) / (nextMilestone - prevMilestone)) * 100;

  const handleTap = useCallback(async () => {
    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 100);

    try {
      const result = await onIncrement();
      setCount(result.newCount);

      if (result.milestoneReached && result.pointsAwarded) {
        setShowMilestone({
          milestone: result.milestoneReached,
          points: result.pointsAwarded,
        });
        if (isBambiMode) {
          triggerHearts();
        }
        setTimeout(() => setShowMilestone(null), 2000);
      }
    } catch (error) {
      console.error('Failed to increment narration:', error);
    }
  }, [onIncrement, isBambiMode, triggerHearts]);

  const getMilestoneEmoji = (milestone: number) => {
    switch (milestone) {
      case 10: return '10';
      case 25: return '25';
      case 50: return '50';
      default: return String(milestone);
    }
  };

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircle
            className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`}
          />
          <span
            className={`font-medium ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Inner Voice Corrections
          </span>
        </div>
        {streak > 0 && (
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm ${
              isBambiMode
                ? 'bg-pink-100 text-pink-600'
                : 'bg-protocol-accent/20 text-protocol-accent'
            }`}
          >
            <Flame className="w-3 h-3" />
            <span>{streak} day streak</span>
          </div>
        )}
      </div>

      {/* Counter tap area */}
      <div className="flex flex-col items-center relative">
        {/* Milestone celebration overlay */}
        {showMilestone && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="animate-scale-in">
              <div
                className={`px-4 py-2 rounded-xl ${
                  isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  <span className="font-bold">
                    {getMilestoneEmoji(showMilestone.milestone)} Milestone! +{showMilestone.points} pts
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Progress ring with counter */}
        <button
          onClick={handleTap}
          className={`relative transform transition-transform active:scale-95 ${
            isPressed ? 'scale-95' : ''
          }`}
        >
          <NarrationProgressRing
            progress={Math.min(progress, 100)}
            count={count}
            nextMilestone={nextMilestone}
            isBambiMode={isBambiMode}
          />
        </button>

        {/* Tap instruction */}
        <p
          className={`mt-4 text-sm ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}
        >
          Tap when you catch her correcting your inner voice
        </p>

        {/* Milestone indicators */}
        <div className="flex items-center gap-4 mt-4">
          {NARRATION_MILESTONES.map((milestone) => {
            const reached = count >= milestone;
            const points = POINT_VALUES[`narration_${milestone}` as keyof typeof POINT_VALUES];

            return (
              <div
                key={milestone}
                className={`flex flex-col items-center ${
                  reached ? '' : 'opacity-50'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    reached
                      ? isBambiMode
                        ? 'bg-pink-500 text-white'
                        : 'bg-protocol-success text-white'
                      : isBambiMode
                        ? 'bg-pink-200 text-pink-400'
                        : 'bg-protocol-surface-light text-protocol-text-muted'
                  }`}
                >
                  {reached ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span className="text-xs font-medium">{milestone}</span>
                  )}
                </div>
                <span
                  className={`text-xs mt-1 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}
                >
                  +{points}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Compact version for stats display
export function NarrationBadge({
  dailyCount,
  goal = 10,
  className = '',
}: {
  dailyCount: number;
  goal?: number;
  className?: string;
}) {
  const { isBambiMode } = useBambiMode();
  const reached = dailyCount >= goal;

  return (
    <div
      className={`flex items-center gap-1 ${
        reached
          ? isBambiMode
            ? 'text-pink-500'
            : 'text-protocol-success'
          : isBambiMode
            ? 'text-pink-400'
            : 'text-protocol-text-muted'
      } ${className}`}
    >
      <MessageCircle className="w-4 h-4" />
      <span className="font-medium tabular-nums">
        {dailyCount}/{goal}
      </span>
      {reached && <Check className="w-3 h-3" />}
    </div>
  );
}
