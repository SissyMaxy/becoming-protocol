import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  Heart,
  Sparkles,
  AlertCircle,
  Vibrate,
  Zap,
  Target,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { AnchorBadge } from './AnchorManager';
import { ContentPicker } from './ContentLibrary';
import { useLovense } from '../../hooks/useLovense';
import {
  calculateDenialAwareIntensity,
  getIntensityRange,
  getEdgeCommitments,
  getEdgeCommitmentPrompt,
  type EdgeCommitment,
} from '../../lib/lovense-feminization';
import type {
  SessionType,
  ArousalSession,
  UserAnchor,
  RewardContent,
  SessionStartInput,
  SessionCompleteInput,
} from '../../types/rewards';
import type { ArousalMetrics } from '../../types/arousal';

interface ArousalSessionFlowProps {
  sessionType: SessionType;
  anchors: UserAnchor[];
  availableContent: RewardContent[];
  arousalMetrics?: ArousalMetrics | null;
  onStartSession: (input: SessionStartInput) => Promise<ArousalSession>;
  onCompleteSession: (sessionId: string, input: SessionCompleteInput) => Promise<{ session: ArousalSession; pointsAwarded: number }>;
  onAbandonSession: (sessionId: string) => Promise<void>;
  onClose: () => void;
  className?: string;
}

type FlowPhase = 'pre-session' | 'active' | 'post-session' | 'complete';

const PRACTICE_PROMPTS = [
  "Feel your anchors. Name each one you're wearing.",
  "Breathe deeply. Feel her body.",
  "Who are you right now? Say her name.",
  "Posture check. Align your body as she would.",
  "Feel the pleasure. Associate it with her.",
  "What anchors can you sense? Focus on them.",
  "Breathe into her body. Let go of tension.",
  "Say 'I am becoming her' in your target voice.",
];

