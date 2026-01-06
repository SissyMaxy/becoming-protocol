/**
 * Task Card New
 * Redesigned task card with better visual hierarchy and persuasive framing
 */

import { useState } from 'react';
import { Check, X, Loader2, Clock, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { DailyTask } from '../../types/task-bank';
import { CATEGORY_EMOJI, INTENSITY_CONFIG, CATEGORY_CONFIG } from '../../types/task-bank';

// Helper to navigate to wishlist
function navigateToWishlist() {
  window.dispatchEvent(new CustomEvent('navigate-to-wishlist'));
}

interface TaskCardNewProps {
  task: DailyTask;
  onComplete: (feltGood?: boolean) => void;
  onIncrement?: () => void;
  onSkip: () => void;
  onUndo?: () => void;
  isCompleting: boolean;
  isSkipping: boolean;
  isUndoing?: boolean;
  isFirst?: boolean;
}

// Persuasive subtexts based on category
const CATEGORY_SUBTEXTS: Record<string, string[]> = {
  wear: ["Feel it against your skin", "Let it remind you who you're becoming"],
  listen: ["Let the words sink in", "Open your mind to receive"],
  say: ["Hear yourself become her", "Your voice shapes your reality"],
  apply: ["Each stroke is transformation", "Make yourself beautiful"],
  watch: ["See what you're becoming", "Let it inspire your change"],
  edge: ["Use the energy", "Your desperation serves you"],
  lock: ["Security in surrender", "Trust the process"],
  practice: ["Repetition creates reality", "Every practice rewires you"],
  use: ["Tools of transformation", "Let them shape you"],
  remove: ["Shed what no longer serves", "Let go of him"],
  commit: ["Lock in your progress", "No going back"],
  expose: ["Vulnerability is strength", "Be seen as her"],
  serve: ["Service shapes submission", "Find joy in obedience"],
  surrender: ["Let go completely", "Trust is freedom"],
};

function getSubtext(category: string): string {
  const options = CATEGORY_SUBTEXTS[category] || ["Complete this task"];
  return options[Math.floor(Math.random() * options.length)];
}

// Intensity gradient colors
function getIntensityGradient(intensity: number, isBambiMode: boolean): string {
  if (isBambiMode) {
    switch (intensity) {
      case 1: return 'from-pink-400 to-pink-500';
      case 2: return 'from-pink-500 to-fuchsia-500';
      case 3: return 'from-fuchsia-500 to-purple-500';
      case 4: return 'from-purple-500 to-purple-600';
      case 5: return 'from-purple-600 to-red-500';
      default: return 'from-pink-400 to-pink-500';
    }
  }
  switch (intensity) {
    case 1: return 'from-emerald-500 to-teal-500';
    case 2: return 'from-teal-500 to-cyan-500';
    case 3: return 'from-amber-500 to-orange-500';
    case 4: return 'from-orange-500 to-red-500';
    case 5: return 'from-red-500 to-rose-600';
    default: return 'from-emerald-500 to-teal-500';
  }
}

export function TaskCardNew({
  task,
  onComplete,
  onIncrement,
  onSkip,
  onUndo,
  isCompleting,
  isSkipping,
  isUndoing = false,
  isFirst = false,
}: TaskCardNewProps) {
  const { isBambiMode } = useBambiMode();
  const [expanded, setExpanded] = useState(isFirst);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const { instruction, category, intensity, completionType, targetCount, durationMinutes, subtext } = task.task;
  const emoji = CATEGORY_EMOJI[category];
  const intensityConfig = INTENSITY_CONFIG[intensity];
  const categoryConfig = CATEGORY_CONFIG[category];

  const isCompleted = task.status === 'completed';
  const isSkipped = task.status === 'skipped';
  const isPending = task.status === 'pending';

  // Progress for count tasks
  const showProgress = completionType === 'count' && targetCount;
  const progressPercent = showProgress ? (task.progress / (targetCount || 1)) * 100 : 0;

  // Get persuasive subtext
  const persuasiveText = subtext || getSubtext(category);

  const handleComplete = () => {
    if (showProgress && task.progress < (targetCount || 0) - 1) {
      onIncrement?.();
    } else {
      onComplete(true);
    }
  };

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
      <div className={`rounded-xl p-4 ${
        isBambiMode
          ? 'bg-pink-50 border border-pink-200'
          : 'bg-emerald-900/20 border border-emerald-600/30'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isBambiMode ? 'bg-pink-200' : 'bg-emerald-800'
          }`}>
            <Check className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-600' : 'text-emerald-400'
            }`} />
          </div>
          <div className="flex-1">
            <p className={`font-medium line-through opacity-60 ${
              isBambiMode ? 'text-pink-800' : 'text-protocol-text'
            }`}>
              {instruction}
            </p>
            <p className={`text-xs mt-0.5 ${
              isBambiMode ? 'text-pink-500' : 'text-emerald-400'
            }`}>
              Completed ✓
            </p>
          </div>
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={isUndoing}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isBambiMode
                  ? 'text-pink-600 hover:bg-pink-100'
                  : 'text-emerald-400 hover:bg-emerald-900/30'
              }`}
            >
              {isUndoing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Undo'
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isSkipped) {
    return (
      <div className={`rounded-xl p-4 opacity-50 ${
        isBambiMode
          ? 'bg-gray-50 border border-gray-200'
          : 'bg-gray-800/30 border border-gray-600/30'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
            <X className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium line-through text-gray-400">
              {instruction}
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
        ? 'bg-white border-2 border-pink-200 shadow-lg shadow-pink-100'
        : 'bg-protocol-surface border border-protocol-border'
    } ${isFirst ? 'ring-2 ring-offset-2 ' + (isBambiMode ? 'ring-pink-400 ring-offset-pink-50' : 'ring-protocol-accent ring-offset-protocol-bg') : ''}`}>

      {/* Skip confirmation overlay */}
      {showSkipConfirm && (
        <div className={`absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm ${
          isBambiMode ? 'bg-white/90' : 'bg-protocol-bg/90'
        }`}>
          <div className="text-center px-6">
            <p className={`font-semibold mb-2 ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Skip this task?
            </p>
            <p className={`text-sm mb-4 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              -15 points • Returns tomorrow
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowSkipConfirm(false)}
                className={`px-5 py-2 rounded-xl font-medium ${
                  isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                }`}
              >
                I'll do it
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

      {/* Header with gradient */}
      <div className={`bg-gradient-to-r ${getIntensityGradient(intensity, isBambiMode)} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{emoji}</span>
            <div>
              <span className="text-white/90 text-xs font-medium uppercase tracking-wider">
                {categoryConfig?.label || category}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-white/80 text-xs">
                  {intensityConfig.label}
                </span>
                {durationMinutes && (
                  <>
                    <span className="text-white/50">•</span>
                    <span className="text-white/80 text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {durationMinutes}m
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-white" />
            ) : (
              <ChevronDown className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="p-4">
        {/* Instruction */}
        <p className={`text-lg font-semibold leading-snug ${
          isBambiMode ? 'text-gray-800' : 'text-protocol-text'
        }`}>
          {instruction}
        </p>

        {/* Persuasive subtext */}
        <p className={`text-sm mt-2 italic ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          {persuasiveText}
        </p>

        {/* Wishlist link if task mentions wishlist */}
        {instruction.toLowerCase().includes('wishlist') && isPending && (
          <button
            onClick={navigateToWishlist}
            className={`mt-3 inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${
              isBambiMode
                ? 'text-pink-600 hover:text-pink-700'
                : 'text-protocol-accent hover:text-protocol-accent-soft'
            }`}
          >
            <ExternalLink className="w-4 h-4" />
            Go to Wishlist
          </button>
        )}

        {/* Progress bar for count tasks */}
        {showProgress && (
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1">
              <span className={isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}>
                Progress
              </span>
              <span className={`font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}>
                {task.progress} / {targetCount}
              </span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${
              isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
            }`}>
              <div
                className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
                  getIntensityGradient(intensity, isBambiMode)
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Expanded content */}
        {expanded && task.task.reward && (
          <div className={`mt-4 pt-4 border-t ${
            isBambiMode ? 'border-pink-100' : 'border-protocol-border'
          }`}>
            <p className={`text-xs uppercase tracking-wider mb-2 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              On completion
            </p>
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <span className={`text-sm ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}>
                +{task.task.reward.points} points
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {isPending && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSkip}
              className={`p-2.5 rounded-xl transition-colors ${
                isBambiMode
                  ? 'text-gray-400 hover:bg-pink-50 hover:text-pink-400'
                  : 'text-protocol-text-muted hover:bg-protocol-bg'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <button
              onClick={handleComplete}
              disabled={isCompleting}
              className={`flex-1 py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] bg-gradient-to-r ${
                getIntensityGradient(intensity, isBambiMode)
              } hover:opacity-90`}
            >
              {isCompleting ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : showProgress && task.progress < (targetCount || 0) - 1 ? (
                <span className="flex items-center justify-center gap-2">
                  <span>+1</span>
                  <span className="text-white/70">({task.progress + 1}/{targetCount})</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Check className="w-5 h-5" />
                  <span>Complete</span>
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
