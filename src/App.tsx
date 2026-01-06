import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { ProtocolProvider, useProtocol } from './context/ProtocolContext';
import { BambiModeProvider, useBambiMode, FloatingHearts } from './context/BambiModeContext';
import { RewardProvider, useRewardOptional } from './context/RewardContext';
import { DebugModeProvider } from './context/DebugContext';
import { HandlerProvider, useHandlerContext } from './context/HandlerContext';
import { AmbushProvider } from './components/ambush';
import { InterventionNotification } from './components/handler/InterventionNotification';
import { RecoveryPrompt } from './components/handler/RecoveryPrompt';
import { useDisassociationRecovery } from './hooks/useDisassociationRecovery';
import { Auth } from './components/Auth';
import { MorningFlow } from './components/MorningFlow';
import { TodayView } from './components/today';
import { ProgressDashboard } from './components/ProgressDashboard';
import { History } from './components/History';
import { SealedContentView } from './components/SealedContent';
import { MenuView } from './components/MenuView';
import { OnboardingFlow } from './components/Onboarding';
// DayIncompleteModal removed - navigation is now unrestricted
import { InvestmentMilestoneModal } from './components/investments';
import { SharedWishlistView } from './components/wishlist';
import { AchievementModal, RewardLevelUpModal } from './components/rewards';
import { SettingsView } from './components/settings';
import { SessionLauncher } from './components/sessions';
import { KinkQuizView } from './components/kink-quiz';
import { MomentLoggerFAB } from './components/moment-logger';
import { ReminderModal } from './components/reminders';
import { useReminders } from './hooks/useReminders';
import { TimelineView } from './components/timeline';
import { GinaEmergenceView } from './components/gina';
import { ServiceProgressionView } from './components/service';
import { ContentEscalationView } from './components/content';
import { getTodayDate } from './lib/protocol';
import { profileStorage, letterStorage } from './lib/storage';
import type { UserProfile, SealedLetter } from './components/Onboarding/types';
import {
  CheckSquare,
  TrendingUp,
  Loader2,
  Settings,
  RotateCcw,
  LogOut,
  Gift,
  User,
  Check,
  X,
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
    <nav className={`fixed bottom-0 left-0 right-0 backdrop-blur-lg border-t z-40 ${
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

function Header() {
  const { resetProgress, userName, updateUserName } = useProtocol();
  const { signOut, user } = useAuth();
  const { isBambiMode, getGreeting } = useBambiMode();
  const [showSettings, setShowSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(userName || '');

  const handleReset = async () => {
    await resetProgress();
    setConfirmReset(false);
    setShowSettings(false);
    window.location.reload();
  };

  const handleSignOut = async () => {
    await signOut();
    setShowSettings(false);
  };

  const handleSaveName = async () => {
    if (newName.trim()) {
      await updateUserName(newName.trim());
    }
    setEditingName(false);
  };

  const handleCancelName = () => {
    setNewName(userName || '');
    setEditingName(false);
  };

  return (
    <>
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
              <h1 className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}>
                {isBambiMode ? getGreeting() : 'Becoming'}
              </h1>
              <p className={`text-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}>
                {isBambiMode && userName ? userName : 'Protocol'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
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

      {/* Settings dropdown */}
      {showSettings && (
        <div className="fixed inset-0 z-50" onClick={() => setShowSettings(false)}>
          <div
            className="absolute top-16 right-4 w-64 bg-protocol-surface border border-protocol-border rounded-lg shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3 border-b border-protocol-border">
              <p className="text-sm font-medium text-protocol-text">Settings</p>
              <p className="text-xs text-protocol-text-muted truncate mt-1">
                {user?.email}
              </p>
            </div>

            {/* Name editing */}
            <div className="p-3 border-b border-protocol-border">
              {!editingName ? (
                <button
                  onClick={() => {
                    setNewName(userName || '');
                    setEditingName(true);
                  }}
                  className="w-full flex items-center gap-3 hover:bg-protocol-surface-light transition-colors text-left rounded-lg p-1 -m-1"
                >
                  <User className="w-4 h-4 text-protocol-text-muted" />
                  <div className="flex-1">
                    <span className="text-sm text-protocol-text">
                      {userName || 'Add your name'}
                    </span>
                    {!userName && (
                      <p className="text-xs text-protocol-text-muted">Tap to add</p>
                    )}
                  </div>
                </button>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Your name..."
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg bg-protocol-surface-light border border-protocol-border text-protocol-text text-sm placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelName}
                      className="flex-1 py-1.5 px-2 text-xs rounded bg-protocol-surface-light text-protocol-text-muted flex items-center justify-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveName}
                      disabled={!newName.trim()}
                      className={`flex-1 py-1.5 px-2 text-xs rounded flex items-center justify-center gap-1 ${
                        newName.trim()
                          ? 'bg-protocol-accent text-white'
                          : 'bg-protocol-surface-light text-protocol-text-muted'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleSignOut}
              className="w-full p-3 flex items-center gap-3 hover:bg-protocol-surface-light transition-colors text-left border-b border-protocol-border"
            >
              <LogOut className="w-4 h-4 text-protocol-text-muted" />
              <span className="text-sm text-protocol-text">Sign Out</span>
            </button>

            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="w-full p-3 flex items-center gap-3 hover:bg-protocol-surface-light transition-colors text-left"
              >
                <RotateCcw className="w-4 h-4 text-protocol-danger" />
                <span className="text-sm text-protocol-danger">Reset All Progress</span>
              </button>
            ) : (
              <div className="p-3 space-y-3">
                <p className="text-xs text-protocol-text-muted">
                  This will delete all your data. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="flex-1 py-2 px-3 text-xs font-medium rounded bg-protocol-surface-light text-protocol-text"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 py-2 px-3 text-xs font-medium rounded bg-protocol-danger text-white"
                  >
                    Delete All
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
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

type MenuSubView = 'history' | 'investments' | 'wishlist' | 'settings' | 'help' | 'sessions' | 'quiz' | 'timeline' | 'gina' | 'service' | 'content' | null;

function AuthenticatedAppInner() {
  const { currentEntry, isLoading, investmentMilestone, dismissInvestmentMilestone, userName } = useProtocol();
  const { isBambiMode } = useBambiMode();
  const rewardContext = useRewardOptional();
  const { currentIntervention, dismissIntervention, completeIntervention, respondToIntervention } = useHandlerContext();

  // Disassociation recovery - detects when you zone out
  const recovery = useDisassociationRecovery({
    inactivityThresholdMs: 10 * 60 * 1000, // 10 minutes
    enabled: true,
  });

  const [activeTab, setActiveTab] = useState<Tab>('protocol');
  const [menuSubView, setMenuSubView] = useState<MenuSubView>(null);
  const [showMorningFlow, setShowMorningFlow] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [editIntakeMode, setEditIntakeMode] = useState(false);
  const [editIntakeProfile, setEditIntakeProfile] = useState<Partial<UserProfile> | null>(null);

  // Feminization reminders - all day presence
  const {
    currentReminder,
    respondToReminder,
    skipReminder,
    dismissReminder,
  } = useReminders();

  // Task completion tracking for nav badge
  const completedCount = currentEntry?.tasks.filter(t => t.completed).length ?? 0;
  const totalCount = currentEntry?.tasks.length ?? 0;

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
    window.addEventListener('navigate-to-investments', handleNavigateToInvestments);
    window.addEventListener('navigate-to-wishlist', handleNavigateToWishlist);
    return () => {
      window.removeEventListener('navigate-to-investments', handleNavigateToInvestments);
      window.removeEventListener('navigate-to-wishlist', handleNavigateToWishlist);
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

  if (isLoading || showOnboarding === null) {
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

  // Show morning flow if no entry for today
  if (showMorningFlow) {
    return <MorningFlow onComplete={() => setShowMorningFlow(false)} />;
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
      case 'quiz':
        return <KinkQuizView onBack={handleBackFromSubView} />;
      case 'timeline':
        return <TimelineView onBack={handleBackFromSubView} userName={userName ?? undefined} />;
      case 'gina':
        return <GinaEmergenceView onBack={handleBackFromSubView} />;
      case 'service':
        return <ServiceProgressionView onBack={handleBackFromSubView} />;
      case 'content':
        return <ContentEscalationView onBack={handleBackFromSubView} />;
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
        {activeTab === 'protocol' && <TodayView />}
        {activeTab === 'progress' && <ProgressDashboard />}
        {activeTab === 'sealed' && <SealedContentView />}
        {activeTab === 'menu' && renderMenuSubView()}
      </main>

      {/* Moment Logger FAB - Quick euphoria/dysphoria logging */}
      <MomentLoggerFAB />

      <Navigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        completedCount={completedCount}
        totalCount={totalCount}
      />

      {/* Floating hearts for Bambi mode celebrations */}
      <FloatingHearts />

      {/* Investment Milestone Celebration */}
      {investmentMilestone && (
        <InvestmentMilestoneModal
          milestone={investmentMilestone}
          onDismiss={dismissInvestmentMilestone}
        />
      )}

      {/* Achievement Unlocked Celebration */}
      {rewardContext?.achievementUnlockedEvent && (
        <AchievementModal
          achievement={rewardContext.achievementUnlockedEvent.achievement}
          pointsAwarded={rewardContext.achievementUnlockedEvent.pointsAwarded}
          onDismiss={rewardContext.dismissAchievementUnlocked}
        />
      )}

      {/* Level Up Celebration */}
      {rewardContext?.levelUpEvent && (
        <RewardLevelUpModal
          newLevel={rewardContext.levelUpEvent.to}
          newTitle={rewardContext.levelUpEvent.newTitle}
          onDismiss={rewardContext.dismissLevelUp}
        />
      )}

      {/* Feminization Reminder - All Day Presence */}
      {currentReminder && (
        <ReminderModal
          reminder={currentReminder}
          onRespond={respondToReminder}
          onSkip={skipReminder}
          onDismiss={dismissReminder}
        />
      )}

      {/* Handler AI Intervention */}
      {currentIntervention && (
        <InterventionNotification
          intervention={currentIntervention}
          onComplete={completeIntervention}
          onDismiss={dismissIntervention}
          onResponse={respondToIntervention}
        />
      )}

      {/* Disassociation Recovery Prompt */}
      {recovery.isTriggered && recovery.currentPrompt && (
        <RecoveryPrompt
          prompt={recovery.currentPrompt}
          escalationLevel={recovery.escalationLevel}
          consecutiveIgnores={recovery.consecutiveIgnores}
          onComplete={recovery.completeRecovery}
          onDismiss={recovery.dismissRecovery}
        />
      )}
    </div>
  );
}

// Wrapper component that provides BambiMode, Reward, Handler, and Debug contexts
function AuthenticatedApp() {
  return (
    <DebugModeProvider>
      <BambiModeProvider>
        <RewardProvider>
          <HandlerProvider>
            <AmbushProvider>
              <AuthenticatedAppInner />
            </AmbushProvider>
          </HandlerProvider>
        </RewardProvider>
      </BambiModeProvider>
    </DebugModeProvider>
  );
}

export default function App() {
  const { user, isLoading } = useAuth();
  const [wishlistToken, setWishlistToken] = useState<string | null>(() => parseWishlistToken());

  // Listen for hash changes (for shared wishlist navigation)
  useEffect(() => {
    const handleHashChange = () => {
      setWishlistToken(parseWishlistToken());
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

  if (!user) {
    return <Auth />;
  }

  return (
    <ProtocolProvider>
      <AuthenticatedApp />
    </ProtocolProvider>
  );
}
