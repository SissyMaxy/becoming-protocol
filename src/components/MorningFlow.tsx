import { useState, useEffect } from 'react';
import { Intensity } from '../types';
import { INTENSITY_CONFIG, PHASES } from '../data/constants';
import { useProtocol } from '../context/ProtocolContext';
import { profileStorage, storage } from '../lib/storage';
import { useAuth } from '../context/AuthContext';
import { useUserState } from '../hooks/useUserState';
import { supabase } from '../lib/supabase';
import { Flame, Sparkles, Leaf, ArrowRight, Loader2, AlertTriangle, Star, TrendingUp, Info, Heart } from 'lucide-react';
import { StreakBreakModal } from './SkipConfirmModal';
import { getMorningPersonalization, type MorningPersonalization } from '../lib/morning-personalization';
import { HandlerStatusBriefing } from './handler/HandlerStatusBriefing';

interface MorningFlowProps {
  onComplete: () => void;
}

const intensityIcons = {
  spacious: Leaf,
  normal: Sparkles,
  crazy: Flame
};

const intensityDescriptions = {
  spacious: 'Got time today. Let\'s do the full thing.',
  normal: 'A regular day. The core stuff, done well.',
  crazy: 'Life\'s hectic. Just the basics, no guilt.'
};

export function MorningFlow({ onComplete }: MorningFlowProps) {
  const { user } = useAuth();
  const { startDay, progress } = useProtocol();
  const { userState } = useUserState();
  const [selectedIntensity, setSelectedIntensity] = useState<Intensity | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [personalization, setPersonalization] = useState<MorningPersonalization | null>(null);
  const [_isLoadingPersonalization, setIsLoadingPersonalization] = useState(true);
  const [showInsight, setShowInsight] = useState(false);
  const [showTherapistSuggestion, setShowTherapistSuggestion] = useState(false);

  // Streak break detection state
  const [showStreakBreakModal, setShowStreakBreakModal] = useState(false);
  const [streakBreakInfo, setStreakBreakInfo] = useState<{
    daysMissed: number;
    previousStreak: number;
  } | null>(null);

  // Load user's name and personalization
  useEffect(() => {
    async function loadData() {
      const profile = await profileStorage.getProfile();
      setUserName(profile?.preferredName || null);

      // Load personalization if user is authenticated
      if (user?.id) {
        try {
          const data = await getMorningPersonalization(user.id);
          setPersonalization(data);
          // Pre-select recommended intensity
          if (data.intensityRecommendation.recommended) {
            setSelectedIntensity(data.intensityRecommendation.recommended);
          }
        } catch (err) {
          console.error('Failed to load personalization:', err);
        }
      }
      setIsLoadingPersonalization(false);
    }
    loadData();
  }, [user?.id]);

  // Check for prolonged low mood - suggest therapist (gap #13)
  useEffect(() => {
    async function checkMoodHistory() {
      if (!user?.id) return;

      try {
        // Get last 3 days of mood check-ins
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const { data: moods } = await supabase
          .from('mood_checkins')
          .select('score')
          .eq('user_id', user.id)
          .gte('created_at', threeDaysAgo.toISOString())
          .order('created_at', { ascending: false });

        if (moods && moods.length >= 3) {
          const avgMood = moods.reduce((sum, m) => sum + (m.score || 0), 0) / moods.length;
          // Average mood below 4/10 for 3+ check-ins = suggest therapist
          if (avgMood < 4) {
            setShowTherapistSuggestion(true);
          }
        }
      } catch {
        // Silently fail
      }
    }
    checkMoodHistory();
  }, [user?.id]);

  // Override to caretaker intensity when depleted (gap #13)
  useEffect(() => {
    if (userState?.estimatedExecFunction === 'depleted' || userState?.odometer === 'survival') {
      setSelectedIntensity('crazy'); // "crazy" = minimal/hectic = lowest demand
    }
  }, [userState?.estimatedExecFunction, userState?.odometer]);

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

  // Get personalized greeting or fallback
  const greetingText = personalization?.greeting.salutation || 'Good Morning';
  const personalAddress = personalization?.greeting.personalAddress || userName || '';
  const subtext = personalization?.greeting.subtext || 'What kind of day is it?';
  const hasWarnings = personalization?.warnings && personalization.warnings.length > 0;
  const hasOpportunities = personalization?.opportunities && personalization.opportunities.length > 0;

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
      <div className="max-w-md w-full space-y-6 animate-slide-up">
        {/* Header - Personalized */}
        <div className="text-center space-y-3">
          <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center border ${
            personalization?.greeting.mood === 'celebratory'
              ? 'bg-amber-500/20 border-amber-500/30'
              : personalization?.greeting.mood === 'gentle'
              ? 'bg-blue-500/20 border-blue-500/30'
              : 'bg-protocol-surface border-protocol-border'
          }`}>
            {personalization?.greeting.mood === 'celebratory' ? (
              <Star className="w-8 h-8 text-amber-400" />
            ) : personalization?.greeting.mood === 'energizing' ? (
              <TrendingUp className="w-8 h-8 text-green-400" />
            ) : (
              <Sparkles className="w-8 h-8 text-protocol-accent" />
            )}
          </div>
          <h1 className="text-2xl font-semibold text-protocol-text">
            {greetingText}{personalAddress ? `, ${personalAddress}` : ''}
          </h1>
          <p className="text-protocol-text-muted text-sm">
            {subtext}
          </p>
        </div>

        {/* Warnings Banner */}
        {hasWarnings && (
          <div className="space-y-2">
            {personalization?.warnings.slice(0, 2).map((warning, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg flex items-start gap-3 ${
                  warning.severity === 'warning'
                    ? 'bg-red-500/10 border border-red-500/20'
                    : warning.severity === 'caution'
                    ? 'bg-amber-500/10 border border-amber-500/20'
                    : 'bg-blue-500/10 border border-blue-500/20'
                }`}
              >
                <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                  warning.severity === 'warning'
                    ? 'text-red-400'
                    : warning.severity === 'caution'
                    ? 'text-amber-400'
                    : 'text-blue-400'
                }`} />
                <div>
                  <p className={`text-sm font-medium ${
                    warning.severity === 'warning'
                      ? 'text-red-400'
                      : warning.severity === 'caution'
                      ? 'text-amber-400'
                      : 'text-blue-400'
                  }`}>
                    {warning.title}
                  </p>
                  <p className="text-xs text-protocol-text-muted mt-0.5">
                    {warning.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Handler Status Briefing — status report format */}
        <HandlerStatusBriefing />

        {/* Morning Insight Card */}
        {personalization?.insight && (
          <button
            onClick={() => setShowInsight(!showInsight)}
            className="w-full card p-4 text-left hover:border-protocol-accent transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-protocol-text-muted uppercase tracking-wider">
                Today's Insight
              </p>
              <Info className="w-4 h-4 text-protocol-text-muted" />
            </div>
            <p className="text-sm text-protocol-text">
              {personalization.insight.description}
            </p>
            {showInsight && personalization.motivationalMessage && (
              <p className="text-xs text-protocol-accent mt-3 italic">
                "{personalization.motivationalMessage}"
              </p>
            )}
          </button>
        )}

        {/* Quick Stats Row */}
        {personalization?.quickStats && (
          <div className="grid grid-cols-3 gap-2">
            <div className="card p-3 text-center">
              <p className="text-lg font-bold text-protocol-text">
                {personalization.quickStats.currentStreak}
              </p>
              <p className="text-[10px] text-protocol-text-muted">Day Streak</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-lg font-bold text-protocol-text">
                {personalization.quickStats.tasksCompletedYesterday}
              </p>
              <p className="text-[10px] text-protocol-text-muted">Yesterday</p>
            </div>
            {personalization.quickStats.nextMilestone && (
              <div className="card p-3 text-center">
                <p className="text-lg font-bold text-protocol-accent">
                  {personalization.quickStats.nextMilestone.daysAway}
                </p>
                <p className="text-[10px] text-protocol-text-muted">
                  {personalization.quickStats.nextMilestone.type.slice(0, 10)}
                </p>
              </div>
            )}
          </div>
        )}

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
          <div className="flex items-center justify-between">
            <p className="text-sm text-protocol-text-muted">
              How much space do you have today?
            </p>
            {personalization?.intensityRecommendation && (
              <span className="text-xs text-protocol-accent">
                Suggested: {INTENSITY_CONFIG[personalization.intensityRecommendation.recommended].label}
              </span>
            )}
          </div>

          {(['spacious', 'normal', 'crazy'] as Intensity[]).map((intensity) => {
            const config = INTENSITY_CONFIG[intensity];
            const Icon = intensityIcons[intensity];
            const isSelected = selectedIntensity === intensity;
            const isRecommended = personalization?.intensityRecommendation.recommended === intensity;

            return (
              <button
                key={intensity}
                onClick={() => setSelectedIntensity(intensity)}
                className={`w-full p-4 rounded-lg border transition-all duration-200 text-left ${
                  isSelected
                    ? 'border-protocol-accent bg-protocol-accent/10'
                    : isRecommended
                    ? 'border-protocol-accent/50 bg-protocol-surface hover:border-protocol-accent'
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
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-protocol-text">
                        {config.label}
                      </p>
                      {isRecommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-protocol-accent/20 text-protocol-accent">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-protocol-text-muted mt-0.5">
                      {intensityDescriptions[intensity]}
                    </p>
                    {isRecommended && isSelected && personalization?.intensityRecommendation.reason && (
                      <p className="text-xs text-protocol-accent mt-1">
                        {personalization.intensityRecommendation.reason}
                      </p>
                    )}
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

        {/* Opportunities */}
        {hasOpportunities && personalization?.opportunities.length && personalization.opportunities.length > 0 && (
          <div className="card p-4">
            <p className="text-xs text-protocol-text-muted uppercase tracking-wider mb-2">
              Today's Opportunities
            </p>
            <div className="space-y-2">
              {personalization.opportunities.slice(0, 2).map((opp, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <Star className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-protocol-text">{opp.title}</p>
                    <p className="text-xs text-protocol-text-muted">{opp.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Therapist suggestion for prolonged low mood (gap #13) */}
        {showTherapistSuggestion && (
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <Heart className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-300">
                  We've noticed you've been feeling low recently.
                </p>
                <p className="text-xs text-blue-400/70 mt-1">
                  There's no shame in reaching out. Consider talking to a therapist or counselor —
                  you deserve support that goes beyond what this app can offer.
                </p>
                <button
                  onClick={() => setShowTherapistSuggestion(false)}
                  className="text-xs text-blue-400 mt-2 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Caretaker mode notice */}
        {(userState?.estimatedExecFunction === 'depleted' || userState?.odometer === 'survival') && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <p className="text-sm text-green-300">
              Take it easy today. Just showing up counts.
            </p>
          </div>
        )}

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
              Getting things ready...
            </>
          ) : (
            <>
              Start My Day
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
