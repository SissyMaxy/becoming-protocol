/**
 * VIEW_REGISTRY — the single source of truth for every navigable screen.
 *
 * One entry per view id. Everything that used to be five parallel systems
 * reads from here:
 *   - App renders a view via its `render` function (was a 60-case switch)
 *   - MenuView derives its groups from `menu` / `sanitizedMenu`
 *   - the nav store resolves hash deep-links via `hashPaths`
 *   - the nav store adapts legacy `navigate-to-*` CustomEvents via `legacyEvents`
 *   - sanitized/stealth mode allows a view iff `sanitizedAllowed`
 *
 * Adding a screen = adding ONE entry here. navigation-registry.test.ts locks
 * the invariants (unique hash paths, menu ids resolve, sanitized whitelist).
 */

import { useState, lazy, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Settings, HelpCircle, Calendar, Eye, FileText, Mail, PauseCircle,
  ArrowUpRight, Flame, Shirt, BarChart3, Camera, Clock, BookOpen, Heart,
  User, Sparkles, Headphones, Mic, Library, TrendingUp, ClipboardCheck,
} from 'lucide-react';

import { useBambiMode } from '../context/BambiModeContext';
import { ProgressDashboard } from '../components/ProgressDashboard';
import { History } from '../components/History';
import { BaselineIntakeView } from '../components/body/BaselineIntakeView';
import { BodyProtocolView } from '../components/today-redesign/BodyProtocolView';
import { SettingsView, SystemAuditView } from '../components/settings';
import { SanitizedSettingsView } from '../components/stealth';
import { WitnessManager, CaseFileView, SealedEnvelopesPage, QuitFrictionGate, EscalationLadder } from '../components/handler';
import { ForceDashboard } from '../components/force/ForceDashboard';
import { MommyDossierQuiz } from '../components/persona/MommyDossierQuiz';
import { MommyDossierStatus } from '../components/persona/MommyDossierStatus';
import { VerificationVault } from '../components/verification/VerificationVault';
import { SessionContainer } from '../components/session';
import type { SessionConfig } from '../components/session';
import { TimelineView } from '../components/timeline';
import { ServiceProgressionView, ServiceAnalyticsDashboard } from '../components/service';
import { ContentEscalationView, VaultSwipe } from '../components/content';
import { PermissionsManager } from '../components/content/PermissionsManager';
import { ContentDashboard } from '../components/admin/ContentDashboard';
import { DomainEscalationView } from '../components/domains';
import { PatternCatchView } from '../components/patterns';
import { TriggerAuditDashboard } from '../components/triggers';
import { TaskCurationView } from '../components/curation';
import { SeedsView } from '../components/seeds';
import { VectorGridView } from '../components/adaptive-feminization';
import { VoiceAffirmationGame } from '../components/voice-game';
import { VoiceDrillView } from '../components/voice-game/VoiceDrillView';
import { Dashboard } from '../components/dashboard';
import { WardrobeInventoryView } from '../components/wardrobe';
import { IdentitySettingsView } from '../components/identity';
import { TrajectoryArchiveView } from '../components/trajectory';
import { RecapsIndexView } from '../components/recaps/RecapsIndexView';
import { RecapDetailView } from '../components/recaps/RecapDetailView';
import { JournalView } from '../components/journal';
import { ProtocolAnalytics } from '../components/analytics/ProtocolAnalytics';
import { HandlerAutonomousView } from '../components/autonomous';
import { CamDashboard } from '../components/cam/CamDashboard';
import { HypnoDashboard, HypnoLearningView } from '../components/hypno';
import { ConditioningLibrary } from '../components/conditioning';
import { SocialMediaDashboard } from '../components/social/SocialMediaDashboard';
import { CommunityQueue, CommunityList, CommunityLog } from '../components/community';

