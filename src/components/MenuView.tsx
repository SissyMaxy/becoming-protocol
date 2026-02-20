/**
 * Menu View - Secondary navigation for less-used features
 * Organized into logical categories for easier discovery
 */

import { useState } from 'react';
import {
  ChevronRight, ChevronDown, Calendar, Wallet, Heart, Gift,
  HelpCircle, Flame, Sparkles, TrendingUp, Crown, Users, Film,
  Layers, Eye, Filter, Sprout, Zap, BarChart3, Activity, Mic,
  LayoutDashboard, BookOpen, Bot, Dumbbell, Gem, ImageIcon, Monitor, AudioLines, Camera, Headphones
} from 'lucide-react';
import { useBambiMode } from '../context/BambiModeContext';
import { useOpacity } from '../context/OpacityContext';

type MenuItemId =
  | 'history' | 'investments' | 'wishlist' | 'settings' | 'help'
  | 'sessions' | 'quiz' | 'timeline' | 'gina' | 'gina-pipeline' | 'service'
  | 'service-analytics' | 'content' | 'domains' | 'patterns'
  | 'curation' | 'seeds' | 'vectors' | 'trigger-audit' | 'voice-game' | 'voice-drills'
  | 'dashboard' | 'journal' | 'protocol-analytics' | 'handler-autonomous'
  | 'exercise' | 'her-world' | 'vault-swipe' | 'content-dashboard' | 'cam-session' | 'hypno-session'
  | 'progress-page' | 'sealed-page';

interface MenuViewProps {
  onNavigate: (view: MenuItemId) => void;
}

interface MenuItem {
  id: MenuItemId;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
}

interface MenuCategory {
  id: string;
  label: string;
  emoji?: string;
  items: MenuItem[];
  defaultExpanded?: boolean;
}

// Map menu item IDs to opacity feature keys
const MENU_ITEM_FEATURE: Record<string, string> = {
  'progress-page': 'progress_page',
  'sealed-page': 'sealed_content',
  'handler-autonomous': 'more_menu',
  'timeline': 'more_menu',
  'service': 'more_menu',
  'gina': 'more_menu',
  'gina-pipeline': 'more_menu',
  'her-world': 'more_menu',
  'vault-swipe': 'vault_swipe',
  'sessions': 'sessions_browse',
  'cam-session': 'sessions_browse',
  'hypno-session': 'sessions_browse',
  'quiz': 'more_menu',
  'voice-drills': 'more_menu',
  'voice-game': 'more_menu',
  'exercise': 'more_menu',
  'content': 'escalation_content',
  'domains': 'escalation_domain',
  'patterns': 'escalation_patterns',
  'seeds': 'escalation_seeds',
  'protocol-analytics': 'analytics_protocol',
  'dashboard': 'analytics_dashboard',
  'journal': 'journal_page',
  'service-analytics': 'analytics_service',
  'vectors': 'analytics_vectors',
  'trigger-audit': 'analytics_triggers',
  'content-dashboard': 'analytics_content',
  'curation': 'tools_curation',
  'history': 'records_history',
  'investments': 'records_investments',
  'wishlist': 'records_wishlist',
};

