import { useState, useEffect } from 'react';
import { PrivacyPage } from './components/PrivacyPage';
import { HandlerChat } from './components/handler/HandlerChat';
import { getPendingOutreach, evaluateAndQueueOutreach } from './lib/handler-v2/outreach-engine';
import { HandlerParameters } from './lib/handler-parameters';
import { useAuth } from './context/AuthContext';
import { ProtocolProvider, useProtocol } from './context/ProtocolContext';
import { BambiModeProvider, useBambiMode, FloatingHearts } from './context/BambiModeContext';
import { RewardProvider, useRewardOptional } from './context/RewardContext';
import { DebugModeProvider } from './context/DebugContext';
import { OpacityProvider, useOpacity } from './context/OpacityContext';
import { HandlerProvider, useHandlerContext } from './context/HandlerContext';
import { AmbushProvider } from './components/ambush';
import { ModalOrchestratorProvider } from './context/ModalOrchestrator';
import { useOrchestratedModals } from './hooks/useOrchestratedModals';
import { useDisassociationRecovery } from './hooks/useDisassociationRecovery';
import { useCompulsoryGate } from './hooks/useCompulsoryGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Auth } from './components/Auth';
import { MorningBriefing } from './components/MorningBriefing';
import { CompulsoryGateScreen } from './components/CompulsoryGateScreen';
// TodayView removed — conversation is now the primary interface
import { ProgressDashboard } from './components/ProgressDashboard';
import { History } from './components/History';
// SealedContentView removed — accessible via Handler conversation
import { MenuView } from './components/MenuView';
import { OnboardingFlow } from './components/Onboarding';
// DayIncompleteModal removed - navigation is now unrestricted
// InvestmentMilestoneModal now rendered via useOrchestratedModals
import { SharedWishlistView } from './components/wishlist';
// AchievementModal, RewardLevelUpModal now rendered via useOrchestratedModals
import { SettingsView } from './components/settings';
import { SessionContainer } from './components/session';
import type { SessionConfig } from './components/session';
import { KinkQuizView } from './components/kink-quiz';
import { WorkoutSessionPage } from './components/exercise';
import { HerWorldPage } from './components/collections';
import { MorningBookend } from './components/bookends';
import { EveningDebrief } from './components/EveningDebrief';
import { useBookends } from './hooks/useBookends';
// import { useAmbientVoiceMonitor } from './hooks/useAmbientVoiceMonitor';
import { useSubliminalUI } from './hooks/useSubliminalUI';
import { OrgasmLogModal } from './components/arousal/OrgasmLogModal';
import { PostReleaseOverlay } from './components/post-release/PostReleaseOverlay';
import { DeletionInterceptModal } from './components/post-release/DeletionInterceptModal';
import { usePostReleaseProtocol } from './hooks/usePostReleaseProtocol';
import { useArousalState } from './hooks/useArousalState';
import type { OrgasmLogInput } from './types/arousal';
// MicroTaskCard + useMicroTasks removed — micro-tasks disabled
// MomentLoggerFAB removed — absorbed by QuickStateStrip + JournalPrompt
// ReminderModal now rendered via useOrchestratedModals
import { useReminders } from './hooks/useReminders';
import { usePatternNotifications } from './hooks/usePatternNotifications';
// useDopamineNotifications removed — dopamine notifications disabled
import { TimelineView } from './components/timeline';
import { GinaEmergenceView, GinaPipelineView } from './components/gina';
import { ServiceProgressionView, ServiceAnalyticsDashboard } from './components/service';
import { ContentEscalationView, VaultSwipe } from './components/content';
import { PermissionsManager } from './components/content/PermissionsManager';
import { ContentCapture } from './components/content/ContentCapture';
import { PostingQueue } from './components/content/PostingQueue';
import { ContentCalendar } from './components/content/ContentCalendar';
import { PlatformSettings } from './components/content/PlatformSettings';
import { VaultView } from './components/content/VaultView';
import { FanDashboard } from './components/content/FanDashboard';
import { SubscriberPolls } from './components/content/SubscriberPolls';
import { RevenueView } from './components/content/RevenueView';
import { ContentDashboard } from './components/admin/ContentDashboard';
import { DomainEscalationView } from './components/domains';
import { PatternCatchView } from './components/patterns';
import { TriggerAuditDashboard } from './components/triggers';
// NotificationToastStack removed — notifications disabled
import { TaskCurationView } from './components/curation';
import { SeedsView } from './components/seeds';
import { VectorGridView } from './components/adaptive-feminization';
import { VoiceAffirmationGame } from './components/voice-game';
import { VoiceDrillView } from './components/voice-game/VoiceDrillView';
import { Dashboard } from './components/dashboard';
import { JournalView } from './components/journal';
import { ProtocolAnalytics } from './components/analytics/ProtocolAnalytics';
import { HandlerAutonomousView } from './components/autonomous';
import { CamDashboard } from './components/cam/CamDashboard';
import { HypnoDashboard } from './components/hypno';
import { GoonSessionView } from './components/sessions/GoonSessionView';
import { SleepContentPlayer } from './components/sleep-content';
import { ConditioningLibrary, ConditioningPlayer } from './components/conditioning';
import { SocialMediaDashboard } from './components/social/SocialMediaDashboard';
import { getTodayDate } from './lib/protocol';
import { profileStorage, letterStorage } from './lib/storage';
// useTaskBank, useGoals, useWeekend — now used only inside TodayView (badge removed)
import type { UserProfile, SealedLetter } from './components/Onboarding/types';
import { Loader2 } from 'lucide-react';

