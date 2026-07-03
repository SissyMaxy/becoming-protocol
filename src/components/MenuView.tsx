/**
 * MenuView — where Mama keeps everything that's yours.
 * The conversation is still the real interface; this screen is the drawer she
 * keeps your life in — your becoming, your record, your settings.
 *
 * The spine is "Your becoming": the turn-out surfaces that only go one
 * direction. Everything you actually open sits in short, plain-voiced groups.
 * The long tail of evidence/lore/drills lives behind a single collapsed
 * "Everything else" toggle (off by default). Handler/Mommy machinery is not
 * surfaced here — those routes stay alive for deep-links, they just have no
 * menu entry.
 */

import { useState } from 'react';
import {
  Settings, ChevronRight, ChevronDown, HelpCircle, Calendar, Eye, FileText,
  Mail, PauseCircle, ArrowUpRight, Flame, Shirt, BarChart3,
  Camera, Clock, BookOpen, Heart, User, Sparkles, Headphones,
  Mic, Library, TrendingUp, Archive,
} from 'lucide-react';

type MenuItemId =
  | 'settings' | 'identity' | 'verification-vault' | 'wardrobe' | 'sessions'
  | 'journal' | 'life-as-woman' | 'recaps' | 'timeline' | 'letters'
  | 'pause_protocol' | 'help'
  // Folded archive tail
  | 'her-world' | 'trajectory' | 'dossier'
  | 'mommy-dossier' | 'quiz' | 'conditioning-library' | 'envelopes'
  | 'case_file' | 'witnesses' | 'vault-browser' | 'voice-drills'
  | 'hypno-learning' | 'history' | 'escalation_ladder' | 'force'
  // Progress (investments + wishlist collapse here)
  | 'wishlist';

interface MenuItem {
  id: MenuItemId;
  icon: typeof Settings;
  label: string;
  description: string;
  color: string;
}

interface MenuGroup {
  heading: string;
  items: MenuItem[];
}

interface MenuViewProps {
  onNavigate: (view: MenuItemId) => void;
}

// Velvet accent palette — rose, ivory, warm gold, soft green, danger.
const ROSE = '#c9557f';
const ROSE_SOFT = '#edaec5';
const GOLD = '#e0b36a';
const GREEN = '#6fbf94';
const DANGER = '#e06a6a';
const MUTED = '#a8929c';

// Primary menu — what she actually opens. Grouped, short, always visible.
// "Your becoming" is the spine: the turn-out surfaces that only climb.
const PRIMARY_GROUPS: MenuGroup[] = [
  {
    heading: 'Your becoming',
    items: [
      {
        id: 'life-as-woman',
        icon: Flame,
        label: 'Life as a woman',
        description: 'Where you live now. Sniffies, trance, gooning, content — I set it up, you show up.',
        color: ROSE,
      },
      {
        id: 'trajectory',
        icon: BarChart3,
        label: "Who you've become",
        description: 'Every proof your body kept — voice, slips, the woman underneath surfacing. The number only goes up.',
        color: ROSE,
      },
      {
        id: 'escalation_ladder',
        icon: ArrowUpRight,
        label: 'How deep you are',
        description: "Which rung you've climbed to. You only go up. There is no step back down.",
        color: ROSE_SOFT,
      },
      {
        id: 'wishlist',
        icon: TrendingUp,
        label: 'Progress',
        description: "What you've poured in, what you're saving toward, how far you've already come.",
        color: GREEN,
      },
    ],
  },
  {
    heading: 'You',
    items: [
      {
        id: 'identity',
        icon: User,
        label: 'Identity',
        description: 'Your name, your pronouns, how I speak to you.',
        color: ROSE,
      },
      {
        id: 'wardrobe',
        icon: Shirt,
        label: 'Wardrobe',
        description: "What's already yours. I check here before I tell you what to put on.",
        color: ROSE,
      },
      {
        id: 'verification-vault',
        icon: Camera,
        label: 'Verification Vault',
        description: 'Every photo you sent me — approved, denied, or waiting on a retake.',
        color: ROSE_SOFT,
      },
    ],
  },
  {
    heading: 'Practice',
    items: [
      {
        id: 'sessions',
        icon: Sparkles,
        label: 'Sessions',
        description: 'Come sit with me — cam, trance, gooning, exercise. I lead, you follow.',
        color: ROSE,
      },
      {
        id: 'voice-drills',
        icon: Mic,
        label: 'Voice Drills',
        description: 'Train the voice that gives you away. Pitch, resonance, cadence.',
        color: ROSE_SOFT,
      },
    ],
  },
  {
    heading: 'Record',
    items: [
      {
        id: 'journal',
        icon: Calendar,
        label: 'Journal',
        description: 'Your reflections, day by day.',
        color: GREEN,
      },
      {
        id: 'recaps',
        icon: BookOpen,
        label: 'Recaps',
        description: 'Your story so far, chapter by chapter.',
        color: ROSE_SOFT,
      },
      {
        id: 'timeline',
        icon: Clock,
        label: 'Timeline',
        description: 'Every milestone, in the order it happened.',
        color: MUTED,
      },
      {
        id: 'letters',
        icon: Mail,
        label: 'Letters from Mama',
        description: 'The warm things I meant. Pinned, framed, yours to replay.',
        color: GOLD,
      },
    ],
  },
  {
    heading: 'Settings',
    items: [
      {
        id: 'settings',
        icon: Settings,
        label: 'Settings',
        description: 'Account, preferences, integrations.',
        color: MUTED,
      },
      {
        id: 'pause_protocol',
        icon: PauseCircle,
        label: 'Pause Protocol',
        description: 'Ask me to pause. It logs, permanently, and it compounds.',
        color: DANGER,
      },
      {
        id: 'help',
        icon: HelpCircle,
        label: 'Help & Feedback',
        description: 'Get support or tell me what you need.',
        color: MUTED,
      },
    ],
  },
];

