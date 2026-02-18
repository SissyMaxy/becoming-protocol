// DirectiveCard - Single-Card Directive View (Feature 6)
//
// Replaces any task list or browsable interface with a single coach directive.
// The user sees ONE thing at a time. This eliminates decision paralysis and
// prevents cherry-picking comfortable tasks while avoiding challenging ones.
//
// Two buttons only: "Done" and "I can't right now"
// On decline, serve a pivot task - she doesn't get off that easy.

import { useState } from 'react';
import { Task } from '../types/task-bank';
import { supabase } from '../lib/supabase';

// ===========================================
// TYPES
// ===========================================

interface UserState {
  user_id: string;
  denial_day: number;
  arousal_level: number;
  mood: string;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'late_night';
  gina_present: boolean;
  streak_days: number;
}

interface DirectiveCardProps {
  coachMessage: string;
  task: Task;
  userState: UserState;
  onComplete: (result?: boolean | number) => void;
  onDecline: () => void;
  canDecline?: boolean;
}

interface PivotResult {
  coachMessage: string;
  task: Task;
  canDeclineAgain: boolean;
}

// ===========================================
// DECLINE HANDLING
// ===========================================

/**
 * When the user clicks "I can't right now," the coach doesn't just let her off.
 * It serves a PIVOT — an alternative that still moves forward.
 */
async function handleDecline(
  task: Task,
  userState: UserState
): Promise<PivotResult> {
  // Generate pivot message via API
  const prefill = "I hear you. But you're not getting off that easy. Instead,";

  try {
    const { data, error } = await supabase.functions.invoke('handler-coach', {
      body: {
        user_id: userState.user_id,
        request_type: 'task_framing',
        user_state: userState,
        prefill,
        context: {
          declined_task: task.instruction,
          declined_domain: task.domain,
          decline_reason: 'user_initiated',
          framing_instruction: 'Provide a simpler alternative in the same domain. Something she CAN do right now. Still directive, but lower barrier.'
        }
      }
    });

    if (error) throw error;

    // Generate a minimal pivot task in the same domain
    const pivotTask = generateMinimalTask(task);

    return {
      coachMessage: data.message,
      task: pivotTask,
      canDeclineAgain: false // Only one decline per cycle
    };
  } catch (err) {
    console.error('Failed to generate pivot:', err);

    // Fallback pivot
    const pivotTask = generateMinimalTask(task);
    return {
      coachMessage: `${prefill} just do this one small thing. ${pivotTask.instruction}`,
      task: pivotTask,
      canDeclineAgain: false
    };
  }
}

/**
 * Generate a minimal version of the declined task
 * Lower intensity, shorter duration, same domain
 */
function generateMinimalTask(originalTask: Task): Task {
  const minimalInstructions: Record<string, string> = {
    voice: 'Say "I am Maxy" out loud, three times, in her voice.',
    movement: 'Stand up. Cross your legs. Hold for 30 seconds.',
    skincare: 'Apply moisturizer to your hands. Feel the softness.',
    style: 'Put on one feminine item. Just one. Right now.',
    makeup: 'Apply lip balm or gloss. Feel it on your lips.',
    social: 'Send one message as her. Even just an emoji.',
    body_language: 'Sit with your knees together for 2 minutes.',
    inner_narrative: 'Close your eyes. Say "I deserve to be her." Mean it.',
    arousal: 'Take 5 deep breaths. Notice what you feel.',
    chastity: 'Check your cage. Acknowledge it. Say "this is where I belong."',
    conditioning: 'Read this affirmation: "My feminine self is my real self."',
    identity: 'Write one sentence about who Maxy is.',
  };

  return {
    ...originalTask,
    id: `pivot-${originalTask.id}`,
    instruction: minimalInstructions[originalTask.domain] || 'Take one small step forward. You choose what.',
    intensity: 1,
    durationMinutes: 2,
    subtext: 'This is the floor. Just do this.',
  };
}

// ===========================================
// DIRECTIVE CARD COMPONENT
// ===========================================

