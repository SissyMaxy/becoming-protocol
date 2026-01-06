import { Lock, Unlock, Play, Check, Clock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { SessionGateStatus } from '../../types/rewards';

interface SessionGateProps {
  gateStatus: SessionGateStatus;
  onStartAnchoring?: () => void;
  onStartReward?: () => void;
  className?: string;
}

export function SessionGate({
  gateStatus,
  onStartAnchoring,
  onStartReward,
  className = '',
}: SessionGateProps) {
  const { isBambiMode } = useBambiMode();
  const {
    anchoringSessionsThisWeek,
    requiredAnchoring,
    rewardSessionsEarned,
    rewardSessionsUsed,
    canStartRewardSession,
    weekResetsAt,
  } = gateStatus;

  // Calculate progress to next reward session
  const sessionsUntilReward = requiredAnchoring - (anchoringSessionsThisWeek % requiredAnchoring);

  // Calculate time until week reset
  const resetDate = new Date(weekResetsAt);
  const now = new Date();
  const daysUntilReset = Math.ceil((resetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div
      className={`${
        isBambiMode
          ? 'bg-white border-2 border-pink-200 rounded-3xl'
          : 'bg-protocol-surface border border-protocol-border rounded-lg'
      } p-6 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3
          className={`text-lg font-semibold ${
            isBambiMode ? 'text-pink-800' : 'text-protocol-text'
          }`}
        >
          Session Gate
        </h3>
        <div
          className={`flex items-center gap-1 text-sm ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Resets in {daysUntilReset} days</span>
        </div>
      </div>

      {/* Anchoring Sessions Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span
            className={`text-sm font-medium ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Anchoring Sessions
          </span>
          <span
            className={`text-sm ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {anchoringSessionsThisWeek} this week
          </span>
        </div>

        {/* Progress dots */}
        <div className="flex gap-2">
          {Array.from({ length: requiredAnchoring }).map((_, i) => {
            const completed = i < (anchoringSessionsThisWeek % requiredAnchoring) ||
              (anchoringSessionsThisWeek >= requiredAnchoring && rewardSessionsUsed < rewardSessionsEarned);
            return (
              <div
                key={i}
                className={`flex-1 h-2 rounded-full ${
                  completed
                    ? isBambiMode
                      ? 'bg-pink-500'
                      : 'bg-protocol-success'
                    : isBambiMode
                      ? 'bg-pink-200'
                      : 'bg-protocol-surface-light'
                }`}
              />
            );
          })}
        </div>

        {/* Sessions until reward text */}
        {!canStartRewardSession && (
          <p
            className={`mt-2 text-sm ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {sessionsUntilReward} more anchoring session{sessionsUntilReward !== 1 ? 's' : ''} to unlock reward
          </p>
        )}
      </div>

      {/* Reward Session Status */}
      <div
        className={`p-4 rounded-xl ${
          canStartRewardSession
            ? isBambiMode
              ? 'bg-gradient-to-r from-pink-50 to-purple-50 border-2 border-pink-300'
              : 'bg-protocol-accent/10 border border-protocol-accent/30'
            : isBambiMode
              ? 'bg-pink-50 border border-pink-200'
              : 'bg-protocol-surface-light border border-protocol-border'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Lock/Unlock icon */}
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
              canStartRewardSession
                ? isBambiMode
                  ? 'bg-gradient-to-r from-pink-400 to-pink-600'
                  : 'bg-protocol-accent'
                : isBambiMode
                  ? 'bg-pink-200'
                  : 'bg-protocol-surface'
            }`}
          >
            {canStartRewardSession ? (
              <Unlock className="w-6 h-6 text-white" />
            ) : (
              <Lock
                className={`w-6 h-6 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              />
            )}
          </div>

          {/* Status text */}
          <div className="flex-1">
            <p
              className={`font-medium ${
                canStartRewardSession
                  ? isBambiMode
                    ? 'text-pink-700'
                    : 'text-protocol-text'
                  : isBambiMode
                    ? 'text-pink-500'
                    : 'text-protocol-text-muted'
              }`}
            >
              Reward Session
            </p>
            <p
              className={`text-sm ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              {canStartRewardSession
                ? `${rewardSessionsEarned - rewardSessionsUsed} available this week`
                : 'Complete anchoring sessions to unlock'}
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={onStartAnchoring}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
              : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
          }`}
        >
          <Play className="w-4 h-4" />
          <span>Anchoring</span>
        </button>

        <button
          onClick={onStartReward}
          disabled={!canStartRewardSession}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
            canStartRewardSession
              ? isBambiMode
                ? 'bg-gradient-to-r from-pink-400 to-pink-600 text-white hover:shadow-lg'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
              : isBambiMode
                ? 'bg-pink-100 text-pink-300 cursor-not-allowed'
                : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
          }`}
        >
          {canStartRewardSession ? (
            <>
              <Play className="w-4 h-4" />
              <span>Reward</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Locked</span>
            </>
          )}
        </button>
      </div>

      {/* Earned sessions summary */}
      {rewardSessionsEarned > 0 && (
        <div
          className={`mt-4 pt-4 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-sm ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Reward sessions this week:
            </span>
            <div className="flex items-center gap-2">
              {Array.from({ length: rewardSessionsEarned }).map((_, i) => (
                <div
                  key={i}
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    i < rewardSessionsUsed
                      ? isBambiMode
                        ? 'bg-pink-200 text-pink-400'
                        : 'bg-protocol-surface-light text-protocol-text-muted'
                      : isBambiMode
                        ? 'bg-pink-500 text-white'
                        : 'bg-protocol-success text-white'
                  }`}
                >
                  {i < rewardSessionsUsed ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
