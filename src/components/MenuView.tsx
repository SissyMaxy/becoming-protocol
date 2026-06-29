/**
 * MenuView — Minimal settings access.
 * The conversation IS the interface. This screen exists only for
 * settings, the archive surfaces, and help.
 *
 * The primary menu is a short, grouped list of the destinations the user
 * actually navigates to. The long tail of evidence/lore surfaces lives behind
 * a single collapsed "Everything else" toggle (off by default). Handler/Mommy
 * machinery is not surfaced here at all — those routes stay alive for
 * deep-links, they just have no menu entry.
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

// Primary menu — what she actually opens. Grouped, short, always visible.
const PRIMARY_GROUPS: MenuGroup[] = [
  {
    heading: 'You',
    items: [
      {
        id: 'identity',
        icon: User,
        label: 'Identity',
        description: 'Name, pronouns, how the Handler addresses you.',
        color: '#ec4899',
      },
      {
        id: 'wardrobe',
        icon: Shirt,
        label: 'Wardrobe Inventory',
        description: 'What you own. The Handler reads this before naming clothing in any decree.',
        color: '#ec4899',
      },
      {
        id: 'verification-vault',
        icon: Camera,
        label: 'Verification Vault',
        description: 'Every photo you sent. Mama-approved, denied, or waiting on a retake.',
        color: '#f4a7c4',
      },
      {
        id: 'life-as-woman',
        icon: Flame,
        label: 'Life as a woman',
        description: 'Sniffies, trance, gooning, content — Mommy edits, you click.',
        color: '#d8a6d0',
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
        description: 'Start a guided session — cam, hypno, goon, exercise.',
        color: '#a855f7',
      },
      {
        id: 'wishlist',
        icon: TrendingUp,
        label: 'Progress',
        description: 'Investments, wishlist, how far you have come.',
        color: '#22c55e',
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
        description: 'Daily reflections and timeline.',
        color: '#22c55e',
      },
      {
        id: 'recaps',
        icon: BookOpen,
        label: 'Recaps',
        description: 'The story so far, chapter by chapter.',
        color: '#c084fc',
      },
      {
        id: 'timeline',
        icon: Clock,
        label: 'Timeline',
        description: 'Every milestone in order.',
        color: '#60a5fa',
      },
      {
        id: 'letters',
        icon: Mail,
        label: 'Letters from Mama',
        description: 'The warm moments she meant. Pinned, framed, replayable.',
        color: '#c4956a',
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
        color: '#8b8b8b',
      },
      {
        id: 'pause_protocol',
        icon: PauseCircle,
        label: 'Pause Protocol',
        description: 'Attempt to pause — permanent log, compounds.',
        color: '#dc2626',
      },
      {
        id: 'help',
        icon: HelpCircle,
        label: 'Help & Feedback',
        description: 'Get support or share ideas.',
        color: '#6366f1',
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
    color: '#d8a6d0',
  },
  {
    id: 'trajectory',
    icon: BarChart3,
    label: 'Who You Have Become',
    description: 'Cumulative evidence the body keeps. Voice, slips, identity dimensions, weekly snapshots.',
    color: '#ec4899',
  },
  {
    id: 'dossier',
    icon: FileText,
    label: 'Dossier',
    description: 'What the Handler has assembled about you.',
    color: '#f59e0b',
  },
  {
    id: 'mommy-dossier',
    icon: FileText,
    label: "Mommy's Dossier Quiz",
    description: 'Answer for her file. The more she knows, the closer she holds you.',
    color: '#f59e0b',
  },
  {
    id: 'quiz',
    icon: FileText,
    label: 'Kink Quiz',
    description: 'Map what moves you.',
    color: '#a855f7',
  },
  {
    id: 'conditioning-library',
    icon: Library,
    label: 'Conditioning Library',
    description: 'Loops, triggers, and trance material.',
    color: '#a855f7',
  },
  {
    id: 'envelopes',
    icon: Mail,
    label: 'Sealed Envelopes',
    description: 'Letters from your past self to your future self.',
    color: '#c084fc',
  },
  {
    id: 'case_file',
    icon: FileText,
    label: 'Case File',
    description: 'Your record — what the Handler sees.',
    color: '#ef4444',
  },
  {
    id: 'witnesses',
    icon: Eye,
    label: 'Witnesses',
    description: 'Accountability contacts who watch your progress.',
    color: '#a855f7',
  },
  {
    id: 'vault-browser',
    icon: Archive,
    label: 'Vault Browser',
    description: 'Browse everything in the vault.',
    color: '#f4a7c4',
  },
  {
    id: 'voice-drills',
    icon: Mic,
    label: 'Voice Drills',
    description: 'Train the voice. Pitch, resonance, cadence.',
    color: '#60a5fa',
  },
  {
    id: 'hypno-learning',
    icon: Headphones,
    label: 'Hypno Learning',
    description: 'How the trance work is built.',
    color: '#a855f7',
  },
  {
    id: 'history',
    icon: Clock,
    label: 'History',
    description: 'The full activity log.',
    color: '#8b8b8b',
  },
  {
    id: 'escalation_ladder',
    icon: ArrowUpRight,
    label: 'Transformation Ladder',
    description: 'Where you are on the journey. Only goes up.',
    color: '#a855f7',
  },
  {
    id: 'force',
    icon: Flame,
    label: 'Force Layer',
    description: 'Hard Mode, slips, punishments, chastity.',
    color: '#ef4444',
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
      className={`w-full p-4 flex items-center gap-3 text-left group transition-colors hover:bg-gray-800/30 ${
        withBorder ? 'border-t border-gray-800/50' : ''
      }`}
    >
      <div className="p-2 rounded-lg" style={{ backgroundColor: `${item.color}20` }}>
        <Icon className="w-4 h-4" style={{ color: item.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-200">{item.label}</p>
        <p className="text-xs text-gray-500">{item.description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400" />
    </button>
  );
}

export function MenuView({ onNavigate }: MenuViewProps) {
  const [archivesOpen, setArchivesOpen] = useState(false);

  return (
    <div className="space-y-5 pb-24">
      <div className="mb-1">
        <p className="text-sm text-gray-500">
          The Handler is your interface. Talk to her.
        </p>
      </div>

      {PRIMARY_GROUPS.map((group) => (
        <div key={group.heading} className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
            {group.heading}
          </p>
          <div className="rounded-xl overflow-hidden bg-[#141414] border border-gray-800/50">
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
      ))}

      {/* Everything else — folded, off by default */}
      <div className="space-y-2">
        <button
          onClick={() => setArchivesOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center gap-3 text-left rounded-xl bg-[#141414] border border-gray-800/50 transition-colors hover:bg-gray-800/30 group"
        >
          <div className="p-2 rounded-lg" style={{ backgroundColor: '#8b8b8b20' }}>
            <Archive className="w-4 h-4" style={{ color: '#8b8b8b' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200">Everything else</p>
            <p className="text-xs text-gray-500">Archives, evidence, drills, and lore.</p>
          </div>
          {archivesOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-gray-300" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400" />
          )}
        </button>

        {archivesOpen && (
          <div className="rounded-xl overflow-hidden bg-[#141414] border border-gray-800/50">
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
