/**
 * SessionContainer — Top-level immersive session overlay.
 * Manages the session lifecycle: prep → active → cooldown → post → completion → exit.
 */

import { useEffect } from 'react';
import { useEdgeSession } from '../../hooks/useEdgeSession';
import { useSessionHaptics } from '../../hooks/useSessionHaptics';
import type { SessionConfig } from './session-types';
import { SESSION_COLORS, PREP_MESSAGES } from './session-types';
import { getAffirmationForProgress } from './session-state-machine';
import { SessionTimer } from './SessionTimer';
import { EdgeButton } from './EdgeButton';
import { RecoveryOverlay } from './RecoveryOverlay';
import { ControlPanel } from './ControlPanel';
import { PostSessionModal } from './PostSessionModal';
import { CompletionFlow } from './CompletionFlow';
import { AuctionModal } from './AuctionModal';
import { AffirmationOverlay } from './AffirmationOverlay';

interface SessionContainerProps {
  config: SessionConfig;
  denialDay?: number;
  onComplete: (result: { taskId?: string; points: number; edgeCount: number }) => void;
  onCancel: () => void;
}

export function SessionContainer({ config, denialDay = 0, onComplete, onCancel: _onCancel }: SessionContainerProps) {
  const {
    state,
    timer,
    startSession,
    endPrep,
    recordEdge,
    requestStop,
    cancelStop,
    confirmStop,
    triggerBreathe,
    setPostMood,
    setPostNotes,
    advanceToCompletion,
    setCompletionType,
    completeSession,
    resolveAuction,
  } = useEdgeSession();

  // Haptic integration — maps phase transitions to Lovense patterns
  useSessionHaptics(state);

  // Auto-start session on mount
  useEffect(() => {
    startSession(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle session finalization (phase === 'ended')
  useEffect(() => {
    if (state?.phase === 'ended') {
      onComplete({
        taskId: state.config.originTaskId,
        points: state.pointsAwarded,
        edgeCount: state.edgeCount,
      });
    }
  }, [state?.phase, state?.config.originTaskId, state?.pointsAwarded, state?.edgeCount, onComplete]);

  // Not initialized yet
  if (!state) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center animate-session-enter" style={{ backgroundColor: SESSION_COLORS.deepBg }}>
        <div className="animate-pulse text-white/30 text-lg handler-voice">Preparing session...</div>
      </div>
    );
  }

  // ─── Prep Phase ───
  if (state.phase === 'prep') {
    const canSkip = state.prepTimeRemaining <= 25; // Can skip after 5 seconds
    const canStart = state.prepTimeRemaining <= 0;

    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 animate-session-enter"
        style={{ backgroundColor: SESSION_COLORS.deepBg }}
      >
        <div className="w-full max-w-sm space-y-10 text-center">
          {/* Title */}
          <p className="text-sm tracking-[0.3em] uppercase" style={{ color: SESSION_COLORS.purple }}>
            Prepare
          </p>

          {/* Messages */}
          <div className="space-y-3">
            {PREP_MESSAGES.map((msg, i) => (
              <p key={i} className="text-white/60 text-lg font-light">{msg}</p>
            ))}
          </div>

          {/* Countdown */}
          <div>
            <div className="flex justify-center gap-1 mb-4">
              {Array.from({ length: 30 }, (_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor: i < (30 - state.prepTimeRemaining)
                      ? SESSION_COLORS.teal
                      : 'rgba(255,255,255,0.1)',
                  }}
                />
              ))}
            </div>
            {!canStart && (
              <p className="text-sm text-white/30">
                {state.prepTimeRemaining}s
              </p>
            )}
          </div>

          {/* Ready / Skip buttons */}
          <div className="space-y-3">
            <button
              onClick={endPrep}
              disabled={!canStart}
              className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
                canStart
                  ? 'text-white'
                  : 'text-white/20 cursor-not-allowed'
              }`}
              style={{
                background: canStart
                  ? `linear-gradient(135deg, ${SESSION_COLORS.rose}, ${SESSION_COLORS.purple})`
                  : 'rgba(255,255,255,0.05)',
              }}
            >
              Ready
            </button>

            {canSkip && !canStart && (
              <button
                onClick={endPrep}
                className="text-sm text-white/30 hover:text-white/50 transition-colors"
              >
                Skip wait
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Active Phase / Cooldown ───
  if (state.phase === 'active' || state.phase === 'cooldown') {
    const isCooldown = state.phase === 'cooldown';
    const hasAuction = state.activeAuction !== null;
    const affirmation = isCooldown
      ? 'Last one. You held beautifully.'
      : state.currentAffirmation || getAffirmationForProgress(state.edgeCount, state.config.targetEdges);

    return (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{
          background: state.isRecovering
            ? `linear-gradient(180deg, ${SESSION_COLORS.deepBg}, ${SESSION_COLORS.recoveryBg})`
            : `linear-gradient(180deg, ${SESSION_COLORS.deepBg}, #1a0a2e)`,
        }}
      >
        {/* Top bar */}
        <SessionTimer
          formatted={timer.formatted}
          denialDay={denialDay}
          edgeCount={state.edgeCount}
          targetEdges={state.config.targetEdges}
        />

        {/* Main area */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          {/* Auction modal — blocks interaction with session underneath */}
          {hasAuction && (
            <AuctionModal
              edgeNumber={state.activeAuction!.edgeNumber}
              options={state.activeAuction!.options}
              onSelect={resolveAuction}
            />
          )}

          {/* Recovery overlay */}
          <RecoveryOverlay
            affirmation={state.currentAffirmation}
            isActive={state.isRecovering && !hasAuction}
          />

          {/* Timed affirmation overlay system (subliminal/readable/lingering) */}
          <AffirmationOverlay
            phase={
              state.isRecovering ? 'recovery'
                : isCooldown ? 'idle'
                : 'building'
            }
            isActive={!hasAuction && !isCooldown}
            progress={state.edgeCount / state.config.targetEdges}
          />

          {/* Static affirmation text (below overlay, always visible) */}
          {!state.isRecovering && !hasAuction && (
            <p className="text-white/30 text-sm italic mb-8 px-8 text-center min-h-[20px] handler-voice">
              "{affirmation}"
            </p>
          )}

          {/* Edge button (hidden during cooldown and auction) */}
          {!isCooldown && !hasAuction && (
            <EdgeButton
              edgeCount={state.edgeCount}
              targetEdges={state.config.targetEdges}
              isRecovering={state.isRecovering}
              onTap={recordEdge}
            />
          )}

          {/* Cooldown message */}
          {isCooldown && (
            <div className="text-center space-y-4">
              <p className="text-3xl font-bold text-white">{state.edgeCount} edges</p>
              <p className="text-white/40">Cool down... breathe...</p>
              <div
                className="w-24 h-24 mx-auto rounded-full border-2 animate-pulse"
                style={{ borderColor: `${SESSION_COLORS.teal}40` }}
              />
            </div>
          )}
        </div>

        {/* Control panel */}
        <ControlPanel
          edgeCount={state.edgeCount}
          targetEdges={state.config.targetEdges}
          isRecovering={state.isRecovering}
          showStopConfirm={state.showStopConfirm}
          onStop={requestStop}
          onConfirmStop={confirmStop}
          onCancelStop={cancelStop}
          onBreathe={triggerBreathe}
        />
      </div>
    );
  }

  // ─── Post-Session Capture ───
  if (state.phase === 'post') {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ backgroundColor: SESSION_COLORS.deepBg }}
      >
        <PostSessionModal
          edgeCount={state.edgeCount}
          targetEdges={state.config.targetEdges}
          elapsedFormatted={timer.formatted}
          sessionType={state.config.sessionType}
          onSubmit={(mood, notes) => {
            setPostMood(mood);
            setPostNotes(notes);
            advanceToCompletion();
          }}
        />
      </div>
    );
  }

  // ─── Completion Flow ───
  if (state.phase === 'completion') {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ backgroundColor: SESSION_COLORS.deepBg }}
      >
        <CompletionFlow
          edgeCount={state.edgeCount}
          sessionType={state.config.sessionType}
          onSelectType={setCompletionType}
          pointsAwarded={state.pointsAwarded}
          completionType={state.completionType}
          commitments={state.commitments}
          onDone={async () => {
            await completeSession();
          }}
        />
      </div>
    );
  }

  // Fallback — should not reach here
  return null;
}
