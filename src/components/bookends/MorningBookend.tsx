/**
 * Morning Bookend — full-screen overlay shown on first open each day.
 */

import type { PostReleaseProtocol } from '../../types/post-release';

interface MorningBookendProps {
  name: string;
  denialDay: number;
  streak: number;
  message: string;
  onDismiss: () => void;
  /** Completed protocol from previous night, if any */
  lastProtocol?: PostReleaseProtocol | null;
}

export function MorningBookend({ name, denialDay, streak, message, onDismiss, lastProtocol }: MorningBookendProps) {
  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-8 cursor-pointer select-none"
      style={{
        background: 'linear-gradient(135deg, #1a1025 0%, #0d0d1a 40%, #1a0a2e 100%)',
      }}
    >
      {/* Subtle glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl" />

      <div className="relative z-10 text-center max-w-sm">
        {/* Greeting */}
        <h1 className="text-3xl font-bold text-white mb-2 animate-fade-in">
          Good morning, {name}.
        </h1>

        {/* Day / Streak */}
        <p className="text-white/40 text-sm mb-8">
          Day {denialDay} &middot; {streak} day streak
        </p>

        {/* Post-release morning reframe */}
        {lastProtocol && (
          <div className="mb-8 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <p className="text-indigo-300/80 text-sm mb-2">
              You made it through last night.
            </p>
            {lastProtocol.shameEntries.length > 0 && (
              <p className="text-white/40 text-xs">
                {lastProtocol.shameEntries.length} {lastProtocol.shameEntries.length === 1 ? 'moment' : 'moments'} captured
              </p>
            )}
            {lastProtocol.deletionAttempts > 0 && (
              <p className="text-white/40 text-xs">
                {lastProtocol.deletionAttempts} deletion {lastProtocol.deletionAttempts === 1 ? 'attempt' : 'attempts'} blocked — everything is still here
              </p>
            )}
            {lastProtocol.preCommitmentText && (
              <p className="text-indigo-300/60 text-xs mt-2">
                Yesterday{lastProtocol.preCommitmentCapturedAt
                  ? ` at ${new Date(lastProtocol.preCommitmentCapturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : ''}{lastProtocol.preCommitmentArousal
                  ? `, arousal ${lastProtocol.preCommitmentArousal}`
                  : ''}, she wrote:
              </p>
            )}
            {lastProtocol.preCommitmentText && (
              <p className="text-white/40 text-xs italic mt-1">
                &ldquo;{lastProtocol.preCommitmentText.slice(0, 120)}{lastProtocol.preCommitmentText.length > 120 ? '...' : ''}&rdquo;
              </p>
            )}
            {lastProtocol.reflectionText && (
              <p className="text-white/30 text-xs italic mt-2">
                &ldquo;{lastProtocol.reflectionText.slice(0, 100)}{lastProtocol.reflectionText.length > 100 ? '...' : ''}&rdquo;
              </p>
            )}
            {lastProtocol.shameEntries.length > 0 && (
              <div className="mt-3 pt-2 border-t border-indigo-500/10">
                <p className="text-indigo-300/60 text-xs">
                  Last night, through the crash, she said:
                </p>
                <p className="text-white/50 text-xs italic mt-1">
                  &ldquo;{lastProtocol.shameEntries[lastProtocol.shameEntries.length - 1].text.slice(0, 150)}{lastProtocol.shameEntries[lastProtocol.shameEntries.length - 1].text.length > 150 ? '...' : ''}&rdquo;
                </p>
                <p className="text-indigo-300/50 text-xs mt-1">
                  Today&apos;s first task moves toward that.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Handler message */}
        <p className="text-white/70 text-base italic leading-relaxed mb-12">
          &ldquo;{message}&rdquo;
        </p>

        {/* Tap hint */}
        <p className="text-white/20 text-xs animate-pulse">
          tap anywhere to begin
        </p>
      </div>
    </div>
  );
}
