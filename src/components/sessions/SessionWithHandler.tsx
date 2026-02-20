/**
 * SessionWithHandler
 *
 * Wraps EdgeSession with Handler v2 integration
 * Provides:
 * - Handler guidance during sessions
 * - Commitment extraction at peak arousal (arousal >= 4, edges >= 5)
 * - Time capsule prompting
 * - Session availability gating (ginaHome = false)
 * - Post-session mood capture scheduling
 */

import { useState, useEffect, useCallback } from 'react';
import { Lock } from 'lucide-react';
import { EdgeSession } from './EdgeSession';
import { TimeCapsulePrompt } from './TimeCapsulePrompt';
import { PostSessionMoodCapture } from './PostSessionMoodCapture';
import { CommitmentPromptModal } from '../handler/CommitmentPromptModal';
import { CleanupChecklist } from '../corruption/CleanupChecklist';
import { useSessionHandler } from '../../hooks/useSessionHandler';
import { useUserState } from '../../hooks/useUserState';
import { useCorruption } from '../../hooks/useCorruption';
import { shouldShowCleanup } from '../../lib/corruption-behaviors';
import { useStandingPermission } from '../../hooks/useStandingPermission';
import { HandlerNotification } from '../handler/HandlerNotification';

interface SessionWithHandlerProps {
  onClose: () => void;
  onSessionComplete?: (stats: SessionStats) => void;
}

interface SessionStats {
  edgeCount: number;
  duration: number;
  peakIntensity: number;
  averageIntensity: number;
}

