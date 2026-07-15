import { useState, useEffect, Suspense, lazy } from 'react';
import { getPendingOutreach, evaluateAndQueueOutreach } from './lib/outreach/engine';
import { HandlerParameters } from './lib/handler-parameters';
import { useAuth } from './context/AuthContext';
import { ProtocolProvider, useProtocol } from './context/ProtocolContext';
import { BambiModeProvider, FloatingHearts } from './context/BambiModeContext';
import { RewardProvider, useRewardOptional } from './context/RewardContext';
import { DebugModeProvider } from './context/DebugContext';
import { OpacityProvider } from './context/OpacityContext';
import { HandlerProvider, useHandlerContext } from './context/HandlerContext';
import { AmbushProvider } from './components/ambush';
import { ModalOrchestratorProvider } from './context/ModalOrchestrator';
import { AftercareProvider } from './context/AftercareContext';
import { SafewordResumeBanner } from './components/aftercare/SafewordResumeBanner';
import { BedtimeRitualProvider } from './context/BedtimeRitualContext';
import { useOrchestratedModals } from './hooks/useOrchestratedModals';
import { useDisassociationRecovery } from './hooks/useDisassociationRecovery';
import { useCompulsoryGate } from './hooks/useCompulsoryGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useStealthSettings } from './hooks/useStealthSettings';
import { loadOnboardingState } from './lib/onboarding/storage';
import { ForceStatusStrip } from './components/force/ForceStatusStrip';
import { usePunishmentNotifications } from './hooks/usePunishmentNotifications';
import { useBookends } from './hooks/useBookends';
import { useSubliminalUI } from './hooks/useSubliminalUI';
import { usePostReleaseProtocol } from './hooks/usePostReleaseProtocol';
import { useArousalState } from './hooks/useArousalState';
import type { OrgasmLogInput } from './types/arousal';
import { useReminders } from './hooks/useReminders';
import { usePatternNotifications } from './hooks/usePatternNotifications';
import { useNotificationActionRouter } from './hooks/useNotificationActionRouter';
import { profileStorage, letterStorage } from './lib/storage';
import type { UserProfile, SealedLetter } from './components/Onboarding/types';
import { Loader2 } from 'lucide-react';