export function DirectiveCard({
  coachMessage,
  task,
  userState,
  onComplete,
  onDecline,
  canDecline = true
}: DirectiveCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPivot, setShowPivot] = useState(false);
  const [pivotData, setPivotData] = useState<PivotResult | null>(null);

  const handleCompleteClick = async () => {
    setIsLoading(true);
    try {
      onComplete();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeclineClick = async () => {
    if (!canDecline) return;

    setIsLoading(true);
    try {
      const pivot = await handleDecline(task, userState);
      setPivotData(pivot);
      setShowPivot(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePivotComplete = () => {
    setShowPivot(false);
    setPivotData(null);
    onDecline(); // Signal that we handled the decline with a pivot
  };

  // Show pivot card if declined
  if (showPivot && pivotData) {
    return (
      <PivotCard
        coachMessage={pivotData.coachMessage}
        task={pivotData.task}
        onComplete={handlePivotComplete}
        originalDomain={task.domain}
      />
    );
  }

  return (
    <div className="directive-card bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-6 shadow-xl border border-gray-800 max-w-lg mx-auto">
      {/* Coach's personalized message */}
      <div className="coach-message mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-sm">H</span>
          </div>
          <div className="flex-1 pt-1">
            <p className="text-gray-100 leading-relaxed text-lg">
              {coachMessage}
            </p>
          </div>
        </div>
      </div>

      <div className="divider h-px bg-gradient-to-r from-transparent via-pink-500/30 to-transparent my-6" />

      {/* The actual task - clear and specific */}
      <div className="task-directive mb-8">
        <h3 className="text-xl font-semibold text-white mb-3 leading-tight">
          {task.instruction}
        </h3>

        {task.subtext && (
          <p className="text-gray-400 text-sm mb-4 leading-relaxed">
            {task.subtext}
          </p>
        )}

        {task.durationMinutes && (
          <div className="inline-flex items-center gap-2 text-sm text-gray-500 bg-gray-800/50 px-3 py-1.5 rounded-full">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{task.durationMinutes} min</span>
          </div>
        )}
      </div>

      {/* Two buttons only. No other options. */}
      <div className="actions flex flex-col gap-3">
        <button
          onClick={handleCompleteClick}
          disabled={isLoading}
          className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-semibold text-lg hover:from-pink-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/25 active:scale-[0.98]"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>...</span>
            </span>
          ) : (
            'Done'
          )}
        </button>

        {canDecline && (
          <button
            onClick={handleDeclineClick}
            disabled={isLoading}
            className="w-full py-3 px-6 rounded-xl bg-transparent text-gray-400 font-medium hover:text-gray-300 hover:bg-gray-800/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700/50"
          >
            I can't right now
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================================
// PIVOT CARD COMPONENT
// ===========================================

interface PivotCardProps {
  coachMessage: string;
  task: Task;
  onComplete: () => void;
  originalDomain: string;
}

/**
 * Pivot Card - shown after declining
 * Offers a simpler alternative that still moves forward
 * NO DECLINE BUTTON - she doesn't get to decline twice
 */
function PivotCard({
  coachMessage,
  task,
  onComplete,
  originalDomain
}: PivotCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      onComplete();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pivot-card bg-gradient-to-b from-amber-900/20 to-gray-950 rounded-2xl p-6 shadow-xl border border-amber-700/30 max-w-lg mx-auto">
      {/* Coach's pivot message */}
      <div className="coach-message mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-sm">H</span>
          </div>
          <div className="flex-1 pt-1">
            <p className="text-gray-100 leading-relaxed text-lg">
              {coachMessage}
            </p>
          </div>
        </div>
      </div>

      <div className="divider h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent my-6" />

      {/* The pivot task */}
      <div className="task-directive mb-8">
        <div className="text-xs font-medium text-amber-500 uppercase tracking-wider mb-2">
          Alternative • Still {originalDomain}
        </div>
        <h3 className="text-xl font-semibold text-white mb-3 leading-tight">
          {task.instruction}
        </h3>

        {task.subtext && (
          <p className="text-gray-400 text-sm mb-4 leading-relaxed">
            {task.subtext}
          </p>
        )}

        {task.durationMinutes && (
          <div className="inline-flex items-center gap-2 text-sm text-amber-500/70 bg-amber-900/20 px-3 py-1.5 rounded-full">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{task.durationMinutes} min</span>
          </div>
        )}
      </div>

      {/* Single button - NO DECLINE on pivot */}
      <button
        onClick={handleComplete}
        disabled={isLoading}
        className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-lg hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25 active:scale-[0.98]"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>...</span>
          </span>
        ) : (
          'Done'
        )}
      </button>
    </div>
  );
}

// ===========================================
// EMPTY STATE
// ===========================================

interface EmptyDirectiveProps {
  message?: string;
  onRefresh?: () => void;
}

export function EmptyDirective({ message, onRefresh }: EmptyDirectiveProps) {
  return (
    <div className="empty-directive bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-8 shadow-xl border border-gray-800 max-w-lg mx-auto text-center">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-600/20 flex items-center justify-center mx-auto mb-4">
        <span className="text-pink-400 text-2xl">✓</span>
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">
        {message || "You're caught up"}
      </h3>
      <p className="text-gray-400 mb-6">
        No pending directives right now. Good girl.
      </p>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="text-pink-400 hover:text-pink-300 font-medium transition-colors"
        >
          Check for new tasks
        </button>
      )}
    </div>
  );
}

// ===========================================
// LOADING STATE
// ===========================================

export function LoadingDirective() {
  return (
    <div className="loading-directive bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-8 shadow-xl border border-gray-800 max-w-lg mx-auto">
      <div className="animate-pulse">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-gray-700" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 bg-gray-700 rounded w-3/4" />
            <div className="h-4 bg-gray-700 rounded w-1/2" />
          </div>
        </div>
        <div className="h-px bg-gray-800 my-6" />
        <div className="space-y-3 mb-8">
          <div className="h-6 bg-gray-700 rounded w-full" />
          <div className="h-4 bg-gray-800 rounded w-2/3" />
        </div>
        <div className="space-y-3">
          <div className="h-14 bg-gray-700 rounded-xl" />
          <div className="h-12 bg-gray-800 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default DirectiveCard;
