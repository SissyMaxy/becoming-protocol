// SessionCompletionFlow.tsx
// Post-session completion flow with summary, feedback, and rewards

import { useState, useEffect } from 'react';
import {
  Sparkles,
  Star,
  Heart,
  Target,
  Clock,
  TrendingUp,
  Award,
  Gift,
  ChevronRight,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { BidCard } from './AuctionModal';
import type { SessionSummary, PostSurveyInput } from '../../types/edge-session';
import type { UserAnchor } from '../../types/rewards';

interface SessionCompletionFlowProps {
  summary: SessionSummary;
  anchors: UserAnchor[];
  onComplete: (feedback: PostSurveyInput) => void;
  onClose: () => void;
  className?: string;
}

type CompletionStep = 'cooldown' | 'summary' | 'feedback' | 'rewards';

const STEPS: CompletionStep[] = ['cooldown', 'summary', 'feedback', 'rewards'];

export function SessionCompletionFlow({
  summary,
  anchors,
  onComplete,
  onClose: _onClose,
  className = '',
}: SessionCompletionFlowProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [currentStep, setCurrentStep] = useState<CompletionStep>('cooldown');
  const [cooldownSeconds, setCooldownSeconds] = useState(10);

  // Feedback state
  const [postArousalLevel, setPostArousalLevel] = useState(5);
  const [experienceRating, setExperienceRating] = useState(4);
  const [anchorEffectiveness, setAnchorEffectiveness] = useState(3);
  const [whatWorked, setWhatWorked] = useState('');
  const [whatToImprove, setWhatToImprove] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');

  // Animation states
  const [showPointsAnimation, setShowPointsAnimation] = useState(false);
  const [animatedPoints, setAnimatedPoints] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (currentStep !== 'cooldown') return;

    const timer = setInterval(() => {
      setCooldownSeconds(s => {
        if (s <= 1) {
          clearInterval(timer);
          setCurrentStep('summary');
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentStep]);

  // Points animation
  useEffect(() => {
    if (currentStep !== 'rewards') return;

    setShowPointsAnimation(true);
    let current = 0;
    const target = summary.totalPoints;
    const increment = Math.ceil(target / 30);

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setAnimatedPoints(target);
        clearInterval(timer);
        if (isBambiMode) {
          triggerHearts();
        }
      } else {
        setAnimatedPoints(current);
      }
    }, 50);

    return () => clearInterval(timer);
  }, [currentStep, summary.totalPoints, isBambiMode, triggerHearts]);

  const goNext = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1]);
    }
  };

  const handleComplete = () => {
    onComplete({
      postArousalLevel,
      experienceRating,
      anchorEffectiveness: summary.anchorsUsed.length > 0 ? anchorEffectiveness : undefined,
      whatWorked: whatWorked.trim() || undefined,
      whatToImprove: whatToImprove.trim() || undefined,
      privateNotes: privateNotes.trim() || undefined,
    });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const usedAnchors = anchors.filter(a => summary.anchorsUsed.includes(a.id));

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 ${className}`}>
      <div
        className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* COOLDOWN STEP */}
        {currentStep === 'cooldown' && (
          <CooldownStep
            isBambiMode={isBambiMode}
            secondsRemaining={cooldownSeconds}
            onSkip={() => setCurrentStep('summary')}
          />
        )}

        {/* SUMMARY STEP */}
        {currentStep === 'summary' && (
          <SummaryStep
            isBambiMode={isBambiMode}
            summary={summary}
            usedAnchors={usedAnchors}
            formatTime={formatTime}
            onNext={goNext}
          />
        )}

        {/* FEEDBACK STEP */}
        {currentStep === 'feedback' && (
          <FeedbackStep
            isBambiMode={isBambiMode}
            postArousalLevel={postArousalLevel}
            experienceRating={experienceRating}
            anchorEffectiveness={anchorEffectiveness}
            whatWorked={whatWorked}
            whatToImprove={whatToImprove}
            privateNotes={privateNotes}
            hasAnchors={summary.anchorsUsed.length > 0}
            onSetArousalLevel={setPostArousalLevel}
            onSetExperienceRating={setExperienceRating}
            onSetAnchorEffectiveness={setAnchorEffectiveness}
            onSetWhatWorked={setWhatWorked}
            onSetWhatToImprove={setWhatToImprove}
            onSetPrivateNotes={setPrivateNotes}
            onNext={goNext}
          />
        )}

        {/* REWARDS STEP */}
        {currentStep === 'rewards' && (
          <RewardsStep
            isBambiMode={isBambiMode}
            summary={summary}
            animatedPoints={animatedPoints}
            showAnimation={showPointsAnimation}
            onComplete={handleComplete}
          />
        )}
      </div>
    </div>
  );
}

// Cooldown Step
function CooldownStep({
  isBambiMode,
  secondsRemaining,
  onSkip,
}: {
  isBambiMode: boolean;
  secondsRemaining: number;
  onSkip: () => void;
}) {
  return (
    <div className="p-8 text-center">
      <div
        className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${
          isBambiMode
            ? 'bg-gradient-to-r from-pink-400 to-purple-400'
            : 'bg-gradient-to-r from-indigo-500 to-purple-500'
        }`}
      >
        <Heart className="w-12 h-12 text-white animate-pulse" />
      </div>

      <h2
        className={`text-2xl font-bold mb-2 ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}
      >
        Breathe...
      </h2>

      <p
        className={`text-sm mb-6 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}
      >
        Let your body settle. Feel what you've accomplished.
      </p>

      <p
        className={`text-4xl font-mono font-bold mb-8 ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
        }`}
      >
        {secondsRemaining}
      </p>

      <button
        onClick={onSkip}
        className={`text-sm ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        } hover:underline`}
      >
        Skip cooldown
      </button>
    </div>
  );
}

