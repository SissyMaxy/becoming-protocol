/**
 * HypnoDashboard — Phase router for hypno sessions
 *
 * Routes between idle/starting/live/summary phases.
 * Resumes active sessions on mount.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowLeft, Headphones, Loader2, Sparkles } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useHypnoSession } from '../../hooks/useHypnoSession';
import { getAvailableLibraryItems } from '../../lib/hypno-library';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { activateSessionDevice, deactivateSessionDevice } from '../../lib/conditioning/session-device';
import { HypnoLiveView } from './HypnoLiveView';
import { HypnoSummaryView } from './HypnoSummaryView';
import { HypnoSessionCard } from './HypnoSessionCard';
import { HYPNO_TASK_CODES } from '../../lib/content/hypno-tasks';
import type { HypnoLibraryItem, HypnoPostSessionState } from '../../types/hypno-bridge';

interface PrescribedContent {
  id: string;
  title: string;
  category: string;
  intensity: number;
  duration_minutes: number;
  creator: string;
  media_type: string;
}

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
  const [prescribedContent, setPrescribedContent] = useState<PrescribedContent[]>([]);
  const sessionStartRef = useRef<number>(0);

  // Resume active session on mount
  useEffect(() => {
    if (activeSession && phase === 'idle') {
      sessionStartRef.current = new Date(activeSession.startedAt).getTime();
      setPhase('live');
    }
  }, [activeSession, phase]);

  // Load available library items + prescribed conditioning content
  useEffect(() => {
    if (!user?.id) return;
    getAvailableLibraryItems(user.id)
      .then(setAvailableItems)
      .catch(() => {});

    // Load prescribed content from conditioning engine curriculum
    supabase
      .from('content_curriculum')
      .select('id, title, category, intensity, duration_minutes, creator, media_type')
      .eq('user_id', user.id)
      .in('media_type', ['audio', 'custom_handler'])
      .in('session_contexts', ['trance', 'combined', 'sleep'])
      .order('times_prescribed', { ascending: true })
      .limit(5)
      .then(({ data }) => {
        if (data) setPrescribedContent(data);
      });
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
        // Activate device for trance induction
        activateSessionDevice('trance', 'induction').catch(() => {});
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
      // Stop device
      deactivateSessionDevice().catch(() => {});
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

          {/* Prescribed conditioning content from curriculum */}
          {prescribedContent.length > 0 && (
            <div>
              <p
                className={`text-xs uppercase tracking-wider font-semibold mb-2 px-1 flex items-center gap-1 ${
                  isBambiMode ? 'text-pink-500' : 'text-pink-400'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Prescribed ({prescribedContent.length})
              </p>
              <div className="space-y-2">
                {prescribedContent.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleStart({
                      id: item.id,
                      title: item.title,
                      contentCategory: item.category,
                      intensity: item.intensity,
                      captureValue: 0,
                      mediaType: item.media_type as 'audio' | 'video',
                    } as HypnoLibraryItem)}
                    className={`w-full text-left p-3 rounded-xl transition-colors ${
                      isBambiMode
                        ? 'bg-pink-50 border border-pink-200 hover:bg-pink-100'
                        : 'bg-pink-900/10 border border-pink-700/30 hover:bg-pink-900/20'
                    }`}
                  >
                    <p className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-pink-300'}`}>
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-pink-900/30 text-pink-400'
                      }`}>
                        {item.creator === 'handler' ? 'Custom Handler' : item.creator}
                      </span>
                      <span className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-pink-500'}`}>
                        {'●'.repeat(item.intensity)}{'○'.repeat(5 - item.intensity)}
                      </span>
                      {item.duration_minutes > 0 && (
                        <span className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-pink-500'}`}>
                          {item.duration_minutes}min
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

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
