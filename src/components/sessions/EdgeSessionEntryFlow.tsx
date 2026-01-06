// EdgeSessionEntryFlow.tsx
// Entry flow for edge sessions with anchor check, pre-survey, mode select

import { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Target,
  Moon,
  Lock,
  Gift,
  Sparkles,
  Anchor,
  AlertCircle,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { AnchorBadge } from '../rewards/AnchorManager';
import type { UserAnchor } from '../../types/rewards';
import type {
  EdgeSessionType,
  SessionGoal,
  SessionMindset,
  PhysicalReadiness,
} from '../../types/edge-session';

interface EdgeSessionEntryFlowProps {
  anchors: UserAnchor[];
  canAccessReward: boolean; // From session gate
  onStart: (config: EdgeSessionConfig) => void;
  onClose: () => void;
  className?: string;
}

export interface EdgeSessionConfig {
  sessionType: EdgeSessionType;
  goal: SessionGoal;
  goalTarget?: number;
  activeAnchors: string[];
  preArousalLevel: number;
  mindset: SessionMindset;
  physicalState: PhysicalReadiness;
  patternMode: 'auto' | 'manual' | 'ai_guided';
  intensityPreference: 'gentle' | 'moderate' | 'intense';
  auctionEnabled: boolean;
  notes?: string;
}

type EntryStep = 'anchor_check' | 'pre_survey' | 'mode_select' | 'ready';

const STEPS: EntryStep[] = ['anchor_check', 'pre_survey', 'mode_select', 'ready'];

const SESSION_ICONS: Record<EdgeSessionType, React.ReactNode> = {
  anchoring: <Anchor className="w-6 h-6" />,
  edge_training: <Target className="w-6 h-6" />,
  denial: <Lock className="w-6 h-6" />,
  goon: <Moon className="w-6 h-6" />,
  reward: <Gift className="w-6 h-6" />,
};

const SESSION_COLORS: Record<EdgeSessionType, string> = {
  anchoring: 'from-cyan-500 to-blue-500',
  edge_training: 'from-pink-500 to-red-500',
  denial: 'from-orange-500 to-red-600',
  goon: 'from-purple-500 to-indigo-500',
  reward: 'from-amber-400 to-orange-500',
};

const MINDSET_OPTIONS: { value: SessionMindset; label: string; emoji: string }[] = [
  { value: 'eager', label: 'Eager', emoji: '🔥' },
  { value: 'receptive', label: 'Receptive', emoji: '💫' },
  { value: 'curious', label: 'Curious', emoji: '🤔' },
  { value: 'needy', label: 'Needy', emoji: '😩' },
  { value: 'calm', label: 'Calm', emoji: '😌' },
];

const PHYSICAL_OPTIONS: { value: PhysicalReadiness; label: string; emoji: string }[] = [
  { value: 'fresh', label: 'Fresh', emoji: '⚡' },
  { value: 'normal', label: 'Normal', emoji: '👍' },
  { value: 'tired', label: 'Tired', emoji: '😴' },
  { value: 'sensitive', label: 'Sensitive', emoji: '✨' },
];

const INTENSITY_OPTIONS: { value: 'gentle' | 'moderate' | 'intense'; label: string; description: string }[] = [
  { value: 'gentle', label: 'Gentle', description: 'Slow build, lower peaks' },
  { value: 'moderate', label: 'Moderate', description: 'Balanced intensity' },
  { value: 'intense', label: 'Intense', description: 'Aggressive patterns' },
];

export function EdgeSessionEntryFlow({
  anchors,
  canAccessReward,
  onStart,
  onClose,
  className = '',
}: EdgeSessionEntryFlowProps) {
  const { isBambiMode } = useBambiMode();
  const [currentStep, setCurrentStep] = useState<EntryStep>('anchor_check');

  // Anchor check state
  const [selectedAnchors, setSelectedAnchors] = useState<string[]>([]);

  // Pre-survey state
  const [arousalLevel, setArousalLevel] = useState(5);
  const [mindset, setMindset] = useState<SessionMindset>('receptive');
  const [physicalState, setPhysicalState] = useState<PhysicalReadiness>('normal');
  const [timeAvailable, setTimeAvailable] = useState(30);
  const [notes, setNotes] = useState('');

  // Mode select state
  const [sessionType, setSessionType] = useState<EdgeSessionType>('edge_training');
  const [goal, setGoal] = useState<SessionGoal>('edge_count');
  const [goalTarget, setGoalTarget] = useState<number>(5);
  const [patternMode, _setPatternMode] = useState<'auto' | 'manual' | 'ai_guided'>('auto');
  const [intensityPreference, setIntensityPreference] = useState<'gentle' | 'moderate' | 'intense'>('moderate');
  const [auctionEnabled, setAuctionEnabled] = useState(true);

  const activeAnchors = anchors.filter(a => a.isActive);
  const stepIndex = STEPS.indexOf(currentStep);

  const toggleAnchor = useCallback((anchorId: string) => {
    setSelectedAnchors(prev =>
      prev.includes(anchorId)
        ? prev.filter(id => id !== anchorId)
        : [...prev, anchorId]
    );
  }, []);

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'anchor_check':
        return selectedAnchors.length > 0;
      case 'pre_survey':
        return true;
      case 'mode_select':
        return true;
      case 'ready':
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const goBack = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const handleStart = () => {
    onStart({
      sessionType,
      goal,
      goalTarget: goal === 'edge_count' || goal === 'duration' ? goalTarget : undefined,
      activeAnchors: selectedAnchors,
      preArousalLevel: arousalLevel,
      mindset,
      physicalState,
      patternMode,
      intensityPreference,
      auctionEnabled,
      notes: notes.trim() || undefined,
    });
  };

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
          className={`sticky top-0 z-10 p-4 border-b ${
            isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-bg border-protocol-border'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Start Edge Session
            </h2>
            <button
              onClick={onClose}
              className={`p-2 rounded-full ${
                isBambiMode
                  ? 'hover:bg-pink-100 text-pink-400'
                  : 'hover:bg-protocol-surface text-protocol-text-muted'
              }`}
            >
              <span className="text-xl">&times;</span>
            </button>
          </div>

          {/* Progress Steps */}
          <div className="flex gap-2">
            {STEPS.map((step, i) => (
              <div
                key={step}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  i < stepIndex
                    ? isBambiMode
                      ? 'bg-pink-500'
                      : 'bg-protocol-accent'
                    : i === stepIndex
                      ? isBambiMode
                        ? 'bg-pink-400'
                        : 'bg-protocol-accent/70'
                      : isBambiMode
                        ? 'bg-pink-200'
                        : 'bg-protocol-surface-light'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* STEP 1: Anchor Check */}
          {currentStep === 'anchor_check' && (
            <AnchorCheckStep
              isBambiMode={isBambiMode}
              anchors={activeAnchors}
              selectedAnchors={selectedAnchors}
              onToggle={toggleAnchor}
            />
          )}

          {/* STEP 2: Pre-Survey */}
          {currentStep === 'pre_survey' && (
            <PreSurveyStep
              isBambiMode={isBambiMode}
              arousalLevel={arousalLevel}
              mindset={mindset}
              physicalState={physicalState}
              timeAvailable={timeAvailable}
              notes={notes}
              onSetArousalLevel={setArousalLevel}
              onSetMindset={setMindset}
              onSetPhysicalState={setPhysicalState}
              onSetTimeAvailable={setTimeAvailable}
              onSetNotes={setNotes}
            />
          )}

          {/* STEP 3: Mode Select */}
          {currentStep === 'mode_select' && (
            <ModeSelectStep
              isBambiMode={isBambiMode}
              sessionType={sessionType}
              goal={goal}
              goalTarget={goalTarget}
              intensityPreference={intensityPreference}
              auctionEnabled={auctionEnabled}
              canAccessReward={canAccessReward}
              onSetSessionType={setSessionType}
              onSetGoal={setGoal}
              onSetGoalTarget={setGoalTarget}
              onSetIntensityPreference={setIntensityPreference}
              onSetAuctionEnabled={setAuctionEnabled}
            />
          )}

          {/* STEP 4: Ready */}
          {currentStep === 'ready' && (
            <ReadyStep
              isBambiMode={isBambiMode}
              config={{
                sessionType,
                goal,
                goalTarget,
                activeAnchors: selectedAnchors,
                preArousalLevel: arousalLevel,
                mindset,
                physicalState,
                patternMode,
                intensityPreference,
                auctionEnabled,
                notes,
              }}
              anchors={anchors}
            />
          )}
        </div>

        {/* Navigation */}
        <div
          className={`sticky bottom-0 p-4 border-t ${
            isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-bg border-protocol-border'
          }`}
        >
          <div className="flex gap-3">
            {stepIndex > 0 && (
              <button
                onClick={goBack}
                className={`flex items-center gap-1 px-4 py-2.5 rounded-xl font-medium ${
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
              onClick={currentStep === 'ready' ? handleStart : goNext}
              disabled={!canProceed()}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                !canProceed()
                  ? isBambiMode
                    ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                    : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
                  : currentStep === 'ready'
                    ? isBambiMode
                      ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600'
                      : 'bg-gradient-to-r from-protocol-accent to-purple-600 text-white'
                    : isBambiMode
                      ? 'bg-pink-500 text-white hover:bg-pink-600'
                      : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
              }`}
            >
              {currentStep === 'ready' ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Begin Session</span>
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 1: Anchor Check
function AnchorCheckStep({
  isBambiMode,
  anchors,
  selectedAnchors,
  onToggle,
}: {
  isBambiMode: boolean;
  anchors: UserAnchor[];
  selectedAnchors: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <Anchor
          className={`w-12 h-12 mx-auto mb-3 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`}
        />
        <h3
          className={`text-xl font-medium ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          Check Your Anchors
        </h3>
        <p
          className={`text-sm mt-2 ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        >
          Select the sensory anchors you're using right now
        </p>
      </div>

      {anchors.length > 0 ? (
        <div className="flex flex-wrap gap-2 justify-center">
          {anchors.map((anchor) => (
            <AnchorBadge
              key={anchor.id}
              anchor={anchor}
              isSelected={selectedAnchors.includes(anchor.id)}
              onToggle={() => onToggle(anchor.id)}
            />
          ))}
        </div>
      ) : (
        <div
          className={`p-6 rounded-xl text-center ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
          }`}
        >
          <AlertCircle
            className={`w-8 h-8 mx-auto mb-2 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          />
          <p
            className={`text-sm ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          >
            No active anchors found
          </p>
          <p
            className={`text-xs mt-1 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            Add anchors in the Anchor Manager to enhance your sessions
          </p>
        </div>
      )}

      {selectedAnchors.length > 0 && (
        <p
          className={`text-center text-sm ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`}
        >
          {selectedAnchors.length} anchor{selectedAnchors.length !== 1 ? 's' : ''} ready
        </p>
      )}
    </div>
  );
}

