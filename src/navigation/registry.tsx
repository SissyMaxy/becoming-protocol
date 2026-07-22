/**
 * VIEW_REGISTRY — the single source of truth for every navigable screen.
 *
 * One entry per view id. Everything that used to be five parallel systems
 * reads from here:
 *   - App renders a view via its `render` function (was a 60-case switch)
 *   - MenuView derives its groups from `menu`
 *   - the nav store resolves hash deep-links via `hashPaths`
 *   - the nav store adapts legacy `navigate-to-*` CustomEvents via `legacyEvents`
 *
 * Adding a screen = adding ONE entry here. navigation-registry.test.ts locks
 * the invariants (unique hash paths, menu ids resolve).
 */

import { useState, lazy, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Settings, HelpCircle, Calendar, Eye, FileText, Mail, PauseCircle,
  ArrowUpRight, Flame, Shirt, BarChart3, Camera, Clock, BookOpen, Heart,
  User, Sparkles, Headphones, Mic, Library, TrendingUp,
} from 'lucide-react';

import { useBambiMode } from '../context/BambiModeContext';
import type { SessionConfig } from '../components/session';

const BodyProtocolView = lazy(() => import('../components/today-redesign/BodyProtocolView').then((m) => ({ default: m.BodyProtocolView })));
const PlanView = lazy(() => import('../components/today-redesign/PlanView').then((m) => ({ default: m.PlanView })));
const ProgressDashboard = lazy(() => import('../components/ProgressDashboard').then((m) => ({ default: m.ProgressDashboard })));
const History = lazy(() => import('../components/History').then((m) => ({ default: m.History })));
const SettingsView = lazy(() => import('../components/settings').then((m) => ({ default: m.SettingsView })));
const SystemAuditView = lazy(() => import('../components/settings').then((m) => ({ default: m.SystemAuditView })));
const WitnessManager = lazy(() => import('../components/handler').then((m) => ({ default: m.WitnessManager })));
const CaseFileView = lazy(() => import('../components/handler').then((m) => ({ default: m.CaseFileView })));
const SealedEnvelopesPage = lazy(() => import('../components/handler').then((m) => ({ default: m.SealedEnvelopesPage })));
const QuitFrictionGate = lazy(() => import('../components/handler').then((m) => ({ default: m.QuitFrictionGate })));
const EscalationLadder = lazy(() => import('../components/handler').then((m) => ({ default: m.EscalationLadder })));
const ForceDashboard = lazy(() => import('../components/force/ForceDashboard').then((m) => ({ default: m.ForceDashboard })));
const MommyDossierQuiz = lazy(() => import('../components/persona/MommyDossierQuiz').then((m) => ({ default: m.MommyDossierQuiz })));
const MommyDossierStatus = lazy(() => import('../components/persona/MommyDossierStatus').then((m) => ({ default: m.MommyDossierStatus })));
const VerificationVault = lazy(() => import('../components/verification/VerificationVault').then((m) => ({ default: m.VerificationVault })));
const SessionContainer = lazy(() => import('../components/session').then((m) => ({ default: m.SessionContainer })));
const TimelineView = lazy(() => import('../components/timeline').then((m) => ({ default: m.TimelineView })));
const ServiceProgressionView = lazy(() => import('../components/service').then((m) => ({ default: m.ServiceProgressionView })));
const ServiceAnalyticsDashboard = lazy(() => import('../components/service').then((m) => ({ default: m.ServiceAnalyticsDashboard })));
const ContentEscalationView = lazy(() => import('../components/content').then((m) => ({ default: m.ContentEscalationView })));
const VaultSwipe = lazy(() => import('../components/content').then((m) => ({ default: m.VaultSwipe })));
const PermissionsManager = lazy(() => import('../components/content/PermissionsManager').then((m) => ({ default: m.PermissionsManager })));
const ContentDashboard = lazy(() => import('../components/admin/ContentDashboard').then((m) => ({ default: m.ContentDashboard })));
const DomainEscalationView = lazy(() => import('../components/domains').then((m) => ({ default: m.DomainEscalationView })));
const PatternCatchView = lazy(() => import('../components/patterns').then((m) => ({ default: m.PatternCatchView })));
const TriggerAuditDashboard = lazy(() => import('../components/triggers').then((m) => ({ default: m.TriggerAuditDashboard })));
const TaskCurationView = lazy(() => import('../components/curation').then((m) => ({ default: m.TaskCurationView })));
const SeedsView = lazy(() => import('../components/seeds').then((m) => ({ default: m.SeedsView })));
const VectorGridView = lazy(() => import('../components/adaptive-feminization').then((m) => ({ default: m.VectorGridView })));
const VoiceAffirmationGame = lazy(() => import('../components/voice-game').then((m) => ({ default: m.VoiceAffirmationGame })));
const VoiceDrillView = lazy(() => import('../components/voice-game/VoiceDrillView').then((m) => ({ default: m.VoiceDrillView })));
const Dashboard = lazy(() => import('../components/dashboard').then((m) => ({ default: m.Dashboard })));
const WardrobeInventoryView = lazy(() => import('../components/wardrobe').then((m) => ({ default: m.WardrobeInventoryView })));
const IdentitySettingsView = lazy(() => import('../components/identity').then((m) => ({ default: m.IdentitySettingsView })));
const TrajectoryArchiveView = lazy(() => import('../components/trajectory').then((m) => ({ default: m.TrajectoryArchiveView })));
const RecapsIndexView = lazy(() => import('../components/recaps/RecapsIndexView').then((m) => ({ default: m.RecapsIndexView })));
const RecapDetailView = lazy(() => import('../components/recaps/RecapDetailView').then((m) => ({ default: m.RecapDetailView })));
const JournalView = lazy(() => import('../components/journal').then((m) => ({ default: m.JournalView })));
const ProtocolAnalytics = lazy(() => import('../components/analytics/ProtocolAnalytics').then((m) => ({ default: m.ProtocolAnalytics })));
const HandlerAutonomousView = lazy(() => import('../components/autonomous').then((m) => ({ default: m.HandlerAutonomousView })));
const CamDashboard = lazy(() => import('../components/cam/CamDashboard').then((m) => ({ default: m.CamDashboard })));
const HypnoDashboard = lazy(() => import('../components/hypno').then((m) => ({ default: m.HypnoDashboard })));
const HypnoLearningView = lazy(() => import('../components/hypno').then((m) => ({ default: m.HypnoLearningView })));
const ConditioningLibrary = lazy(() => import('../components/conditioning').then((m) => ({ default: m.ConditioningLibrary })));
const SocialMediaDashboard = lazy(() => import('../components/social/SocialMediaDashboard').then((m) => ({ default: m.SocialMediaDashboard })));
const CommunityQueue = lazy(() => import('../components/community').then((m) => ({ default: m.CommunityQueue })));
const CommunityList = lazy(() => import('../components/community').then((m) => ({ default: m.CommunityList })));
const CommunityLog = lazy(() => import('../components/community').then((m) => ({ default: m.CommunityLog })));

