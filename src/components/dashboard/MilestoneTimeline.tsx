/**
 * Milestone Timeline
 *
 * Chronological list of achievements and milestones.
 */

import { Trophy, Star, TrendingUp, CheckCircle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { MilestoneEntry } from '../../lib/dashboard-analytics';

interface MilestoneTimelineProps {
  milestones: MilestoneEntry[];
  compact?: boolean;
}

const TYPE_CONFIG: Record<string, { icon: typeof Trophy; color: string }> = {
  streak: { icon: Star, color: '#f59e0b' },
  level_up: { icon: TrendingUp, color: '#22c55e' },
  gina_rung_advancement: { icon: TrendingUp, color: '#a855f7' },
  commitment_honored: { icon: CheckCircle, color: '#3b82f6' },
  default: { icon: Trophy, color: '#ec4899' },
};

function getTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export function MilestoneTimeline({ milestones, compact = false }: MilestoneTimelineProps) {
  const { isBambiMode } = useBambiMode();
  const displayItems = compact ? milestones.slice(0, 5) : milestones;

  return (
    <div className={`rounded-lg p-4 ${
      isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <h3 className={`text-sm font-medium mb-3 ${
        isBambiMode ? 'text-pink-800' : 'text-protocol-text'
      }`}>
        <Trophy className={`w-4 h-4 inline mr-1 ${isBambiMode ? 'text-pink-500' : 'text-yellow-500'}`} />
        Milestones ({milestones.length})
      </h3>

      {displayItems.length === 0 ? (
        <p className={`text-sm text-center py-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
          No milestones achieved yet
        </p>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className={`absolute left-4 top-0 bottom-0 w-px ${
            isBambiMode ? 'bg-pink-200' : 'bg-white/10'
          }`} />

          <div className="space-y-3">
            {displayItems.map((milestone) => {
              const config = TYPE_CONFIG[milestone.milestoneType] || TYPE_CONFIG.default;
              const Icon = config.icon;

              return (
                <div key={milestone.id} className="flex items-start gap-3 relative">
                  {/* Timeline dot */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${isBambiMode ? 'text-pink-800' : 'text-gray-200'}`}>
                      {milestone.description || milestone.milestoneType.replace(/_/g, ' ')}
                    </p>
                    <p className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                      {getTimeAgo(milestone.achievedAt)}
                      {' · '}
                      {milestone.achievedAt.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