export function ArousalSessionFlow({
  sessionType,
  anchors,
  availableContent,
  arousalMetrics,
  onStartSession,
  onCompleteSession,
  onAbandonSession,
  onClose,
  className = '',
}: ArousalSessionFlowProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const lovense = useLovense();

  // Flow state
  const [phase, setPhase] = useState<FlowPhase>('pre-session');
  const [session, setSession] = useState<ArousalSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-session state
  const [selectedAnchors, setSelectedAnchors] = useState<string[]>([]);
  const [preArousalLevel, setPreArousalLevel] = useState(5);
  const [preNotes, setPreNotes] = useState('');
  const [selectedContent, setSelectedContent] = useState<string[]>([]);

  // Active session state
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const promptIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Post-session state
  const [postArousalLevel, setPostArousalLevel] = useState(5);
  const [experienceQuality, setExperienceQuality] = useState(3);
  const [anchorEffectiveness, setAnchorEffectiveness] = useState(3);
  const [postNotes, setPostNotes] = useState('');
  const [pointsAwarded, setPointsAwarded] = useState(0);

  // Lovense/Edge training state
  const [lovenseEnabled, setLovenseEnabled] = useState(false);
  const [sessionEdgeCount, setSessionEdgeCount] = useState(0);
  const [showEdgeCommitment, setShowEdgeCommitment] = useState(false);
  const [pendingCommitment, setPendingCommitment] = useState<EdgeCommitment | null>(null);
  const [commitmentsMade, setCommitmentsMade] = useState<string[]>([]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  // Practice prompt rotation (every 5 minutes)
  useEffect(() => {
    if (phase === 'active' && isTimerRunning) {
      promptIntervalRef.current = setInterval(() => {
        setCurrentPromptIndex(i => (i + 1) % PRACTICE_PROMPTS.length);
      }, 5 * 60 * 1000);
    }
    return () => {
      if (promptIntervalRef.current) {
        clearInterval(promptIntervalRef.current);
      }
    };
  }, [phase, isTimerRunning]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartSession = async () => {
    if (selectedAnchors.length === 0) {
      setError('Please select at least one anchor');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newSession = await onStartSession({
        sessionType,
        activeAnchors: selectedAnchors,
        preArousalLevel,
        preNotes: preNotes || undefined,
      });
      setSession(newSession);
      setPhase('active');
      setIsTimerRunning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndSession = () => {
    setIsTimerRunning(false);
    // Stop Lovense when session ends
    if (lovenseEnabled) {
      lovense.stop();
      lovense.stopEdgeTraining();
    }
    setPhase('post-session');
  };

  // Handle recording an edge
  const handleRecordEdge = useCallback(async () => {
    const newCount = sessionEdgeCount + 1;
    setSessionEdgeCount(newCount);

    // Check for commitment milestones
    if (newCount === 5 || newCount === 8 || newCount === 10) {
      setShowEdgeCommitment(true);
    }

    // Record in Lovense if using edge training mode
    if (lovenseEnabled && lovense.activeMode === 'edge_sync') {
      await lovense.recordEdge();
    }

    return newCount;
  }, [sessionEdgeCount, lovenseEnabled, lovense]);

  // Handle commitment selection
  const handleCommitmentSelect = useCallback((commitment: EdgeCommitment) => {
    setPendingCommitment(commitment);
  }, []);

  // Handle commitment confirmation
  const handleCommitmentConfirm = useCallback(async () => {
    if (pendingCommitment) {
      await pendingCommitment.action();
      setCommitmentsMade(prev => [...prev, pendingCommitment.id]);
      setPendingCommitment(null);
      setShowEdgeCommitment(false);
    }
  }, [pendingCommitment]);

  // Handle skipping commitment
  const handleCommitmentSkip = useCallback(() => {
    setPendingCommitment(null);
    setShowEdgeCommitment(false);
  }, []);

  const handleCompleteSession = async () => {
    if (!session) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await onCompleteSession(session.id, {
        postArousalLevel,
        experienceQuality,
        anchorEffectiveness: selectedAnchors.length > 0 ? anchorEffectiveness : undefined,
        postNotes: postNotes || undefined,
      });
      setPointsAwarded(result.pointsAwarded);
      setPhase('complete');
      if (isBambiMode) {
        triggerHearts();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAbandonSession = async () => {
    if (!session) {
      onClose();
      return;
    }

    if (!confirm('Are you sure you want to end this session without completing it?')) {
      return;
    }

    setIsLoading(true);
    try {
      await onAbandonSession(session.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to abandon session');
      setIsLoading(false);
    }
  };

  const toggleAnchor = (anchorId: string) => {
    setSelectedAnchors(prev =>
      prev.includes(anchorId)
        ? prev.filter(id => id !== anchorId)
        : [...prev, anchorId]
    );
  };

  const toggleContent = (contentId: string) => {
    setSelectedContent(prev =>
      prev.includes(contentId)
        ? prev.filter(id => id !== contentId)
        : [...prev, contentId]
    );
  };

  const activeAnchors = anchors.filter(a => a.isActive);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 ${className}`}
    >
      <div
        className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${
            isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-bg border-protocol-border'
          }`}
        >
          <h2
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {sessionType === 'anchoring' ? 'Anchoring Session' : 'Reward Session'}
          </h2>
          <button
            onClick={handleAbandonSession}
            disabled={isLoading}
            className={`p-2 rounded-full ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-400'
                : 'hover:bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div
            className={`mx-4 mt-4 p-3 rounded-lg flex items-center gap-2 ${
              isBambiMode
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-red-900/20 text-red-400 border border-red-900/30'
            }`}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Phase Content */}
        <div className="p-4">
          {/* PRE-SESSION PHASE */}
          {phase === 'pre-session' && (
            <PreSessionPhase
              isBambiMode={isBambiMode}
              anchors={activeAnchors}
              selectedAnchors={selectedAnchors}
              preArousalLevel={preArousalLevel}
              preNotes={preNotes}
              availableContent={availableContent}
              selectedContent={selectedContent}
              onToggleAnchor={toggleAnchor}
              onSetArousalLevel={setPreArousalLevel}
              onSetNotes={setPreNotes}
              onToggleContent={toggleContent}
              onStart={handleStartSession}
              isLoading={isLoading}
            />
          )}

          {/* ACTIVE SESSION PHASE */}
          {phase === 'active' && (
            <ActiveSessionPhase
              isBambiMode={isBambiMode}
              timerSeconds={timerSeconds}
              isTimerRunning={isTimerRunning}
              currentPrompt={PRACTICE_PROMPTS[currentPromptIndex]}
              selectedAnchors={anchors.filter(a => selectedAnchors.includes(a.id))}
              onToggleTimer={() => setIsTimerRunning(!isTimerRunning)}
              onEndSession={handleEndSession}
              formatTime={formatTime}
              // Lovense props
              lovenseEnabled={lovenseEnabled}
              setLovenseEnabled={setLovenseEnabled}
              lovense={lovense}
              arousalMetrics={arousalMetrics}
              sessionEdgeCount={sessionEdgeCount}
              onRecordEdge={handleRecordEdge}
              showEdgeCommitment={showEdgeCommitment}
              pendingCommitment={pendingCommitment}
              commitmentsMade={commitmentsMade}
              onCommitmentSelect={handleCommitmentSelect}
              onCommitmentConfirm={handleCommitmentConfirm}
              onCommitmentSkip={handleCommitmentSkip}
            />
          )}

          {/* POST-SESSION PHASE */}
          {phase === 'post-session' && (
            <PostSessionPhase
              isBambiMode={isBambiMode}
              timerSeconds={timerSeconds}
              postArousalLevel={postArousalLevel}
              experienceQuality={experienceQuality}
              anchorEffectiveness={anchorEffectiveness}
              postNotes={postNotes}
              hasAnchors={selectedAnchors.length > 0}
              onSetArousalLevel={setPostArousalLevel}
              onSetExperienceQuality={setExperienceQuality}
              onSetAnchorEffectiveness={setAnchorEffectiveness}
              onSetNotes={setPostNotes}
              onComplete={handleCompleteSession}
              isLoading={isLoading}
              formatTime={formatTime}
            />
          )}

          {/* COMPLETE PHASE */}
          {phase === 'complete' && (
            <CompletePhase
              isBambiMode={isBambiMode}
              pointsAwarded={pointsAwarded}
              timerSeconds={timerSeconds}
              onClose={onClose}
              formatTime={formatTime}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Pre-Session Phase Component
function PreSessionPhase({
  isBambiMode,
  anchors,
  selectedAnchors,
  preArousalLevel,
  preNotes,
  availableContent,
  selectedContent,
  onToggleAnchor,
  onSetArousalLevel,
  onSetNotes,
  onToggleContent,
  onStart,
  isLoading,
}: {
  isBambiMode: boolean;
  anchors: UserAnchor[];
  selectedAnchors: string[];
  preArousalLevel: number;
  preNotes: string;
  availableContent: RewardContent[];
  selectedContent: string[];
  onToggleAnchor: (id: string) => void;
  onSetArousalLevel: (level: number) => void;
  onSetNotes: (notes: string) => void;
  onToggleContent: (id: string) => void;
  onStart: () => void;
  isLoading: boolean;
}) {
  const [step, setStep] = useState(0);
  const steps = ['anchors', 'arousal', 'content', 'ready'];

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex gap-2">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full ${
              i <= step
                ? isBambiMode
                  ? 'bg-pink-500'
                  : 'bg-protocol-accent'
                : isBambiMode
                  ? 'bg-pink-200'
                  : 'bg-protocol-surface-light'
            }`}
          />
        ))}
      </div>

      {/* Step 0: Select Anchors */}
      {step === 0 && (
        <div>
          <h3
            className={`text-lg font-medium mb-4 ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            What anchors are you wearing?
          </h3>
          {anchors.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {anchors.map((anchor) => (
                <AnchorBadge
                  key={anchor.id}
                  anchor={anchor}
                  isSelected={selectedAnchors.includes(anchor.id)}
                  onToggle={() => onToggleAnchor(anchor.id)}
                />
              ))}
            </div>
          ) : (
            <p
              className={`text-sm ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              No active anchors. Add anchors in the Anchor Manager.
            </p>
          )}
        </div>
      )}

      {/* Step 1: Arousal Level */}
      {step === 1 && (
        <div>
          <h3
            className={`text-lg font-medium mb-4 ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Current arousal level?
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <button
                  key={level}
                  onClick={() => onSetArousalLevel(level)}
                  className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                    preArousalLevel === level
                      ? isBambiMode
                        ? 'bg-pink-500 text-white scale-110'
                        : 'bg-protocol-accent text-white scale-110'
                      : isBambiMode
                        ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                        : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <div
              className={`flex justify-between text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              <span>Low</span>
              <span>High</span>
            </div>
          </div>

          <div className="mt-6">
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Notes (optional)
            </label>
            <textarea
              value={preNotes}
              onChange={(e) => onSetNotes(e.target.value)}
              placeholder="How are you feeling? Any intentions?"
              rows={2}
              className={`w-full px-4 py-3 rounded-xl resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
                  : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
              } outline-none transition-colors`}
            />
          </div>
        </div>
      )}

      {/* Step 2: Content Selection (optional) */}
      {step === 2 && (
        <div>
          <h3
            className={`text-lg font-medium mb-2 ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Select content (optional)
          </h3>
          <p
            className={`text-sm mb-4 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            Choose content to use during your session
          </p>
          {availableContent.length > 0 ? (
            <ContentPicker
              content={availableContent.slice(0, 5)}
              selectedIds={selectedContent}
              onToggle={onToggleContent}
              maxSelections={3}
            />
          ) : (
            <p
              className={`text-sm ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              No content available. You can proceed without content.
            </p>
          )}
        </div>
      )}

      {/* Step 3: Ready */}
      {step === 3 && (
        <div className="text-center py-8">
          <div
            className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
              isBambiMode
                ? 'bg-gradient-to-r from-pink-400 to-pink-600'
                : 'bg-gradient-to-r from-protocol-accent to-purple-600'
            }`}
          >
            <Heart className="w-10 h-10 text-white" />
          </div>
          <h3
            className={`text-xl font-medium mb-2 ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Ready to begin
          </h3>
          <p
            className={`text-sm ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {selectedAnchors.length} anchor{selectedAnchors.length !== 1 ? 's' : ''} selected
            {selectedContent.length > 0 && ` • ${selectedContent.length} content`}
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className={`flex items-center gap-1 px-4 py-2 rounded-xl font-medium ${
              isBambiMode
                ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        )}
        <button
          onClick={() => step < 3 ? setStep(step + 1) : onStart()}
          disabled={isLoading || (step === 0 && selectedAnchors.length === 0)}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
            (step === 0 && selectedAnchors.length === 0) || isLoading
              ? isBambiMode
                ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
              : isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
          }`}
        >
          {step < 3 ? (
            <>
              <span>Continue</span>
              <ChevronRight className="w-4 h-4" />
            </>
          ) : isLoading ? (
            <span>Starting...</span>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>Begin Session</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Active Session Phase Component
function ActiveSessionPhase({
  isBambiMode,
  timerSeconds,
  isTimerRunning,
  currentPrompt,
  selectedAnchors,
  onToggleTimer,
  onEndSession,
  formatTime,
  // Lovense props
  lovenseEnabled,
  setLovenseEnabled,
  lovense,
  arousalMetrics,
  sessionEdgeCount,
  onRecordEdge,
  showEdgeCommitment,
  pendingCommitment,
  commitmentsMade,
  onCommitmentSelect,
  onCommitmentConfirm,
  onCommitmentSkip,
}: {
  isBambiMode: boolean;
  timerSeconds: number;
  isTimerRunning: boolean;
  currentPrompt: string;
  selectedAnchors: UserAnchor[];
  onToggleTimer: () => void;
  onEndSession: () => void;
  formatTime: (s: number) => string;
  // Lovense props
  lovenseEnabled: boolean;
  setLovenseEnabled: (enabled: boolean) => void;
  lovense: ReturnType<typeof useLovense>;
  arousalMetrics?: ArousalMetrics | null;
  sessionEdgeCount: number;
  onRecordEdge: () => Promise<number>;
  showEdgeCommitment: boolean;
  pendingCommitment: EdgeCommitment | null;
  commitmentsMade: string[];
  onCommitmentSelect: (commitment: EdgeCommitment) => void;
  onCommitmentConfirm: () => void;
  onCommitmentSkip: () => void;
}) {
  // Calculate denial-aware intensity
  const intensityRange = getIntensityRange(arousalMetrics || null);
  const recommendedIntensity = calculateDenialAwareIntensity(arousalMetrics || null);

  // Get edge commitments for current count
  const edgeCommitments = getEdgeCommitments(sessionEdgeCount, {
    addEdges: () => {}, // Will be handled by parent
    addDenialDays: () => {},
    addLockHours: () => {},
    skipNextRelease: () => {},
    listenToHypno: () => {},
  });

  const commitmentPrompt = getEdgeCommitmentPrompt(sessionEdgeCount);

  // Handle Lovense connection
  const handleConnectLovense = async () => {
    await lovense.connect();
    if (lovense.status === 'connected') {
      setLovenseEnabled(true);
      // Start with recommended intensity
      await lovense.setIntensity(recommendedIntensity);
    }
  };

  // Handle intensity change
  const handleIntensityChange = async (intensity: number) => {
    await lovense.setIntensity(intensity);
  };

  // Start edge training mode
  const handleStartEdgeTraining = () => {
    lovense.startEdgeTraining({
      baseIntensity: intensityRange.min,
      maxIntensity: intensityRange.max,
    });
  };

  return (
    <div className="text-center py-4">
      {/* Edge Commitment Modal */}
      {showEdgeCommitment && commitmentPrompt && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
          <div
            className={`w-full max-w-md rounded-2xl p-6 ${
              isBambiMode ? 'bg-white' : 'bg-protocol-bg'
            }`}
          >
            <div className="text-center mb-6">
              <Target
                className={`w-12 h-12 mx-auto mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                }`}
              />
              <h3
                className={`text-lg font-semibold mb-2 ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Edge {sessionEdgeCount} Reached!
              </h3>
              <p
                className={`text-sm ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                {commitmentPrompt}
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {edgeCommitments
                .filter(c => !commitmentsMade.includes(c.id))
                .map((commitment) => (
                  <button
                    key={commitment.id}
                    onClick={() => onCommitmentSelect(commitment)}
                    className={`w-full p-4 rounded-xl text-left transition-all ${
                      pendingCommitment?.id === commitment.id
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-accent text-white'
                        : isBambiMode
                          ? 'bg-pink-50 hover:bg-pink-100'
                          : 'bg-protocol-surface hover:bg-protocol-surface-light'
                    }`}
                  >
                    <p
                      className={`font-medium ${
                        pendingCommitment?.id === commitment.id
                          ? 'text-white'
                          : isBambiMode
                            ? 'text-pink-700'
                            : 'text-protocol-text'
                      }`}
                    >
                      {commitment.label}
                    </p>
                    <p
                      className={`text-sm ${
                        pendingCommitment?.id === commitment.id
                          ? 'text-white/80'
                          : isBambiMode
                            ? 'text-pink-500'
                            : 'text-protocol-text-muted'
                      }`}
                    >
                      {commitment.description}
                    </p>
                  </button>
                ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onCommitmentSkip}
                className={`flex-1 py-2 rounded-xl font-medium ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
                }`}
              >
                Skip
              </button>
              <button
                onClick={onCommitmentConfirm}
                disabled={!pendingCommitment}
                className={`flex-1 py-2 rounded-xl font-medium ${
                  !pendingCommitment
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : isBambiMode
                      ? 'bg-pink-500 text-white hover:bg-pink-600'
                      : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                }`}
              >
                Commit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timer */}
      <div
        className={`text-5xl font-mono font-bold mb-4 ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text'
        }`}
      >
        {formatTime(timerSeconds)}
      </div>

      {/* Timer Controls */}
      <div className="flex justify-center gap-4 mb-6">
        <button
          onClick={onToggleTimer}
          className={`w-14 h-14 rounded-full flex items-center justify-center ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
              : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
          }`}
        >
          {isTimerRunning ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Lovense Controls */}
      <div
        className={`p-4 rounded-xl mb-4 ${
          isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Vibrate
              className={`w-5 h-5 ${
                lovenseEnabled && lovense.status === 'connected'
                  ? isBambiMode
                    ? 'text-pink-500'
                    : 'text-protocol-accent'
                  : isBambiMode
                    ? 'text-pink-300'
                    : 'text-protocol-text-muted'
              }`}
            />
            <span
              className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Lovense
            </span>
          </div>

          {lovense.status !== 'connected' ? (
            <button
              onClick={handleConnectLovense}
              disabled={lovense.status === 'connecting'}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
              }`}
            >
              {lovense.status === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-green-600">
                {lovense.activeToy?.name || 'Connected'}
              </span>
            </div>
          )}
        </div>

        {/* Intensity Slider (when connected) */}
        {lovenseEnabled && lovense.status === 'connected' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
                Intensity: {lovense.currentIntensity}
              </span>
              <span className={isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}>
                Recommended: {recommendedIntensity}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              value={lovense.currentIntensity}
              onChange={(e) => handleIntensityChange(parseInt(e.target.value))}
              className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                isBambiMode ? 'accent-pink-500 bg-pink-200' : 'accent-protocol-accent bg-protocol-surface-light'
              }`}
            />

            {/* Edge Training Controls */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleStartEdgeTraining}
                disabled={lovense.activeMode === 'edge_sync'}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${
                  lovense.activeMode === 'edge_sync'
                    ? isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-accent text-white'
                    : isBambiMode
                      ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                      : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
                }`}
              >
                <Zap className="w-4 h-4" />
                Edge Mode
              </button>

              <button
                onClick={onRecordEdge}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                  isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                }`}
              >
                <Target className="w-4 h-4" />
                Edge ({sessionEdgeCount})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Practice Prompt */}
      <div
        className={`p-4 rounded-xl mb-4 ${
          isBambiMode
            ? 'bg-gradient-to-r from-pink-50 to-purple-50 border-2 border-pink-200'
            : 'bg-protocol-surface border border-protocol-border'
        }`}
      >
        <Sparkles
          className={`w-5 h-5 mx-auto mb-2 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`}
        />
        <p
          className={`text-sm ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          {currentPrompt}
        </p>
      </div>

      {/* Active Anchors */}
      {selectedAnchors.length > 0 && (
        <div
          className={`p-3 rounded-xl mb-4 ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
          }`}
        >
          <p
            className={`text-xs mb-1.5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            Your anchors
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {selectedAnchors.map((anchor) => (
              <span
                key={anchor.id}
                className={`px-2 py-0.5 rounded-full text-xs ${
                  isBambiMode
                    ? 'bg-pink-200 text-pink-700'
                    : 'bg-protocol-accent/20 text-protocol-accent'
                }`}
              >
                {anchor.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* End Session Button */}
      <button
        onClick={onEndSession}
        className={`w-full py-3 rounded-xl font-medium ${
          isBambiMode
            ? 'bg-pink-500 text-white hover:bg-pink-600'
            : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
        }`}
      >
        End Session
      </button>
    </div>
  );
}

// Post-Session Phase Component
function PostSessionPhase({
  isBambiMode,
  timerSeconds,
  postArousalLevel,
  experienceQuality,
  anchorEffectiveness,
  postNotes,
  hasAnchors,
  onSetArousalLevel,
  onSetExperienceQuality,
  onSetAnchorEffectiveness,
  onSetNotes,
  onComplete,
  isLoading,
  formatTime,
}: {
  isBambiMode: boolean;
  timerSeconds: number;
  postArousalLevel: number;
  experienceQuality: number;
  anchorEffectiveness: number;
  postNotes: string;
  hasAnchors: boolean;
  onSetArousalLevel: (level: number) => void;
  onSetExperienceQuality: (quality: number) => void;
  onSetAnchorEffectiveness: (effectiveness: number) => void;
  onSetNotes: (notes: string) => void;
  onComplete: () => void;
  isLoading: boolean;
  formatTime: (s: number) => string;
}) {
  return (
    <div className="space-y-6">
      {/* Session Duration */}
      <div className="text-center">
        <p
          className={`text-sm ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        >
          Session Duration
        </p>
        <p
          className={`text-2xl font-bold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          {formatTime(timerSeconds)}
        </p>
      </div>

      {/* Post Arousal Level */}
      <div>
        <h4
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Post-session arousal level
        </h4>
        <div className="flex justify-between">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
            <button
              key={level}
              onClick={() => onSetArousalLevel(level)}
              className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                postArousalLevel === level
                  ? isBambiMode
                    ? 'bg-pink-500 text-white scale-110'
                    : 'bg-protocol-accent text-white scale-110'
                  : isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Experience Quality */}
      <div>
        <h4
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          How was the experience?
        </h4>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((quality) => (
            <button
              key={quality}
              onClick={() => onSetExperienceQuality(quality)}
              className={`w-12 h-12 rounded-xl text-lg font-medium transition-all ${
                experienceQuality === quality
                  ? isBambiMode
                    ? 'bg-pink-500 text-white scale-110'
                    : 'bg-protocol-accent text-white scale-110'
                  : isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              {['😕', '😐', '🙂', '😊', '🤩'][quality - 1]}
            </button>
          ))}
        </div>
      </div>

      {/* Anchor Effectiveness */}
      {hasAnchors && (
        <div>
          <h4
            className={`text-sm font-medium mb-3 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          >
            How effective were your anchors?
          </h4>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((effectiveness) => (
              <button
                key={effectiveness}
                onClick={() => onSetAnchorEffectiveness(effectiveness)}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  anchorEffectiveness >= effectiveness
                    ? isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-accent text-white'
                    : isBambiMode
                      ? 'bg-pink-100 text-pink-400 hover:bg-pink-200'
                      : 'bg-protocol-surface text-protocol-text-muted hover:bg-protocol-surface-light'
                }`}
              >
                <Heart className="w-5 h-5 fill-current" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Post Notes */}
      <div>
        <label
          className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Insights & reflections (optional)
        </label>
        <textarea
          value={postNotes}
          onChange={(e) => onSetNotes(e.target.value)}
          placeholder="What did you notice? Any breakthroughs?"
          rows={3}
          className={`w-full px-4 py-3 rounded-xl resize-none ${
            isBambiMode
              ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
              : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
          } outline-none transition-colors`}
        />
      </div>

      {/* Complete Button */}
      <button
        onClick={onComplete}
        disabled={isLoading}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium ${
          isLoading
            ? isBambiMode
              ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
              : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
            : isBambiMode
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
        }`}
      >
        <Check className="w-4 h-4" />
        <span>{isLoading ? 'Completing...' : 'Complete Session'}</span>
      </button>
    </div>
  );
}

// Complete Phase Component
function CompletePhase({
  isBambiMode,
  pointsAwarded,
  timerSeconds,
  onClose,
  formatTime,
}: {
  isBambiMode: boolean;
  pointsAwarded: number;
  timerSeconds: number;
  onClose: () => void;
  formatTime: (s: number) => string;
}) {
  return (
    <div className="text-center py-8">
      <div
        className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${
          isBambiMode
            ? 'bg-gradient-to-r from-pink-400 to-pink-600'
            : 'bg-gradient-to-r from-protocol-accent to-purple-600'
        }`}
      >
        <Sparkles className="w-12 h-12 text-white" />
      </div>

      <h3
        className={`text-2xl font-bold mb-2 ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}
      >
        Session Complete!
      </h3>

      <p
        className={`text-lg mb-6 ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
        }`}
      >
        +{pointsAwarded} points earned
      </p>

      <div
        className={`p-4 rounded-xl mb-6 ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}
      >
        <p
          className={`text-sm ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}
        >
          Duration: {formatTime(timerSeconds)}
        </p>
      </div>

      <button
        onClick={onClose}
        className={`w-full py-3 rounded-xl font-medium ${
          isBambiMode
            ? 'bg-pink-500 text-white hover:bg-pink-600'
            : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
        }`}
      >
        Done
      </button>
    </div>
  );
}
