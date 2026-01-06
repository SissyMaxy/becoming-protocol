import {
  Zap,
  Trophy,
  Anchor,
  Heart,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useReward } from '../../context/RewardContext';
import { PointsDisplay } from './PointsDisplay';
import { LevelProgress, LevelBadge } from './LevelProgress';
import { NarrationCounter } from './NarrationCounter';
import { SessionGate } from './SessionGate';
import { AchievementModal } from './AchievementModal';

interface RewardDashboardProps {
  className?: string;
  onNavigateToAchievements?: () => void;
  onNavigateToAnchors?: () => void;
  onStartSession?: (type: 'anchoring' | 'reward') => void;
}

export function RewardDashboard({
  className = '',
  onNavigateToAchievements,
  onNavigateToAnchors,
  onStartSession,
}: RewardDashboardProps) {
  const { isBambiMode } = useBambiMode();
  const {
    rewardState,
    achievements,
    anchors,
    sessionGate,
    levelInfo,
    streakMultiplier,
    incrementNarration,
    achievementUnlockedEvent,
    dismissAchievementUnlocked,
    isLoading,
  } = useReward();

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div
          className={`h-32 rounded-xl ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}
        />
      </div>
    );
  }

  if (!rewardState || !levelInfo) {
    return (
      <div
        className={`text-center py-8 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        } ${className}`}
      >
        <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Rewards not available</p>
      </div>
    );
  }

  const activeAnchors = anchors.filter(a => a.isActive);
  const unlockedAchievements = achievements.length;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Achievement Modal */}
      {achievementUnlockedEvent && (
        <AchievementModal
          achievement={achievementUnlockedEvent.achievement}
          pointsAwarded={achievementUnlockedEvent.pointsAwarded}
          onDismiss={dismissAchievementUnlocked}
        />
      )}

      {/* Main Stats Card */}
      <div
        className={`${
          isBambiMode
            ? 'bg-white border-2 border-pink-200 rounded-3xl shadow-[0_4px_20px_rgba(255,105,180,0.2)]'
            : 'bg-protocol-surface border border-protocol-border rounded-lg'
        } p-6`}
      >
        {/* Points and Level Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <PointsDisplay
              points={rewardState.totalPoints}
              multiplier={streakMultiplier}
              size="lg"
            />
            <div className="mt-1 flex items-center gap-2">
              <TrendingUp
                className={`w-4 h-4 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              />
              <span
                className={`text-sm ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                {streakMultiplier.toFixed(2)}x multiplier from{' '}
                {rewardState.currentStreak} day streak
              </span>
            </div>
          </div>
          <LevelBadge level={rewardState.currentLevel} />
        </div>

        {/* Level Progress */}
        <LevelProgress levelInfo={levelInfo} />
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Achievements */}
        <button
          onClick={onNavigateToAchievements}
          className={`p-4 rounded-xl text-center transition-all ${
            isBambiMode
              ? 'bg-white border-2 border-pink-200 hover:border-pink-300'
              : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
          }`}
        >
          <Trophy
            className={`w-6 h-6 mx-auto mb-2 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`}
          />
          <span
            className={`text-2xl font-bold block ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {unlockedAchievements}
          </span>
          <span
            className={`text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            Achievements
          </span>
        </button>

        {/* Anchors */}
        <button
          onClick={onNavigateToAnchors}
          className={`p-4 rounded-xl text-center transition-all ${
            isBambiMode
              ? 'bg-white border-2 border-pink-200 hover:border-pink-300'
              : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
          }`}
        >
          <Anchor
            className={`w-6 h-6 mx-auto mb-2 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`}
          />
          <span
            className={`text-2xl font-bold block ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {activeAnchors.length}
          </span>
          <span
            className={`text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            Active Anchors
          </span>
        </button>

        {/* Sessions */}
        <div
          className={`p-4 rounded-xl text-center ${
            isBambiMode
              ? 'bg-white border-2 border-pink-200'
              : 'bg-protocol-surface border border-protocol-border'
          }`}
        >
          <Heart
            className={`w-6 h-6 mx-auto mb-2 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`}
          />
          <span
            className={`text-2xl font-bold block ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {rewardState.anchoringSessionsThisWeek}
          </span>
          <span
            className={`text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            Sessions/Week
          </span>
        </div>
      </div>

      {/* Narration Counter */}
      <div
        className={`${
          isBambiMode
            ? 'bg-white border-2 border-pink-200 rounded-3xl'
            : 'bg-protocol-surface border border-protocol-border rounded-lg'
        } p-6`}
      >
        <NarrationCounter
          dailyCount={rewardState.dailyNarrationCount}
          streak={rewardState.narrationStreak}
          onIncrement={incrementNarration}
        />
      </div>

      {/* Session Gate */}
      {sessionGate && (
        <SessionGate
          gateStatus={sessionGate}
          onStartAnchoring={() => onStartSession?.('anchoring')}
          onStartReward={() => onStartSession?.('reward')}
        />
      )}

      {/* Quick Links */}
      <div className="space-y-2">
        <button
          onClick={onNavigateToAchievements}
          className={`w-full flex items-center justify-between p-4 rounded-xl transition-colors ${
            isBambiMode
              ? 'bg-white border-2 border-pink-200 hover:border-pink-300'
              : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
          }`}
        >
          <div className="flex items-center gap-3">
            <Trophy
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`}
            />
            <span
              className={`font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              View All Achievements
            </span>
          </div>
          <ChevronRight
            className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          />
        </button>

        <button
          onClick={onNavigateToAnchors}
          className={`w-full flex items-center justify-between p-4 rounded-xl transition-colors ${
            isBambiMode
              ? 'bg-white border-2 border-pink-200 hover:border-pink-300'
              : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
          }`}
        >
          <div className="flex items-center gap-3">
            <Anchor
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`}
            />
            <span
              className={`font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Manage Anchors
            </span>
          </div>
          <ChevronRight
            className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