const LettersArchiveView = lazy(() => import('../components/letters').then((m) => ({ default: m.LettersArchiveView })));
const LifeAsWomanView = lazy(() => import('../components/life-as-woman').then((m) => ({ default: m.LifeAsWomanView })));
const KinkQuizView = lazy(() => import('../components/kink-quiz').then((m) => ({ default: m.KinkQuizView })));
const WorkoutSessionPage = lazy(() => import('../components/exercise').then((m) => ({ default: m.WorkoutSessionPage })));
const HerWorldPage = lazy(() => import('../components/collections').then((m) => ({ default: m.HerWorldPage })));
const GoonSessionView = lazy(() => import('../components/sessions/GoonSessionView').then((m) => ({ default: m.GoonSessionView })));
const ContentCapture = lazy(() => import('../components/content/ContentCapture').then((m) => ({ default: m.ContentCapture })));
const PostingQueue = lazy(() => import('../components/content/PostingQueue').then((m) => ({ default: m.PostingQueue })));
const ContentCalendar = lazy(() => import('../components/content/ContentCalendar').then((m) => ({ default: m.ContentCalendar })));
const PlatformSettings = lazy(() => import('../components/content/PlatformSettings').then((m) => ({ default: m.PlatformSettings })));
const VaultView = lazy(() => import('../components/content/VaultView').then((m) => ({ default: m.VaultView })));
const FanDashboard = lazy(() => import('../components/content/FanDashboard').then((m) => ({ default: m.FanDashboard })));
const SubscriberPolls = lazy(() => import('../components/content/SubscriberPolls').then((m) => ({ default: m.SubscriberPolls })));
const RevenueView = lazy(() => import('../components/content/RevenueView').then((m) => ({ default: m.RevenueView })));

export type ViewId =
  | 'body' | 'baseline-intake' | 'history' | 'wishlist' | 'settings' | 'help'
  | 'sessions' | 'quiz' | 'timeline' | 'service' | 'service-analytics'
  | 'content' | 'domains' | 'patterns' | 'curation' | 'seeds' | 'vectors'
  | 'trigger-audit' | 'voice-game' | 'voice-drills' | 'dashboard' | 'journal'
  | 'protocol-analytics' | 'handler-autonomous' | 'exercise' | 'her-world'
  | 'vault-swipe' | 'vault-permissions' | 'vault-browser' | 'content-dashboard'
  | 'cam-session' | 'hypno-session' | 'hypno-learning' | 'goon-session'
  | 'content-capture' | 'content-queue' | 'content-calendar' | 'content-fans'
  | 'content-polls' | 'content-revenue' | 'content-settings'
  | 'conditioning-library' | 'social-dashboard' | 'witnesses' | 'case_file'
  | 'envelopes' | 'system_audit' | 'pause_protocol' | 'escalation_ladder'
  | 'force' | 'wardrobe' | 'trajectory' | 'mommy-dossier' | 'identity'
  | 'verification-vault' | 'community-queue' | 'community-list'
  | 'community-log' | 'letters' | 'dossier' | 'recaps' | 'recap-detail'
  | 'life-as-woman';

/** Old menuSubView ids that no longer exist, and where they land now. */
export const VIEW_ALIASES: Record<string, ViewId | null> = {
  investments: 'wishlist',     // both always rendered ProgressDashboard
  'log-release': null,         // dead special case — zero emitters existed
  'progress-page': null,       // set a tab that rendered nothing
  'sealed-page': null,         // SealedContentView was removed
};

/** Menu palette keys — MenuView maps these to its Velvet colors. */
export type MenuColor = 'rose' | 'roseSoft' | 'gold' | 'green' | 'danger' | 'muted';

export interface MenuEntry {
  heading: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: MenuColor;
  /** Folded into the collapsed "Everything else" tail. */
  archive?: boolean;
}

/** Everything a view render function may need from the app shell. */
export interface ViewRenderContext {
  onBack: () => void;
  navigate: (view: ViewId | null) => void;
  /** For 'recap-detail'. */
  recapId: string | null;
  /** Open a specific recap (sets the canonical hash + view). */
  openRecap: (id: string) => void;
  userName?: string;
  onEditIntake: () => void;
  sanitized: boolean;
}

