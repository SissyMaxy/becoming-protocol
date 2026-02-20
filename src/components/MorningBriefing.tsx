/**
 * MorningBriefing — Daily first-open briefing screen.
 * Replaces MorningFlow with a streamlined layout:
 * Greeting → HandlerStatusBriefing → QuickStateStrip → Intensity → Start Today
 */

import { useState, useEffect } from 'react';
import { Intensity } from '../types';
import { INTENSITY_CONFIG } from '../data/constants';
import { useProtocol } from '../context/ProtocolContext';
import { useBambiMode } from '../context/BambiModeContext';
import { profileStorage, storage } from '../lib/storage';
import { useAuth } from '../context/AuthContext';
import { useUserState } from '../hooks/useUserState';
import { supabase } from '../lib/supabase';
import { Flame, Sparkles, Leaf, ArrowRight, Loader2, AlertTriangle, Heart, Star, TrendingUp } from 'lucide-react';
import { StreakBreakModal } from './SkipConfirmModal';
import { getMorningPersonalization, type MorningPersonalization } from '../lib/morning-personalization';
import { HandlerStatusBriefing } from './handler/HandlerStatusBriefing';
import { QuickStateStrip } from './today/QuickStateStrip';

interface MorningBriefingProps {
  onComplete: () => void;
}

const intensityIcons: Record<Intensity, React.ElementType> = {
  spacious: Leaf,
  normal: Sparkles,
  crazy: Flame,
};

const intensityLabels: Record<Intensity, string> = {
  spacious: 'Spacious',
  normal: 'Normal',
  crazy: 'Hectic',
};

