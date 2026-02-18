/**
 * MilestoneTimeline
 *
 * Implements v2 Part 6.2: Milestone Markers
 * Displays transformation milestones in a visual timeline
 * Shows achieved milestones with evidence and celebration actions
 */

import { useState, useMemo } from 'react';
import {
  Trophy,
  Star,
  Award,
  Flag,
  Heart,
  Sparkles,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  PartyPopper,
  CheckCircle2,
  Circle,
  Clock,
} from 'lucide-react';
import { useMilestones, type Milestone } from '../../hooks/useRatchetSystem';

interface MilestoneTimelineProps {
  showPending?: boolean;
  maxItems?: number;
  compact?: boolean;
  className?: string;
}

// Milestone type configuration
const MILESTONE_CONFIG: Record<string, {
  label: string;
  icon: typeof Trophy;
  color: string;
  bgColor: string;
}> = {
  first_session: {
    label: 'First Session',
    icon: Star,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
  },
  first_week: {
    label: 'First Week',
    icon: Calendar,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  first_month: {
    label: 'First Month',
    icon: Calendar,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/20',
  },
  first_investment: {
    label: 'First Investment',
    icon: Heart,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
  },
  investment_100: {
    label: '$100 Invested',
    icon: Award,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
  investment_500: {
    label: '$500 Invested',
    icon: Trophy,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
  },
  investment_1000: {
    label: '$1000 Invested',
    icon: Trophy,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
  },
  edge_100: {
    label: '100 Edges',
    icon: Sparkles,
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
  },
  edge_500: {
    label: '500 Edges',
    icon: Sparkles,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
  },
  edge_1000: {
    label: '1000 Edges',
    icon: Sparkles,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/20',
  },
  denial_7: {
    label: '7 Day Denial',
    icon: Flag,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
  },
  denial_14: {
    label: '14 Day Denial',
    icon: Flag,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/20',
  },
  denial_30: {
    label: '30 Day Denial',
    icon: Trophy,
    color: 'text-fuchsia-400',
    bgColor: 'bg-fuchsia-500/20',
  },
  first_photo: {
    label: 'First Photo',
    icon: Camera,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
  },
  commitment_honored: {
    label: 'Commitment Honored',
    icon: CheckCircle2,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
  voice_breakthrough: {
    label: 'Voice Breakthrough',
    icon: Star,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/20',
  },
  public_outing: {
    label: 'First Public Outing',
    icon: Award,
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/20',
  },
  ponr_crossed: {
    label: 'Point of No Return',
    icon: Trophy,
    color: 'text-gradient-to-r from-pink-400 to-purple-400',
    bgColor: 'bg-gradient-to-r from-pink-500/20 to-purple-500/20',
  },
};

export function MilestoneTimeline({
  showPending = false,
  maxItems,
  compact = false,
  className = '',
}: MilestoneTimelineProps) {
  const {
    milestones,
    achievedMilestones,
    pendingMilestones,
    isLoading,
    celebrateMilestone,
  } = useMilestones();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'achieved' | 'pending'>('all');

  // Filter milestones
  const displayMilestones = useMemo(() => {
    let result: Milestone[];
    switch (filter) {
      case 'achieved':
        result = achievedMilestones;
        break;
      case 'pending':
        result = pendingMilestones;
        break;
      default:
        result = showPending ? milestones : achievedMilestones;
    }
    if (maxItems) {
      result = result.slice(0, maxItems);
    }
    return result;
  }, [filter, milestones, achievedMilestones, pendingMilestones, showPending, maxItems]);

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-10 h-10 bg-protocol-surface rounded-full" />
              <div className="flex-1 h-20 bg-protocol-surface rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`bg-protocol-surface border border-protocol-border rounded-xl p-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-protocol-text font-semibold">Milestones</p>
              <p className="text-protocol-text-muted text-xs">
                {achievedMilestones.length} achieved
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {achievedMilestones.slice(0, 3).map((m) => {
              const config = MILESTONE_CONFIG[m.milestoneType] || MILESTONE_CONFIG.first_session;
              const Icon = config.icon;
              return (
                <div
                  key={m.id}
                  className={`p-1.5 rounded-lg ${config.bgColor}`}
                  title={config.label}
                >
                  <Icon className={`w-4 h-4 ${config.color}`} />
                </div>
              );
            })}
            {achievedMilestones.length > 3 && (
              <span className="text-protocol-text-muted text-xs">
                +{achievedMilestones.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-protocol-text font-semibold">Milestone Timeline</h3>
          <p className="text-protocol-text-muted text-sm">
            {achievedMilestones.length} milestones achieved
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 rounded-lg">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-amber-400 font-semibold">{achievedMilestones.length}</span>
        </div>
      </div>

      {/* Filter tabs */}
      {showPending && (
        <div className="flex gap-2 mb-4">
          {(['all', 'achieved', 'pending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-protocol-accent text-white'
                  : 'bg-protocol-surface text-protocol-text-muted hover:text-protocol-text'
              }`}
            >
              {f === 'all' && 'All'}
              {f === 'achieved' && `Achieved (${achievedMilestones.length})`}
              {f === 'pending' && `Upcoming (${pendingMilestones.length})`}
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      {displayMilestones.length === 0 ? (
        <div className="text-center py-8">
          <Trophy className="w-12 h-12 text-protocol-text-muted mx-auto mb-3" />
          <p className="text-protocol-text-muted">
            {filter === 'achieved' && 'No milestones achieved yet'}
            {filter === 'pending' && 'No upcoming milestones'}
            {filter === 'all' && 'No milestones yet'}
          </p>
          <p className="text-protocol-text-muted text-sm mt-1">
            Keep making progress - your first milestone is just ahead
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-protocol-border" />

          {/* Milestone items */}
          <div className="space-y-4">
            {displayMilestones.map((milestone) => (
              <MilestoneCard
                key={milestone.id}
                milestone={milestone}
                expanded={expandedId === milestone.id}
                onToggle={() => setExpandedId(expandedId === milestone.id ? null : milestone.id)}
                onCelebrate={() => celebrateMilestone(milestone.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Motivation message */}
      {achievedMilestones.length > 0 && (
        <div className="mt-6 p-4 bg-gradient-to-r from-amber-900/20 to-orange-900/20 rounded-xl border border-amber-500/20">
          <div className="flex items-start gap-3">
            <PartyPopper className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 text-sm font-medium">
                {achievedMilestones.length} Milestones Achieved
              </p>
              <p className="text-amber-300/70 text-xs mt-1">
                Each milestone marks a point you can never truly go back from.
                The evidence is undeniable - you've changed.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Milestone card component
function MilestoneCard({
  milestone,
  expanded,
  onToggle,
  onCelebrate,
}: {
  milestone: Milestone;
  expanded: boolean;
  onToggle: () => void;
  onCelebrate: () => void;
}) {
  const config = MILESTONE_CONFIG[milestone.milestoneType] || {
    label: milestone.milestoneType,
    icon: Trophy,
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
  };
  const Icon = config.icon;
  const isAchieved = milestone.achievedAt !== null;
  const achievedDate = milestone.achievedAt ? new Date(milestone.achievedAt) : null;

  return (
    <div className="relative pl-12">
      {/* Timeline dot */}
      <div
        className={`absolute left-3 w-5 h-5 rounded-full border-2 ${
          isAchieved
            ? `${config.bgColor} border-current ${config.color}`
            : 'bg-protocol-surface border-protocol-border'
        } flex items-center justify-center`}
      >
        {isAchieved ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : (
          <Circle className="w-3 h-3 text-protocol-text-muted" />
        )}
      </div>

      {/* Card */}
      <div
        className={`bg-protocol-surface border rounded-xl overflow-hidden transition-colors ${
          isAchieved ? 'border-protocol-border' : 'border-dashed border-protocol-border opacity-60'
        }`}
      >
        <button
          onClick={onToggle}
          className="w-full p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.bgColor}`}>
              <Icon className={`w-5 h-5 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-protocol-text font-medium">{config.label}</h4>
                {!milestone.celebrated && isAchieved && (
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                    New!
                  </span>
                )}
              </div>
              {milestone.description && (
                <p className="text-protocol-text-muted text-sm truncate">
                  {milestone.description}
                </p>
              )}
              {isAchieved && achievedDate && (
                <p className="text-protocol-text-muted text-xs mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {achievedDate.toLocaleDateString()}
                </p>
              )}
              {!isAchieved && (
                <p className="text-protocol-text-muted text-xs mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Not yet achieved
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              {expanded ? (
                <ChevronUp className="w-5 h-5 text-protocol-text-muted" />
              ) : (
                <ChevronDown className="w-5 h-5 text-protocol-text-muted" />
              )}
            </div>
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            {/* Message */}
            {milestone.message && (
              <div className="p-3 bg-protocol-bg rounded-lg">
                <p className="text-protocol-text text-sm italic">
                  "{milestone.message}"
                </p>
              </div>
            )}

            {/* Description if longer */}
            {milestone.description && milestone.description.length > 50 && (
              <p className="text-protocol-text-muted text-sm">
                {milestone.description}
              </p>
            )}

            {/* Achievement date */}
            {isAchieved && achievedDate && (
              <div className="flex items-center gap-2 text-sm text-protocol-text-muted">
                <Calendar className="w-4 h-4" />
                <span>
                  Achieved on {achievedDate.toLocaleDateString()} at {achievedDate.toLocaleTimeString()}
                </span>
              </div>
            )}

            {/* Evidence link */}
            {milestone.evidenceId && (
              <div className="flex items-center gap-2 text-sm text-protocol-text-muted">
                <Camera className="w-4 h-4" />
                <span>Evidence attached</span>
              </div>
            )}

            {/* Celebrate button (for uncelebrated milestones) */}
            {isAchieved && !milestone.celebrated && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCelebrate();
                }}
                className="w-full py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white
                         rounded-lg text-sm font-medium flex items-center justify-center gap-2
                         hover:from-amber-600 hover:to-orange-600 transition-colors"
              >
                <PartyPopper className="w-4 h-4" />
                Celebrate This Milestone
              </button>
            )}

            {/* Already celebrated */}
            {isAchieved && milestone.celebrated && (
              <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Celebrated</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MilestoneTimeline;