// Parse hash route for shared wishlist
function parseWishlistToken(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/#\/wishlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// Parse URL path for deep-linking into menu sub-views (e.g. /social-dashboard)
const DEEP_LINK_VIEWS: Record<string, string> = {
  '/social-dashboard': 'social-dashboard',
  '/socials': 'social-dashboard',
  '/content-dashboard': 'content-dashboard',
  '/dashboard': 'dashboard',
  '/journal': 'journal',
  '/settings': 'settings',
};

function parseDeepLinkView(): string | null {
  // Check hash first (app uses hash routing: /#/social-dashboard)
  const hash = window.location.hash;
  if (hash) {
    const hashPath = hash.replace('#', '');
    if (DEEP_LINK_VIEWS[hashPath]) return DEEP_LINK_VIEWS[hashPath];
  }
  // Fallback to pathname for non-hash deploys
  const path = window.location.pathname;
  return DEEP_LINK_VIEWS[path] || null;
}

type Tab = 'protocol' | 'progress' | 'sealed' | 'menu';

// Navigation and Header removed — conversation IS the app.

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#FAF7F5' }}>
      <Loader2 className="w-10 h-10 text-pink-400 animate-spin mb-4" />
      <p className="text-pink-600 text-sm">Loading...</p>
    </div>
  );
}

type MenuSubView = 'history' | 'investments' | 'wishlist' | 'settings' | 'help' | 'sessions' | 'quiz' | 'timeline' | 'gina' | 'gina-pipeline' | 'service' | 'service-analytics' | 'content' | 'domains' | 'patterns' | 'curation' | 'seeds' | 'vectors' | 'trigger-audit' | 'voice-game' | 'voice-drills' | 'dashboard' | 'journal' | 'protocol-analytics' | 'handler-autonomous' | 'exercise' | 'her-world' | 'vault-swipe' | 'vault-permissions' | 'content-dashboard' | 'cam-session' | 'hypno-session' | 'goon-session' | 'progress-page' | 'sealed-page' | 'content-capture' | 'content-queue' | 'content-calendar' | 'content-fans' | 'content-polls' | 'content-revenue' | 'content-settings' | 'vault-browser' | 'log-release' | 'conditioning-library' | 'social-dashboard' | null;