// Step 2: Pre-Survey
function PreSurveyStep({
  isBambiMode,
  arousalLevel,
  mindset,
  physicalState,
  timeAvailable,
  notes,
  onSetArousalLevel,
  onSetMindset,
  onSetPhysicalState,
  onSetTimeAvailable,
  onSetNotes,
}: {
  isBambiMode: boolean;
  arousalLevel: number;
  mindset: SessionMindset;
  physicalState: PhysicalReadiness;
  timeAvailable: number;
  notes: string;
  onSetArousalLevel: (level: number) => void;
  onSetMindset: (mindset: SessionMindset) => void;
  onSetPhysicalState: (state: PhysicalReadiness) => void;
  onSetTimeAvailable: (time: number) => void;
  onSetNotes: (notes: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Arousal Level */}
      <div>
        <h4
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Current arousal level
        </h4>
        <div className="flex justify-between">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
            <button
              key={level}
              onClick={() => onSetArousalLevel(level)}
              className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                arousalLevel === level
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
          className={`flex justify-between text-xs mt-1 ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        >
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      {/* Mindset */}
      <div>
        <h4
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Current mindset
        </h4>
        <div className="flex flex-wrap gap-2">
          {MINDSET_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onSetMindset(option.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                mindset === option.value
                  ? isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                  : isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              {option.emoji} {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Physical State */}
      <div>
        <h4
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Physical state
        </h4>
        <div className="flex flex-wrap gap-2">
          {PHYSICAL_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onSetPhysicalState(option.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                physicalState === option.value
                  ? isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                  : isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              {option.emoji} {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time Available */}
      <div>
        <h4
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Time available
        </h4>
        <div className="flex gap-2">
          {[15, 30, 45, 60, 90].map((mins) => (
            <button
              key={mins}
              onClick={() => onSetTimeAvailable(mins)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                timeAvailable === mins
                  ? isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                  : isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              {mins}m
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label
          className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => onSetNotes(e.target.value)}
          placeholder="Intentions, focus areas, or anything on your mind..."
          rows={2}
          className={`w-full px-4 py-3 rounded-xl resize-none ${
            isBambiMode
              ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
              : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
          } outline-none transition-colors`}
        />
      </div>
    </div>
  );
}

// Step 3: Mode Select
function ModeSelectStep({
  isBambiMode,
  sessionType,
  goal,
  goalTarget,
  intensityPreference,
  auctionEnabled,
  canAccessReward,
  onSetSessionType,
  onSetGoal,
  onSetGoalTarget,
  onSetIntensityPreference,
  onSetAuctionEnabled,
}: {
  isBambiMode: boolean;
  sessionType: EdgeSessionType;
  goal: SessionGoal;
  goalTarget: number;
  intensityPreference: 'gentle' | 'moderate' | 'intense';
  auctionEnabled: boolean;
  canAccessReward: boolean;
  onSetSessionType: (type: EdgeSessionType) => void;
  onSetGoal: (goal: SessionGoal) => void;
  onSetGoalTarget: (target: number) => void;
  onSetIntensityPreference: (pref: 'gentle' | 'moderate' | 'intense') => void;
  onSetAuctionEnabled: (enabled: boolean) => void;
}) {
  const sessionTypes: EdgeSessionType[] = ['edge_training', 'denial', 'goon', 'anchoring', 'reward'];

  return (
    <div className="space-y-6">
      {/* Session Type */}
      <div>
        <h4
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Session type
        </h4>
        <div className="space-y-2">
          {sessionTypes.map((type) => {
            const isLocked = type === 'reward' && !canAccessReward;
            const isSelected = sessionType === type;

            return (
              <button
                key={type}
                onClick={() => !isLocked && onSetSessionType(type)}
                disabled={isLocked}
                className={`w-full flex items-center gap-4 p-3 rounded-xl text-left transition-all ${
                  isLocked
                    ? 'opacity-50 cursor-not-allowed'
                    : isSelected
                      ? isBambiMode
                        ? 'bg-pink-500 text-white'
                        : 'bg-protocol-accent text-white'
                      : isBambiMode
                        ? 'bg-pink-50 hover:bg-pink-100 border border-pink-200'
                        : 'bg-protocol-surface hover:bg-protocol-surface-light border border-protocol-border'
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    isSelected
                      ? 'bg-white/20'
                      : `bg-gradient-to-br ${SESSION_COLORS[type]} text-white`
                  }`}
                >
                  {SESSION_ICONS[type]}
                </div>
                <div className="flex-1">
                  <p
                    className={`font-medium ${
                      isSelected
                        ? 'text-white'
                        : isBambiMode
                          ? 'text-pink-700'
                          : 'text-protocol-text'
                    }`}
                  >
                    {type === 'edge_training' ? 'Edge Training' :
                     type === 'denial' ? 'Denial Practice' :
                     type === 'goon' ? 'Goon Session' :
                     type === 'anchoring' ? 'Anchoring' :
                     'Reward Session'}
                    {isLocked && ' (Locked)'}
                  </p>
                  <p
                    className={`text-xs ${
                      isSelected
                        ? 'text-white/80'
                        : isBambiMode
                          ? 'text-pink-400'
                          : 'text-protocol-text-muted'
                    }`}
                  >
                    {type === 'edge_training' ? 'Build edge count and control' :
                     type === 'denial' ? 'Tease and denial focused' :
                     type === 'goon' ? 'Extended trance session' :
                     type === 'anchoring' ? 'Strengthen conditioning' :
                     'Earned reward with climax option'}
                  </p>
                </div>
                {isSelected && <Check className="w-5 h-5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Goal Selection */}
      <div>
        <h4
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Session goal
        </h4>
        <div className="flex flex-wrap gap-2">
          {(['edge_count', 'duration', 'open_ended'] as SessionGoal[]).map((g) => (
            <button
              key={g}
              onClick={() => onSetGoal(g)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                goal === g
                  ? isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                  : isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              {g === 'edge_count' ? 'Edge Count' :
               g === 'duration' ? 'Duration' :
               'Open Ended'}
            </button>
          ))}
        </div>

        {/* Goal Target */}
        {(goal === 'edge_count' || goal === 'duration') && (
          <div className="mt-3 flex gap-2">
            {(goal === 'edge_count' ? [3, 5, 8, 10, 15] : [15, 30, 45, 60, 90]).map((target) => (
              <button
                key={target}
                onClick={() => onSetGoalTarget(target)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  goalTarget === target
                    ? isBambiMode
                      ? 'bg-pink-400 text-white'
                      : 'bg-protocol-accent/80 text-white'
                    : isBambiMode
                      ? 'bg-pink-50 text-pink-600'
                      : 'bg-protocol-surface-light text-protocol-text'
                }`}
              >
                {target}{goal === 'duration' ? 'm' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Intensity Preference */}
      <div>
        <h4
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Intensity preference
        </h4>
        <div className="grid grid-cols-3 gap-2">
          {INTENSITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onSetIntensityPreference(option.value)}
              className={`p-3 rounded-xl text-center transition-all ${
                intensityPreference === option.value
                  ? isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                  : isBambiMode
                    ? 'bg-pink-50 text-pink-600 hover:bg-pink-100'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              <p className="font-medium text-sm">{option.label}</p>
              <p
                className={`text-xs mt-0.5 ${
                  intensityPreference === option.value
                    ? 'text-white/80'
                    : isBambiMode
                      ? 'text-pink-400'
                      : 'text-protocol-text-muted'
                }`}
              >
                {option.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Auction Toggle */}
      <div
        className={`flex items-center justify-between p-4 rounded-xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}
      >
        <div>
          <p
            className={`font-medium ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Enable Auctions
          </p>
          <p
            className={`text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            Earn rewards by accepting commitments at edges
          </p>
        </div>
        <button
          onClick={() => onSetAuctionEnabled(!auctionEnabled)}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            auctionEnabled
              ? isBambiMode
                ? 'bg-pink-500'
                : 'bg-protocol-accent'
              : isBambiMode
                ? 'bg-pink-200'
                : 'bg-protocol-surface-light'
          }`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              auctionEnabled ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// Step 4: Ready
function ReadyStep({
  isBambiMode,
  config,
  anchors,
}: {
  isBambiMode: boolean;
  config: EdgeSessionConfig;
  anchors: UserAnchor[];
}) {
  const selectedAnchorNames = anchors
    .filter(a => config.activeAnchors.includes(a.id))
    .map(a => a.name);

  return (
    <div className="text-center py-6">
      <div
        className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center bg-gradient-to-br ${SESSION_COLORS[config.sessionType]}`}
      >
        {SESSION_ICONS[config.sessionType]}
        <div className="absolute">
          <span className="text-white text-2xl">
            {SESSION_ICONS[config.sessionType]}
          </span>
        </div>
      </div>

      <h3
        className={`text-xl font-bold mb-2 ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}
      >
        Ready to Begin
      </h3>

      {/* Summary */}
      <div
        className={`mt-6 p-4 rounded-xl text-left ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}
      >
        <div className="space-y-2 text-sm">
          <SummaryRow
            label="Session"
            value={config.sessionType === 'edge_training' ? 'Edge Training' :
                   config.sessionType === 'denial' ? 'Denial Practice' :
                   config.sessionType === 'goon' ? 'Goon Session' :
                   config.sessionType === 'anchoring' ? 'Anchoring' :
                   'Reward Session'}
            isBambiMode={isBambiMode}
          />
          <SummaryRow
            label="Goal"
            value={config.goal === 'edge_count' ? `${config.goalTarget} edges` :
                   config.goal === 'duration' ? `${config.goalTarget} minutes` :
                   'Open ended'}
            isBambiMode={isBambiMode}
          />
          <SummaryRow
            label="Intensity"
            value={config.intensityPreference.charAt(0).toUpperCase() + config.intensityPreference.slice(1)}
            isBambiMode={isBambiMode}
          />
          <SummaryRow
            label="Arousal"
            value={`${config.preArousalLevel}/10`}
            isBambiMode={isBambiMode}
          />
          <SummaryRow
            label="Anchors"
            value={selectedAnchorNames.join(', ') || 'None'}
            isBambiMode={isBambiMode}
          />
          {config.auctionEnabled && (
            <SummaryRow
              label="Auctions"
              value="Enabled"
              isBambiMode={isBambiMode}
            />
          )}
        </div>
      </div>

      <p
        className={`mt-6 text-sm ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`}
      >
        Take a deep breath. Feel your anchors. Begin when ready.
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  isBambiMode,
}: {
  label: string;
  value: string;
  isBambiMode: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span
        className={`${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}
      >
        {label}
      </span>
      <span
        className={`font-medium ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
