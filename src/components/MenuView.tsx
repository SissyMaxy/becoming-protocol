/**
 * MenuView — Minimal settings access.
 * The conversation IS the interface. This screen exists only for
 * settings, legacy Today view access, and help.
 */

import { Settings, ChevronRight, HelpCircle, Calendar } from 'lucide-react';

type MenuItemId =
  | 'settings' | 'help'
  // Legacy items still routable from Settings or Handler directives
  | 'history' | 'investments' | 'wishlist'
  | 'sessions' | 'quiz' | 'timeline' | 'gina' | 'gina-pipeline' | 'service'
  | 'service-analytics' | 'content' | 'domains' | 'patterns'
  | 'curation' | 'seeds' | 'vectors' | 'trigger-audit' | 'voice-game' | 'voice-drills'
  | 'dashboard' | 'journal' | 'protocol-analytics' | 'handler-autonomous'
  | 'exercise' | 'her-world' | 'vault-swipe' | 'content-dashboard' | 'cam-session' | 'hypno-session'
  | 'progress-page' | 'sealed-page' | 'log-release';

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
      id: 'journal' as MenuItemId,
      icon: Calendar,
      label: 'Journal',
      description: 'Daily reflections and timeline',
      color: '#22c55e',
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
