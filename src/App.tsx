import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { ProtocolProvider, useProtocol } from './context/ProtocolContext';
import { BambiModeProvider, useBambiMode, FloatingHearts } from './context/BambiModeContext';
import { RewardProvider, useRewardOptional } from './context/RewardContext';
import { DebugModeProvider } from './context/DebugContext';
import { HandlerProvider, useHandlerContext } from './context/HandlerContext';
import { AmbushProvider } from './components/ambush';
import { ModalOrchestratorProvider } from './context/ModalOrchestrator';
import { useOrchestratedModals } from './hooks/useOrchestratedModals';
import { useDisassociationRecovery } from './hooks/useDisassociationRecovery';
import { useCompulsoryGate } from './hooks/useCompulsoryGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Auth } from './components/Auth';
import { MorningFlow } from './components/MorningFlow';
import { CompulsoryGateScreen } from './components/CompulsoryGateScreen';
import { TodayView } from './components/today';
import { ProgressDashboard } from './components/ProgressDashboard';
import { History } from './components/History';
import { SealedContentView } from './components/SealedContent';
import { MenuView } from './components/MenuView';
import { OnboardingFlow } from './components/Onboarding';
// DayIncompleteModal removed - navigation is now unrestricted
// InvestmentMilestoneModal now rendered via useOrchestratedModals
import { SharedWishlistView } from './components/wishlist';
// AchievementModal, RewardLevelUpModal now rendered via useOrchestratedModals
import { SettingsView } from './components/settings';
import { SessionLauncher } from './components/sessions';
import { KinkQuizView } from './components/kink-quiz';
import { WorkoutSessionPage } from './components/exercise';
import { HerWorldPage } from './components/collections';
import { MorningBookend, EveningBookend } from './components/bookends';
import { useBookends } from './hooks/useBookends';
import { MicroTaskCard } from './components/micro-tasks';
import { useMicroTasks } from './hooks/useMicroTasks';
import { MomentLoggerFAB } from './components/moment-logger';
// ReminderModal now rendered via useOrchestratedModals
import { useReminders } from './hooks/useReminders';
import { usePatternNotifications } from './hooks/usePatternNotifications';
import { TimelineView } from './components/timeline';
import { GinaEmergenceView, GinaPipelineView } from './components/gina';
import { ServiceProgressionView, ServiceAnalyticsDashboard } from './components/service';
import { ContentEscalationView, VaultSwipe } from './components/content';
import { PermissionsManager } from './components/content/PermissionsManager';
import { ContentDashboard } from './components/admin/ContentDashboard';
import { DomainEscalationView } from './components/domains';
import { PatternCatchView } from './components/patterns';
import { TriggerAuditDashboard } from './components/triggers';
import { NotificationToastStack } from './components/notifications';
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
import { SleepContentPlayer } from './components/sleep-content';
import { getTodayDate } from './lib/protocol';
import { profileStorage, letterStorage } from './lib/storage';
import { useTaskBank } from './hooks/useTaskBank';
import { useGoals } from './hooks/useGoals';
import { useWeekend } from './hooks/useWeekend';
import type { UserProfile, SealedLetter } from './components/Onboarding/types';
import {
  CheckSquare,
  TrendingUp,
  Loader2,
  Settings,
  Gift,
  Menu,
  Heart
} from 'lucide-react';