export function MenuView({ onNavigate }: MenuViewProps) {
  const { isBambiMode } = useBambiMode();
  const { canSee } = useOpacity();

  // Track which categories are expanded
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['journey', 'training']) // Default expanded
  );

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const categories: MenuCategory[] = [
    {
      id: 'journey',
      label: 'Journey & Service',
      emoji: '✨',
      defaultExpanded: true,
      items: [
        {
          id: 'progress-page',
          icon: TrendingUp,
          label: 'Progress',
          description: 'Phase progress, domain levels, and stats',
          color: '#10b981',
        },
        {
          id: 'sealed-page',
          icon: Gift,
          label: 'Sealed Content',
          description: 'Letters, challenges, and rewards to unlock',
          color: '#f59e0b',
        },
        {
          id: 'handler-autonomous',
          icon: Bot,
          label: 'Handler Command Center',
          description: 'Content briefs, compliance, fund & platforms',
          color: '#ef4444',
        },
        {
          id: 'timeline',
          icon: TrendingUp,
          label: 'Transformation Timeline',
          description: 'Voice & photo progress tracking',
          color: '#f472b6',
        },
        {
          id: 'service',
          icon: Users,
          label: 'Service Progression',
          description: 'Your journey of service',
          color: '#8b5cf6',
        },
        {
          id: 'gina',
          icon: Crown,
          label: 'Gina Emergence',
          description: 'Her journey to becoming Goddess',
          color: '#f59e0b',
        },
        {
          id: 'gina-pipeline',
          icon: Heart,
          label: 'Gina Pipeline',
          description: 'Develop her into soft mommy dom',
          color: '#ec4899',
        },
        {
          id: 'her-world',
          icon: Gem,
          label: 'Her World',
          description: 'Wigs, scents, and anchor objects',
          color: '#f472b6',
        },
        {
          id: 'vault-swipe',
          icon: ImageIcon,
          label: 'Content Vault',
          description: 'Approve or reject content for posting',
          color: '#06b6d4',
        },
      ],
    },
    {
      id: 'training',
      label: 'Training & Sessions',
      emoji: '🔥',
      defaultExpanded: true,
      items: [
        {
          id: 'sessions',
          icon: Flame,
          label: 'Sessions',
          description: 'Edge training, gooning, and more',
          color: '#ef4444',
        },
        {
          id: 'cam-session',
          icon: Camera,
          label: 'Cam Session',
          description: 'Live session dashboard with tips & prompts',
          color: '#ec4899',
        },
        {
          id: 'hypno-session',
          icon: Headphones,
          label: 'Hypno Sessions',
          description: 'Conditioning sessions with capture integration',
          color: '#8b5cf6',
        },
        {
          id: 'quiz',
          icon: Sparkles,
          label: 'Readiness Quiz',
          description: 'Assess your journey progress',
          color: '#a855f7',
        },
        {
          id: 'voice-drills',
          icon: AudioLines,
          label: 'Voice Drills',
          description: 'Structured practice with pitch tracking',
          color: '#7c3aed',
        },
        {
          id: 'voice-game',
          icon: Mic,
          label: 'Affirmation Game',
          description: 'Speak affirmations for rewards',
          color: '#8b5cf6',
        },
        {
          id: 'exercise',
          icon: Dumbbell,
          label: 'Workouts',
          description: 'Guided exercise sessions',
          color: '#f97316',
        },
      ],
    },
    {
      id: 'escalation',
      label: 'Escalation & Patterns',
      emoji: '📈',
      items: [
        {
          id: 'content',
          icon: Film,
          label: 'Content Escalation',
          description: 'Content intensity tracking',
          color: '#ec4899',
        },
        {
          id: 'domains',
          icon: Layers,
          label: 'Domain Escalation',
          description: 'Track progression across all domains',
          color: '#8b5cf6',
        },
        {
          id: 'patterns',
          icon: Eye,
          label: 'Pattern Dissolution',
          description: 'Track masculine patterns dissolving',
          color: '#ef4444',
        },
        {
          id: 'seeds',
          icon: Sprout,
          label: 'Intimate Seeds',
          description: 'Plant desires, nurture growth',
          color: '#22c55e',
        },
      ],
    },
    {
      id: 'analytics',
      label: 'Analytics & Insights',
      emoji: '📊',
      items: [
        {
          id: 'protocol-analytics',
          icon: Activity,
          label: 'Protocol Analytics',
          description: 'Is the protocol working? Real data.',
          color: '#ec4899',
        },
        {
          id: 'dashboard',
          icon: LayoutDashboard,
          label: 'Unified Dashboard',
          description: 'Full overview of all progress metrics',
          color: '#a855f7',
        },
        {
          id: 'journal',
          icon: BookOpen,
          label: 'Journal',
          description: 'Daily reflections and timeline',
          color: '#22c55e',
        },
        {
          id: 'service-analytics',
          icon: BarChart3,
          label: 'Service Analytics',
          description: 'Deep dive into service metrics',
          color: '#6366f1',
        },
        {
          id: 'vectors',
          icon: Zap,
          label: 'Adaptive Vectors',
          description: 'Track transformation dimensions',
          color: '#f59e0b',
        },
        {
          id: 'trigger-audit',
          icon: Activity,
          label: 'Trigger Audit',
          description: 'System trigger effectiveness',
          color: '#f97316',
        },
        {
          id: 'content-dashboard',
          icon: Monitor,
          label: 'Content Dashboard',
          description: 'Handler content analytics & scheduling',
          color: '#10b981',
        },
      ],
    },
    {
      id: 'tools',
      label: 'Tools & Curation',
      emoji: '🛠️',
      items: [
        {
          id: 'curation',
          icon: Filter,
          label: 'Task Curation',
          description: 'Build your personal task bank',
          color: '#06b6d4',
        },
      ],
    },
    {
      id: 'records',
      label: 'Records & Investments',
      emoji: '📚',
      items: [
        {
          id: 'history',
          icon: Calendar,
          label: 'History',
          description: 'View past entries and progress',
          color: '#22c55e',
        },
        {
          id: 'investments',
          icon: Wallet,
          label: 'Investment Ledger',
          description: 'Track your feminization investments',
          color: '#a855f7',
        },
        {
          id: 'wishlist',
          icon: Heart,
          label: 'Wishlist',
          description: 'Items you want to get',
          color: '#ec4899',
        },
      ],
    },
  ];

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h2 className={`text-xl font-semibold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>More</h2>
        <p className={`text-sm ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          Additional features and settings
        </p>
      </div>

      {/* Categorized menu items */}
      <div className="space-y-3">
        {categories.map((category) => {
          // Filter items by opacity visibility
          const visibleItems = category.items.filter(item => {
            const feature = MENU_ITEM_FEATURE[item.id];
            return !feature || canSee(feature);
          });
          if (visibleItems.length === 0) return null;

          const isExpanded = expandedCategories.has(category.id);

          return (
            <div key={category.id} className={`rounded-xl overflow-hidden ${
              isBambiMode
                ? 'bg-pink-50 border border-pink-200'
                : 'bg-protocol-surface border border-protocol-border'
            }`}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category.id)}
                className={`w-full p-3 flex items-center justify-between transition-colors ${
                  isBambiMode
                    ? 'hover:bg-pink-100'
                    : 'hover:bg-protocol-border/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{category.emoji}</span>
                  <span className={`font-medium ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}>
                    {category.label}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isBambiMode
                      ? 'bg-pink-200 text-pink-600'
                      : 'bg-protocol-border text-protocol-text-muted'
                  }`}>
                    {visibleItems.length}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                } ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
              </button>

              {/* Category items */}
              {isExpanded && (
                <div className={`border-t ${
                  isBambiMode ? 'border-pink-200' : 'border-protocol-border'
                }`}>
                  {visibleItems.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={`w-full p-3 flex items-center gap-3 text-left group transition-colors ${
                          idx > 0
                            ? isBambiMode
                              ? 'border-t border-pink-100'
                              : 'border-t border-protocol-border/50'
                            : ''
                        } ${
                          isBambiMode
                            ? 'hover:bg-pink-100'
                            : 'hover:bg-protocol-border/30'
                        }`}
                      >
                        <div
                          className="p-2 rounded-lg transition-colors"
                          style={{ backgroundColor: `${item.color}20` }}
                        >
                          <Icon className="w-4 h-4" style={{ color: item.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${
                            isBambiMode ? 'text-pink-800' : 'text-protocol-text'
                          }`}>{item.label}</p>
                          <p className={`text-xs ${
                            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                          }`}>{item.description}</p>
                        </div>
                        <ChevronRight className={`w-4 h-4 transition-colors ${
                          isBambiMode
                            ? 'text-pink-300 group-hover:text-pink-500'
                            : 'text-protocol-text-muted group-hover:text-protocol-accent'
                        }`} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Help section - always visible at bottom */}
      <div className={`pt-4 border-t ${
        isBambiMode ? 'border-pink-200' : 'border-protocol-border'
      }`}>
        <button
          onClick={() => onNavigate('help')}
          className={`w-full p-4 rounded-xl transition-all mt-2 flex items-center gap-4 text-left group ${
            isBambiMode
              ? 'bg-pink-50 border border-pink-200 hover:border-pink-300'
              : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/30'
          }`}
        >
          <div className={`p-3 rounded-xl ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
          }`}>
            <HelpCircle className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-medium ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>Help & Feedback</p>
            <p className={`text-sm ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>Get support or share ideas</p>
          </div>
          <ChevronRight className={`w-5 h-5 transition-colors ${
            isBambiMode
              ? 'text-pink-300 group-hover:text-pink-500'
              : 'text-protocol-text-muted group-hover:text-protocol-accent'
          }`} />
        </button>
      </div>
    </div>
  );
}
