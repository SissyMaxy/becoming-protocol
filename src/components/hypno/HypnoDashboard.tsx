/**
 * HypnoDashboard — Phase router for hypno sessions
 *
 * Routes between idle/starting/live/summary phases.
 * Resumes active sessions on mount.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowLeft, Headphones, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useHypnoSession } from '../../hooks/useHypnoSession';
import { getAvailableLibraryItems } from '../../lib/hypno-library';
import { useAuth } from '../../context/AuthContext';
import { HypnoLiveView } from './HypnoLiveView';
import { HypnoSummaryView } from './HypnoSummaryView';
import { HypnoSessionCard } from './HypnoSessionCard';
import { HYPNO_TASK_CODES } from '../../lib/content/hypno-tasks';
import type { HypnoLibraryItem, HypnoPostSessionState } from '../../types/hypno-bridge';

type HypnoPhase = 'idle' | 'starting' | 'live' | 'summary';

interface HypnoDashboardProps {
  onBack: () => void;
  initialTaskCode?: string;
  initialLibraryItem?: HypnoLibraryItem;
}

export function HypnoDashboard({
  onBack,
  initialTaskCode,
  initialLibraryItem,
}: HypnoDashboardProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const {
    activeSession,
    isLoading,
    captureCount,
    flaggedTimestamps,
    startSession,
    endSession,
    flagTimestamp,
  } = useHypnoSession();

  const [phase, setPhase] = useState<HypnoPhase>('idle');
  const [libraryItem, setLibraryItem] = useState<HypnoLibraryItem | undefined>(
    initialLibraryItem
  );
  const [availableItems, setAvailableItems] = useState<HypnoLibraryItem[]>([]);
  const sessionStartRef = useRef<number>(0);

  // Resume active session on mount
  useEffect(() => {
    if (activeSession && phase === 'idle') {
      sessionStartRef.current = new Date(activeSession.startedAt).getTime();
      setPhase('live');
    }
  }, [activeSession, phase]);

  // Load available library items
  useEffect(() => {
    if (!user?.id) return;
    getAvailableLibraryItems(user.id)
      .then(setAvailableItems)
      .catch(() => {});
  }, [user?.id]);

  const handleStart = useCallback(
    async (item?: HypnoLibraryItem) => {
      setPhase('starting');
      const selectedItem = item || libraryItem || availableItems[0];
      if (selectedItem) setLibraryItem(selectedItem);

      const session = await startSession({
        libraryItemId: selectedItem?.id,
        sessionType: 'conditioning',
        captureMode: 'passive',
      });

      if (session) {
        sessionStartRef.current = Date.now();
        setPhase('live');
      } else {
        setPhase('idle');
      }
    },
    [startSession, libraryItem, availableItems]
  );

  const handleEndSession = useCallback(() => {
    setPhase('summary');
  }, []);

  const handleComplete = useCallback(
    async (tranceDepth: number, postState: HypnoPostSessionState) => {
      await endSession({
        tranceDepth,
        postSessionState: postState,
        completed: true,
      });
      setPhase('idle');
    },
    [endSession]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Back button + header (shown in idle and summary) */}
      {(phase === 'idle' || phase === 'summary') && (
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className={`p-1.5 rounded-lg transition-colors ${
              isBambiMode
                ? 'hover:bg-purple-100 text-purple-500'
                : 'hover:bg-purple-900/30 text-purple-400'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Headphones
              className={`w-5 h-5 ${isBambiMode ? 'text-purple-500' : 'text-purple-400'}`}
            />
            <h1
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-purple-700' : 'text-purple-200'
              }`}
            >
              Hypno Sessions
            </h1>
          </div>
        </div>
      )}

      {/* Starting spinner */}
      {phase === 'starting' && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <p className={`text-sm ${isBambiMode ? 'text-purple-500' : 'text-purple-400'}`}>
            Starting session...
          </p>
        </div>
      )}

      {/* Live session */}
      {phase === 'live' && activeSession && (
        <HypnoLiveView
          session={activeSession}
          libraryItem={libraryItem}
          captureCount={captureCount}
          flaggedTimestamps={flaggedTimestamps}
          onFlag={flagTimestamp}
          onEnd={handleEndSession}
        />
      )}

      {/* Summary */}
      {phase === 'summary' && activeSession && (
        <HypnoSummaryView
          session={activeSession}
          captureCount={captureCount}
          flaggedCount={flaggedTimestamps.length}
          elapsedSeconds={Math.round(
            (Date.now() - sessionStartRef.current) / 1000
          )}
          onComplete={handleComplete}
        />
      )}

      {/* Idle — show session options */}
      {phase === 'idle' && !activeSession && (
        <div className="px-4 space-y-4">
          {/* Quick start card */}
          <HypnoSessionCard
            taskCode={initialTaskCode || HYPNO_TASK_CODES.HYPNO_SESSION}
            libraryItem={libraryItem || availableItems[0]}
            onStart={() => handleStart()}
          />

          {/* Available library items */}
          {availableItems.length > 1 && (
            <div>
              <p
                className={`text-xs uppercase tracking-wider font-semibold mb-2 px-1 ${
                  isBambiMode ? 'text-purple-500' : 'text-purple-400'
                }`}
              >
                Library ({availableItems.length})
              </p>
              <div className="space-y-2">
                {availableItems.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleStart(item)}
                    className={`w-full text-left p-3 rounded-xl transition-colors ${
                      isBambiMode
                        ? 'bg-white border border-purple-200 hover:bg-purple-50'
                        : 'bg-protocol-surface border border-protocol-border hover:bg-purple-900/20'
                    }`}
                  >
                    <p
                      className={`text-sm font-medium ${
                        isBambiMode ? 'text-purple-700' : 'text-purple-300'
                      }`}
                    >
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          isBambiMode
                            ? 'bg-purple-100 text-purple-600'
                            : 'bg-purple-900/30 text-purple-400'
                        }`}
                      >
                        {item.contentCategory.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`text-[10px] ${
                          isBambiMode ? 'text-purple-400' : 'text-purple-500'
                        }`}
                      >
                        {'●'.repeat(item.intensity)}
                        {'○'.repeat(5 - item.intensity)}
                      </span>
                      {item.captureValue >= 5 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            isBambiMode
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-amber-900/30 text-amber-400'
                          }`}
                        >
                          High capture value
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Idle with active session — show resume card */}
      {phase === 'idle' && activeSession && (
        <div className="px-4">
          <HypnoSessionCard
            taskCode={initialTaskCode || HYPNO_TASK_CODES.HYPNO_SESSION}
            libraryItem={libraryItem}
            activeSession={activeSession}
            onStart={() => {
              sessionStartRef.current = new Date(activeSession.startedAt).getTime();
              setPhase('live');
            }}
          />
        </div>
      )}
    </div>
  );
}