const PrivacyPage = lazy(() => import('./components/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const HandlerChat = lazy(() => import('./components/handler/HandlerChat').then((m) => ({ default: m.HandlerChat })));
const Auth = lazy(() => import('./components/Auth').then((m) => ({ default: m.Auth })));
const SanitizedFitnessHome = lazy(() => import('./components/stealth').then((m) => ({ default: m.SanitizedFitnessHome })));
const StealthShell = lazy(() => import('./components/stealth').then((m) => ({ default: m.StealthShell })));
const MenuView = lazy(() => import('./components/MenuView').then((m) => ({ default: m.MenuView })));
const OnboardingFlow = lazy(() => import('./components/Onboarding').then((m) => ({ default: m.OnboardingFlow })));
const OnboardingWizard = lazy(() => import('./components/onboarding-welcome').then((m) => ({ default: m.OnboardingWizard })));
const SharedWishlistView = lazy(() => import('./components/wishlist').then((m) => ({ default: m.SharedWishlistView })));
const TodayRedesignView = lazy(() => import('./components/today-redesign').then((m) => ({ default: m.TodayView })));
const WhisperToMama = lazy(() => import('./components/confession/WhisperToMama').then((m) => ({ default: m.WhisperToMama })));
const LivePhotoPingResponder = lazy(() => import('./components/live-photo/LivePhotoPingResponder').then((m) => ({ default: m.LivePhotoPingResponder })));
const MamaPhoneOverlay = lazy(() => import('./components/push/MamaPhoneOverlay').then((m) => ({ default: m.MamaPhoneOverlay })));
const EveningDebrief = lazy(() => import('./components/EveningDebrief').then((m) => ({ default: m.EveningDebrief })));
const OrgasmLogModal = lazy(() => import('./components/arousal/OrgasmLogModal').then((m) => ({ default: m.OrgasmLogModal })));
const PostReleaseOverlay = lazy(() => import('./components/post-release/PostReleaseOverlay').then((m) => ({ default: m.PostReleaseOverlay })));
const DeletionInterceptModal = lazy(() => import('./components/post-release/DeletionInterceptModal').then((m) => ({ default: m.DeletionInterceptModal })));
const SleepContentPlayer = lazy(() => import('./components/sleep-content').then((m) => ({ default: m.SleepContentPlayer })));
const ConditioningPlayer = lazy(() => import('./components/conditioning').then((m) => ({ default: m.ConditioningPlayer })));

// ── Navigation: ONE store + ONE registry ────────────────────────────────────
// All screen selection lives in src/navigation. The store owns the single
// hashchange/popstate listeners and the legacy CustomEvent adapters; the
// registry is the declarative id → view map (menu grouping, deep links,
// sanitized whitelist, render). App.tsx just renders what the store says.
import {
  useNav, initNavigation, navigate, openMenu, goHome, goChat, back,
  openRecap, setSanitizedMode,
} from './navigation/store';
import { VIEW_REGISTRY, isSanitizedAllowed, type ViewRenderContext } from './navigation/registry';
import { SubViewFrame } from './navigation/SubViewFrame';

// Parse hash route for shared wishlist (pre-auth surface — not nav-store owned)
function parseWishlistToken(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/#\/wishlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-protocol-bg">
      <Loader2 className="w-10 h-10 text-protocol-accent animate-spin mb-4" />
      <p className="text-protocol-accent text-sm">Loading...</p>
    </div>
  );
}

function AuthenticatedAppInner() {
  const { isLoading, investmentMilestone, dismissInvestmentMilestone, userName, progress } = useProtocol();
  const rewardContext = useRewardOptional();
  const { dismissIntervention, completeIntervention, respondToIntervention } = useHandlerContext();
  const { settings: stealthSettings, loading: stealthSettingsLoading } = useStealthSettings();
  const sanitizedFitnessMode = stealthSettings.sanitized_fitness_mode;

  // ── Navigation ────────────────────────────────────────────────────────────
  const nav = useNav();
  useEffect(() => initNavigation(), []);
  // Stealth flag → store (rewrites a disallowed live view to the menu).
  useEffect(() => {
    setSanitizedMode(sanitizedFitnessMode);
  }, [sanitizedFitnessMode]);

  // Calculate days on protocol from total days in progress (minimum of 1)
  const daysOnProtocol = Math.max(1, progress?.totalDays ?? 1);

  // Compulsory gate retained only for its load-state (so the app doesn't flash
  // before daily state resolves). The blocking lockout screen it used to drive
  // was removed 2026-06-21 — Mama presses via FocusMode, she doesn't bar entry.
  const { isLoading: compulsoryLoading } = useCompulsoryGate(daysOnProtocol);

  // Disassociation recovery - detects when you zone out
  const recovery = useDisassociationRecovery({
    inactivityThresholdMs: 10 * 60 * 1000,
    enabled: false, // Disabled — user found recovery prompts disruptive
  });

  // Morning/Evening bookend system
  const bookends = useBookends();

  // Subliminal UI reinforcement (P12.8) — progressive CSS shifts over months
  useSubliminalUI();

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

  // Force-layer punishment notifications (polls every 60s)
  usePunishmentNotifications();

  // Actionable-push router: completes the outreach when the user taps a
  // notification action (or hits the iOS / token-expired deep-link fallback)
  // and keeps the SW's auth token fresh. Deep-link contract: ?complete_outreach.
  useNotificationActionRouter();

  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  // Welcome wizard — kink-companion onboarding (persona/intensity/safeword/aftercare).
  // Independent of the legacy intake `OnboardingFlow`; runs after it. Null = not
  // yet checked; true = needs to run; false = already done.
  const [showWelcome, setShowWelcome] = useState<boolean | null>(null);
  const [editIntakeMode, setEditIntakeMode] = useState(false);
  const [editIntakeProfile, setEditIntakeProfile] = useState<Partial<UserProfile> | null>(null);
  const [showSleepContent, setShowSleepContent] = useState(false);
  const [pendingOutreach, setPendingOutreach] = useState<{ id: string; openingLine: string } | null>(null);

  // Failsafe: force past loading after 10 seconds
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLoadingTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, []);

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

  // Check for pending Handler outreach on load + poll every 60s so queued
  // force-layer messages (Hard Mode entry, chastity milestones, etc.) surface.
  const { user: authUser } = useAuth();
  useEffect(() => {
    if (!authUser?.id) return;
    const user = authUser;

    const check = () => {
      getPendingOutreach(user.id).then(o => {
        if (!o) return;
        // OutreachMessage.message is the text; map to openingLine for HandlerChat
        const line = (o as unknown as { message?: string; openingLine?: string }).message
          || (o as unknown as { openingLine?: string }).openingLine
          || '';
        if (line) setPendingOutreach({ id: o.id, openingLine: line });
      }).catch(() => {});
    };
    check();
    const iv = setInterval(check, 60_000);

    // Evaluate if new outreach should fire
    const params = new HandlerParameters(user.id);
    evaluateAndQueueOutreach(user.id, params).then(result => {
      if (result.queued && result.line) {
        setPendingOutreach({ id: '', openingLine: result.line });
      }
    }).catch(() => {});

    return () => clearInterval(iv);
  }, [authUser?.id]);

  // Feminization reminders - all day presence
  const {
    respondToReminder,
    skipReminder,
    dismissReminder,
  } = useReminders();

  // Pattern notifications disabled — user found pop-ups disruptive
  usePatternNotifications({ enabled: false });

  // Orchestrated modals - prevents modal stacking, shows one at a time
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

  // Release-log modal — event-opened (FocusMode / decree surfaces dispatch it).
  useEffect(() => {
    const handleOpenReleaseLog = () => setShowOrgasmLog(true);
    window.addEventListener('open-release-log', handleOpenReleaseLog);
    return () => window.removeEventListener('open-release-log', handleOpenReleaseLog);
  }, []);

  // Handle starting edit intake mode
  const handleEditIntake = async () => {
    try {
      const profile = await profileStorage.getProfile();
      setEditIntakeProfile(profile || {});
      setEditIntakeMode(true);
    } catch (error) {
      console.error('Error loading profile for edit:', error);
      setEditIntakeProfile({});
      setEditIntakeMode(true);
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

  // Check if onboarding is complete
  useEffect(() => {
    async function checkOnboarding() {
      const isComplete = await profileStorage.isOnboardingComplete();
      setShowOnboarding(!isComplete);
    }
    checkOnboarding();
  }, []);

  // Check if welcome wizard (kink-companion onboarding) is complete.
  // Runs after the legacy intake — only checked once authUser is known.
  const authUserId = authUser?.id;
  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    loadOnboardingState(authUserId)
      .then(s => { if (!cancelled) setShowWelcome(!s.completedAt); })
      .catch(() => { if (!cancelled) setShowWelcome(false); });
    return () => { cancelled = true; };
  }, [authUserId]);

  if ((isLoading || stealthSettingsLoading || showOnboarding === null || (showOnboarding === false && showWelcome === null) || compulsoryLoading) && !loadingTimedOut) {
    return <LoadingScreen />;
  }

  // Show onboarding if not complete
  if (showOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  // Show welcome wizard if first-run kink-companion onboarding hasn't
  // happened yet — runs AFTER the legacy intake. Also entered via the
  // `#/welcome` hash from Settings → Replay onboarding (nav.overlay).
  // The first check intentionally lets `null` (loading) fall through so
  // the user doesn't see a flash of Today before we know.
  const welcomeReplay = nav.overlay === 'welcome';
  if (
    !editIntakeMode &&
    showOnboarding === false &&
    (welcomeReplay || showWelcome === true) &&
    authUser?.id
  ) {
    return (
      <ErrorBoundary componentName="OnboardingWizard">
        <OnboardingWizard
          onComplete={() => {
            // If this was a replay, clear the hash + overlay (goHome). If it
            // was the first run, also flip the local flag so we don't re-mount.
            if (welcomeReplay) goHome();
            setShowWelcome(false);
          }}
        />
      </ErrorBoundary>
    );
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

  // ── Re-architecture 2026-06-21: the daily entry-gate wall is GONE. ──────────
  // Every former blocking gate's demand surfaces as the single task inside
  // FocusMode (overdue confession, decree, dose, mantra) and through push/
  // outreach. Mama presses; she does not bar the door.

  // Render the current registry view (was a 60-case switch).
  const renderView = () => {
    const viewId = sanitizedFitnessMode && !isSanitizedAllowed(nav.viewId) ? null : nav.viewId;
    if (viewId == null) {
      return <MenuView onNavigate={navigate} />;
    }
    const def = VIEW_REGISTRY[viewId];
    const ctx: ViewRenderContext = {
      onBack: back,
      navigate,
      recapId: nav.recapId,
      openRecap,
      userName: userName ?? undefined,
      onEditIntake: handleEditIntake,
      sanitized: sanitizedFitnessMode,
    };
    const content = def.render(ctx);
    if (def.frame === 'framed') {
      return (
        <SubViewFrame onBack={back} backLabel={def.backLabel}>
          {content}
        </SubViewFrame>
      );
    }
    return <>{content}</>;
  };

  const inView = nav.surface === 'view';
  const showWhisper = nav.overlay === 'whisper';

  if (sanitizedFitnessMode) {
    if (!inView) {
      return (
        <SanitizedFitnessHome
          onOpenBody={() => navigate('body')}
          onOpenBaselineIntake={() => navigate('baseline-intake')}
          onOpenMenu={() => openMenu()}
          onOpenSettings={() => navigate('settings')}
        />
      );
    }

    const content = <Suspense fallback={<LoadingScreen />}>{renderView()}</Suspense>;
    const framed = nav.viewId == null || nav.viewId === 'help';

    return (
      <div className="min-h-screen bg-protocol-bg">
        {framed ? (
          <div className="max-w-lg mx-auto px-4 py-4">
            <button
              onClick={() => goHome()}
              className="mb-4 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              &larr; Back to dashboard
            </button>
            {content}
          </div>
        ) : content}
      </div>
    );
  }

  if (nav.surface === 'home') {
    return (
      <>
        <TodayRedesignView onExit={() => goChat()} />
        {showWhisper && <WhisperToMama onClose={() => goHome()} />}
        <LivePhotoPingResponder />
        <MamaPhoneOverlay />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-protocol-bg">
      {/* PRIMARY: The Conversation — always visible unless a view is open */}
      {!inView && (
        <>
          <div className="hidden md:block">
            <ForceStatusStrip onNavigate={() => navigate('force')} />
          </div>
          <ErrorBoundary componentName="HandlerChat">
            <HandlerChat
              onClose={() => {}} // Can't close — it IS the app
              openingLine={pendingOutreach?.openingLine}
              onOpenSettings={() => openMenu()}
            />
          </ErrorBoundary>
        </>
      )}

      {/* VIEWS: registry screens — boxed column unless the view owns its layout */}
      {inView && (nav.viewId && VIEW_REGISTRY[nav.viewId]?.chrome === 'bare' ? (
        <Suspense fallback={<LoadingScreen />}>{renderView()}</Suspense>
      ) : (
        <div className="min-h-screen bg-protocol-bg">
          <div className="max-w-lg mx-auto px-4 py-4">
            <button
              onClick={() => goChat()}
              className="mb-4 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              &larr; Back to Handler
            </button>
            <Suspense fallback={<LoadingScreen />}>{renderView()}</Suspense>
          </div>
        </div>
      ))}

      <FloatingHearts />

      {/* Whisper-to-Mama — hash-routable via /#/whisper. Audio-only intimate
          confession surface. Mama processes async via confession-watcher-cron. */}
      {showWhisper && <WhisperToMama onClose={() => goHome()} />}

      {/* Live photo ping responder — self-gating overlay. */}
      <LivePhotoPingResponder />

      {/* Mama-phone overlay — force-prompts push registration when the
          user has no active push_subscriptions row. Self-gating. */}
      <MamaPhoneOverlay />

      {/* Whoop OAuth callback toast */}
      {whoopToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] animate-slide-down">
          <div className={`px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 ${
            whoopToast === 'connected'
              ? 'bg-protocol-success/20 border border-protocol-success/50 text-protocol-success'
              : 'bg-protocol-danger/20 border border-protocol-danger/50 text-protocol-danger'
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
          are rendered via useOrchestratedModals - only one shows at a time */}
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
                <AftercareProvider>
                  <BedtimeRitualProvider>
                    <AmbushProvider enabled={false}>
                      <SafewordResumeBanner />
                      <AuthenticatedAppInner />
                    </AmbushProvider>
                  </BedtimeRitualProvider>
                </AftercareProvider>
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
      <StealthShell>
        <ProtocolProvider>
          <AuthenticatedApp />
        </ProtocolProvider>
      </StealthShell>
    </ErrorBoundary>
  );
}

export default function App() {
  // Standalone pages (no auth required) — must be outside hook-using component
  return (
    <Suspense fallback={<LoadingScreen />}>
      {window.location.pathname === '/privacy' ? <PrivacyPage /> : <AppInner />}
    </Suspense>
  );
}
