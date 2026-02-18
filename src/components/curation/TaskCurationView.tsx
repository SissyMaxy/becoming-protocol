/**
 * Task Curation View
 *
 * Main view for the swipe-based task curation flow.
 */

import { useState } from 'react';
import { ArrowLeft, Layers, Loader2, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useTaskCuration } from '../../hooks/useTaskCuration';
import { SwipeableTaskCard } from './SwipeableTaskCard';
import { CurationProgress } from './CurationProgress';
import { CurationComplete } from './CurationComplete';
import { NeedsWorkModal } from './NeedsWorkModal';

interface TaskCurationViewProps {
  onBack: () => void;
}

type ViewState = 'intro' | 'curating' | 'complete';

export function TaskCurationView({ onBack }: TaskCurationViewProps) {
  const { isBambiMode } = useBambiMode();
  const [viewState, setViewState] = useState<ViewState>('intro');

  const {
    queueState,
    session,
    isLoading,
    error,
    startSession,
    handleSwipe,
    endSession,
    isSessionActive,
    showNeedsWorkModal,
    confirmPendingDecision,
    cancelPendingDecision,
  } = useTaskCuration();

  const handleStart = async () => {
    await startSession();
    setViewState('curating');
  };

  const handleExit = async () => {
    if (isSessionActive) {
      await endSession('user_exit');
    }
    setViewState('complete');
  };

  const handleViewCurated = () => {
    // For now, just go back - could navigate to a curated tasks view
    onBack();
  };

  const handleCurateMore = async () => {
    setViewState('intro');
  };

  // Check if session ended
  if (viewState === 'curating' && !isSessionActive && session?.sessionCompleted) {
    setViewState('complete');
  }

  return (
    <div
      className={`min-h-screen ${
        isBambiMode
          ? 'bg-gradient-to-b from-pink-50 to-white'
          : 'bg-protocol-bg'
      }`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 ${
          isBambiMode
            ? 'bg-pink-50/90 backdrop-blur-sm border-b border-pink-200'
            : 'bg-protocol-bg/90 backdrop-blur-sm border-b border-protocol-border'
        }`}
      >
        <button
          onClick={viewState === 'curating' ? handleExit : onBack}
          className={`p-2 rounded-lg transition-colors ${
            isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
          }`}
        >
          <ArrowLeft
            className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          />
        </button>
        <div className="flex-1">
          <h1
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Task Curation
          </h1>
          <p
            className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            Build your personal task bank
          </p>
        </div>
        <Layers
          className={`w-6 h-6 ${isBambiMode ? 'text-pink-400' : 'text-cyan-400'}`}
        />
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Error display */}
        {error && (
          <div
            className={`mb-4 p-4 rounded-xl ${
              isBambiMode
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-red-900/20 text-red-400 border border-red-800'
            }`}
          >
            {error}
          </div>
        )}

        {/* Intro State */}
        {viewState === 'intro' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div
              className={`w-24 h-24 rounded-2xl flex items-center justify-center mb-6 ${
                isBambiMode ? 'bg-pink-100' : 'bg-cyan-900/30'
              }`}
            >
              <Layers
                className={`w-12 h-12 ${
                  isBambiMode ? 'text-pink-500' : 'text-cyan-400'
                }`}
              />
            </div>

            <h2
              className={`text-2xl font-bold mb-3 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Swipe to Curate
            </h2>

            <p
              className={`text-sm mb-8 max-w-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Evaluate tasks one by one. Your preferences will train the AI to
              serve you better tasks.
            </p>

            {/* Swipe instructions */}
            <div
              className={`w-full max-w-xs p-4 rounded-xl mb-8 ${
                isBambiMode
                  ? 'bg-white border border-pink-200'
                  : 'bg-protocol-surface'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <ChevronRight className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p
                    className={`font-medium ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}
                  >
                    Swipe Right
                  </p>
                  <p
                    className={`text-xs ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}
                  >
                    Keep this task
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                  <ChevronLeft className="w-5 h-5 text-red-600" />
                </div>
                <div className="text-left">
                  <p
                    className={`font-medium ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}
                  >
                    Swipe Left
                  </p>
                  <p
                    className={`text-xs ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}
                  >
                    Reject forever
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <ChevronUp className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p
                    className={`font-medium ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}
                  >
                    Swipe Up
                  </p>
                  <p
                    className={`text-xs ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}
                  >
                    Needs improvement
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={isLoading}
              className={`px-8 py-4 rounded-xl font-medium flex items-center gap-2 transition-colors ${
                isLoading
                  ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                  : isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-cyan-600 text-white hover:bg-cyan-700'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading...
                </>
              ) : (
                'Start Curating'
              )}
            </button>
          </div>
        )}

        {/* Curating State */}
        {viewState === 'curating' && queueState.currentTask && (
          <div className="flex flex-col items-center">
            {/* Progress */}
            <div className="w-full max-w-sm mb-6">
              <CurationProgress
                currentIntensity={queueState.currentIntensity}
                stats={queueState.sessionStats}
              />
            </div>

            {/* Card */}
            <div className="flex items-center justify-center min-h-[400px]">
              <SwipeableTaskCard
                task={queueState.currentTask}
                onSwipe={handleSwipe}
              />
            </div>

            {/* Remaining count */}
            {queueState.tasksRemaining > 0 && (
              <p
                className={`mt-6 text-sm ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                {queueState.tasksRemaining} tasks remaining
              </p>
            )}
          </div>
        )}

        {/* No current task but still active - loading next */}
        {viewState === 'curating' && !queueState.currentTask && isSessionActive && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <Loader2
              className={`w-10 h-10 animate-spin mb-4 ${
                isBambiMode ? 'text-pink-500' : 'text-cyan-400'
              }`}
            />
            <p
              className={`text-sm ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Loading next task...
            </p>
          </div>
        )}

        {/* Complete State */}
        {viewState === 'complete' && session && (
          <CurationComplete
            session={session}
            onViewCurated={handleViewCurated}
            onCurateMore={handleCurateMore}
            hasMoreTasks={queueState.tasksRemaining > 0}
          />
        )}
      </div>

      {/* Needs Work Modal */}
      {showNeedsWorkModal && (
        <NeedsWorkModal
          onSubmit={confirmPendingDecision}
          onCancel={cancelPendingDecision}
        />
      )}
    </div>
  );
}
