// DenialTracker Component
// Visual denial streak tracker with milestones and extension options

import { memo, useState } from 'react';
import {
  Flame,
  Trophy,
  Plus,
  Lock,
  Unlock,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useCurrentDenialDay } from '../../hooks/useCurrentDenialDay';
import { useBambiMode } from '../../context/BambiModeContext';

interface DenialTrackerProps {
  compact?: boolean;
  showExtendOption?: boolean;
  onExtend?: (days: number) => void;
  className?: string;
}

// Milestone achievements with rewards
const MILESTONE_REWARDS = {
  3: { label: '3 Days', emoji: '🌱', reward: 'Building momentum' },
  7: { label: '1 Week', emoji: '🔥', reward: 'First week complete' },
  14: { label: '2 Weeks', emoji: '💪', reward: 'Getting stronger' },
  21: { label: '3 Weeks', emoji: '⭐', reward: 'Habit forming' },
  30: { label: '1 Month', emoji: '🏆', reward: 'Major milestone' },
  45: { label: '45 Days', emoji: '💎', reward: 'Elite territory' },
  60: { label: '2 Months', emoji: '👑', reward: 'Denial master' },
  90: { label: '3 Months', emoji: '🌟', reward: 'Legendary status' },
  120: { label: '4 Months', emoji: '💫', reward: 'Transcendent' },
  180: { label: '6 Months', emoji: '🎯', reward: 'Absolute control' },
  365: { label: '1 Year', emoji: '🏅', reward: 'Ultimate achievement' },
};