const LettersArchiveView = lazy(() => import('../components/letters').then((m) => ({ default: m.LettersArchiveView })));
const LifeAsWomanView = lazy(() => import('../components/life-as-woman').then((m) => ({ default: m.LifeAsWomanView })));
const AmbientWindow = lazy(() => import('../components/ambient/AmbientWindow').then((m) => ({ default: m.AmbientWindow })));
const KinkQuizView = lazy(() => import('../components/kink-quiz').then((m) => ({ default: m.KinkQuizView })));
const WorkoutSessionPage = lazy(() => import('../components/exercise').then((m) => ({ default: m.WorkoutSessionPage })));
const HerWorldPage = lazy(() => import('../components/collections').then((m) => ({ default: m.HerWorldPage })));
const GoonSessionView = lazy(() => import('../components/sessions/GoonSessionView').then((m) => ({ default: m.GoonSessionView })));
const CockwarmingSessionView = lazy(() => import('../components/sessions/CockwarmingSessionView').then((m) => ({ default: m.CockwarmingSessionView })));
const ContentCapture = lazy(() => import('../components/content/ContentCapture').then((m) => ({ default: m.ContentCapture })));
const PostingQueue = lazy(() => import('../components/content/PostingQueue').then((m) => ({ default: m.PostingQueue })));
const ContentCalendar = lazy(() => import('../components/content/ContentCalendar').then((m) => ({ default: m.ContentCalendar })));
const PlatformSettings = lazy(() => import('../components/content/PlatformSettings').then((m) => ({ default: m.PlatformSettings })));
const VaultView = lazy(() => import('../components/content/VaultView').then((m) => ({ default: m.VaultView })));
const FanDashboard = lazy(() => import('../components/content/FanDashboard').then((m) => ({ default: m.FanDashboard })));
const SubscriberPolls = lazy(() => import('../components/content/SubscriberPolls').then((m) => ({ default: m.SubscriberPolls })));
const RevenueView = lazy(() => import('../components/content/RevenueView').then((m) => ({ default: m.RevenueView })));