export interface ViewDef {
  /**
   * 'framed'  — App wraps it in SubViewFrame (standard back affordance).
   * 'self'    — the component renders its own header/back via ctx.onBack.
   */
  frame: 'framed' | 'self';
  /** SubViewFrame back-button label; default "Back to Menu". */
  backLabel?: string;
  /** 'bare' views escape the boxed max-w-lg settings column (own layout). */
  chrome?: 'boxed' | 'bare';
  menu?: MenuEntry;
  /** Menu entry when sanitized/stealth mode is on (different copy). */
  sanitizedMenu?: MenuEntry;
  /** Reachable while sanitized_fitness_mode is on. Default false. */
  sanitizedAllowed?: boolean;
  /** Hash paths (without '#') that deep-link here, e.g. '/journal'. */
  hashPaths?: string[];
  /** Legacy window CustomEvent names that navigate here. */
  legacyEvents?: string[];
  render: (ctx: ViewRenderContext) => ReactNode;
}

/** Session picker → launches immersive SessionContainer. (Moved from App.) */
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

export const VIEW_REGISTRY: Record<ViewId, ViewDef> = {
  // ── Your becoming ─────────────────────────────────────────────────────────
  body: {
    frame: 'self',
    sanitizedAllowed: true,
    menu: { heading: 'Your becoming', label: 'Build your body', description: 'The one thing, front and center: training, the shape coming in, your proof. No noise.', icon: Flame, color: 'rose' },
    sanitizedMenu: { heading: 'Aesthetic fitness', label: 'Training plan', description: 'Workouts, recovery, nutrition, and body metrics.', icon: Flame, color: 'green' },
    render: (ctx) => <BodyProtocolView onBack={ctx.onBack} />,
  },
  'life-as-woman': {
    frame: 'self',
    menu: { heading: 'Your becoming', label: 'Life as a woman', description: 'Where you live now. Sniffies, trance, gooning, content — I set it up, you show up.', icon: Flame, color: 'rose' },
    render: (ctx) => <LifeAsWomanView onBack={ctx.onBack} />,
  },
  trajectory: {
    frame: 'self',
    menu: { heading: 'Your becoming', label: "Who you've become", description: 'Every proof your body kept — voice, slips, the woman underneath surfacing. The number only goes up.', icon: BarChart3, color: 'rose' },
    render: (ctx) => <TrajectoryArchiveView onBack={ctx.onBack} />,
  },
  escalation_ladder: {
    frame: 'framed',
    menu: { heading: 'Your becoming', label: 'How deep you are', description: "Which rung you've climbed to. You only go up. There is no step back down.", icon: ArrowUpRight, color: 'roseSoft' },
    render: () => <EscalationLadder />,
  },
  wishlist: {
    frame: 'framed',
    legacyEvents: ['navigate-to-wishlist', 'navigate-to-investments'],
    menu: { heading: 'Your becoming', label: 'Progress', description: "What you've poured in, what you're saving toward, how far you've already come.", icon: TrendingUp, color: 'green' },
    render: () => <ProgressDashboard />,
  },

  // ── You ───────────────────────────────────────────────────────────────────
  identity: {
    frame: 'self',
    hashPaths: ['/identity'],
    legacyEvents: ['navigate-to-identity'],
    menu: { heading: 'You', label: 'Identity', description: 'Your name, your pronouns, how I speak to you.', icon: User, color: 'rose' },
    render: (ctx) => <IdentitySettingsView onBack={ctx.onBack} />,
  },
  wardrobe: {
    frame: 'self',
    menu: { heading: 'You', label: 'Wardrobe', description: "What's already yours. I check here before I tell you what to put on.", icon: Shirt, color: 'rose' },
    render: (ctx) => <WardrobeInventoryView onBack={ctx.onBack} />,
  },
  'verification-vault': {
    frame: 'self',
    menu: { heading: 'You', label: 'Verification Vault', description: 'Every photo you sent me — approved, denied, or waiting on a retake.', icon: Camera, color: 'roseSoft' },
    render: (ctx) => <VerificationVault onBack={ctx.onBack} />,
  },

  // ── Practice ──────────────────────────────────────────────────────────────
  sessions: {
    frame: 'self',
    menu: { heading: 'Practice', label: 'Sessions', description: 'Come sit with me — cam, trance, gooning, exercise. I lead, you follow.', icon: Sparkles, color: 'rose' },
    render: (ctx) => <SessionPickerOrContainer onBack={ctx.onBack} />,
  },
  'voice-drills': {
    frame: 'self',
    menu: { heading: 'Practice', label: 'Voice Drills', description: 'Train the voice that gives you away. Pitch, resonance, cadence.', icon: Mic, color: 'roseSoft' },
    render: (ctx) => (
      <VoiceDrillView
        onBack={ctx.onBack}
        onAffirmationGame={() => ctx.navigate('voice-game')}
      />
    ),
  },

  // ── Record ────────────────────────────────────────────────────────────────
  journal: {
    frame: 'framed',
    hashPaths: ['/journal'],
    menu: { heading: 'Record', label: 'Journal', description: 'Your reflections, day by day.', icon: Calendar, color: 'green' },
    render: () => <JournalView />,
  },
  recaps: {
    frame: 'self',
    hashPaths: ['/recaps'],
    menu: { heading: 'Record', label: 'Recaps', description: 'Your story so far, chapter by chapter.', icon: BookOpen, color: 'roseSoft' },
    render: (ctx) => <RecapsIndexView onBack={ctx.onBack} onOpen={ctx.openRecap} />,
  },
  'recap-detail': {
    frame: 'self',
    render: (ctx) =>
      ctx.recapId ? (
        <RecapDetailView recapId={ctx.recapId} onBack={() => ctx.navigate('recaps')} />
      ) : null,
  },
  timeline: {
    frame: 'self',
    menu: { heading: 'Record', label: 'Timeline', description: 'Every milestone, in the order it happened.', icon: Clock, color: 'muted' },
    render: (ctx) => <TimelineView onBack={ctx.onBack} userName={ctx.userName} />,
  },
  letters: {
    frame: 'self',
    menu: { heading: 'Record', label: 'Letters from Mama', description: 'The warm things I meant. Pinned, framed, yours to replay.', icon: Mail, color: 'gold' },
    render: (ctx) => <LettersArchiveView onBack={ctx.onBack} />,
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  settings: {
    frame: 'self',
    sanitizedAllowed: true,
    hashPaths: ['/settings'],
    legacyEvents: ['navigate-to-settings'],
    menu: { heading: 'Settings', label: 'Settings', description: 'Account, preferences, integrations.', icon: Settings, color: 'muted' },
    sanitizedMenu: { heading: 'Aesthetic fitness', label: 'Settings & privacy', description: 'Display, notifications, privacy, and app access.', icon: Settings, color: 'muted' },
    render: (ctx) =>
      ctx.sanitized ? (
        <SanitizedSettingsView onBack={ctx.onBack} />
      ) : (
        <SettingsView
          onBack={ctx.onBack}
          onEditIntake={ctx.onEditIntake}
          onOpenDossierStatus={() => ctx.navigate('dossier')}
          onOpenDossierQuiz={() => ctx.navigate('mommy-dossier')}
        />
      ),
  },
  pause_protocol: {
    frame: 'framed',
    menu: { heading: 'Settings', label: 'Pause Protocol', description: 'Ask me to pause. It logs, permanently, and it compounds.', icon: PauseCircle, color: 'danger' },
    render: () => (
      <div className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold text-protocol-text">Pause Protocol</h3>
        <p className="text-sm text-protocol-text-muted">
          Pausing the protocol is a permanent decision the Handler will see and reference.
          Each attempt doubles the next cooldown. The architect-version of you committed.
        </p>
        <div className="pt-2">
          <QuitFrictionGate
            attemptType="pause_protocol"
            triggerLabel="I need to pause the protocol"
          />
        </div>
      </div>
    ),
  },
  help: {
    frame: 'framed',
    sanitizedAllowed: true,
    menu: { heading: 'Settings', label: 'Help & Feedback', description: 'Get support or tell me what you need.', icon: HelpCircle, color: 'muted' },
    sanitizedMenu: { heading: 'Aesthetic fitness', label: 'Help & feedback', description: 'Support and app notes.', icon: HelpCircle, color: 'muted' },
    render: (ctx) => (
      <div className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold text-protocol-text">Help & Support</h3>
        <p className="text-sm text-protocol-text-muted">
          {ctx.sanitized
            ? 'This app helps track training, recovery, measurements, and steady body-composition progress.'
            : 'Becoming Protocol is your daily companion for personal transformation.'}
        </p>
        <p className="text-sm text-protocol-text-muted">
          {ctx.sanitized
            ? 'Use the baseline intake for helper-assisted measurements, then repeat check-ins consistently.'
            : "Complete your daily tasks, journal your reflections, and track your progress as you become who you're meant to be."}
        </p>
      </div>
    ),
  },

  // ── Sanitized-only surface ───────────────────────────────────────────────
  'baseline-intake': {
    frame: 'self',
    chrome: 'bare',
    sanitizedAllowed: true,
    hashPaths: ['/baseline-intake'],
    sanitizedMenu: { heading: 'Aesthetic fitness', label: 'Baseline intake', description: 'Helper-assisted measurements for the starting point.', icon: ClipboardCheck, color: 'gold' },
    render: (ctx) => <BaselineIntakeView onClose={ctx.onBack} />,
  },

  // ── Archive tail (folded "Everything else") ──────────────────────────────
  'her-world': {
    frame: 'self',
    menu: { heading: 'Archive', label: 'Her World', description: 'The world you are stepping into.', icon: Heart, color: 'roseSoft', archive: true },
    render: (ctx) => <HerWorldPage onBack={ctx.onBack} />,
  },
  dossier: {
    frame: 'framed',
    backLabel: 'Back',
    menu: { heading: 'Archive', label: 'Dossier', description: "What I've assembled about you.", icon: FileText, color: 'gold', archive: true },
    render: (ctx) => <MommyDossierStatus onOpenQuiz={() => ctx.navigate('mommy-dossier')} />,
  },
  'mommy-dossier': {
    frame: 'framed',
    backLabel: 'Back',
    menu: { heading: 'Archive', label: "Mommy's Dossier Quiz", description: 'Answer for your file. The more I know, the closer I hold you.', icon: FileText, color: 'gold', archive: true },
    render: (ctx) => <MommyDossierQuiz onClose={ctx.onBack} />,
  },
  quiz: {
    frame: 'self',
    menu: { heading: 'Archive', label: 'Kink Quiz', description: 'Map what moves you, so I can use it.', icon: FileText, color: 'rose', archive: true },
    render: (ctx) => <KinkQuizView onBack={ctx.onBack} />,
  },
  'conditioning-library': {
    frame: 'self',
    menu: { heading: 'Archive', label: 'Conditioning Library', description: 'Loops, triggers, and trance material.', icon: Library, color: 'rose', archive: true },
    render: (ctx) => <ConditioningLibrary onBack={ctx.onBack} />,
  },
  envelopes: {
    frame: 'framed',
    menu: { heading: 'Archive', label: 'Sealed Envelopes', description: 'Letters from your past self to the woman you are becoming.', icon: Mail, color: 'roseSoft', archive: true },
    render: () => <SealedEnvelopesPage />,
  },
  case_file: {
    frame: 'framed',
    menu: { heading: 'Archive', label: 'Case File', description: 'Your record — everything I see.', icon: FileText, color: 'danger', archive: true },
    render: () => <CaseFileView />,
  },
  witnesses: {
    frame: 'framed',
    menu: { heading: 'Archive', label: 'Witnesses', description: 'The ones who watch your progress with me.', icon: Eye, color: 'rose', archive: true },
    render: () => <WitnessManager />,
  },
  'vault-browser': {
    frame: 'self',
    menu: { heading: 'Archive', label: 'Vault Browser', description: 'Everything in the vault, in one place.', icon: FileText, color: 'roseSoft', archive: true },
    render: (ctx) => <VaultView onBack={ctx.onBack} />,
  },
  'hypno-learning': {
    frame: 'self',
    chrome: 'bare',
    legacyEvents: ['navigate-to-hypno-learning'],
    menu: { heading: 'Archive', label: 'Hypno Learning', description: 'How the trance work is built.', icon: Headphones, color: 'rose', archive: true },
    render: (ctx) => (
      <div className="min-h-screen bg-protocol-bg">
        <div className="px-4 py-3 flex items-center gap-2 border-b border-protocol-border/50">
          <button
            onClick={ctx.onBack}
            className="text-protocol-text-muted hover:text-protocol-text text-sm"
          >
            &larr; Back
          </button>
          <span className="text-sm font-medium text-protocol-text">Hypno Learning</span>
        </div>
        <HypnoLearningView />
      </div>
    ),
  },
  history: {
    frame: 'framed',
    menu: { heading: 'Archive', label: 'History', description: 'Your full activity log.', icon: Clock, color: 'muted', archive: true },
    render: () => <History />,
  },
  force: {
    frame: 'framed',
    menu: { heading: 'Archive', label: 'Force Layer', description: 'Hard Mode, slips, punishments, chastity.', icon: Flame, color: 'danger', archive: true },
    render: () => (
      <div>
        <h2 className="text-lg font-semibold mb-3">Force Layer</h2>
        <ForceDashboard />
      </div>
    ),
  },

  // ── Deep-link / event-only machinery (no menu entry — deliberately) ──────
  exercise: {
    frame: 'self',
    legacyEvents: ['navigate-to-exercise'],
    render: (ctx) => <WorkoutSessionPage onBack={ctx.onBack} />,
  },
  'vault-swipe': {
    frame: 'self',
    render: (ctx) => (
      <VaultSwipe
        onBack={ctx.onBack}
        onManagePermissions={() => ctx.navigate('vault-permissions')}
      />
    ),
  },
  'vault-permissions': {
    frame: 'self',
    legacyEvents: ['navigate-to-vault-permissions'],
    render: (ctx) => <PermissionsManager onBack={ctx.onBack} />,
  },
  'content-capture': {
    frame: 'self',
    legacyEvents: ['navigate-to-content-capture'],
    render: (ctx) => <ContentCapture onBack={ctx.onBack} />,
  },
  'content-queue': { frame: 'self', render: (ctx) => <PostingQueue onBack={ctx.onBack} /> },
  'content-calendar': { frame: 'self', render: (ctx) => <ContentCalendar onBack={ctx.onBack} /> },
  'content-fans': { frame: 'self', render: (ctx) => <FanDashboard onBack={ctx.onBack} /> },
  'content-polls': { frame: 'self', render: (ctx) => <SubscriberPolls onBack={ctx.onBack} /> },
  'content-revenue': { frame: 'self', render: (ctx) => <RevenueView onBack={ctx.onBack} /> },
  'content-settings': { frame: 'self', render: (ctx) => <PlatformSettings onBack={ctx.onBack} /> },
  'content-dashboard': {
    frame: 'self',
    hashPaths: ['/content-dashboard'],
    render: (ctx) => <ContentDashboard onBack={ctx.onBack} />,
  },
  'voice-game': { frame: 'self', render: (ctx) => <VoiceAffirmationGame onBack={ctx.onBack} /> },
  service: { frame: 'self', render: (ctx) => <ServiceProgressionView onBack={ctx.onBack} /> },
  'service-analytics': { frame: 'self', render: (ctx) => <ServiceAnalyticsDashboard onBack={ctx.onBack} /> },
  'trigger-audit': { frame: 'self', render: (ctx) => <TriggerAuditDashboard onBack={ctx.onBack} /> },
  content: { frame: 'self', render: (ctx) => <ContentEscalationView onBack={ctx.onBack} /> },
  domains: { frame: 'self', render: (ctx) => <DomainEscalationView onBack={ctx.onBack} /> },
  patterns: { frame: 'self', render: (ctx) => <PatternCatchView onBack={ctx.onBack} /> },
  curation: { frame: 'self', render: (ctx) => <TaskCurationView onBack={ctx.onBack} /> },
  seeds: { frame: 'self', render: (ctx) => <SeedsView onBack={ctx.onBack} /> },
  vectors: { frame: 'framed', render: () => <VectorGridView /> },
  'protocol-analytics': { frame: 'self', render: (ctx) => <ProtocolAnalytics onBack={ctx.onBack} /> },
  'handler-autonomous': {
    frame: 'self',
    legacyEvents: ['navigate-to-handler'],
    render: (ctx) => <HandlerAutonomousView onBack={ctx.onBack} />,
  },
  'cam-session': {
    frame: 'self',
    legacyEvents: ['navigate-to-cam'],
    render: (ctx) => <CamDashboard onBack={ctx.onBack} />,
  },
  'hypno-session': {
    frame: 'self',
    legacyEvents: ['navigate-to-hypno'],
    render: (ctx) => <HypnoDashboard onBack={ctx.onBack} />,
  },
  'goon-session': { frame: 'self', render: (ctx) => <GoonSessionView onBack={ctx.onBack} /> },
  'social-dashboard': {
    frame: 'self',
    hashPaths: ['/social-dashboard', '/socials'],
    render: (ctx) => <SocialMediaDashboard onBack={ctx.onBack} />,
  },
  'community-queue': {
    frame: 'self',
    hashPaths: ['/community/queue'],
    render: (ctx) => <CommunityQueue onBack={ctx.onBack} />,
  },
  'community-list': {
    frame: 'self',
    hashPaths: ['/community/list'],
    render: (ctx) => <CommunityList onBack={ctx.onBack} />,
  },
  'community-log': {
    frame: 'self',
    hashPaths: ['/community/log'],
    render: (ctx) => <CommunityLog onBack={ctx.onBack} />,
  },
  dashboard: {
    frame: 'framed',
    hashPaths: ['/dashboard'],
    render: () => <Dashboard />,
  },
  system_audit: { frame: 'framed', render: () => <SystemAuditView /> },
};

export function isViewId(v: string | null | undefined): v is ViewId {
  return v != null && v in VIEW_REGISTRY;
}

/** Resolve any historical/aliased id string to a live ViewId (or null). */
export function resolveViewId(v: string | null | undefined): ViewId | null {
  if (v == null) return null;
  if (isViewId(v)) return v;
  const alias = VIEW_ALIASES[v];
  return alias ?? null;
}

export function isSanitizedAllowed(view: ViewId | null): boolean {
  return view == null || VIEW_REGISTRY[view].sanitizedAllowed === true;
}

/** hash path (no '#', no trailing slash) → view id, from registry hashPaths. */
export const HASH_TO_VIEW: Record<string, ViewId> = Object.fromEntries(
  (Object.entries(VIEW_REGISTRY) as [ViewId, ViewDef][])
    .flatMap(([id, def]) => (def.hashPaths ?? []).map(p => [p, id]))
);

/** legacy CustomEvent name → view id, from registry legacyEvents. */
export const LEGACY_EVENT_TO_VIEW: Record<string, ViewId> = Object.fromEntries(
  (Object.entries(VIEW_REGISTRY) as [ViewId, ViewDef][])
    .flatMap(([id, def]) => (def.legacyEvents ?? []).map(e => [e, id]))
);