export const DenialTracker = memo(function DenialTracker({
  compact = false,
  showExtendOption = true,
  onExtend,
  className = '',
}: DenialTrackerProps) {
  const { isBambiMode } = useBambiMode();
  const denial = useCurrentDenialDay();
  const [showDetails, setShowDetails] = useState(!compact);
  const [showExtendModal, setShowExtendModal] = useState(false);

  if (denial.isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className={`h-24 rounded-xl ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`} />
      </div>
    );
  }

  // Progress to next milestone
  const progressToNext = denial.nextMilestone > 0
    ? Math.min(100, (denial.currentDay / denial.nextMilestone) * 100)
    : 100;

  // Get current milestone info
  const nextMilestoneInfo = MILESTONE_REWARDS[denial.nextMilestone as keyof typeof MILESTONE_REWARDS];

  if (compact) {
    return (
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`w-full p-3 rounded-xl transition-all ${
          isBambiMode
            ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500'
            : 'bg-gradient-to-r from-purple-600 to-pink-600'
        } ${className}`}
      >
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-2xl font-bold">{denial.currentDay}</span>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium opacity-90">Day {denial.currentDay}</div>
              <div className="text-xs opacity-70">
                {denial.canRelease ? 'Release earned' : `${denial.daysUntilEarnedRelease}d to earned`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {denial.isPersonalBest && (
              <Trophy className="w-5 h-5 text-yellow-300" />
            )}
            {showDetails ? (
              <ChevronUp className="w-5 h-5 opacity-70" />
            ) : (
              <ChevronDown className="w-5 h-5 opacity-70" />
            )}
          </div>
        </div>

        {showDetails && (
          <div className="mt-3 pt-3 border-t border-white/20">
            <DenialTrackerExpanded denial={denial} isBambiMode={isBambiMode} />
          </div>
        )}
      </button>
    );
  }

  return (
    <div
      className={`rounded-2xl overflow-hidden ${
        isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
      } ${className}`}
    >
      {/* Header with large day counter */}
      <div
        className={`p-6 text-center ${
          isBambiMode
            ? 'bg-gradient-to-br from-pink-500 to-fuchsia-500'
            : 'bg-gradient-to-br from-purple-600 to-pink-600'
        }`}
      >
        <div className="relative inline-block">
          {/* Glow effect for personal best */}
          {denial.isPersonalBest && (
            <div className="absolute inset-0 animate-pulse">
              <div className="w-full h-full rounded-full bg-yellow-400/30 blur-xl" />
            </div>
          )}

          {/* Day counter */}
          <div className="relative w-32 h-32 mx-auto rounded-full bg-white/20 flex flex-col items-center justify-center">
            <span className="text-5xl font-bold text-white">{denial.currentDay}</span>
            <span className="text-sm text-white/80 uppercase tracking-wider">days</span>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center justify-center gap-2 mt-4">
          {denial.isPersonalBest && (
            <span className="px-3 py-1 rounded-full bg-yellow-400/30 text-yellow-200 text-xs font-medium flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              Personal Best!
            </span>
          )}
          {denial.canRelease ? (
            <span className="px-3 py-1 rounded-full bg-green-400/30 text-green-200 text-xs font-medium flex items-center gap-1">
              <Unlock className="w-3 h-3" />
              Release Earned
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-white/20 text-white/80 text-xs font-medium flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {denial.daysUntilEarnedRelease}d until earned
            </span>
          )}
        </div>
      </div>

      {/* Progress to next milestone */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
            Next: {nextMilestoneInfo?.label || `Day ${denial.nextMilestone}`}
          </span>
          <span className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {denial.daysToNextMilestone} days
          </span>
        </div>
        <div className={`h-3 rounded-full overflow-hidden ${isBambiMode ? 'bg-pink-200' : 'bg-protocol-border'}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isBambiMode
                ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500'
                : 'bg-gradient-to-r from-purple-500 to-pink-500'
            }`}
            style={{ width: `${progressToNext}%` }}
          />
        </div>
        {nextMilestoneInfo && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-lg">{nextMilestoneInfo.emoji}</span>
            <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              {nextMilestoneInfo.reward}
            </span>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className={`grid grid-cols-3 gap-4 px-6 py-4 border-t ${isBambiMode ? 'border-pink-200' : 'border-protocol-border'}`}>
        <StatItem
          icon={<Flame className="w-4 h-4" />}
          label="Edges"
          value={denial.totalEdgesDuringStreak}
          isBambiMode={isBambiMode}
        />
        <StatItem
          icon={<Sparkles className="w-4 h-4" />}
          label="Sweet Spot"
          value={`${denial.sweetSpotDaysThisStreak}d`}
          isBambiMode={isBambiMode}
        />
        <StatItem
          icon={<Trophy className="w-4 h-4" />}
          label="Best"
          value={`${denial.personalBest}d`}
          isBambiMode={isBambiMode}
        />
      </div>

      {/* Milestones reached */}
      {denial.milestonesReached.length > 0 && (
        <div className={`px-6 py-4 border-t ${isBambiMode ? 'border-pink-200' : 'border-protocol-border'}`}>
          <div className={`text-xs font-medium mb-2 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
            Milestones Reached
          </div>
          <div className="flex flex-wrap gap-2">
            {denial.milestonesReached.map(milestone => {
              const info = MILESTONE_REWARDS[milestone as keyof typeof MILESTONE_REWARDS];
              return (
                <span
                  key={milestone}
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    isBambiMode
                      ? 'bg-pink-200 text-pink-700'
                      : 'bg-protocol-accent/20 text-protocol-accent'
                  }`}
                >
                  {info?.emoji} {info?.label || `${milestone}d`}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Extend option */}
      {showExtendOption && denial.canRelease && (
        <div className={`px-6 py-4 border-t ${isBambiMode ? 'border-pink-200' : 'border-protocol-border'}`}>
          <button
            onClick={() => setShowExtendModal(true)}
            className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            <Plus className="w-5 h-5" />
            Extend Streak
          </button>
          <p className={`text-xs text-center mt-2 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Challenge yourself to go longer
          </p>
        </div>
      )}

      {/* Extend modal */}
      {showExtendModal && (
        <ExtendStreakModal
          currentDay={denial.currentDay}
          onExtend={(days) => {
            onExtend?.(days);
            setShowExtendModal(false);
          }}
          onClose={() => setShowExtendModal(false)}
          isBambiMode={isBambiMode}
        />
      )}
    </div>
  );
});

DenialTracker.displayName = 'DenialTracker';

// Stat item component
function StatItem({
  icon,
  label,
  value,
  isBambiMode,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  isBambiMode: boolean;
}) {
  return (
    <div className="text-center">
      <div className={`flex items-center justify-center gap-1 mb-1 ${
        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
      }`}>
        {icon}
      </div>
      <div className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
        {value}
      </div>
      <div className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
        {label}
      </div>
    </div>
  );
}

// Expanded view for compact mode
function DenialTrackerExpanded({
  denial,
  isBambiMode: _isBambiMode,
}: {
  denial: ReturnType<typeof useCurrentDenialDay>;
  isBambiMode: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 text-white">
      <div className="text-center">
        <div className="text-lg font-bold">{denial.totalEdgesDuringStreak}</div>
        <div className="text-xs opacity-70">Edges</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold">{denial.nextMilestone}d</div>
        <div className="text-xs opacity-70">Next Goal</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold">{denial.personalBest}d</div>
        <div className="text-xs opacity-70">Best</div>
      </div>
    </div>
  );
}

// Extend streak modal
function ExtendStreakModal({
  currentDay,
  onExtend,
  onClose,
  isBambiMode,
}: {
  currentDay: number;
  onExtend: (days: number) => void;
  onClose: () => void;
  isBambiMode: boolean;
}) {
  const extensionOptions = [
    { days: 3, label: '+3 Days', description: 'A little more' },
    { days: 7, label: '+1 Week', description: 'Push further' },
    { days: 14, label: '+2 Weeks', description: 'Real commitment' },
    { days: 30, label: '+1 Month', description: 'Deep dedication' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`w-full max-w-sm rounded-2xl p-6 ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}
      >
        <h3 className={`text-xl font-bold mb-2 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Extend Your Streak
        </h3>
        <p className={`text-sm mb-6 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          Currently on day {currentDay}. How much longer can you go?
        </p>

        <div className="space-y-3">
          {extensionOptions.map(option => (
            <button
              key={option.days}
              onClick={() => onExtend(option.days)}
              className={`w-full p-4 rounded-xl text-left transition-all ${
                isBambiMode
                  ? 'bg-pink-50 hover:bg-pink-100 border border-pink-200'
                  : 'bg-protocol-bg hover:bg-protocol-border border border-protocol-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                    {option.label}
                  </div>
                  <div className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                    {option.description}
                  </div>
                </div>
                <div className={`text-sm font-medium ${isBambiMode ? 'text-pink-600' : 'text-protocol-accent'}`}>
                  Day {currentDay + option.days}
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className={`w-full mt-4 py-3 rounded-xl font-medium ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
              : 'bg-protocol-border text-protocol-text hover:bg-protocol-surface-light'
          }`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default DenialTracker;
