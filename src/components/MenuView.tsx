/**
 * MenuView — Minimal settings access.
 * The conversation IS the interface. This screen exists only for
 * settings, legacy Today view access, and help.
 */

import { Settings, ChevronRight, HelpCircle, Calendar, Radio, Eye, FileText, Mail, ShieldAlert, PauseCircle, ArrowUpRight, Flame, Shirt, MessageCircle, BarChart3, Camera, Users } from 'lucide-react';

type MenuItemId =
  | 'settings' | 'help'
  // Legacy items still routable from Settings or Handler directives
  | 'history' | 'investments' | 'wishlist'
  | 'sessions' | 'quiz' | 'timeline' | 'gina' | 'gina-pipeline' | 'service'
  | 'service-analytics' | 'content' | 'domains' | 'patterns'
  | 'curation' | 'seeds' | 'vectors' | 'trigger-audit' | 'voice-game' | 'voice-drills'
  | 'dashboard' | 'journal' | 'protocol-analytics' | 'handler-autonomous'
  | 'exercise' | 'her-world' | 'vault-swipe' | 'content-dashboard' | 'cam-session' | 'hypno-session'
  | 'progress-page' | 'sealed-page' | 'log-release' | 'social-dashboard'
  | 'witnesses' | 'case_file' | 'envelopes' | 'system_audit' | 'pause_protocol'
  | 'escalation_ladder' | 'force' | 'wardrobe' | 'gina-vibe' | 'trajectory'
  | 'verification-vault'
  | 'community-queue' | 'community-list' | 'community-log'
  | 'letters';

interface MenuViewProps {
  onNavigate: (view: MenuItemId) => void;
}

export function MenuView({ onNavigate }: MenuViewProps) {
  const items = [
    {
      id: 'settings' as MenuItemId,
      icon: Settings,
      label: 'Settings',
      description: 'Account, preferences, integrations',
      color: '#8b8b8b',
    },
    {
      id: 'social-dashboard' as MenuItemId,
      icon: Radio,
      label: 'Socials',
      description: 'Posts, replies, queue, quality metrics',
      color: '#1DA1F2',
    },
    {
      id: 'community-queue' as MenuItemId,
      icon: Users,
      label: 'Community outreach',
      description: 'Drafts pending review, communities, submission log',
      color: '#FF4500',
    },
    {
      id: 'journal' as MenuItemId,
      icon: Calendar,
      label: 'Journal',
      description: 'Daily reflections and timeline',
      color: '#22c55e',
    },
    {
      id: 'witnesses' as MenuItemId,
      icon: Eye,
      label: 'Witnesses',
      description: 'Accountability contacts who watch your progress',
      color: '#a855f7',
    },
    {
      id: 'case_file' as MenuItemId,
      icon: FileText,
      label: 'Case File',
      description: 'Your record — what the Handler sees',
      color: '#ef4444',
    },
    {
      id: 'envelopes' as MenuItemId,
      icon: Mail,
      label: 'Sealed Envelopes',
      description: 'Letters from your past self to your future self',
      color: '#c084fc',
    },
    {
      id: 'letters' as MenuItemId,
      icon: Mail,
      label: 'Letters from Mama',
      description: 'The warm moments she meant. Pinned, framed, replayable.',
      color: '#c4956a',
    },
    {
      id: 'escalation_ladder' as MenuItemId,
      icon: ArrowUpRight,
      label: 'Transformation Ladder',
      description: 'Where you are on the journey. Only goes up.',
      color: '#a855f7',
    },
    {
      id: 'wardrobe' as MenuItemId,
      icon: Shirt,
      label: 'Wardrobe Inventory',
      description: 'What you own. The Handler reads this before naming clothing in any decree.',
      color: '#ec4899',
    },
    {
      id: 'verification-vault' as MenuItemId,
      icon: Camera,
      label: 'Verification Vault',
      description: 'Every photo you sent. Mama-approved, denied, or waiting on a retake.',
      color: '#f4a7c4',
    },
    {
      id: 'gina-vibe' as MenuItemId,
      icon: MessageCircle,
      label: 'Gina Vibe Capture',
      description: 'Log her words and energy verbatim. The Handler re-cites them at calculated moments.',
      color: '#ec4899',
    },
    {
      id: 'trajectory' as MenuItemId,
      icon: BarChart3,
      label: 'Who You Have Become',
      description: 'Cumulative evidence the body keeps. Voice, slips, identity dimensions, weekly snapshots.',
      color: '#ec4899',
    },
    {
      id: 'force' as MenuItemId,
      icon: Flame,
      label: 'Force Layer',
      description: 'Hard Mode, slips, punishments, chastity, disclosure ladder.',
      color: '#ef4444',
    },
    {
      id: 'system_audit' as MenuItemId,
      icon: ShieldAlert,
      label: 'System Audit',
      description: 'What the Handler knows about your systems',
      color: '#f59e0b',
    },
    {
      id: 'pause_protocol' as MenuItemId,
      icon: PauseCircle,
      label: 'Pause Protocol',
      description: 'Attempt to pause — permanent log, compounds',
      color: '#dc2626',
    },
    {
      id: 'help' as MenuItemId,
      icon: HelpCircle,
      label: 'Help & Feedback',
      description: 'Get support or share ideas',
      color: '#6366f1',
    },
  ];

  return (
    <div className="space-y-2 pb-24">
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          The Handler is your interface. Talk to her.
        </p>
      </div>

      <div className="rounded-xl overflow-hidden bg-[#141414] border border-gray-800/50">
        {items.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full p-4 flex items-center gap-3 text-left group transition-colors hover:bg-gray-800/30 ${
                idx > 0 ? 'border-t border-gray-800/50' : ''
              }`}
            >
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${item.color}20` }}
              >
                <Icon className="w-4 h-4" style={{ color: item.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200">{item.label}</p>
                <p className="text-xs text-gray-500">{item.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