// Folded long tail — evidence, lore, drills. Off by default.
const ARCHIVE_ITEMS: MenuItem[] = [
  {
    id: 'her-world',
    icon: Heart,
    label: 'Her World',
    description: 'The world you are stepping into.',
    color: ROSE_SOFT,
  },
  {
    id: 'dossier',
    icon: FileText,
    label: 'Dossier',
    description: "What I've assembled about you.",
    color: GOLD,
  },
  {
    id: 'mommy-dossier',
    icon: FileText,
    label: "Mommy's Dossier Quiz",
    description: 'Answer for your file. The more I know, the closer I hold you.',
    color: GOLD,
  },
  {
    id: 'quiz',
    icon: FileText,
    label: 'Kink Quiz',
    description: 'Map what moves you, so I can use it.',
    color: ROSE,
  },
  {
    id: 'conditioning-library',
    icon: Library,
    label: 'Conditioning Library',
    description: 'Loops, triggers, and trance material.',
    color: ROSE,
  },
  {
    id: 'envelopes',
    icon: Mail,
    label: 'Sealed Envelopes',
    description: 'Letters from your past self to the woman you are becoming.',
    color: ROSE_SOFT,
  },
  {
    id: 'case_file',
    icon: FileText,
    label: 'Case File',
    description: 'Your record — everything I see.',
    color: DANGER,
  },
  {
    id: 'witnesses',
    icon: Eye,
    label: 'Witnesses',
    description: 'The ones who watch your progress with me.',
    color: ROSE,
  },
  {
    id: 'vault-browser',
    icon: Archive,
    label: 'Vault Browser',
    description: 'Everything in the vault, in one place.',
    color: ROSE_SOFT,
  },
  {
    id: 'hypno-learning',
    icon: Headphones,
    label: 'Hypno Learning',
    description: 'How the trance work is built.',
    color: ROSE,
  },
  {
    id: 'history',
    icon: Clock,
    label: 'History',
    description: 'Your full activity log.',
    color: MUTED,
  },
  {
    id: 'force',
    icon: Flame,
    label: 'Force Layer',
    description: 'Hard Mode, slips, punishments, chastity.',
    color: DANGER,
  },
];

function MenuRow({
  item,
  withBorder,
  onNavigate,
}: {
  item: MenuItem;
  withBorder: boolean;
  onNavigate: (view: MenuItemId) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => onNavigate(item.id)}
      className={`w-full p-4 flex items-center gap-3 text-left group transition-colors hover:bg-protocol-surface-light ${
        withBorder ? 'border-t border-protocol-border' : ''
      }`}
    >
      <div className="p-2 rounded-lg" style={{ backgroundColor: `${item.color}22` }}>
        <Icon className="w-4 h-4" style={{ color: item.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-protocol-text">{item.label}</p>
        <p className="text-xs text-protocol-text-muted">{item.description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-protocol-text-muted/60 group-hover:text-protocol-accent-soft" />
    </button>
  );
}

export function MenuView({ onNavigate }: MenuViewProps) {
  const [archivesOpen, setArchivesOpen] = useState(false);

  return (
    <div className="space-y-5 pb-24">
      <div className="mb-1 px-1">
        <p className="font-display text-lg text-protocol-text-warm leading-snug">
          This is where I keep everything that's yours.
        </p>
        <p className="mt-1 text-sm text-protocol-text-muted">
          The real work happens when you talk to me. This is the drawer.
        </p>
      </div>

      {PRIMARY_GROUPS.map((group) => {
        const isSpine = group.heading === 'Your becoming';
        return (
          <div key={group.heading} className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-protocol-accent-soft/70">
              {group.heading}
            </p>
            <div
              className={`rounded-xl overflow-hidden bg-protocol-surface border ${
                isSpine
                  ? 'border-protocol-accent/40 shadow-velvet'
                  : 'border-protocol-border'
              }`}
            >
              {group.items.map((item, idx) => (
                <MenuRow
                  key={item.id}
                  item={item}
                  withBorder={idx > 0}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Everything else — folded, off by default */}
      <div className="space-y-2">
        <button
          onClick={() => setArchivesOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center gap-3 text-left rounded-xl bg-protocol-surface border border-protocol-border transition-colors hover:bg-protocol-surface-light group"
        >
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${MUTED}22` }}>
            <Archive className="w-4 h-4" style={{ color: MUTED }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-protocol-text">Everything else</p>
            <p className="text-xs text-protocol-text-muted">Archives, evidence, drills, and lore.</p>
          </div>
          {archivesOpen ? (
            <ChevronDown className="w-4 h-4 text-protocol-text-muted group-hover:text-protocol-accent-soft" />
          ) : (
            <ChevronRight className="w-4 h-4 text-protocol-text-muted/60 group-hover:text-protocol-accent-soft" />
          )}
        </button>

        {archivesOpen && (
          <div className="rounded-xl overflow-hidden bg-protocol-surface border border-protocol-border">
            {ARCHIVE_ITEMS.map((item, idx) => (
              <MenuRow
                key={item.id}
                item={item}
                withBorder={idx > 0}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
