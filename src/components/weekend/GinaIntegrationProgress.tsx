/**
 * Gina Integration Progress
 *
 * Displays the progress of Gina's integration into feminization activities.
 * Shows current level, category-specific levels, milestones, and stats.
 */

import { Heart, Sparkles, Lock, Check } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { GinaIntegrationProgress as GinaProgress } from '../../types/weekend';
import { INTEGRATION_LEVEL_LABELS, WEEKEND_CATEGORY_CONFIG } from '../../types/weekend';

interface GinaIntegrationProgressProps {
  progress: GinaProgress;
  compact?: boolean;
}

// Milestone descriptions for display
const MILESTONE_DESCRIPTIONS: Record<string, string> = {
  first_gina_session: 'First activity with Gina',
  first_gina_feminizing: 'First time Gina feminized you',
  gina_initiated_first: 'First time she initiated',
  five_star_engagement: 'First 5-star engagement',
  ten_sessions: '10 weekend sessions completed',
  twenty_five_sessions: '25 weekend sessions completed',
  level_2_achieved: 'Reached Level 2 integration',
  level_3_achieved: 'Reached Level 3 integration',
  level_4_achieved: 'Reached Level 4 integration',
  level_5_achieved: 'Reached Level 5 integration',
  all_categories_explored: 'Explored all activity categories',
};