// Parse hash route for shared wishlist
function parseWishlistToken(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/#\/wishlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

type Tab = 'protocol' | 'progress' | 'sealed' | 'menu';

// Tab labels for normal and bambi modes
const getTabLabel = (id: Tab, isBambi: boolean): string => {
  const labels: Record<Tab, { normal: string; bambi: string }> = {
    protocol: { normal: 'Today', bambi: 'Instructions' },
    progress: { normal: 'Progress', bambi: 'Conditioning' },
    sealed: { normal: 'Sealed', bambi: 'Secrets' },
    menu: { normal: 'More', bambi: 'More' },
  };
  return isBambi ? labels[id].bambi : labels[id].normal;
};

function Navigation({
  activeTab,
  onTabChange,
  completedCount,
  totalCount
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  completedCount?: number;
  totalCount?: number;
}) {
  const { isBambiMode } = useBambiMode();

  const tabs: { id: Tab; icon: React.ElementType; bambiIcon?: React.ElementType }[] = [
    { id: 'protocol', icon: CheckSquare, bambiIcon: Heart },
    { id: 'progress', icon: TrendingUp },
    { id: 'sealed', icon: Gift },
    { id: 'menu', icon: Menu },
  ];

  return (
    <nav aria-label="Main navigation" className={`fixed bottom-0 left-0 right-0 backdrop-blur-lg border-t z-40 ${
      isBambiMode
        ? 'bg-white/95 border-pink-200'
        : 'bg-protocol-surface/95 border-protocol-border'
    }`}>
      <div className="max-w-lg mx-auto px-4 py-2">
        <div className="flex items-center justify-around">
          {tabs.map(tab => {
            const Icon = isBambiMode && tab.bambiIcon ? tab.bambiIcon : tab.icon;
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === 'protocol' &&
              totalCount !== undefined &&
              completedCount !== undefined &&
              completedCount < totalCount;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-colors ${
                  isActive
                    ? isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                    : isBambiMode ? 'text-pink-400 hover:text-pink-600' : 'text-protocol-text-muted hover:text-protocol-text'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-2' : ''}`} />
                  {/* Completion badge for Today tab */}
                  {showBadge && (
                    <span className={`absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white rounded-full ${
                      isBambiMode ? 'bg-pink-500' : 'bg-amber-500'
                    }`}>
                      {completedCount}/{totalCount}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium">{getTabLabel(tab.id, isBambiMode)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function formatHeaderTime(): string {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = days[now.getDay()];
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${day} ${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

function Header() {
  const { userName } = useProtocol();
  const { isBambiMode, getGreeting } = useBambiMode();
  const [timeLabel, setTimeLabel] = useState(formatHeaderTime());

  useEffect(() => {
    const timer = setInterval(() => setTimeLabel(formatHeaderTime()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleSettingsClick = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-settings'));
  };

  return (
    <header className={`sticky top-0 backdrop-blur-lg border-b z-40 ${
      isBambiMode
        ? 'bg-white/95 border-pink-200'
        : 'bg-protocol-bg/95 border-protocol-border'
    }`}>
      <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-400 to-pink-600'
              : 'bg-gradient-to-br from-protocol-accent to-protocol-accent-soft'
          }`}>
            <span className="text-white text-lg">{isBambiMode ? '💕' : '✨'}</span>
          </div>
          <div>
            <span className={`text-lg font-semibold block ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              {isBambiMode ? getGreeting() : 'Becoming'}
            </span>
            <p className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              {isBambiMode && userName ? userName : timeLabel}
            </p>
          </div>
        </div>
        <button
          onClick={handleSettingsClick}
          aria-label="Settings"
          className={`p-2 rounded-lg transition-colors ${
            isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
          }`}
        >
          <Settings className={`w-5 h-5 ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`} />
        </button>
      </div>
    </header>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-protocol-bg flex flex-col items-center justify-center">
      <Loader2 className="w-10 h-10 text-protocol-accent animate-spin mb-4" />
      <p className="text-protocol-text-muted text-sm">Loading...</p>
    </div>
  );
}

type MenuSubView = 'history' | 'investments' | 'wishlist' | 'settings' | 'help' | 'sessions' | 'quiz' | 'timeline' | 'gina' | 'gina-pipeline' | 'service' | 'service-analytics' | 'content' | 'domains' | 'patterns' | 'curation' | 'seeds' | 'vectors' | 'trigger-audit' | 'voice-game' | 'voice-drills' | 'dashboard' | 'journal' | 'protocol-analytics' | 'handler-autonomous' | 'exercise' | 'her-world' | 'vault-swipe' | 'vault-permissions' | 'content-dashboard' | 'cam-session' | 'hypno-session' | null;

function AuthenticatedAppInner() {
  const { currentEntry, isLoading, investmentMilestone, dismissInvestmentMilestone, userName, progress } = useProtocol();
  const { isBambiMode } = useBambiMode();
  const rewardContext = useRewardOptional();
  const { currentIntervention, dismissIntervention, completeIntervention, respondToIntervention } = useHandlerContext();

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
    inactivityThresholdMs: 10 * 60 * 1000, // 10 minutes
    enabled: true,
  });

  // Morning/Evening bookend system
  const bookends = useBookends();

  // Micro-task identity reinforcement
  const microTasks = useMicroTasks();

  const [activeTab, setActiveTab] = useState<Tab>('protocol');
  const [menuSubView, setMenuSubView] = useState<MenuSubView>(null);
  const [showMorningFlow, setShowMorningFlow] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [editIntakeMode, setEditIntakeMode] = useState(false);
  const [editIntakeProfile, setEditIntakeProfile] = useState<Partial<UserProfile> | null>(null);
  const [showSleepContent, setShowSleepContent] = useState(false);

  // Feminization reminders - all day presence
  const {
    currentReminder,
    respondToReminder,
    skipReminder,
    dismissReminder,
  } = useReminders();

  // Pattern catch notifications - proactive pattern awareness
  usePatternNotifications({ enabled: true });

  // Orchestrated modals - prevents modal stacking, shows one at a time
  useOrchestratedModals({
    currentReminder,
    onRespondReminder: respondToReminder,
    onSkipReminder: skipReminder,
    onDismissReminder: dismissReminder,
    currentIntervention,
    onCompleteIntervention: completeIntervention,
    onDismissIntervention: dismissIntervention,
    onRespondIntervention: respondToIntervention,
    recoveryTriggered: recovery.isTriggered,
    recoveryPrompt: recovery.currentPrompt,
    recoveryEscalationLevel: recovery.escalationLevel,
    recoveryConsecutiveIgnores: recovery.consecutiveIgnores,
    onCompleteRecovery: recovery.completeRecovery,
    onDismissRecovery: recovery.dismissRecovery,
    investmentMilestone,
    onDismissInvestmentMilestone: dismissInvestmentMilestone,
    achievementEvent: rewardContext?.achievementUnlockedEvent || null,
    onDismissAchievement: rewardContext?.dismissAchievementUnlocked || (() => {}),
    levelUpEvent: rewardContext?.levelUpEvent || null,
    onDismissLevelUp: rewardContext?.dismissLevelUp || (() => {}),
  });

  // Task bank, goals, and weekend for nav badge - same source as TodayView
  const { todayTasks } = useTaskBank();
  const { todaysGoals } = useGoals();
  const { todaysActivities } = useWeekend();

  // Task completion tracking for nav badge - combining tasks, goals, and weekend activities like TodayView does
  const taskBankCompleted = todayTasks.filter(t => t.status === 'completed').length;
  const taskBankTotal = todayTasks.length;
  const goalsCompleted = todaysGoals.filter(g => g.completedToday).length;
  const goalsTotal = todaysGoals.length;
  const weekendCompleted = todaysActivities.filter(a => a.status === 'completed').length;
  const weekendTotal = todaysActivities.length;

  const completedCount = taskBankCompleted + goalsCompleted + weekendCompleted;
  const totalCount = taskBankTotal + goalsTotal + weekendTotal;

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
    window.addEventListener('navigate-to-investments', handleNavigateToInvestments);
    window.addEventListener('navigate-to-wishlist', handleNavigateToWishlist);
    window.addEventListener('navigate-to-settings', handleNavigateToSettings);
    window.addEventListener('navigate-to-handler', handleNavigateToHandler);
    window.addEventListener('navigate-to-exercise', handleNavigateToExercise);
    window.addEventListener('navigate-to-cam', handleNavigateToCam);
    window.addEventListener('navigate-to-hypno', handleNavigateToHypno);
    return () => {
      window.removeEventListener('navigate-to-investments', handleNavigateToInvestments);
      window.removeEventListener('navigate-to-wishlist', handleNavigateToWishlist);
      window.removeEventListener('navigate-to-settings', handleNavigateToSettings);
      window.removeEventListener('navigate-to-handler', handleNavigateToHandler);
      window.removeEventListener('navigate-to-exercise', handleNavigateToExercise);
      window.removeEventListener('navigate-to-cam', handleNavigateToCam);
      window.removeEventListener('navigate-to-hypno', handleNavigateToHypno);
    };
  }, []);

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
      setShowMorningFlow(!hasEntryToday);
    }
  }, [isLoading, currentEntry, showOnboarding]);

  // Handle tab change - no restrictions, all tabs accessible
  const handleTabChange = (newTab: Tab) => {
    // Reset menu sub-view when switching tabs
    setMenuSubView(null);
    setActiveTab(newTab);
  };

  // Handle menu navigation
  const handleMenuNavigate = (view: MenuSubView) => {
    setMenuSubView(view);
  };

  // Handle back from menu sub-view
  const handleBackFromSubView = () => {
    setMenuSubView(null);
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
  if (bookends.showMorningBookend && bookends.config) {
    return (
      <MorningBookend
        name={bookends.config.morningName}
        denialDay={progress?.totalDays ?? 0}
        streak={progress?.overallStreak ?? 0}
        message={bookends.morningMessage}
        onDismiss={bookends.dismissMorning}
      />
    );
  }

  // Show morning flow if no entry for today
  if (showMorningFlow) {
    return <MorningFlow onComplete={() => setShowMorningFlow(false)} />;
  }

  // Show compulsory gate if app is locked (Feature 38)
  if (compulsoryLocked) {
    return (
      <CompulsoryGateScreen
        daysOnProtocol={daysOnProtocol}
        onUnlock={refreshCompulsoryGate}
      />
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
          <div>
            <button
              onClick={handleBackFromSubView}
              className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              &larr; Back to Menu
            </button>
            <SessionLauncher />
          </div>
        );
      case 'exercise':
        return <WorkoutSessionPage onBack={handleBackFromSubView} />;
      case 'her-world':
        return <HerWorldPage onBack={handleBackFromSubView} />;
      case 'vault-swipe':
        return (
          <VaultSwipe
            onBack={handleBackFromSubView}
            onManagePermissions={() => setMenuSubView('vault-permissions')}
          />
        );
      case 'vault-permissions':
        return <PermissionsManager onBack={() => setMenuSubView('vault-swipe')} />;
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
            onAffirmationGame={() => setMenuSubView('voice-game')}
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

  return (
    <div className={`min-h-screen ${isBambiMode ? 'bambi-mode' : 'bg-protocol-bg'}`}>
      <Header />

      <main className="max-w-lg mx-auto px-4 py-6 pb-24">
        <ErrorBoundary componentName="TodayView">
          {activeTab === 'protocol' && <TodayView />}
        </ErrorBoundary>
        <ErrorBoundary componentName="ProgressDashboard">
          {activeTab === 'progress' && <ProgressDashboard />}
        </ErrorBoundary>
        <ErrorBoundary componentName="SealedContent">
          {activeTab === 'sealed' && <SealedContentView />}
        </ErrorBoundary>
        <ErrorBoundary componentName="Menu">
          {activeTab === 'menu' && renderMenuSubView()}
        </ErrorBoundary>
      </main>

      {/* Moment Logger FAB - Quick euphoria/dysphoria logging */}
      <MomentLoggerFAB />

      {/* Unified Notification Toast Stack */}
      <NotificationToastStack position="top" maxVisible={3} />

      <Navigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        completedCount={completedCount}
        totalCount={totalCount}
      />

      {/* Floating hearts for Bambi mode celebrations */}
      <FloatingHearts />

      {/* Micro-task card overlay */}
      {microTasks.activeMicro && (
        <MicroTaskCard
          micro={microTasks.activeMicro}
          onComplete={microTasks.completeMicro}
          onSkip={microTasks.skipMicro}
        />
      )}

      {/* Evening Bookend overlay */}
      {bookends.showEveningBookend && bookends.daySummary && bookends.config && (
        <EveningBookend
          name={bookends.config.morningName}
          message={bookends.eveningMessage}
          summary={bookends.daySummary}
          onDismiss={bookends.dismissEvening}
          onJournal={() => {
            bookends.dismissEvening();
            setActiveTab('menu');
            setMenuSubView('journal');
          }}
          onSleepContent={() => {
            bookends.dismissEvening();
            setShowSleepContent(true);
          }}
        />
      )}

      {/* Sleep Content Player overlay */}
      {showSleepContent && (
        <SleepContentPlayer onDismiss={() => setShowSleepContent(false)} />
      )}

      {/* Modals (Investment, Achievement, LevelUp, Reminder, Intervention, Recovery)
          are now rendered via useOrchestratedModals - only one shows at a time */}
    </div>
  );
}

// Wrapper component that provides BambiMode, Reward, Handler, Modal, and Debug contexts
function AuthenticatedApp() {
  return (
    <DebugModeProvider>
      <BambiModeProvider>
        <RewardProvider>
          <HandlerProvider
            autoGeneratePlan={true}
            enableBackgroundChecks={true}
          >
            <ModalOrchestratorProvider>
              <AmbushProvider>
                <AuthenticatedAppInner />
              </AmbushProvider>
            </ModalOrchestratorProvider>
          </HandlerProvider>
        </RewardProvider>
      </BambiModeProvider>
    </DebugModeProvider>
  );
}

export default function App() {
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