export type ViewId =
  | 'plan'
  | 'body' | 'history' | 'wishlist' | 'settings' | 'help'
  | 'sessions' | 'quiz' | 'timeline' | 'service' | 'service-analytics'
  | 'content' | 'domains' | 'patterns' | 'curation' | 'seeds' | 'vectors'
  | 'trigger-audit' | 'voice-game' | 'voice-drills' | 'dashboard' | 'journal'
  | 'protocol-analytics' | 'handler-autonomous' | 'exercise' | 'her-world'
  | 'vault-swipe' | 'vault-permissions' | 'vault-browser' | 'content-dashboard'
  | 'cam-session' | 'hypno-session' | 'hypno-learning' | 'goon-session'
  | 'cockwarming-session'
  | 'content-capture' | 'content-queue' | 'content-calendar' | 'content-fans'
  | 'content-polls' | 'content-revenue' | 'content-settings'
  | 'conditioning-library' | 'social-dashboard' | 'witnesses' | 'case_file'
  | 'envelopes' | 'system_audit' | 'pause_protocol' | 'escalation_ladder'
  | 'force' | 'wardrobe' | 'trajectory' | 'mommy-dossier' | 'identity'
  | 'verification-vault' | 'community-queue' | 'community-list'
  | 'community-log' | 'letters' | 'dossier' | 'recaps' | 'recap-detail'
  | 'life-as-woman' | 'ambient';

/** Old menuSubView ids that no longer exist, and where they land now. */
export const VIEW_ALIASES: Record<string, ViewId | null> = {
  investments: 'wishlist',     // both always rendered ProgressDashboard
  'log-release': null,         // dead special case — zero emitters existed
  'progress-page': null,       // set a tab that rendered nothing
  'sealed-page': null,         // SealedContentView was removed
  'baseline-intake': null,     // removed with the sanitized-fitness disguise mode
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
  // ── The plan — the full deadline ledger behind the Focus home ────────────
  plan: {
    frame: 'self',
    chrome: 'bare',
    hashPaths: ['/plan'],
    render: (ctx) => <PlanView onBack={ctx.onBack} />,
  },

  // The always-on companion surface. 'bare' + self-framed because it renders a
  // window, not a page — and it deep-links so it can be opened straight into a
  // small browser window kept at the edge of the screen.
  ambient: {
    frame: 'self',
    chrome: 'bare',
    hashPaths: ['/ambient'],
    menu: {
      heading: 'Your becoming',
      label: 'Keep her with you',
      description: 'Three channels in the corner of your screen while you work. She talks the whole time.',
      icon: Sparkles,
      color: 'rose',
    },
    render: (ctx) => <AmbientWindow onBack={ctx.onBack} />,
  },

  // ── Your becoming ─────────────────────────────────────────────────────────
  body: {
    frame: 'self',
    menu: { heading: 'Your becoming', label: 'Build your body', description: 'The one thing, front and center: training, the shape coming in, your proof. No noise.', icon: Flame, color: 'rose' },
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
    hashPaths: ['/settings'],
    legacyEvents: ['navigate-to-settings'],
    menu: { heading: 'Settings', label: 'Settings', description: 'Account, preferences, integrations.', icon: Settings, color: 'muted' },
    render: (ctx) => (
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
    menu: { heading: 'Settings', label: 'Help & Feedback', description: 'Get support or tell me what you need.', icon: HelpCircle, color: 'muted' },
    render: () => (
      <div className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold text-protocol-text">Help & Support</h3>
        <p className="text-sm text-protocol-text-muted">
          Becoming Protocol is your daily companion for personal transformation.
        </p>
        <p className="text-sm text-protocol-text-muted">
          Complete your daily tasks, journal your reflections, and track your progress as you become who you're meant to be.
        </p>
      </div>
    ),
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
  'cockwarming-session': { frame: 'self', render: (ctx) => <CockwarmingSessionView onBack={ctx.onBack} /> },
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
