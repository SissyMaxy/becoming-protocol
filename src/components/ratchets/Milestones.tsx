/**
 * Point of No Return Milestones
 *
 * Visual timeline of irreversible firsts.
 * "There is no going back to before Day 1. That person is gone."
 */

import { useState, useEffect } from 'react';
import { Check, Circle, Milestone as MilestoneIcon } from 'lucide-react';
import {
  FirstMilestone,
  MILESTONE_LABELS,
} from '../../types/ratchets';
import { getFirstMilestones } from '../../lib/ratchets';
import { supabase } from '../../lib/supabase';

interface MilestoneTimelineProps {
  userId?: string;
  currentDay: number;
}

export function MilestoneTimeline({ userId, currentDay }: MilestoneTimelineProps) {
  const [milestones, setMilestones] = useState<FirstMilestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMilestones();
  }, [userId]);

  const loadMilestones = async () => {
    try {
      let uid = userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
      }
      if (!uid) return;

      const data = await getFirstMilestones(uid);
      setMilestones(data);
    } catch (error) {
      console.error('Error loading milestones:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Future milestones to show as upcoming
  const futureMilestones = [
    { day: 30, label: 'Phase 2 begins' },
    { day: 60, label: 'Deep integration' },
    { day: 90, label: 'Embodiment' },
  ].filter(m => m.day > currentDay);

  if (isLoading) {
    return (
      <div className="card p-4 text-center">
        <p className="text-protocol-text-muted">Loading milestones...</p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="font-medium text-protocol-text mb-4 flex items-center gap-2">
        <MilestoneIcon className="w-4 h-4 text-protocol-accent" />
        Your Journey
      </h3>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-protocol-border" />

        <div className="space-y-4">
          {/* Achieved milestones */}
          {milestones.map((milestone, _index) => (
            <div key={milestone.id} className="flex items-start gap-3 relative">
              <div className="w-6 h-6 rounded-full bg-protocol-success flex items-center justify-center z-10">
                <Check className="w-3 h-3 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-protocol-text">
                  {MILESTONE_LABELS[milestone.milestoneType] || milestone.milestoneType}
                </p>
                <p className="text-xs text-protocol-text-muted">
                  {new Date(milestone.achievedAt).toLocaleDateString()}
                  {milestone.context?.streak && ` · Day ${milestone.context.streak}`}
                </p>
              </div>
            </div>
          ))}

          {/* Current position */}
          <div className="flex items-start gap-3 relative">
            <div className="w-6 h-6 rounded-full bg-protocol-accent flex items-center justify-center z-10 animate-pulse">
              <Circle className="w-3 h-3 text-white fill-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-protocol-accent">
                Day {currentDay}
              </p>
              <p className="text-xs text-protocol-text-muted">
                YOU ARE HERE
              </p>
            </div>
          </div>

          {/* Future milestones */}
          {futureMilestones.map((milestone, _index) => (
            <div key={milestone.day} className="flex items-start gap-3 relative opacity-50">
              <div className="w-6 h-6 rounded-full border-2 border-protocol-border bg-protocol-bg z-10">
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-protocol-text-muted">
                  Day {milestone.day}
                </p>
                <p className="text-xs text-protocol-text-muted">
                  {milestone.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Point of no return message */}
      {milestones.length > 0 && (
        <div className="mt-6 pt-4 border-t border-protocol-border">
          <p className="text-xs text-protocol-text-muted text-center italic">
            There is no going back to before Day 1.
            <br />
            That person is gone.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Compact milestone count badge
 */
interface MilestoneBadgeProps {
  count: number;
  onClick?: () => void;
}

export function MilestoneBadge({ count, onClick }: MilestoneBadgeProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-protocol-accent/20 hover:bg-protocol-accent/30 transition-colors"
    >
      <MilestoneIcon className="w-4 h-4 text-protocol-accent" />
      <span className="text-sm font-medium text-protocol-text">
        {count} milestone{count !== 1 ? 's' : ''}
      </span>
    </button>
  );
}

/**
 * Single milestone celebration modal
 */
interface MilestoneCelebrationProps {
  milestone: FirstMilestone;
  onDismiss: () => void;
}

export function MilestoneCelebration({ milestone, onDismiss }: MilestoneCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
      onClick={handleDismiss}
    >
      <div
        className={`max-w-sm w-full transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="card p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-protocol-accent/20 flex items-center justify-center animate-scale-in">
            <MilestoneIcon className="w-8 h-8 text-protocol-accent" />
          </div>

          <h2 className="text-xl font-bold text-protocol-text mb-2">
            First Time
          </h2>

          <p className="text-lg text-protocol-accent font-medium mb-4">
            {MILESTONE_LABELS[milestone.milestoneType]}
          </p>

          <p className="text-sm text-protocol-text-muted mb-6">
            You can't undo this.
            <br />
            This moment is now part of your story.
          </p>

          <button
            onClick={handleDismiss}
            className="w-full py-3 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
