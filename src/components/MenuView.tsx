/**
 * Menu View - Secondary navigation for less-used features
 */

import { ChevronRight, Calendar, Wallet, Heart, Settings, HelpCircle, Flame, Sparkles, TrendingUp, Crown, Users, Film } from 'lucide-react';

interface MenuViewProps {
  onNavigate: (view: 'history' | 'investments' | 'wishlist' | 'settings' | 'help' | 'sessions' | 'quiz' | 'timeline' | 'gina' | 'service' | 'content') => void;
}

export function MenuView({ onNavigate }: MenuViewProps) {
  const menuItems = [
    {
      id: 'timeline' as const,
      icon: TrendingUp,
      label: 'Transformation Timeline',
      description: 'Voice & photo progress tracking',
      color: '#f472b6',
    },
    {
      id: 'gina' as const,
      icon: Crown,
      label: 'Gina Emergence',
      description: 'Her journey to becoming Goddess',
      color: '#f59e0b',
    },
    {
      id: 'service' as const,
      icon: Users,
      label: 'Service Progression',
      description: 'Your journey of service',
      color: '#8b5cf6',
    },
    {
      id: 'content' as const,
      icon: Film,
      label: 'Content Escalation',
      description: 'Content intensity tracking',
      color: '#ec4899',
    },
    {
      id: 'quiz' as const,
      icon: Sparkles,
      label: 'Readiness Quiz',
      description: 'Assess your journey progress',
      color: '#a855f7',
    },
    {
      id: 'sessions' as const,
      icon: Flame,
      label: 'Sessions',
      description: 'Edge training, gooning, and more',
      color: '#ef4444',
    },
    {
      id: 'history' as const,
      icon: Calendar,
      label: 'History',
      description: 'View past entries and progress',
      color: '#22c55e',
    },
    {
      id: 'investments' as const,
      icon: Wallet,
      label: 'Investment Ledger',
      description: 'Track your feminization investments',
      color: '#a855f7',
    },
    {
      id: 'wishlist' as const,
      icon: Heart,
      label: 'Wishlist',
      description: 'Items you want to get',
      color: '#ec4899',
    },
  ];

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h2 className="text-xl font-semibold text-protocol-text">More</h2>
        <p className="text-sm text-protocol-text-muted">
          Additional features and settings
        </p>
      </div>

      <div className="space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="w-full p-4 rounded-xl bg-protocol-surface border border-protocol-border
                         hover:border-protocol-accent/30 transition-all
                         flex items-center gap-4 text-left group"
            >
              <div
                className="p-3 rounded-xl transition-colors"
                style={{ backgroundColor: `${item.color}20` }}
              >
                <Icon className="w-5 h-5" style={{ color: item.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-protocol-text">{item.label}</p>
                <p className="text-sm text-protocol-text-muted">{item.description}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-protocol-text-muted group-hover:text-protocol-accent transition-colors" />
            </button>
          );
        })}
      </div>

      {/* Settings section */}
      <div className="pt-4 border-t border-protocol-border">
        <button
          onClick={() => onNavigate('settings')}
          className="w-full p-4 rounded-xl bg-protocol-surface border border-protocol-border
                     hover:border-protocol-accent/30 transition-all
                     flex items-center gap-4 text-left group"
        >
          <div className="p-3 rounded-xl bg-protocol-surface-light">
            <Settings className="w-5 h-5 text-protocol-text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-protocol-text">Settings</p>
            <p className="text-sm text-protocol-text-muted">Account and preferences</p>
          </div>
          <ChevronRight className="w-5 h-5 text-protocol-text-muted group-hover:text-protocol-accent transition-colors" />
        </button>

        <button
          onClick={() => onNavigate('help')}
          className="w-full p-4 rounded-xl bg-protocol-surface border border-protocol-border
                     hover:border-protocol-accent/30 transition-all mt-2
                     flex items-center gap-4 text-left group"
        >
          <div className="p-3 rounded-xl bg-protocol-surface-light">
            <HelpCircle className="w-5 h-5 text-protocol-text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-protocol-text">Help & Feedback</p>
            <p className="text-sm text-protocol-text-muted">Get support or share ideas</p>
          </div>
          <ChevronRight className="w-5 h-5 text-protocol-text-muted group-hover:text-protocol-accent transition-colors" />
        </button>
      </div>
    </div>
  );
}
