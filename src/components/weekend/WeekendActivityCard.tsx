/**
 * Weekend Activity Card
 *
 * Card for weekend activities with Gina framing button and category-specific styling.
 */

import { useState } from 'react';
import { Check, X, Loader2, Clock, ChevronDown, ChevronUp, Heart, MessageCircle, Camera } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { WeekendActivity, PlannedActivity } from '../../types/weekend';
import { WEEKEND_CATEGORY_CONFIG, INTEGRATION_LEVEL_LABELS } from '../../types/weekend';

interface WeekendActivityCardProps {
  activity: WeekendActivity;
  plannedActivity: PlannedActivity;
  onComplete: () => void;
  onSkip: () => void;
  onShowFraming: () => void;
  isCompleting: boolean;
  isSkipping: boolean;
  isFirst?: boolean;
}

export function WeekendActivityCard({
  activity,
  plannedActivity,
  onComplete,
  onSkip,
  onShowFraming,
  isCompleting,
  isSkipping,
  isFirst = false,
}: WeekendActivityCardProps) {
  const { isBambiMode } = useBambiMode();
  const [expanded, setExpanded] = useState(isFirst);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const categoryConfig = WEEKEND_CATEGORY_CONFIG[activity.category];
  const levelConfig = INTEGRATION_LEVEL_LABELS[activity.integrationLevel];

  const isCompleted = plannedActivity.status === 'completed';
  const isSkipped = plannedActivity.status === 'skipped';
  const isPending = plannedActivity.status === 'pending';

  const handleSkip = () => {
    if (showSkipConfirm) {
      onSkip();
      setShowSkipConfirm(false);
    } else {
      setShowSkipConfirm(true);
    }
  };

  if (isCompleted) {
    return (
      <div className="rounded-xl p-4 bg-rose-50 border border-rose-200 dark:bg-rose-900/20 dark:border-rose-600/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-rose-200 dark:bg-rose-800">
            <Check className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium line-through opacity-60 text-rose-800 dark:text-rose-200">
              {activity.name}
            </p>
            <p className="text-xs mt-0.5 text-rose-500 dark:text-rose-400">
              Completed with Gina
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isSkipped) {
    return (
      <div className="rounded-xl p-4 opacity-50 bg-gray-50 border border-gray-200 dark:bg-gray-800/30 dark:border-gray-600/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <X className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium line-through text-gray-400">
              {activity.name}
            </p>
            <p className="text-xs mt-0.5 text-gray-400">
              Skipped
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${
      isBambiMode
        ? 'bg-white border-2 border-rose-200 shadow-lg shadow-rose-100'
        : 'bg-protocol-surface border border-protocol-border'
    } ${isFirst ? 'ring-2 ring-offset-2 ' + (isBambiMode ? 'ring-rose-400 ring-offset-pink-50' : 'ring-rose-500 ring-offset-protocol-bg') : ''}`}>

      {/* Skip confirmation overlay */}
      {showSkipConfirm && (
        <div className={`absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm ${
          isBambiMode ? 'bg-white/90' : 'bg-protocol-bg/90'
        }`}>
          <div className="text-center px-6">
            <p className={`font-semibold mb-2 ${
              isBambiMode ? 'text-rose-700' : 'text-protocol-text'
            }`}>
              Skip this activity?
            </p>
            <p className={`text-sm mb-4 ${
              isBambiMode ? 'text-rose-500' : 'text-protocol-text-muted'
            }`}>
              You can try again next weekend
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowSkipConfirm(false)}
                className="px-5 py-2 rounded-xl font-medium text-white"
                style={{ backgroundColor: categoryConfig.color }}
              >
                I'll try it
              </button>
              <button
                onClick={handleSkip}
                disabled={isSkipping}
                className={`px-5 py-2 rounded-xl ${
                  isBambiMode
                    ? 'bg-gray-200 text-gray-600'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {isSkipping ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Skip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with category color */}
      <div
        className="p-4"
        style={{ backgroundColor: `${categoryConfig.color}20` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{categoryConfig.emoji}</span>
            <div>
              <span
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: categoryConfig.color }}
              >
                {categoryConfig.label}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs ${
                  isBambiMode ? 'text-rose-600' : 'text-protocol-text-muted'
                }`}>
                  Level {activity.integrationLevel} - {levelConfig.label}
                </span>
                {activity.durationMinutes && (
                  <>
                    <span className="text-gray-400">•</span>
                    <span className={`text-xs flex items-center gap-1 ${
                      isBambiMode ? 'text-rose-600' : 'text-protocol-text-muted'
                    }`}>
                      <Clock className="w-3 h-3" />
                      {activity.durationMinutes}m
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-full transition-colors"
            style={{ backgroundColor: `${categoryConfig.color}30` }}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" style={{ color: categoryConfig.color }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: categoryConfig.color }} />
            )}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="p-4">
        {/* Activity name */}
        <p className={`text-lg font-semibold leading-snug ${
          isBambiMode ? 'text-gray-800' : 'text-protocol-text'
        }`}>
          {activity.name}
        </p>

        {/* Feminization benefit hint */}
        <p className={`text-sm mt-2 italic ${
          isBambiMode ? 'text-rose-500' : 'text-protocol-text-muted'
        }`}>
          {activity.feminizationBenefit}
        </p>

        {/* Badges row */}
        <div className="flex flex-wrap gap-2 mt-3">
          {activity.photoOpportunity && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              isBambiMode
                ? 'bg-amber-100 text-amber-700'
                : 'bg-amber-900/30 text-amber-400'
            }`}>
              <Camera className="w-3 h-3" />
              Photo opportunity
            </span>
          )}
          {activity.ginaBenefit && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              isBambiMode
                ? 'bg-pink-100 text-pink-700'
                : 'bg-pink-900/30 text-pink-400'
            }`}>
              <Heart className="w-3 h-3" />
              She'll enjoy this
            </span>
          )}
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className={`mt-4 pt-4 border-t space-y-3 ${
            isBambiMode ? 'border-rose-100' : 'border-protocol-border'
          }`}>
            {/* Description */}
            <p className={`text-sm ${
              isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
            }`}>
              {activity.description}
            </p>

            {/* Best time */}
            <div className="flex items-center gap-2 text-xs">
              <Clock className={`w-3 h-3 ${
                isBambiMode ? 'text-rose-400' : 'text-protocol-text-muted'
              }`} />
              <span className={isBambiMode ? 'text-rose-600' : 'text-protocol-text-muted'}>
                Best time: {activity.bestTime}
              </span>
            </div>

            {/* Gina's benefit if available */}
            {activity.ginaBenefit && (
              <div className={`p-3 rounded-lg ${
                isBambiMode ? 'bg-pink-50' : 'bg-pink-900/20'
              }`}>
                <p className={`text-xs font-medium mb-1 ${
                  isBambiMode ? 'text-pink-700' : 'text-pink-400'
                }`}>
                  What Gina gets:
                </p>
                <p className={`text-sm ${
                  isBambiMode ? 'text-pink-600' : 'text-pink-300'
                }`}>
                  {activity.ginaBenefit}
                </p>
              </div>
            )}

            {/* Supplies needed */}
            {activity.requiresSupplies && activity.suppliesNeeded && (
              <div className={`p-3 rounded-lg ${
                isBambiMode ? 'bg-amber-50' : 'bg-amber-900/20'
              }`}>
                <p className={`text-xs font-medium ${
                  isBambiMode ? 'text-amber-700' : 'text-amber-400'
                }`}>
                  Supplies needed: {activity.suppliesNeeded.join(', ')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {isPending && (
          <div className="mt-4 space-y-3">
            {/* Show Gina Framing button */}
            <button
              onClick={onShowFraming}
              className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
                isBambiMode
                  ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                  : 'bg-rose-900/30 text-rose-400 hover:bg-rose-900/50'
              }`}
            >
              <MessageCircle className="w-5 h-5" />
              <span>What to Say to Gina</span>
            </button>

            {/* Complete and Skip row */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSkip}
                className={`p-2.5 rounded-xl transition-colors ${
                  isBambiMode
                    ? 'text-gray-400 hover:bg-rose-50 hover:text-rose-400'
                    : 'text-protocol-text-muted hover:bg-protocol-bg'
                }`}
              >
                <X className="w-5 h-5" />
              </button>

              <button
                onClick={onComplete}
                disabled={isCompleting}
                className="flex-1 py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] hover:opacity-90"
                style={{ backgroundColor: categoryConfig.color }}
              >
                {isCompleting ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Check className="w-5 h-5" />
                    <span>Mark Complete</span>
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
