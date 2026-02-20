/**
 * Task Card New
 * Redesigned task card with better visual hierarchy and persuasive framing
 */

import { useState } from 'react';
import { Check, X, Loader2, ExternalLink } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { DailyTask, CompletionData } from '../../types/task-bank';
import { CompletionInput } from './CompletionInput';

// Helper to navigate to wishlist
function navigateToWishlist() {
  window.dispatchEvent(new CustomEvent('navigate-to-wishlist'));
}

interface TaskCardNewProps {
  task: DailyTask;
  onComplete: (feltGood?: boolean, notes?: string, captureData?: CompletionData) => void;
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
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const { instruction, category, intensity, completionType: baseCompletionType, targetCount, durationMinutes, subtext, captureFields: baseCaptureFields } = task.task;
  const completionType = task.completionTypeOverride || baseCompletionType;
  const captureFields = task.captureFieldsOverride || baseCaptureFields;
  const contextLine = task.enhancedContextLine || task.task.handlerFraming;

  // Prefer Claude-enhanced text over base task text
  const displayInstruction = task.enhancedInstruction || instruction;
  const displaySubtext = task.enhancedSubtext || subtext || getSubtext(category);
  const copyStyle = task.copyStyle || 'normal';

  const isCompleted = task.status === 'completed';
  const isSkipped = task.status === 'skipped';
  const isPending = task.status === 'pending';

  // Get persuasive subtext (already computed above)
  const persuasiveText = displaySubtext;

  // Handle completion from CompletionInput components
  const handleCompletionInput = (data: CompletionData) => {
    const feltGood = data.fields?.felt_good as boolean | undefined;
    const notes = data.reflection_text || undefined;
    onComplete(feltGood ?? true, notes, data);
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
              {displayInstruction}
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
              {displayInstruction}
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

      {/* Main content */}
      <div className="p-4">
        {/* Handler context line */}
        {contextLine && (
          <p className={`text-xs italic mb-2 ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-accent/70'
          }`}>
            {contextLine}
          </p>
        )}

        {/* Instruction — sized by copy_style: command=large+bold, short=medium+bold, normal=base */}
        <p className={`leading-snug ${
          copyStyle === 'command'
            ? 'text-xl font-bold tracking-tight'
            : copyStyle === 'short'
              ? 'text-lg font-bold'
              : 'text-lg font-semibold'
        } ${
          isBambiMode ? 'text-gray-800' : 'text-protocol-text'
        }`}>
          {displayInstruction}
        </p>

        {/* Persuasive subtext — hidden in command mode (no fluff when aroused) */}
        {copyStyle !== 'command' && (
          <p className={`text-sm mt-2 italic ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}>
            {persuasiveText}
          </p>
        )}

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

        {/* Completion input — type-aware (binary, duration, scale, count, reflect) */}
        {isPending && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSkip}
              aria-label="Skip task"
              className={`p-2.5 rounded-xl transition-colors flex flex-col items-center ${
                isBambiMode
                  ? 'text-gray-400 hover:bg-pink-50 hover:text-pink-400'
                  : 'text-protocol-text-muted hover:bg-protocol-bg'
              }`}
            >
              <X className="w-5 h-5" />
              <span className="text-[10px] -mt-0.5">Skip</span>
            </button>

            <CompletionInput
              completionType={completionType}
              targetCount={targetCount}
              currentProgress={task.progress}
              durationMinutes={durationMinutes}
              subtext={displaySubtext}
              intensity={intensity}
              isCompleting={isCompleting}
              onComplete={handleCompletionInput}
              onIncrement={onIncrement}
              getGradient={getIntensityGradient}
              captureFields={captureFields}
            />
          </div>
        )}
      </div>
    </div>
  );
}
