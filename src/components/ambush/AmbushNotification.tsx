/**
 * AmbushNotification.tsx
 *
 * Pop-up notification for scheduled ambushes (micro-tasks).
 * Uses CompletionInput for type-appropriate completion UI.
 */

import { useState } from 'react';
import { X, AlarmClock, SkipForward } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { CompletionInput } from '../today/CompletionInput';
import type { ScheduledAmbush } from '../../types/scheduled-ambush';
import type { CompletionData, TaskCompletionType } from '../../types/task-bank';
import { truncateToLimit, NOTIFICATION_LIMITS } from '../../lib/handler-v2/popup-utils';
import { AMBUSH_TYPE_CONFIG } from '../../types/scheduled-ambush';

interface AmbushNotificationProps {
  ambush: ScheduledAmbush;
  onComplete: (proofUrl?: string) => Promise<void>;
  onSnooze: () => Promise<void>;
  onSkip: () => Promise<void>;
  onDismiss: () => void;
  canSnooze: boolean;
  isCompleting?: boolean;
}

/**
 * Map ambush type + proof to a CompletionInput completion type.
 */
function getCompletionType(ambush: ScheduledAmbush): TaskCompletionType {
  const template = ambush.template;
  if (!template) return 'binary';

  // Photo/selfie proof → photo input
  if (template.proof_type === 'photo' || template.proof_type === 'selfie') {
    return 'photo';
  }

  // Check-in tasks → reflect (textarea)
  if (template.type === 'check_in') {
    return 'reflect';
  }

  // Short tasks (≤15s) or tap proof → binary (single "Done")
  if (template.duration_seconds <= 15 || template.proof_type === 'tap') {
    return 'binary';
  }

  // Everything else with meaningful duration → timer
  return 'duration';
}

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
    case 1: return 'from-purple-500 to-violet-500';
    case 2: return 'from-violet-500 to-fuchsia-500';
    case 3: return 'from-fuchsia-500 to-rose-500';
    case 4: return 'from-rose-500 to-red-500';
    case 5: return 'from-red-500 to-rose-600';
    default: return 'from-purple-500 to-violet-500';
  }
}

export function AmbushNotification({
  ambush,
  onComplete,
  onSnooze,
  onSkip,
  onDismiss,
  canSnooze,
  isCompleting = false,
}: AmbushNotificationProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [completing, setCompleting] = useState(false);

  const template = ambush.template;
  const typeConfig = template ? AMBUSH_TYPE_CONFIG[template.type] : null;
  const completionType = getCompletionType(ambush);
  const intensity = template?.min_intensity || 2;

  const handleComplete = async (data: CompletionData) => {
    setCompleting(true);
    try {
      if (isBambiMode) {
        triggerHearts();
      }
      // Bridge CompletionData to ambush complete (extract photo URL if present)
      const proofUrl = data.photo_url || undefined;
      await onComplete(proofUrl);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 p-4 animate-slide-down">
      <div className={`max-w-md mx-auto rounded-2xl shadow-2xl overflow-hidden ${
        isBambiMode
          ? 'bg-gradient-to-br from-pink-900 via-fuchsia-900 to-purple-900 border border-pink-500/50'
          : 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-gray-700'
      }`}>
        {/* Header */}
        <div className={`px-4 py-3 flex items-center justify-between ${
          isBambiMode ? 'bg-pink-800/50' : 'bg-gray-800/50'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{typeConfig?.icon || '✨'}</span>
            <span className={`font-bold ${isBambiMode ? 'text-pink-100' : 'text-white'}`}>
              {typeConfig?.label || 'Quick Task'}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className={`p-1.5 rounded-full transition-colors ${
              isBambiMode
                ? 'hover:bg-pink-700/50 text-pink-300'
                : 'hover:bg-gray-700 text-gray-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Instruction */}
          <p className={`text-lg leading-relaxed line-clamp-3 ${
            isBambiMode ? 'text-pink-50' : 'text-white'
          }`}>
            {truncateToLimit(template?.instruction || 'Complete this quick task', NOTIFICATION_LIMITS.ambushInstruction)}
          </p>

          {/* Snooze count */}
          {ambush.snooze_count > 0 && (
            <p className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-amber-400'}`}>
              Snoozed {ambush.snooze_count} time{ambush.snooze_count > 1 ? 's' : ''}
            </p>
          )}

          {/* Completion input — routed by type */}
          <CompletionInput
            completionType={completionType}
            intensity={intensity}
            isCompleting={isCompleting || completing}
            onComplete={handleComplete}
            getGradient={getIntensityGradient}
            currentProgress={0}
            durationMinutes={template ? Math.ceil(template.duration_seconds / 60) : 1}
            taskDomain={template?.domain}
            taskId={template?.id}
            subtext={template?.proof_prompt}
          />
        </div>

        {/* Secondary actions */}
        <div className={`p-4 pt-0 flex gap-3 ${
          isBambiMode ? '' : ''
        }`}>
          {canSnooze && (
            <button
              onClick={onSnooze}
              className={`flex-1 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                isBambiMode
                  ? 'bg-pink-800/50 text-pink-200 hover:bg-pink-800/70 border border-pink-600/50'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              <AlarmClock className="w-4 h-4" />
              Snooze
            </button>
          )}
          <button
            onClick={onSkip}
            className={`flex-1 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
              isBambiMode
                ? 'bg-pink-900/30 text-pink-300 hover:bg-pink-900/50 border border-pink-700/30'
                : 'bg-gray-900/50 text-gray-400 hover:bg-gray-800 border border-gray-800'
            }`}
          >
            <SkipForward className="w-4 h-4" />
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