export function SessionWithHandler({
  onClose,
  onSessionComplete,
}: SessionWithHandlerProps) {
  const { userState } = useUserState();
  const ginaHome = userState?.ginaHome ?? true;
  const { snapshot: corruptionSnapshot } = useCorruption();
  const ginaCorruptionLevel = corruptionSnapshot?.levels.gina ?? 0;

  const {
    isInitialized,
    currentGuidance,
    pendingCommitment,
    timeCapsulePrompt,
    canStartSession,
    sessionUnavailableReason,
    startSession,
    endSession,
    acceptCommitment,
    declineCommitment,
    saveTimeCapsule,
    dismissTimeCapsule,
  } = useSessionHandler(ginaHome);

  const sessionAutoStart = useStandingPermission('session_auto_start');
  const [showMoodCapture, setShowMoodCapture] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [completedSessionData, setCompletedSessionData] = useState<{
    sessionId: string;
    sessionType: string;
    edgeCount: number;
  } | null>(null);

  // Session ID tracking
  const [sessionId] = useState(() => `edge-${Date.now()}`);
  const [sessionStarted, setSessionStarted] = useState(false);

  // Start session on mount if available
  useEffect(() => {
    if (canStartSession && isInitialized && !sessionStarted) {
      startSession({
        sessionId,
        sessionType: 'edge',
        edgeCount: 0,
        currentArousal: 0,
        denialDay: userState?.denialDay ?? 0,
        phase: 'warmup',
      });
      setSessionStarted(true);
    }
  }, [canStartSession, isInitialized, sessionStarted, sessionId, userState?.denialDay, startSession]);

  // Handle session completion
  const handleSessionComplete = useCallback(async (stats: SessionStats) => {
    await endSession({
      edgeCount: stats.edgeCount,
      duration: stats.duration,
      peakIntensity: stats.peakIntensity,
      averageIntensity: stats.averageIntensity,
      commitmentsMade: [],
    });

    // Store for mood capture
    setCompletedSessionData({
      sessionId,
      sessionType: 'edge',
      edgeCount: stats.edgeCount,
    });

    // Show cleanup checklist if Gina is home/expected and there are items to check
    if (shouldShowCleanup(ginaCorruptionLevel, ginaHome, false)) {
      setShowCleanup(true);
    } else {
      // Go straight to mood capture
      setTimeout(() => {
        setShowMoodCapture(true);
      }, 1000);
    }

    onSessionComplete?.(stats);
  }, [sessionId, endSession, onSessionComplete, ginaCorruptionLevel, ginaHome]);

  // Handle commitment acceptance
  const handleAcceptCommitment = useCallback(async () => {
    await acceptCommitment();
  }, [acceptCommitment]);

  // Handle time capsule save
  const handleSaveTimeCapsule = useCallback(async (message: string) => {
    await saveTimeCapsule(message);
  }, [saveTimeCapsule]);

  // Handle cleanup checklist dismissal → proceed to mood capture
  const handleCleanupDismiss = useCallback(() => {
    setShowCleanup(false);
    setTimeout(() => {
      setShowMoodCapture(true);
    }, 500);
  }, []);

  // Handle mood capture completion
  const handleMoodCaptureComplete = useCallback(() => {
    setShowMoodCapture(false);
    setCompletedSessionData(null);
    onClose();
  }, [onClose]);

  // If session not available (Gina home), show blocker or auto-start notification
  if (!canStartSession) {
    // Standing permission: show notification instead of hard block
    if (sessionAutoStart.granted) {
      return (
        <HandlerNotification
          message={sessionUnavailableReason || 'Session conditions not yet met. Handler will auto-start when ready.'}
          detail="Session will begin automatically when conditions are met per your standing permission."
          onDismiss={onClose}
        />
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="max-w-sm w-full bg-protocol-surface border border-protocol-border rounded-2xl p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-protocol-text text-xl font-semibold mb-2">
            Session Unavailable
          </h2>
          <p className="text-protocol-text-muted text-sm mb-6">
            {sessionUnavailableReason || 'Sessions are currently not available.'}
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 bg-protocol-accent text-white rounded-xl font-medium
                     hover:bg-protocol-accent/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Show cleanup checklist after session (before mood capture)
  if (showCleanup) {
    return (
      <CleanupChecklist
        ginaCorruptionLevel={ginaCorruptionLevel}
        onDismiss={handleCleanupDismiss}
      />
    );
  }

  // Show mood capture after session
  if (showMoodCapture && completedSessionData) {
    return (
      <PostSessionMoodCapture
        sessionId={completedSessionData.sessionId}
        sessionType={completedSessionData.sessionType}
        edgeCount={completedSessionData.edgeCount}
        onComplete={handleMoodCaptureComplete}
        onDismiss={handleMoodCaptureComplete}
      />
    );
  }

  return (
    <>
      {/* Main edge session */}
      <EdgeSession
        onClose={onClose}
        onSessionComplete={handleSessionComplete}
      />

      {/* Handler guidance overlay */}
      {currentGuidance && (
        <HandlerGuidanceOverlay guidance={currentGuidance} />
      )}

      {/* Commitment prompt modal */}
      {pendingCommitment && (
        <CommitmentPromptModal
          isOpen={true}
          prompt={pendingCommitment.prompt}
          domain={pendingCommitment.domain}
          escalationLevel={pendingCommitment.escalationLevel}
          arousalLevel={pendingCommitment.arousalLevel}
          edgeCount={pendingCommitment.edgeCount}
          onAccept={handleAcceptCommitment}
          onDecline={declineCommitment}
        />
      )}

      {/* Time capsule prompt */}
      {timeCapsulePrompt && (
        <TimeCapsulePrompt
          prompt={timeCapsulePrompt.prompt}
          context={timeCapsulePrompt.context}
          emotionalIntensity={timeCapsulePrompt.emotionalIntensity}
          onSave={handleSaveTimeCapsule}
          onDismiss={dismissTimeCapsule}
        />
      )}
    </>
  );
}

// Handler guidance overlay component
function HandlerGuidanceOverlay({
  guidance,
}: {
  guidance: { message: string; layer: number };
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Auto-hide after 5 seconds
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [guidance]);

  if (!visible) return null;

  return (
    <div className="fixed top-20 left-4 right-4 z-40 flex justify-center pointer-events-none">
      <div className="max-w-md bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4
                      animate-fade-in-down">
        <p className="text-white/90 text-sm text-center">
          {guidance.message}
        </p>
        {guidance.layer === 3 && (
          <p className="text-pink-400/60 text-xs text-center mt-2">
            - Handler
          </p>
        )}
      </div>
    </div>
  );
}

export default SessionWithHandler;
