import { useState, useEffect } from 'react';
import { Intensity } from '../types';
import { INTENSITY_CONFIG, PHASES } from '../data/constants';
import { useProtocol } from '../context/ProtocolContext';
import { profileStorage, storage } from '../lib/storage';
import { Flame, Sparkles, Leaf, ArrowRight, Loader2 } from 'lucide-react';
import { StreakBreakModal } from './SkipConfirmModal';

interface MorningFlowProps {
  onComplete: () => void;
}

const intensityIcons = {
  spacious: Leaf,
  normal: Sparkles,
  crazy: Flame
};

const intensityDescriptions = {
  spacious: 'Full protocol, maximum growth. For days when you have time to invest in yourself.',
  normal: 'Balanced practice. Core habits with meaningful depth.',
  crazy: 'Busy day. Just the essentials, with self-compassion.'
};

export function MorningFlow({ onComplete }: MorningFlowProps) {
  const { startDay, progress } = useProtocol();
  const [selectedIntensity, setSelectedIntensity] = useState<Intensity | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  // Streak break detection state
  const [showStreakBreakModal, setShowStreakBreakModal] = useState(false);
  const [streakBreakInfo, setStreakBreakInfo] = useState<{
    daysMissed: number;
    previousStreak: number;
  } | null>(null);

  // Load user's name for personalized greeting
  useEffect(() => {
    async function loadProfile() {
      const profile = await profileStorage.getProfile();
      setUserName(profile?.preferredName || null);
    }
    loadProfile();
  }, []);

  // Check for missed days (streak break detection)
  useEffect(() => {
    async function checkForStreakBreak() {
      // Get all entries to find the most recent one
      const entries = await storage.getAllEntries();
      if (entries.length === 0) {
        // First time user, no streak break possible
        return;
      }

      // Entries are sorted by date descending, so first one is most recent
      const lastEntryDate = entries[0].date;
      const today = new Date().toISOString().split('T')[0];

      // Calculate days since last entry
      const lastDate = new Date(lastEntryDate);
      const todayDate = new Date(today);
      const diffTime = todayDate.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // If more than 1 day has passed (yesterday was missed), it's a streak break
      // But only show if they had a streak to break (previousStreak > 0)
      if (diffDays > 1 && progress.overallStreak > 0) {
        const daysMissed = diffDays - 1; // Don't count today
        const previousStreak = progress.overallStreak;

        setStreakBreakInfo({
          daysMissed,
          previousStreak,
        });
        setShowStreakBreakModal(true);
      }
    }

    checkForStreakBreak();
  }, [progress.overallStreak]);

  const handleStart = async () => {
    if (!selectedIntensity) return;

    setIsStarting(true);
    try {
      await startDay(selectedIntensity);
      onComplete();
    } catch (error) {
      console.error('Failed to start day:', error);
    } finally {
      setIsStarting(false);
    }
  };

  const currentPhase = PHASES.find(p => p.phase === progress.phase.currentPhase);

  const handleStreakBreakAcknowledge = () => {
    setShowStreakBreakModal(false);
    setStreakBreakInfo(null);
  };

  return (
    <div className="min-h-screen bg-protocol-bg flex flex-col items-center justify-center p-6">
      {/* Streak Break Modal */}
      {showStreakBreakModal && streakBreakInfo && (
        <StreakBreakModal
          daysMissed={streakBreakInfo.daysMissed}
          previousStreak={streakBreakInfo.previousStreak}
          onAcknowledge={handleStreakBreakAcknowledge}
        />
      )}
      <div className="max-w-md w-full space-y-8 animate-slide-up">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto bg-protocol-surface rounded-full flex items-center justify-center border border-protocol-border">
            <Sparkles className="w-8 h-8 text-protocol-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-protocol-text">
            Good Morning{userName ? `, ${userName}` : ''}
          </h1>
          <p className="text-protocol-text-muted text-sm">
            Set your intention for today
          </p>
        </div>

        {/* Phase indicator */}
        <div className="card p-4 text-center">
          <p className="text-xs text-protocol-text-muted uppercase tracking-wider mb-1">
            Current Phase
          </p>
          <p className="text-lg font-medium text-gradient">
            {currentPhase?.name || 'Foundation'}
          </p>
          <p className="text-xs text-protocol-text-muted mt-1">
            Day {progress.phase.daysInPhase + 1}
          </p>
        </div>

        {/* Intensity selection */}
        <div className="space-y-3">
          <p className="text-sm text-protocol-text-muted text-center">
            How much space do you have today?
          </p>

          {(['spacious', 'normal', 'crazy'] as Intensity[]).map((intensity) => {
            const config = INTENSITY_CONFIG[intensity];
            const Icon = intensityIcons[intensity];
            const isSelected = selectedIntensity === intensity;

            return (
              <button
                key={intensity}
                onClick={() => setSelectedIntensity(intensity)}
                className={`w-full p-4 rounded-lg border transition-all duration-200 text-left ${
                  isSelected
                    ? 'border-protocol-accent bg-protocol-accent/10'
                    : 'border-protocol-border bg-protocol-surface hover:border-protocol-text-muted'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      isSelected ? 'bg-protocol-accent/20' : 'bg-protocol-surface-light'
                    }`}
                    style={{ color: config.color }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-protocol-text">
                      {config.label}
                    </p>
                    <p className="text-xs text-protocol-text-muted mt-0.5">
                      {intensityDescriptions[intensity]}
                    </p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected
                        ? 'border-protocol-accent bg-protocol-accent'
                        : 'border-protocol-border'
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 bg-white rounded-full" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!selectedIntensity || isStarting}
          className={`w-full py-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-200 ${
            selectedIntensity
              ? 'bg-protocol-accent hover:bg-protocol-accent-soft text-white'
              : 'bg-protocol-surface border border-protocol-border text-protocol-text-muted cursor-not-allowed'
          }`}
        >
          {isStarting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating Protocol...
            </>
          ) : (
            <>
              Begin Protocol
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>

        {/* Streak info */}
        {progress.overallStreak > 0 && (
          <p className="text-center text-sm text-protocol-text-muted">
            <span className="text-protocol-accent font-medium">
              {progress.overallStreak} day streak
            </span>
            {' '}— keep it going!
          </p>
        )}
      </div>
    </div>
  );
}