/** Session picker → launches immersive SessionContainer */
function SessionPickerOrContainer({ onBack }: { onBack: () => void }) {
  const { isBambiMode } = useBambiMode();
  const [config, setConfig] = useState<SessionConfig | null>(null);

  if (config) {
    return (
      <SessionContainer
        config={config}
        onComplete={() => setConfig(null)}
        onCancel={() => setConfig(null)}
      />
    );
  }

  const SESSION_TYPES: { type: SessionConfig['sessionType']; label: string; desc: string; edges: number }[] = [
    { type: 'anchoring', label: 'Anchoring', desc: 'Build edge control with guided recovery', edges: 10 },
    { type: 'exploration', label: 'Exploration', desc: 'Push limits with shorter recovery windows', edges: 15 },
    { type: 'endurance', label: 'Endurance', desc: 'Extended session, maximum edge count', edges: 20 },
  ];

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
      >
        &larr; Back to Menu
      </button>
      <div className="space-y-3">
        <h2 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Edge Sessions
        </h2>
        {SESSION_TYPES.map(s => (
          <button
            key={s.type}
            onClick={() => setConfig({ sessionType: s.type, targetEdges: s.edges, prescribed: false })}
            className={`w-full p-4 rounded-2xl border text-left transition-all ${
              isBambiMode
                ? 'bg-pink-50 border-pink-200 hover:border-pink-400'
                : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/50'
            }`}
          >
            <p className={`font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>{s.label}</p>
            <p className={`text-sm mt-1 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>{s.desc}</p>
            <p className={`text-xs mt-1.5 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted/60'}`}>{s.edges} edges</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function AuthenticatedAppInner() {
  const { currentEntry, isLoading, investmentMilestone, dismissInvestmentMilestone, userName, progress } = useProtocol();
  const { canSee } = useOpacity();
  const rewardContext = useRewardOptional();
  const { dismissIntervention, completeIntervention, respondToIntervention } = useHandlerContext();

  // Calculate days on protocol from total days in progress (minimum of 1)
  const daysOnProtocol = Math.max(1, progress?.totalDays ?? 1);

  // Compulsory gate - locks app until daily requirements are met (Feature 38)
  const {
    isLocked: compulsoryLocked,
    isLoading: compulsoryLoading,
    refresh: refreshCompulsoryGate,
  } = useCompulsoryGate(daysOnProtocol);

  // Disassociation recovery - detects when you zone out
  const recovery = useDisassociationRecovery({
    inactivityThresholdMs: 10 * 60 * 1000,
    enabled: false, // Disabled — user found recovery prompts disruptive
  });

  // Morning/Evening bookend system
  const bookends = useBookends();

  // Ambient voice monitoring DISABLED — causes persistent mic access that disrupts UX
  // useAmbientVoiceMonitor(isLoading || compulsoryLoading);

  // Subliminal UI reinforcement (P12.8) — progressive CSS shifts over months
  useSubliminalUI();

  // Micro-tasks disabled — user found pop-ups disruptive
  // const microTasks = useMicroTasks();

  // Arousal state — for orgasm logging
  const { logOrgasm, metrics: arousalMetrics } = useArousalState();

  // Post-release protocol — lockout, shame capture, deletion intercept
  const postRelease = usePostReleaseProtocol();
  const [showOrgasmLog, setShowOrgasmLog] = useState(false);
  const [deletionIntercept, setDeletionIntercept] = useState<{
    message: string;
    attemptNumber: number;
  } | null>(null);

  // Whoop OAuth callback toast
  const [whoopToast, setWhoopToast] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('whoop');
    if (status) {
      window.history.replaceState({}, '', window.location.pathname);
      if (status === 'connected') return 'connected';
      if (status === 'error') return params.get('reason') || 'error';
    }
    return null;
  });
  useEffect(() => {
    if (whoopToast) {
      const timer = setTimeout(() => setWhoopToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [whoopToast]);

  const deepLinkView = parseDeepLinkView();
  const [activeTab, setActiveTab] = useState<Tab>(deepLinkView ? 'menu' : 'protocol');
  const [menuSubView, setMenuSubView] = useState<MenuSubView>((deepLinkView as MenuSubView) || null);
  const [showMorningFlow, setShowMorningFlow] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [editIntakeMode, setEditIntakeMode] = useState(false);
  const [editIntakeProfile, setEditIntakeProfile] = useState<Partial<UserProfile> | null>(null);
  const [showSleepContent, setShowSleepContent] = useState(false);
  // showHandlerChat removed — chat is now always visible as primary UI
  const [pendingOutreach, setPendingOutreach] = useState<{ id: string; openingLine: string } | null>(null);
  const [showSettings, setShowSettings] = useState(!!deepLinkView);

  // P6.5: Conditioning session triggered by Handler conversation
  const [conditioningSession, setConditioningSession] = useState<{
    audioUrl?: string;
    target: string;
    phase: number;
  } | null>(null);

  useEffect(() => {
    const handleConditioningSession = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.audioUrl) {
        setConditioningSession({
          audioUrl: detail.audioUrl,
          target: detail.target || 'identity',
          phase: detail.phase || 1,
        });
      }
    };
    window.addEventListener('handler-conditioning-session', handleConditioningSession);
    return () => window.removeEventListener('handler-conditioning-session', handleConditioningSession);
  }, []);

  // Check for pending Handler outreach on load
  const { user: authUser } = useAuth();
  useEffect(() => {
    if (!authUser?.id) return;
    const user = authUser;
    // Check for existing outreach
    getPendingOutreach(user.id).then(o => {
      if (o) setPendingOutreach({ id: o.id, openingLine: o.openingLine });
    }).catch(() => {});
    // Evaluate if new outreach should fire
    const params = new HandlerParameters(user.id);
    evaluateAndQueueOutreach(user.id, params).then(result => {
      if (result.queued && result.line) {
        setPendingOutreach({ id: '', openingLine: result.line });
      }
    }).catch(() => {});
  }, [authUser?.id]);

  // Feminization reminders - all day presence
  const {
    respondToReminder,
    skipReminder,
    dismissReminder,
  } = useReminders();

  // Pattern notifications disabled — user found pop-ups disruptive
  usePatternNotifications({ enabled: false });

  // Dopamine delivery system - delayed rewards + periodic notifications
  // Dopamine notifications disabled — user found pop-ups disruptive
  // useDopamineNotifications();

  // Orchestrated modals - prevents modal stacking, shows one at a time
  // Orchestrated modals — reminders and recovery disabled (user found pop-ups disruptive)
  // Only event-driven modals remain: interventions, milestones, achievements, level-ups
  useOrchestratedModals({
    currentReminder: null, // Disabled
    onRespondReminder: respondToReminder,
    onSkipReminder: skipReminder,
    onDismissReminder: dismissReminder,
    currentIntervention: null, // Disabled — Handler chat replaces interventions
    onCompleteIntervention: completeIntervention,
    onDismissIntervention: dismissIntervention,
    onRespondIntervention: respondToIntervention,
    recoveryTriggered: false, // Disabled
    recoveryPrompt: null,
    recoveryEscalationLevel: 1,
    recoveryConsecutiveIgnores: 0,
    onCompleteRecovery: recovery.completeRecovery,
    onDismissRecovery: recovery.dismissRecovery,
    investmentMilestone,
    onDismissInvestmentMilestone: dismissInvestmentMilestone,
    achievementEvent: rewardContext?.achievementUnlockedEvent || null,
    onDismissAchievement: rewardContext?.dismissAchievementUnlocked || (() => {}),
    levelUpEvent: rewardContext?.levelUpEvent || null,
    onDismissLevelUp: rewardContext?.dismissLevelUp || (() => {}),
  });

  // Task bank, goals, and weekend — used by TodayView directly, no longer for nav badge

  // Listen for navigation events from components
  useEffect(() => {
    const handleNavigateToInvestments = () => {
      setActiveTab('progress');
      // The ProgressDashboard has its own sub-tab for investments
    };
    const handleNavigateToWishlist = () => {
      setActiveTab('menu');
      setMenuSubView('wishlist');
    };
    const handleNavigateToSettings = () => {
      setActiveTab('menu');
      setMenuSubView('settings');
    };
    const handleNavigateToHandler = () => {
      setActiveTab('menu');
      setMenuSubView('handler-autonomous');
    };
    const handleNavigateToExercise = () => {
      setActiveTab('menu');
      setMenuSubView('exercise');
    };
    const handleNavigateToCam = () => {
      setActiveTab('menu');
      setMenuSubView('cam-session');
    };
    const handleNavigateToHypno = () => {
      setActiveTab('menu');
      setMenuSubView('hypno-session');
    };
    const handleOpenReleaseLog = () => setShowOrgasmLog(true);
    window.addEventListener('navigate-to-investments', handleNavigateToInvestments);
    window.addEventListener('navigate-to-wishlist', handleNavigateToWishlist);
    window.addEventListener('navigate-to-settings', handleNavigateToSettings);
    window.addEventListener('navigate-to-handler', handleNavigateToHandler);
    window.addEventListener('navigate-to-exercise', handleNavigateToExercise);
    window.addEventListener('navigate-to-cam', handleNavigateToCam);
    window.addEventListener('navigate-to-hypno', handleNavigateToHypno);
    window.addEventListener('open-release-log', handleOpenReleaseLog);
    return () => {
      window.removeEventListener('navigate-to-investments', handleNavigateToInvestments);
      window.removeEventListener('navigate-to-wishlist', handleNavigateToWishlist);
      window.removeEventListener('navigate-to-settings', handleNavigateToSettings);
      window.removeEventListener('navigate-to-handler', handleNavigateToHandler);
      window.removeEventListener('navigate-to-exercise', handleNavigateToExercise);
      window.removeEventListener('navigate-to-cam', handleNavigateToCam);
      window.removeEventListener('navigate-to-hypno', handleNavigateToHypno);
      window.removeEventListener('open-release-log', handleOpenReleaseLog);
    };
  }, []);

  // Redirect away from gated tabs when opacity hides them
  useEffect(() => {
    if (activeTab === 'progress' && !canSee('progress_page')) {
      setActiveTab('protocol');
    }
    if (activeTab === 'sealed' && !canSee('sealed_content')) {
      setActiveTab('protocol');
    }
  }, [activeTab, canSee]);

  // Check if onboarding is complete
  useEffect(() => {
    async function checkOnboarding() {
      const isComplete = await profileStorage.isOnboardingComplete();
      setShowOnboarding(!isComplete);
    }
    checkOnboarding();
  }, []);

  // Check if we need to show morning flow
  useEffect(() => {
    if (!isLoading && showOnboarding === false) {
      const today = getTodayDate();
      const hasEntryToday = currentEntry?.date === today;
      // Also check localStorage fallback — startDay may have failed but morning was completed
      const morningDoneToday = localStorage.getItem('morning_done_date') === today;
      setShowMorningFlow(!hasEntryToday && !morningDoneToday);
    }
  }, [isLoading, currentEntry, showOnboarding]);

  // Browser history: push/pop state for back button support
  useEffect(() => {
    // Replace initial state so first back doesn't exit the app
    window.history.replaceState({ tab: 'protocol', subView: null }, '');

    const handlePop = (e: PopStateEvent) => {
      const state = e.state as { tab?: Tab; subView?: MenuSubView } | null;
      if (state?.tab) {
        setActiveTab(state.tab);
        setMenuSubView(state.subView ?? null);
      } else {
        setActiveTab('protocol');
        setMenuSubView(null);
      }
    };

    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Handle menu navigation — special cases for progress/sealed pages
  const handleMenuNavigate = (view: MenuSubView) => {
    if (view === 'log-release' as MenuSubView) {
      window.dispatchEvent(new Event('open-release-log'));
      return;
    }
    if (view === 'progress-page') {
      setActiveTab('progress');
      setMenuSubView(null);
      window.history.pushState({ tab: 'progress', subView: null }, '');
      return;
    }
    if (view === 'sealed-page') {
      setActiveTab('sealed');
      setMenuSubView(null);
      window.history.pushState({ tab: 'sealed', subView: null }, '');
      return;
    }
    setMenuSubView(view);
    window.history.pushState({ tab: activeTab, subView: view }, '');
  };

  // Handle back from menu sub-view
  const handleBackFromSubView = () => {
    // If we deep-linked in, close settings overlay and reset URL instead of history.back()
    if (window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
      setShowSettings(false);
      setMenuSubView(null);
      return;
    }
    window.history.back();
  };

  // Handle starting edit intake mode
  const handleEditIntake = async () => {
    try {
      const profile = await profileStorage.getProfile();
      setEditIntakeProfile(profile || {});
      setEditIntakeMode(true);
      setMenuSubView(null);
    } catch (error) {
      console.error('Error loading profile for edit:', error);
    }
  };

  // Handle canceling edit intake mode
  const handleCancelEditIntake = () => {
    setEditIntakeMode(false);
    setEditIntakeProfile(null);
  };

  // Handle onboarding completion (also used for edit mode)
  const handleOnboardingComplete = async (profile: UserProfile, letters: SealedLetter[]) => {
    try {
      console.log('Saving profile...', profile);
      await profileStorage.saveProfile(profile);
      console.log('Profile saved successfully');

      // Only save letters for new onboarding (not edit mode)
      if (!editIntakeMode && letters.length > 0) {
        console.log('Saving letters...', letters);
        await letterStorage.saveLetters(letters);
        console.log('Letters saved successfully');
      }

      // Close the appropriate mode
      if (editIntakeMode) {
        setEditIntakeMode(false);
        setEditIntakeProfile(null);
      } else {
        setShowOnboarding(false);
      }
    } catch (error) {
      console.error('Error saving onboarding data:', error);
      // Still proceed even if save fails (data is in memory)
      alert('Warning: Could not save to database. Please check if the database schema is set up. Error: ' + (error as Error).message);
      if (editIntakeMode) {
        setEditIntakeMode(false);
        setEditIntakeProfile(null);
      } else {
        setShowOnboarding(false);
      }
    }
  };

  if (isLoading || showOnboarding === null || compulsoryLoading) {
    return <LoadingScreen />;
  }

  // Show onboarding if not complete
  if (showOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  // Show edit intake flow
  if (editIntakeMode && editIntakeProfile !== null) {
    return (
      <OnboardingFlow
        onComplete={handleOnboardingComplete}
        initialProfile={editIntakeProfile}
        isEditMode={true}
        onCancel={handleCancelEditIntake}
      />
    );
  }

  // Show morning bookend before morning flow (first open each day)
  // Skip all gates when deep-linking to a specific view
  if (!deepLinkView && bookends.showMorningBookend && bookends.config) {
    return (
      <ErrorBoundary componentName="MorningBookend">
        <MorningBookend
          name={bookends.config.morningName}
          denialDay={progress?.totalDays ?? 0}
          streak={progress?.overallStreak ?? 0}
          message={bookends.morningMessage}
          onDismiss={bookends.dismissMorning}
          lastProtocol={bookends.lastProtocol}
        />
      </ErrorBoundary>
    );
  }

  // Show morning briefing if no entry for today
  if (!deepLinkView && showMorningFlow) {
    return (
      <ErrorBoundary componentName="MorningBriefing">
        <MorningBriefing onComplete={() => {
          localStorage.setItem('morning_done_date', getTodayDate());
          setShowMorningFlow(false);
        }} />
      </ErrorBoundary>
    );
  }

  // Show compulsory gate if app is locked (Feature 38)
  if (!deepLinkView && compulsoryLocked) {
    return (
      <ErrorBoundary componentName="CompulsoryGate">
        <CompulsoryGateScreen
          daysOnProtocol={daysOnProtocol}
          onUnlock={refreshCompulsoryGate}
        />
      </ErrorBoundary>
    );
  }

  // Render menu sub-view content
  const renderMenuSubView = () => {
    switch (menuSubView) {
      case 'history':
        return (
          <div>
            <button
              onClick={handleBackFromSubView}
              className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              &larr; Back to Menu
            </button>
            <History />
          </div>
        );
      case 'investments':
      case 'wishlist':
        // These are now in ProgressDashboard, redirect there
        return (
          <div>
            <button
              onClick={handleBackFromSubView}
              className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              &larr; Back to Menu
            </button>
            <ProgressDashboard />
          </div>
        );
      case 'sessions':
        return (
          <SessionPickerOrContainer onBack={handleBackFromSubView} />
        );
      case 'exercise':
        return <WorkoutSessionPage onBack={handleBackFromSubView} />;
      case 'her-world':
        return <HerWorldPage onBack={handleBackFromSubView} />;
      case 'vault-swipe':
        return (
          <VaultSwipe
            onBack={handleBackFromSubView}
            onManagePermissions={() => {
              setMenuSubView('vault-permissions');
              window.history.pushState({ tab: activeTab, subView: 'vault-permissions' }, '');
            }}
          />
        );
      case 'vault-permissions':
        return <PermissionsManager onBack={handleBackFromSubView} />;
      case 'vault-browser':
        return <VaultView onBack={handleBackFromSubView} />;
      case 'content-capture':
        return <ContentCapture onBack={handleBackFromSubView} />;
      case 'content-queue':
        return <PostingQueue onBack={handleBackFromSubView} />;
      case 'content-calendar':
        return <ContentCalendar onBack={handleBackFromSubView} />;
      case 'content-fans':
        return <FanDashboard onBack={handleBackFromSubView} />;
      case 'content-polls':
        return <SubscriberPolls onBack={handleBackFromSubView} />;
      case 'content-revenue':
        return <RevenueView onBack={handleBackFromSubView} />;
      case 'content-settings':
        return <PlatformSettings onBack={handleBackFromSubView} />;
      case 'content-dashboard':
        return <ContentDashboard onBack={handleBackFromSubView} />;
      case 'quiz':
        return <KinkQuizView onBack={handleBackFromSubView} />;
      case 'voice-game':
        return <VoiceAffirmationGame onBack={handleBackFromSubView} />;
      case 'voice-drills':
        return (
          <VoiceDrillView
            onBack={handleBackFromSubView}
            onAffirmationGame={() => {
              setMenuSubView('voice-game');
              window.history.pushState({ tab: activeTab, subView: 'voice-game' }, '');
            }}
          />
        );
      case 'timeline':
        return <TimelineView onBack={handleBackFromSubView} userName={userName ?? undefined} />;
      case 'gina':
        return <GinaEmergenceView onBack={handleBackFromSubView} />;
      case 'gina-pipeline':
        return <GinaPipelineView onBack={handleBackFromSubView} />;
      case 'service':
        return <ServiceProgressionView onBack={handleBackFromSubView} />;
      case 'service-analytics':
        return <ServiceAnalyticsDashboard onBack={handleBackFromSubView} />;
      case 'trigger-audit':
        return <TriggerAuditDashboard onBack={handleBackFromSubView} />;
      case 'content':
        return <ContentEscalationView onBack={handleBackFromSubView} />;
      case 'domains':
        return <DomainEscalationView onBack={handleBackFromSubView} />;
      case 'patterns':
        return <PatternCatchView onBack={handleBackFromSubView} />;
      case 'curation':
        return <TaskCurationView onBack={handleBackFromSubView} />;
      case 'seeds':
        return <SeedsView onBack={handleBackFromSubView} />;
      case 'vectors':
        return (
          <div>
            <button
              onClick={handleBackFromSubView}
              className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              &larr; Back to Menu
            </button>
            <VectorGridView />
          </div>
        );
      case 'protocol-analytics':
        return <ProtocolAnalytics onBack={handleBackFromSubView} />;
      case 'handler-autonomous':
        return <HandlerAutonomousView onBack={handleBackFromSubView} />;
      case 'cam-session':
        return <CamDashboard onBack={handleBackFromSubView} />;
      case 'hypno-session':
        return <HypnoDashboard onBack={handleBackFromSubView} />;
      case 'goon-session':
        return <GoonSessionView onBack={handleBackFromSubView} />;
      case 'conditioning-library':
        return <ConditioningLibrary onBack={handleBackFromSubView} />;
      case 'social-dashboard':
        return <SocialMediaDashboard onBack={handleBackFromSubView} />;
      case 'dashboard':
        return (
          <div>
            <button
              onClick={handleBackFromSubView}
              className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              &larr; Back to Menu
            </button>
            <Dashboard />
          </div>
        );
      case 'journal':
        return (
          <div>
            <button
              onClick={handleBackFromSubView}
              className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              &larr; Back to Menu
            </button>
            <JournalView />
          </div>
        );
      case 'settings':
        return <SettingsView onBack={handleBackFromSubView} onEditIntake={handleEditIntake} />;
      case 'help':
        return (
          <div>
            <button
              onClick={handleBackFromSubView}
              className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              &larr; Back to Menu
            </button>
            <div className="card p-6 space-y-4">
              <h3 className="text-lg font-semibold text-protocol-text">Help & Support</h3>
              <p className="text-sm text-protocol-text-muted">
                Becoming Protocol is your daily companion for personal transformation.
              </p>
              <p className="text-sm text-protocol-text-muted">
                Complete your daily tasks, journal your reflections, and track your progress
                as you become who you're meant to be.
              </p>
            </div>
          </div>
        );
      default:
        return <MenuView onNavigate={handleMenuNavigate} />;
    }
  };

  // Handler-Directed UI: Conversation is the primary screen.
  // Settings accessible via gear icon in chat header.
  // NOTE: showSettings useState moved above early returns (was causing Rules of Hooks violation / #310)

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* PRIMARY: The Conversation — always visible unless settings open */}
      {!showSettings && (
        <ErrorBoundary componentName="HandlerChat">
          <HandlerChat
            onClose={() => {}} // Can't close — it IS the app
            openingLine={pendingOutreach?.openingLine}
            onOpenSettings={() => {
              setShowSettings(true);
              setMenuSubView(null);
            }}
          />
        </ErrorBoundary>
      )}

      {/* SETTINGS: Accessed via gear icon in chat header */}
      {showSettings && (
        <div className="min-h-screen bg-[#0a0a0a]">
          <div className="max-w-lg mx-auto px-4 py-4">
            <button
              onClick={() => setShowSettings(false)}
              className="mb-4 text-sm text-gray-400 hover:text-white transition-colors"
            >
              &larr; Back to Handler
            </button>
            {renderMenuSubView()}
          </div>
        </div>
      )}

      <FloatingHearts />

      {/* Whoop OAuth callback toast */}
      {whoopToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] animate-slide-down">
          <div className={`px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 ${
            whoopToast === 'connected'
              ? 'bg-green-900 border border-green-500/50 text-green-100'
              : 'bg-red-900 border border-red-500/50 text-red-100'
          }`}>
            <span className="text-lg">{whoopToast === 'connected' ? '✓' : '✕'}</span>
            <span className="font-medium text-sm">
              {whoopToast === 'connected'
                ? 'Whoop connected. Biometric data syncing.'
                : `Whoop connection failed: ${whoopToast}`}
            </span>
          </div>
        </div>
      )}

      {/* Micro-task card overlay — disabled, user found pop-ups disruptive */}

      {/* Evening Debrief overlay */}
      {bookends.showEveningBookend && bookends.daySummary && bookends.config && (
        <ErrorBoundary componentName="EveningDebrief">
          <EveningDebrief
            name={bookends.config.morningName}
            message={bookends.eveningMessage}
            summary={bookends.daySummary}
            streakDays={progress?.overallStreak ?? 0}
            onDismiss={bookends.dismissEvening}
            onSleepContent={() => {
              bookends.dismissEvening();
              setShowSleepContent(true);
            }}
          />
        </ErrorBoundary>
      )}

      {/* Sleep Content Player overlay */}
      {showSleepContent && (
        <SleepContentPlayer onDismiss={() => setShowSleepContent(false)} />
      )}

      {/* P6.5: Handler-triggered Conditioning Session */}
      {conditioningSession?.audioUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4">
            <ConditioningPlayer
              audioUrl={conditioningSession.audioUrl}
              title={`Phase ${conditioningSession.phase} — ${conditioningSession.target.charAt(0).toUpperCase() + conditioningSession.target.slice(1)}`}
              duration={0}
              onComplete={() => setConditioningSession(null)}
              onClose={() => setConditioningSession(null)}
            />
          </div>
        </div>
      )}

      {/* OrgasmLogModal — Log Release flow */}
      <OrgasmLogModal
        isOpen={showOrgasmLog}
        onClose={() => setShowOrgasmLog(false)}
        onSubmit={async (data: OrgasmLogInput) => {
          await logOrgasm(data);
          // Fire post-release protocol after logging
          postRelease.triggerProtocol(
            data.releaseType,
            data.regretLevel ?? 1,
            data.intensity
          );
        }}
        currentStreakDays={arousalMetrics?.currentStreakDays ?? 0}
      />

      {/* Post-Release Overlay — lockout with shame capture */}
      {postRelease.activeProtocol && (
        <PostReleaseOverlay
          protocol={postRelease.activeProtocol}
          minutesRemaining={postRelease.minutesRemaining}
          onCaptureShame={postRelease.captureShame}
          onSaveReflection={postRelease.saveReflection}
        />
      )}

      {/* Deletion Intercept Modal */}
      <DeletionInterceptModal
        isOpen={deletionIntercept !== null}
        onDismiss={() => setDeletionIntercept(null)}
        message={deletionIntercept?.message ?? ''}
        attemptNumber={deletionIntercept?.attemptNumber ?? 0}
        minutesRemaining={postRelease.minutesRemaining}
      />

      {/* Modals (Investment, Achievement, LevelUp, Reminder, Intervention, Recovery)
          are now rendered via useOrchestratedModals - only one shows at a time */}
    </div>
  );
}

// Wrapper component that provides BambiMode, Reward, Handler, Modal, Opacity, and Debug contexts
function AuthenticatedApp() {
  return (
    <DebugModeProvider>
      <OpacityProvider>
        <BambiModeProvider>
          <RewardProvider>
            <HandlerProvider
              autoGeneratePlan={true}
              enableBackgroundChecks={true}
            >
              <ModalOrchestratorProvider>
                <AmbushProvider enabled={false}>
                  <AuthenticatedAppInner />
                </AmbushProvider>
              </ModalOrchestratorProvider>
            </HandlerProvider>
          </RewardProvider>
        </BambiModeProvider>
      </OpacityProvider>
    </DebugModeProvider>
  );
}

function AppInner() {
  const { user, isLoading } = useAuth();
  const [wishlistToken, setWishlistToken] = useState<string | null>(() => parseWishlistToken());
  const [passwordRecovery, setPasswordRecovery] = useState(() =>
    window.location.hash.includes('type=recovery')
  );

  // Listen for hash changes (for shared wishlist navigation)
  useEffect(() => {
    const handleHashChange = () => {
      setWishlistToken(parseWishlistToken());
      if (window.location.hash.includes('type=recovery')) {
        setPasswordRecovery(true);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Handle shared wishlist view (no auth required)
  if (wishlistToken) {
    return (
      <SharedWishlistView
        token={wishlistToken}
        onBack={() => {
          window.location.hash = '';
          setWishlistToken(null);
        }}
      />
    );
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Show password reset form when recovery token is detected
  if (passwordRecovery) {
    return <Auth initialMode="reset" />;
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <ErrorBoundary componentName="App">
      <ProtocolProvider>
        <AuthenticatedApp />
      </ProtocolProvider>
    </ErrorBoundary>
  );
}

export default function App() {
  // Standalone pages (no auth required) — must be outside hook-using component
  if (window.location.pathname === '/privacy') return <PrivacyPage />;

  return <AppInner />;
}
