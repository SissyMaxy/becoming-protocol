/**
 * Domain Card
 *
 * Displays a single escalation domain with progress and controls.
 */

import { Plus, ChevronRight, Calendar } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  EscalationDomain,
  EscalationState,
  ESCALATION_DOMAIN_LABELS,
  ESCALATION_DOMAIN_COLORS,
  ESCALATION_DOMAIN_ICONS,
  DOMAIN_MAX_LEVELS,
} from '../../types/escalation';

interface DomainCardProps {
  domain: EscalationDomain;
  state: EscalationState | null;
  onExpand: () => void;
  onLogEscalation: () => void;
}

export function DomainCard({ domain, state, onExpand, onLogEscalation }: DomainCardProps) {
  const { isBambiMode } = useBambiMode();

  const color = ESCALATION_DOMAIN_COLORS[domain];
  const iconName = ESCALATION_DOMAIN_ICONS[domain];
  const label = ESCALATION_DOMAIN_LABELS[domain];
  const maxLevel = DOMAIN_MAX_LEVELS[domain];

  const currentLevel = state?.currentLevel || 0;
  const progress = (currentLevel / maxLevel) * 100;

  // Get the icon component dynamically
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[iconName] || LucideIcons.Circle;

  // Format last escalation date
  const formatLastEscalation = () => {
    if (!state?.lastEscalationDate) return 'Never';

    const date = new Date(state.lastEscalationDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  return (
    <div
      className={`rounded-xl overflow-hidden ${
        isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
      }`}
    >
      {/* Header */}
      <button
        onClick={onExpand}
        className="w-full p-4 flex items-center gap-3 text-left"
      >
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <IconComponent className="w-6 h-6" style={{ color }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span
              className={`font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {label}
            </span>
            <span
              className="text-sm font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${color}20`, color }}
            >
              Level {currentLevel}/{maxLevel}
            </span>
          </div>

          {/* Progress bar */}
          <div
            className={`h-2 rounded-full overflow-hidden ${
              isBambiMode ? 'bg-pink-100' : 'bg-protocol-border'
            }`}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: color,
              }}
            />
          </div>

          {/* Description */}
          <p
            className={`text-sm mt-1.5 truncate ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {state?.currentDescription || 'Not started'}
          </p>
        </div>

        <ChevronRight
          className={`w-5 h-5 flex-shrink-0 ${
            isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
          }`}
        />
      </button>

      {/* Footer */}
      <div
        className={`px-4 pb-3 pt-0 flex items-center justify-between border-t ${
          isBambiMode ? 'border-pink-100' : 'border-protocol-border/50'
        }`}
      >
        <div className="flex items-center gap-4 pt-3">
          {/* Last escalation */}
          <div className="flex items-center gap-1.5">
            <Calendar
              className={`w-3.5 h-3.5 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
            <span
              className={`text-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              {formatLastEscalation()}
            </span>
          </div>

          {/* Escalation count */}
          {state && state.escalationCount > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-600'
                  : 'bg-protocol-surface-light text-protocol-text-muted'
              }`}
            >
              {state.escalationCount} escalation{state.escalationCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Log button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLogEscalation();
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors mt-3"
          style={{
            backgroundColor: `${color}20`,
            color,
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Log
        </button>
      </div>
    </div>
  );
}