export function MorningBriefing({ onComplete }: MorningBriefingProps) {
  const { user } = useAuth();
  const { startDay, progress } = useProtocol();
  const { userState, quickUpdate } = useUserState();
  const { isBambiMode } = useBambiMode();
  const [selectedIntensity, setSelectedIntensity] = useState<Intensity | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [personalization, setPersonalization] = useState<MorningPersonalization | null>(null);
  const [showTherapistSuggestion, setShowTherapistSuggestion] = useState(false);

  // Streak break detection
  const [showStreakBreakModal, setShowStreakBreakModal] = useState(false);
  const [streakBreakInfo, setStreakBreakInfo] = useState<{
    daysMissed: number;
    previousStreak: number;
  } | null>(null);

  // Load personalization + user name
  useEffect(() => {
    async function loadData() {
      const profile = await profileStorage.getProfile();
      setUserName(profile?.preferredName || null);

      if (user?.id) {
        try {
          const data = await getMorningPersonalization(user.id);
          setPersonalization(data);
          if (data.intensityRecommendation.recommended) {
            setSelectedIntensity(data.intensityRecommendation.recommended);
          }
        } catch (err) {
          console.error('Failed to load personalization:', err);
        }
      }
    }
    loadData();
  }, [user?.id]);

  // Mood history check — suggest therapist if avg < 4 over 3 days
  useEffect(() => {
    async function checkMoodHistory() {
      if (!user?.id) return;
      try {
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
          if (avgMood < 4) setShowTherapistSuggestion(true);
        }
      } catch {
        // Silently fail
      }
    }
    checkMoodHistory();
  }, [user?.id]);

  // Override to minimal intensity when depleted
  useEffect(() => {
    if (userState?.estimatedExecFunction === 'depleted' || userState?.odometer === 'survival') {
      setSelectedIntensity('crazy');
    }
  }, [userState?.estimatedExecFunction, userState?.odometer]);

  // Streak break detection
  useEffect(() => {
    async function checkForStreakBreak() {
      const entries = await storage.getAllEntries();
      if (entries.length === 0) return;

      const lastEntryDate = entries[0].date;
      const today = new Date().toISOString().split('T')[0];
      const lastDate = new Date(lastEntryDate);
      const todayDate = new Date(today);
      const diffTime = todayDate.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 1 && progress.overallStreak > 0) {
        setStreakBreakInfo({
          daysMissed: diffDays - 1,
          previousStreak: progress.overallStreak,
        });
        setShowStreakBreakModal(true);
      }
    }
    checkForStreakBreak();
  }, [progress.overallStreak]);

  // QuickStateStrip update handler
  const handleQuickUpdate = async (update: {
    mood?: number;
    arousal?: number;
    execFunction?: typeof userState extends null ? never : NonNullable<typeof userState>['estimatedExecFunction'];
    ginaHome?: boolean;
    ginaAsleep?: boolean;
  }) => {
    await quickUpdate({
      arousal: update.arousal ?? userState?.currentArousal,
      execFunction: update.execFunction ?? userState?.estimatedExecFunction,
      ginaHome: update.ginaHome ?? userState?.ginaHome,
      ginaAsleep: update.ginaAsleep ?? userState?.ginaAsleep,
      mood: update.mood,
    });
  };

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

  const greetingText = personalization?.greeting.salutation || 'Good Morning';
  const personalAddress = personalization?.greeting.personalAddress || userName || '';
  const hasWarnings = personalization?.warnings && personalization.warnings.length > 0;
  const stats = personalization?.quickStats;

  const greetingMood = personalization?.greeting.mood;
  const GIcon = greetingMood === 'celebratory' ? Star
    : greetingMood === 'energizing' ? TrendingUp
    : Sparkles;
  const iconBg = greetingMood === 'celebratory'
    ? 'bg-amber-500/20 border-amber-500/30'
    : greetingMood === 'gentle'
    ? 'bg-blue-500/20 border-blue-500/30'
    : isBambiMode
    ? 'bg-pink-100 border-pink-300'
    : 'bg-protocol-surface border-protocol-border';

  return (
    <div className={`min-h-screen flex flex-col items-center justify-start p-6 pt-16 overflow-y-auto ${
      isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
    }`}>
      {/* Streak Break Modal */}
      {showStreakBreakModal && streakBreakInfo && (
        <StreakBreakModal
          daysMissed={streakBreakInfo.daysMissed}
          previousStreak={streakBreakInfo.previousStreak}
          onAcknowledge={() => { setShowStreakBreakModal(false); setStreakBreakInfo(null); }}
        />
      )}

      <div className="max-w-md w-full space-y-6 animate-slide-up">
        {/* Greeting */}
        <div className="text-center space-y-2">
          <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center border ${iconBg}`}>
            <GIcon className={`w-7 h-7 ${
              greetingMood === 'celebratory' ? 'text-amber-400'
              : greetingMood === 'energizing' ? 'text-green-400'
              : isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`} />
          </div>
          <h1 className={`text-2xl font-semibold handler-voice ${
            isBambiMode ? 'text-pink-800' : 'text-protocol-text'
          }`}>
            {greetingText}{personalAddress ? `, ${personalAddress}` : ''}
          </h1>
          {stats && (
            <p className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Day {stats.currentStreak} · {stats.currentStreak}-day streak
              {stats.denialDay > 0 && ` · Denial day ${stats.denialDay}`}
            </p>
          )}
        </div>

        {/* Warnings */}
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
                  warning.severity === 'warning' ? 'text-red-400'
                  : warning.severity === 'caution' ? 'text-amber-400'
                  : 'text-blue-400'
                }`} />
                <div>
                  <p className={`text-sm font-medium ${
                    warning.severity === 'warning' ? 'text-red-400'
                    : warning.severity === 'caution' ? 'text-amber-400'
                    : 'text-blue-400'
                  }`}>{warning.title}</p>
                  <p className="text-xs text-protocol-text-muted mt-0.5">{warning.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Handler Status Briefing — 5 sections */}
        <HandlerStatusBriefing />

        {/* QuickStateStrip — state check-in */}
        {userState && (
          <div className="space-y-1">
            <p className={`text-xs font-medium uppercase tracking-wider ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              Check in
            </p>
            <QuickStateStrip
              currentMood={undefined}
              currentArousal={userState.currentArousal}
              currentExecFunction={userState.estimatedExecFunction}
              ginaHome={userState.ginaHome}
              ginaAsleep={userState.ginaAsleep}
              onUpdate={handleQuickUpdate}
            />
          </div>
        )}

        {/* Intensity picker — 3 horizontal buttons */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
              How much space today?
            </p>
            {personalization?.intensityRecommendation && (
              <span className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-accent'}`}>
                Suggested: {INTENSITY_CONFIG[personalization.intensityRecommendation.recommended].label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['spacious', 'normal', 'crazy'] as Intensity[]).map((intensity) => {
              const Icon = intensityIcons[intensity];
              const isSelected = selectedIntensity === intensity;
              const isRecommended = personalization?.intensityRecommendation.recommended === intensity;

              return (
                <button
                  key={intensity}
                  onClick={() => setSelectedIntensity(intensity)}
                  className={`py-3 px-2 rounded-xl border text-center transition-all ${
                    isSelected
                      ? isBambiMode
                        ? 'border-pink-400 bg-pink-100'
                        : 'border-protocol-accent bg-protocol-accent/10'
                      : isRecommended
                      ? isBambiMode
                        ? 'border-pink-300 bg-pink-50'
                        : 'border-protocol-accent/50 bg-protocol-surface'
                      : isBambiMode
                      ? 'border-pink-200 bg-white'
                      : 'border-protocol-border bg-protocol-surface'
                  }`}
                >
                  <Icon className={`w-5 h-5 mx-auto mb-1 ${
                    isSelected
                      ? isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                      : isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`} />
                  <span className={`text-xs font-medium ${
                    isSelected
                      ? isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      : isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}>
                    {intensityLabels[intensity]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Caretaker notice */}
        {(userState?.estimatedExecFunction === 'depleted' || userState?.odometer === 'survival') && (
          <div className={`p-3 rounded-lg ${
            isBambiMode
              ? 'bg-green-50 border border-green-200'
              : 'bg-green-500/10 border border-green-500/20'
          }`}>
            <p className={`text-sm ${isBambiMode ? 'text-green-600' : 'text-green-300'}`}>
              Take it easy today. Just showing up counts.
            </p>
          </div>
        )}

        {/* Therapist suggestion */}
        {showTherapistSuggestion && (
          <div className={`p-4 rounded-lg ${
            isBambiMode
              ? 'bg-blue-50 border border-blue-200'
              : 'bg-blue-500/10 border border-blue-500/20'
          }`}>
            <div className="flex items-start gap-3">
              <Heart className={`w-5 h-5 mt-0.5 shrink-0 ${
                isBambiMode ? 'text-blue-400' : 'text-blue-400'
              }`} />
              <div>
                <p className={`text-sm font-medium ${isBambiMode ? 'text-blue-600' : 'text-blue-300'}`}>
                  We've noticed you've been feeling low recently.
                </p>
                <p className={`text-xs mt-1 ${isBambiMode ? 'text-blue-500' : 'text-blue-400/70'}`}>
                  Consider talking to a therapist — you deserve support beyond what this app can offer.
                </p>
                <button
                  onClick={() => setShowTherapistSuggestion(false)}
                  className={`text-xs mt-2 underline ${isBambiMode ? 'text-blue-400' : 'text-blue-400'}`}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Start Today CTA */}
        <button
          onClick={handleStart}
          disabled={!selectedIntensity || isStarting}
          className={`w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
            selectedIntensity
              ? isBambiMode
                ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-lg'
                : 'text-white shadow-lg hover:shadow-xl'
              : isBambiMode
              ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
              : 'bg-protocol-surface border border-protocol-border/60 text-protocol-text-muted cursor-not-allowed'
          }`}
          style={selectedIntensity && !isBambiMode ? {
            background: 'linear-gradient(135deg, #c77dff, #a855f7)',
          } : undefined}
        >
          {isStarting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Getting things ready...
            </>
          ) : (
            <>
              Start Today
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>

        {/* Streak info */}
        {progress.overallStreak > 0 && (
          <p className={`text-center text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            <span className={`font-medium ${isBambiMode ? 'text-pink-600' : 'text-protocol-accent'}`}>
              {progress.overallStreak} day streak
            </span>
            {' '}— keep it going!
          </p>
        )}
      </div>
    </div>
  );
}
