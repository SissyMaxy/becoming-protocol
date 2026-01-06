/**
 * Gina Framing Modal
 *
 * Shows the exact words to say to Gina when introducing an activity.
 * Includes tips, alternatives, and the feminization benefit (for user only).
 */

import { X, MessageCircle, Lightbulb, Heart, ArrowRight } from 'lucide-react';
import type { WeekendActivity, PlannedActivity } from '../../types/weekend';
import { WEEKEND_CATEGORY_CONFIG, INTEGRATION_LEVEL_LABELS } from '../../types/weekend';

interface GinaFramingModalProps {
  activity: WeekendActivity;
  plannedActivity?: PlannedActivity;
  alternativeActivity?: WeekendActivity;
  onClose: () => void;
  onStartActivity: () => void;
}

export function GinaFramingModal({
  activity,
  plannedActivity,
  alternativeActivity,
  onClose,
  onStartActivity
}: GinaFramingModalProps) {
  const categoryConfig = WEEKEND_CATEGORY_CONFIG[activity.category];
  const levelConfig = INTEGRATION_LEVEL_LABELS[activity.integrationLevel];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-protocol-bg border border-protocol-accent/20 rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div
          className="p-4 border-b border-protocol-accent/10"
          style={{ backgroundColor: `${categoryConfig.color}15` }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{categoryConfig.emoji}</span>
              <div>
                <h2 className="text-lg font-semibold text-protocol-text">
                  {activity.name}
                </h2>
                <p className="text-xs text-protocol-text-muted">
                  {levelConfig.label} - Level {activity.integrationLevel}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-protocol-surface-light transition-colors"
            >
              <X className="w-5 h-5 text-protocol-text-muted" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* What to Say */}
          <div className="bg-protocol-surface rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="w-5 h-5 text-protocol-accent" />
              <h3 className="font-medium text-protocol-text">What to Say</h3>
            </div>
            <div className="bg-protocol-bg rounded-lg p-4 border-l-4 border-protocol-accent">
              <p className="text-protocol-text italic text-lg leading-relaxed">
                "{activity.ginaFraming}"
              </p>
            </div>
          </div>

          {/* Alternative Option */}
          {alternativeActivity && plannedActivity?.presentAsOption && (
            <div className="bg-protocol-surface rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRight className="w-5 h-5 text-amber-400" />
                <h3 className="font-medium text-protocol-text">Or Try This Instead</h3>
              </div>
              <div className="bg-protocol-bg rounded-lg p-3">
                <p className="text-protocol-text-muted text-sm mb-2">
                  If she's not in the mood, offer:
                </p>
                <p className="text-protocol-text italic">
                  "{alternativeActivity.ginaFraming}"
                </p>
                <p className="text-xs text-protocol-text-muted mt-2">
                  ({alternativeActivity.name})
                </p>
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-protocol-surface rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-5 h-5 text-amber-400" />
              <h3 className="font-medium text-protocol-text">Tips for Success</h3>
            </div>
            <ul className="space-y-2 text-sm text-protocol-text-muted">
              <li className="flex items-start gap-2">
                <span className="text-protocol-accent mt-1">•</span>
                <span>Choose a relaxed moment - not when she's stressed or busy</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-protocol-accent mt-1">•</span>
                <span>Be casual and confident - this is just something you want to try together</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-protocol-accent mt-1">•</span>
                <span>If she declines, accept gracefully - there's always next time</span>
              </li>
              {activity.requiresSupplies && activity.suppliesNeeded && (
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-1">•</span>
                  <span>Make sure you have: {activity.suppliesNeeded.join(', ')}</span>
                </li>
              )}
            </ul>
          </div>

          {/* What She Gets */}
          {activity.ginaBenefit && (
            <div className="bg-protocol-surface rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-5 h-5 text-pink-400" />
                <h3 className="font-medium text-protocol-text">What She Gets</h3>
              </div>
              <p className="text-sm text-protocol-text-muted">
                {activity.ginaBenefit}
              </p>
            </div>
          )}

          {/* Your Benefit (private) */}
          <div className="bg-gradient-to-r from-protocol-accent/10 to-purple-500/10 rounded-xl p-4 border border-protocol-accent/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">🔒</span>
              <h3 className="font-medium text-protocol-text text-sm">
                Your Feminization Benefit
              </h3>
            </div>
            <p className="text-sm text-protocol-text-muted">
              {activity.feminizationBenefit}
            </p>
            {activity.photoOpportunity && (
              <p className="text-xs text-protocol-accent mt-2">
                📸 Photo opportunity - capture evidence!
              </p>
            )}
          </div>

          {/* Duration */}
          <div className="flex items-center justify-between text-sm text-protocol-text-muted px-1">
            <span>Duration: ~{activity.durationMinutes} minutes</span>
            <span>Best time: {activity.bestTime}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-protocol-accent/10 bg-protocol-surface">
          <button
            onClick={onStartActivity}
            className="w-full py-3 rounded-xl font-medium text-white transition-all"
            style={{ backgroundColor: categoryConfig.color }}
          >
            Start Activity
          </button>
        </div>
      </div>
    </div>
  );
}