// Summary Step
function SummaryStep({
  isBambiMode,
  summary,
  usedAnchors,
  formatTime,
  onNext,
}: {
  isBambiMode: boolean;
  summary: SessionSummary;
  usedAnchors: UserAnchor[];
  formatTime: (seconds: number) => string;
  onNext: () => void;
}) {
  return (
    <div className="p-6">
      <div className="text-center mb-6">
        <Sparkles
          className={`w-12 h-12 mx-auto mb-3 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`}
        />
        <h2
          className={`text-2xl font-bold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          Session Complete!
        </h2>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Duration"
          value={formatTime(summary.totalDuration)}
          isBambiMode={isBambiMode}
        />
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="Edges"
          value={summary.edgeCount.toString()}
          isBambiMode={isBambiMode}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Peak Intensity"
          value={`${summary.peakIntensity}/20`}
          isBambiMode={isBambiMode}
        />
        <StatCard
          icon={<Heart className="w-5 h-5" />}
          label="Avg Intensity"
          value={summary.averageIntensity.toString()}
          isBambiMode={isBambiMode}
        />
      </div>

      {/* Commitments Made */}
      {summary.bidsAccepted.length > 0 && (
        <div className="mb-6">
          <h3
            className={`text-sm font-medium mb-3 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          >
            Commitments Made
          </h3>
          <div className="space-y-2">
            {summary.bidsAccepted.map((bid) => (
              <BidCard key={bid.id} bid={bid} compact />
            ))}
          </div>
        </div>
      )}

      {/* Anchors Used */}
      {usedAnchors.length > 0 && (
        <div className="mb-6">
          <h3
            className={`text-sm font-medium mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          >
            Anchors Used
          </h3>
          <div className="flex flex-wrap gap-2">
            {usedAnchors.map((anchor) => (
              <span
                key={anchor.id}
                className={`px-3 py-1 rounded-full text-sm ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-600'
                    : 'bg-protocol-surface text-protocol-text'
                }`}
              >
                {anchor.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onNext}
        className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
          isBambiMode
            ? 'bg-pink-500 text-white hover:bg-pink-600'
            : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
        }`}
      >
        <span>Continue</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// Feedback Step
function FeedbackStep({
  isBambiMode,
  postArousalLevel,
  experienceRating,
  anchorEffectiveness,
  whatWorked,
  whatToImprove: _whatToImprove,
  privateNotes,
  hasAnchors,
  onSetArousalLevel,
  onSetExperienceRating,
  onSetAnchorEffectiveness,
  onSetWhatWorked,
  onSetWhatToImprove: _onSetWhatToImprove,
  onSetPrivateNotes,
  onNext,
}: {
  isBambiMode: boolean;
  postArousalLevel: number;
  experienceRating: number;
  anchorEffectiveness: number;
  whatWorked: string;
  whatToImprove: string;
  privateNotes: string;
  hasAnchors: boolean;
  onSetArousalLevel: (level: number) => void;
  onSetExperienceRating: (rating: number) => void;
  onSetAnchorEffectiveness: (effectiveness: number) => void;
  onSetWhatWorked: (text: string) => void;
  onSetWhatToImprove: (text: string) => void;
  onSetPrivateNotes: (notes: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="p-6">
      <h2
        className={`text-lg font-semibold mb-6 ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}
      >
        How was your session?
      </h2>

      {/* Post Arousal Level */}
      <div className="mb-6">
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
                postArousalLevel === level
                  ? isBambiMode
                    ? 'bg-pink-500 text-white scale-110'
                    : 'bg-protocol-accent text-white scale-110'
                  : isBambiMode
                    ? 'bg-pink-100 text-pink-600'
                    : 'bg-protocol-surface text-protocol-text'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Experience Rating */}
      <div className="mb-6">
        <h4
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Overall experience
        </h4>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              onClick={() => onSetExperienceRating(rating)}
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                experienceRating >= rating
                  ? isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                  : isBambiMode
                    ? 'bg-pink-100 text-pink-400'
                    : 'bg-protocol-surface text-protocol-text-muted'
              }`}
            >
              <Star className="w-6 h-6 fill-current" />
            </button>
          ))}
        </div>
      </div>

      {/* Anchor Effectiveness */}
      {hasAnchors && (
        <div className="mb-6">
          <h4
            className={`text-sm font-medium mb-3 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          >
            Anchor effectiveness
          </h4>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                onClick={() => onSetAnchorEffectiveness(rating)}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  anchorEffectiveness >= rating
                    ? isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-accent text-white'
                    : isBambiMode
                      ? 'bg-pink-100 text-pink-400'
                      : 'bg-protocol-surface text-protocol-text-muted'
                }`}
              >
                <Heart className="w-5 h-5 fill-current" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* What worked */}
      <div className="mb-4">
        <label
          className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          What worked well? (optional)
        </label>
        <textarea
          value={whatWorked}
          onChange={(e) => onSetWhatWorked(e.target.value)}
          placeholder="Patterns, timing, intensity levels..."
          rows={2}
          className={`w-full px-4 py-3 rounded-xl resize-none ${
            isBambiMode
              ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
              : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
          } outline-none`}
        />
      </div>

      {/* Private notes */}
      <div className="mb-6">
        <label
          className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Private notes (optional)
        </label>
        <textarea
          value={privateNotes}
          onChange={(e) => onSetPrivateNotes(e.target.value)}
          placeholder="Insights, feelings, breakthroughs..."
          rows={2}
          className={`w-full px-4 py-3 rounded-xl resize-none ${
            isBambiMode
              ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
              : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
          } outline-none`}
        />
      </div>

      <button
        onClick={onNext}
        className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
          isBambiMode
            ? 'bg-pink-500 text-white hover:bg-pink-600'
            : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
        }`}
      >
        <span>See Rewards</span>
        <Gift className="w-4 h-4" />
      </button>
    </div>
  );
}

// Rewards Step
function RewardsStep({
  isBambiMode,
  summary,
  animatedPoints,
  showAnimation,
  onComplete,
}: {
  isBambiMode: boolean;
  summary: SessionSummary;
  animatedPoints: number;
  showAnimation: boolean;
  onComplete: () => void;
}) {
  return (
    <div className="p-6 text-center">
      <div
        className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${
          isBambiMode
            ? 'bg-gradient-to-r from-pink-400 to-purple-500'
            : 'bg-gradient-to-r from-protocol-accent to-purple-600'
        }`}
      >
        <Award className="w-12 h-12 text-white" />
      </div>

      <h2
        className={`text-2xl font-bold mb-2 ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}
      >
        Points Earned!
      </h2>

      {/* Animated Points Display */}
      <p
        className={`text-5xl font-bold mb-6 transition-all ${
          showAnimation ? 'scale-110' : 'scale-100'
        } ${isBambiMode ? 'text-pink-600' : 'text-protocol-accent'}`}
      >
        +{animatedPoints}
      </p>

      {/* Points Breakdown */}
      <div
        className={`rounded-xl p-4 mb-6 text-left ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}
      >
        <h3
          className={`text-sm font-medium mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}
        >
          Breakdown
        </h3>
        <div className="space-y-2 text-sm">
          <BreakdownRow
            label="Session complete"
            value={50}
            isBambiMode={isBambiMode}
          />
          <BreakdownRow
            label={`${summary.edgeCount} edges`}
            value={summary.edgeCount * 10}
            isBambiMode={isBambiMode}
          />
          {summary.bidsAccepted.length > 0 && (
            <BreakdownRow
              label={`${summary.bidsAccepted.length} commitment${summary.bidsAccepted.length > 1 ? 's' : ''}`}
              value={summary.bidsAccepted.length * 15}
              isBambiMode={isBambiMode}
            />
          )}
          {summary.streakMultiplier > 1 && (
            <BreakdownRow
              label={`Streak bonus (${summary.streakMultiplier}x)`}
              value={summary.bonusPoints}
              isBambiMode={isBambiMode}
              isBonus
            />
          )}
          <div
            className={`pt-2 mt-2 border-t flex justify-between font-medium ${
              isBambiMode ? 'border-pink-200 text-pink-700' : 'border-protocol-border text-protocol-text'
            }`}
          >
            <span>Total</span>
            <span>+{summary.totalPoints}</span>
          </div>
        </div>
      </div>

      {/* Achievements */}
      {summary.newAchievements.length > 0 && (
        <div className="mb-6">
          <h3
            className={`text-sm font-medium mb-3 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          >
            Achievements Unlocked!
          </h3>
          <div className="flex flex-wrap justify-center gap-2">
            {summary.newAchievements.map((achievement) => (
              <span
                key={achievement}
                className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${
                  isBambiMode
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-yellow-900/20 text-yellow-500'
                }`}
              >
                <Award className="w-4 h-4" />
                {achievement}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onComplete}
        className={`w-full py-3 rounded-xl font-medium ${
          isBambiMode
            ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
            : 'bg-gradient-to-r from-protocol-accent to-purple-600 text-white'
        }`}
      >
        Done
      </button>
    </div>
  );
}

// Helper Components
function StatCard({
  icon,
  label,
  value,
  isBambiMode,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isBambiMode: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-xl ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}
    >
      <div
        className={`flex items-center gap-2 mb-1 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`}
      >
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p
        className={`text-xl font-bold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  isBambiMode,
  isBonus = false,
}: {
  label: string;
  value: number;
  isBambiMode: boolean;
  isBonus?: boolean;
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
        className={`${
          isBonus
            ? 'text-green-500'
            : isBambiMode
              ? 'text-pink-700'
              : 'text-protocol-text'
        }`}
      >
        +{value}
      </span>
    </div>
  );
}
