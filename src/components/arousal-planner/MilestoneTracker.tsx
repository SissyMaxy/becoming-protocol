/**
 * Milestone Tracker
 * Shows progress toward daily milestones
 */

import { Check, Lock, Flame, Calendar, Star, Trophy } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { ChastityMilestone, MilestoneType } from '../../types/arousal-planner';

interface MilestoneTrackerProps {
  milestones: ChastityMilestone[];
  onAchieve?: (milestoneId: string) => void;
}

export function MilestoneTracker({ milestones, onAchieve }: MilestoneTrackerProps) {
  const { isBambiMode } = useBambiMode();

  if (milestones.length === 0) return null;

  const achieved = milestones.filter(m => m.status === 'achieved');
  const pending = milestones.filter(m => m.status !== 'achieved' && m.status !== 'failed');
  const failed = milestones.filter(m => m.status === 'failed');

  // Milestone type icons
  const typeIcons: Record<MilestoneType, React.ReactNode> = {
    stay_locked: <Lock className="w-4 h-4" />,
    edge_count: <Flame className="w-4 h-4" />,
    maintain_state: <Star className="w-4 h-4" />,
    duration: <Calendar className="w-4 h-4" />,
    denial_day: <Calendar className="w-4 h-4" />,
    special: <Trophy className="w-4 h-4" />,
  };

  return (
    <div className={`rounded-xl p-4 ${
      isBambiMode ? 'bg-white shadow-sm' : 'bg-protocol-surface'
    }`}>
      <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${
        isBambiMode ? 'text-gray-700' : 'text-protocol-text'
      }`}>
        <Trophy className={`w-4 h-4 ${isBambiMode ? 'text-amber-500' : 'text-amber-400'}`} />
        Today's Milestones
        <span className={`text-xs font-normal ${
          isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
        }`}>
          ({achieved.length}/{milestones.length})
        </span>
      </h3>

      <div className="space-y-2">
        {/* Pending milestones */}
        {pending.map((milestone) => (
          <MilestoneItem
            key={milestone.id}
            milestone={milestone}
            icon={typeIcons[milestone.milestoneType]}
            onAchieve={onAchieve}
          />
        ))}

        {/* Achieved milestones */}
        {achieved.map((milestone) => (
          <MilestoneItem
            key={milestone.id}
            milestone={milestone}
            icon={typeIcons[milestone.milestoneType]}
          />
        ))}

        {/* Failed milestones */}
        {failed.map((milestone) => (
          <MilestoneItem
            key={milestone.id}
            milestone={milestone}
            icon={typeIcons[milestone.milestoneType]}
          />
        ))}
      </div>
    </div>
  );
}

interface MilestoneItemProps {
  milestone: ChastityMilestone;
  icon: React.ReactNode;
  onAchieve?: (milestoneId: string) => void;
}

function MilestoneItem({ milestone, icon, onAchieve }: MilestoneItemProps) {
  const { isBambiMode } = useBambiMode();

  const isAchieved = milestone.status === 'achieved';
  const isFailed = milestone.status === 'failed';
  const hasProgress = milestone.targetValue && milestone.targetValue > 0;
  const progress = hasProgress
    ? Math.min((milestone.currentValue / milestone.targetValue!) * 100, 100)
    : 0;

  // Can manually achieve if it's a stay_locked type and not yet achieved
  const canManuallyAchieve =
    milestone.milestoneType === 'stay_locked' &&
    !isAchieved &&
    !isFailed &&
    onAchieve;

  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
        isAchieved
          ? isBambiMode
            ? 'bg-green-50'
            : 'bg-green-900/20'
          : isFailed
            ? isBambiMode
              ? 'bg-red-50 opacity-60'
              : 'bg-red-900/20 opacity-60'
            : isBambiMode
              ? 'bg-gray-50 hover:bg-gray-100'
              : 'bg-gray-800/50 hover:bg-gray-800'
      }`}
    >
      {/* Icon */}
      <div className={`p-1.5 rounded ${
        isAchieved
          ? isBambiMode ? 'bg-green-100 text-green-600' : 'bg-green-900/30 text-green-400'
          : isFailed
            ? isBambiMode ? 'bg-red-100 text-red-500' : 'bg-red-900/30 text-red-400'
            : isBambiMode ? 'bg-amber-100 text-amber-600' : 'bg-amber-900/30 text-amber-400'
      }`}>
        {isAchieved ? <Check className="w-4 h-4" /> : icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium text-sm truncate ${
            isAchieved
              ? isBambiMode ? 'text-green-700' : 'text-green-400'
              : isFailed
                ? isBambiMode ? 'text-red-600' : 'text-red-400'
                : isBambiMode ? 'text-gray-700' : 'text-protocol-text'
          }`}>
            {milestone.title}
          </span>
          <span className={`text-xs ${
            isBambiMode ? 'text-amber-600' : 'text-amber-400'
          }`}>
            +{milestone.pointsValue}
          </span>
        </div>

        {/* Progress bar for edge_count type */}
        {hasProgress && !isAchieved && !isFailed && (
          <div className="mt-1">
            <div className={`h-1.5 rounded-full overflow-hidden ${
              isBambiMode ? 'bg-gray-200' : 'bg-gray-700'
            }`}>
              <div
                className={`h-full rounded-full ${
                  isBambiMode ? 'bg-amber-400' : 'bg-amber-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className={`text-xs mt-0.5 ${
              isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
            }`}>
              {milestone.currentValue}/{milestone.targetValue}
            </p>
          </div>
        )}

        {milestone.description && !hasProgress && (
          <p className={`text-xs truncate ${
            isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
          }`}>
            {milestone.description}
          </p>
        )}
      </div>

      {/* Manual achieve button */}
      {canManuallyAchieve && (
        <button
          onClick={() => onAchieve(milestone.id)}
          className={`text-xs px-2 py-1 rounded font-medium ${
            isBambiMode
              ? 'bg-green-100 text-green-600 hover:bg-green-200'
              : 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
          }`}
        >
          Achieved
        </button>
      )}
    </div>
  );
}