export function GinaIntegrationProgress({
  progress,
  compact = false
}: GinaIntegrationProgressProps) {
  const { isBambiMode } = useBambiMode();

  const currentLevelConfig = INTEGRATION_LEVEL_LABELS[progress.currentLevel];
  const totalSessions = progress.totalGinaFeminizingSessions +
    progress.totalSharedSessions +
    progress.totalIntimacySessions +
    progress.totalSupportSessions;

  // Get achieved milestones
  const achievedMilestones = Object.entries(progress.milestones)
    .filter(([_, date]) => date)
    .map(([key, date]) => ({
      key,
      description: MILESTONE_DESCRIPTIONS[key] || key,
      date: date as string
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (compact) {
    return (
      <div className={`p-4 rounded-xl ${
        isBambiMode
          ? 'bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200'
          : 'bg-gradient-to-r from-rose-900/20 to-pink-900/20 border border-rose-600/30'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isBambiMode ? 'bg-rose-200' : 'bg-rose-800'
            }`}>
              <Heart className={`w-6 h-6 ${
                isBambiMode ? 'text-rose-600 fill-rose-400' : 'text-rose-400 fill-rose-600'
              }`} />
            </div>
            <div>
              <p className={`font-semibold ${
                isBambiMode ? 'text-rose-800' : 'text-rose-300'
              }`}>
                Gina Integration
              </p>
              <p className={`text-sm ${
                isBambiMode ? 'text-rose-600' : 'text-rose-400'
              }`}>
                Level {progress.currentLevel} - {currentLevelConfig.label}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${
              isBambiMode ? 'text-rose-700' : 'text-rose-300'
            }`}>
              {totalSessions}
            </p>
            <p className={`text-xs ${
              isBambiMode ? 'text-rose-500' : 'text-rose-400'
            }`}>
              sessions
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl overflow-hidden ${
      isBambiMode
        ? 'bg-white border border-rose-200 shadow-lg'
        : 'bg-protocol-surface border border-protocol-border'
    }`}>
      {/* Header */}
      <div className={`p-4 ${
        isBambiMode
          ? 'bg-gradient-to-r from-rose-500 to-pink-500'
          : 'bg-gradient-to-r from-rose-600 to-pink-600'
      }`}>
        <div className="flex items-center gap-3">
          <Heart className="w-6 h-6 text-white fill-white/50" />
          <h2 className="text-lg font-bold text-white">Gina Integration</h2>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Current Level */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${
              isBambiMode ? 'text-rose-700' : 'text-rose-400'
            }`}>
              Current Level
            </span>
            <span className={`text-lg font-bold ${
              isBambiMode ? 'text-rose-800' : 'text-rose-300'
            }`}>
              {progress.currentLevel}
            </span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${
            isBambiMode ? 'bg-rose-100' : 'bg-rose-900/30'
          }`}>
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full transition-all duration-500"
              style={{ width: `${(progress.currentLevel / 5) * 100}%` }}
            />
          </div>
          <p className={`text-xs ${
            isBambiMode ? 'text-rose-600' : 'text-rose-400'
          }`}>
            {currentLevelConfig.label}: {currentLevelConfig.description}
          </p>
        </div>

        {/* Category Levels */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'gina_feminizing', level: progress.levelGinaFeminizing },
            { key: 'shared', level: progress.levelSharedActivities },
            { key: 'intimacy', level: progress.levelIntimacy },
            { key: 'support', level: progress.levelSupport },
          ].map(({ key, level }) => {
            const config = WEEKEND_CATEGORY_CONFIG[key as keyof typeof WEEKEND_CATEGORY_CONFIG];
            return (
              <div
                key={key}
                className={`p-3 rounded-lg ${
                  isBambiMode ? 'bg-gray-50' : 'bg-protocol-bg'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{config.emoji}</span>
                  <span className={`text-xs font-medium truncate ${
                    isBambiMode ? 'text-gray-700' : 'text-protocol-text-muted'
                  }`}>
                    {config.label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div
                      key={i}
                      className={`w-4 h-1 rounded-full ${
                        i <= level
                          ? ''
                          : isBambiMode ? 'bg-gray-200' : 'bg-gray-700'
                      }`}
                      style={i <= level ? { backgroundColor: config.color } : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats Row */}
        <div className={`grid grid-cols-3 gap-3 p-3 rounded-lg ${
          isBambiMode ? 'bg-rose-50' : 'bg-rose-900/20'
        }`}>
          <div className="text-center">
            <p className={`text-xl font-bold ${
              isBambiMode ? 'text-rose-700' : 'text-rose-300'
            }`}>
              {totalSessions}
            </p>
            <p className={`text-xs ${
              isBambiMode ? 'text-rose-500' : 'text-rose-400'
            }`}>
              Total Sessions
            </p>
          </div>
          <div className="text-center">
            <p className={`text-xl font-bold ${
              isBambiMode ? 'text-rose-700' : 'text-rose-300'
            }`}>
              {progress.ginaInitiatedCount}
            </p>
            <p className={`text-xs ${
              isBambiMode ? 'text-rose-500' : 'text-rose-400'
            }`}>
              She Initiated
            </p>
          </div>
          <div className="text-center">
            <p className={`text-xl font-bold ${
              isBambiMode ? 'text-rose-700' : 'text-rose-300'
            }`}>
              {progress.ginaAvgEngagement.toFixed(1)}
            </p>
            <p className={`text-xs ${
              isBambiMode ? 'text-rose-500' : 'text-rose-400'
            }`}>
              Avg Engagement
            </p>
          </div>
        </div>

        {/* Recent Milestones */}
        {achievedMilestones.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className={`w-4 h-4 ${
                isBambiMode ? 'text-amber-500' : 'text-amber-400'
              }`} />
              <span className={`text-sm font-medium ${
                isBambiMode ? 'text-gray-700' : 'text-protocol-text'
              }`}>
                Milestones ({achievedMilestones.length})
              </span>
            </div>
            <div className="space-y-2">
              {achievedMilestones.slice(0, 3).map(milestone => (
                <div
                  key={milestone.key}
                  className={`flex items-center gap-2 p-2 rounded-lg ${
                    isBambiMode ? 'bg-amber-50' : 'bg-amber-900/20'
                  }`}
                >
                  <Check className={`w-4 h-4 ${
                    isBambiMode ? 'text-amber-600' : 'text-amber-400'
                  }`} />
                  <span className={`text-sm flex-1 ${
                    isBambiMode ? 'text-amber-800' : 'text-amber-300'
                  }`}>
                    {milestone.description}
                  </span>
                  <span className={`text-xs ${
                    isBambiMode ? 'text-amber-600' : 'text-amber-400'
                  }`}>
                    {new Date(milestone.date).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locked Activities Hint */}
        {progress.lockedActivities.length > 0 && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            isBambiMode ? 'bg-purple-50' : 'bg-purple-900/20'
          }`}>
            <Lock className={`w-4 h-4 ${
              isBambiMode ? 'text-purple-600' : 'text-purple-400'
            }`} />
            <span className={`text-sm ${
              isBambiMode ? 'text-purple-700' : 'text-purple-300'
            }`}>
              {progress.lockedActivities.length} activities permanently unlocked
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact card for menu/navigation display
 */
export function GinaIntegrationCard({ progress }: { progress: GinaProgress | null }) {
  const { isBambiMode } = useBambiMode();

  if (!progress) {
    return (
      <div className={`p-4 rounded-xl ${
        isBambiMode
          ? 'bg-gray-50 border border-gray-200'
          : 'bg-protocol-surface border border-protocol-border'
      }`}>
        <div className="flex items-center gap-3">
          <Heart className={`w-5 h-5 ${
            isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
          }`} />
          <span className={`text-sm ${
            isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
          }`}>
            Start weekend activities to track Gina integration
          </span>
        </div>
      </div>
    );
  }

  return <GinaIntegrationProgress progress={progress} compact />;
}
